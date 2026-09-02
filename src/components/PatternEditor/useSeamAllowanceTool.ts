import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import type { PatternPiece, Point2D } from '../../types/types';
import { screenToPattern, screenToPatternLength } from '../../utils/geometry';
import {
  patternToPieceLocal,
  pieceLocalToPattern,
} from '../../utils/geometry/pieceSpace';
import { resolveSeamAllowanceClick } from '../../utils/seam/edgeHitTest';
import { margenEnPunto, type MargenEnPunto } from '../../utils/seam/margenEnPunto';
import { pushJournal } from '../../utils/telemetry/journal';
import type { SeamAllowanceAnchor } from './cotas/sujeto';
import { edgePointAtT, edgeTForPoint, ringForOutline } from './edgeArc';
import type { EdgeCommit, EdgeTarget } from './edgeGesture';
import { DRAG_THRESHOLD_PX, EDGE_HIT_PX, VERTEX_HIT_PX } from './gestureConstants';
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

interface LastPointer {
  clientX: number;
  clientY: number;
  rect: DOMRect;
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
  active = true,
) {
  const widthMm = useSelector((s: RootState) => s.editor.defaultSeamAllowanceWidth);
  const { onApply, onApplyAll, onApplySpan, onSelectEdge, onSelectVertex } = callbacks;
  const panX = pan.x;
  const panY = pan.y;
  const [hover, setHover] = useState<SeamAllowanceAnchor | null>(null);
  const [ancla, setAncla] = useState<SeamAllowanceAnchor | null>(null);
  const [abrirChip, setAbrirChip] = useState(0);
  /** Lo último que se enseñó, con su identidad (borde + fuente + tramo) para la bitácora. */
  const hoverRef = useRef<{ anchor: SeamAllowanceAnchor; identity: string } | null>(null);
  const ultimoPuntero = useRef<LastPointer | null>(null);
  const hitOrder = useMemo(() => [...pieces].reverse(), [pieces]);

  const bodyDragRef = useRef<BodyDrag | null>(null);
  // Un press que no armó gesto (esquina, vacío) también apaga la lectura
  // hasta soltar: con el botón abajo no se lee (spec § 4.5 #5).
  const presionado = useRef(false);
  // `useEdgeGesture` resuelve su objetivo durante el mismo mousedown. Este ref
  // evita repetir el hit-test y, sobre todo, fija exactamente la rama que ganó.
  const primedEdgeRef = useRef<SeamAllowanceEdgeTarget | null>(null);

  const setHoverResuelto = useCallback((next: SeamAllowanceAnchor | null, margen?: MargenEnPunto) => {
    if (!next || !margen) {
      if (!hoverRef.current) return;
      hoverRef.current = null;
      setHover(null);
      return;
    }

    const spanIndex = margen.fuente === 'tramo' ? margen.spanIndex : '';
    const identity = `${next.pieceId}\u0000${next.edgeId}\u0000${margen.fuente}\u0000${spanIndex}`;
    // El chip sigue al cursor a lo largo del borde (spec § 4.3: el punto
    // proyectado, no el de entrada): `t` se actualiza; la guarda solo evita
    // un objeto nuevo cuando nada cambió, y la bitácora solo oye la identidad.
    const previo = hoverRef.current;
    if (previo?.anchor.pieceId === next.pieceId && previo.anchor.edgeId === next.edgeId && previo.anchor.t === next.t) return;

    hoverRef.current = { anchor: next, identity };
    setHover(next);
    if (previo?.identity !== identity) {
      pushJournal('gesture', 'sa:hover', {
        pieceId: next.pieceId,
        edgeId: next.edgeId,
        fuente: margen.fuente,
        mm: margen.mm,
      });
    }
  }, []);

  const limpiarHover = useCallback(() => {
    // Fuera del SVG ya no existe un punto de pantalla que se pueda revalidar.
    ultimoPuntero.current = null;
    setHoverResuelto(null);
  }, [setHoverResuelto]);

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
    const ring = piece ? ringForOutline(piece.outline) : null;
    if (!piece || !ring) return null;
    const rect = e.currentTarget.getBoundingClientRect();
    const world = screenToPattern(e.clientX, e.clientY, rect, zoom, pan);
    // Por el transform, no restando solo `position`: el anillo se construye
    // sobre el contorno CRUDO, así que un release traído a medias cae sobre
    // otro pedazo del borde — o fuera de él, y lo clampea al extremo que no
    // es. Este `t` es lo que `onApplySpan` escribe en el patrón (#1068).
    return edgeTForPoint(ring, press.edgeRange, patternToPieceLocal(world, piece));
  }, [pieces, zoom, pan]);

  const onCommit = useCallback((commit: EdgeCommit) => {
    const target = commit.target as SeamAllowanceEdgeTarget;
    // El tramo recién creado queda seleccionado para que el panel sea la puerta
    // numérica inmediata; en clic, esta llamada es exactamente la conducta previa.
    onSelectEdge(target.pieceId, target.edgeId, target.additive);
    if (commit.kind === 'drag') {
      onApplySpan(target.pieceId, target.edgeId, commit.range, widthMm);
      setAncla({
        pieceId: target.pieceId,
        edgeId: target.edgeId,
        t: (commit.range[0] + commit.range[1]) / 2,
      });
    } else {
      setAncla({ pieceId: target.pieceId, edgeId: target.edgeId, t: target.t });
      setAbrirChip(value => value + 1);
    }
  }, [onApplySpan, onSelectEdge, widthMm]);

  const edgeGesture = useEdgeGesture({
    resolveTarget: resolveEdgeTarget,
    resolveReleaseT,
    onCommit,
  });

  // Por el ref (`isArmed`, identidad estable), no por el estado `phase`: entre
  // el mouseup y el render que lo confirma llegan movimientos que el estado
  // descartaría. Cuerpo y herramienta ya los filtran los llamadores.
  const { isArmed: gestoArmado } = edgeGesture;
  const resolveHover = useCallback((pointer: LastPointer) => {
    if (gestoArmado()) return;
    const world = screenToPattern(
      pointer.clientX,
      pointer.clientY,
      pointer.rect,
      zoom,
      { x: panX, y: panY },
    );
    const target = resolveSeamAllowanceClick(
      hitOrder,
      world,
      screenToPatternLength(VERTEX_HIT_PX, zoom),
      screenToPatternLength(EDGE_HIT_PX, zoom),
    );
    if (target?.kind !== 'edge') {
      setHoverResuelto(null);
      return;
    }
    const piece = pieces.find(candidate => candidate.id === target.pieceId);
    const edge = piece?.edges?.find(candidate => candidate.id === target.edgeId);
    const ring = piece ? ringForOutline(piece.outline) : null;
    if (!piece || !edge || !ring) {
      setHoverResuelto(null);
      return;
    }
    const t = edgeTForPoint(ring, edge.segmentRange, patternToPieceLocal(world, piece));
    setHoverResuelto({ pieceId: piece.id, edgeId: edge.id, t }, margenEnPunto(piece, edge, t));
  }, [gestoArmado, hitOrder, panX, panY, pieces, setHoverResuelto, zoom]);

  // Zoom, pan o piezas cambian `resolveHover`; con el puntero quieto se vuelve
  // a leer desde el último punto de pantalla (§ 4.5 #11-13).
  useEffect(() => {
    if (!active) {
      limpiarHover();
      setAncla(null);
      return;
    }
    const pointer = ultimoPuntero.current;
    if (pointer) resolveHover(pointer);
  }, [active, limpiarHover, resolveHover]);

  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    limpiarHover();
    if (e.button !== 0) return;
    presionado.current = true;
    // Un press nuevo reemplaza cualquier gesto cuyo release no llegó. La rama
    // que gane abajo será la única dueña hasta soltar.
    bodyDragRef.current = null;
    primedEdgeRef.current = null;
    edgeGesture.cancel();

    const rect = e.currentTarget.getBoundingClientRect();
    const world = screenToPattern(e.clientX, e.clientY, rect, zoom, pan);
    const vertexThreshold = screenToPatternLength(VERTEX_HIT_PX, zoom);
    const edgeThreshold = screenToPatternLength(EDGE_HIT_PX, zoom);
    const target = resolveSeamAllowanceClick(
      hitOrder,
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
      const ring = piece ? ringForOutline(piece.outline) : null;
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
  }, [edgeGesture, hitOrder, limpiarHover, onSelectVertex, pan, pieces, zoom]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const bodyDrag = bodyDragRef.current;
    if (!bodyDrag) {
      if (edgeGesture.isArmed()) {
        edgeGesture.handleMouseMove(e);
        return;
      }
      if (presionado.current) return;
      const pointer = {
        clientX: e.clientX,
        clientY: e.clientY,
        rect: e.currentTarget.getBoundingClientRect(),
      };
      ultimoPuntero.current = pointer;
      resolveHover(pointer);
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
      hitOrder,
      world,
      screenToPatternLength(VERTEX_HIT_PX, zoom),
      screenToPatternLength(EDGE_HIT_PX, zoom),
    );
    // El cuerpo que ganó el press no se convierte en tramo al rozar un borde.
    if (target?.kind === 'piece') bodyDrag.touched.add(target.pieceId);
  }, [edgeGesture, hitOrder, pan, resolveHover, zoom]);

  const handleMouseUp = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    presionado.current = false;
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
    presionado.current = false;
    edgeGesture.cancel();
    // `pointercancel` (lápiz, táctil, el navegador se queda el puntero): no
    // va a llegar ningún mousemove que corrija la lectura (spec § 4.5 #22).
    limpiarHover();
  }, [edgeGesture, limpiarHover]);

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
    hover,
    ancla,
    abrirChip,
    limpiarHover,
  };
}
