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
import { useState, useCallback, useEffect, useMemo } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import type { PatternPiece, Point2D } from '../../types/types';
import { screenToPattern, screenToPatternLength } from '../../utils/geometry';
import { arcToNativeT } from '../../utils/geometry/arcToNative';
import {
  buildRing,
  distanceAt,
  pointAt,
  projectToRing,
  type OutlineRing,
} from '../../utils/geometry/outlineRing';
import { getEdgeEndpoints } from '../../utils/geometry/path';
import { edgeRangeForCommand } from '../../utils/semanticEdges';
import { patternToPieceLocal, pieceLocalToPattern } from './useEditPattern';
import { extractNodes, hitTestNode, nearestSegment, type EditableNode } from './nodeEditorUtils';
import { spanLengthMm, unwrapOnSpan } from './distanceCommit';
import type { EdgeCommit, EdgeTarget } from './edgeGesture';
import { EDGE_HIT_PX } from './gestureConstants';
import { useEdgeGesture } from './useEdgeGesture';

export type PointToolMode = 'point' | 'curvePoints' | 'bezier';

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

interface PointEdgeTarget extends EdgeTarget {
  /** El clic no necesita ir arco→nativo→arco: `nearestSegment` ya resolvió
   *  el parámetro que consume De Casteljau y el press tiene que conservarlo. */
  nativeT: number;
}

/** Distancias de anillo que delimitan un borde, incluido el cierre que cruza 0. */
function edgeSpanMm(ring: OutlineRing, edgeRange: [number, number]): [number, number] {
  const startMm = distanceAt(ring, { commandIndex: edgeRange[0], tLocal: 0 });
  const rawEndMm = distanceAt(ring, { commandIndex: edgeRange[1] - 1, tLocal: 1 });
  // El cierre termina en el origen: 0 y el perímetro son el mismo punto. Si
  // no se deja cruzar el origen, clampear ese borde escogería su complemento.
  return startMm > 0 && rawEndMm >= ring.totalMm - 1e-6
    ? [startMm, 0]
    : [startMm, rawEndMm];
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
    addPointOnSegment: (commandIndex: number, t: number, pieceId?: string) => void;
    convertSegment: (commandIndex: number, toCurve: boolean, pieceId?: string) => void;
    convertSegmentToPoints: (commandIndex: number, pieceId?: string) => void;
  },
) {
  const [hover, setHover] = useState<PointToolHover | null>(null);

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

    if (commit.kind === 'click') {
      verbs.addPointOnSegment(target.edgeIndex, target.nativeT, target.pieceId);
      return;
    }

    const ring = ringsByPiece.get(target.pieceId);
    if (!ring) return;
    const at = pointOnPressedEdge(ring, target.edgeRange, commit.releaseT);
    const command = piece.outline[at.commandIndex];
    const endpoints = command && getEdgeEndpoints(piece.outline, at.commandIndex);
    if (!command || !endpoints) return;
    // `pointAt` habla en fracción de ARCO del comando; `splitSegmentAt`, al
    // final del verbo, habla en parámetro nativo de De Casteljau. En una sisa
    // esos números no coinciden, de ahí la conversión explícita.
    const nativeT = arcToNativeT(command, endpoints.start, at.tLocal);
    verbs.addPointOnSegment(at.commandIndex, nativeT, target.pieceId);
  }, [pieces, ringsByPiece, mode, verbs]);

  const gesture = useEdgeGesture({ resolveTarget, resolveReleaseT, onCommit });
  const { cancel: cancelGesture } = gesture;

  // Salir del tool cancela el gesto, no solo su indicador: si el mouseup llega
  // después del cambio de herramienta no debe escribir un punto rezagado.
  useEffect(() => {
    if (activeTool !== 'point') {
      setHover(null);
      cancelGesture();
    }
  }, [activeTool, cancelGesture]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    gesture.handleMouseMove(e);
    if (!gesture.isArmed()) setHover(resolveHover(e));
  }, [gesture, resolveHover]);

  const handleMouseUp = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    gesture.handleMouseUp(e);
    setHover(resolveHover(e));
  }, [gesture, resolveHover]);

  /** Esc con colocación armada = cancelar SOLO eso (coordinación CF-1). */
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && gesture.isArmed()) {
        gesture.cancel();
        e.preventDefault();
        e.stopPropagation();
      }
    },
    [gesture],
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
    handleMouseDown: gesture.handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleKeyDown,
    getCursor,
  };
}
