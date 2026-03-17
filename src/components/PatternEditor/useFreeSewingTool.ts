import { useState, useCallback } from 'react';
import { PatternPiece, Point2D, Seam } from '../../types/types';
import { distToSegment } from '../../utils/geometry/distance';
import { getEdgeEndpoints } from '../../utils/geometry/path';

/**
 * A selected edge segment for free sewing — includes start/end points
 * for rendering snap dots and highlighted segments.
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

interface FreeSewingToolState {
  firstEdge: FreeEdgeSelection | null;
  hoveredEdge: FreeEdgeSelection | null;
}

const EDGE_HIT_THRESHOLD = 15; // px in screen space
const VERTEX_SNAP_THRESHOLD = 10; // px in screen space

/** Build a FreeEdgeSelection from a piece + edge index */
function buildSelection(piece: PatternPiece, edgeIndex: number): FreeEdgeSelection | null {
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
 * Find closest edge segment to a point. In 'point' mode, only matches
 * if close to a vertex (segment endpoint). In 'free' mode, matches
 * anywhere along the segment.
 */
function findClosestEdge(
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
      const sel = buildSelection(piece, i);
      if (!sel) continue;

      if (mode === 'point') {
        // Point-to-point: snap to vertices (endpoints) only
        const dStart = Math.hypot(pt.x - sel.start.x, pt.y - sel.start.y) * zoom;
        const dEnd = Math.hypot(pt.x - sel.end.x, pt.y - sel.end.y) * zoom;
        const d = Math.min(dStart, dEnd);
        if (d < VERTEX_SNAP_THRESHOLD && d < bestDist) {
          bestDist = d;
          best = sel;
        }
      } else {
        // Free mode: match anywhere along the segment
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

export function useFreeSewingTool(
  zoom: number,
  pan: Point2D,
  pieces: PatternPiece[],
  onComplete: (seam: Omit<Seam, 'id'>) => void,
  mode: 'free' | 'point' = 'free',
) {
  const [state, setState] = useState<FreeSewingToolState>({
    firstEdge: null,
    hoveredEdge: null,
  });

  const toPattern = useCallback((screenX: number, screenY: number, svgRect: DOMRect): Point2D => ({
    x: (screenX - svgRect.left - pan.x) / zoom,
    y: (screenY - svgRect.top - pan.y) / zoom,
  }), [zoom, pan]);

  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const pt = toPattern(e.clientX, e.clientY, rect);

    const edge = findClosestEdge(pt, pieces, zoom, mode);
    if (!edge) {
      setState({ firstEdge: null, hoveredEdge: null });
      return;
    }

    if (!state.firstEdge) {
      setState(prev => ({ ...prev, firstEdge: edge }));
    } else {
      if (edge.pieceId === state.firstEdge.pieceId) return;

      // Resolve semantic edge names from segment indices
      const pieceAObj = pieces.find(p => p.id === state.firstEdge!.pieceId);
      const pieceBObj = pieces.find(p => p.id === edge.pieceId);
      const edgeAName = pieceAObj?.edges?.find(
        e => state.firstEdge!.edgeIndex >= e.segmentRange[0] && state.firstEdge!.edgeIndex < e.segmentRange[1]
      )?.name ?? `edge-${state.firstEdge.edgeIndex}`;
      const edgeBName = pieceBObj?.edges?.find(
        e => edge.edgeIndex >= e.segmentRange[0] && edge.edgeIndex < e.segmentRange[1]
      )?.name ?? `edge-${edge.edgeIndex}`;

      onComplete({
        pieceA: { pieceId: state.firstEdge.pieceId, edgeName: edgeAName },
        pieceB: { pieceId: edge.pieceId, edgeName: edgeBName },
        type: 'standard',
      });
      setState({ firstEdge: null, hoveredEdge: null });
    }
  }, [toPattern, pieces, zoom, mode, state.firstEdge, onComplete]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const pt = toPattern(e.clientX, e.clientY, rect);

    const excludeId = state.firstEdge?.pieceId;
    const edge = findClosestEdge(pt, pieces, zoom, mode, state.firstEdge ? excludeId : undefined);
    setState(prev => ({ ...prev, hoveredEdge: edge }));
  }, [toPattern, pieces, zoom, mode, state.firstEdge]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      setState({ firstEdge: null, hoveredEdge: null });
    }
  }, []);

  return {
    firstEdge: state.firstEdge,
    hoveredEdge: state.hoveredEdge,
    handleMouseDown,
    handleMouseMove,
    handleKeyDown,
    mode,
  };
}
