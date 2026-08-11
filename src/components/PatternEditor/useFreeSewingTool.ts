import { useState, useCallback } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
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
  const [segmentA, setSegmentA] = useState<SegmentSelection | null>(null);

  const seamType = useSelector(
    (s: RootState) => (s.tools.toolOptions?.seam?.seamType as Seam['type']) ?? 'standard',
  );

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

  /** El release: el t sobre el MISMO borde del press. Fuera del borde → null,
   *  y el gesto cae a clic (spec § 3.4). */
  const resolveReleaseT = useCallback((
    e: React.MouseEvent<SVGSVGElement>,
    press: EdgeTarget,
  ): number | null => {
    const pt = toPattern(e);
    const snap = snapToAnyEdge(pt, pieces, zoom, press.pieceId, press.edgeRange);
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

    if (!segmentA) { setSegmentA(segment); return; }
    onComplete(buildSegmentSeam(segmentA, segment, pieces, seamType));
    setSegmentA(null);
  }, [segmentA, onComplete, pieces, seamType]);

  const gesture = useEdgeGesture({ resolveTarget, resolveReleaseT, onCommit });

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

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    // Un Esc = una acción (spec § 6, conflicto 7): si cancelamos algo, el evento
    // no sigue viajando hasta `selection.deselect`.
    if (gesture.isArmed()) {
      gesture.cancel();
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (segmentA) {
      setSegmentA(null);
      e.preventDefault();
      e.stopPropagation();
    }
  }, [gesture, segmentA]);

  return {
    segmentA,
    phase: segmentA ? ('holdingA' as const) : ('idle' as const),
    hoveredTarget,
    liveRange: gesture.liveRange,
    handleMouseDown: gesture.handleMouseDown,
    handleMouseMove,
    handleMouseUp: gesture.handleMouseUp,
    handleKeyDown,
    isArmed: gesture.isArmed,
  };
}
