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
  /**
   * Body collision (cloth ↔ kinematic mesh, e.g. avatar). Each tier ships
   * its own acceleration structure: CPU+WASM share `TriangleSpatialHash`
   * (A4 § 2.4); GPU TSL uses a per-body BVH built via `three-mesh-bvh`
   * and traversed in `tslCollision.ts` (#733 ratifies the GPU divergence).
   * Neural drape has no body collision in the inference contract.
   */
  bodyCollision: boolean;
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
  /**
   * Interactive tool surface support per tier.
   *
   * Steam brush + mesh grab are tier-specific feature manifestations
   * (NOT uniform drift). Per-tier coverage:
   * - `steamBrush`: GPU-only. Velocity damping kernel writes via TSL
   *   uniforms (zero-copy hot path). Other tiers don't expose live
   *   velocity buffer.
   * - `meshGrab`: GPU + WASM. GPU uses `tslSolverRef.grabNodes.*`
   *   uniforms; WASM uses `setPins` with positional pin shape.
   *   CPU + Neural absent (CPU has freeze-only `pinParticle`; Neural
   *   has no positional pin in inference contract).
   *
   * Capability flag is documentary — consumer code (helper or inline)
   * checks before dispatch; UI surface (`SimulationStatusOverlay`)
   * communicates absence to user.
   *
   * Per C4 RFC § 3.1.A ratification.
   *
   * @see docs/reports/2026-05-02-drift-fase2-c4-4way-tier-orchestration.md
   */
  tools?: {
    /** Steam brush (relax cloth via velocity damping). */
    steamBrush: boolean;
    /** Mesh grab (drag cloth via positional displacement). */
    meshGrab: boolean;
  };
}

/**
 * CPU TS solver capabilities. All physics features supported. No tools
 * (steam brush + mesh grab are GPU/WASM-tier features per C4 RFC).
 */
export const CPU_CAPABILITIES: Readonly<SolverCapabilities> = Object.freeze({
  selfCollision: true,
  bodyCollision: true,
  lra: true,
  pressure: true,
  fold: true,
  pieceStiffness: true,
  tools: { steamBrush: false, meshGrab: false },
});

/**
 * WASM Rust solver capabilities (post-A7-closure state).
 *
 * Update flags here as per-feature port follow-up issues land:
 * - `selfCollision: true` (port landed in #608 / A7 § 3.1.1 — bit-exact
 *   port of `selfCollision.ts`; `solve_self_collision` in
 *   `crates/xpbd-wasm/src/lib.rs` consumes the `set_adjacency` CSR).
 * - `pressure: false → true` when pressure port lands (A7 § 3.1.3).
 * - `pieceStiffness: false → true` when piece stiffness port lands (A7 § 3.1.5).
 *
 * `lra` and `fold` are permanently `false` per A7 § 3.1 (ratified CPU-only).
 */
export const WASM_CAPABILITIES: Readonly<SolverCapabilities> = Object.freeze({
  selfCollision: true,
  bodyCollision: true,
  lra: false,
  pressure: false,
  fold: false,
  pieceStiffness: false,
  /**
   * Tools: mesh grab supported via `setPins` with positional pin shape
   * (positional semantics per A6 RFC Q2). Steam brush absent — would
   * require live velocity buffer access not exposed on WASM tier today.
   */
  tools: { steamBrush: false, meshGrab: true },
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
  /**
   * `false` until #733 Phase 2 e2e validates cloth draping on the body.
   *
   * Phase 2 (B.3 atomic emulation) landed: the 2-pass TSL kernel
   * (`findBestNode` + `applyPushNode` in `tslCollision.ts`) compiles cleanly
   * — Phase 1 debug infra surfaces zero `[WebGPU validation]` errors and
   * the generated WGSL uses `atomicMin` + `atomicStore` with `array<atomic<i32>>`
   * binding declarations as designed. The kernel structure sidesteps the
   * TSL outer-toVar/storage-derived codegen issue (§ 7.2). However, Phase 3
   * e2e against the T-Shirt + body-avatar scenario shows cloth still falling
   * to floor (y≈0) instead of draping on the torso, while the WASM tier
   * baseline at the same scenario produces a partial drape at waist height.
   * Root cause for the divergence is not yet diagnosed — possibilities
   * include AABB-margin tunneling at terminal-velocity fall, atomicMin/Store
   * propagation differences between TSL Fns, or initial-position placement
   * outside the body BVH AABB. Flag flips to `true` once the e2e gap closes.
   *
   * @see docs/reports/2026-05-04-733-gpu-body-collision-design.md § 9
   */
  bodyCollision: false,
  lra: false,
  pressure: false,
  fold: false,
  pieceStiffness: false,
  frameDriven: true,
  /**
   * Tools: full surface. Steam brush via `setBrushParams` + TSL
   * `brushNodes` kernel (per-particle velocity damping, zero-copy).
   * Mesh grab via `tslSolverRef.grabNodes.*` uniforms (per-particle
   * displacement, zero-copy). Both run in TSL compute kernels.
   */
  tools: { steamBrush: true, meshGrab: true },
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
  /**
   * Neural drape predicts vertex positions from rest mesh + body pose via
   * ONNX inference; body collision is not in the model contract (no
   * collision mesh input, no per-particle resolution step). Architectural
   * exclusion per C4 RFC § 2.3.
   */
  bodyCollision: false,
  lra: false,
  pressure: false,
  fold: false,
  pieceStiffness: false,
  frameDriven: false,
  /**
   * Tools: none. Neural drape predicts vertex positions from rest mesh +
   * body pose via ONNX inference; no per-particle interactivity in the
   * model contract (no positional pin, no velocity buffer). Architectural
   * exclusion per C4 RFC § 2.3.
   */
  tools: { steamBrush: false, meshGrab: false },
});
