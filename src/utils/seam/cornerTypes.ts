import type { Point2D } from '../../types/types';
import type { CornerType } from '../../types/types';

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
 * @param prevOffsetEdge - Offset line of the edge BEFORE this vertex
 * @param nextOffsetEdge - Offset line of the edge AFTER this vertex
 * @param vertex         - The piece outline vertex position
 * @param saWidth        - Seam allowance width in mm
 * @param angle          - Interior angle at the vertex (radians)
 * @returns              - Ordered array of Point2D forming the corner geometry
 */
export type CornerFunction = (
  prevOffsetEdge: Line2D,
  nextOffsetEdge: Line2D,
  vertex: Point2D,
  saWidth: number,
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
  _saWidth: number,
  _angle: number,
): Point2D[] {
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
  saWidth: number,
  _angle: number,
): Point2D[] {
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
  const miter = cornerMitered(prevOffsetEdge, nextOffsetEdge, vertex, saWidth, 0)[0];

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
  saWidth: number,
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
  const miter = cornerMitered(prevOffsetEdge, nextOffsetEdge, vertex, saWidth, angle)[0];
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
  saWidth: number,
  _angle: number,
): Point2D[] {
  const miter = cornerMitered(prevOffsetEdge, nextOffsetEdge, vertex, saWidth, 0)[0];

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
  saWidth: number,
  _angle: number,
): Point2D[] {
  const ext = saWidth * 0.75;
  const miter = cornerMitered(prevOffsetEdge, nextOffsetEdge, vertex, saWidth, 0)[0];

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
  saWidth: number,
  angle: number,
): Point2D[] {
  return cornerMitered(prevOffsetEdge, nextOffsetEdge, vertex, saWidth, angle);
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
  saWidth: number,
  _angle: number,
): Point2D[] {
  const trimAmount = saWidth * 0.2;
  const miter = cornerMitered(prevOffsetEdge, nextOffsetEdge, vertex, saWidth, 0)[0];

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
