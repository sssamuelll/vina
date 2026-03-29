import type { PatternPiece, Point2D } from '../../types/types';
import { flattenPath } from '../seam/index';

/**
 * Interpolate a parametric position (t: 0–1) along a named semantic edge.
 * Uses the same flattenPath + segmentRange model as edgeLengthMM in the BOM extractor
 * for path representation consistency (see spec diagnostic #1–2).
 */
export function interpolateEdgePoint(
  piece: PatternPiece,
  edgeName: string,
  t: number,
): { point: Point2D; tangent: Point2D } | null {
  const edge = piece.edges?.find(e => e.name === edgeName);
  if (!edge) return null;

  const pts = flattenPath(piece.outline);
  const n = pts.length;
  if (n < 2) return null;

  const start = Math.max(0, Math.min(edge.segmentRange[0], n - 1));
  const end = Math.max(0, Math.min(edge.segmentRange[1], n - 1));

  // Collect edge segment points
  const edgePts: Point2D[] = [];
  let i = start;
  edgePts.push(pts[i]);
  while (i !== end) {
    i = (i + 1) % n;
    edgePts.push(pts[i]);
    if (edgePts.length > n + 1) break; // safety
  }

  if (edgePts.length < 2) return null;

  // Compute cumulative arc lengths
  const cumLen: number[] = [0];
  for (let j = 1; j < edgePts.length; j++) {
    const dx = edgePts[j].x - edgePts[j - 1].x;
    const dy = edgePts[j].y - edgePts[j - 1].y;
    cumLen.push(cumLen[j - 1] + Math.sqrt(dx * dx + dy * dy));
  }

  const totalLen = cumLen[cumLen.length - 1];
  if (totalLen === 0) return { point: { ...edgePts[0] }, tangent: { x: 1, y: 0 } };

  // Clamp t
  const clampedT = Math.max(0, Math.min(1, t));
  const targetLen = clampedT * totalLen;

  // Find the segment containing targetLen
  let segIdx = 0;
  for (let j = 1; j < cumLen.length; j++) {
    if (cumLen[j] >= targetLen) {
      segIdx = j - 1;
      break;
    }
    segIdx = j - 1;
  }

  const segStart = cumLen[segIdx];
  const segEnd = cumLen[segIdx + 1];
  const segLen = segEnd - segStart;
  const localT = segLen === 0 ? 0 : (targetLen - segStart) / segLen;

  const p0 = edgePts[segIdx];
  const p1 = edgePts[segIdx + 1];

  const point: Point2D = {
    x: p0.x + localT * (p1.x - p0.x),
    y: p0.y + localT * (p1.y - p0.y),
  };

  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  const tangent: Point2D = len === 0
    ? { x: 1, y: 0 }
    : { x: dx / len, y: dy / len };

  return { point, tangent };
}

/**
 * Compute total arc length (mm) of a named semantic edge.
 * Uses same flattenPath + segmentRange model as interpolateEdgePoint.
 */
export function computeEdgeLengthMM(piece: PatternPiece, edgeName: string): number {
  const edge = piece.edges?.find(e => e.name === edgeName);
  if (!edge) return 0;

  const pts = flattenPath(piece.outline);
  const n = pts.length;
  if (n < 2) return 0;

  const start = Math.max(0, Math.min(edge.segmentRange[0], n - 1));
  const end = Math.max(0, Math.min(edge.segmentRange[1], n - 1));

  let len = 0;
  let i = start;
  while (i !== end) {
    const next = (i + 1) % n;
    const dx = pts[next].x - pts[i].x;
    const dy = pts[next].y - pts[i].y;
    len += Math.sqrt(dx * dx + dy * dy);
    i = next;
    if (len > 100000) break; // safety
  }

  return len;
}
