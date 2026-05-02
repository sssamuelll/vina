/**
 * Wasm XPBD Solver Worker — runs Rust Wasm solver off the main thread.
 *
 * **Cross-boundary error handling (A3 ratified):**
 *
 * - **Rust crate (`crates/xpbd-wasm/src/lib.rs`):** defensively written, 0 panic
 *   paths. `console_error_panic_hook` adopted as preventive insurance — if
 *   future code introduces a panic, browser console gets useful error message
 *   with location/stack trace context (instead of opaque WebAssembly.RuntimeError).
 *
 * - **WASM init failure** (memory not accessible, e.g., stale JS bindings):
 *   surfaces via `postMessage({ type: 'error', code: 'wasm_memory_unavailable' })`.
 *   Flows through `wasmSolverClient.onError` callback. Consumers responsible
 *   for UI surface (showErrorToast / overlay).
 *
 * - **NaN guard at WASM→JS post-step boundary:** both collision and non-collision
 *   branches reset NaN positions to `prevView` (continuity preserved) and
 *   increment cumulative telemetry counter `wasmNaNCount`. Rate-limited console.warn
 *   (first occurrence + every 100th) signals NaN events without spam.
 *
 * - **Zero-copy positions reads** (hot path): `Float32Array` views over WASM
 *   memory. No Result types in signatures — fallibility implicit. Forward-only
 *   convention: new fallible exports use Result-pattern (see A3 doc
 *   + `projectSchema.ts:411` precedent).
 *
 * Cross-ref: `docs/reports/2026-05-01-drift-fase2-a3-cross-boundary-errors.md`.
 *
 * @module wasmSolverWorker
 */

import { extractStretchConstraints, extractBendConstraints } from '../gpu/gpuBuffers';
import { mergeMeshes, buildSeamConstraints } from '../seamAssembly';
import { buildElasticConstraints, type ElasticConstraintSet } from '../elasticAssembly';
import type { PathCommand, Elastic, SemanticEdge } from '../../../types/types';
import type { CollisionMeshData } from '../collisionMesh';
import { TriangleSpatialHash, solveTriangleCollision } from '../triangleCollision';
import { computeBendRestDistances } from './bendRestDistances';
import type { WasmSolverConfig } from './wasmSolverClient';

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
  set_seams_with_compliance(ids: Uint32Array, target: Float32Array, compliances: Float32Array): void;
  set_triangles(tri_ids: Uint32Array): void;
  set_adjacency(offsets: Uint32Array, neighbors: Uint32Array): void;
  set_pins(indices: Uint32Array, positions: Float32Array): void;
  clear_pins(): void;
  set_wind(x: number, y: number, z: number): void;
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

/** Elastic constraints solved in JS (Rust solver has no native elastic support) */
let elasticConstraintSet: ElasticConstraintSet | null = null;
/** Cached outline + edge data for rebuilding elastic constraints */
let wasmCachedOutlines: Map<string, PathCommand[]> | null = null;
let wasmCachedPieceEdges: Map<string, { edges?: Array<Pick<SemanticEdge, 'name' | 'segmentRange'>> }> | null = null;
/** Cached merged mesh reference for elastic constraint building */
let wasmCachedMergedMesh: { vertices: Float32Array; indices: Uint32Array; pieceOffsets: Map<string, { vertexOffset: number; indexOffset: number }> } | null = null;

/** Number of outer substeps managed by JS (collision applied between each) */
let jsSubsteps = 15;

/**
 * Last-applied solver configuration. Init populates from `msg.config`;
 * `setConfig` merges partial updates so re-calling `solver.configure()` at
 * runtime keeps fields that weren't explicitly changed.
 *
 * **BUG-4 (#607) closure shape.** Pre-fix the worker `setConfig` handler
 * extracted only `msg.config.substeps` and silently dropped other runtime
 * updates (damping, gravity, drag, thickness, compliances, ...). The fix
 * introduced this fully-typed record + `applySolverConfig()` centralization
 * so every field reaches `solver.configure(...)` at runtime.
 *
 * **A2 Fase 2 § 2.4.3 ratified** — WASM worker shape (16 required fields,
 * derived as `Required<WasmSolverConfig>` to eliminate dual-maintenance
 * hazard. Adding a field to `WasmSolverConfig` automatically exigirá su
 * inicialización en `DEFAULT_SOLVER_CONFIG` (compile error en lugar de
 * silent drift). Cross-tier cleavage: CPU `ClothSimConfig` (23 fields,
 * different naming) lives in `xpbdSolver.ts`. See A2 § 3.2.B for
 * `configBridge.ts` translation helper.
 *
 * Cross-ref: `docs/reports/2026-05-02-drift-fase2-a2-cross-boundary-serialization.md`.
 */
type AppliedSolverConfig = Required<WasmSolverConfig>;
/**
 * **Defaults convention (`CLAUDE/methodology.md` § 15 + A2 § 3.1):** Rust
 * constructor `XpbdSolver::new()` (en `crates/xpbd-wasm/src/lib.rs`) is
 * canonical for cross-tier shared field defaults. This record MUST match
 * field-by-field with the Rust constructor's defaults. CPU `ClothSimConfig`
 * constructor defaults (en `xpbdSolver.ts`) MUST match for shared fields;
 * CPU-only fields independent.
 *
 * Aligned 2026-05-02 (A2 closure): `bendCompliance: 1.0` matches CPU + per-
 * edge consensus. `selfCollision: false` divergence preserved as faithful
 * per-tier truth (BUG-5 / A7 § 3.1.1 — WASM tier lacks self-collision).
 */
const DEFAULT_SOLVER_CONFIG: AppliedSolverConfig = {
  substeps: 15,
  damping: 0.99,
  gravityY: -9.81,
  stretchCompliance: 0.0,
  bendCompliance: 1.0,
  selfCollision: false,
  thickness: 0.002,
  collisionMargin: 0.005,
  groundY: 0.0,
  dragCoefficient: 1.0,
  stretchComplianceWarp: 0.0,
  stretchComplianceWeft: 0.0,
  stretchComplianceShear: 0.001,
  bendComplianceWarp: 1.0,
  bendComplianceWeft: 1.0,
  internalDamping: 0.3,
};
let currentConfig: AppliedSolverConfig = { ...DEFAULT_SOLVER_CONFIG };

/** Push currentConfig to the Rust solver. Must be called after solver init
 *  and after every mutation to currentConfig. */
function applySolverConfig(): void {
  if (!solver) return;
  // BUG-5 (#608): self-collision is not implemented in the Rust solver
  // — force the flag to false at this boundary regardless of currentConfig.
  // Resolution path is deferred to A7 RFC (WASM vs CPU equivalence).
  if (currentConfig.selfCollision) {
    console.warn(
      '[WasmWorker] selfCollision=true requested but the WASM solver has no implementation; ' +
      'forcing false. Use the CPU solver tier for self-collision. Tracking: #608, A7 RFC.'
    );
  }
  // Architectural location (A7 ratified, § 3.1.6): substeps=1 hardcoded
  // because JS-side outer loop manages substep cadence. CPU TS solver
  // (xpbdSolver.ts:1447) has internal adaptive substeps (10-30 based on
  // velocity); JS-side adaptive cadence for WASM tier queued as A7
  // follow-up. Cross-ref A7 RFC § 3.1.6.
  solver.configure(
    1,  // substeps=1: JS manages substep loop for per-substep collision
    currentConfig.damping,
    currentConfig.gravityY,
    currentConfig.stretchCompliance,
    currentConfig.bendCompliance,
    false,
    currentConfig.thickness,
    currentConfig.collisionMargin,
    currentConfig.groundY,
    currentConfig.dragCoefficient,
    currentConfig.stretchComplianceWarp,
    currentConfig.stretchComplianceWeft,
    currentConfig.stretchComplianceShear,
    currentConfig.bendComplianceWarp,
    currentConfig.bendComplianceWeft,
    currentConfig.internalDamping,
  );
}
/** Pre-allocated inverse mass array for collision solver (avoids GC pressure) */
let invMassCache: Float32Array | null = null;
/** Pre-allocated buffer for saving positions before collision (avoids per-frame allocation) */
let preCollisionBuf: Float32Array | null = null;

const FRAME_BUDGET_MS = 14;

/**
 * A3 Sec 3.3.A: telemetry counter for NaN detected in WASM positions buffer.
 * Pre-existing NaN guard (lines below) silently reset to prevPos; this counter
 * adds debugability — counts cumulative NaN occurrences post-step. Rate-limited
 * console.warn (first occurrence + every 100th cumulative) avoids spam while
 * surfacing the signal.
 *
 * Cross-ref: `docs/reports/2026-05-01-drift-fase2-a3-cross-boundary-errors.md` Sec 3.3.A.
 */
let wasmNaNCount = 0;

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

      // Solve elastic constraints in JS (Rust solver has no native elastic support)
      if (elasticConstraintSet) {
        for (const c of elasticConstraintSet.constraints) {
          const i3 = c.vertexA * 3, j3 = c.vertexB * 3;
          const dx = posView[j3] - posView[i3];
          const dy = posView[j3 + 1] - posView[i3 + 1];
          const dz = posView[j3 + 2] - posView[i3 + 2];
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (dist < 1e-8) continue;
          const alpha = c.compliance / (sdt * sdt);
          const correction = (dist - c.restLength) / (2.0 + alpha);
          const nx = dx / dist, ny = dy / dist, nz = dz / dist;
          posView[i3] += correction * nx;
          posView[i3 + 1] += correction * ny;
          posView[i3 + 2] += correction * nz;
          posView[j3] -= correction * nx;
          posView[j3 + 1] -= correction * ny;
          posView[j3 + 2] -= correction * nz;
        }
      }

      // Save positions before collision for velocity correction
      preCollisionBuf.set(posView);

      // Apply triangle collision — modifies posView in-place.
      // BUG-2 (#605): pass prevView so the position-based friction kernel in
      // solveTriangleCollision actually runs. Without prevPos the friction
      // branch is silently skipped and body.friction is a no-op — matches
      // the CPU path in xpbdSolver.ts which passes this.prevPos.
      for (const body of collisionBodies) {
        solveTriangleCollision(posView, invMassCache, n, body.mesh, body.hash, body.margin, body.friction, prevView);
      }

      // NaN guard: if any position went NaN, reset to previous valid positions.
      // A3 Sec 3.3.A: added telemetry counter — was silent reset, now signals
      // cumulative NaN occurrences via rate-limited console.warn.
      let nanThisStep = 0;
      for (let i = 0; i < n3; i++) {
        if (posView[i] !== posView[i]) {
          posView[i] = prevView[i];
          nanThisStep++;
        }
      }
      if (nanThisStep > 0) {
        wasmNaNCount += nanThisStep;
        if (wasmNaNCount === nanThisStep || wasmNaNCount % 100 === 0) {
          console.warn(`[WasmWorker] NaN detected in positions buffer: ${nanThisStep} this step, ${wasmNaNCount} cumulative (collision branch)`);
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

    // Solve elastic constraints in JS (no-collision path)
    if (elasticConstraintSet && wasmExports?.memory) {
      const sdt = 1 / (60 * jsSubsteps);
      const posPtr = solver.positions_ptr();
      const posView = new Float32Array(wasmExports.memory.buffer, posPtr, n * 3);
      for (const c of elasticConstraintSet.constraints) {
        const i3 = c.vertexA * 3, j3 = c.vertexB * 3;
        const dx = posView[j3] - posView[i3];
        const dy = posView[j3 + 1] - posView[i3 + 1];
        const dz = posView[j3 + 2] - posView[i3 + 2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist < 1e-8) continue;
        const alpha = c.compliance / (sdt * sdt);
        const correction = (dist - c.restLength) / (2.0 + alpha);
        const nx = dx / dist, ny = dy / dist, nz = dz / dist;
        posView[i3] += correction * nx;
        posView[i3 + 1] += correction * ny;
        posView[i3 + 2] += correction * nz;
        posView[j3] -= correction * nx;
        posView[j3 + 1] -= correction * ny;
        posView[j3 + 2] -= correction * nz;
      }
    }

    // A3 Sec 3.3.A: NaN guard in non-collision branch (parallel to collision
    // branch above). Pre-A3 only collision branch had guard — non-collision
    // path could propagate NaN positions to render. Now consistent across
    // branches with shared telemetry counter `wasmNaNCount`.
    if (wasmExports?.memory) {
      const posPtr = solver.positions_ptr();
      const prevPtr = solver.prev_positions_ptr();
      const posView = new Float32Array(wasmExports.memory.buffer, posPtr, n * 3);
      const prevView = new Float32Array(wasmExports.memory.buffer, prevPtr, n * 3);
      let nanThisStep = 0;
      for (let i = 0; i < n * 3; i++) {
        if (posView[i] !== posView[i]) {
          posView[i] = prevView[i];
          nanThisStep++;
        }
      }
      if (nanThisStep > 0) {
        wasmNaNCount += nanThisStep;
        if (wasmNaNCount === nanThisStep || wasmNaNCount % 100 === 0) {
          console.warn(`[WasmWorker] NaN detected in positions buffer: ${nanThisStep} this step, ${wasmNaNCount} cumulative (no-collision branch)`);
        }
      }
    }

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
        // Load Wasm module inside the worker (cache-bust with version)
        const baseUrl = msg.baseUrl ?? '/';
        const v = msg.wasmVersion ?? '';
        const qs = v ? `?v=${v}` : '';
        const wasmModule = await import(/* @vite-ignore */ `${baseUrl}wasm/xpbd_wasm.js${qs}`) as unknown as WasmModule;
        const initResult = await wasmModule.default(`${baseUrl}wasm/xpbd_wasm_bg.wasm${qs}`);

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
          // A3 Sec 3.2.A: surface silent fallback as UI error via postMessage.
          // Previously console.warn-only — user saw frozen cloth without
          // explanation. Now flows through wasmSolverClient onError callback
          // (consumer responsible for showErrorToast / overlay UX).
          const errorMsg =
            'WASM solver init failed: WebAssembly.Memory not accessible. ' +
            'Cloth simulation will not run. Try refreshing the page.';
          console.error('[WasmWorker]', errorMsg, {
            initResultType: typeof initResult,
            initResultKeys: exportsLike ? Object.keys(exportsLike).slice(0, 10) : 'null/void',
            moduleKeys: Object.keys(wasmModule).slice(0, 10),
          });
          self.postMessage({
            type: 'error',
            code: 'wasm_memory_unavailable',
            message: errorMsg,
          });
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
        // BUG-1 (#604): Rust solve_bend expects rest *distances* between the
        // opposite vertices c, d (indices 2 and 3 of each 4-tuple), not the
        // dihedral angles that the shared TSL extractor returns. Compute the
        // distances locally so the WASM tier matches CPU semantics.
        const bendRestDistances = computeBendRestDistances(merged.vertices, bend.ids);
        solver.set_bend_with_types(bend.ids, bendRestDistances, bend.edgeTypes);

        // Pass triangle indices for air drag calculation
        solver.set_triangles(triangles);

        // Cache outline and edge data for elastic constraint building
        const outlines = new Map<string, PathCommand[]>();
        const pieceEdges = new Map<string, { edges?: Array<Pick<SemanticEdge, 'name' | 'segmentRange'>> }>();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const p of msg.pieces as any[]) {
          if (p.outline) outlines.set(p.pieceId, p.outline);
          if (p.edges) pieceEdges.set(p.pieceId, { edges: p.edges });
        }
        wasmCachedOutlines = outlines;
        wasmCachedPieceEdges = pieceEdges;
        // Convert MergedMesh.pieces[] to the Map format expected by buildElasticConstraints
        const pieceOffsetsMap = new Map<string, { vertexOffset: number; indexOffset: number }>();
        for (const p of merged.pieces) {
          pieceOffsetsMap.set(p.pieceId, { vertexOffset: p.vertexOffset, indexOffset: p.triangleOffset });
        }
        wasmCachedMergedMesh = { vertices: merged.vertices, indices: new Uint32Array(merged.triIds), pieceOffsets: pieceOffsetsMap };

        // Seam constraints
        if (msg.seams && msg.seams.length > 0) {
          const seamConstraints = buildSeamConstraints(msg.seams, outlines, merged, pieceEdges);
          if (seamConstraints.count > 0) {
            console.log('[WasmWorker] Adding seam constraints:', seamConstraints.count);
            // Convert pairs to Uint32Array for Wasm
            const ids = new Uint32Array(seamConstraints.ids);
            // BUG-3 (#606): pass per-seam compliance through to the Rust solver.
            // Previously the worker called the 2-arg `set_seams(ids, target)`,
            // which silently dropped `seamConstraints.compliances` — the Rust
            // solver then hardcoded alpha=0 and treated every seam as rigid
            // regardless of tension/strength. Now plumbed end-to-end.
            solver.set_seams_with_compliance(ids, seamConstraints.restLengths, seamConstraints.compliances);
          }
        }

        // Merge incoming config with defaults to populate the persistent
        // currentConfig. Subsequent setConfig messages merge partial updates
        // into this same record so all fields survive runtime changes.
        currentConfig = { ...DEFAULT_SOLVER_CONFIG, ...(msg.config ?? {}) };
        // Store desired substeps for JS-managed collision loop, configure
        // Rust solver with substeps=1 so each solver.step() is a single substep.
        // The JS simulation loop calls step() jsSubsteps times with collision
        // correction between each, preventing particles from tunneling through
        // the avatar mesh.
        jsSubsteps = currentConfig.substeps;
        applySolverConfig();

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
            hash: new TriangleSpatialHash(msg.mesh, Math.max(0.02, currentConfig.thickness * 10)),
            friction: 0,
            margin: 0.005,
          });
          console.log('[WasmWorker] Collision mesh set (avatar):', msg.mesh.triCount, 'triangles');
        }
        break;

      case 'setCollisionBodies':
        collisionBodies = (msg.bodies as Array<{ id: string; mesh: CollisionMeshData; friction: number; margin: number }>).map(b => ({
          ...b,
          hash: new TriangleSpatialHash(b.mesh, Math.max(0.02, currentConfig.thickness * 10)),
        }));
        console.log('[WasmWorker] Collision bodies set:', collisionBodies.length, 'bodies');
        break;

      case 'updateCollisionBody': {
        const { id, mesh, friction, margin } = msg as { id: string; mesh: CollisionMeshData; friction: number; margin: number };
        const idx = collisionBodies.findIndex(b => b.id === id);
        const entry: WorkerCollisionBody = { id, mesh, hash: new TriangleSpatialHash(mesh, Math.max(0.02, currentConfig.thickness * 10)), friction, margin };
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

      case 'setConfig': {
        // BUG-4 (#607): merge every supported field into currentConfig and
        // re-apply to the Rust solver. Previously only `substeps` was honored;
        // other runtime physics changes (damping, gravity, drag, thickness,
        // compliances, internal damping, ...) were silently dropped.
        currentConfig = { ...currentConfig, ...(msg.config ?? {}) };
        if (msg.config?.substeps !== undefined) {
          jsSubsteps = currentConfig.substeps;
        }
        applySolverConfig();
        break;
      }

      case 'setWind': {
        if (solver) {
          solver.set_wind(msg.wind[0], msg.wind[1], msg.wind[2]);
        }
        break;
      }

      case 'setElastics': {
        if (wasmCachedMergedMesh && wasmCachedOutlines && wasmCachedPieceEdges) {
          const activeElastics = (msg.elastics as Elastic[]).filter(e => e.active !== false);
          if (activeElastics.length > 0) {
            elasticConstraintSet = buildElasticConstraints(
              activeElastics,
              wasmCachedOutlines,
              wasmCachedMergedMesh,
              wasmCachedPieceEdges,
            );
            console.log('[WasmWorker] Elastic constraints set:', elasticConstraintSet.constraints.length);
          } else {
            elasticConstraintSet = null;
          }
        }
        break;
      }

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
