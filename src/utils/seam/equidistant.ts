import type { Point2D } from '../../types/types';
import { AngleType, SAPoint } from './types';
import {
  createParallelLine,
  lineIntersection,
  bisectorLine,
  angleBetweenBisectors,
  distance,
  distanceSq,
  removeDuplicates,
  removePointsOnLine,
  isClockwise,
  ACCURACY,
} from './geometry';
import { checkLoops } from './checkLoops';

const MAX_L = 3.0;

export function maxLocalSA(point: SAPoint, defaultWidth: number): { before: number; after: number } {
  return {
    before: point.saBefore < 0 ? defaultWidth : point.saBefore,
    after: point.saAfter < 0 ? defaultWidth : point.saAfter,
  };
}

/**
 * Main equidistant algorithm. Takes SAPoints and returns offset polygon.
 */
export function equidistant(inputPoints: SAPoint[], defaultWidth: number): Point2D[] {
  if (defaultWidth <= 0 || inputPoints.length < 3) return [];

  // Clean points
  let points = removeDuplicates(inputPoints, ACCURACY) as SAPoint[];
  points = removePointsOnLine(points, ACCURACY) as SAPoint[];

  if (points.length < 3) return [];

  // Ensure CW winding in screen coords (Y down) for outward offset to the left
  if (!isClockwise(points)) {
    points = [...points].reverse();
    // Swap saBefore/saAfter since direction reversed
    points = points.map(p => ({
      ...p,
      saBefore: (p as SAPoint).saAfter,
      saAfter: (p as SAPoint).saBefore,
    }));
  }

  // Close path: ensure first != last
  const last = points[points.length - 1];
  if (distanceSq(points[0], last) < ACCURACY * ACCURACY) {
    points = points.slice(0, -1);
  }
  if (points.length < 3) return [];

  const n = points.length;
  const result: Point2D[] = [];

  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n];
    const curr = points[i];
    const next = points[(i + 1) % n];

    const sa = maxLocalSA(curr, defaultWidth);

    // Edge before: prev→curr, offset by saBefore
    const [sp1, sp2] = createParallelLine(prev, curr, sa.before);
    // Edge after: curr→next, offset by saAfter
    const [sp3, sp4] = createParallelLine(curr, next, sa.after);

    const cornerPoints = ekvPoint(prev, curr, curr, next, sp1, sp2, sp3, sp4, curr, sa.before, sa.after, defaultWidth);
    result.push(...cornerPoints);
  }

  // Close the result
  if (result.length > 0) {
    result.push({ ...result[0] });
  }

  return checkLoops(result);
}

/**
 * Core corner calculation. Determines offset point(s) at a vertex.
 */
function ekvPoint(
  p1: Point2D, p2Line1: Point2D,
  _p2Line2: Point2D, p3: Point2D,
  sp1: Point2D, sp2: Point2D,
  sp3: Point2D, sp4: Point2D,
  vertex: SAPoint,
  widthBefore: number, widthAfter: number,
  defaultWidth: number,
): Point2D[] {
  const ix = lineIntersection(sp1, sp2, sp3, sp4);

  if (ix.type === 'bounded') {
    return [ix.point];
  }

  if (ix.type === 'parallel' || ix.type === 'none') {
    // Parallel edges — just use the endpoint of the first offset line
    return [sp2];
  }

  // Unbounded intersection — check bisector direction
  const bis = bisectorLine(p1, p2Line1, p3);
  // Direction from vertex to intersection
  const toIx = {
    x: ix.point.x - p2Line1.x,
    y: ix.point.y - p2Line1.y,
  };
  const toIxLen = Math.sqrt(toIx.x * toIx.x + toIx.y * toIx.y);
  if (toIxLen < ACCURACY) return [ix.point];

  const toIxNorm = { x: toIx.x / toIxLen, y: toIx.y / toIxLen };
  const angle = angleBetweenBisectors(bis, toIxNorm);

  const width = Math.max(widthBefore, widthAfter);

  if (angle < Math.PI / 2) {
    // Same direction as bisector — convex corner, apply angle type handler
    return applyAngleType(p1, p2Line1, p3, sp1, sp2, sp3, sp4, ix.point, vertex, width, defaultWidth);
  } else {
    // Opposite direction — dart/concave case
    // For darts and very acute angles, just use the intersection but cap it
    const dist = distance(ix.point, p2Line1);
    if (dist > width * MAX_L) {
      // Too far — cut the corner
      return angleByLength(p2Line1, sp1, sp2, sp3, sp4, width);
    }
    return [ix.point];
  }
}

function applyAngleType(
  p1: Point2D, p2: Point2D, p3: Point2D,
  sp1: Point2D, sp2: Point2D, sp3: Point2D, sp4: Point2D,
  ixPoint: Point2D,
  vertex: SAPoint,
  width: number,
  _defaultWidth: number,
): Point2D[] {
  switch (vertex.angleType) {
    case AngleType.ByPointsIntersection:
      return angleByIntersection(p1, p2, p3, sp1, sp2, sp3, sp4, width);
    case AngleType.ByFirstEdgeSymmetry:
      return angleByFirstSymmetry(p1, p2, sp1, sp2, sp3, sp4, width);
    case AngleType.BySecondEdgeSymmetry:
      return angleBySecondSymmetry(p2, p3, sp1, sp2, sp3, sp4, width);
    case AngleType.ByFirstEdgeRightAngle:
      return angleByFirstRightAngle(p1, p2, sp1, sp2, sp3, sp4, width);
    case AngleType.BySecondEdgeRightAngle:
      return angleBySecondRightAngle(p2, p3, sp1, sp2, sp3, sp4, width);
    case AngleType.ByLength:
    default: {
      const dist = distance(ixPoint, p2);
      if (dist > width * MAX_L) {
        return angleByLength(p2, sp1, sp2, sp3, sp4, width);
      }
      return [ixPoint];
    }
  }
}

/**
 * ByLength: If offset point too far, cut with perpendicular at width distance.
 */
function angleByLength(
  p2: Point2D,
  sp1: Point2D, sp2: Point2D, sp3: Point2D, sp4: Point2D,
  _width: number,
): Point2D[] {
  // Project perpendicular from p2 onto each offset edge, find points at `width` distance
  const pt1 = closestPointOnLine(p2, sp1, sp2);
  const pt2 = closestPointOnLine(p2, sp3, sp4);
  
  if (pt1 && pt2) {
    return [pt1, pt2];
  }
  return [sp2];
}

/**
 * ByIntersection: extend original edges' offset lines to find intersection.
 */
function angleByIntersection(
  _p1: Point2D, _p2: Point2D, _p3: Point2D,
  sp1: Point2D, sp2: Point2D, sp3: Point2D, sp4: Point2D,
  _width: number,
): Point2D[] {
  const ix = lineIntersection(sp1, sp2, sp3, sp4);
  if (ix.type !== 'parallel' && ix.type !== 'none') {
    return [ix.point];
  }
  return [sp2];
}

/**
 * Mirror first edge across second offset edge direction.
 */
function angleByFirstSymmetry(
  _p1: Point2D, _p2: Point2D,
  _sp1: Point2D, sp2: Point2D, sp3: Point2D, sp4: Point2D,
  _width: number,
): Point2D[] {
  // Mirror sp2 across the line sp3→sp4
  const mirrored = mirrorPointAcrossLine(sp2, sp3, sp4);
  const ix = lineIntersection(sp3, sp4, sp2, mirrored);
  if (ix.type !== 'parallel' && ix.type !== 'none') {
    return [ix.point, sp2];
  }
  return [sp2];
}

/**
 * Mirror second edge across first offset edge direction.
 */
function angleBySecondSymmetry(
  _p2: Point2D, _p3: Point2D,
  sp1: Point2D, sp2: Point2D, sp3: Point2D, _sp4: Point2D,
  _width: number,
): Point2D[] {
  const mirrored = mirrorPointAcrossLine(sp3, sp1, sp2);
  const ix = lineIntersection(sp1, sp2, sp3, mirrored);
  if (ix.type !== 'parallel' && ix.type !== 'none') {
    return [sp3, ix.point];
  }
  return [sp3];
}

/**
 * Right angle from first edge offset.
 */
function angleByFirstRightAngle(
  _p1: Point2D, _p2: Point2D,
  sp1: Point2D, sp2: Point2D, sp3: Point2D, sp4: Point2D,
  width: number,
): Point2D[] {
  // From sp2, go perpendicular to first edge direction
  const dx = sp2.x - sp1.x;
  const dy = sp2.y - sp1.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < ACCURACY) return [sp2];

  const perpEnd: Point2D = {
    x: sp2.x + (-dy / len) * width,
    y: sp2.y + (dx / len) * width,
  };

  const ix = lineIntersection(sp3, sp4, sp2, perpEnd);
  if (ix.type !== 'parallel' && ix.type !== 'none') {
    return [sp2, ix.point];
  }
  return [sp2];
}

/**
 * Right angle from second edge offset.
 */
function angleBySecondRightAngle(
  _p2: Point2D, _p3: Point2D,
  sp1: Point2D, sp2: Point2D, sp3: Point2D, sp4: Point2D,
  width: number,
): Point2D[] {
  const dx = sp4.x - sp3.x;
  const dy = sp4.y - sp3.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < ACCURACY) return [sp3];

  const perpEnd: Point2D = {
    x: sp3.x + (dy / len) * width,
    y: sp3.y + (-dx / len) * width,
  };

  const ix = lineIntersection(sp1, sp2, sp3, perpEnd);
  if (ix.type !== 'parallel' && ix.type !== 'none') {
    return [ix.point, sp3];
  }
  return [sp3];
}

// ─── Helpers ───

function closestPointOnLine(p: Point2D, a: Point2D, b: Point2D): Point2D | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < ACCURACY * ACCURACY) return null;

  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  return {
    x: a.x + t * dx,
    y: a.y + t * dy,
  };
}

function mirrorPointAcrossLine(p: Point2D, a: Point2D, b: Point2D): Point2D {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < ACCURACY * ACCURACY) return { ...p };

  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  return {
    x: 2 * projX - p.x,
    y: 2 * projY - p.y,
  };
}
