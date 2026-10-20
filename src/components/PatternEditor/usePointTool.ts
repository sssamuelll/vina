/**
 * usePointTool.ts — dock tool "Punto" (maria-203, #197, #172).
 *
 * Un gesto (press-track-release) y tres verbos despachados por el chip activo
 * de tool-options: añadir punto / convertir en curva por puntos / convertir en
 * bezier. El contexto solo NIEGA, nunca adivina: un ancla existente dentro del
 * radio no es objetivo (guard de findInsertTarget), una curva solo acepta el
 * chip 'point', una pieza bloqueada avisa al soltar. Este tool nunca
 * selecciona ni mueve puntos — eso es de editPattern, y María pidió
 * explícitamente esa separación.
 *
 * Gramática completa: propuesta de Petra Haft, sesión maria dock-tool-puntos.
 */
import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '../../store';
import {
  beginUndoBatch,
  endUndoBatch,
  isUndoBatchTokenActive,
  type UndoBatchToken,
} from '../../store/undoMiddleware';
import type { PathCommand, PatternPiece, Point2D } from '../../types/types';
import { computeNotchAnchor } from '../../utils/notchAnchor';
import { piezaBloqueada } from '../../utils/piezaBloqueada';
import { pushJournal } from '../../utils/telemetry/journal';
import { screenToPattern, screenToPatternLength } from '../../utils/geometry';
import { arcToNativeT } from '../../utils/geometry/arcToNative';
import {
  buildRing,
  pointAt,
  projectToRing,
  type OutlineRing,
} from '../../utils/geometry/outlineRing';
import { getEdgeEndpoints } from '../../utils/geometry/path';
import { edgeRangeForCommand } from '../../utils/semanticEdges';
import { patternToPieceLocal, pieceLocalToPattern } from './useEditPattern';
import { extractNodes, getAnchor, hitTestNode, nearestSegment, type EditableNode } from './nodeEditorUtils';
import { dondeCaeElPunto, largoDelLado, type Cuenta } from './cotas/loQueSePone';
import { spanLengthMm, unwrapOnSpan } from './distanceCommit';
import { edgeSpanMm } from './edgeArc';
import type { EdgeCommit, EdgeTarget } from './edgeGesture';
import { EDGE_HIT_PX } from './gestureConstants';
import { noPasoNada } from './noPasoNada';
import { useEdgeGesture } from './useEdgeGesture';

export type PointToolMode = 'point' | 'curvePoints' | 'bezier';

/** Estable: un `{}` nuevo en cada render rehacía los callbacks que lo usan. */
const SIN_CAPAS_BLOQUEADAS: Readonly<Record<number, boolean>> = {};

/** Objetivo resuelto bajo el cursor (coords de mundo para el preview). */
export interface PointToolTarget {
  pieceId: string;
  commandIndex: number;
  t: number;
  /** Proyección sobre el lado, en mundo — el glyph del chip 'point'. */
  world: Point2D;
  /** Extremos del lado en mundo — el highlight de los chips de conversión. */
  sideEnds: [Point2D, Point2D] | null;
}

export interface PointToolHover {
  target: PointToolTarget | null;
  /**
   * 'ok'       → aplicable: crosshair + preview + clic despacha.
   * 'anchor'   → hay un punto existente en el radio: not-allowed, sin preview.
   * 'curveMode'→ lado curvo con chip de conversión: not-allowed, sin preview.
   * 'locked'   → pieza bloqueada: not-allowed; el verbo avisa al soltar.
   */
  reason: 'ok' | 'anchor' | 'curveMode' | 'locked';
}

/**
 * El punto que se está terminando de poner (spec 2026-10-02 § 5.2). `base` es
 * la pieza de antes del clic: mover el punto es volver a ponerlo desde ella.
 */
export interface PuntoPuesto {
  pieceId: string;
  base: PatternPiece;
  cuenta: Cuenta;
  distanciaMm: number;
  /** El lado desde la esquina, en el sentido de la cuenta: el techo de la cota. */
  ladoMm: number;
  /** El vértice puesto, en coordenadas locales. */
  vertice: Point2D;
  /** El contorno que se escribió: si el vivo ya no es este, el punto ya no es el nuestro. */
  esperado: PathCommand[];
  sesion: number;
}

interface PointEdgeTarget extends EdgeTarget {
  /** El clic no necesita ir arco→nativo→arco: `nearestSegment` ya resolvió
   *  el parámetro que consume De Casteljau y el press tiene que conservarlo. */
  nativeT: number;
}

function edgeTAtMm(ring: OutlineRing, spanMm: [number, number], mm: number): number {
  const lengthMm = spanLengthMm(ring, spanMm);
  if (lengthMm <= 0) return 0;
  const unwrapped = unwrapOnSpan(ring, spanMm, mm);
  return Math.max(0, Math.min(1, (unwrapped - spanMm[0]) / lengthMm));
}

function mmAtEdgeT(ring: OutlineRing, spanMm: [number, number], t: number): number {
  return spanMm[0] + Math.max(0, Math.min(1, t)) * spanLengthMm(ring, spanMm);
}

/**
 * Un extremo de borde merece trato explícito: `pointAt(perímetro)` normaliza
 * a cero y devolvería el primer comando, aunque el press pertenezca al cierre.
 */
function pointOnPressedEdge(
  ring: OutlineRing,
  edgeRange: [number, number],
  t: number,
): { commandIndex: number; tLocal: number } {
  const edgeSegments = ring.segments.filter(
    segment => segment.commandIndex >= edgeRange[0] && segment.commandIndex < edgeRange[1],
  );
  if (t <= 0 && edgeSegments[0]) {
    return { commandIndex: edgeSegments[0].commandIndex, tLocal: 0 };
  }
  const last = edgeSegments[edgeSegments.length - 1];
  if (t >= 1 && last) return { commandIndex: last.commandIndex, tLocal: 1 };
  const spanMm = edgeSpanMm(ring, edgeRange);
  return pointAt(ring, mmAtEdgeT(ring, spanMm, t));
}

export function usePointTool(
  zoom: number,
  pan: Point2D,
  pieces: PatternPiece[],
  verbs: {
    addPointOnSegment: (commandIndex: number, t: number, pieceId?: string, undoBatchToken?: UndoBatchToken) => PathCommand[] | null | void;
    /** Opcional para los arneses viejos: sin él, el punto se pone y no trae cota. */
    reinsertarPunto?: (base: PatternPiece, commandIndex: number, t: number, undoBatchToken?: UndoBatchToken) => PathCommand[] | null;
    convertSegment: (commandIndex: number, toCurve: boolean, pieceId?: string) => void;
    convertSegmentToPoints: (commandIndex: number, pieceId?: string) => void;
  },
) {
  const dispatch = useDispatch();
  const [hover, setHover] = useState<PointToolHover | null>(null);
  const [puesto, setPuesto] = useState<PuntoPuesto | null>(null);
  const loteRef = useRef<UndoBatchToken | null>(null);
  const sesiones = useRef(0);
  // El candado de capa pesa igual que el de la pieza (#1136). Encadenado para
  // los stores mínimos de los tests, sin `project`.
  const layerLocked = useSelector((s: RootState) => s.project?.layerLocked) ?? SIN_CAPAS_BLOQUEADAS;

  /** Cierra la cota y su lote de deshacer: poner y terminar de poner es una sola entrada. */
  const terminarPuesto = useCallback(() => {
    const lote = loteRef.current;
    loteRef.current = null;
    if (lote && isUndoBatchTokenActive(lote)) endUndoBatch(dispatch, lote);
    setPuesto(null);
  }, [dispatch]);

  const mode: PointToolMode = useSelector((s: RootState) => {
    const opts = s.tools.toolOptions?.point as { mode?: PointToolMode } | undefined;
    return opts?.mode ?? 'point';
  });

  const activeTool = useSelector((s: RootState) => s.editor?.activeTool);

  // Nodos por pieza para el guard de ancla — memo por identidad de `pieces`,
  // no por evento de mouse.
  const nodesByPiece = useMemo(() => {
    const m = new Map<string, EditableNode[]>();
    for (const p of pieces) m.set(p.id, extractNodes(p));
    return m;
  }, [pieces]);

  const ringsByPiece = useMemo(() => {
    const rings = new Map<string, OutlineRing>();
    for (const piece of pieces) {
      const built = buildRing(piece.outline, 2);
      if (built.ok) rings.set(piece.id, built.value);
    }
    return rings;
  }, [pieces]);

  const resolveHover = useCallback(
    (e: React.MouseEvent<SVGSVGElement>): PointToolHover | null => {
      const rect = e.currentTarget.getBoundingClientRect();
      const world = screenToPattern(e.clientX, e.clientY, rect, zoom, pan);
      const hitRadius = screenToPatternLength(EDGE_HIT_PX, zoom);

      // La pieza de más arriba primero: que gane la que se ve.
      for (let i = pieces.length - 1; i >= 0; i--) {
        const piece = pieces[i];
        if (!piece.outline?.length) continue;
        const local = patternToPieceLocal(world, piece);
        const nodes = nodesByPiece.get(piece.id) ?? [];

        // Ancla existente dentro del radio: hay algo, pero no es objetivo —
        // el mismo guard que refuta el doble clic accidental.
        if (hitTestNode(local, nodes, hitRadius)) {
          return { target: null, reason: 'anchor' };
        }

        const hit = nearestSegment(local, piece.outline);
        if (!hit || hit.distance >= hitRadius) continue;
        // El cierre fantasma de un contorno abierto llega como M. No hay un
        // comando real que dividir ahí, así que armar el gesto crearía undo
        // sin cambio visible.
        if (piece.outline[hit.commandIndex]?.type === 'M') continue;

        const cmdType = piece.outline[hit.commandIndex]?.type;
        const isCurve = cmdType === 'C' || cmdType === 'Q';
        const ep = getEdgeEndpoints(piece.outline, hit.commandIndex);
        const target: PointToolTarget = {
          pieceId: piece.id,
          commandIndex: hit.commandIndex,
          t: hit.t,
          world: pieceLocalToPattern(hit.point, piece),
          sideEnds: ep
            ? [pieceLocalToPattern(ep.start, piece), pieceLocalToPattern(ep.end, piece)]
            : null,
        };
        if (isCurve && mode !== 'point') return { target, reason: 'curveMode' };
        if (piece.locked) return { target, reason: 'locked' };
        return { target, reason: 'ok' };
      }
      return null;
    },
    [zoom, pan, pieces, nodesByPiece, mode],
  );

  /** El press traduce el objetivo nativo de Punto al contrato de arco del gesto. */
  const resolveTarget = useCallback((e: React.MouseEvent<SVGSVGElement>): PointEdgeTarget | null => {
    const h = resolveHover(e);
    setHover(h);
    // `locked` se arma a propósito: el verbo común conserva el gate y emite
    // el toast una sola vez. Los otros rechazos no deben crear gesto alguno.
    if (!h?.target || (h.reason !== 'ok' && h.reason !== 'locked')) return null;
    const pointTarget = h.target;
    const piece = pieces.find(candidate => candidate.id === pointTarget.pieceId);
    const ring = ringsByPiece.get(pointTarget.pieceId);
    if (!piece || !ring) return null;

    const edgeRange = edgeRangeForCommand(piece, pointTarget.commandIndex);
    const spanMm = edgeSpanMm(ring, edgeRange);
    const localPoint = patternToPieceLocal(pointTarget.world, piece);
    const pressMm = projectToRing(ring, localPoint).distanceMm;
    return {
      pieceId: piece.id,
      edgeIndex: pointTarget.commandIndex,
      edgeRange,
      t: edgeTAtMm(ring, spanMm, pressMm),
      point: pointTarget.world,
      nativeT: pointTarget.t,
    };
  }, [resolveHover, pieces, ringsByPiece]);

  /**
   * El release se proyecta sobre el anillo y se clampea al borde del press.
   * Aunque caiga sobre otra pieza o borde, solo cambia el valor, nunca el objeto.
   */
  const resolveReleaseT = useCallback((
    e: React.MouseEvent<SVGSVGElement>,
    press: EdgeTarget,
  ): number | null => {
    const piece = pieces.find(candidate => candidate.id === press.pieceId);
    const ring = ringsByPiece.get(press.pieceId);
    if (!piece || !ring) return null;
    const rect = e.currentTarget.getBoundingClientRect();
    const world = screenToPattern(e.clientX, e.clientY, rect, zoom, pan);
    const local = patternToPieceLocal(world, piece);
    const releaseMm = projectToRing(ring, local).distanceMm;
    return edgeTAtMm(ring, edgeSpanMm(ring, press.edgeRange), releaseMm);
  }, [pieces, ringsByPiece, zoom, pan]);

  const onCommit = useCallback((commit: EdgeCommit) => {
    const target = commit.target as PointEdgeTarget;
    const piece = pieces.find(candidate => candidate.id === target.pieceId);
    if (!piece) return;

    // Los dos modos convierten un comando entero: cruzar el umbral no puede
    // volverlos no-op ni re-apuntarlos. Para ellos todo commit es el clic del press.
    if (mode === 'curvePoints') {
      verbs.convertSegmentToPoints(target.edgeIndex, target.pieceId);
      return;
    }
    if (mode === 'bezier') {
      verbs.convertSegment(target.edgeIndex, true, target.pieceId);
      return;
    }

    // Poner el punto abre su cota: un lote de deshacer para el punto y todo lo
    // que se escriba en ella. La pieza bloqueada la avisa el verbo.
    const poner = (commandIndex: number, nativeT: number) => {
      terminarPuesto();
      if (piezaBloqueada(piece, layerLocked) || !verbs.reinsertarPunto) {
        verbs.addPointOnSegment(commandIndex, nativeT, piece.id);
        return;
      }
      const lote = beginUndoBatch(dispatch, 'Poner punto');
      const escrito = verbs.addPointOnSegment(commandIndex, nativeT, piece.id, lote);
      const vertice = escrito ? getAnchor(escrito[commandIndex]) : null;
      const ancla = vertice ? computeNotchAnchor(piece.outline, vertice, 2) : null;
      const ladoMm = ancla ? largoDelLado(piece.outline, ancla) : null;
      if (!escrito || !vertice || !ancla || ladoMm === null) {
        endUndoBatch(dispatch, lote);
        return;
      }
      loteRef.current = lote;
      setPuesto({
        pieceId: piece.id,
        base: piece,
        cuenta: { refPoint: ancla.refPoint, direction: ancla.direction },
        distanciaMm: ancla.distanceMm,
        ladoMm,
        vertice,
        esperado: escrito,
        sesion: ++sesiones.current,
      });
    };

    if (commit.kind === 'click') {
      poner(target.edgeIndex, target.nativeT);
      return;
    }

    const ring = ringsByPiece.get(target.pieceId);
    if (!ring) return;
    const at = pointOnPressedEdge(ring, target.edgeRange, commit.releaseT);
    const command = piece.outline[at.commandIndex];
    const endpoints = command && getEdgeEndpoints(piece.outline, at.commandIndex);
    if (!command || !endpoints) {
      // El press acertó el borde y el release cayó fuera de todo comando: sin
      // esto el punto no nace y el gesto se ve igual que uno bueno (#1117).
      noPasoNada('point:sin-comando', { pieceId: target.pieceId, commandIndex: at.commandIndex });
      return;
    }
    // `pointAt` habla en fracción de ARCO del comando; `splitSegmentAt`, al
    // final del verbo, habla en parámetro nativo de De Casteljau. En una sisa
    // esos números no coinciden, de ahí la conversión explícita.
    const nativeT = arcToNativeT(command, endpoints.start, at.tLocal);
    poner(at.commandIndex, nativeT);
  }, [pieces, ringsByPiece, mode, verbs, terminarPuesto, dispatch, layerLocked]);

  /** Lo que escribe la cota del punto: volver a ponerlo a esa distancia de la esquina. */
  const moverPuesto = useCallback((distanciaMm: number) => {
    const p = puesto;
    if (!p || !verbs.reinsertarPunto) return;
    const viva = pieces.find(pc => pc.id === p.pieceId);
    // ponytail: la vida del punto se mide por el contorno que escribimos. Un
    // cambio de la pieza que no toque el contorno (moverla desde la IA con la
    // cota abierta) se perdería al volver a ponerlo desde la pieza de antes.
    if (!viva || viva.outline !== p.esperado) {
      pushJournal('gesture', 'punto:puesto-perdido', { pieceId: p.pieceId });
      terminarPuesto();
      return;
    }
    const donde = dondeCaeElPunto(p.base.outline, p.cuenta, distanciaMm);
    if (donde === null) {
      noPasoNada('point:sin-comando', { pieceId: p.pieceId });
      return;
    }
    if (donde === 'sobre-un-punto') {
      noPasoNada('point:sobre-un-punto', { pieceId: p.pieceId, distanciaMm });
      return;
    }
    const lote = loteRef.current && isUndoBatchTokenActive(loteRef.current) ? loteRef.current : undefined;
    const escrito = verbs.reinsertarPunto(p.base, donde.commandIndex, donde.nativeT, lote);
    const vertice = escrito ? getAnchor(escrito[donde.commandIndex]) : null;
    if (!escrito || !vertice) return;
    setPuesto({ ...p, distanciaMm, vertice, esperado: escrito });
  }, [puesto, pieces, verbs, terminarPuesto]);

  const gesture = useEdgeGesture({ resolveTarget, resolveReleaseT, onCommit });
  const { cancel: cancelGesture } = gesture;

  // Salir del tool cancela el gesto, no solo su indicador: si el mouseup llega
  // después del cambio de herramienta no debe escribir un punto rezagado.
  useEffect(() => {
    if (activeTool !== 'point') {
      setHover(null);
      cancelGesture();
      terminarPuesto();
    }
  }, [activeTool, cancelGesture, terminarPuesto]);

  // La cota del punto descansa en reposo (no se lleva el foco), así que su vida
  // la cierran los demás: el siguiente clic, Esc, otra herramienta, o que el
  // punto ya no sea el nuestro —un deshacer se lo llevó—. En ese caso se va sola.
  const vivaDelPuesto = puesto ? pieces.find(pc => pc.id === puesto.pieceId) : undefined;
  useEffect(() => {
    if (puesto && vivaDelPuesto?.outline !== puesto.esperado) {
      pushJournal('gesture', 'punto:puesto-perdido', { pieceId: puesto.pieceId });
      terminarPuesto();
    }
  }, [puesto, vivaDelPuesto, terminarPuesto]);

  // Desmontar con la cota abierta no deja el lote colgado.
  useEffect(() => () => {
    const lote = loteRef.current;
    if (lote && isUndoBatchTokenActive(lote)) endUndoBatch(dispatch, lote);
  }, [dispatch]);

  /** El siguiente clic en el lienzo cierra la cota del punto anterior, ponga o no otro. */
  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    terminarPuesto();
    gesture.handleMouseDown(e);
  }, [gesture, terminarPuesto]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    gesture.handleMouseMove(e);
    if (!gesture.isArmed()) setHover(resolveHover(e));
  }, [gesture, resolveHover]);

  const handleMouseUp = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    gesture.handleMouseUp(e);
    setHover(resolveHover(e));
  }, [gesture, resolveHover]);

  /** Al salir del lienzo de golpe no llega mousemove que lo apague (#1132). */
  const limpiarHover = useCallback(() => setHover(null), []);

  /**
   * Esc con colocación armada = cancelar SOLO eso (coordinación CF-1). Sin
   * colocación, y con la cota del punto a la vista, Esc cierra la cota: el
   * punto se queda donde se puso, y la tecla no sigue a la selección.
   */
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (gesture.isArmed()) {
        gesture.cancel();
      } else if (puesto) {
        pushJournal('gesture', 'cota:loQueSePone:cierra', { que: 'punto', via: 'esc' });
        terminarPuesto();
      } else {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
    },
    [gesture, puesto, terminarPuesto],
  );

  const getCursor = useCallback((): string => {
    if (!hover) return 'default';
    return hover.reason === 'ok' ? 'crosshair' : 'not-allowed';
  }, [hover]);

  return {
    /** Para el overlay: preview solo cuando reason === 'ok'. */
    hover,
    mode,
    armed: gesture.phase !== 'idle',
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleKeyDown,
    getCursor,
    limpiarHover,
    /** El punto recién puesto, con su cota abierta (spec 2026-10-02 § 5.2). */
    puesto,
    moverPuesto,
    terminarPuesto,
  };
}
