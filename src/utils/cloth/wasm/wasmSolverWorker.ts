/**
 * Wasm XPBD Solver Worker — runs Rust Wasm solver off the main thread.
 *
 * @module wasmSolverWorker
 */

import { extractStretchConstraints, extractBendConstraints } from '../gpu/gpuBuffers';
import { mergeMeshes, buildSeamConstraints } from '../seamAssembly';
import type { PathCommand } from '../../../types/types';

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
  set_sdf(data: Float32Array, resolution: number, minX: number, minY: number, minZ: number, cellSize: number): void;
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
  num_particles(): number;
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

const FRAME_BUDGET_MS = 14;

function simulationLoop(): void {
  if (!running || !solver) return;

  const t0 = performance.now();
  solver.step(1 / 60);
  const elapsed = performance.now() - t0;

  // Read positions from Wasm memory
  const n = numParticles;
  const ptr = solver.positions_ptr();
  let positions: Float32Array;

  if (wasmExports?.memory) {
    positions = new Float32Array(wasmExports.memory.buffer, ptr, n * 3).slice();
  } else {
    // Should never happen after successful init, but safety fallback
    positions = new Float32Array(n * 3);
  }

  (self as unknown as Worker).postMessage(
    { type: 'frame', positions },
    [positions.buffer],
  );

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
        solver.configure(
          config.substeps ?? 15,
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
        console.log('[WasmWorker] Solver configured with dragCoefficient =', config.dragCoefficient ?? 1.0);

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

      case 'setSDF':
        if (solver && msg.sdf) {
          solver.set_sdf(
            msg.sdf.distances, msg.sdf.resolution,
            msg.sdf.min[0], msg.sdf.min[1], msg.sdf.min[2], msg.sdf.cellSize,
          );
        }
        break;

      case 'applyInitialCollision':
        // Run settling steps to push particles outside body BEFORE physics starts.
        // Uses small timestep with no gravity to resolve collisions without explosion.
        if (solver) {
          console.log('[WasmWorker] Running initial collision settling...');
          // Temporarily configure solver with zero gravity for settling
          solver.configure(5, 0.95, 0, 0.0, 0.01, false, 0.002, 0.005, 0.0, 0.0, 0.0, 0.0, 0.001, 1.0, 1.0, 0.3);

          // Run several small steps to let SDF collision push particles out
          for (let i = 0; i < 20; i++) {
            solver.step(1 / 120); // Small timestep
          }

          // Restore normal gravity
          solver.configure(15, 0.99, -9.81, 0.0, 0.01, false, 0.002, 0.005, 0.0, 1.0, 0.0, 0.0, 0.001, 1.0, 1.0, 0.3);

          // Send settled positions to client
          const n = numParticles;
          const ptr = solver.positions_ptr();
          let positions: Float32Array;
          if (wasmExports?.memory) {
            positions = new Float32Array(wasmExports.memory.buffer, ptr, n * 3).slice();
          } else {
            positions = new Float32Array(n * 3);
          }
          (self as unknown as Worker).postMessage(
            { type: 'frame', positions },
            [positions.buffer],
          );
          console.log('[WasmWorker] Initial collision settling complete');
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
