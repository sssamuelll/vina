import { useCallback, useMemo, useRef } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import type { PatternPiece, Point2D } from '../../types/types';
import { screenToPattern, screenToPatternLength } from '../../utils/geometry';
import {
  buildRing,
  distanceAt,
  pointAt,
  projectToRing,
  type OutlineRing,
} from '../../utils/geometry/outlineRing';
import {
  patternToPieceLocal,
  pieceLocalToPattern,
} from '../../utils/geometry/pieceSpace';
import { resolveSeamAllowanceClick } from '../../utils/seam/edgeHitTest';
import { spanLengthMm, unwrapOnSpan } from './distanceCommit';
import type { EdgeCommit, EdgeTarget } from './edgeGesture';
import { DRAG_THRESHOLD_PX, EDGE_HIT_PX } from './gestureConstants';
import { useEdgeGesture } from './useEdgeGesture';

interface SeamAllowanceEdgeTarget extends EdgeTarget {
  edgeId: string;
  /** Shift pertenece al press: el release no puede cambiar la selección pedida. */
  additive: boolean;
}

interface BodyDrag {
  startX: number;
  startY: number;
  moved: boolean;
  touched: Set<string>;
  singlePieceId: string;
  prevWidth: number;
}

/** Distancias de anillo que delimitan un borde, incluido el cierre que cruza 0. */
function edgeSpanMm(ring: OutlineRing, edgeRange: [number, number]): [number, number] {
  const startMm = distanceAt(ring, { commandIndex: edgeRange[0], tLocal: 0 });
  const rawEndMm = distanceAt(ring, { commandIndex: edgeRange[1] - 1, tLocal: 1 });
  // El cierre termina donde empieza el anillo. Conservar ese cruce evita que
  // un borde de cierre se convierta accidentalmente en su complemento.
  return startMm > 0 && rawEndMm >= ring.totalMm - 1e-6
    ? [startMm, 0]
    : [startMm, rawEndMm];
}

/**
 * Proyecta sobre el borde fijado por el press. Si la proyección global cae en
 * otro borde, el extremo físicamente más cercano decide el clamp: ordenar solo
 * las distancias del anillo elegiría el extremo equivocado al cruzar su cero.
 */
function edgeTForPoint(
  ring: OutlineRing,
  edgeRange: [number, number],
  localPoint: Point2D,
): number {
  const spanMm = edgeSpanMm(ring, edgeRange);
  const lengthMm = spanLengthMm(ring, spanMm);
  if (lengthMm <= 0) return 0;

  const projectedMm = projectToRing(ring, localPoint).distanceMm;
  const unwrappedMm = unwrapOnSpan(ring, spanMm, projectedMm);
  const startMm = spanMm[0];
  const endMm = startMm + lengthMm;
  if (unwrappedMm >= startMm - 1e-6 && unwrappedMm <= endMm + 1e-6) {
    return Math.max(0, Math.min(1, (unwrappedMm - startMm) / lengthMm));
  }

  const start = pointAt(ring, startMm).point;
  const end = pointAt(ring, endMm).point;
  const startDistance = Math.hypot(localPoint.x - start.x, localPoint.y - start.y);
  const endDistance = Math.hypot(localPoint.x - end.x, localPoint.y - end.y);
  return startDistance <= endDistance ? 0 : 1;
}

function edgePointAtT(
  ring: OutlineRing,
  edgeRange: [number, number],
  t: number,
): Point2D {
  const spanMm = edgeSpanMm(ring, edgeRange);
  return pointAt(ring, spanMm[0] + t * spanLengthMm(ring, spanMm)).point;
}

/**
 * Margen de costura: vértice y cuerpo conservan sus gestos; el borde comparte
 * ahora la máquina press-track-release de la familia TRAMO.
 */
export function useSeamAllowanceTool(
  pieces: PatternPiece[],
  zoom: number,
  pan: Point2D,
  callbacks: {
    onApply: (pieceId: string, widthMm: number, prevWidthMm: number) => void;
    onApplyAll: (pieceIds: string[], widthMm: number) => void;
    onApplySpan: (
      pieceId: string,
      edgeId: string,
      range: [number, number],
      widthMm: number,
    ) => void;
    /** `additive` (Shift) alterna el borde dentro de la selección múltiple. */
    onSelectEdge: (pieceId: string, edgeId: string, additive: boolean) => void;
    onSelectVertex: (pieceId: string, vertexIndex: number) => void;
  },
) {
  const widthMm = useSelector((s: RootState) => s.editor.defaultSeamAllowanceWidth);
  const { onApply, onApplyAll, onApplySpan, onSelectEdge, onSelectVertex } = callbacks;

  const ringsByPiece = useMemo(() => {
    const rings = new Map<string, OutlineRing>();
    for (const piece of pieces) {
      const exact = buildRing(piece.outline, 2);
      const built = exact.ok ? exact : buildRing(piece.outline, 1);
      if (built.ok) rings.set(piece.id, built.value);
    }
    return rings;
  }, [pieces]);

  const bodyDragRef = useRef<BodyDrag | null>(null);
  // `useEdgeGesture` resuelve su objetivo durante el mismo mousedown. Este ref
  // evita repetir el hit-test y, sobre todo, fija exactamente la rama que ganó.
  const primedEdgeRef = useRef<SeamAllowanceEdgeTarget | null>(null);

  const resolveEdgeTarget = useCallback((): SeamAllowanceEdgeTarget | null => {
    const target = primedEdgeRef.current;
    primedEdgeRef.current = null;
    return target;
  }, []);

  const resolveReleaseT = useCallback((
    e: React.MouseEvent<SVGSVGElement>,
    press: EdgeTarget,
  ): number | null => {
    const piece = pieces.find(candidate => candidate.id === press.pieceId);
    const ring = ringsByPiece.get(press.pieceId);
    if (!piece || !ring) return null;
    const rect = e.currentTarget.getBoundingClientRect();
    const world = screenToPattern(e.clientX, e.clientY, rect, zoom, pan);
    // Por el transform, no restando solo `position`: el anillo se construye
    // sobre el contorno CRUDO, así que un release traído a medias cae sobre
    // otro pedazo del borde — o fuera de él, y lo clampea al extremo que no
    // es. Este `t` es lo que `onApplySpan` escribe en el patrón (#1068).
    return edgeTForPoint(ring, press.edgeRange, patternToPieceLocal(world, piece));
  }, [pieces, ringsByPiece, zoom, pan]);

  const onCommit = useCallback((commit: EdgeCommit) => {
    const target = commit.target as SeamAllowanceEdgeTarget;
    // El tramo recién creado queda seleccionado para que el panel sea la puerta
    // numérica inmediata; en clic, esta llamada es exactamente la conducta previa.
    onSelectEdge(target.pieceId, target.edgeId, target.additive);
    if (commit.kind === 'drag') {
      onApplySpan(target.pieceId, target.edgeId, commit.range, widthMm);
    }
  }, [onApplySpan, onSelectEdge, widthMm]);

  const edgeGesture = useEdgeGesture({
    resolveTarget: resolveEdgeTarget,
    resolveReleaseT,
    onCommit,
  });

  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    // Un press nuevo reemplaza cualquier gesto cuyo release no llegó. La rama
    // que gane abajo será la única dueña hasta soltar.
    bodyDragRef.current = null;
    primedEdgeRef.current = null;
    edgeGesture.cancel();

    const rect = e.currentTarget.getBoundingClientRect();
    const world = screenToPattern(e.clientX, e.clientY, rect, zoom, pan);
    const vertexThreshold = screenToPatternLength(10, zoom);
    const edgeThreshold = screenToPatternLength(EDGE_HIT_PX, zoom);
    const target = resolveSeamAllowanceClick(
      pieces,
      world,
      vertexThreshold,
      edgeThreshold,
    );
    if (!target) return;

    if (target.kind === 'vertex') {
      // La esquina tiene un verbo propio; arrastrarla aquí sería inventar otro.
      onSelectVertex(target.pieceId, target.vertexIndex);
      return;
    }

    if (target.kind === 'edge') {
      const piece = pieces.find(candidate => candidate.id === target.pieceId);
      const edge = piece?.edges?.find(candidate => candidate.id === target.edgeId);
      const ring = ringsByPiece.get(target.pieceId);
      if (!piece || !edge || !ring) return;
      const local = patternToPieceLocal(world, piece);
      const t = edgeTForPoint(ring, edge.segmentRange, local);
      const point = edgePointAtT(ring, edge.segmentRange, t);
      primedEdgeRef.current = {
        pieceId: piece.id,
        edgeId: edge.id,
        edgeIndex: edge.segmentRange[0],
        edgeRange: edge.segmentRange,
        t,
        // `EdgeTarget.point` va en espacio de PATRÓN — así lo lee
        // `useNotchTool`, que se lo pasa de vuelta a `patternToPieceLocal`. El
        // anillo trabaja en local, así que la vuelta deshace el giro también.
        point: pieceLocalToPattern(point, piece),
        additive: !!e.shiftKey,
      };
      edgeGesture.handleMouseDown(e);
      primedEdgeRef.current = null;
      return;
    }

    const prevWidth = pieces.find(piece => piece.id === target.pieceId)?.seamAllowance ?? 0;
    bodyDragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      touched: new Set([target.pieceId]),
      singlePieceId: target.pieceId,
      prevWidth,
    };
  }, [edgeGesture, onSelectVertex, pan, pieces, ringsByPiece, zoom]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const bodyDrag = bodyDragRef.current;
    if (!bodyDrag) {
      edgeGesture.handleMouseMove(e);
      return;
    }

    if (!bodyDrag.moved) {
      const dx = e.clientX - bodyDrag.startX;
      const dy = e.clientY - bodyDrag.startY;
      if (Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX) bodyDrag.moved = true;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const world = screenToPattern(e.clientX, e.clientY, rect, zoom, pan);
    const target = resolveSeamAllowanceClick(
      pieces,
      world,
      screenToPatternLength(10, zoom),
      screenToPatternLength(EDGE_HIT_PX, zoom),
    );
    // El cuerpo que ganó el press no se convierte en tramo al rozar un borde.
    if (target?.kind === 'piece') bodyDrag.touched.add(target.pieceId);
  }, [edgeGesture, pan, pieces, zoom]);

  const handleMouseUp = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const bodyDrag = bodyDragRef.current;
    if (!bodyDrag) {
      edgeGesture.handleMouseUp(e);
      return;
    }

    bodyDragRef.current = null;
    if (bodyDrag.moved && bodyDrag.touched.size > 0) {
      onApplyAll([...bodyDrag.touched], widthMm);
    } else {
      onApply(bodyDrag.singlePieceId, widthMm, bodyDrag.prevWidth);
    }
  }, [edgeGesture, onApply, onApplyAll, widthMm]);

  const cancel = useCallback(() => {
    bodyDragRef.current = null;
    primedEdgeRef.current = null;
    edgeGesture.cancel();
  }, [edgeGesture]);

  const isArmed = useCallback(
    () => bodyDragRef.current !== null || edgeGesture.isArmed(),
    [edgeGesture],
  );

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key !== 'Escape' || !isArmed()) return;
    cancel();
    e.preventDefault();
    e.stopPropagation();
  }, [cancel, isArmed]);

  return {
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleKeyDown,
    cancel,
    isArmed,
    widthMm,
  };
}
