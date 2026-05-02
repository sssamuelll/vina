/**
 * Cloth tool dispatch helper — Pattern 2.5 lite consolidation of per-tier
 * tool dispatch (steam brush + mesh grab) across the 4 cloth solver tiers.
 *
 * Per C4 RFC § 3.1.A ratification (mirror of A2 `configBridge.ts` precedent
 * — surgical helper for cross-tier semantic translation).
 *
 * **Tier coverage:**
 * - GPU (TSL): full surface. Steam brush via `setBrushParams` + TSL
 *   `brushNodes` kernel; mesh grab via `tslSolverRef.grabNodes.*` uniforms.
 * - WASM: mesh grab only (via `setPins` with positional pin shape).
 * - CPU + Neural: no tool dispatch (capability flag protects consumer
 *   intent; `SimulationStatusOverlay` warning communicates absence).
 *
 * **Pin position semantics caveat (per A6 RFC Q2):** WASM `setPins` uses
 * positional pin (`position` field is the target coordinate the particle
 * is moved to). This helper passes `base + delta` positions — consumer
 * MUST keep `state.basePositions` and `state.startPoint` in sync via
 * `dispatchGrabInit` before calling `dispatchGrabMove`.
 *
 * @module toolDispatch
 * @see docs/reports/2026-05-02-drift-fase2-c4-4way-tier-orchestration.md
 */

import type { GpuSolverClient } from './gpu/gpuSolverClient';
import type { WasmSolverClient } from './wasm/wasmSolverClient';
import type { TslSolver } from './gpu/tslSolver';

/**
 * Tier client refs needed for tool dispatch. Consumer typically holds
 * these inside React refs (`gpuClientRef`, `wasmClientRef`, `tslSolverRef`)
 * and `positionsRef`.
 *
 * `tslSolver` is a separate ref because GPU client owns the solver
 * via `getTslSolver()`, and tool uniforms write directly to TSL nodes
 * (bypasses stale `gpuClient` ref per existing comment in
 * `GarmentSimulation.tsx`).
 */
export interface ClothToolTiers {
  /** GPU client (only used here for `setBrushParams`; grab uniforms go via `tslSolver`). */
  gpu: GpuSolverClient | null;
  /** WASM client (mesh grab fallback via `setPins`). */
  wasm: WasmSolverClient | null;
  /** TSL solver instance (owns `brushNodes` + `grabNodes` uniform refs). */
  tslSolver: TslSolver | null;
  /** Live solver positions (used by WASM mesh grab to find particles within radius). */
  positions: Float32Array | null;
}

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

/** Mesh grab move parameters (init must precede). */
export interface GrabMoveArgs {
  /** Current world-space pointer position. */
  point: [number, number, number];
}

/**
 * Mutable state shared across mesh grab init → move → release lifecycle.
 *
 * Consumer typically holds this in a single React ref
 * (`useRef<GrabState>({...})`) and passes `.current` to the helpers.
 * The helpers mutate fields in-place; React ref `.current` mutation
 * propagates without re-render (intentional — grab is a per-frame
 * interaction).
 */
export interface GrabState {
  /** Particle indices selected during init (WASM tier only; empty for TSL). */
  indices: number[];
  /** Per-particle base positions captured at init. Null when inactive. */
  basePositions: Float32Array | null;
  /** Pointer location at init (used as offset origin for move delta). */
  startPoint: [number, number, number];
}

/**
 * Apply a steam brush stroke at the given point.
 *
 * Tier coverage:
 * - GPU: writes brush uniforms via `setBrushParams` (TSL kernel reads
 *   them next frame).
 * - WASM/CPU/Neural: silent no-op (steam brush is GPU-tier feature
 *   per C4 RFC § 2.3; `SimulationStatusOverlay` communicates absence).
 *
 * @returns `true` if a tier accepted the dispatch, `false` if no tier
 *   supports steam brush in the current configuration.
 */
export function dispatchBrushStroke(
  args: BrushStrokeArgs,
  tiers: ClothToolTiers,
): boolean {
  if (tiers.gpu) {
    tiers.gpu.setBrushParams(args.point, args.radius, args.strength);
    return true;
  }
  return false;
}

/**
 * Clear active steam brush (called on pointer up / leave).
 *
 * Resets brush params to zero so TSL kernel stops applying damping.
 * GPU-only no-op pattern.
 */
export function dispatchBrushClear(tiers: ClothToolTiers): void {
  if (tiers.gpu) {
    tiers.gpu.setBrushParams([0, 0, 0], 0, 0);
  }
}

/**
 * Initialize a mesh grab at the given point.
 *
 * Tier coverage:
 * - GPU (TSL): writes grab uniforms; TSL `grabInitNode` runs next frame
 *   to populate per-particle mask + offset on GPU.
 * - WASM: queries `tiers.positions`, finds particles within radius,
 *   captures base positions to `state.basePositions`, calls `setPins`
 *   with positional pin shape. Mutates `state.indices`, `state.startPoint`,
 *   `state.basePositions`.
 * - CPU + Neural: silent no-op.
 *
 * @returns `true` if dispatch landed (grab is now active), `false`
 *   otherwise. False on WASM if no particles fall within radius.
 */
export function dispatchGrabInit(
  args: GrabInitArgs,
  tiers: ClothToolTiers,
  state: GrabState,
): boolean {
  if (tiers.tslSolver) {
    const g = tiers.tslSolver.grabNodes;
    g.grabCenterX.value = args.point[0];
    g.grabCenterY.value = args.point[1];
    g.grabCenterZ.value = args.point[2];
    g.grabRadius.value = args.radius;
    g.grabStrength.value = args.strength;
    g.grabActive.value = 1;
    g.grabInitPending.value = 1;
    return true;
  }
  if (tiers.wasm && tiers.positions) {
    const positions = tiers.positions;
    const rSq = args.radius * args.radius;
    const indices: number[] = [];
    const N = positions.length / 3;
    for (let i = 0; i < N; i++) {
      const dx = positions[i * 3] - args.point[0];
      const dy = positions[i * 3 + 1] - args.point[1];
      const dz = positions[i * 3 + 2] - args.point[2];
      if (dx * dx + dy * dy + dz * dz < rSq) indices.push(i);
    }
    if (indices.length === 0) return false;
    state.indices = indices;
    state.startPoint = args.point;
    const base = new Float32Array(indices.length * 3);
    for (let j = 0; j < indices.length; j++) {
      const i = indices[j];
      base[j * 3] = positions[i * 3];
      base[j * 3 + 1] = positions[i * 3 + 1];
      base[j * 3 + 2] = positions[i * 3 + 2];
    }
    state.basePositions = base;
    tiers.wasm.setPins(indices.map((idx, j) => ({
      vertexIndex: idx,
      position: [
        base[j * 3],
        base[j * 3 + 1],
        base[j * 3 + 2],
      ] as [number, number, number],
    })));
    return true;
  }
  return false;
}

/**
 * Update mesh grab to track current pointer position.
 *
 * Tier coverage:
 * - GPU (TSL): updates `grabCenter*` uniforms only. TSL kernel computes
 *   per-particle offset next frame.
 * - WASM: computes delta from `state.startPoint`, writes new positional
 *   pins via `setPins(base + delta)`.
 * - CPU + Neural: silent no-op.
 *
 * Requires `dispatchGrabInit` to have been called previously (state must
 * be populated for WASM tier).
 *
 * @returns `true` if dispatch landed.
 */
export function dispatchGrabMove(
  args: GrabMoveArgs,
  tiers: ClothToolTiers,
  state: GrabState,
): boolean {
  if (tiers.tslSolver) {
    tiers.tslSolver.grabNodes.grabCenterX.value = args.point[0];
    tiers.tslSolver.grabNodes.grabCenterY.value = args.point[1];
    tiers.tslSolver.grabNodes.grabCenterZ.value = args.point[2];
    return true;
  }
  if (tiers.wasm && state.indices.length > 0 && state.basePositions) {
    const dx = args.point[0] - state.startPoint[0];
    const dy = args.point[1] - state.startPoint[1];
    const dz = args.point[2] - state.startPoint[2];
    const base = state.basePositions;
    tiers.wasm.setPins(state.indices.map((idx, j) => ({
      vertexIndex: idx,
      position: [
        base[j * 3] + dx,
        base[j * 3 + 1] + dy,
        base[j * 3 + 2] + dz,
      ] as [number, number, number],
    })));
    return true;
  }
  return false;
}

/**
 * Release mesh grab (called on pointer up / leave).
 *
 * Tier coverage:
 * - GPU (TSL): sets `grabActive = 0` so TSL kernel skips grab dispatch.
 * - WASM: calls `clearPins()` and resets `state.indices` + `state.basePositions`.
 * - CPU + Neural: silent no-op.
 */
export function dispatchGrabRelease(
  tiers: ClothToolTiers,
  state: GrabState,
): void {
  if (tiers.tslSolver) {
    tiers.tslSolver.grabNodes.grabActive.value = 0;
  } else if (tiers.wasm && state.indices.length > 0) {
    tiers.wasm.clearPins();
    state.indices = [];
    state.basePositions = null;
  }
}
