import type { PathCommand, Point2D } from '../../types/types';
import {
  findOutlineIntersections,
  splitOutlineAtPoints,
  type OutlineHit,
} from './splitOutline';

export type { OutlineHit };

// --------------------------------------------------------------------------
// SplitMap — tracks index mapping from split halves back to original outline
// --------------------------------------------------------------------------

/**
 * Maps each command in the split halves back to its original command index in
 * the source outline.  A value of -1 means the command was inserted during
 * splitting (e.g. the M at the cut point, or the closing L back to the split
 * point).
 */
export interface SplitMap {
  /** new index → original command index (-1 if inserted) */
  halfAIndices: number[];
  /** new index → original command index (-1 if inserted) */
  halfBIndices: number[];
  hit1: OutlineHit;
  hit2: OutlineHit;
}

// --------------------------------------------------------------------------
// findSlashIntersections
// --------------------------------------------------------------------------

/**
 * Find where a slash line (startPoint → endPoint) crosses a piece outline.
 *
 * Wraps `findOutlineIntersections` and enforces the contract that a valid
 * slash produces **exactly 2** intersections.  Throws if the line misses the
 * outline entirely or produces a degenerate result (corner tangent, collinear
 * edge, etc.).
 *
 * @returns A fixed-length tuple `[OutlineHit, OutlineHit]` ordered by
 *   position along the outline.
 */
export function findSlashIntersections(
  outline: PathCommand[],
  startPoint: Point2D,
  endPoint: Point2D,
): [OutlineHit, OutlineHit] {
  const hits = findOutlineIntersections(outline, startPoint, endPoint);

  if (hits.length !== 2) {
    throw new Error(
      `Slash line must intersect the outline at exactly 2 points, but found ${hits.length}. ` +
        `Make sure the slash line crosses the outline from one side to the other.`,
    );
  }

  return [hits[0], hits[1]];
}

// --------------------------------------------------------------------------
// splitOutlineAtSlash
// --------------------------------------------------------------------------

/**
 * Result returned by `splitOutlineAtSlash`.
 */
export interface SlashSplitResult {
  /** First closed half-outline (M … Z). */
  halfA: PathCommand[];
  /** Second closed half-outline (M … Z). */
  halfB: PathCommand[];
  /** Index mapping back to the original outline commands. */
  splitMap: SplitMap;
}

/**
 * Split an outline into two closed halves at the two intersection points
 * produced by `findSlashIntersections`.
 *
 * Wraps `splitOutlineAtPoints` and attaches a `SplitMap` that tracks, for
 * each command in the output halves, the index of the originating command in
 * the source outline (-1 for commands inserted at the cut points).
 */
export function splitOutlineAtSlash(
  outline: PathCommand[],
  hit1: OutlineHit,
  hit2: OutlineHit,
): SlashSplitResult {
  const [halfA, halfB] = splitOutlineAtPoints(outline, hit1, hit2);

  const splitMap = buildSplitMap(outline, halfA, halfB, hit1, hit2);

  return { halfA, halfB, splitMap };
}

// --------------------------------------------------------------------------
// Internal: buildSplitMap
// --------------------------------------------------------------------------

/**
 * Build a SplitMap by matching commands from the split halves back to the
 * original outline.
 *
 * Strategy:
 * - The M command that opens each half is the cut point — not from the
 *   original outline → index -1.
 * - The closing L (back to the same cut point) and the Z at the end are also
 *   inserted → index -1.
 * - Any other command is matched against the original outline by type and
 *   values; on a match the original index is recorded.  If no match is found
 *   (split fragment of a bezier curve) we record -1.
 */
function buildSplitMap(
  outline: PathCommand[],
  halfA: PathCommand[],
  halfB: PathCommand[],
  hit1: OutlineHit,
  hit2: OutlineHit,
): SplitMap {
  const halfAIndices = mapHalfToIndices(outline, halfA);
  const halfBIndices = mapHalfToIndices(outline, halfB);

  return { halfAIndices, halfBIndices, hit1, hit2 };
}

/**
 * For each command in `half`, return the index of the matching command in
 * `outline`, or -1 if the command was inserted during splitting.
 *
 * "Inserted" commands are:
 * - The opening M (start of a half always starts at a cut point, not a
 *   vertex of the original outline).
 * - The closing L (the explicit return-to-start command that `splitOutlineAtPoints`
 *   adds before Z).
 * - Z.
 * - Any command whose type+values do not exactly match any original command
 *   (happens when a bezier was subdivided at the cut).
 *
 * Note: for simple polygon outlines (L-only) the closing L may coincide with
 * an original vertex — we still mark it -1 because it was synthesised by the
 * splitter, not taken verbatim from the source.
 */
function mapHalfToIndices(
  outline: PathCommand[],
  half: PathCommand[],
): number[] {
  const n = half.length;
  const indices: number[] = new Array(n).fill(-1);

  // Opening M and closing L + Z are always inserted
  // indices[0]  = -1  (M at cut point)
  // indices[n-2] = -1  (closing L back to M)
  // indices[n-1] = -1  (Z)

  // For the interior commands (1 … n-3), try to match against original outline
  for (let i = 1; i <= n - 3; i++) {
    const cmd = half[i];
    const match = findCommandInOutline(outline, cmd);
    indices[i] = match;
  }

  return indices;
}

/**
 * Search `outline` for a command whose type and values match `cmd` exactly.
 * Returns the index in `outline`, or -1 if not found.
 */
function findCommandInOutline(outline: PathCommand[], cmd: PathCommand): number {
  for (let i = 0; i < outline.length; i++) {
    const orig = outline[i];
    if (orig.type !== cmd.type) continue;
    if (orig.values.length !== cmd.values.length) continue;
    let match = true;
    for (let v = 0; v < orig.values.length; v++) {
      if (Math.abs(orig.values[v] - cmd.values[v]) > 1e-6) {
        match = false;
        break;
      }
    }
    if (match) return i;
  }
  return -1;
}
