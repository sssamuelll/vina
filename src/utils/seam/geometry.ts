import type { Point2D } from '../../types/types';

export const ACCURACY = 0.001;
const ACCURACY_SQ = ACCURACY * ACCURACY;

export function distanceSq(p1: Point2D, p2: Point2D): number {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return dx * dx + dy * dy;
}

export function distance(p1: Point2D, p2: Point2D): number {
  return Math.sqrt(distanceSq(p1, p2));
}

export type IntersectionType = 'bounded' | 'unbounded' | 'none' | 'parallel';

export interface IntersectionResult {
  point: Point2D;
  type: IntersectionType;
}

/**
 * Create a parallel line offset to the LEFT of direction p1→p2 by `width`.
 * Returns [offsetP1, offsetP2].
 */
export function createParallelLine(p1: Point2D, p2: Point2D, width: number): [Point2D, Point2D] {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < ACCURACY) {
    return [{ x: p1.x, y: p1.y }, { x: p2.x, y: p2.y }];
  }
  const nx = -dy / len * width;
  const ny = dx / len * width;
  return [
    { x: p1.x + nx, y: p1.y + ny },
    { x: p2.x + nx, y: p2.y + ny },
  ];
}

/**
 * Line-line intersection. Distinguishes bounded (within both segments),
 * unbounded (on extended lines), none, and parallel.
 */
export function lineIntersection(a1: Point2D, a2: Point2D, b1: Point2D, b2: Point2D): IntersectionResult {
  const d1x = a2.x - a1.x;
  const d1y = a2.y - a1.y;
  const d2x = b2.x - b1.x;
  const d2y = b2.y - b1.y;

  const denom = d1x * d2y - d1y * d2x;

  if (Math.abs(denom) < 1e-10) {
    return { point: { x: 0, y: 0 }, type: 'parallel' };
  }

  const dx = b1.x - a1.x;
  const dy = b1.y - a1.y;
  const t = (dx * d2y - dy * d2x) / denom;
  const u = (dx * d1y - dy * d1x) / denom;

  const point: Point2D = {
    x: a1.x + t * d1x,
    y: a1.y + t * d1y,
  };

  const EPS = -ACCURACY;
  const bounded = t >= EPS && t <= 1 + ACCURACY && u >= EPS && u <= 1 + ACCURACY;

  return { point, type: bounded ? 'bounded' : 'unbounded' };
}

/**
 * Bisector direction at vertex p2 (from p1→p2→p3).
 * Returns a unit vector pointing in the bisector direction.
 */
export function bisectorLine(p1: Point2D, p2: Point2D, p3: Point2D): Point2D {
  const d1 = distance(p1, p2);
  const d2 = distance(p3, p2);
  if (d1 < ACCURACY || d2 < ACCURACY) {
    return { x: 0, y: -1 };
  }
  // Unit vectors from p2 toward p1 and p3
  const u1x = (p1.x - p2.x) / d1;
  const u1y = (p1.y - p2.y) / d1;
  const u2x = (p3.x - p2.x) / d2;
  const u2y = (p3.y - p2.y) / d2;

  let bx = u1x + u2x;
  let by = u1y + u2y;
  const bLen = Math.sqrt(bx * bx + by * by);
  if (bLen < ACCURACY) {
    // 180° angle, bisector is perpendicular to edge
    bx = -(p3.y - p1.y);
    by = p3.x - p1.x;
    const pLen = Math.sqrt(bx * bx + by * by);
    if (pLen < ACCURACY) return { x: 0, y: -1 };
    return { x: bx / pLen, y: by / pLen };
  }
  return { x: bx / bLen, y: by / bLen };
}

/**
 * Angle between two direction vectors (in radians, 0 to PI).
 */
export function angleBetweenBisectors(b1: Point2D, b2: Point2D): number {
  const dot = b1.x * b2.x + b1.y * b2.y;
  return Math.acos(Math.max(-1, Math.min(1, dot)));
}

/**
 * Check if point p lies on segment lineStart→lineEnd within tolerance.
 */
export function pointOnLine(p: Point2D, lineStart: Point2D, lineEnd: Point2D, tolerance: number = ACCURACY): boolean {
  const d1 = distance(lineStart, p);
  const d2 = distance(p, lineEnd);
  const d = distance(lineStart, lineEnd);
  return Math.abs(d1 + d2 - d) < tolerance;
}

/**
 * Shoelace formula. Returns true if polygon is clockwise (in screen coords where Y is down).
 */
export function isClockwise(points: Point2D[]): boolean {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const curr = points[i];
    const next = points[(i + 1) % points.length];
    sum += (next.x - curr.x) * (next.y + curr.y);
  }
  return sum > 0;
}

/**
 * Remove consecutive duplicate points.
 */
export function removeDuplicates(points: Point2D[], tolerance: number = ACCURACY): Point2D[] {
  if (points.length < 2) return [...points];
  const result: Point2D[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    if (distanceSq(points[i], result[result.length - 1]) > tolerance * tolerance) {
      result.push(points[i]);
    }
  }
  return result;
}

/**
 * Remove collinear points (points that lie on the line between their neighbors).
 */
export function removePointsOnLine(points: Point2D[], tolerance: number = ACCURACY): Point2D[] {
  if (points.length < 3) return [...points];
  const result: Point2D[] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    if (!pointOnLine(points[i], points[i - 1], points[i + 1], tolerance)) {
      result.push(points[i]);
    }
  }
  result.push(points[points.length - 1]);
  return result;
}
