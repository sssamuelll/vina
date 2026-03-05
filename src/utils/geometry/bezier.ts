import type { Point2D } from '../../types/types';
import { distToSegmentWithT } from './distance';

/** Scalar linear interpolation. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Linear interpolation between two 2D points. */
export function lerp2D(a: Point2D, b: Point2D, t: number): Point2D {
  return {
    x: a.x + t * (b.x - a.x),
    y: a.y + t * (b.y - a.y),
  };
}

/** Evaluate a cubic Bezier curve at parameter t (Bernstein polynomial). */
export function evalCubic(p0: Point2D, p1: Point2D, p2: Point2D, p3: Point2D, t: number): Point2D {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const t2 = t * t;
  return {
    x: mt2 * mt * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t2 * t * p3.x,
    y: mt2 * mt * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t2 * t * p3.y,
  };
}

/** Evaluate a quadratic Bezier curve at parameter t. */
export function evalQuadratic(p0: Point2D, p1: Point2D, p2: Point2D, t: number): Point2D {
  const mt = 1 - t;
  return {
    x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
    y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y,
  };
}

/**
 * Compute distance from point (px,py) to a curve defined by evalFn.
 * Samples N points along the curve and tests each polyline segment.
 */
export function distToBezier(
  px: number, py: number,
  evalFn: (t: number) => Point2D,
  samples: number,
): { distance: number; t: number; point: Point2D } {
  let bestDist = Infinity;
  let bestT = 0;
  let bestPoint: Point2D = { x: 0, y: 0 };

  let prev = evalFn(0);
  for (let i = 1; i <= samples; i++) {
    const tCurr = i / samples;
    const curr = evalFn(tCurr);
    const seg = distToSegmentWithT(px, py, prev.x, prev.y, curr.x, curr.y);

    if (seg.distance < bestDist) {
      bestDist = seg.distance;
      const tPrev = (i - 1) / samples;
      bestT = tPrev + seg.t * (tCurr - tPrev);
      bestPoint = seg.point;
    }

    prev = curr;
  }

  return { distance: bestDist, t: bestT, point: bestPoint };
}
