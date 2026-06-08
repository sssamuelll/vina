import type { PathCommand, Point2D, SemanticEdge } from '../../types/types';

/** Distance from point p to segment a→b. */
function distToSegment(p: Point2D, a: Point2D, b: Point2D): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * Pick the SemanticEdge nearest a click point (piece-local coords), for the
 * seam-allowance tool's per-edge width gesture.
 *
 * Finds the nearest outline segment by COMMAND index (the same index space
 * `detectSemanticEdges`/`segmentRange` use — curves use their endpoint chord,
 * matching the detector), then returns the SemanticEdge whose segmentRange
 * [start,end) covers that command. Returns null when the click is beyond
 * `maxDist`, or the nearest segment has no covering edge (e.g. the closing
 * edge of an implicitly-closed outline, which carries no SemanticEdge).
 */
export function pickEdgeForSeamAllowance(
  outline: PathCommand[],
  edges: SemanticEdge[],
  point: Point2D,
  maxDist: number,
): SemanticEdge | null {
  if (!edges.length) return null;

  let bestCmd = -1;
  let bestDist = Infinity;
  let cx = 0, cy = 0;

  for (let i = 0; i < outline.length; i++) {
    const cmd = outline[i];
    let ex = cx, ey = cy;
    switch (cmd.type) {
      case 'M': ex = cmd.values[0]; ey = cmd.values[1]; cx = ex; cy = ey; continue;
      case 'L': ex = cmd.values[0]; ey = cmd.values[1]; break;
      case 'H': ex = cmd.values[0]; break;
      case 'V': ey = cmd.values[0]; break;
      case 'C': ex = cmd.values[4]; ey = cmd.values[5]; break;
      case 'Q': ex = cmd.values[2]; ey = cmd.values[3]; break;
      default: continue; // Z and others: no addressable segment
    }
    const d = distToSegment(point, { x: cx, y: cy }, { x: ex, y: ey });
    if (d < bestDist) { bestDist = d; bestCmd = i; }
    cx = ex; cy = ey;
  }

  if (bestCmd < 0 || bestDist > maxDist) return null;
  return edges.find((e) => e.segmentRange[0] <= bestCmd && bestCmd < e.segmentRange[1]) ?? null;
}
