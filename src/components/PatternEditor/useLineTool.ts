import { useState, useCallback } from 'react';
import { Point2D, PatternPiece, InternalLine } from '../../types/types';
import { findNearestPiece } from '../../utils/geometry/hitTest';
import { screenToPattern } from '../../utils/geometry';
import { newId } from '../../utils/ids';

interface LineToolState {
  /** First click point */
  startPoint: Point2D | null;
  /** Current cursor position */
  cursorPos: Point2D | null;
  /** Piece the line belongs to (nearest to start click) */
  pieceId: string | null;
}

/**
 * Line tool — click two points to create a construction line (dart/fold/internal).
 * The line is added as an internal line on the nearest piece.
 */
export function useLineTool(
  zoom2D: number,
  pan2D: Point2D,
  pieces: PatternPiece[],
  onComplete: (pieceId: string, line: InternalLine) => void,
) {
  const [state, setState] = useState<LineToolState>({
    startPoint: null,
    cursorPos: null,
    pieceId: null,
  });

  const toPattern = useCallback((e: React.MouseEvent<SVGSVGElement>): Point2D => {
    const rect = e.currentTarget.getBoundingClientRect();
    return screenToPattern(e.clientX, e.clientY, rect, zoom2D, pan2D);
  }, [zoom2D, pan2D]);

  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const pt = toPattern(e);

    if (!state.startPoint) {
      // First click — set start point
      const nearestPiece = findNearestPiece(pt, pieces);
      setState({ startPoint: pt, cursorPos: pt, pieceId: nearestPiece });
    } else {
      // Second click — complete the line
      if (state.pieceId) {
        // Convert pattern-space coordinates to piece-local coordinates
        const piece = pieces.find(p => p.id === state.pieceId);
        const offX = piece?.position.x ?? 0;
        const offY = piece?.position.y ?? 0;
        const line: InternalLine = {
          id: newId(),
          type: 'fold', // construction line
          path: [
            { type: 'M', values: [state.startPoint.x - offX, state.startPoint.y - offY] },
            { type: 'L', values: [pt.x - offX, pt.y - offY] },
          ],
        };
        onComplete(state.pieceId, line);
      }
      setState({ startPoint: null, cursorPos: null, pieceId: null });
    }
  }, [toPattern, state.startPoint, state.pieceId, pieces, onComplete]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!state.startPoint) return;
    const pt = toPattern(e);
    setState(prev => ({ ...prev, cursorPos: pt }));
  }, [state.startPoint, toPattern]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      setState({ startPoint: null, cursorPos: null, pieceId: null });
    }
  }, []);

  // Line length for dimension label
  const lineLength = state.startPoint && state.cursorPos
    ? {
        length: Math.hypot(state.cursorPos.x - state.startPoint.x, state.cursorPos.y - state.startPoint.y),
        midpoint: {
          x: (state.startPoint.x + state.cursorPos.x) / 2,
          y: (state.startPoint.y + state.cursorPos.y) / 2,
        }
      }
    : null;

  return {
    startPoint: state.startPoint,
    cursorPos: state.cursorPos,
    pieceId: state.pieceId,
    lineLength,
    handleMouseDown,
    handleMouseMove,
    handleKeyDown,
  };
}
