import { useState, useCallback } from 'react';
import { PatternPiece, Point2D, InternalLine } from '../../types/types';
import { hitTestPieceBBox } from '../../utils/geometry/hitTest';
import { screenToPattern } from '../../utils/geometry';
import { newId } from '../../utils/ids';
import { patternToPieceLocal, pieceLocalToPattern } from './pieceTransform';
import { isDrag } from './gestureConstants';
import { polarOf, polarPoint } from './polyPenGeometry';

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
  /** Press crudo en pantalla: el umbral del gesto no cambia con el zoom. */
  pressScreen: Point2D | null;
  /** Último mousemove crudo en pantalla: respaldo para el release cuando el
   *  evento no llega (soltar fuera del `<svg>` — el listener global de
   *  `PatternEditor` no lo reenvía; sin esto el hilo se descartaba en vez de
   *  confirmarse, aunque el arrastre haya sido real). */
  moveScreen: Point2D | null;
  isDragging: boolean;
}

const RESET_STATE: GrainlineState = {
  pieceId: null, startPoint: null, endPoint: null, pressScreen: null, moveScreen: null, isDragging: false,
};

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
  const [state, setState] = useState<GrainlineState>(RESET_STATE);

  const toPattern = useCallback(
    (screenX: number, screenY: number, svgRect: DOMRect): Point2D =>
      screenToPattern(screenX, screenY, svgRect, zoom, pan),
    [zoom, pan],
  );

  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const pt = toPattern(e.clientX, e.clientY, rect);

    const piece = hitTestPieceBBox(pt, pieces);
    if (!piece) return;

    const local = patternToPieceLocal(pt, piece);
    setState({
      pieceId: piece.id,
      startPoint: local,
      endPoint: local,
      pressScreen: { x: e.clientX, y: e.clientY },
      moveScreen: { x: e.clientX, y: e.clientY },
      isDragging: true,
    });
  }, [toPattern, pieces]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!state.isDragging || !state.pieceId) return;
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const pt = toPattern(e.clientX, e.clientY, rect);
    const piece = pieces.find(p => p.id === state.pieceId);
    if (!piece) return;

    let endPattern = pt;
    if (e.shiftKey && state.startPoint) {
      // El enganche se decide en patrón, no en el espacio local de una pieza
      // girada: 0° debe seguir siendo la horizontal que María ve en pantalla.
      const startPattern = pieceLocalToPattern(state.startPoint, piece);
      const { lengthMm, angleDeg } = polarOf(startPattern, endPattern);
      endPattern = polarPoint(startPattern, lengthMm, Math.round(angleDeg / 45) * 45);
    }
    const local = patternToPieceLocal(endPattern, piece);
    setState(prev => ({ ...prev, endPoint: local, moveScreen: { x: e.clientX, y: e.clientY } }));
  }, [state.isDragging, state.pieceId, state.startPoint, toPattern, pieces]);

  /** Cancelación real (Escape/pointercancel): descarta el trazo sin mirar
   *  cuánto se arrastró — a diferencia de `handleMouseUp`, aquí no hay
   *  ambigüedad de evento que resolver. */
  const cancel = useCallback(() => setState(RESET_STATE), []);

  const handleMouseUp = useCallback((e?: React.MouseEvent<SVGSVGElement>) => {
    if (!state.isDragging || !state.pieceId || !state.startPoint || !state.endPoint || !state.pressScreen) {
      setState(RESET_STATE);
      return;
    }

    // Soltar fuera del `<svg>` llega aquí sin evento (el listener global de
    // PatternEditor no lo reenvía, por el mismo riesgo que tienen rectángulo/
    // margen de costura con `e.currentTarget`); usar el último mousemove en
    // vez de cancelar de una es lo que este hilo ya hacía antes de #1107.
    const screen = e ? { x: e.clientX, y: e.clientY } : state.moveScreen;
    if (screen) {
      const dx = screen.x - state.pressScreen.x;
      const dy = screen.y - state.pressScreen.y;
      if (isDrag(dx, dy)) {
        const grainline = createGrainline(state.startPoint, state.endPoint);
        onSetGrainline(state.pieceId, grainline);
      }
    }

    setState(RESET_STATE);
  }, [state, onSetGrainline]);

  return {
    pieceId: state.pieceId,
    startPoint: state.startPoint,
    endPoint: state.endPoint,
    isDragging: state.isDragging,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    cancel,
  };
}
