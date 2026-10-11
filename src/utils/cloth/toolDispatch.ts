/**
 * Cloth tool dispatch helper — Pattern 2.5 lite consolidation of per-tier
 * tool dispatch (steam brush + mesh grab) across the 4 cloth solver tiers.
 *
 * Per C4 RFC § 3.1.A ratification (mirror of A2 `configBridge.ts` precedent
 * — surgical helper for cross-tier semantic translation).
 *
 * **Tier coverage:**
 * - GPU (TSL): full surface. Steam brush via `setBrushParams` + TSL
 *   `brushNodes` kernel; mesh grab via `tslSolverRef.setGrabUniforms()`
 *   (which writes the TSL `grabNodes.*` uniforms internally).
 * - WASM: mesh grab only (via `setPins` with positional pin shape).
 * - CPU + Neural: no tool dispatch (capability flag protects consumer
 *   intent; `EstadoDeLaSimulacion` warning communicates absence).
 *
 * **Pin position semantics caveat (per A6 RFC Q2):** WASM `setPins` uses
 * positional pin (`position` field is the target coordinate the particle
 * is moved to). The `GrabHandle` returned by `dispatchGrabInit` captures
 * `basePositions` + `startPoint` in closure; `handle.move(point)` computes
 * `base + delta` per-particle and pushes the resulting pin positions.
 *
 * ## Type-design follow-ups (#701, #702, #703)
 *
 * - **#701 — `ClothToolTiers` is a discriminated union over `kind`.**
 *   The previous 4-nullable bag (`{ gpu, wasm, tslSolver, positions }`)
 *   allowed invalid combinations (e.g., `wasm` set + `positions` null).
 *   The new shape forces the consumer to commit to one tier at construction
 *   time; helpers `switch` on `kind` and rely on the variant's non-null
 *   fields without runtime null-checks.
 * - **#702 — `dispatchGrabInit` returns a `GrabHandle | null`.**
 *   Init-before-move is encoded at the type level: callers cannot call
 *   `move`/`release` without first owning a handle. The previous
 *   `dispatchGrabMove(args, tiers, state)` + `dispatchGrabRelease(tiers, state)`
 *   functions are removed; their behaviour lives on the handle. `GrabState`
 *   is now an internal implementation detail (not exported).
 * - **#703 — TSL grab uniform writes are encapsulated by
 *   `TslSolver.setGrabUniforms()`.** The helper no longer reaches into
 *   `tiers.tslSolver.grabNodes.<field>.value` — a TSL kernel refactor
 *   touches only `tslSolver.ts`.
 *
 * ## Observability follow-ups (#704, #706)
 *
 * Every `return false` (silent-skip) path emits a `console.warn` gated on
 * `import.meta.env.DEV`. Warnings include the relevant runtime values
 * (radius, point, particle count) so dev-mode debugging of tier-init bugs
 * does not require attaching a debugger. Rate-limiting + structured error
 * IDs are out of scope and queued as separate follow-ups if a project-wide
 * logger lands.
 *
 * @module toolDispatch
 * @see docs/reports/2026-05-02-drift-fase2-c4-4way-tier-orchestration.md
 */

import type { GpuSolverClient } from './gpu/gpuSolverClient';
import type { WasmSolverClient } from './wasm/wasmSolverClient';
import type { TslSolver } from './gpu/tslSolver';

/**
 * Tier client refs needed for tool dispatch, expressed as a discriminated
 * union over `kind` (C4 follow-up #701). Consumer commits to a single
 * variant at construction time; helpers switch on `kind` and trust the
 * variant's non-null fields.
 *
 * - `kind: 'gpu'`: TSL/WebGPU path. `gpu` (for `setBrushParams`) and
 *   `tslSolver` (for `setGrabUniforms`) are both required. Tools dispatch
 *   into TSL uniforms; per-tier grab semantics are uniform-driven.
 * - `kind: 'wasm'`: Rust WASM path. `wasm` (for `setPins`/`clearPins`)
 *   and `positions` (the live snapshot Float32Array used to find particles
 *   within radius) are both required. Steam brush is a silent no-op on
 *   this variant (capability flag is `false`).
 * - `kind: 'none'`: CPU + Neural (no tool surface). All dispatches are
 *   silent no-ops; the variant exists so callers can construct a tiers
 *   object unconditionally rather than guarding the call site.
 *
 * Previous shape (4-nullable bag) is gone; mapping for callers:
 *
 * ```ts
 * // Old:
 * { gpu: gpuClient, wasm: null, tslSolver, positions: null }
 * // New:
 * { kind: 'gpu', gpu: gpuClient, tslSolver }
 * ```
 */
export type ClothToolTiers =
  | { kind: 'gpu'; gpu: GpuSolverClient; tslSolver: TslSolver }
  | { kind: 'wasm'; wasm: WasmSolverClient; positions: Float32Array }
  | { kind: 'none' };

/** Steam brush stroke parameters (canonical world-space units). */
export interface BrushStrokeArgs {
  /** World-space brush center. */
  point: [number, number, number];
  /** World-space radius (metres). */
  radius: number;
  /** Damping strength [0..1]. */
  strength: number;
}

/** Mesh grab init parameters. */
export interface GrabInitArgs {
  /** World-space grab center at init. */
  point: [number, number, number];
  /** World-space radius (metres). */
  radius: number;
  /** Grab strength [0..1]. */
  strength: number;
}

/**
 * Handle for an active mesh grab session (C4 follow-up #702).
 *
 * Returned by `dispatchGrabInit` when the grab initialization landed on a
 * tier. Holds the tier + per-grab state (indices, base positions, start
 * point) in closure; methods `move`/`release` close over that state so
 * the caller never needs to thread a mutable `GrabState` through.
 *
 * Lifecycle is encoded at the type level: `move`/`release` only exist on
 * a handle, and a handle only exists post-init.
 */
export interface GrabHandle {
  /**
   * Update mesh grab to track the current pointer position.
   *
   * Tier coverage:
   * - GPU (TSL): writes `grabCenter*` uniforms; TSL kernel computes
   *   per-particle offset next frame.
   * - WASM: computes delta from the init point, writes new positional
   *   pins via `setPins(base + delta)`.
   *
   * @returns `true` if the dispatch landed; `false` if the handle's
   *   tier degenerated (e.g., WASM handle whose state has no indices —
   *   shouldn't happen post-init but defensively returns `false`).
   */
  move(point: [number, number, number]): boolean;
  /**
   * Release the mesh grab (called on pointer up / leave / abort).
   *
   * Tier coverage:
   * - GPU (TSL): sets `grabActive = 0` so the TSL kernel skips grab
   *   dispatch next frame.
   * - WASM: calls `clearPins()` if any pins were registered at init.
   *
   * Idempotent — safe to call multiple times; the handle's internal state
   * is reset on first call.
   */
  release(): void;
}

/**
 * Internal per-grab mutable state (WASM variant only).
 *
 * Not exported. Lives inside the `GrabHandle` closure returned by
 * `dispatchGrabInit`. Previous public `GrabState` surface is gone.
 */
interface WasmGrabState {
  /** Particle indices selected during init. */
  indices: number[];
  /** Per-particle base positions captured at init (`indices.length * 3`). */
  basePositions: Float32Array;
  /** Pointer location at init (used as offset origin for move delta). */
  startPoint: [number, number, number];
}

/**
 * Dev-mode warning helper. Gated on `import.meta.env.DEV` so prod builds
 * tree-shake the calls away. Per C4 follow-ups #704 + #706.
 *
 * Rate-limiting / structured error IDs are out of scope for this PR.
 */
function devWarn(message: string): void {
  if (import.meta.env.DEV) {
    console.warn(message);
  }
}

/**
 * Apply a steam brush stroke at the given point.
 *
 * Tier coverage:
 * - `kind: 'gpu'`: writes brush uniforms via `setBrushParams`.
 * - `kind: 'wasm'` / `kind: 'none'`: silent no-op (steam brush is GPU-only
 *   per C4 RFC § 2.3; `EstadoDeLaSimulacion` communicates absence).
 *
 * @returns `true` if a tier accepted the dispatch, `false` otherwise.
 */
export function dispatchBrushStroke(
  args: BrushStrokeArgs,
  tiers: ClothToolTiers,
): boolean {
  switch (tiers.kind) {
    case 'gpu':
      tiers.gpu.setBrushParams(args.point, args.radius, args.strength);
      return true;
    case 'wasm':
      devWarn(
        `[toolDispatch] dispatchBrushStroke: WASM tier active; steam brush is GPU-only (point=[${args.point[0]},${args.point[1]},${args.point[2]}], radius=${args.radius}). Silent no-op.`,
      );
      return false;
    case 'none':
      devWarn(
        `[toolDispatch] dispatchBrushStroke: no tier present (kind='none'); tool is silent no-op (point=[${args.point[0]},${args.point[1]},${args.point[2]}], radius=${args.radius}).`,
      );
      return false;
  }
}

/**
 * Clear active steam brush (called on pointer up / leave).
 *
 * Resets brush params to zero so the TSL kernel stops applying damping.
 * No-op on non-GPU variants.
 */
export function dispatchBrushClear(tiers: ClothToolTiers): void {
  if (tiers.kind === 'gpu') {
    tiers.gpu.setBrushParams([0, 0, 0], 0, 0);
  }
}

/**
 * Initialize a mesh grab at the given point.
 *
 * Tier coverage:
 * - `kind: 'gpu'`: writes grab uniforms via `tslSolver.setGrabUniforms`
 *   (per #703 — uniform layout is no longer leaked into this helper).
 *   TSL `grabInitNode` populates per-particle mask + offset next frame.
 * - `kind: 'wasm'`: queries `positions`, finds particles within radius,
 *   captures base positions, calls `setPins` with positional pin shape.
 * - `kind: 'none'`: silent no-op.
 *
 * @returns `GrabHandle` on success (grab is now active and `move`/`release`
 *   are bound to this tier); `null` if no tier accepted the dispatch
 *   (e.g., no particles within radius on WASM).
 */
export function dispatchGrabInit(
  args: GrabInitArgs,
  tiers: ClothToolTiers,
): GrabHandle | null {
  switch (tiers.kind) {
    case 'gpu': {
      const tslSolver = tiers.tslSolver;
      tslSolver.setGrabUniforms(args.point, {
        radius: args.radius,
        strength: args.strength,
        active: 1,
        initPending: 1,
      });
      let released = false;
      // Track last grab point in closure so release() can flip `active=0`
      // without reading uniforms back (which would re-leak the layout
      // #703 hid behind `setGrabUniforms`).
      let lastPoint: [number, number, number] = [
        args.point[0],
        args.point[1],
        args.point[2],
      ];
      return {
        move(point) {
          if (released) {
            devWarn(
              `[toolDispatch] GrabHandle.move (GPU): called after release — caller bug?`,
            );
            return false;
          }
          tslSolver.setGrabUniforms(point);
          lastPoint = [point[0], point[1], point[2]];
          return true;
        },
        release() {
          if (released) return;
          released = true;
          tslSolver.setGrabUniforms(lastPoint, { active: 0 });
        },
      };
    }
    case 'wasm': {
      const positions = tiers.positions;
      const wasm = tiers.wasm;
      const rSq = args.radius * args.radius;
      const indices: number[] = [];
      const N = positions.length / 3;
      for (let i = 0; i < N; i++) {
        const dx = positions[i * 3] - args.point[0];
        const dy = positions[i * 3 + 1] - args.point[1];
        const dz = positions[i * 3 + 2] - args.point[2];
        if (dx * dx + dy * dy + dz * dz < rSq) indices.push(i);
      }
      if (indices.length === 0) {
        devWarn(
          `[toolDispatch] dispatchGrabInit: WASM tier present but 0 particles in radius (radius=${args.radius}, point=[${args.point[0]},${args.point[1]},${args.point[2]}], totalParticles=${N}).`,
        );
        return null;
      }
      // Defensive copy: caller may reuse the args.point array buffer
      // (e.g., Vector3.toArray(out) pattern) and mutating it later would
      // corrupt the anchor for subsequent move() delta math.
      const startPoint: [number, number, number] = [
        args.point[0],
        args.point[1],
        args.point[2],
      ];
      const base = new Float32Array(indices.length * 3);
      for (let j = 0; j < indices.length; j++) {
        const i = indices[j];
        base[j * 3] = positions[i * 3];
        base[j * 3 + 1] = positions[i * 3 + 1];
        base[j * 3 + 2] = positions[i * 3 + 2];
      }
      wasm.setPins(
        indices.map((idx, j) => ({
          vertexIndex: idx,
          position: [base[j * 3], base[j * 3 + 1], base[j * 3 + 2]] as [
            number,
            number,
            number,
          ],
        })),
      );

      const state: WasmGrabState = {
        indices,
        basePositions: base,
        startPoint,
      };
      let released = false;
      return {
        move(point) {
          if (released) {
            devWarn(
              `[toolDispatch] GrabHandle.move (WASM): called after release — caller bug?`,
            );
            return false;
          }
          if (state.indices.length === 0) {
            // Defensive: handle was constructed with indices populated;
            // an empty state here means external corruption.
            devWarn(
              `[toolDispatch] GrabHandle.move (WASM): state has no indices (post-init corruption?).`,
            );
            return false;
          }
          const dx = point[0] - state.startPoint[0];
          const dy = point[1] - state.startPoint[1];
          const dz = point[2] - state.startPoint[2];
          const b = state.basePositions;
          wasm.setPins(
            state.indices.map((idx, j) => ({
              vertexIndex: idx,
              position: [
                b[j * 3] + dx,
                b[j * 3 + 1] + dy,
                b[j * 3 + 2] + dz,
              ] as [number, number, number],
            })),
          );
          return true;
        },
        release() {
          if (released) return;
          released = true;
          if (state.indices.length > 0) {
            wasm.clearPins();
          }
          state.indices = [];
        },
      };
    }
    case 'none':
      devWarn(
        `[toolDispatch] dispatchGrabInit: no tier present (kind='none'); grab is silent no-op (point=[${args.point[0]},${args.point[1]},${args.point[2]}], radius=${args.radius}).`,
      );
      return null;
  }
}
