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
   * its own acceleration structure: CPU+WASM share `TriangleSpatialHash`;
   * GPU TSL uses a per-body BVH built via `three-mesh-bvh` and traversed
   * in `tslCollision.ts`. Neural drape has no body collision in the
   * inference contract.
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
   * Seam (sewing) constraints — XPBD distance constraints between matched
   * boundary vertices of two pieces, with per-substep target decay so the
   * seam *closes* (CLO3D-parity plan Fase 2). `true` means the tier both
   * accepts seam init data AND closes seams at parity with the CPU
   * reference (`solveSeamConstraints`).
   *
   * Per-tier coverage:
   * - CPU: `buildSeamConstraints` + `solveSeamConstraints` shrink schedule
   *   (reference implementation).
   * - WASM: `set_seams_with_compliance` + `set_seam_shrink_params` target
   *   decay (BUG-3 #606 + parity plan Fase 2) — full parity.
   * - GPU (TSL): kernel accepts `seamPairs` but lacks closure parity
   *   (no compliance SBA, no graph coloring, no target decay) — a seam
   *   constrains but never closes. DEFER per parity plan § 5; flag stays
   *   `false` until the kernel reaches parity.
   * - Neural: no seams in the inference contract (`initMultiPiece` takes
   *   pieces only) — architectural exclusion per C4 RFC § 2.3.
   *
   * Consumer: the tier cascade in `useSimulationLifecycle` skips tiers
   * declaring `seams: false` when the project has seams, with a visible
   * toast (parity plan Fase 4 — honest capability declaration per A7/C4
   * doctrine, never a silent downgrade).
   *
   * Like `tools` (per C4 follow-up #701) the field is **required** so a
   * new tier constant cannot silently omit its seam stance.
   */
  seams: boolean;
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
   * Per C4 RFC § 3.1.A ratification. Per C4 follow-up #701 the field is
   * **required** (no `?`): every tier must declare its tool surface
   * explicitly to prevent silent omission when a new tier constant is
   * added.
   *
   * @see docs/reports/2026-05-02-drift-fase2-c4-4way-tier-orchestration.md
   */
  tools: {
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
  /** Reference implementation: `buildSeamConstraints` + shrink schedule. */
  seams: true,
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
   * Seams at full parity with the CPU reference: `set_seams_with_compliance`
   * (BUG-3 #606) + `set_seam_shrink_params` per-substep target decay
   * (parity plan Fase 2, verified against the committed binary by
   * `scripts/verify-wasm-smoke.mjs`).
   */
  seams: true,
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
 * **`selfCollision: false` with dispatch fully wired (#897 F3.3)** —
 * `initMultiPieceTsl` now allocates `scBuffers` (CSR adjacency from the
 * merged triangle ids + `nextPrime(2N)` bucket table) and passes
 * `selfCollision: true` to `createTslSolver`, so the gate
 * (`config.selfCollision && buffers.scBuffers`) constructs the nodes, and
 * the 4-pass bucket pipeline (`cellClear → scatter → resolve → apply`)
 * dispatches every substep in the `GarmentSimulation.tsx` loop (before
 * groundClamp — Rust step-order mirror). Always-on on this tier is a
 * ratified divergence vs the 'normal' preset (that `false` is a
 * WASM-measured perf decision, #608/#892).
 *
 * Capability flag stays `false` pending F4.1, which flips `seams` +
 * `selfCollision` together after end-to-end verification on the real
 * María pattern.
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
   * GPU body collision — verified at WASM parity (#897 F2, 2026-06-12).
   * The historical 30cm gap (cloth settled at the knees ~y=0.3-0.4m vs
   * WASM at the waist) was four verified GPU↔WASM divergences, closed in
   * F2.1-F2.5:
   *
   * 1. M4-D avatar calibration applied on BOTH GPU routes (friction 0.4,
   *    margin 8mm) — GPU was running pre-M4-D constants (`8c6ff0d2`).
   * 2. Damping double-application — the internal 0.99 factor was applied
   *    twice per substep, depressing momentum vs WASM (`08b62801`).
   * 3. Velocity derivation included the collision push — pre-collision
   *    position snapshot + inelastic response + position NaN-check,
   *    mirroring `wasmSolverWorker` semantics (`284f3a5d`).
   * 4. NaN guard + i32 clamp in `findBest` (design doc § 9 candidates
   *    5-6, `ceaaf554`).
   *
   * Measured on the REAL María pattern (maria_patrones_samuel_2M.dxf,
   * auto-sew, real browser, GPU tier), M4 drape thresholds:
   *
   *   [f2-verify] tier=webgpu bodyCollision=true particles=29338
   *   constraints=402 nan=0 belowHipPct=0.1295 minY=0.7916 maxY=1.5834
   *   meanAbsZ=0.0890 frameMs=207.1000
   *
   * (Acceptance: nan=0, belowHipPct<5, minY>0.5 hem at hip, maxY>1.3
   * shoulders up — all pass; hem at ~0.79 vs WASM baseline 0.88.)
   *
   * NOTE: this flag is documentary — the tier cascade in
   * `useSimulationLifecycle` gates only on `seams`; nothing gates on
   * `bodyCollision`. Consumers read it for honest capability declaration
   * (A7/C4 doctrine), not for tier selection.
   *
   * @see docs/reports/2026-05-04-733-gpu-body-collision-design.md § 9
   */
  bodyCollision: true,
  lra: false,
  pressure: false,
  fold: false,
  pieceStiffness: false,
  /**
   * GPU seam kernel exists (`initMultiPieceTsl` consumes `seamPairs` via
   * `seamInitDataToPairs`) but lacks closure parity with CPU/WASM: no
   * per-constraint compliance SBA, no graph coloring, no per-substep
   * target decay — a seam holds distance but never *closes*. Same shape
   * as `selfCollision` above (scaffolded ≠ capable). Stays `false` until
   * the parity work ratified as DEFER in the CLO3D parity plan § 5 lands.
   */
  seams: false,
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
  /**
   * No seams in the inference contract — `initMultiPiece(pieces)` takes no
   * seam parameter at all (polymorphic init per the client's module doc).
   * Architectural exclusion per C4 RFC § 2.3, same as body collision.
   */
  seams: false,
  frameDriven: false,
  /**
   * Tools: none. Neural drape predicts vertex positions from rest mesh +
   * body pose via ONNX inference; no per-particle interactivity in the
   * model contract (no positional pin, no velocity buffer). Architectural
   * exclusion per C4 RFC § 2.3.
   */
  tools: { steamBrush: false, meshGrab: false },
});
