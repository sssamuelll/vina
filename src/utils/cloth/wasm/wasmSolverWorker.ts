/**
 * Wasm XPBD Solver Worker — runs Rust Wasm solver off the main thread.
 *
 * @module wasmSolverWorker
 */

import { extractStretchConstraints, extractBendConstraints } from '../gpu/gpuBuffers';
import { mergeMeshes, buildSeamConstraints } from '../seamAssembly';
import type { PathCommand } from '../../../types/types';
import type { CollisionMeshData } from '../collisionMesh';
import { TriangleSpatialHash, solveTriangleCollision } from '../triangleCollision';

// ─── Types ──────────────────────────────────────────────────────────────────

interface WasmModule {
  default: (input?: RequestInfo | URL) => Promise<WasmExportsLike | void>;
  XpbdSolver: new (positions: Float32Array, invMass: Float32Array) => WasmXpbdSolver;
  // Module-level wasm reference (set by __wbg_finalize_init)
  wasm?: WasmExportsLike;
}

interface WasmExportsLike {
  memory: WebAssembly.Memory;
  [key: string]: unknown;
}

interface WasmXpbdSolver {
  set_stretch(ids: Uint32Array, rest: Float32Array): void;
  set_stretch_with_types(ids: Uint32Array, rest_lengths: Float32Array, edge_types: Uint8Array): void;
  set_bend(ids: Uint32Array, rest: Float32Array): void;
  set_bend_with_types(ids: Uint32Array, rest_angles: Float32Array, edge_types: Uint8Array): void;
  set_seams(ids: Uint32Array, target: Float32Array): void;
  set_triangles(tri_ids: Uint32Array): void;
  set_adjacency(offsets: Uint32Array, neighbors: Uint32Array): void;
  set_pins(indices: Uint32Array, positions: Float32Array): void;
  clear_pins(): void;
  configure(substeps: number, damping: number, gravityY: number,
            stretchCompliance: number, bendCompliance: number,
            selfCollision: boolean, thickness: number, collisionMargin: number,
            groundY: number, dragCoefficient: number,
            stretchComplianceWarp: number, stretchComplianceWeft: number,
            stretchComplianceShear: number,
            bendComplianceWarp: number, bendComplianceWeft: number,
            internal_damping: number): void;
  step(dt: number): void;
  positions_ptr(): number;
  velocities_ptr(): number;
  prev_positions_ptr(): number;
  num_particles(): number;
  num_stretch_edges(): number;
  stretch_ids_ptr(): number;
  stretch_rest_ptr(): number;
  free(): void;
}

// ─── Worker State ───────────────────────────────────────────────────────────

let solver: WasmXpbdSolver | null = null;
let wasmExports: { memory: WebAssembly.Memory } | null = null;
let numParticles = 0;
let running = false;
let animFrameId: ReturnType<typeof setTimeout> | null = null;

const snapshots = new Map<string, Float32Array>();
const MAX_SNAPSHOTS = 5;

interface WorkerCollisionBody {
  id: string;
  mesh: CollisionMeshData;
  hash: TriangleSpatialHash;
  friction: number;
  margin: number;
}
let collisionBodies: WorkerCollisionBody[] = [];

/** Number of outer substeps managed by JS (collision applied between each) */
let jsSubsteps = 15;
/** Pre-allocated inverse mass array for collision solver (avoids GC pressure) */
let invMassCache: Float32Array | null = null;
/** Pre-allocated buffer for saving positions before collision (avoids per-frame allocation) */
let preCollisionBuf: Float32Array | null = null;

const FRAME_BUDGET_MS = 14;

/** Maximum particle velocity (m/s). Matches JS solver's maxVelocity.
 * Without this, the Rust solver's 900Hz substep rate amplifies constraint
 * corrections into extreme velocities that compound exponentially. */
const MAX_PARTICLE_VEL = 5.0;
const MAX_PARTICLE_VEL_SQ = MAX_PARTICLE_VEL * MAX_PARTICLE_VEL;

function simulationLoop(): void {
  if (!running || !solver) return;

  const t0 = performance.now();
  const n = numParticles;
  const hasCollision = collisionBodies.length > 0 && wasmExports?.memory;

  if (hasCollision) {
    // Per-substep collision with velocity correction.
    // Each substep: Rust solver integrates + constrains, JS applies triangle
    // collision, then corrects Rust velocity so the next substep starts with
    // collision-aware velocity (prevents tunneling).
    const sdt = 1 / (60 * jsSubsteps);
    const invSdt = 1.0 / sdt;

    // Ensure caches are the right size
    if (!invMassCache || invMassCache.length !== n) {
      invMassCache = new Float32Array(n).fill(1.0);
    }
    const n3 = n * 3;
    if (!preCollisionBuf || preCollisionBuf.length !== n3) {
      preCollisionBuf = new Float32Array(n3);
    }

    const mem = wasmExports!.memory;
    for (let s = 0; s < jsSubsteps; s++) {
      solver.step(sdt);

      // Get live views into WASM memory for positions, velocities, prev_positions
      const posPtr = solver.positions_ptr();
      const velPtr = solver.velocities_ptr();
      const prevPtr = solver.prev_positions_ptr();
      const posView = new Float32Array(mem.buffer, posPtr, n3);
      const velView = new Float32Array(mem.buffer, velPtr, n3);
      const prevView = new Float32Array(mem.buffer, prevPtr, n3);

      // Save positions before collision for velocity correction
      preCollisionBuf.set(posView);

      // Apply triangle collision — modifies posView in-place
      for (const body of collisionBodies) {
        solveTriangleCollision(posView, invMassCache, n, body.mesh, body.hash, body.margin, body.friction);
      }

      // NaN guard: if any position went NaN, reset to previous valid positions.
      let hasNaN = false;
      for (let i = 0; i < n3; i++) {
        if (posView[i] !== posView[i]) {
          hasNaN = true;
          break;
        }
      }
      if (hasNaN) {
        for (let i = 0; i < n3; i++) {
          if (posView[i] !== posView[i]) posView[i] = prevView[i];
        }
      }

      // Derive velocity from PRE-COLLISION positions (natural dynamics only).
      // Collision push corrects position but must NOT create velocity — otherwise
      // push distance (up to 0.05m) gets amplified at substep rate (900Hz) into
      // extreme velocity (0.05 * 900 = 45 m/s), causing the cloth to explode.
      // The JS CPU solver avoids this with a maxVelocity clamp (5 m/s), but the
      // correct fix is to exclude collision push from velocity derivation entirely.
      for (let i = 0; i < n3; i++) {
        velView[i] = (preCollisionBuf[i] - prevView[i]) * invSdt;
      }

      // For collision-corrected particles, also zero the velocity component
      // pointing INTO the body surface (inelastic collision response).
      // This prevents the particle from immediately tunneling back in.
      for (let p = 0; p < n; p++) {
        const i3 = p * 3;
        const dx = posView[i3] - preCollisionBuf[i3];
        const dy = posView[i3 + 1] - preCollisionBuf[i3 + 1];
        const dz = posView[i3 + 2] - preCollisionBuf[i3 + 2];
        const dLenSq = dx * dx + dy * dy + dz * dz;
        if (dLenSq > 1e-20) {
          // Particle was collision-corrected — push direction ≈ surface normal
          const invDLen = 1.0 / Math.sqrt(dLenSq);
          const nx = dx * invDLen, ny = dy * invDLen, nz = dz * invDLen;
          // Natural velocity component in the normal direction
          const vn = velView[i3] * nx + velView[i3 + 1] * ny + velView[i3 + 2] * nz;
          if (vn < 0) {
            // Natural velocity points INTO the surface — zero this component
            velView[i3] -= vn * nx;
            velView[i3 + 1] -= vn * ny;
            velView[i3 + 2] -= vn * nz;
          }
        }
      }

      // Clamp velocity magnitude to prevent explosions.
      // The Rust solver's post_solve has no maxVelocity clamp (unlike the JS solver
      // which clamps to 5 m/s). At 900Hz substep rate, constraint corrections of
      // 0.05m become 45 m/s, compounding exponentially into cloth explosion.
      for (let p = 0; p < n; p++) {
        const i3 = p * 3;
        const vSq = velView[i3] * velView[i3] + velView[i3 + 1] * velView[i3 + 1] + velView[i3 + 2] * velView[i3 + 2];
        if (vSq > MAX_PARTICLE_VEL_SQ) {
          const scale = MAX_PARTICLE_VEL / Math.sqrt(vSq);
          velView[i3] *= scale;
          velView[i3 + 1] *= scale;
          velView[i3 + 2] *= scale;
        }
      }
    }
  } else {
    // No collision bodies — run all substeps at once (original path)
    solver.step(1 / 60);

    // Clamp velocity even without collision — Rust solver has no internal clamp
    if (wasmExports?.memory) {
      const velPtr = solver.velocities_ptr();
      const velView = new Float32Array(wasmExports.memory.buffer, velPtr, n * 3);
      for (let p = 0; p < n; p++) {
        const i3 = p * 3;
        const vSq = velView[i3] * velView[i3] + velView[i3 + 1] * velView[i3 + 1] + velView[i3 + 2] * velView[i3 + 2];
        if (vSq > MAX_PARTICLE_VEL_SQ) {
          const scale = MAX_PARTICLE_VEL / Math.sqrt(vSq);
          velView[i3] *= scale;
          velView[i3 + 1] *= scale;
          velView[i3 + 2] *= scale;
        }
      }
    }
  }

  if (wasmExports?.memory) {
    const ptr = solver.positions_ptr();
    const positions = new Float32Array(wasmExports.memory.buffer, ptr, n * 3).slice();
    (self as unknown as Worker).postMessage(
      { type: 'frame', positions },
      [positions.buffer],
    );
  } else {
    const positions = new Float32Array(n * 3);
    (self as unknown as Worker).postMessage(
      { type: 'frame', positions },
      [positions.buffer],
    );
  }

  const elapsed = performance.now() - t0;
  const delay = elapsed > FRAME_BUDGET_MS ? Math.min(elapsed, 50) : 1000 / 60;
  animFrameId = setTimeout(simulationLoop, delay);
}

function readPositions(): Float32Array | null {
  if (!solver || !wasmExports?.memory) return null;
  const n = numParticles;
  const ptr = solver.positions_ptr();
  return new Float32Array(wasmExports.memory.buffer, ptr, n * 3).slice();
}

self.onmessage = async (event: MessageEvent) => {
  const msg = event.data;

  try {
    switch (msg.type) {
      case 'init': {
        // Load Wasm module inside the worker
        const baseUrl = msg.baseUrl ?? '/';
        const wasmModule = await import(/* @vite-ignore */ `${baseUrl}wasm/xpbd_wasm.js`) as unknown as WasmModule;
        const initResult = await wasmModule.default(`${baseUrl}wasm/xpbd_wasm_bg.wasm`);

        // wasm-bindgen default() returns instance.exports which has .memory
        // But verify it actually has memory — fallback to module-level wasm if not
        const exportsLike = initResult as WasmExportsLike | undefined;
        if (exportsLike?.memory instanceof WebAssembly.Memory) {
          wasmExports = exportsLike;
          console.log('[WasmWorker] Got memory from init result');
        } else if (wasmModule.wasm?.memory instanceof WebAssembly.Memory) {
          wasmExports = wasmModule.wasm;
          console.log('[WasmWorker] Got memory from module.wasm');
        } else {
          console.warn('[WasmWorker] Could not access WebAssembly.Memory — positions will be zero!',
            'initResult type:', typeof initResult,
            'initResult keys:', exportsLike ? Object.keys(exportsLike).slice(0, 10) : 'null/void',
            'module keys:', Object.keys(wasmModule).slice(0, 10));
        }

        // Merge pieces using the standard utility (ensures consistent vertex mapping)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pieceInput: Array<{ pieceId: string; vertices: Float32Array; triIds: Int32Array; uvs?: Float32Array }> = msg.pieces.map((p: any) => ({
          pieceId: p.pieceId,
          vertices: new Float32Array(p.vertices),
          triIds: new Int32Array(p.triIds),
          uvs: p.uvs ? new Float32Array(p.uvs) : undefined,
        }));

        const merged = mergeMeshes(pieceInput);
        const totalVerts = merged.vertices.length / 3;
        
        const invMass = new Float32Array(totalVerts);
        for (let i = 0; i < totalVerts; i++) invMass[i] = 1.0;

        numParticles = totalVerts;
        solver = new wasmModule.XpbdSolver(merged.vertices, invMass);

        // Standard constraints
        const triangles = new Uint32Array(merged.triIds);
        const stretch = extractStretchConstraints(merged.vertices, triangles, merged.uvs);
        solver.set_stretch_with_types(stretch.ids, stretch.restLengths, stretch.edgeTypes);

        const bend = extractBendConstraints(merged.vertices, triangles, merged.uvs);
        solver.set_bend_with_types(bend.ids, bend.restAngles, bend.edgeTypes);

        // Pass triangle indices for air drag calculation
        solver.set_triangles(triangles);

        // Seam constraints
        if (msg.seams && msg.seams.length > 0) {
          const outlines = new Map<string, PathCommand[]>();
          for (const p of msg.pieces) {
            if (p.outline) outlines.set(p.pieceId, p.outline);
          }

          const seamConstraints = buildSeamConstraints(msg.seams, outlines, merged);
          if (seamConstraints.count > 0) {
            console.log('[WasmWorker] Adding seam constraints:', seamConstraints.count);
            // Convert pairs to Uint32Array for Wasm
            const ids = new Uint32Array(seamConstraints.ids);
            // The Rust solver expects (ids, target_lengths)
            solver.set_seams(ids, seamConstraints.restLengths);
          }
        }

        const config = msg.config ?? {};
        // Store desired substeps for JS-managed collision loop, configure
        // Rust solver with substeps=1 so each solver.step() is a single substep.
        // The JS simulation loop calls step() jsSubsteps times with collision
        // correction between each, preventing particles from tunneling through
        // the avatar mesh.
        jsSubsteps = config.substeps ?? 15;
        solver.configure(
          1,  // substeps=1: JS manages substep loop for per-substep collision
          config.damping ?? 0.99,
          config.gravityY ?? -9.81,
          config.stretchCompliance ?? 0.0,
          config.bendCompliance ?? 0.01,
          config.selfCollision ?? false,
          config.thickness ?? 0.002,
          config.collisionMargin ?? 0.005,
          config.groundY ?? 0.0,
          config.dragCoefficient ?? 1.0,
          config.stretchComplianceWarp ?? 0.0,
          config.stretchComplianceWeft ?? 0.0,
          config.stretchComplianceShear ?? 0.001,
          config.bendComplianceWarp ?? 1.0,
          config.bendComplianceWeft ?? 1.0,
          config.internalDamping ?? 0.3,
        );
        console.log('[WasmWorker] Solver configured with dragCoefficient =', config.dragCoefficient ?? 1.0, 'jsSubsteps =', jsSubsteps);

        (self as unknown as Worker).postMessage({ type: 'ready', numParticles: totalVerts });
        break;
      }

      case 'start':
        running = true;
        simulationLoop();
        break;

      case 'stop':
        running = false;
        if (animFrameId !== null) {
          clearTimeout(animFrameId);
          animFrameId = null;
        }
        (self as unknown as Worker).postMessage({ type: 'stopped' });
        break;

      case 'setCollisionMesh':
        if (msg.mesh) {
          collisionBodies = collisionBodies.filter(b => b.id !== '__avatar__');
          collisionBodies.push({
            id: '__avatar__',
            mesh: msg.mesh,
            hash: new TriangleSpatialHash(msg.mesh, 0.05),
            friction: 0,
            margin: 0.005,
          });
          console.log('[WasmWorker] Collision mesh set (avatar):', msg.mesh.triCount, 'triangles');
        }
        break;

      case 'setCollisionBodies':
        collisionBodies = (msg.bodies as Array<{ id: string; mesh: CollisionMeshData; friction: number; margin: number }>).map(b => ({
          ...b,
          hash: new TriangleSpatialHash(b.mesh, 0.05),
        }));
        console.log('[WasmWorker] Collision bodies set:', collisionBodies.length, 'bodies');
        break;

      case 'updateCollisionBody': {
        const { id, mesh, friction, margin } = msg as { id: string; mesh: CollisionMeshData; friction: number; margin: number };
        const idx = collisionBodies.findIndex(b => b.id === id);
        const entry: WorkerCollisionBody = { id, mesh, hash: new TriangleSpatialHash(mesh, 0.05), friction, margin };
        if (idx >= 0) collisionBodies[idx] = entry;
        else collisionBodies.push(entry);
        break;
      }

      case 'removeCollisionBody':
        collisionBodies = collisionBodies.filter(b => b.id !== msg.id);
        break;

      case 'applyInitialTriangleCollision':
        if (solver && collisionBodies.length > 0 && wasmExports?.memory) {
          const n = numParticles;
          const ptr = solver.positions_ptr();
          const positions = new Float32Array(wasmExports.memory.buffer, ptr, n * 3);

          const invMass = new Float32Array(n).fill(1.0);
          for (let i = 0; i < 5; i++) {
            for (const body of collisionBodies) {
              solveTriangleCollision(positions, invMass, n, body.mesh, body.hash, body.margin, body.friction);
            }
          }

          const frame = positions.slice();
          (self as unknown as Worker).postMessage(
            { type: 'frame', positions: frame },
            [frame.buffer],
          );
        }
        break;

      case 'setPins':
        if (solver && msg.indices && msg.positions) {
          const indices = new Uint32Array(msg.indices);
          const positions = new Float32Array(msg.positions);
          solver.set_pins(indices, positions);
        }
        break;

      case 'clearPins':
        if (solver) {
          solver.clear_pins();
        }
        break;

      case 'saveSnapshot': {
        const positions = readPositions();
        if (positions) {
          snapshots.set(msg.id, positions);
          if (snapshots.size > MAX_SNAPSHOTS) {
            const oldest = snapshots.keys().next().value;
            if (oldest !== undefined) snapshots.delete(oldest);
          }
          (self as unknown as Worker).postMessage({
            type: 'snapshotSaved', id: msg.id, particleCount: numParticles,
          });
        }
        break;
      }

      case 'restoreSnapshot': {
        const saved = snapshots.get(msg.id);
        if (saved && solver && wasmExports?.memory) {
          // Write positions back into wasm memory
          const ptr = solver.positions_ptr();
          const target = new Float32Array(wasmExports.memory.buffer, ptr, numParticles * 3);
          target.set(saved);
          (self as unknown as Worker).postMessage({ type: 'snapshotRestored', id: msg.id });
          // Send updated frame
          const positions = new Float32Array(wasmExports.memory.buffer, ptr, numParticles * 3).slice();
          (self as unknown as Worker).postMessage(
            { type: 'frame', positions },
            [positions.buffer],
          );
        }
        break;
      }

      case 'deleteSnapshot': {
        snapshots.delete(msg.id);
        (self as unknown as Worker).postMessage({ type: 'snapshotDeleted', id: msg.id });
        break;
      }

      case 'warmStart': {
        if (solver && wasmExports?.memory) {
          const incoming = new Float32Array(msg.positions);
          if (incoming.length === numParticles * 3) {
            const ptr = solver.positions_ptr();
            const target = new Float32Array(wasmExports.memory.buffer, ptr, numParticles * 3);
            target.set(incoming);
          }
        }
        break;
      }

      case 'getEdgeData': {
        if (!solver || !wasmExports?.memory) {
          (self as unknown as Worker).postMessage({ type: 'edgeData', stretchingIds: new Int32Array(0), stretchingLengths: new Float32Array(0) });
          break;
        }
        const numEdges = solver.num_stretch_edges();
        const idsPtr = solver.stretch_ids_ptr();
        const restPtr = solver.stretch_rest_ptr();
        // Read from WASM memory — copy to avoid detached buffer issues
        const stretchingIds = new Int32Array(new Uint32Array(wasmExports.memory.buffer, idsPtr, numEdges * 2)).buffer.slice(0);
        const stretchingLengths = new Float32Array(wasmExports.memory.buffer, restPtr, numEdges).slice();
        (self as unknown as Worker).postMessage(
          { type: 'edgeData', stretchingIds: new Int32Array(stretchingIds), stretchingLengths },
          [stretchingIds, stretchingLengths.buffer],
        );
        break;
      }

      case 'updateConstraints': {
        // TODO: Wasm solver needs Rust-side update_rest_lengths binding
        console.warn('[WasmWorker] updateConstraints not yet supported for Wasm solver');
        self.postMessage({ type: 'constraintsUpdated' });
        break;
      }

      case 'dispose':
        running = false;
        if (animFrameId !== null) {
          clearTimeout(animFrameId);
          animFrameId = null;
        }
        solver?.free();
        solver = null;
        break;
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    (self as unknown as Worker).postMessage({ type: 'error', message: errMsg });
  }
};
