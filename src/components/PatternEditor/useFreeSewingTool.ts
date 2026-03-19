import { useState, useCallback } from 'react';
import type { PatternPiece, Point2D, Seam } from '../../types/types';
import {
  screenToPattern,
  resolveEdgeName,
  findClosestEdge,
  type FreeEdgeSelection,
} from './sewingUtils';

// Re-export for consumers
export type { FreeEdgeSelection } from './sewingUtils';

interface FreeSewingToolState {
  firstEdge: FreeEdgeSelection | null;
  hoveredEdge: FreeEdgeSelection | null;
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

  const toPattern = useCallback((screenX: number, screenY: number, svgRect: DOMRect): Point2D =>
    screenToPattern(screenX, screenY, svgRect, zoom, pan),
  [zoom, pan]);

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

      const pieceAObj = pieces.find(p => p.id === state.firstEdge!.pieceId);
      const pieceBObj = pieces.find(p => p.id === edge.pieceId);
      const edgeAName = pieceAObj ? resolveEdgeName(pieceAObj, state.firstEdge.edgeIndex) : `edge-${state.firstEdge.edgeIndex}`;
      const edgeBName = pieceBObj ? resolveEdgeName(pieceBObj, edge.edgeIndex) : `edge-${edge.edgeIndex}`;

      onComplete({
        pieceA: { pieceId: state.firstEdge.pieceId, edgeName: edgeAName },
        pieceB: { pieceId: edge.pieceId, edgeName: edgeBName },
        type: 'standard',
        tension: 100,
        strength: 1.0,
        active: true,
        taped: false,
        tapeWidth: 10,
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
