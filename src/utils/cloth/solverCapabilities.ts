/**
 * Solver capability surface — declares which physics features are supported
 * on a given solver tier (CPU TS vs WASM Rust).
 *
 * Per A7 RFC § 3.3 Option C ratification: tier-based with capability surface.
 * UI consumers gate feature toggles or surface tier-aware warnings based on
 * `capabilities`. Capability flags update as port follow-up issues land.
 *
 * Cross-ref:
 * - `docs/reports/2026-05-01-rfc-a7-wasm-cpu-equivalence.md` (full RFC).
 * - `CLAUDE.md` § "WASM vs CPU solver capabilities (A7 ratified)".
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
