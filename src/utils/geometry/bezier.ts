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

// ─── rdpSimplify ──────────────────────────────────────────────────────────────

/**
 * Ramer–Douglas–Peucker polyline simplification.
 * Returns a subset of `points` with collinear or near-collinear points removed.
 *
 * @param points - Input polyline (>= 2 points)
 * @param epsilon - Maximum perpendicular distance to keep a point (in the same units as points)
 */
export function rdpSimplify(points: Point2D[], epsilon: number): Point2D[] {
  if (points.length <= 2) return [...points];

  // Find the point with the maximum distance from the line start→end
  const start = points[0];
  const end = points[points.length - 1];
  let maxDist = 0;
  let maxIdx = 0;

  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    // Perpendicular distance from p to line (start, end)
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const len = Math.hypot(dx, dy);
    let dist: number;
    if (len < 1e-10) {
      dist = Math.hypot(p.x - start.x, p.y - start.y);
    } else {
      dist = Math.abs(dy * p.x - dx * p.y + end.x * start.y - end.y * start.x) / len;
    }
    if (dist > maxDist) {
      maxDist = dist;
      maxIdx = i;
    }
  }

  if (maxDist > epsilon) {
    const left = rdpSimplify(points.slice(0, maxIdx + 1), epsilon);
    const right = rdpSimplify(points.slice(maxIdx), epsilon);
    return [...left.slice(0, -1), ...right];
  }

  return [start, end];
}

// ─── fitCubicBezier ───────────────────────────────────────────────────────────

/**
 * Fit a sequence of cubic Bezier segments through the given points using the
 * chord-length parameterization and Schneider's algorithm (simplified).
 *
 * Returns PathCommand[] starting with an 'M' followed by 'C' segments.
 *
 * @param points - Ordered list of 2D points to fit (>= 2)
 * @param _tolerance - Fitting tolerance (reserved; future adaptive subdivision)
 */
export function fitCubicBezier(points: Point2D[], _tolerance = 1.0): import('../../types/types').PathCommand[] {
  if (points.length < 2) return [];

  // Compute chord-length parameterization
  const dists: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    dists.push(dists[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  }
  const totalLen = dists[dists.length - 1];
  const ts = totalLen > 0 ? dists.map(d => d / totalLen) : dists.map((_, i) => i / (points.length - 1));

  // For 2 points, emit a straight-line cubic (trivial)
  if (points.length === 2) {
    const p0 = points[0];
    const p3 = points[1];
    const cp1 = { x: p0.x + (p3.x - p0.x) / 3, y: p0.y + (p3.y - p0.y) / 3 };
    const cp2 = { x: p0.x + (p3.x - p0.x) * 2 / 3, y: p0.y + (p3.y - p0.y) * 2 / 3 };
    return [
      { type: 'M', values: [p0.x, p0.y] },
      { type: 'C', values: [cp1.x, cp1.y, cp2.x, cp2.y, p3.x, p3.y] },
    ];
  }

  // Fit a single cubic using least-squares (Schneider, Graphics Gems)
  // Tangents at endpoints: use first/last chord direction
  const p0 = points[0];
  const pN = points[points.length - 1];

  const t0 = { x: points[1].x - points[0].x, y: points[1].y - points[0].y };
  const tN = { x: points[points.length - 1].x - points[points.length - 2].x, y: points[points.length - 1].y - points[points.length - 2].y };
  const len0 = Math.hypot(t0.x, t0.y) || 1;
  const lenN = Math.hypot(tN.x, tN.y) || 1;
  const hat0 = { x: t0.x / len0, y: t0.y / len0 };
  const hatN = { x: tN.x / lenN, y: tN.y / lenN };

  // Build A matrices: A1[i] = B1(t)*hat0, A2[i] = B2(t)*hatN
  let c00 = 0, c01 = 0, c11 = 0;
  let x0 = 0, x1 = 0;

  for (let i = 0; i < points.length; i++) {
    const t = ts[i];
    const mt = 1 - t;
    const b0 = mt * mt * mt;
    const b1 = 3 * mt * mt * t;
    const b2 = 3 * mt * t * t;
    const b3 = t * t * t;

    const a1x = hat0.x * b1;
    const a1y = hat0.y * b1;
    const a2x = hatN.x * b2;
    const a2y = hatN.y * b2;

    c00 += a1x * a1x + a1y * a1y;
    c01 += a1x * a2x + a1y * a2y;
    c11 += a2x * a2x + a2y * a2y;

    const dx = points[i].x - (b0 * p0.x + b1 * p0.x + b2 * pN.x + b3 * pN.x);
    const dy = points[i].y - (b0 * p0.y + b1 * p0.y + b2 * pN.y + b3 * pN.y);

    x0 += a1x * dx + a1y * dy;
    x1 += a2x * dx + a2y * dy;
  }

  const det = c00 * c11 - c01 * c01;
  let alpha0: number, alpha1: number;
  if (Math.abs(det) < 1e-10) {
    // Fallback: chord-length heuristic
    const chord = Math.hypot(pN.x - p0.x, pN.y - p0.y) / 3;
    alpha0 = chord;
    alpha1 = chord;
  } else {
    alpha0 = (x0 * c11 - x1 * c01) / det;
    alpha1 = (x1 * c00 - x0 * c01) / det;
  }

  // Clamp negatives to chord-length fallback
  const chord = Math.hypot(pN.x - p0.x, pN.y - p0.y) / 3;
  if (alpha0 < 0) alpha0 = chord;
  if (alpha1 < 0) alpha1 = chord;

  const cp1 = { x: p0.x + hat0.x * alpha0, y: p0.y + hat0.y * alpha0 };
  const cp2 = { x: pN.x - hatN.x * alpha1, y: pN.y - hatN.y * alpha1 };

  return [
    { type: 'M', values: [p0.x, p0.y] },
    { type: 'C', values: [cp1.x, cp1.y, cp2.x, cp2.y, pN.x, pN.y] },
  ];
}
