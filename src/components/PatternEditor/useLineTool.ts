import { useState, useCallback } from 'react';
import { Point2D, PatternPiece, InternalLine } from '../../types/types';

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
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - pan2D.x) / zoom2D,
      y: (e.clientY - rect.top - pan2D.y) / zoom2D,
    };
  }, [zoom2D, pan2D]);

  /** Find the nearest piece to a point (by checking if point is inside bounding box + margin) */
  const findNearestPiece = useCallback((pt: Point2D): string | null => {
    let bestId: string | null = null;
    let bestDist = Infinity;
    const MARGIN = 50;

    for (const piece of pieces) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const cmd of piece.outline) {
        for (let i = 0; i < cmd.values.length - 1; i += 2) {
          const px = cmd.values[i] + piece.position.x;
          const py = cmd.values[i + 1] + piece.position.y;
          minX = Math.min(minX, px);
          minY = Math.min(minY, py);
          maxX = Math.max(maxX, px);
          maxY = Math.max(maxY, py);
        }
      }
      // Expand bbox by margin
      if (pt.x >= minX - MARGIN && pt.x <= maxX + MARGIN &&
          pt.y >= minY - MARGIN && pt.y <= maxY + MARGIN) {
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        const dist = Math.hypot(pt.x - cx, pt.y - cy);
        if (dist < bestDist) {
          bestDist = dist;
          bestId = piece.id;
        }
      }
    }
    return bestId;
  }, [pieces]);

  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const pt = toPattern(e);

    if (!state.startPoint) {
      // First click — set start point
      const nearestPiece = findNearestPiece(pt);
      setState({ startPoint: pt, cursorPos: pt, pieceId: nearestPiece });
    } else {
      // Second click — complete the line
      if (state.pieceId) {
        const line: InternalLine = {
          id: `line-${Date.now()}`,
          type: 'dart', // construction line
          path: [
            { type: 'M', values: [state.startPoint.x, state.startPoint.y] },
            { type: 'L', values: [pt.x, pt.y] },
          ],
        };
        onComplete(state.pieceId, line);
      }
      setState({ startPoint: null, cursorPos: null, pieceId: null });
    }
  }, [toPattern, state.startPoint, state.pieceId, findNearestPiece, onComplete]);

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

  return {
    startPoint: state.startPoint,
    cursorPos: state.cursorPos,
    pieceId: state.pieceId,
    handleMouseDown,
    handleMouseMove,
    handleKeyDown,
  };
}
