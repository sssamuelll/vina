/**
 * Solver capability surface — declares which physics features are supported
 * on a given solver tier (CPU TS vs WASM Rust).
 *
 * Per A7 RFC § 3.3 Option C ratification: tier-based with capability surface.
 * UI consumers gate feature toggles or surface tier-aware warnings based on
 * `capabilities`. Capability flags update as port follow-up issues land.
 *
 * Cross-ref: `docs/reports/2026-05-01-rfc-a7-wasm-cpu-equivalence.md` (full RFC).
 *
 * **Skeleton scope (A7 closure):** these constants reflect the post-A7-closure
 * state. Full implementation (dynamic capability negotiation, per-instance
 * flags, capability-aware tier auto-switch logic) is deferred to follow-up
 * issue per A7 § 3.6 Option B (decoupled Fase 3).
 *
 * **Update protocol:** when a per-feature port follow-up issue lands, flip
 * the corresponding flag in `WASM_CAPABILITIES` to `true`. LRA and fold are
 * permanently `false` (ratified CPU-only-by-design per A7 § 3.1).
 *
 * @module solverCapabilities
 */

export interface SolverCapabilities {
  /** Self-collision detection (SpatialHashGrid + collision response). */
  selfCollision: boolean;
  /** Long Range Attachments (Dijkstra geodesic + soft constraint). */
  lra: boolean;
  /** Per-piece pressure (inflation forces per triangle). */
  pressure: boolean;
  /** Fold constraints (bending compliance overrides for crisp creases). */
  fold: boolean;
  /** Per-piece stiffness multipliers (compliance scaling). */
  pieceStiffness: boolean;
  /**
   * TSL execution model — when `true`, the consumer drives frames via
   * `useFrame` (or equivalent), and the client's `start()`/`stop()` are
   * no-ops. When `false` (or unset), the client manages its own animation
   * loop internally (postMessage worker for CPU/WASM,
   * `requestAnimationFrame` for Neural).
   *
   * Per A6 RFC § 3.1 Constraint B (TSL execution model anomaly).
   * Currently only `GpuSolverClient` reports `true`.
   */
  frameDriven?: boolean;
}

/**
 * CPU TS solver capabilities. All features supported.
 */
export const CPU_CAPABILITIES: Readonly<SolverCapabilities> = Object.freeze({
  selfCollision: true,
  lra: true,
  pressure: true,
  fold: true,
  pieceStiffness: true,
});

/**
 * WASM Rust solver capabilities (post-A7-closure state).
 *
 * Update flags here as per-feature port follow-up issues land:
 * - `selfCollision: false → true` when self-collision port lands (A7 § 3.1.1).
 * - `pressure: false → true` when pressure port lands (A7 § 3.1.3).
 * - `pieceStiffness: false → true` when piece stiffness port lands (A7 § 3.1.5).
 *
 * `lra` and `fold` are permanently `false` per A7 § 3.1 (ratified CPU-only).
 */
export const WASM_CAPABILITIES: Readonly<SolverCapabilities> = Object.freeze({
  selfCollision: false,
  lra: false,
  pressure: false,
  fold: false,
  pieceStiffness: false,
});

/**
 * GPU TSL/WebGPU solver capabilities (post-A6-closure state).
 *
 * **`selfCollision: false` despite scaffolded TSL kernels** —
 * `tslSelfCollision.ts` exports `makeSelfCollisionComputeNodes` which is
 * imported and conditionally instantiated in `tslSolver.ts:634` (gated by
 * `config.selfCollision && buffers.scBuffers`). However:
 * - Default `config.selfCollision = false` (`gpuSolver.ts:62`).
 * - `selfCollisionNodes.{hashCount,prefixSum,scatter,resolve,apply}Node`
 *   are NEVER dispatched in `GarmentSimulation.tsx:380-435` substep loop
 *   (only stretch/bend/seam/wind/grab/postSolve/etc. are computed).
 *
 * Same shape as BUG-5 was for WASM tier (scaffolded but no wiring).
 * Capability stays `false` until the kernels are dispatched per substep
 * AND a default-on path or explicit toggle is wired through the consumer.
 *
 * `lra`, `pressure`, `fold`, `pieceStiffness` — no GPU implementation
 * exists. Same as WASM CPU-only-by-design gaps (A7 § 3.1).
 *
 * `frameDriven: true` — TSL solver compute is dispatched by the consumer
 * via `useFrame` in `GarmentSimulation.tsx`. `GpuSolverClient.start()`
 * is documented as no-op for the TSL path. Per A6 § 3.1 Constraint B.
 */
export const GPU_CAPABILITIES: Readonly<SolverCapabilities> = Object.freeze({
  selfCollision: false,
  lra: false,
  pressure: false,
  fold: false,
  pieceStiffness: false,
  frameDriven: true,
});

/**
 * Neural drape solver capabilities (post-A6-closure state).
 *
 * All physics flags `false` — Neural drape is ML inference (PBNS/HOOD-style
 * model via ONNX Runtime Web), not a physics solver. The model contract
 * predicts draped vertex positions from a rest mesh + body pose; it does
 * not produce constraint outputs (no self-collision detection, no LRA
 * geodesic constraints, no pressure forces, no fold compliance, no
 * per-piece stiffness multipliers).
 *
 * Verified by sweep: 0 grep hits in `neuralDrapeClient.ts` for any
 * physics constraint identifier (selfCollision, lra, pressure, fold,
 * pieceStiffness, stiffnessMultiplier).
 *
 * `frameDriven: false` — Neural manages its own animation loop
 * internally via `requestAnimationFrame`. `start()` enables the loop;
 * `stop()` cancels via `cancelAnimationFrame`. Consumer does NOT drive
 * frames. Per A6 § 3.1 Constraint B.
 */
export const NEURAL_CAPABILITIES: Readonly<SolverCapabilities> = Object.freeze({
  selfCollision: false,
  lra: false,
  pressure: false,
  fold: false,
  pieceStiffness: false,
  frameDriven: false,
});
