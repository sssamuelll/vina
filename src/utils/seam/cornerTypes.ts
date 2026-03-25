import type { Point2D } from '../../types/types';

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
