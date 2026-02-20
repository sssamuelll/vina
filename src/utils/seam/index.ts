import type { PathCommand, Point2D } from '../../types/types';
import { AngleType, SAPoint } from './types';
import { equidistant } from './equidistant';

export { AngleType } from './types';
export type { SAPoint, SeamAllowanceOptions } from './types';
export { equidistant, maxLocalSA } from './equidistant';
export { checkLoops } from './checkLoops';
export {
  createParallelLine,
  lineIntersection,
  bisectorLine,
  angleBetweenBisectors,
  pointOnLine,
  isClockwise,
  removeDuplicates,
  removePointsOnLine,
  distanceSq,
  distance,
  ACCURACY,
} from './geometry';

const CURVE_RESOLUTION = 12;

/**
 * Flatten PathCommand[] (including curves) to Point2D[].
 */
export function flattenPath(commands: PathCommand[], resolution: number = CURVE_RESOLUTION): Point2D[] {
  const points: Point2D[] = [];
  let cx = 0, cy = 0;
  let startX = 0, startY = 0;

  for (const cmd of commands) {
    switch (cmd.type) {
      case 'M':
        cx = cmd.values[0];
        cy = cmd.values[1];
        startX = cx;
        startY = cy;
        points.push({ x: cx, y: cy });
        break;
      case 'L':
        cx = cmd.values[0];
        cy = cmd.values[1];
        points.push({ x: cx, y: cy });
        break;
      case 'H':
        cx = cmd.values[0];
        points.push({ x: cx, y: cy });
        break;
      case 'V':
        cy = cmd.values[0];
        points.push({ x: cx, y: cy });
        break;
      case 'C': {
        const [x1, y1, x2, y2, x3, y3] = cmd.values;
        for (let i = 1; i <= resolution; i++) {
          const t = i / resolution;
          const mt = 1 - t;
          points.push({
            x: mt * mt * mt * cx + 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t * t * t * x3,
            y: mt * mt * mt * cy + 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t * y3,
          });
        }
        cx = x3;
        cy = y3;
        break;
      }
      case 'Q': {
        const [qx1, qy1, qx2, qy2] = cmd.values;
        for (let i = 1; i <= resolution; i++) {
          const t = i / resolution;
          const mt = 1 - t;
          points.push({
            x: mt * mt * cx + 2 * mt * t * qx1 + t * t * qx2,
            y: mt * mt * cy + 2 * mt * t * qy1 + t * t * qy2,
          });
        }
        cx = qx2;
        cy = qy2;
        break;
      }
      case 'Z':
        if (Math.abs(cx - startX) > 0.001 || Math.abs(cy - startY) > 0.001) {
          points.push({ x: startX, y: startY });
        }
        cx = startX;
        cy = startY;
        break;
      default:
        // S, T, A — simplified: treat as line to endpoint
        if (cmd.values.length >= 2) {
          cx = cmd.values[cmd.values.length - 2];
          cy = cmd.values[cmd.values.length - 1];
          points.push({ x: cx, y: cy });
        }
        break;
    }
  }

  return points;
}

/**
 * Convert outline PathCommand[] + width → offset PathCommand[].
 */
export function generateSeamAllowance(outline: PathCommand[], width: number): PathCommand[] {
  if (width <= 0) return [];

  const flat = flattenPath(outline);
  if (flat.length < 3) return [];

  const saPoints: SAPoint[] = flat.map(p => ({
    x: p.x,
    y: p.y,
    saBefore: -1,
    saAfter: -1,
    angleType: AngleType.ByLength,
  }));

  const offsetPoints = equidistant(saPoints, width);
  if (offsetPoints.length < 2) return [];

  const result: PathCommand[] = [
    { type: 'M', values: [offsetPoints[0].x, offsetPoints[0].y] },
  ];
  for (let i = 1; i < offsetPoints.length; i++) {
    result.push({ type: 'L', values: [offsetPoints[i].x, offsetPoints[i].y] });
  }
  result.push({ type: 'Z', values: [] });

  return result;
}

/**
 * Advanced: per-point SA control.
 */
export function generateSeamAllowanceAdvanced(points: SAPoint[], defaultWidth: number): Point2D[] {
  return equidistant(points, defaultWidth);
}
