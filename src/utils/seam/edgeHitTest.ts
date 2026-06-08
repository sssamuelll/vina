import type { PathCommand, PatternPiece, Point2D, SemanticEdge } from '../../types/types';

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

/**
 * Nearest M/L outline vertex to a piece-local point, within `maxDist`. Returns
 * the vertex's COMMAND index (the same key space as cornerTypes / corner
 * editing), or null. Curve endpoints are not targeted (matches the existing
 * corner-edit behavior).
 */
export function findNearestOutlineVertex(
  outline: PathCommand[],
  point: Point2D,
  maxDist: number,
): { index: number; dist: number } | null {
  let best: { index: number; dist: number } | null = null;
  for (let i = 0; i < outline.length; i++) {
    const cmd = outline[i];
    if (cmd.type !== 'M' && cmd.type !== 'L') continue;
    const d = Math.hypot(cmd.values[0] - point.x, cmd.values[1] - point.y);
    if (d <= maxDist && (!best || d < best.dist)) best = { index: i, dist: d };
  }
  return best;
}

/** Where a seamAllowance-tool left-click landed: a vertex, an edge, or the piece body. */
export type SAClickTarget =
  | { kind: 'vertex'; pieceId: string; vertexIndex: number }
  | { kind: 'edge'; pieceId: string; edgeId: string }
  | { kind: 'piece'; pieceId: string };

/**
 * Classify a seamAllowance-tool left-click (pattern-space point) against the
 * pieces. Precise targets win: a nearby VERTEX (corner editing) first, then a
 * nearby EDGE (per-edge width), across all pieces; falling back to the PIECE
 * whose bbox contains the point (whole-piece apply — the bulk seed). Returns
 * null on empty canvas. Precedence (vertex > edge) mirrors the tighter target.
 */
export function resolveSeamAllowanceClick(
  pieces: PatternPiece[],
  patternPoint: Point2D,
  maxVertexDist: number,
  maxEdgeDist: number,
): SAClickTarget | null {
  // Pass 1: precise vertex/edge targets (across all pieces).
  for (const piece of pieces) {
    if (!piece.outline?.length) continue;
    const local = {
      x: patternPoint.x - (piece.position?.x ?? 0),
      y: patternPoint.y - (piece.position?.y ?? 0),
    };
    const v = findNearestOutlineVertex(piece.outline, local, maxVertexDist);
    if (v) return { kind: 'vertex', pieceId: piece.id, vertexIndex: v.index };
    const edge = piece.edges?.length
      ? pickEdgeForSeamAllowance(piece.outline, piece.edges, local, maxEdgeDist)
      : null;
    if (edge) return { kind: 'edge', pieceId: piece.id, edgeId: edge.id };
  }
  // Pass 2: the piece body (bbox containment) — the whole-piece apply target.
  for (const piece of pieces) {
    if (!piece.outline?.length) continue;
    const ox = piece.position?.x ?? 0;
    const oy = piece.position?.y ?? 0;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const cmd of piece.outline) {
      const vals = cmd.values;
      for (let i = 0; i + 1 < vals.length; i += 2) {
        const px = vals[i] + ox, py = vals[i + 1] + oy;
        if (px < minX) minX = px; if (px > maxX) maxX = px;
        if (py < minY) minY = py; if (py > maxY) maxY = py;
      }
    }
    if (patternPoint.x >= minX && patternPoint.x <= maxX && patternPoint.y >= minY && patternPoint.y <= maxY) {
      return { kind: 'piece', pieceId: piece.id };
    }
  }
  return null;
}
