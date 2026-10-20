import { useState, useCallback } from 'react';
import { useDispatch } from 'react-redux';
import { clearSelection } from '../../store/editorSlice';
import type { PatternPiece, Point2D, Seam } from '../../types/types';
import { screenToPattern } from './sewingUtils';
import { edgeRangeForCommand } from '../../utils/semanticEdges';
import {
  snapToAnyEdge, commandTToEdgeT, buildSegmentSeam,
  type SegmentSelection,
} from './useSegmentSewingTool';
import { useEdgeGesture } from './useEdgeGesture';
import type { EdgeCommit, EdgeTarget } from './edgeGesture';

/**
 * La herramienta de coser, unificada (#199, #1022, #1029).
 *
 * Un clic marca el borde entero — exactamente lo que hacía antes, y produce el
 * mismo `Seam`. Un arrastre marca el tramo. Dos gestos, uno por pieza, cierran
 * la costura: sin `Enter`, sin fases.
 *
 * Spec: docs/superpowers/specs/2026-08-11-arrastre-unificado-2d-design.md § 4.2
 */
export function useFreeSewingTool(
  zoom: number,
  pan: Point2D,
  pieces: PatternPiece[],
  onComplete: (seam: Omit<Seam, 'id'>) => void,
) {
  const dispatch = useDispatch();
  const [segmentA, setSegmentA] = useState<SegmentSelection | null>(null);

  const toPattern = useCallback((e: React.MouseEvent<SVGSVGElement>): Point2D => {
    const rect = e.currentTarget.getBoundingClientRect();
    return screenToPattern(e.clientX, e.clientY, rect, zoom, pan);
  }, [zoom, pan]);

  /** El press: qué borde enganchó, y en qué punto de su arco. */
  const resolveTarget = useCallback((e: React.MouseEvent<SVGSVGElement>): EdgeTarget | null => {
    const pt = toPattern(e);
    // Sosteniendo la mitad A, el segundo gesto va contra OTRA pieza.
    const snap = snapToAnyEdge(pt, pieces, zoom, undefined, undefined);
    if (!snap) return null;
    if (segmentA && snap.pieceId === segmentA.pieceId) return null;

    const piece = pieces.find(p => p.id === snap.pieceId);
    const edgeRange = edgeRangeForCommand(piece, snap.edgeIndex);
    const t = piece
      ? commandTToEdgeT(piece.outline, edgeRange, snap.edgeIndex, snap.t)
      : snap.t;
    return { pieceId: snap.pieceId, edgeIndex: snap.edgeIndex, edgeRange, t, point: snap.point };
  }, [toPattern, pieces, zoom, segmentA]);

  /**
   * El release: el t sobre el MISMO borde del press, sin radio de enganche.
   *
   * Soltar lejos del borde no es soltar en el vacío — el borde ya lo fijó el
   * press y aquí solo se pregunta hasta dónde (spec § 3.4: clampeado al borde
   * del press, nunca caída a clic). Con radio, soltar a 13 px del borde cosía
   * el LADO COMPLETO en vez del tramo marcado (#1061).
   */
  const resolveReleaseT = useCallback((
    e: React.MouseEvent<SVGSVGElement>,
    press: EdgeTarget,
  ): number | null => {
    const pt = toPattern(e);
    const snap = snapToAnyEdge(pt, pieces, zoom, press.pieceId, press.edgeRange, true);
    if (!snap) return null;
    const piece = pieces.find(p => p.id === press.pieceId);
    return piece
      ? commandTToEdgeT(piece.outline, press.edgeRange, snap.edgeIndex, snap.t)
      : snap.t;
  }, [toPattern, pieces, zoom]);

  const onCommit = useCallback((commit: EdgeCommit) => {
    const { target } = commit;
    const [startT, endT] = commit.kind === 'drag' ? commit.range : [0, 1];
    const segment: SegmentSelection = {
      pieceId: target.pieceId,
      edgeIndex: target.edgeIndex,
      edgeRange: target.edgeRange,
      startT,
      endT,
      startPoint: target.point,
      endPoint: target.point,
    };

    if (!segmentA) {
      dispatch(clearSelection());
      setSegmentA(segment);
      return;
    }
    // La costura nace Normal: su tipo se cambia en su etiqueta, con ella
    // elegida (P3c, spec 2026-10-02 § 5.3). «Tipo de costura» salió del pie.
    onComplete(buildSegmentSeam(segmentA, segment, pieces, 'standard'));
    setSegmentA(null);
  }, [segmentA, onComplete, pieces, dispatch]);

  const gesture = useEdgeGesture({ resolveTarget, resolveReleaseT, onCommit });

  /** El press manda el objeto (spec § 4.1): sin un borde bajo el cursor el
   *  gesto no se arma. Pero si se está sosteniendo la mitad A, ese mismo
   *  clic en vacío SÍ tiene que soltarla — máquina de estados HOLDING_A
   *  --clic vacío | Escape--> IDLE. Sin esto la usuaria queda atrapada
   *  sosteniendo la mitad A para siempre (#1029 tanda 1 pt.2). */
  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button === 0 && segmentA && !resolveTarget(e)) {
      setSegmentA(null);
      return;
    }
    gesture.handleMouseDown(e);
  }, [gesture, segmentA, resolveTarget]);

  // El resalte al pasar el ratón es independiente del gesto: sin él, el borde
  // solo se encendería mientras se arrastra, y María no vería qué va a coser
  // ANTES de apretar. `gesture.press` solo existe durante el gesto, así que no
  // sirve para esto.
  const [hoveredTarget, setHoveredTarget] = useState<EdgeTarget | null>(null);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    gesture.handleMouseMove(e);
    if (gesture.isArmed()) return;   // durante el gesto manda el press, no el hover
    setHoveredTarget(resolveTarget(e));
  }, [gesture, resolveTarget]);

  /**
   * Protocolo P1: devuelve si CONSUMIÓ la tecla (E-3 de la escalera de Escape).
   *
   * Antes devolvía `void` y el enrutador anotaba `consumedBy: null` sobre un
   * Escape que sí se había consumido. Coser es la única de las cinco ramas que
   * no está detrás de una guarda —puede entrar sin nada que cancelar—, así que
   * devolver su nombre a ciegas habría cambiado una mentira por la contraria.
   */
  const handleKeyDown = useCallback((e: KeyboardEvent): boolean => {
    if (e.key !== 'Escape') return false;
    // Un Esc = una acción (spec § 6, conflicto 7): si cancelamos algo, el evento
    // no sigue viajando hasta `selection.deselect`.
    if (gesture.isArmed()) {
      gesture.cancel();
      e.preventDefault();
      e.stopPropagation();
      return true;
    }
    if (segmentA) {
      setSegmentA(null);
      e.preventDefault();
      e.stopPropagation();
      return true;
    }
    return false;
  }, [gesture, segmentA]);

  /** El ratón salió del lienzo: el borde resaltado se va con él (#1132). */
  const limpiarHover = useCallback(() => {
    setHoveredTarget(current => (current === null ? current : null));
  }, []);

  return {
    limpiarHover,
    segmentA,
    phase: segmentA ? ('holdingA' as const) : ('idle' as const),
    hoveredTarget,
    /** El borde que enganchó el press, mientras el gesto sigue vivo. Con
     *  `liveRange` compone el tramo que se está marcando ahora mismo. */
    activeTarget: gesture.press,
    liveRange: gesture.liveRange,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp: gesture.handleMouseUp,
    handleKeyDown,
    isArmed: gesture.isArmed,
  };
}
