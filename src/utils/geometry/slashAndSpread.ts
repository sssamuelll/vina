import type { PathCommand, Point2D, InternalLine, Dart, SemanticEdge, PatternPiece } from '../../types/types';
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
// SpreadHalfResult
// --------------------------------------------------------------------------

/**
 * Result returned by the spread transformation functions.
 * Contains the transformed outline, internals, and darts for one half.
 */
export interface SpreadHalfResult {
  outline: PathCommand[];
  internals: InternalLine[];
  darts: Dart[];
}

// --------------------------------------------------------------------------
// Internal rotation / translation helpers
// --------------------------------------------------------------------------

/**
 * Rotate a single point counter-clockwise around a pivot by angleDeg degrees.
 */
function rotatePoint(pt: Point2D, pivot: Point2D, angleDeg: number): Point2D {
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = pt.x - pivot.x;
  const dy = pt.y - pivot.y;
  return {
    x: pivot.x + dx * cos - dy * sin,
    y: pivot.y + dx * sin + dy * cos,
  };
}

/**
 * Rotate all coordinate pairs in a PathCommand[] counter-clockwise around
 * a pivot by angleDeg degrees.  Each pair of consecutive values is treated
 * as an (x, y) coordinate, so H/V commands with a single value are left
 * untouched (they are absolute-axis commands that don't pair naturally).
 */
function rotateCommands(cmds: PathCommand[], pivot: Point2D, angleDeg: number): PathCommand[] {
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  return cmds.map(cmd => {
    if (cmd.values.length === 0) {
      // Z — no coordinates
      return { ...cmd };
    }

    const newValues = [...cmd.values];

    // Rotate every (x, y) pair in the values array
    for (let i = 0; i + 1 < newValues.length; i += 2) {
      const dx = newValues[i] - pivot.x;
      const dy = newValues[i + 1] - pivot.y;
      newValues[i] = pivot.x + dx * cos - dy * sin;
      newValues[i + 1] = pivot.y + dx * sin + dy * cos;
    }

    return { type: cmd.type, values: newValues };
  });
}

/**
 * Translate all coordinate pairs in a PathCommand[] by (dx, dy).
 */
function translateCommands(cmds: PathCommand[], dx: number, dy: number): PathCommand[] {
  return cmds.map(cmd => {
    if (cmd.values.length === 0) {
      // Z — no coordinates
      return { ...cmd };
    }

    const newValues = [...cmd.values];

    // Translate every (x, y) pair in the values array
    for (let i = 0; i + 1 < newValues.length; i += 2) {
      newValues[i] += dx;
      newValues[i + 1] += dy;
    }

    return { type: cmd.type, values: newValues };
  });
}

// --------------------------------------------------------------------------
// applyPivotSpread
// --------------------------------------------------------------------------

/**
 * Rotate a half-outline, its internals, and darts counter-clockwise around
 * `pivot` by `angleDeg` degrees.
 *
 * This is used in "pivot spread" mode: one half stays fixed, the other is
 * rotated around a point on the slash line (typically one of the two
 * intersection points).
 *
 * @param half      - PathCommand[] for the half to transform
 * @param internals - InternalLines belonging to this half
 * @param darts     - Darts belonging to this half
 * @param pivot     - Rotation centre
 * @param angleDeg  - Counter-clockwise angle in degrees
 * @returns SpreadHalfResult with all geometry rotated
 */
export function applyPivotSpread(
  half: PathCommand[],
  internals: InternalLine[],
  darts: Dart[],
  pivot: Point2D,
  angleDeg: number,
): SpreadHalfResult {
  const outline = rotateCommands(half, pivot, angleDeg);

  const rotatedInternals: InternalLine[] = internals.map(line => ({
    ...line,
    path: rotateCommands(line.path, pivot, angleDeg),
  }));

  const rotatedDarts: Dart[] = darts.map(dart => ({
    ...dart,
    apex: rotatePoint(dart.apex, pivot, angleDeg),
    legs: dart.legs.map(leg => leg.map(pt => rotatePoint(pt, pivot, angleDeg))) as [Point2D[], Point2D[]],
  }));

  return { outline, internals: rotatedInternals, darts: rotatedDarts };
}

// --------------------------------------------------------------------------
// applyParallelSpread
// --------------------------------------------------------------------------

/**
 * Translate a half-outline, its internals, and darts perpendicular to the
 * slash direction by `distance` units.
 *
 * This is used in "parallel spread" mode: the half slides sideways away
 * from the slash line rather than rotating.
 *
 * The perpendicular direction is computed as:
 *   perp = (-slashDir.y / |slashDir|, slashDir.x / |slashDir|)
 * so the translation is always to the left of the slash direction.
 *
 * @param half           - PathCommand[] for the half to transform
 * @param internals      - InternalLines belonging to this half
 * @param darts          - Darts belonging to this half
 * @param slashDirection - Unit-ish vector along the slash line
 * @param distance       - Distance to translate perpendicular to slash
 * @returns SpreadHalfResult with all geometry translated
 */
export function applyParallelSpread(
  half: PathCommand[],
  internals: InternalLine[],
  darts: Dart[],
  slashDirection: Point2D,
  distance: number,
): SpreadHalfResult {
  const len = Math.sqrt(slashDirection.x ** 2 + slashDirection.y ** 2);
  const safeLen = len === 0 ? 1 : len;

  const dx = (slashDirection.y / safeLen) * distance;
  const dy = (-slashDirection.x / safeLen) * distance;

  const outline = translateCommands(half, dx, dy);

  const translatedInternals: InternalLine[] = internals.map(line => ({
    ...line,
    path: translateCommands(line.path, dx, dy),
  }));

  const translatedDarts: Dart[] = darts.map(dart => ({
    ...dart,
    apex: { x: dart.apex.x + dx, y: dart.apex.y + dy },
    legs: dart.legs.map(leg =>
      leg.map(pt => ({ x: pt.x + dx, y: pt.y + dy }))
    ) as [Point2D[], Point2D[]],
  }));

  return { outline, internals: translatedInternals, darts: translatedDarts };
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

// --------------------------------------------------------------------------
// mergeSpreadHalves
// --------------------------------------------------------------------------

/**
 * Result returned by `mergeSpreadHalves`.
 */
export interface MergeResult {
  /** The merged closed outline (starts with M, ends with Z). */
  outline: PathCommand[];
  /** How many new commands were inserted at each gap. */
  gapCommandCount: number;
}

/**
 * Get the endpoint of a PathCommand given the current cursor position.
 * Returns { x, y } of the endpoint.
 */
function cmdEndpoint(cmd: PathCommand, cx: number, cy: number, sx: number, sy: number): Point2D {
  switch (cmd.type) {
    case 'M':
    case 'L':
      return { x: cmd.values[0], y: cmd.values[1] };
    case 'H':
      return { x: cmd.values[0], y: cy };
    case 'V':
      return { x: cx, y: cmd.values[0] };
    case 'C':
      return { x: cmd.values[4], y: cmd.values[5] };
    case 'S':
      return { x: cmd.values[2], y: cmd.values[3] };
    case 'Q':
      return { x: cmd.values[2], y: cmd.values[3] };
    case 'T':
      return { x: cmd.values[0], y: cmd.values[1] };
    case 'A':
      return { x: cmd.values[5], y: cmd.values[6] };
    case 'Z':
      return { x: sx, y: sy };
    default:
      if (cmd.values.length >= 2) {
        return { x: cmd.values[cmd.values.length - 2], y: cmd.values[cmd.values.length - 1] };
      }
      return { x: cx, y: cy };
  }
}

/**
 * Extract the "body" edge commands from a closed split half, stripping the
 * opening M, the trailing Z, and the last edge command (the slash-line
 * closing segment that returns from the last body point back to M).
 *
 * A split half has the structure:
 *   M(cutPoint) [body edges…] L(cutPoint) Z
 *
 * We remove:
 * - commands[0]  — the M
 * - commands[n-1] — the Z
 * - commands[n-2] — the slash-line closer (last L back to M)
 *
 * Returns also the start point (M coords) and the point just before the
 * slash-line closer (the last body point), which are the two gap endpoints
 * for this half.
 */
function extractBodyEdges(half: PathCommand[]): {
  bodyEdges: PathCommand[];
  startPt: Point2D;   // M point (= one gap endpoint)
  endPt: Point2D;     // point just before slash-close (= other gap endpoint)
  prevEndPt: Point2D; // point two steps before slash-close (for tangent)
} {
  const mCmd = half[0];
  const startPt: Point2D = { x: mCmd.values[0], y: mCmd.values[1] };

  // Edge commands are indices 1 … n-3 (strip M at 0, slash-closer at n-2, Z at n-1)
  // n-2 is the slash-line closer; n-3 and earlier are body edges.
  const bodyEdges = half.slice(1, half.length - 2);

  // Walk to find the endpoint of the last body edge (endPt) and the one before
  // it (prevEndPt), needed for Catmull-Rom tangents.
  let cx = startPt.x;
  let cy = startPt.y;
  let prevX = cx;
  let prevY = cy;

  for (const cmd of bodyEdges) {
    const ep = cmdEndpoint(cmd, cx, cy, startPt.x, startPt.y);
    prevX = cx;
    prevY = cy;
    cx = ep.x;
    cy = ep.y;
  }

  return {
    bodyEdges,
    startPt,
    endPt: { x: cx, y: cy },
    prevEndPt: { x: prevX, y: prevY },
  };
}

/**
 * Build gap-fill commands from `fromPt` to `toPt` using the given strategy.
 *
 * For `'straight'`: single `L` command.
 * For `'smooth'`: Catmull-Rom → cubic bezier.
 *   p0 = prevFrom (the point before fromPt, provides outgoing tangent)
 *   p1 = fromPt
 *   p2 = toPt
 *   p3 = nextTo (the point after toPt, provides incoming tangent)
 *
 * Catmull-Rom control points:
 *   cp1 = p1 + (p2 - p0) / 6
 *   cp2 = p2 - (p3 - p1) / 6
 */
function buildGapFill(
  fromPt: Point2D,
  toPt: Point2D,
  prevFrom: Point2D,
  nextTo: Point2D,
  gapFill: 'straight' | 'smooth',
): PathCommand[] {
  if (gapFill === 'straight') {
    return [{ type: 'L', values: [toPt.x, toPt.y] }];
  }

  // Smooth: Catmull-Rom → cubic bezier
  const cp1x = fromPt.x + (toPt.x - prevFrom.x) / 6;
  const cp1y = fromPt.y + (toPt.y - prevFrom.y) / 6;
  const cp2x = toPt.x - (nextTo.x - fromPt.x) / 6;
  const cp2y = toPt.y - (nextTo.y - fromPt.y) / 6;

  return [
    {
      type: 'C',
      values: [cp1x, cp1y, cp2x, cp2y, toPt.x, toPt.y],
    },
  ];
}

/**
 * Merge two spread halves back into a single closed outline, filling the two
 * gaps with either straight lines or smooth cubic bezier curves.
 *
 * Each half must be a closed PathCommand[] in the form:
 *   M(cutPoint) [body edges…] L(cutPoint) Z
 *
 * Algorithm:
 * 1. Extract body edges from each half (remove M, slash-closer L, and Z).
 * 2. Identify the four gap endpoints:
 *      gap 1: halfA.endPt → halfB.startPt
 *      gap 2: halfB.endPt → halfA.startPt
 * 3. Build:  M(halfA.startPt) body-A gap-fill-1 body-B gap-fill-2 Z
 *
 * @param halfA    First closed half (starts with M, ends with Z)
 * @param halfB    Second closed half (starts with M, ends with Z)
 * @param gapFill  'straight' for L commands, 'smooth' for C commands
 */
export function mergeSpreadHalves(
  halfA: PathCommand[],
  halfB: PathCommand[],
  gapFill: 'straight' | 'smooth',
): MergeResult {
  const a = extractBodyEdges(halfA);
  const b = extractBodyEdges(halfB);

  // Gap 1: from end of halfA body → start of halfB body
  // Gap 2: from end of halfB body → start of halfA body (closes the loop)

  // For Catmull-Rom tangents we need neighbouring points:
  //   gap-1 incoming: the point just before a.endPt → a.prevEndPt
  //   gap-1 outgoing: the first endpoint of halfB body edges after b.startPt
  //   gap-2 incoming: the point just before b.endPt → b.prevEndPt
  //   gap-2 outgoing: the first endpoint of halfA body edges after a.startPt

  // Compute the point after b.startPt in halfB body (for smooth gap-1)
  const nextToGap1 = b.bodyEdges.length > 0
    ? cmdEndpoint(b.bodyEdges[0], b.startPt.x, b.startPt.y, b.startPt.x, b.startPt.y)
    : b.endPt;

  // Compute the point after a.startPt in halfA body (for smooth gap-2)
  const nextToGap2 = a.bodyEdges.length > 0
    ? cmdEndpoint(a.bodyEdges[0], a.startPt.x, a.startPt.y, a.startPt.x, a.startPt.y)
    : a.endPt;

  const gap1 = buildGapFill(a.endPt, b.startPt, a.prevEndPt, nextToGap1, gapFill);
  const gap2 = buildGapFill(b.endPt, a.startPt, b.prevEndPt, nextToGap2, gapFill);

  const outline: PathCommand[] = [
    { type: 'M', values: [a.startPt.x, a.startPt.y] },
    ...a.bodyEdges,
    ...gap1,
    ...b.bodyEdges,
    ...gap2,
    { type: 'Z', values: [] },
  ];

  return {
    outline,
    gapCommandCount: gap1.length,
  };
}

// --------------------------------------------------------------------------
// rebuildSemanticEdges
// --------------------------------------------------------------------------

/**
 * Rebuild semantic edge segment ranges after a slash-and-spread operation.
 *
 * The split produces two halves.  The "static" half keeps the same outline
 * indices as before.  The "spread" half has its commands shifted in the
 * merged outline because the gap-fill commands were inserted between the two
 * halves — so every original index in the spread half must be offset by
 * `gapCommandCount`.
 *
 * Classification strategy:
 * - An edge is considered to belong to halfA if the first index of its
 *   segmentRange appears among the original-command indices recorded in
 *   `splitMap.halfAIndices` (excluding -1 entries which are inserted).
 * - Similarly for halfB via `splitMap.halfBIndices`.
 * - If neither half claims the edge (the index doesn't appear in either set),
 *   the edge is returned unchanged (fallback / out-of-range graceful preserve).
 *
 * @param originalEdges  - SemanticEdge[] from the original piece
 * @param splitMap       - SplitMap produced by splitOutlineAtSlash
 * @param gapCommandCount - Number of commands inserted per gap (from MergeResult)
 * @param selectedHalf   - Which half was spread ('A' or 'B')
 * @returns New SemanticEdge[] with adjusted segmentRange values
 */
export function rebuildSemanticEdges(
  originalEdges: SemanticEdge[],
  splitMap: SplitMap,
  gapCommandCount: number,
  selectedHalf: 'A' | 'B',
): SemanticEdge[] {
  // Build sets of original command indices present in each half.
  // We exclude -1 (inserted commands) because they have no original counterpart.
  const halfAOriginals = new Set(splitMap.halfAIndices.filter(i => i !== -1));
  const halfBOriginals = new Set(splitMap.halfBIndices.filter(i => i !== -1));

  // The "spread" half is the one the user moved; the "static" half stayed put.
  const spreadOriginals = selectedHalf === 'A' ? halfAOriginals : halfBOriginals;

  return originalEdges.map(edge => {
    const [start, end] = edge.segmentRange;

    // Determine membership using the start index of the range.
    // If the start index is in the spread half → offset the range.
    if (spreadOriginals.has(start)) {
      return {
        ...edge,
        segmentRange: [start + gapCommandCount, end + gapCommandCount] as [number, number],
      };
    }

    // Static half or not found in either half → preserve as-is.
    return edge;
  });
}

// --------------------------------------------------------------------------
// buildSpreadPiece
// --------------------------------------------------------------------------

/**
 * Top-level orchestrator: apply a slash-and-spread operation to a pattern
 * piece and return a new PatternPiece with all geometry updated.
 *
 * Algorithm:
 * 1. Split the outline at the two hit points.
 * 2. Classify internals and darts into each half.
 * 3. Determine static vs. moving half based on `selectedHalf`.
 * 4. Apply the spread transform to the moving half.
 * 5. Merge the static and spread results back into a single outline.
 * 6. Rebuild semantic edge ranges.
 * 7. Return a new PatternPiece (same id) with all updated fields.
 *
 * @param piece         - Source pattern piece
 * @param hit1          - First slash intersection
 * @param hit2          - Second slash intersection
 * @param selectedHalf  - Which half to spread ('A' or 'B')
 * @param pivotEnd      - Which hit to use as pivot ('start' = hit1, 'end' = hit2)
 * @param spreadAmount  - Degrees (pivot) or mm (parallel)
 * @param mode          - 'pivot' or 'parallel'
 * @param gapFill       - 'straight' or 'smooth' gap bridging
 * @returns New PatternPiece with spread applied
 */
export function buildSpreadPiece(
  piece: PatternPiece,
  hit1: OutlineHit,
  hit2: OutlineHit,
  selectedHalf: 'A' | 'B',
  pivotEnd: 'start' | 'end',
  spreadAmount: number,
  mode: 'pivot' | 'parallel',
  gapFill: 'straight' | 'smooth',
): PatternPiece {
  // ── Step 1: Split ──────────────────────────────────────────────────────────
  const { halfA, halfB, splitMap } = splitOutlineAtSlash(piece.outline, hit1, hit2);

  // ── Step 2: Classify internals ────────────────────────────────────────────
  const { internalsA, internalsB } = classifyInternals(piece.internals, halfA, halfB);

  // ── Step 3: Classify darts ────────────────────────────────────────────────
  const { dartsA, dartsB } = classifyDarts(piece.darts ?? [], halfA, halfB);

  // ── Step 4: Determine static vs. moving halves ────────────────────────────
  let staticHalf: PathCommand[];
  let moveHalf: PathCommand[];
  let staticInternals: InternalLine[];
  let moveInternals: InternalLine[];
  let staticDarts: Dart[];
  let moveDarts: Dart[];

  if (selectedHalf === 'A') {
    staticHalf = halfB;
    moveHalf = halfA;
    staticInternals = internalsB;
    moveInternals = internalsA;
    staticDarts = dartsB;
    moveDarts = dartsA;
  } else {
    staticHalf = halfA;
    moveHalf = halfB;
    staticInternals = internalsA;
    moveInternals = internalsB;
    staticDarts = dartsA;
    moveDarts = dartsB;
  }

  // ── Step 5: Apply spread transform ───────────────────────────────────────
  let spreadResult: SpreadHalfResult;

  if (mode === 'pivot') {
    // Pivot point: hit1 = 'start', hit2 = 'end'
    const pivot: Point2D = pivotEnd === 'start' ? hit1.point : hit2.point;
    spreadResult = applyPivotSpread(moveHalf, moveInternals, moveDarts, pivot, spreadAmount);
  } else {
    // Parallel: compute slash direction from hit1 → hit2
    const slashDir: Point2D = {
      x: hit2.point.x - hit1.point.x,
      y: hit2.point.y - hit1.point.y,
    };
    spreadResult = applyParallelSpread(moveHalf, moveInternals, moveDarts, slashDir, spreadAmount);
  }

  // ── Step 6: Merge halves ──────────────────────────────────────────────────
  // Static half is halfA in the merge call, spread result is halfB.
  // This ordering ensures the merged outline starts at the static-half cut point.
  const { outline: mergedOutline, gapCommandCount } = mergeSpreadHalves(
    staticHalf,
    spreadResult.outline,
    gapFill,
  );

  // ── Step 7: Rebuild semantic edges ────────────────────────────────────────
  const newEdges = rebuildSemanticEdges(
    piece.edges ?? [],
    splitMap,
    gapCommandCount,
    selectedHalf,
  );

  // ── Step 8: Assemble result piece ─────────────────────────────────────────
  return {
    ...piece,
    // Same identity
    id: piece.id,
    name: piece.name,
    // Updated geometry
    outline: mergedOutline,
    internals: [...staticInternals, ...spreadResult.internals],
    darts: [...staticDarts, ...spreadResult.darts],
    edges: newEdges.length > 0 ? newEdges : piece.edges,
    // Break symmetry/instance link — spread creates a standalone piece
    linkedPieceId: undefined,
    linkMode: undefined,
    // Refresh timestamp
    updatedAt: Date.now(),
  };
}
