import { useState, useCallback } from 'react';
import { PatternPiece, Point2D, Seam } from '../../types/types';
import { distToSegment } from '../../utils/geometry/distance';
import { getEdgeEndpoints } from '../../utils/geometry/path';

/**
 * Edge = a segment of a piece's outline (between two consecutive path commands).
 * edgeIndex corresponds to the PathCommand index (1-based, since 0 is always M).
 */
export interface EdgeSelection {
  pieceId: string;
  edgeIndex: number;
  /** Midpoint of the edge in pattern space (for visual feedback) */
  midpoint: Point2D;
}

interface SeamToolState {
  /** First edge selected (waiting for second) */
  firstEdge: EdgeSelection | null;
  /** Edge currently being hovered */
  hoveredEdge: EdgeSelection | null;
}

const EDGE_HIT_THRESHOLD = 15; // px in screen space

/** Find the closest edge to a point across all pieces */
function findClosestEdge(
  pt: Point2D,
  pieces: PatternPiece[],
  zoom: number,
  excludePieceId?: string,
): EdgeSelection | null {
  let best: EdgeSelection | null = null;
  let bestDist = Infinity;

  for (const piece of pieces) {
    if (excludePieceId && piece.id === excludePieceId) continue;

    const cmds = piece.outline;
    for (let i = 1; i < cmds.length; i++) {
      if (cmds[i].type === 'Z') {
        // For Z, the edge goes from current point back to M
        const ep = getEdgeEndpoints(cmds, i);
        if (!ep) continue;
        const start = { x: ep.start.x + piece.position.x, y: ep.start.y + piece.position.y };
        const end = { x: ep.end.x + piece.position.x, y: ep.end.y + piece.position.y };
        const d = distToSegment(pt, start, end) * zoom;
        if (d < EDGE_HIT_THRESHOLD && d < bestDist) {
          bestDist = d;
          best = {
            pieceId: piece.id,
            edgeIndex: i,
            midpoint: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
          };
        }
        continue;
      }

      const ep = getEdgeEndpoints(cmds, i);
      if (!ep) continue;
      // Offset by piece position
      const start = { x: ep.start.x + piece.position.x, y: ep.start.y + piece.position.y };
      const end = { x: ep.end.x + piece.position.x, y: ep.end.y + piece.position.y };
      const d = distToSegment(pt, start, end) * zoom;
      if (d < EDGE_HIT_THRESHOLD && d < bestDist) {
        bestDist = d;
        best = {
          pieceId: piece.id,
          edgeIndex: i,
          midpoint: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
        };
      }
    }
  }

  return best;
}

export function useSeamTool(
  zoom: number,
  pan: Point2D,
  pieces: PatternPiece[],
  onComplete: (seam: Omit<Seam, 'id'>) => void,
) {
  const [state, setState] = useState<SeamToolState>({
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

    const edge = findClosestEdge(pt, pieces, zoom);
    if (!edge) {
      // Click on nothing — cancel
      setState({ firstEdge: null, hoveredEdge: null });
      return;
    }

    if (!state.firstEdge) {
      // First edge selection
      setState(prev => ({ ...prev, firstEdge: edge }));
    } else {
      // Second edge — must be different piece
      if (edge.pieceId === state.firstEdge.pieceId) return; // same piece, ignore

      onComplete({
        pieceA: {
          pieceId: state.firstEdge.pieceId,
          edgeStart: state.firstEdge.edgeIndex,
          edgeEnd: state.firstEdge.edgeIndex,
        },
        pieceB: {
          pieceId: edge.pieceId,
          edgeStart: edge.edgeIndex,
          edgeEnd: edge.edgeIndex,
        },
        type: 'standard',
      });
      setState({ firstEdge: null, hoveredEdge: null });
    }
  }, [toPattern, pieces, zoom, state.firstEdge, onComplete]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const pt = toPattern(e.clientX, e.clientY, rect);

    const excludeId = state.firstEdge?.pieceId;
    const edge = findClosestEdge(pt, pieces, zoom, state.firstEdge ? excludeId : undefined);
    setState(prev => ({ ...prev, hoveredEdge: edge }));
  }, [toPattern, pieces, zoom, state.firstEdge]);

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
  };
}

export { getEdgeEndpoints, getEdgeLength } from '../../utils/geometry/path';
