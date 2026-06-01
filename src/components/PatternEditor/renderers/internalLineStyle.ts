import type { PathCommand, Point2D } from '../../../types/types';

/**
 * Apex of a dart, for drawing the point marker (design surface 5, P0.3).
 *
 * A dart path is a V/triangle (`M legBase1 L apex L legBase2`). The apex is the
 * vertex farthest from the chord joining the first and last path points — robust
 * whether the dart is stored as a 3-point V, a legged dart, or a curved-cap dart.
 * Returns null for paths too short to have a distinct apex.
 */
export function dartApexPoint(path: PathCommand[]): Point2D | null {
  const pts = endpointsOf(path);
  if (pts.length < 3) return null;

  const a = pts[0];
  const b = pts[pts.length - 1];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;

  let best: Point2D | null = null;
  let bestDist = -1;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i];
    const dist = lenSq === 0
      ? Math.hypot(p.x - a.x, p.y - a.y)
      : Math.abs(dy * (p.x - a.x) - dx * (p.y - a.y)) / Math.sqrt(lenSq);
    if (dist > bestDist) {
      bestDist = dist;
      best = p;
    }
  }
  return best;
}

/** Vertex endpoints of a path (ignores curve control points, keeps anchor points). */
function endpointsOf(path: PathCommand[]): Point2D[] {
  const pts: Point2D[] = [];
  for (const cmd of path) {
    const v = cmd.values;
    switch (cmd.type) {
      case 'M':
      case 'L':
        pts.push({ x: v[0], y: v[1] });
        break;
      case 'C':
        pts.push({ x: v[4], y: v[5] });
        break;
      case 'Q':
        pts.push({ x: v[2], y: v[3] });
        break;
      default:
        break;
    }
  }
  return pts;
}
