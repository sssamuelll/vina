import type { PathCommand, Point2D, InternalLine, Dart } from '../../types/types';
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

// --------------------------------------------------------------------------
// flattenPathToPoints
// --------------------------------------------------------------------------

/**
 * Extract coordinate pairs from a PathCommand[] into an ordered Point2D[].
 *
 * Rules per command type:
 * - M, L → (values[0], values[1])
 * - H    → (values[0], last y)
 * - V    → (last x, values[0])
 * - C    → control points ignored; only end point (values[4], values[5])
 * - S    → end point (values[2], values[3])
 * - Q    → end point (values[2], values[3])
 * - T    → end point (values[0], values[1])
 * - A    → end point (values[5], values[6])
 * - Z    → closes back to first point (appended if distinct from last)
 */
export function flattenPathToPoints(cmds: PathCommand[]): Point2D[] {
  const pts: Point2D[] = [];
  let cx = 0;
  let cy = 0;
  let startX = 0;
  let startY = 0;

  for (const cmd of cmds) {
    switch (cmd.type) {
      case 'M':
        cx = cmd.values[0];
        cy = cmd.values[1];
        startX = cx;
        startY = cy;
        pts.push({ x: cx, y: cy });
        break;
      case 'L':
        cx = cmd.values[0];
        cy = cmd.values[1];
        pts.push({ x: cx, y: cy });
        break;
      case 'H':
        cx = cmd.values[0];
        pts.push({ x: cx, y: cy });
        break;
      case 'V':
        cy = cmd.values[0];
        pts.push({ x: cx, y: cy });
        break;
      case 'C':
        // Cubic bezier: (x1 y1 x2 y2 x y) — take endpoint only
        cx = cmd.values[4];
        cy = cmd.values[5];
        pts.push({ x: cx, y: cy });
        break;
      case 'S':
        // Smooth cubic bezier: (x2 y2 x y)
        cx = cmd.values[2];
        cy = cmd.values[3];
        pts.push({ x: cx, y: cy });
        break;
      case 'Q':
        // Quadratic bezier: (x1 y1 x y)
        cx = cmd.values[2];
        cy = cmd.values[3];
        pts.push({ x: cx, y: cy });
        break;
      case 'T':
        // Smooth quadratic: (x y)
        cx = cmd.values[0];
        cy = cmd.values[1];
        pts.push({ x: cx, y: cy });
        break;
      case 'A':
        // Arc: (rx ry x-rot large-arc sweep x y)
        cx = cmd.values[5];
        cy = cmd.values[6];
        pts.push({ x: cx, y: cy });
        break;
      case 'Z':
        // Close path — add start point only if it differs from last
        if (pts.length === 0 || pts[pts.length - 1].x !== startX || pts[pts.length - 1].y !== startY) {
          pts.push({ x: startX, y: startY });
        }
        cx = startX;
        cy = startY;
        break;
    }
  }

  return pts;
}

// --------------------------------------------------------------------------
// pointInPolygon
// --------------------------------------------------------------------------

/**
 * Ray-casting point-in-polygon test.
 *
 * Flattens `polygon` (PathCommand[]) to a Point2D[] vertex list, then casts a
 * horizontal ray from `point` to +∞ and counts edge crossings.  An odd count
 * means the point is inside.
 *
 * Points exactly on an edge return `true` (counted as inside) via the
 * standard up-crossing convention.
 */
export function pointInPolygon(point: Point2D, polygon: PathCommand[]): boolean {
  const verts = flattenPathToPoints(polygon);
  // Remove duplicate closing vertex if present
  const n = verts.length;
  if (n < 3) return false;

  const { x, y } = point;
  let inside = false;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = verts[i].x;
    const yi = verts[i].y;
    const xj = verts[j].x;
    const yj = verts[j].y;

    // Standard ray-casting: ray goes right (+x direction)
    const intersects =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;

    if (intersects) inside = !inside;
  }

  return inside;
}

// --------------------------------------------------------------------------
// samplePointsAlongPath
// --------------------------------------------------------------------------

/**
 * Sample `count` evenly-spaced points along the flattened polyline of `path`.
 *
 * Samples are spaced by equal arc-length increments from t=0 to t=1, where
 * t=0 is the first point and t=1 is the last.  For a single-segment line the
 * samples are simply linearly interpolated.
 */
function samplePointsAlongPath(path: PathCommand[], count: number): Point2D[] {
  const pts = flattenPathToPoints(path);
  if (pts.length === 0) return [];
  if (pts.length === 1 || count === 1) {
    // Return midpoint or first point
    return [pts[0]];
  }

  // Build cumulative arc-length table
  const lengths: number[] = [0];
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i - 1].x;
    const dy = pts[i].y - pts[i - 1].y;
    lengths.push(lengths[i - 1] + Math.sqrt(dx * dx + dy * dy));
  }
  const total = lengths[lengths.length - 1];
  if (total === 0) {
    // All points identical — return same point `count` times
    return Array.from({ length: count }, () => ({ ...pts[0] }));
  }

  const samples: Point2D[] = [];
  for (let k = 0; k < count; k++) {
    const targetLen = (k / (count - 1)) * total;
    // Binary search for the segment containing targetLen
    let lo = 0;
    let hi = lengths.length - 1;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (lengths[mid] <= targetLen) lo = mid;
      else hi = mid;
    }
    const segLen = lengths[hi] - lengths[lo];
    const t = segLen === 0 ? 0 : (targetLen - lengths[lo]) / segLen;
    samples.push({
      x: pts[lo].x + t * (pts[hi].x - pts[lo].x),
      y: pts[lo].y + t * (pts[hi].y - pts[lo].y),
    });
  }

  return samples;
}

// --------------------------------------------------------------------------
// classifyInternals
// --------------------------------------------------------------------------

/**
 * Classify each internal line into the half that contains the majority of 5
 * evenly-spaced sample points along the line's flattened path.
 *
 * If both halves receive an equal sample count the line is assigned to halfA.
 */
export function classifyInternals(
  internals: InternalLine[],
  halfA: PathCommand[],
  halfB: PathCommand[],
): { internalsA: InternalLine[]; internalsB: InternalLine[] } {
  const internalsA: InternalLine[] = [];
  const internalsB: InternalLine[] = [];

  const SAMPLE_COUNT = 5;

  for (const line of internals) {
    const samples = samplePointsAlongPath(line.path, SAMPLE_COUNT);

    let countA = 0;
    let countB = 0;
    for (const pt of samples) {
      if (pointInPolygon(pt, halfA)) countA++;
      if (pointInPolygon(pt, halfB)) countB++;
    }

    if (countB > countA) {
      internalsB.push(line);
    } else {
      internalsA.push(line);
    }
  }

  return { internalsA, internalsB };
}

// --------------------------------------------------------------------------
// classifyDarts
// --------------------------------------------------------------------------

/**
 * Classify each dart into the half that contains its apex point.
 *
 * If the apex lies in neither half (e.g. exactly on the boundary where both
 * ray-casts return false) the dart is assigned to halfA.
 */
export function classifyDarts(
  darts: Dart[],
  _halfA: PathCommand[],
  halfB: PathCommand[],
): { dartsA: Dart[]; dartsB: Dart[] } {
  const dartsA: Dart[] = [];
  const dartsB: Dart[] = [];

  for (const dart of darts) {
    const inB = pointInPolygon(dart.apex, halfB);
    if (inB) {
      dartsB.push(dart);
    } else {
      dartsA.push(dart);
    }
  }

  return { dartsA, dartsB };
}
