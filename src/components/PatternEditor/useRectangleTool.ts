import { useState, useCallback, useRef } from 'react';
import { Point2D, PathCommand, InternalLine } from '../../types/types';

interface RectState {
  start: Point2D | null;
  current: Point2D | null;
  isDragging: boolean;
}

interface NewPieceData {
  name: string;
  outline: PathCommand[];
  internals: InternalLine[];
  position: Point2D;
  rotation: number;
  mirrored: boolean;
  seamAllowance: number;
  layer: number;
  sublayer: number;
}

const MIN_SIZE = 5;

/**
 * Rectangle tool — click and drag to create a rectangular pattern piece.
 */
export function useRectangleTool(
  zoom2D: number,
  pan2D: Point2D,
  onComplete: (piece: NewPieceData) => void,
) {
  const [state, setState] = useState<RectState>({
    start: null,
    current: null,
    isDragging: false,
  });
  const stateRef = useRef(state);
  stateRef.current = state;

  const toPattern = useCallback((e: React.MouseEvent<SVGSVGElement>): Point2D => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - pan2D.x) / zoom2D,
      y: (e.clientY - rect.top - pan2D.y) / zoom2D,
    };
  }, [zoom2D, pan2D]);

  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const pt = toPattern(e);
    setState({ start: pt, current: pt, isDragging: true });
  }, [toPattern]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!stateRef.current.isDragging) return;
    const pt = toPattern(e);
    setState(prev => ({ ...prev, current: pt }));
  }, [toPattern]);

  const handleMouseUp = useCallback(() => {
    const { start, current, isDragging } = stateRef.current;
    if (!isDragging || !start || !current) {
      setState({ start: null, current: null, isDragging: false });
      return;
    }

    const w = Math.abs(current.x - start.x);
    const h = Math.abs(current.y - start.y);

    if (w >= MIN_SIZE && h >= MIN_SIZE) {
      const minX = Math.min(start.x, current.x);
      const minY = Math.min(start.y, current.y);

      const outline: PathCommand[] = [
        { type: 'M', values: [minX, minY] },
        { type: 'L', values: [minX + w, minY] },
        { type: 'L', values: [minX + w, minY + h] },
        { type: 'L', values: [minX, minY + h] },
        { type: 'Z', values: [] },
      ];

      onComplete({
        name: `Rect ${Date.now().toString(36)}`,
        outline,
        internals: [],
        position: { x: 0, y: 0 },
        rotation: 0,
        mirrored: false,
        seamAllowance: 10,
        layer: 1,
        sublayer: 0,
      });
    }

    setState({ start: null, current: null, isDragging: false });
  }, [onComplete]);

  const previewRect = state.isDragging && state.start && state.current
    ? {
        x: Math.min(state.start.x, state.current.x),
        y: Math.min(state.start.y, state.current.y),
        width: Math.abs(state.current.x - state.start.x),
        height: Math.abs(state.current.y - state.start.y),
      }
    : null;

  // Dimensions for overlay label
  const rectDimensions = previewRect ? {
    width: previewRect.width,
    height: previewRect.height,
    center: {
      x: previewRect.x + previewRect.width / 2,
      y: previewRect.y + previewRect.height / 2,
    }
  } : null;

  return {
    isDragging: state.isDragging,
    previewRect,
    rectDimensions,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
  };
}
