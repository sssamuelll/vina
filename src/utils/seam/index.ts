import type { PathCommand, Point2D } from '../../types/types';
import { AngleType, SAPoint } from './types';
import { equidistant } from './equidistant';
import { ClipperOffset, Path64, Point64, Paths64, JoinType, EndType } from 'clipper2-js';

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

// Clipper2 scale: integer coords at 100x for 0.01mm precision
const CLIPPER_SCALE = 100;

export type SeamJoinType = 'round' | 'miter' | 'square';

/**
 * Convert outline PathCommand[] + width → offset PathCommand[] using Clipper2.
 *
 * Uses Clipper2's robust polygon offsetting which correctly handles:
 * - Concave corners (no self-intersections)
 * - Acute angles (proper miter limiting)
 * - Complex shapes with loops
 *
 * @param outline  Source path commands
 * @param width    Seam allowance width in mm (positive = outward)
 * @param joinType Corner style: 'round' (default, best for fabric), 'miter', or 'square'
 */
export function generateSeamAllowance(
  outline: PathCommand[],
  width: number,
  joinType: SeamJoinType = 'round',
): PathCommand[] {
  if (width <= 0) return [];

  const flat = flattenPath(outline);
  if (flat.length < 3) return [];

  // Remove closing duplicate if present
  const last = flat[flat.length - 1];
  const pts = (Math.abs(flat[0].x - last.x) < 0.001 && Math.abs(flat[0].y - last.y) < 0.001)
    ? flat.slice(0, -1)
    : flat;

  if (pts.length < 3) return [];

  // Convert to Clipper2 integer path
  const clipperPath = new Path64();
  for (const p of pts) {
    clipperPath.push(new Point64(
      Math.round(p.x * CLIPPER_SCALE),
      Math.round(p.y * CLIPPER_SCALE),
    ));
  }

  // Map join type
  const jt = joinType === 'miter' ? JoinType.Miter
    : joinType === 'square' ? JoinType.Square
    : JoinType.Round;

  const co = new ClipperOffset();
  co.addPath(clipperPath, jt, EndType.Polygon);

  const result = new Paths64();
  co.execute(width * CLIPPER_SCALE, result);

  if (result.length === 0) return [];

  // Take the largest path (outer offset)
  let largest = result[0];
  let largestArea = 0;
  for (const path of result) {
    let area = 0;
    for (let i = 0, n = path.length; i < n; i++) {
      const j = (i + 1) % n;
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
    { type: 'M', values: [Number(largest[0].x) / CLIPPER_SCALE, Number(largest[0].y) / CLIPPER_SCALE] },
  ];
  for (let i = 1; i < largest.length; i++) {
    commands.push({ type: 'L', values: [Number(largest[i].x) / CLIPPER_SCALE, Number(largest[i].y) / CLIPPER_SCALE] });
  }
  commands.push({ type: 'Z', values: [] });

  return commands;
}

/**
 * Legacy equidistant-based seam allowance (kept for per-point SA width control).
 * Use generateSeamAllowance for standard uniform-width offsets.
 */
export function generateSeamAllowanceLegacy(outline: PathCommand[], width: number): PathCommand[] {
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
