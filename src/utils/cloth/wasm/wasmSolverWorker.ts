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
 *   increment cumulative telemetry counter via `nanLogLimiter`. Rate-limited
 *   console.warn (first occurrence + every 100th) signals NaN events without spam.
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
import { mergeMeshes, buildSeamConstraints, seamInitDataToSeams, type PieceSeamData } from '../seamAssembly';
import { buildElasticConstraints, type ElasticConstraintSet } from '../elasticAssembly';
import type { PathCommand, Elastic } from '../../../types/types';
import type { CollisionMeshData } from '../collisionMesh';
import { TriangleSpatialHash, solveTriangleCollision } from '../triangleCollision';
import { buildAdjacency } from '../selfCollision';
import { buildAdjacencyCSR } from './adjacencyCSR';
import { createCountSamplingLimiter } from '../../rateLimit';
import type { PieceMeshData, WasmSolverConfig } from './wasmSolverClient';

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
  set_bend(ids: Uint32Array, rest_distances: Float32Array): void;
  set_bend_with_types(ids: Uint32Array, rest_distances: Float32Array, edge_types: Uint8Array): void;
  set_seams_with_compliance(ids: Uint32Array, target: Float32Array, compliances: Float32Array): void;
  set_seam_shrink_params(shrinkFactor: number, sewedThreshold: number): void;
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
let wasmCachedPieceEdges: Map<string, PieceSeamData> | null = null;
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
 * edge consensus.
 *
 * `selfCollision: true` (M4-D, camisa de María): aligned with the CPU
 * constructor default (`xpbdSolver.ts` selfCollision: true) — the previous
 * `false` here claimed to be "the canonical default-off on both tiers",
 * which was never true of the CPU tier, and it left multi-piece garments
 * with ZERO cloth-cloth resistance on the tier that actually runs them
 * (pieces interpenetrated freely while seams pulled). The kernel is the
 * #608 port (`solve_self_collision`, particle-particle, adjacency CSR
 * uploaded every init). Quality presets may still disable it per-mode via
 * the runtime config flag.
 */
const DEFAULT_SOLVER_CONFIG: AppliedSolverConfig = {
  substeps: 15,
  damping: 0.99,
  gravityY: -9.81,
  stretchCompliance: 0.0,
  bendCompliance: 1.0,
  selfCollision: true,
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
  // Architectural location (A7 ratified, § 3.1.6): substeps=1 hardcoded
  // because JS-side outer loop manages substep cadence. CPU TS solver
  // (xpbdSolver.ts step() — adaptiveSubsteps branch) has internal adaptive
  // substeps (10-30 based on velocity); JS-side adaptive cadence for WASM
  // tier queued as A7 follow-up. Cross-ref A7 RFC § 3.1.6.
  solver.configure(
    1,  // substeps=1: JS manages substep loop for per-substep collision
    currentConfig.damping,
    currentConfig.gravityY,
    currentConfig.stretchCompliance,
    currentConfig.bendCompliance,
    currentConfig.selfCollision,
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
 * surfacing the signal. Limiter helper extracted to `utils/rateLimit.ts` (#715).
 *
 * Cross-ref: `docs/reports/2026-05-01-drift-fase2-a3-cross-boundary-errors.md` Sec 3.3.A.
 */
const WASM_NAN_LOG_SAMPLING_N = 100;
const nanLogLimiter = createCountSamplingLimiter(WASM_NAN_LOG_SAMPLING_N);

/** Maximum particle velocity (m/s). Matches JS solver's maxVelocity.
 * Without this, the Rust solver's 900Hz substep rate amplifies constraint
 * corrections into extreme velocities that compound exponentially. */
const MAX_PARTICLE_VEL = 5.0;
const MAX_PARTICLE_VEL_SQ = MAX_PARTICLE_VEL * MAX_PARTICLE_VEL;

/**
 * Solve elastic XPBD distance constraints in JS — Rust solver has no native
 * elastic support, so we iterate `set.constraints` and apply position
 * corrections directly on the WASM-backed `posView`. Extracted from both
 * branches of `simulationLoop` (#758).
 */
function solveElasticConstraints(
  posView: Float32Array,
  set: ElasticConstraintSet,
  sdt: number,
): void {
  for (const c of set.constraints) {
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

/**
 * NaN guard at the WASM→JS post-step boundary. Resets NaN positions to
 * `prevView` (continuity preserved) and increments the module-scoped
 * cumulative counter via `nanLogLimiter` (A3 § 3.3.A telemetry contract).
 * Rate-limited console.warn: first occurrence + every Nth cumulative.
 * `branchLabel` flows into the warn message for log grep.
 */
function guardNaN(
  posView: Float32Array,
  prevView: Float32Array,
  branchLabel: string,
): void {
  let nanThisStep = 0;
  for (let i = 0; i < posView.length; i++) {
    if (posView[i] !== posView[i]) {
      posView[i] = prevView[i];
      nanThisStep++;
    }
  }
  if (nanThisStep > 0) {
    if (nanLogLimiter.tryEmit(nanThisStep)) {
      console.warn(`[WasmWorker] NaN detected in positions buffer: ${nanThisStep} this step, ${nanLogLimiter.count} cumulative (${branchLabel})`);
    }
  }
}

/**
 * Clamp particle velocity magnitude to `MAX_PARTICLE_VEL`. Rust solver's
 * post_solve has no internal clamp; at 900Hz substep rate, constraint
 * corrections of 0.05m become 45 m/s and compound exponentially into cloth
 * explosion without this gate.
 */
function clampVelocity(velView: Float32Array, n: number): void {
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
        solveElasticConstraints(posView, elasticConstraintSet, sdt);
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
      // A3 Sec 3.3.A: telemetry counter + rate-limited warn (see `guardNaN`).
      guardNaN(posView, prevView, 'collision branch');

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

      // Clamp velocity magnitude to prevent explosions (Rust post_solve has no clamp).
      clampVelocity(velView, n);
    }
  } else {
    // No collision bodies — run all substeps at once (original path)
    solver.step(1 / 60);

    // Solve elastic constraints in JS (no-collision path)
    if (elasticConstraintSet && wasmExports?.memory) {
      const sdt = 1 / (60 * jsSubsteps);
      const posPtr = solver.positions_ptr();
      const posView = new Float32Array(wasmExports.memory.buffer, posPtr, n * 3);
      solveElasticConstraints(posView, elasticConstraintSet, sdt);
    }

    // A3 Sec 3.3.A: NaN guard in non-collision branch (parallel to collision
    // branch above). Shares telemetry counter `nanLogLimiter` via `guardNaN`.
    if (wasmExports?.memory) {
      const posPtr = solver.positions_ptr();
      const prevPtr = solver.prev_positions_ptr();
      const posView = new Float32Array(wasmExports.memory.buffer, posPtr, n * 3);
      const prevView = new Float32Array(wasmExports.memory.buffer, prevPtr, n * 3);
      guardNaN(posView, prevView, 'no-collision branch');
    }

    // Clamp velocity even without collision — Rust solver has no internal clamp
    if (wasmExports?.memory) {
      const velPtr = solver.velocities_ptr();
      const velView = new Float32Array(wasmExports.memory.buffer, velPtr, n * 3);
      clampVelocity(velView, n);
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
          // Pre-fix the init handler fell through to mergeMeshes + new XpbdSolver
          // + set_stretch/_bend/_triangles/_adjacency, which all dereference
          // `wasmExports.memory` indirectly via wasm-bindgen views. With memory
          // unavailable each call throws, the top-level catch posts a generic
          // error, and the actionable `wasm_memory_unavailable` code is hidden
          // from the consumer (`onError` UX surface). Bail here so the specific
          // error code is the only one surfaced.
          return;
        }

        // Merge pieces using the standard utility (ensures consistent vertex mapping).
        // #749: postMessage structured-clones typed arrays cleanly, so unconditional
        // `new Float32Array(p.vertices)` was a redundant ~600KB copy on a 50k-vertex
        // avatar. Keep an `instanceof` guard so callers passing plain arrays still
        // work, but skip the copy in the canonical typed-array path.
        const pieces = msg.pieces as PieceMeshData[];
        const pieceInput: Array<{ pieceId: string; vertices: Float32Array; triIds: Int32Array; uvs?: Float32Array }> = pieces.map((p) => ({
          pieceId: p.pieceId,
          vertices: p.vertices instanceof Float32Array ? p.vertices : new Float32Array(p.vertices),
          triIds: p.triIds instanceof Int32Array ? p.triIds : new Int32Array(p.triIds),
          uvs: p.uvs instanceof Float32Array ? p.uvs : (p.uvs ? new Float32Array(p.uvs) : undefined),
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
        // P1 dihedral: Rust solve_bend ahora consume los ÁNGULOS rest del
        // extractor compartido directo (radianes, signed, flat=0) — BUG-1
        // quedó invertido y computeBendRestDistances borrado. Una sola
        // verdad del ángulo: dihedral.ts, que el extractor reusa.
        solver.set_bend_with_types(bend.ids, bend.restAngles, bend.edgeTypes);

        // Pass triangle indices for air drag calculation
        solver.set_triangles(triangles);

        // Self-collision adjacency CSR (#608, #676 per A7 § 3.1.1).
        // Build per-particle triangle-shared neighbor sets and flatten into a
        // CSR pair: `offsets[numParticles+1]` (prefix-sum scan) +
        // `neighbors[total]` (flat). The Rust `solve_self_collision` reads
        // `offsets[i]..offsets[i+1]` to skip triangle-connected pairs (matches
        // the TS `adjacency[i].has(j)` set lookup, just stored differently).
        // `merged.triIds` is `Int32Array` (CPU mesh convention); the helper
        // accepts that shape directly. Construction extracted to
        // `buildAdjacencyCSR` (#719) for unit-test coverage.
        const adjSets = buildAdjacency(merged.triIds, numParticles);
        const { offsets: adjOffsets, neighbors: adjNeighbors } = buildAdjacencyCSR(adjSets, numParticles);
        // #721: `set_adjacency` now returns Result<(), String>; a malformed
        // CSR throws at the wasm-bindgen boundary. Catch + log so the worker
        // keeps stepping (self-collision no-ops via the `Option::None`
        // guard in `solve_self_collision`) rather than tearing down init.
        // Worker happy-path always produces a valid CSR — this only fires
        // on future regressions.
        try {
          solver.set_adjacency(adjOffsets, adjNeighbors);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.warn(
            `[WasmWorker] set_adjacency rejected the CSR: ${message}. ` +
            `Self-collision will no-op for this session. This is a worker bug — ` +
            `the happy-path buildAdjacencyCSR output should always be well-formed.`,
          );
        }

        // Cache outline and edge data for elastic constraint building.
        // Every piece gets an entry (even without semantic edges): the
        // "edge-N" fallback path also parameterizes the boundary and needs
        // the mesher's per-piece meshMaxEdgeLength (M4 — index drift).
        const outlines = new Map<string, PathCommand[]>();
        const pieceEdges = new Map<string, PieceSeamData>();
        for (const p of pieces) {
          if (p.outline) outlines.set(p.pieceId, p.outline as PathCommand[]);
          pieceEdges.set(p.pieceId, {
            edges: p.edges,
            meshMaxEdgeLength: p.meshMaxEdgeLength,
            boundaryOrig: p.boundaryOrig,
          });
        }
        wasmCachedOutlines = outlines;
        wasmCachedPieceEdges = pieceEdges;
        // Convert MergedMesh.pieces[] to the Map format expected by buildElasticConstraints
        const pieceOffsetsMap = new Map<string, { vertexOffset: number; indexOffset: number }>();
        for (const p of merged.pieces) {
          pieceOffsetsMap.set(p.pieceId, { vertexOffset: p.vertexOffset, indexOffset: p.triangleOffset });
        }
        wasmCachedMergedMesh = { vertices: merged.vertices, indices: new Uint32Array(merged.triIds), pieceOffsets: pieceOffsetsMap };

        // Seam constraints.
        // CRITICAL (Fase 5 fix): `msg.seams` is worker-protocol
        // `SeamInitData[]` — it MUST be converted to the domain `Seam[]`
        // shape first. Passing it through unconverted (the pre-Fase-5
        // behavior) made `buildSeamConstraints` read `seam.pieceA.pieceId`
        // off `undefined` → TypeError on every seam-carrying init → the
        // tier cascade silently fell back to CPU. `msg` is untyped
        // (`event.data`), so the compiler never caught it.
        if (msg.seams && msg.seams.length > 0) {
          const seamConstraints = buildSeamConstraints(seamInitDataToSeams(msg.seams), outlines, merged, pieceEdges);
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
            // Fase 2 (BP-2): push the decay schedule so the Rust solver
            // shrinks targets per substep exactly like the CPU tier.
            // `seamConstraints.config` carries DEFAULT_SEAM_CONFIG's
            // shrinkFactor/sewedThreshold; the Rust constructor defaults
            // are the same values, but config-driven beats duplicated
            // constants if DEFAULT_SEAM_CONFIG ever moves.
            solver.set_seam_shrink_params(
              seamConstraints.config.shrinkFactor,
              seamConstraints.config.sewedThreshold,
            );
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
            // M4-D: 0.4 (was 0 hardcoded — the friction kernel in
            // triangleCollision.ts was dead code for the avatar, so cloth
            // slid off the body frictionlessly: a draped shirt would keep
            // creeping down. 0.4 ≈ cotton-on-skin; gives garments grip on
            // shoulders without sticking artifacts.
            friction: 0.4,
            // 8mm (was 5): with the garment resting ON the chest, 5mm let
            // skin patches z-fight through the cloth (M4-D visual).
            margin: 0.008,
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
          // BUG-2 (#605): thread prevPos so the friction kernel gate
          // (triangleCollision.ts:312, `friction > 0 && prevPos`) doesn't
          // fall through here as it used to on the main loop (L350). The
          // pre-pass has no natural prev (simulation hasn't started), so we
          // snapshot positions and refresh between passes — friction then
          // attenuates inter-pass tangent drift from multi-body push conflicts.
          const prev = positions.slice();
          for (let i = 0; i < 5; i++) {
            for (const body of collisionBodies) {
              solveTriangleCollision(positions, invMass, n, body.mesh, body.hash, body.margin, body.friction, prev);
            }
            prev.set(positions);
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
          // #749: client transfers typed-array buffers directly. No re-wrap.
          solver.set_pins(msg.indices as Uint32Array, msg.positions as Float32Array);
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
        // #750: single .slice() detaches from WASM memory; Int32Array
        // constructor over the same buffer is a zero-copy reinterpret
        // (vertex indices fit under 2^31).
        const idsBuffer = new Uint32Array(wasmExports.memory.buffer, idsPtr, numEdges * 2).slice().buffer;
        const stretchingIds = new Int32Array(idsBuffer);
        const stretchingLengths = new Float32Array(wasmExports.memory.buffer, restPtr, numEdges).slice();
        (self as unknown as Worker).postMessage(
          { type: 'edgeData', stretchingIds, stretchingLengths },
          [stretchingIds.buffer, stretchingLengths.buffer],
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
