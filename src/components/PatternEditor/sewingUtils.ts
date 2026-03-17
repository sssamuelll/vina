import type { PatternPiece, Point2D } from '../../types/types';
import { distToSegment } from '../../utils/geometry/distance';
import { getEdgeEndpoints } from '../../utils/geometry/path';

// ─── Shared Types ─────────────────────────────────────────────────────────────

/**
 * A selected edge segment — includes start/end points for rendering
 * snap dots and highlighted segments.
 */
export interface FreeEdgeSelection {
  pieceId: string;
  edgeIndex: number;
  /** Segment start in world space */
  start: Point2D;
  /** Segment end in world space */
  end: Point2D;
  /** Midpoint in world space */
  midpoint: Point2D;
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const EDGE_HIT_THRESHOLD = 15; // px in screen space
export const VERTEX_SNAP_THRESHOLD = 10; // px in screen space

// ─── Pure Functions ───────────────────────────────────────────────────────────

/**
 * Convert screen coordinates to pattern space.
 * Pure function — wrap in useCallback within each hook.
 */
export function screenToPattern(
  screenX: number,
  screenY: number,
  svgRect: DOMRect,
  zoom: number,
  pan: Point2D,
): Point2D {
  return {
    x: (screenX - svgRect.left - pan.x) / zoom,
    y: (screenY - svgRect.top - pan.y) / zoom,
  };
}

/**
 * Resolve a semantic edge name from a segment index.
 * Falls back to `edge-{edgeIndex}` if no semantic edge matches.
 */
export function resolveEdgeName(piece: PatternPiece, edgeIndex: number): string {
  return piece.edges?.find(
    e => edgeIndex >= e.segmentRange[0] && edgeIndex < e.segmentRange[1],
  )?.name ?? `edge-${edgeIndex}`;
}

/** Build a FreeEdgeSelection from a piece + edge index */
export function buildEdgeSelection(piece: PatternPiece, edgeIndex: number): FreeEdgeSelection | null {
  const ep = getEdgeEndpoints(piece.outline, edgeIndex);
  if (!ep) return null;
  const start = { x: ep.start.x + piece.position.x, y: ep.start.y + piece.position.y };
  const end = { x: ep.end.x + piece.position.x, y: ep.end.y + piece.position.y };
  return {
    pieceId: piece.id,
    edgeIndex,
    start,
    end,
    midpoint: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
  };
}

/**
 * Find closest edge segment to a point across all pieces.
 * In 'point' mode, only matches vertices (segment endpoints).
 * In 'free' mode, matches anywhere along the segment.
 */
export function findClosestEdge(
  pt: Point2D,
  pieces: PatternPiece[],
  zoom: number,
  mode: 'free' | 'point',
  excludePieceId?: string,
): FreeEdgeSelection | null {
  let best: FreeEdgeSelection | null = null;
  let bestDist = Infinity;

  for (const piece of pieces) {
    if (excludePieceId && piece.id === excludePieceId) continue;

    const cmds = piece.outline;
    for (let i = 1; i < cmds.length; i++) {
      const sel = buildEdgeSelection(piece, i);
      if (!sel) continue;

      if (mode === 'point') {
        const dStart = Math.hypot(pt.x - sel.start.x, pt.y - sel.start.y) * zoom;
        const dEnd = Math.hypot(pt.x - sel.end.x, pt.y - sel.end.y) * zoom;
        const d = Math.min(dStart, dEnd);
        if (d < VERTEX_SNAP_THRESHOLD && d < bestDist) {
          bestDist = d;
          best = sel;
        }
      } else {
        const d = distToSegment(pt, sel.start, sel.end) * zoom;
        if (d < EDGE_HIT_THRESHOLD && d < bestDist) {
          bestDist = d;
          best = sel;
        }
      }
    }
  }

  return best;
}
