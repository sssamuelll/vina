/**
 * Cloth solver protocol — canonical client interface + cross-tier shared types.
 *
 * Per A6 RFC § 3.1.C ratification: hybrid minimal core interface that captures
 * the lifecycle subset convergent across the 4 cloth solver tiers (CPU, WASM,
 * GPU/TSL, Neural). Tier-specific methods (snapshots, setWind, setPins, etc.)
 * live on concrete classes and are gated by capability flags.
 *
 * Cross-ref:
 * - `docs/reports/2026-05-01-rfc-a6-worker-protocol.md` (full RFC).
 * - `CLAUDE.md` § "Cloth solver client interface (A6 ratified)".
 * - `solverCapabilities.ts` — A7 capability skeleton extended with
 *   `frameDriven` flag (Constraint B of A6 § 3.1).
 *
 * **Forward-only convention:** new solver clients implement
 * `ClothSolverClient`. Tier-specific extension methods live on concrete classes
 * (consumer casts when needed) — interface intentionally minimal to avoid
 * leaky abstraction. See § 3.1.C tradeoff in the RFC.
 *
 * @module solverProtocol
 */

import type { SolverCapabilities } from './solverCapabilities';

// Re-export cross-tier shared types (A6 § 3.1 Constraint A — shared types
// location). The origen sigue siendo el archivo donde fueron definidos
// inicialmente; este módulo sirve como canonical entry point para consumers.
// Full relocation deferred — would reshape import graph + risk circular deps.
export type { SeamInitData } from './clothWorker';
export type { PieceMeshData } from './wasm/wasmSolverClient';

/**
 * Canonical cloth solver client interface — lifecycle subset.
 *
 * Implementations:
 * - `ClothWorkerClient` (CPU TS, postMessage worker).
 * - `WasmSolverClient` (WASM Rust, postMessage worker + WASM module).
 * - `GpuSolverClient` (GPU TSL/WebGPU, main-thread, useFrame-driven).
 * - `NeuralDrapeClient` (Neural ML, main-thread, ONNX Runtime Web).
 *
 * **Lifecycle expectations:**
 * - `initMultiPiece` is async; resolves when the solver is ready to receive
 *   subsequent calls. Multiple init calls require `dispose()` between.
 * - `start()`/`stop()` toggle the simulation loop. For tiers with
 *   `capabilities.frameDriven === true` (GPU/TSL), `start()` is a no-op
 *   and the consumer must drive frames via `useFrame` (or equivalent).
 * - `dispose()` releases worker / GPU / model resources. Returns `void` or
 *   `Promise<void>` depending on tier (Neural is async due to ONNX session
 *   release; others are sync).
 *
 * **Tier-specific methods NOT in the interface** (live on concrete classes):
 * snapshots (save/restore/delete), `setWind`, `setPins`/`clearPins`,
 * `setElastics`, `setCollisionMesh`/`setCollisionBodies`/etc., `setBrushParams`,
 * `grabStart`/`grabMove`/`grabRelease`, `getTslSolver`,
 * `getPositionStorageAttribute`, etc. Consumer casts to concrete type when
 * tier-specific access is needed.
 *
 * **Callbacks NOT in the interface** (live on concrete classes by convention):
 * `onFrame`, `onReady`, `onError`, `onEdgeData`. All 4 tiers expose these
 * fields by convention but signatures vary slightly per tier (CPU's
 * `FrameCallback` carries `(positions, numParticles, triIds)`; WASM/GPU/
 * Neural use `(positions)` only). Consumer code that wires callbacks must
 * assign per concrete-class type; polymorphic dispatch via this interface
 * is restricted to the lifecycle subset above. A future migration toward
 * uniform callback signatures (e.g., emit `numParticles`/`triIds` via a
 * separate `onMeshData` event) is a possible follow-up but explicitly
 * out of A6 scope.
 *
 * **Setter migrations queued** (post-A6, decoupled per § 3.6.C):
 * - `#XXX` setWind canonical signature with capability gate.
 * - `#YYY` setPins canonical batch shape (with caveat below).
 * - `#ZZZ` setFabric resolution moved to consumer.
 * - `#WWW` gravity bundled into setConfig.
 * - `#VVV` error shape uniform across 4 tiers.
 * - `#UUU` consumer polymorphic dispatch.
 *
 * **CRITICAL CAVEAT — pin semantics divergence (per A6 RFC Q2 resolution):**
 * The future canonical `setPins?(pins)` method (post-`#YYY`) accepts
 * `position?: [number, number, number]` as optional field. **Semantics
 * diverge by tier:**
 * - **CPU (`ClothWorkerClient`):** ignores `position` even if present.
 *   Particle freezes at its current position (`invMass[i] = 0`).
 * - **WASM (`WasmSolverClient`):** uses `position` as the target —
 *   particle is moved to and pinned at the supplied position.
 *
 * Consumer code dispatching polymorphically MUST be aware: passing
 * `position: [0, 0, 0]` thinking "default freeze in place" is a bug on
 * WASM tier (particle teleports to origin). Either omit `position` (CPU
 * intent) or supply the actual target coordinate (WASM intent + future
 * positional implementations). A future lint rule may catch this; until
 * then JSDoc + review enforce.
 *
 * @see docs/reports/2026-05-01-rfc-a6-worker-protocol.md § 4.1 Q2
 */
export interface ClothSolverClient {
  // ─── Lifecycle ──────────────────────────────────────────────────────

  // **NOTE: `initMultiPiece` is NOT in this interface.** Init shape diverges
  // structurally per tier (CPU+WASM `seams: SeamInitData[]`; GPU
  // `seamPairs: { pieceAId, pieceBId, vertexPairs }[]`; Neural takes only
  // `pieces`). Forcing a uniform init signature would require runtime
  // translation in GPU client (cost: behavioral change, scope creep
  // beyond A6 closure). All 4 concrete classes DO expose
  // `async initMultiPiece(pieces, ...): Promise<void>` by convention,
  // but with tier-specific subsequent params. Polymorphic init dispatch
  // is consumer responsibility — see `#UUU consumer migration`
  // follow-up for a factory-pattern unification.

  /**
   * Start the simulation loop.
   *
   * For tiers with `capabilities.frameDriven === true` (GPU/TSL), this is
   * a no-op — the consumer drives frames via `useFrame` or equivalent.
   * For other tiers, this enables the internal animation loop.
   */
  start(): void;

  /** Stop the simulation loop. */
  stop(): void;

  /**
   * Release solver resources (worker, GPU device, ML session, etc.).
   *
   * Sync `void` for CPU/WASM/GPU; async `Promise<void>` for Neural (ONNX
   * session release). Consumer can `await client.dispose()` polymorphically
   * — both shapes are compatible with `await`.
   */
  dispose(): void | Promise<void>;

  // ─── Capabilities ───────────────────────────────────────────────────

  /**
   * Read-only capability surface. Indicates which optional physics features
   * and execution modes the tier supports.
   *
   * Capability flags update as port follow-up issues land (per A7 § 3.6
   * decoupling pattern). LRA and fold are permanently `false` on WASM
   * (ratified CPU-only per A7 § 3.1).
   *
   * Consumer pattern:
   * ```ts
   * if (client.capabilities.frameDriven) {
   *   // GPU/TSL — dispatch frames via useFrame
   * } else {
   *   client.start();
   * }
   * ```
   */
  readonly capabilities: SolverCapabilities;
}

// ─── Error shape (forward-only convention per A3 § 3.4) ──────────────────────

/**
 * Canonical solver error code enum (forward-only, extensible via `string`).
 *
 * Per A3 § 3.4 Result-pattern convention + A6 § 3.3 Option A (uniform
 * error shape across 4 tiers). Currently only adopted on WASM tier
 * (`wasm_memory_unavailable`); migration to CPU + GPU + Neural tiers
 * deferred to `#VVV` follow-up issue.
 *
 * Consumer code branching on `code` should handle unknown codes
 * gracefully — the `string` fallback keeps the union forward-compat
 * with new error sources.
 */
export type SolverErrorCode =
  | 'wasm_memory_unavailable'
  | 'wasm_init_failed'
  | 'cpu_init_failed'
  | 'gpu_device_lost'
  | 'gpu_adapter_unavailable'
  | 'neural_model_load_failed'
  | 'neural_inference_failed'
  | 'mesh_invalid'
  | 'config_invalid'
  | (string & {}); // forward-compat — accepts ad-hoc codes without type widening

/**
 * Canonical solver error shape — emitted via worker postMessage (CPU/WASM)
 * or surfaced via callback (GPU/Neural). Migration to uniform shape across
 * all 4 tiers is deferred per A6 § 3.6.C decoupling — `#VVV` follow-up.
 */
export interface SolverError {
  type: 'error';
  code: SolverErrorCode;
  message: string;
  /** Optional per-error context (initResultType, missing keys, etc.). */
  details?: Record<string, unknown>;
}
