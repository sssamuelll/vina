import type { PathCommand, Point2D, SemanticEdge } from '../../types/types';
import type { CornerType } from '../../types/types';
import { Clipper, Paths64, Path64, Point64 } from 'clipper2-js';
import { flattenPathWithSource } from './index';
import type { SourcedPoint } from './index';

// Clipper2 scale: integer coords at 100x for 0.01mm precision (same as index.ts)
const CLIPPER_SCALE = 100;

export interface Line2D {
  start: Point2D;
  end: Point2D;
}

/**
 * Compute the parallel offset of an edge by saWidth, perpendicular to the left
 * of the edge direction.
 *
 * For an edge going in direction (dx, dy), the left-perpendicular normal is
 * (-dy, dx) / length. Both endpoints are shifted by saWidth along that normal.
 *
 * If the edge has zero length, the original edge is returned unchanged.
 */
export function offsetEdge(edge: Line2D, saWidth: number): Line2D {
  const dx = edge.end.x - edge.start.x;
  const dy = edge.end.y - edge.start.y;
  const len = Math.sqrt(dx * dx + dy * dy);

  if (len < 1e-12) {
    return { start: { ...edge.start }, end: { ...edge.end } };
  }

  // Left-perpendicular normal in screen coords (Y-down): rotate direction 90° CW → (dy, -dx)
  // For a rightward edge (dx>0, dy=0) this gives normal (0, -saWidth) → shifts y upward (negative).
  // For an upward edge in screen-Y-down (dx=0, dy>0) this gives normal (saWidth, 0) → shifts x right.
  const nx = (dy / len) * saWidth;
  const ny = (-dx / len) * saWidth;

  return {
    start: { x: edge.start.x + nx, y: edge.start.y + ny },
    end: { x: edge.end.x + nx, y: edge.end.y + ny },
  };
}

/**
 * Find the intersection point of two infinite lines defined by their segments.
 * Returns null if the lines are parallel (cross product magnitude < 1e-10).
 *
 * Uses the standard parametric line-line intersection formula:
 *   P = start_a + t * dir_a  where t is solved via cross products.
 */
export function lineIntersection(a: Line2D, b: Line2D): Point2D | null {
  const dx1 = a.end.x - a.start.x;
  const dy1 = a.end.y - a.start.y;
  const dx2 = b.end.x - b.start.x;
  const dy2 = b.end.y - b.start.y;

  // Cross product of direction vectors (z-component of 3D cross)
  const cross = dx1 * dy2 - dy1 * dx2;

  if (Math.abs(cross) < 1e-10) {
    return null; // Parallel or coincident lines
  }

  // Vector from a.start to b.start
  const dx3 = b.start.x - a.start.x;
  const dy3 = b.start.y - a.start.y;

  const t = (dx3 * dy2 - dy3 * dx2) / cross;

  return {
    x: a.start.x + t * dx1,
    y: a.start.y + t * dy1,
  };
}

/**
 * Compute the interior angle (radians) between two edges at their shared vertex.
 *
 * Uses atan2(|cross|, dot) of the two edge direction vectors, yielding a value
 * in [0, PI]. Returns 0 for collinear same-direction edges and PI for antiparallel
 * (U-turn / 180° interior angle) edges.
 */
export function interiorAngle(prev: Line2D, next: Line2D): number {
  const ax = prev.end.x - prev.start.x;
  const ay = prev.end.y - prev.start.y;
  const bx = next.end.x - next.start.x;
  const by = next.end.y - next.start.y;

  const dot = ax * bx + ay * by;
  const cross = ax * by - ay * bx; // z-component of 3D cross product

  return Math.atan2(Math.abs(cross), dot);
}

/**
 * Compute the unit vector along the angle bisector at the shared vertex of
 * prev and next edges.
 *
 * Bisector = normalize(unit(prev_dir) + unit(next_dir)).
 * If the sum is near-zero (antiparallel, i.e. 180° turn back), falls back to
 * the left-perpendicular of prev.
 */
export function bisectorDirection(prev: Line2D, next: Line2D): Point2D {
  const ax = prev.end.x - prev.start.x;
  const ay = prev.end.y - prev.start.y;
  const aLen = Math.sqrt(ax * ax + ay * ay);

  const bx = next.end.x - next.start.x;
  const by = next.end.y - next.start.y;
  const bLen = Math.sqrt(bx * bx + by * by);

  // Normalize each direction; treat zero-length as (0,0)
  const uax = aLen > 1e-12 ? ax / aLen : 0;
  const uay = aLen > 1e-12 ? ay / aLen : 0;
  const ubx = bLen > 1e-12 ? bx / bLen : 0;
  const uby = bLen > 1e-12 ? by / bLen : 0;

  const sx = uax + ubx;
  const sy = uay + uby;
  const sLen = Math.sqrt(sx * sx + sy * sy);

  if (sLen < 1e-12) {
    // Antiparallel edges: fall back to left-perpendicular of prev direction
    return { x: -uay, y: uax };
  }

  return { x: sx / sLen, y: sy / sLen };
}

// ─── Corner Function Type ──────────────────────────────────────────────────

/**
 * A corner function takes the two adjacent offset edges at a vertex and
 * returns the array of geometry points that replace the standard miter.
 *
 * The two edges may be offset by DIFFERENT widths (per-edge seam allowance:
 * e.g. a 40mm hem meeting a 10mm armhole). Geometric corner types (mitered,
 * squared, slant, match) resolve the asymmetry directly from the offset edges;
 * scalar-factor types (doubleMitered, envelope, trimMirrored) use the mean of
 * the two widths. When prevWidth === nextWidth the geometry is identical to the
 * legacy single-width behavior.
 *
 * @param prevOffsetEdge - Offset line of the edge BEFORE this vertex (offset by prevWidth)
 * @param nextOffsetEdge - Offset line of the edge AFTER this vertex (offset by nextWidth)
 * @param vertex         - The piece outline vertex position
 * @param prevWidth      - Seam allowance width (mm) of the edge before this vertex
 * @param nextWidth      - Seam allowance width (mm) of the edge after this vertex
 * @param angle          - Interior angle at the vertex (radians)
 * @returns              - Ordered array of Point2D forming the corner geometry
 */
export type CornerFunction = (
  prevOffsetEdge: Line2D,
  nextOffsetEdge: Line2D,
  vertex: Point2D,
  prevWidth: number,
  nextWidth: number,
  angle: number,
) => Point2D[];

// ─── Helper: unit direction of a line ─────────────────────────────────────

function lineDir(line: Line2D): Point2D {
  const dx = line.end.x - line.start.x;
  const dy = line.end.y - line.start.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1e-12) return { x: 0, y: 0 };
  return { x: dx / len, y: dy / len };
}

// ─── cornerMitered ────────────────────────────────────────────────────────

/**
 * Standard miter: single intersection point of prevOffsetEdge and nextOffsetEdge.
 * Falls back to the endpoint of prevOffsetEdge when the lines are parallel.
 *
 * Returns 1 point.
 */
export function cornerMitered(
  prevOffsetEdge: Line2D,
  nextOffsetEdge: Line2D,
  _vertex: Point2D,
  _prevWidth: number,
  _nextWidth: number,
  _angle: number,
): Point2D[] {
  // Geometric: the intersection of the two offset edges already encodes their
  // (possibly different) offset distances — no width factor needed.
  const pt = lineIntersection(prevOffsetEdge, nextOffsetEdge);
  if (pt !== null) return [pt];
  // Parallel fallback: endpoint of prevOffsetEdge
  return [{ ...prevOffsetEdge.end }];
}

// ─── cornerDoubleMitered ──────────────────────────────────────────────────

/**
 * Double miter: compute the miter point, then back up toward the vertex along
 * the bisector by `saWidth * 0.3` and return two points symmetric about the
 * bisector at perpendicular distance `saWidth * 0.3`.
 *
 * Returns 2 points.
 */
export function cornerDoubleMitered(
  prevOffsetEdge: Line2D,
  nextOffsetEdge: Line2D,
  vertex: Point2D,
  prevWidth: number,
  nextWidth: number,
  _angle: number,
): Point2D[] {
  // Scalar setback uses the mean of the two widths (identical to legacy when equal).
  const saWidth = (prevWidth + nextWidth) / 2;
  // Reconstruct the original edges from vertex (approximate — use offset edge
  // directions since they are parallel to the originals).
  const prevDir = lineDir(prevOffsetEdge);
  const nextDir = lineDir(nextOffsetEdge);

  // Build proxy edges pointing away from vertex to get bisector direction.
  const prevProxy: Line2D = {
    start: vertex,
    end: { x: vertex.x + prevDir.x, y: vertex.y + prevDir.y },
  };
  const nextProxy: Line2D = {
    start: vertex,
    end: { x: vertex.x + nextDir.x, y: vertex.y + nextDir.y },
  };
  const bis = bisectorDirection(prevProxy, nextProxy);

  // Miter intersection point.
  const miter = cornerMitered(prevOffsetEdge, nextOffsetEdge, vertex, prevWidth, nextWidth, 0)[0];

  // Move from miter back toward vertex by saWidth * 0.3.
  // Use the actual direction from miter to vertex so that midPt stays on the
  // vertex→miter axis (the outward SA bisector), preserving bilateral symmetry.
  const depth = saWidth * 0.3;
  const mvx = vertex.x - miter.x;
  const mvy = vertex.y - miter.y;
  const mvLen = Math.sqrt(mvx * mvx + mvy * mvy);
  const mvDir: Point2D =
    mvLen > 1e-12 ? { x: mvx / mvLen, y: mvy / mvLen } : { x: -bis.x, y: -bis.y };
  const midPt: Point2D = {
    x: miter.x + mvDir.x * depth,
    y: miter.y + mvDir.y * depth,
  };

  // Perpendicular to the vertex→miter axis (i.e., perpendicular to mvDir).
  const perpX = -mvDir.y;
  const perpY = mvDir.x;

  return [
    { x: midPt.x - perpX * depth, y: midPt.y - perpY * depth },
    { x: midPt.x + perpX * depth, y: midPt.y + perpY * depth },
  ];
}

// ─── cornerSquared ────────────────────────────────────────────────────────

/**
 * Squared corner: right-angle box built from prevOffsetEdge.end through the
 * miter corner to nextOffsetEdge.start.
 *
 * Returns 3 points: [prevOffsetEdge.end, corner, nextOffsetEdge.start].
 */
export function cornerSquared(
  prevOffsetEdge: Line2D,
  nextOffsetEdge: Line2D,
  vertex: Point2D,
  prevWidth: number,
  nextWidth: number,
  angle: number,
): Point2D[] {
  // The "corner" is the right-angle intersection formed by extending
  // prevOffsetEdge.end perpendicular to the prev edge, and
  // nextOffsetEdge.start perpendicular to the next edge.
  //
  // We construct it as the miter intersection of:
  //   - A line through prevOffsetEdge.end in the direction of nextOffsetEdge
  //   - A line through nextOffsetEdge.start in the direction of prevOffsetEdge
  const prevDir = lineDir(prevOffsetEdge);
  const nextDir = lineDir(nextOffsetEdge);

  // Line through prevOffsetEdge.end extended along prevOffsetEdge direction.
  // This forms one side of the right-angle box.
  const lineA: Line2D = {
    start: prevOffsetEdge.end,
    end: {
      x: prevOffsetEdge.end.x + prevDir.x,
      y: prevOffsetEdge.end.y + prevDir.y,
    },
  };
  // Line through nextOffsetEdge.start extended along nextOffsetEdge direction.
  // This forms the other side of the right-angle box.
  const lineB: Line2D = {
    start: nextOffsetEdge.start,
    end: {
      x: nextOffsetEdge.start.x + nextDir.x,
      y: nextOffsetEdge.start.y + nextDir.y,
    },
  };

  const corner = lineIntersection(lineA, lineB);
  if (corner !== null) {
    return [{ ...prevOffsetEdge.end }, corner, { ...nextOffsetEdge.start }];
  }

  // Degenerate fallback: use the standard miter point
  const miter = cornerMitered(prevOffsetEdge, nextOffsetEdge, vertex, prevWidth, nextWidth, angle)[0];
  return [{ ...prevOffsetEdge.end }, miter, { ...nextOffsetEdge.start }];
}

// ─── cornerSlant ──────────────────────────────────────────────────────────

/**
 * Slant corner: a straight cut perpendicular to the angle bisector, passing
 * through the miter point. Returns the two intersections of this perpendicular
 * line with prevOffsetEdge and nextOffsetEdge.
 *
 * Returns 2 points.
 */
export function cornerSlant(
  prevOffsetEdge: Line2D,
  nextOffsetEdge: Line2D,
  vertex: Point2D,
  prevWidth: number,
  nextWidth: number,
  _angle: number,
): Point2D[] {
  // Geometric: the slant passes through the (asymmetric) miter; no width factor.
  const miter = cornerMitered(prevOffsetEdge, nextOffsetEdge, vertex, prevWidth, nextWidth, 0)[0];

  const prevDir = lineDir(prevOffsetEdge);
  const nextDir = lineDir(nextOffsetEdge);

  const prevProxy: Line2D = {
    start: vertex,
    end: { x: vertex.x + prevDir.x, y: vertex.y + prevDir.y },
  };
  const nextProxy: Line2D = {
    start: vertex,
    end: { x: vertex.x + nextDir.x, y: vertex.y + nextDir.y },
  };
  const bis = bisectorDirection(prevProxy, nextProxy);

  // Perpendicular to bisector direction
  const perpDir: Point2D = { x: -bis.y, y: bis.x };

  // Line through miter point with perpendicular-to-bisector direction
  const slantLine: Line2D = {
    start: miter,
    end: { x: miter.x + perpDir.x, y: miter.y + perpDir.y },
  };

  // Intersect slant line with prevOffsetEdge and nextOffsetEdge
  const ptPrev = lineIntersection(slantLine, prevOffsetEdge) ?? { ...prevOffsetEdge.end };
  const ptNext = lineIntersection(slantLine, nextOffsetEdge) ?? { ...nextOffsetEdge.start };

  return [ptPrev, ptNext];
}

// ─── cornerEnvelope ───────────────────────────────────────────────────────

/**
 * Envelope corner: extends both offset edges past their miter intersection
 * by `saWidth * 0.75` and connects the extended endpoints with a rectangular
 * tab along the bisector direction.
 *
 * Returns 4 points: [prevExtEnd, outerCorner1, outerCorner2, nextExtStart].
 */
export function cornerEnvelope(
  prevOffsetEdge: Line2D,
  nextOffsetEdge: Line2D,
  vertex: Point2D,
  prevWidth: number,
  nextWidth: number,
  _angle: number,
): Point2D[] {
  // Tab extension uses the mean width (identical to legacy when equal).
  const ext = ((prevWidth + nextWidth) / 2) * 0.75;
  const miter = cornerMitered(prevOffsetEdge, nextOffsetEdge, vertex, prevWidth, nextWidth, 0)[0];

  const prevDir = lineDir(prevOffsetEdge);
  const nextDir = lineDir(nextOffsetEdge);

  // Extend each offset edge past the miter by ext
  const prevExtEnd: Point2D = {
    x: miter.x + prevDir.x * ext,
    y: miter.y + prevDir.y * ext,
  };
  const nextExtStart: Point2D = {
    x: miter.x + nextDir.x * ext,
    y: miter.y + nextDir.y * ext,
  };

  // Build the outward bisector direction from vertex
  const prevProxy: Line2D = {
    start: vertex,
    end: { x: vertex.x + prevDir.x, y: vertex.y + prevDir.y },
  };
  const nextProxy: Line2D = {
    start: vertex,
    end: { x: vertex.x + nextDir.x, y: vertex.y + nextDir.y },
  };
  const bis = bisectorDirection(prevProxy, nextProxy);

  // Connect the two extended ends via two outer corners (rectangular tab)
  const outerCorner1: Point2D = {
    x: prevExtEnd.x + bis.x * ext,
    y: prevExtEnd.y + bis.y * ext,
  };
  const outerCorner2: Point2D = {
    x: nextExtStart.x + bis.x * ext,
    y: nextExtStart.y + bis.y * ext,
  };

  return [prevExtEnd, outerCorner1, outerCorner2, nextExtStart];
}

// ─── cornerMatch ──────────────────────────────────────────────────────────

/**
 * Match corner: identical to cornerMitered. The seam-lookup resolution
 * (pairing with the opposing piece's corner) happens at a higher level.
 *
 * Returns 1 point.
 */
export function cornerMatch(
  prevOffsetEdge: Line2D,
  nextOffsetEdge: Line2D,
  vertex: Point2D,
  prevWidth: number,
  nextWidth: number,
  angle: number,
): Point2D[] {
  return cornerMitered(prevOffsetEdge, nextOffsetEdge, vertex, prevWidth, nextWidth, angle);
}

// ─── cornerTrimMirrored ───────────────────────────────────────────────────

/**
 * Trim mirrored corner: compute the miter point, then trim equal amounts from
 * both sides along a line perpendicular to the bisector. The trim amount is
 * `saWidth * 0.2`. Returns 2 symmetric points about the bisector.
 *
 * Returns 2 points.
 */
export function cornerTrimMirrored(
  prevOffsetEdge: Line2D,
  nextOffsetEdge: Line2D,
  vertex: Point2D,
  prevWidth: number,
  nextWidth: number,
  _angle: number,
): Point2D[] {
  // Trim amount uses the mean width (identical to legacy when equal).
  const trimAmount = ((prevWidth + nextWidth) / 2) * 0.2;
  const miter = cornerMitered(prevOffsetEdge, nextOffsetEdge, vertex, prevWidth, nextWidth, 0)[0];

  const prevDir = lineDir(prevOffsetEdge);
  const nextDir = lineDir(nextOffsetEdge);

  const prevProxy: Line2D = {
    start: vertex,
    end: { x: vertex.x + prevDir.x, y: vertex.y + prevDir.y },
  };
  const nextProxy: Line2D = {
    start: vertex,
    end: { x: vertex.x + nextDir.x, y: vertex.y + nextDir.y },
  };
  const bis = bisectorDirection(prevProxy, nextProxy);

  // Perpendicular to bisector
  const perpX = -bis.y;
  const perpY = bis.x;

  return [
    { x: miter.x - perpX * trimAmount, y: miter.y - perpY * trimAmount },
    { x: miter.x + perpX * trimAmount, y: miter.y + perpY * trimAmount },
  ];
}

// ─── shiftCornerTypes ─────────────────────────────────────────────────────

/**
 * Shift corner type keys after an insert (+1) or remove (-1) operation on the
 * piece outline at `editIndex`.
 *
 * - Insert (delta = +1): keys >= editIndex are incremented by 1.
 * - Remove (delta = -1): the key at editIndex is dropped, keys > editIndex
 *   are decremented by 1.
 *
 * Keys below editIndex are left unchanged in both cases.
 */
export function shiftCornerTypes(
  cornerTypes: Record<number, CornerType>,
  editIndex: number,
  delta: number,
): Record<number, CornerType> {
  const result: Record<number, CornerType> = {};
  for (const [keyStr, value] of Object.entries(cornerTypes)) {
    const key = Number(keyStr);
    if (delta < 0 && key === editIndex) continue; // remove: skip deleted key
    if (key >= editIndex) {
      result[key + delta] = value;
    } else {
      result[key] = value;
    }
  }
  return result;
}

// ─── perEdgeWidths ────────────────────────────────────────────────────────

/**
 * Resolve the seam-allowance width of each flattened outline edge.
 *
 * For flattened edge `i` (from vertices[i] to vertices[(i+1)%n]), the owning
 * outline command is the source command of its END vertex — `vertexCmds[(i+1)%n]`
 * (the convention `detectSemanticEdges`/`sampleSegments` use: a segment is keyed
 * by the command that draws it). The SemanticEdge whose `segmentRange` [start,end)
 * covers that command supplies the width; everything else inherits `fallbackWidth`.
 *
 * When `semanticEdges` is absent or none sets `seamAllowanceWidth`, every edge
 * gets `fallbackWidth`, so the result is uniform and the generated SA is
 * byte-identical to the single-width path (zero regression).
 *
 * @param vertexCmds    source command index per flattened vertex (from flattenPathWithSource)
 * @param semanticEdges piece.edges; `segmentRange` is [start,end) in command space
 * @param fallbackWidth piece-level SA width (mm)
 */
export function perEdgeWidths(
  vertexCmds: number[],
  semanticEdges: SemanticEdge[] | undefined,
  fallbackWidth: number,
): number[] {
  const n = vertexCmds.length;
  const widths = new Array<number>(n).fill(fallbackWidth);
  if (!semanticEdges || semanticEdges.length === 0) return widths;

  // command index → per-edge width, for the edges that explicitly set one.
  const commandWidth = new Map<number, number>();
  for (const se of semanticEdges) {
    if (se.seamAllowanceWidth == null) continue;
    const [start, end] = se.segmentRange;
    for (let c = start; c < end; c++) commandWidth.set(c, se.seamAllowanceWidth);
  }
  if (commandWidth.size === 0) return widths;

  for (let i = 0; i < n; i++) {
    const owningCmd = vertexCmds[(i + 1) % n];
    const w = commandWidth.get(owningCmd);
    if (w != null) widths[i] = w;
  }
  return widths;
}

// ─── Matched corner ("Empatada") support ─────────────────────────────────
//
// A `match` corner slides the sewn border's cut-line endpoint at the vertex so
// the border's cut length equals `targetLen` (the partner border's cut length,
// resolved in matchResolver.ts). Base length is the border's mitered cut length;
// delta = targetLen − baseLen slides the endpoint (extend / retract) and the
// corner closes straight to the adjacent border's offset — the "necessary angle".

/** Which adjacent border of the match vertex is the sewn one, + its target cut length. */
export interface MatchTarget {
  /** 'prev' = incoming border (covers the vertex's command); 'next' = outgoing border. */
  side: 'prev' | 'next';
  /** Desired cut length (mm) of the sewn border. */
  targetLen: number;
}

/** Match resolution keyed by outline COMMAND index (same key space as cornerTypes). */
export type MatchLookup = Record<number, MatchTarget>;

/** The flattened + offset scaffolding the edge-walk operates on (Steps 1-3). */
export interface OffsetEdgeData {
  /** Flattened outline points (closing duplicate removed), tagged by source command. */
  sourced: SourcedPoint[];
  vertices: Point2D[];
  edges: Line2D[];
  edgeWidths: number[];
  offsetEdges: Line2D[];
  n: number;
}

/**
 * Flatten + build per-edge offsets for an outline (generator Steps 1-3),
 * factored out so the resolver can measure a partner border's cut length with
 * the exact same geometry the generator produces. Returns null for degenerate
 * outlines (< 3 vertices).
 */
export function buildOffsetEdges(
  outline: PathCommand[],
  saWidth: number,
  semanticEdges?: SemanticEdge[],
): OffsetEdgeData | null {
  const sourced = flattenPathWithSource(outline);
  if (sourced.length >= 2) {
    const first = sourced[0];
    const last = sourced[sourced.length - 1];
    if (Math.abs(first.x - last.x) < 1e-6 && Math.abs(first.y - last.y) < 1e-6) {
      sourced.pop();
    }
  }
  if (sourced.length < 3) return null;

  const vertices: Point2D[] = sourced.map((p) => ({ x: p.x, y: p.y }));
  const n = vertices.length;
  const edges: Line2D[] = [];
  for (let i = 0; i < n; i++) edges.push({ start: vertices[i], end: vertices[(i + 1) % n] });
  const edgeWidths = perEdgeWidths(sourced.map((p) => p.cmd), semanticEdges, saWidth);
  const offsetEdges = edges.map((e, i) => offsetEdge(e, edgeWidths[i]));
  return { sourced, vertices, edges, edgeWidths, offsetEdges, n };
}

/** Mitered corner point at flattened vertex k (matches cornerMitered, incl. its parallel fallback). */
function miterAt(offsetEdges: Line2D[], n: number, k: number): Point2D {
  const prev = offsetEdges[(k - 1 + n) % n];
  const next = offsetEdges[k % n];
  const pt = lineIntersection(prev, next);
  return pt ?? { ...prev.end };
}

function polylineLength(pts: Point2D[]): number {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return s;
}

/**
 * Flattened edge indices belonging to a SemanticEdge's command range, as a
 * sorted ascending run. Returns null when the range emits no edges or the run
 * is non-contiguous / wraps the polygon closure (caller falls back to mitered).
 * ponytail: wrap-spanning borders (closing edge) are the rare case; falling back
 * to mitered there is acceptable until a real garment needs it.
 */
function edgesInBorder(sourced: SourcedPoint[], n: number, range: [number, number]): number[] | null {
  const [start, end] = range;
  const run: number[] = [];
  for (let j = 0; j < n; j++) {
    const owningCmd = sourced[(j + 1) % n].cmd;
    if (owningCmd >= start && owningCmd < end) run.push(j);
  }
  if (run.length === 0) return null;
  run.sort((a, b) => a - b);
  if (run[run.length - 1] - run[0] + 1 !== run.length) return null; // gap / wrap
  return run;
}

/**
 * Length of a SemanticEdge's mitered cut line (the outward SA offset polyline),
 * built with the exact geometry `generateSeamAllowanceWithCorners` uses. Used by
 * matchResolver to read a partner border's target length. Corners are ALWAYS
 * mitered here — this is the one-level anti-recursion: measuring a partner never
 * re-resolves the partner's own `match` corners. Returns null when unmeasurable.
 */
export function measureBorderCutLength(
  outline: PathCommand[],
  saWidth: number,
  semanticEdges: SemanticEdge[] | undefined,
  segmentRange: [number, number],
): number | null {
  const data = buildOffsetEdges(outline, saWidth, semanticEdges);
  if (!data) return null;
  const run = edgesInBorder(data.sourced, data.n, segmentRange);
  if (!run) return null;
  const miters: Point2D[] = [];
  for (let k = run[0]; k <= run[run.length - 1] + 1; k++) miters.push(miterAt(data.offsetEdges, data.n, k % data.n));
  return polylineLength(miters);
}

/**
 * Slide the near endpoint of a mitered cut polyline (ordered far→near) to make
 * the total length `targetLen`. Returns the slid endpoint E and `lastRetainedIdx`
 * (the index of the last far-side miter kept before E). delta≥0 extends the last
 * segment colinearly; delta<0 walks back from the far end accumulating length,
 * clamped to keep ≥10% of the base. Returns null for a degenerate polyline.
 */
function slideMatchEndpoint(
  mitersFarToNear: Point2D[],
  targetLen: number,
): { E: Point2D; lastRetainedIdx: number } | null {
  const m = mitersFarToNear;
  const last = m.length - 1;
  if (last < 1) return null;

  const seg: number[] = [];
  let baseLen = 0;
  for (let p = 0; p < last; p++) {
    const l = Math.hypot(m[p + 1].x - m[p].x, m[p + 1].y - m[p].y);
    seg.push(l);
    baseLen += l;
  }
  if (baseLen < 1e-9) return null;

  if (targetLen >= baseLen) {
    // Extend beyond the near end along the last segment's direction.
    const l = seg[last - 1] || 1e-9;
    const ux = (m[last].x - m[last - 1].x) / l;
    const uy = (m[last].y - m[last - 1].y) / l;
    const extra = targetLen - baseLen;
    return { E: { x: m[last].x + ux * extra, y: m[last].y + uy * extra }, lastRetainedIdx: last - 1 };
  }

  // Retract; clamp to keep at least 10% of the base length.
  const target = Math.max(targetLen, 0.1 * baseLen);
  let acc = 0;
  for (let p = 0; p < last; p++) {
    if (acc + seg[p] >= target) {
      const t = (target - acc) / (seg[p] || 1e-9);
      return {
        E: { x: m[p].x + (m[p + 1].x - m[p].x) * t, y: m[p].y + (m[p + 1].y - m[p].y) * t },
        lastRetainedIdx: p,
      };
    }
    acc += seg[p];
  }
  return { E: { ...m[last - 1] }, lastRetainedIdx: last - 1 }; // numerical guard
}

/**
 * Resolve a `match` vertex into a map of per-vertex output-slot replacements.
 * Returns null → the vertex falls back to the mitered output already in `out[i]`
 * (missing border, wrap, degenerate). Operates entirely on `data.offsetEdges` —
 * independent of emit order, applied as a post-pass over the per-vertex arrays.
 *
 * The map rewrites three groups of slots:
 *  - The sewn border's own slots keep only their miter (the true cut line),
 *    dropping the redundant on-edge start point — those detour points are
 *    harmless under a full miter but poke through the retraction notch and
 *    make Clipper's largest-area pick drop the far corner.
 *  - Near-side corner slots the retraction consumes are emptied.
 *  - The match vertex slot carries the slid endpoint + the straight closure.
 */
function resolveMatchVertex(
  data: OffsetEdgeData,
  i: number,
  entry: MatchTarget,
  semanticEdges: SemanticEdge[],
): Map<number, Point2D[]> | null {
  const { sourced, offsetEdges, n } = data;
  const coveringCmd = entry.side === 'prev' ? sourced[i].cmd : sourced[(i + 1) % n].cmd;
  const border = semanticEdges.find(
    (e) => e.segmentRange[0] <= coveringCmd && coveringCmd < e.segmentRange[1],
  );
  if (!border) return null;
  const run = edgesInBorder(sourced, n, border.segmentRange);
  if (!run) return null;

  // Corner vertices spanning the border, oriented far → near (near = vertex i).
  let cornersFarToNear: number[];
  if (entry.side === 'prev') {
    if ((run[run.length - 1] + 1) % n !== i) return null; // border must end at this vertex
    cornersFarToNear = [];
    for (let k = run[0]; k <= run[run.length - 1] + 1; k++) cornersFarToNear.push(k % n);
  } else {
    if (run[0] % n !== i) return null; // border must start at this vertex
    const nearToFar: number[] = [];
    for (let k = run[0]; k <= run[run.length - 1] + 1; k++) nearToFar.push(k % n);
    cornersFarToNear = nearToFar.slice().reverse();
  }

  const miters = cornersFarToNear.map((k) => miterAt(offsetEdges, n, k));
  const slid = slideMatchEndpoint(miters, entry.targetLen);
  if (!slid) return null;

  const updates = new Map<number, Point2D[]>();
  // Sewn border slots → miter-only (strip the redundant on-edge detour point).
  for (const k of run) updates.set(k, [miterAt(offsetEdges, n, k)]);
  // Near-side corners past the retained endpoint are consumed.
  for (const v of cornersFarToNear.slice(slid.lastRetainedIdx + 1)) {
    if (v !== i) updates.set(v, []);
  }
  // The match vertex carries the slid endpoint and the straight closure.
  updates.set(
    i,
    entry.side === 'prev'
      ? [slid.E, { ...offsetEdges[i].start }] // cut endpoint, then close to the adjacent (next) offset
      : [{ ...offsetEdges[(i - 1 + n) % n].end }, slid.E], // adjacent (prev) offset, then close to cut endpoint
  );
  return updates;
}

// ─── generateSeamAllowanceWithCorners ─────────────────────────────────────

/**
 * Generate a seam allowance outline using an edge-walk algorithm with per-vertex
 * corner types. This replaces Clipper2's ClipperOffset for pieces that need
 * custom corner styles.
 *
 * Algorithm:
 *  1. Extract vertices from outline (M/L commands; skip Z).
 *  2. Build edges between consecutive vertex pairs (wrapping around).
 *  3. Offset each edge outward by saWidth (left-perpendicular).
 *  4. At each vertex, resolve the corner type and call the corner function to
 *     get the geometry points that join the two adjacent offset edges.
 *  5. Assemble the full outline: for each edge, emit the offset edge start
 *     followed by the corner geometry. Close with Z.
 *  6. Run Clipper2 SimplifyPaths to clean up any self-intersecting regions
 *     that can arise from concave corners.
 *
 * @param outline           Source path (M/L/Z commands)
 * @param saWidth           Seam allowance width in mm (must be > 0)
 * @param defaultCornerType Corner type used when a vertex has no explicit override
 * @param cornerTypes       Per-vertex overrides (key = vertex index in outline)
 * @param semanticEdges     Optional piece.edges — supplies per-edge SA widths via
 *                          `seamAllowanceWidth`; absent → uniform `saWidth`. Also
 *                          identifies the sewn border for `match` corners.
 * @param matchLookup       Optional `match`-corner resolution (command index →
 *                          {side, targetLen}, from matchResolver.buildMatchLookup).
 *                          Absent, or no entry for a vertex → mitered (byte-identical).
 */
export function generateSeamAllowanceWithCorners(
  outline: PathCommand[],
  saWidth: number,
  defaultCornerType: CornerType,
  cornerTypes: Record<number, CornerType>,
  semanticEdges?: SemanticEdge[],
  matchLookup?: MatchLookup,
): PathCommand[] {
  // ── Guard: degenerate inputs ──────────────────────────────────────────────
  if (saWidth <= 0) return [];

  // ── Steps 1-3: Flatten + build per-edge offsets ───────────────────────────
  // flattenPathWithSource linearizes C/Q/A commands so the edge-walk handles
  // curved outlines, tagging each point with its source command index (cornerTypes
  // is keyed by COMMAND index). Per-edge offsets carry the per-edge SA widths.
  const data = buildOffsetEdges(outline, saWidth, semanticEdges);
  if (!data) return [];
  const { sourced, vertices, edges, edgeWidths, offsetEdges, n } = data;

  // ── Step 4 + 5: Assemble the SA outline, one array of points per vertex ────
  // out[i] = [nextOffsetEdge.start, ...cornerGeometry]. Flattened in order this
  // is byte-identical to the legacy single-pass emit; the per-vertex structure
  // lets the `match` post-pass rewrite a vertex and trim the slots its
  // retraction consumes, without disturbing any other vertex.
  const out: Point2D[][] = [];

  for (let i = 0; i < n; i++) {
    const prevOffsetEdge = offsetEdges[(i + n - 1) % n];
    const nextOffsetEdge = offsetEdges[i];
    const vertex = vertices[i];

    const type: CornerType = cornerTypes[sourced[i].cmd] ?? defaultCornerType;
    const cornerFn = getCornerFunction(type);

    const prevEdge = edges[(i + n - 1) % n];
    const nextEdge = edges[i];
    const angle = interiorAngle(prevEdge, nextEdge);

    // prevWidth = incoming edge (i-1), nextWidth = outgoing edge (i).
    const prevWidth = edgeWidths[(i + n - 1) % n];
    const nextWidth = edgeWidths[i];
    const cornerPts = cornerFn(prevOffsetEdge, nextOffsetEdge, vertex, prevWidth, nextWidth, angle);

    out.push([{ ...nextOffsetEdge.start }, ...cornerPts]);
  }

  // ── Step 5b: Matched corners ──────────────────────────────────────────────
  // For each `match` vertex with a resolved target, slide the sewn border's
  // cut-line endpoint to the target length and close straight to the adjacent
  // border. Anything unresolved (no lookup, no entry, missing border) leaves the
  // mitered `out[i]` in place → byte-identical to today.
  if (matchLookup && semanticEdges) {
    for (let i = 0; i < n; i++) {
      if ((cornerTypes[sourced[i].cmd] ?? defaultCornerType) !== 'match') continue;
      const entry = matchLookup[sourced[i].cmd];
      if (!entry) continue;
      const resolved = resolveMatchVertex(data, i, entry, semanticEdges);
      if (!resolved) continue;
      for (const [slot, pts] of resolved) out[slot] = pts;
    }
  }

  const resultPoints: Point2D[] = out.flat();
  if (resultPoints.length < 3) return [];

  // ── Step 6: Self-intersection cleanup via Clipper2 SimplifyPaths ──────────
  // Convert to Clipper2 integer path
  const clipperPath = new Path64();
  for (const pt of resultPoints) {
    clipperPath.push(new Point64(
      Math.round(pt.x * CLIPPER_SCALE),
      Math.round(pt.y * CLIPPER_SCALE),
    ));
  }

  const inputPaths = new Paths64();
  inputPaths.push(clipperPath);

  // SimplifyPaths removes self-intersecting regions and collapses degenerate edges
  const simplified = Clipper.simplifyPaths(inputPaths, 0.01 * CLIPPER_SCALE, true);

  if (simplified.length === 0) {
    // Fallback: return raw assembled path without cleanup
    const commands: PathCommand[] = [
      { type: 'M', values: [resultPoints[0].x, resultPoints[0].y] },
    ];
    for (let i = 1; i < resultPoints.length; i++) {
      commands.push({ type: 'L', values: [resultPoints[i].x, resultPoints[i].y] });
    }
    commands.push({ type: 'Z', values: [] });
    return commands;
  }

  // Take the largest path by area (outermost polygon)
  let largest = simplified[0];
  let largestArea = 0;
  for (const path of simplified) {
    let area = 0;
    for (let i = 0, len = path.length; i < len; i++) {
      const j = (i + 1) % len;
      area += Number(path[i].x) * Number(path[j].y);
      area -= Number(path[j].x) * Number(path[i].y);
    }
    area = Math.abs(area);
    if (area > largestArea) {
      largestArea = area;
      largest = path;
    }
  }

  // Convert back to PathCommand[]
  const commands: PathCommand[] = [
    {
      type: 'M',
      values: [Number(largest[0].x) / CLIPPER_SCALE, Number(largest[0].y) / CLIPPER_SCALE],
    },
  ];
  for (let i = 1; i < largest.length; i++) {
    commands.push({
      type: 'L',
      values: [Number(largest[i].x) / CLIPPER_SCALE, Number(largest[i].y) / CLIPPER_SCALE],
    });
  }
  commands.push({ type: 'Z', values: [] });

  return commands;
}

// ─── getCornerFunction dispatcher ─────────────────────────────────────────

/**
 * Returns the corner geometry function for the given CornerType.
 */
export function getCornerFunction(type: CornerType): CornerFunction {
  switch (type) {
    case 'mitered':
      return cornerMitered;
    case 'doubleMitered':
      return cornerDoubleMitered;
    case 'squared':
      return cornerSquared;
    case 'slant':
      return cornerSlant;
    case 'envelope':
      return cornerEnvelope;
    case 'match':
      return cornerMatch;
    case 'trimMirrored':
      return cornerTrimMirrored;
  }
}
