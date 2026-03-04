import type { Point2D } from '../../types/types';

export interface LineSegmentHit {
  point: Point2D;
  t: number;
  segmentIndex: number;
}

/**
 * Find intersection of an infinite line (through p1, p2) with a finite segment (a, b).
 * Returns the intersection point and t parameter along the segment, or null if no intersection.
 */
export function lineSegmentIntersection(
  p1: Point2D,
  p2: Point2D,
  a: Point2D,
  b: Point2D,
): { point: Point2D; t: number } | null {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const ex = b.x - a.x;
  const ey = b.y - a.y;

  const denom = dx * ey - dy * ex;
  if (Math.abs(denom) < 1e-10) return null;

  const fx = a.x - p1.x;
  const fy = a.y - p1.y;

  const t = (fx * dy - fy * dx) / denom;
  if (t < -1e-10 || t > 1 + 1e-10) return null;

  const clampedT = Math.max(0, Math.min(1, t));
  return {
    point: {
      x: a.x + clampedT * ex,
      y: a.y + clampedT * ey,
    },
    t: clampedT,
  };
}

/**
 * Find all intersections of an infinite line (through p1, p2) with a polyline.
 * Returns hits sorted by distance from p1.
 */
export function linePolylineIntersections(
  p1: Point2D,
  p2: Point2D,
  polyline: Point2D[],
): LineSegmentHit[] {
  const hits: LineSegmentHit[] = [];

  for (let i = 0; i < polyline.length - 1; i++) {
    const result = lineSegmentIntersection(p1, p2, polyline[i], polyline[i + 1]);
    if (result) {
      const isDup = hits.some(
        h => Math.hypot(h.point.x - result.point.x, h.point.y - result.point.y) < 0.01,
      );
      if (!isDup) {
        hits.push({ ...result, segmentIndex: i });
      }
    }
  }

  const ldx = p2.x - p1.x;
  const ldy = p2.y - p1.y;
  hits.sort((a, b) => {
    const da = (a.point.x - p1.x) * ldx + (a.point.y - p1.y) * ldy;
    const db = (b.point.x - p1.x) * ldx + (b.point.y - p1.y) * ldy;
    return da - db;
  });

  return hits;
}
