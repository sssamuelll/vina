import { useState, useCallback } from 'react';
import { PatternPiece, Point2D, InternalLine } from '../../types/types';
import { hitTestPieceBBox } from '../../utils/geometry/hitTest';
import { newId } from '../../utils/ids';

/**
 * Grainline tool: click+drag inside a piece to draw an arrow
 * indicating the fabric grain direction.
 * Each piece should have at most one grainline.
 */

interface GrainlineState {
  /** Piece being drawn on */
  pieceId: string | null;
  /** Start point (pattern space, relative to piece) */
  startPoint: Point2D | null;
  /** Current drag point */
  endPoint: Point2D | null;
  isDragging: boolean;
}

function createGrainline(start: Point2D, end: Point2D): InternalLine {
  return {
    id: newId(),
    type: 'grainline',
    path: [
      { type: 'M', values: [start.x, start.y] },
      { type: 'L', values: [end.x, end.y] },
    ],
  };
}

export function useGrainlineTool(
  zoom: number,
  pan: Point2D,
  pieces: PatternPiece[],
  onSetGrainline: (pieceId: string, grainline: InternalLine) => void,
) {
  const [state, setState] = useState<GrainlineState>({
    pieceId: null, startPoint: null, endPoint: null, isDragging: false,
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

    const piece = hitTestPieceBBox(pt, pieces);
    if (!piece) return;

    const local = { x: pt.x - piece.position.x, y: pt.y - piece.position.y };
    setState({ pieceId: piece.id, startPoint: local, endPoint: local, isDragging: true });
  }, [toPattern, pieces]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!state.isDragging || !state.pieceId) return;
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const pt = toPattern(e.clientX, e.clientY, rect);
    const piece = pieces.find(p => p.id === state.pieceId);
    if (!piece) return;

    const local = { x: pt.x - piece.position.x, y: pt.y - piece.position.y };
    setState(prev => ({ ...prev, endPoint: local }));
  }, [state.isDragging, state.pieceId, toPattern, pieces]);

  const handleMouseUp = useCallback(() => {
    if (!state.isDragging || !state.pieceId || !state.startPoint || !state.endPoint) {
      setState({ pieceId: null, startPoint: null, endPoint: null, isDragging: false });
      return;
    }

    const dx = state.endPoint.x - state.startPoint.x;
    const dy = state.endPoint.y - state.startPoint.y;
    if (Math.hypot(dx, dy) > 5) {
      const grainline = createGrainline(state.startPoint, state.endPoint);
      onSetGrainline(state.pieceId, grainline);
    }

    setState({ pieceId: null, startPoint: null, endPoint: null, isDragging: false });
  }, [state, onSetGrainline]);

  return {
    pieceId: state.pieceId,
    startPoint: state.startPoint,
    endPoint: state.endPoint,
    isDragging: state.isDragging,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
  };
}
