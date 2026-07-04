/**
 * seamThreads — pure helpers behind SeamRenderer3D's CLO3D-style thread fans.
 *
 * A seam is visualized as K threads connecting corresponding arc-length
 * parameters of its two sewn edges. The pairing mirrors the SOLVER's
 * semantics (seamAssembly / parameterizeEdge, parity plan Fase 5):
 *
 * - `t` is the arc-length parameter 0..1 along an edge's flattened polyline.
 * - `tStart`/`tEnd` restrict the sewn sub-range; undefined → 0 / 1.
 * - `pieceB.reversed` means B's parameterization is MIRRORED (t → 1−t), so
 *   B's tStart/tEnd live in the REVERSED space (same as the solver's t-range
 *   filter) and pairing connects A:t=0 ↔ B:t=1 for full-edge seams.
 *
 * No Three.js imports — everything here is testable without a render harness.
 *
 * @module Viewport3D/seamThreads
 */

import type { PathCommand, SemanticEdge } from '../../types/types';
import { outlineToLocal3D, type Local3DPoint } from '../../utils/3d/edgePicker';
import { commandRangeToFlattened } from '../../utils/seam';

export interface ThreadPair {
  /** Arc-length parameter on A's edge (natural direction). */
  tA: number;
  /** Arc-length parameter on B's edge (natural direction — `reversed` already applied). */
  tB: number;
}

/** ~1 thread per 2cm of sewn arc — CLO3D-density fans without a draw-call explosion. */
const THREAD_SPACING_M = 0.02;
const MIN_THREADS = 4;
const MAX_THREADS = 40;

/**
 * Adaptive thread count for a sewn arc length (meters): one thread every
 * ~2cm, clamped to [4, 40].
 */
export function threadCount(sewnArcMeters: number): number {
  if (!Number.isFinite(sewnArcMeters) || sewnArcMeters <= 0) return MIN_THREADS;
  return Math.min(MAX_THREADS, Math.max(MIN_THREADS, Math.round(sewnArcMeters / THREAD_SPACING_M)));
}

/**
 * Pair the sewn sub-ranges of a seam's two halves into K thread endpoints.
 *
 * Sweeps u ∈ [0,1] linearly: A at `tStart + u·(tEnd−tStart)` matches B at the
 * same u of B's range — evaluated in B's EFFECTIVE (possibly reversed)
 * parameterization, then mapped back to B's natural edge parameter
 * (t → 1−t when `reversed`). Matches `matchVertices`' ascending-t pairing
 * and the solver's "t-range filter refers to the REVERSED parameterization"
 * contract.
 */
export function pairSeamRanges(
  a: { tStart?: number; tEnd?: number },
  b: { tStart?: number; tEnd?: number; reversed?: boolean },
  k: number,
): ThreadPair[] {
  const aStart = a.tStart ?? 0;
  const aEnd = a.tEnd ?? 1;
  const bStart = b.tStart ?? 0;
  const bEnd = b.tEnd ?? 1;
  const n = Math.max(2, Math.floor(k)); // at least both endpoints
  const pairs: ThreadPair[] = [];
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    const tEff = bStart + u * (bEnd - bStart);
    pairs.push({
      tA: aStart + u * (aEnd - aStart),
      tB: b.reversed ? 1 - tEff : tEff,
    });
  }
  return pairs;
}

/**
 * Local-space polyline of a semantic edge (meters, centered, Y plane).
 * Same outline→local transform + segmentRange conversion/clamping as
 * `edgeMidpointLocal3D` (edgePicker) — that function is the midpoint of
 * exactly this polyline, so thread endpoints land on the same edge geometry
 * the old midpoint line used.
 */
export function edgeLocalPolyline(
  outline: PathCommand[],
  edge: SemanticEdge,
): Local3DPoint[] | null {
  const local3D = outlineToLocal3D(outline);
  if (local3D.length === 0) return null;
  const [start, end] = commandRangeToFlattened(outline, edge.segmentRange);
  const clampedStart = Math.max(0, Math.min(start, local3D.length - 1));
  const clampedEnd = Math.max(clampedStart + 1, Math.min(end + 1, local3D.length));
  const pts = local3D.slice(clampedStart, clampedEnd);
  return pts.length === 0 ? null : pts;
}

/** Total arc length of a local polyline (meters). */
export function polylineArcLength(pts: Local3DPoint[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
  }
  return len;
}

/**
 * Sample a local polyline at arc-length parameters `ts` (each clamped to
 * [0,1]). t is cumulative-arc-length based — the same parameterization
 * `parameterizeEdge` builds for the solver, so a thread at t=0.5 attaches
 * where the solver's mid-edge constraint lives.
 */
export function sampleAtParams(pts: Local3DPoint[], ts: number[]): Local3DPoint[] {
  if (pts.length === 1) return ts.map(() => ({ ...pts[0] }));
  const cum: number[] = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  }
  const total = cum[cum.length - 1];
  if (total === 0) return ts.map(() => ({ ...pts[0] }));
  return ts.map((t) => {
    const target = Math.max(0, Math.min(1, t)) * total;
    // ponytail: linear scan per sample — edge polylines are tens of points, K ≤ 40
    let i = 1;
    while (i < cum.length - 1 && cum[i] < target) i++;
    const segLen = cum[i] - cum[i - 1];
    const f = segLen === 0 ? 0 : (target - cum[i - 1]) / segLen;
    return {
      x: pts[i - 1].x + f * (pts[i].x - pts[i - 1].x),
      z: pts[i - 1].z + f * (pts[i].z - pts[i - 1].z),
    };
  });
}
