import { useState, useCallback, useRef, useMemo } from 'react';
import type { Point2D, PathCommand, PatternPiece } from '../../types/types';
import { screenToPattern, screenToPatternLength } from '../../utils/geometry';
import { patternToPieceLocal } from '../../utils/geometry/pieceSpace';
import { pointInPolygon } from '../../utils/geometry/slashAndSpread';
import { buildSnapIndex, resolveSnap as resolverEnganche } from './snapIndex';
import type { SnapTarget } from './snapIndex';
import { EDGE_HIT_PX, isDrag } from './gestureConstants';
import { nodesToCommands, polarOf, polarPoint, type PolyPenNode } from './polyPenGeometry';
import { pushJournal } from '../../utils/telemetry/journal';

export type { PolyPenNode, PolyPenNodeType } from './polyPenGeometry';

/** El panel "Siguiente punto" abierto: desde dónde y con qué prefijado. */
export interface NextPointState {
  from: Point2D;
  lengthMm: number;
  angleDeg: number;
}

/**
 * El motor de "Línea interna" (spec 2026-08-29 § 4.3–§ 4.6).
 *
 * Un trazo de varios clics sobre UNA pieza anfitriona que fija el primer press
 * y no se re-apunta nunca. Cada press engancha (vértice > extremo de otra
 * interna > contorno, un solo radio: `EDGE_HIT_PX`) y cada release confirma
 * el nodo: recto o curva por puntos según el latch, bezier si hubo arrastre.
 * El cierre se arma sobre el primer nodo y se commitea en el release; tras un
 * commit queda una zona muerta de distancia (no de tiempo) para que el
 * segundo par de un doble clic no nazca como trazo fantasma.
 *
 * Las teclas las trae el dueño del gesto (CF-1, en captura): `handleKeyDown`
 * devuelve si consumió, y solo entonces el router detiene la propagación.
 */

// El enganche vive en `snapIndex.ts` desde el 2026-09-06: lo estrenó esta
// herramienta y ahora lo lee también la pluma (#1102). Se re-exportan los tipos
// para no tocar a `PolyPenToolOverlay`, que los importa de aquí.
export type { SnapKind, SnapTarget } from './snapIndex';

export interface InternalLineToolOptions {
  nodeType: 'straight' | 'curvePoints';
  /** Piezas VISIBLES en orden de dibujo: la última está arriba. */
  pieces: PatternPiece[];
  /** `commands` en coordenadas de mundo; el llamador las baja al marco local de la anfitriona. */
  onComplete: (hostId: string, commands: PathCommand[], closed: boolean) => void;
  onLockedPress?: (pieceId: string) => void;
}

interface Press {
  world: Point2D;
  screen: Point2D;
  snap: SnapTarget | null;
  closes: boolean;
  moved: boolean;
  drag: Point2D | null;
}

interface ViewState {
  nodes: PolyPenNode[];
  previewPoint: Point2D | null;
  /** El ancla del press vivo (ya enganchada): el nodo que va a nacer. */
  pressPoint: Point2D | null;
  isDragging: boolean;
  dragHandle: Point2D | null;
  hover: SnapTarget | null;
  hostId: string | null;
  closeArmed: boolean;
  nextPoint: NextPointState | null;
}

const EMPTY: ViewState = {
  nodes: [], previewPoint: null, pressPoint: null, isDragging: false, dragHandle: null, hover: null, hostId: null, closeArmed: false, nextPoint: null,
};

const dist = (a: Point2D, b: Point2D) => Math.hypot(a.x - b.x, a.y - b.y);

export function usePolyPenTool(zoom: number, pan: Point2D, opts: InternalLineToolOptions) {
  // El commit lee las opciones vigentes, no las de la render en que empezó el
  // trazo: `onComplete` cierra sobre `pieces`, y la anfitriona se resuelve por
  // id en el instante del commit.
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const nodesRef = useRef<PolyPenNode[]>([]);
  const pressRef = useRef<Press | null>(null);
  const hostRef = useRef<string | null>(null);
  const deadZoneRef = useRef<Point2D | null>(null);
  const lastWorldRef = useRef<Point2D | null>(null);
  const hoverRef = useRef<SnapTarget | null>(null);
  const nextPointRef = useRef<NextPointState | null>(null);
  const [view, setView] = useState<ViewState>(EMPTY);

  const { pieces } = opts;

  // Un solo memo por identidad de `pieces`: aplanar nodos, extremos de internas
  // y anillos cuesta, y no puede rehacerse por evento de ratón.
  const indice = useMemo(() => buildSnapIndex(pieces), [pieces]);

  const toWorld = useCallback(
    (e: React.MouseEvent<SVGSVGElement>): Point2D =>
      screenToPattern(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect(), zoom, pan),
    [zoom, pan],
  );

  const radius = useCallback(() => screenToPatternLength(EDGE_HIT_PX, zoom), [zoom]);

  /** El de `snapIndex.ts`, con el primer nodo del trazo vivo como candidato. */
  const resolveSnap = useCallback((world: Point2D, allowFirstNode: boolean): SnapTarget | null => {
    const nodes = nodesRef.current;
    const primero = allowFirstNode && nodes.length >= 3
      ? { point: nodes[0].point, pieceId: hostRef.current }
      : null;
    return resolverEnganche(indice, world, radius(), primero);
  }, [indice, radius]);

  const topmostContaining = useCallback((world: Point2D): string | null => {
    const ps = optsRef.current.pieces;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      if (!p.outline?.length) continue;
      if (pointInPolygon(patternToPieceLocal(world, p), p.outline)) return p.id;
    }
    return null;
  }, []);

  const publish = useCallback(() => {
    const press = pressRef.current;
    const hover = press ? press.snap : hoverRef.current;
    setView({
      nodes: [...nodesRef.current],
      previewPoint: lastWorldRef.current,
      pressPoint: press ? (press.snap?.point ?? press.world) : null,
      isDragging: !!press?.moved,
      dragHandle: press?.moved ? press.drag : null,
      hover,
      hostId: hostRef.current,
      closeArmed: !!press?.closes || hover?.kind === 'firstNode',
      nextPoint: nextPointRef.current,
    });
  }, []);

  const reset = useCallback(() => {
    nodesRef.current = [];
    pressRef.current = null;
    hostRef.current = null;
    hoverRef.current = null;
    nextPointRef.current = null;
    publish();
  }, [publish]);

  const cancelPress = useCallback(() => {
    pressRef.current = null;
    publish();
  }, [publish]);

  const finish = useCallback((closed: boolean) => {
    const nodes = nodesRef.current;
    const host = hostRef.current;
    const cmds = nodesToCommands(nodes, closed);
    reset();
    if (cmds.length && host) optsRef.current.onComplete(host, cmds, closed);
  }, [reset]);

  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const world = toWorld(e);
    lastWorldRef.current = world;
    const r = radius();
    const nodes = nodesRef.current;
    // Bitácora: cada press deja su desenlace (spec caja-negra § 3.3). Un press
    // que no arma es mudo para Redux; sin esto no queda rastro.
    const journalPress = (fields: Record<string, unknown>) =>
      pushJournal('gesture', 'internalShape:press', { hostId: hostRef.current, nodes: nodes.length, ...fields });
    if (deadZoneRef.current && dist(world, deadZoneRef.current) <= r) {
      journalPress({ armed: false, why: 'deadZone' });
      return;
    }

    const closes = nodes.length >= 3 && dist(world, nodes[0].point) <= r;
    // Encima del último nodo: un tramo de largo cero es basura, y es lo que
    // el segundo clic de un doble clic pondría.
    if (!closes && nodes.length >= 1 && dist(world, nodes[nodes.length - 1].point) <= r) {
      journalPress({ armed: false, why: 'lastNode' });
      return;
    }

    const snap = closes ? null : resolveSnap(world, false);
    if (nodes.length === 0) {
      // La anfitriona la fija el primer press: la pieza del objetivo si
      // engancha, si no la de arriba cuyo CONTORNO contiene el press.
      const hostId = snap?.pieceId ?? topmostContaining(world);
      if (!hostId) {
        journalPress({ armed: false, why: 'noHost', snap: snap?.kind ?? null });
        return;
      }
      const host = optsRef.current.pieces.find(p => p.id === hostId);
      if (host?.locked) {
        journalPress({ armed: false, why: 'locked', hostId });
        optsRef.current.onLockedPress?.(hostId);
        return;
      }
      hostRef.current = hostId;
    }
    pressRef.current = { world, screen: { x: e.clientX, y: e.clientY }, snap, closes, moved: false, drag: null };
    journalPress({ armed: true, snap: snap?.kind ?? null, hostId: hostRef.current, closes });
    publish();
  }, [toWorld, radius, resolveSnap, topmostContaining, publish]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const world = toWorld(e);
    lastWorldRef.current = world;
    if (deadZoneRef.current && dist(world, deadZoneRef.current) > radius()) deadZoneRef.current = null;

    const press = pressRef.current;
    if (press) {
      if (!press.moved && isDrag(e.clientX - press.screen.x, e.clientY - press.screen.y)) press.moved = true;
      if (press.moved) press.drag = world;
      publish();
      return;
    }
    hoverRef.current = resolveSnap(world, true);
    publish();
  }, [toWorld, radius, resolveSnap, publish]);

  const handleMouseUp = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const press = pressRef.current;
    const journalRelease = (fields: Record<string, unknown>) =>
      pushJournal('gesture', 'internalShape:release', { nodes: nodesRef.current.length, ...fields });
    if (!press) {
      journalRelease({ outcome: 'ignored', why: 'noPress' });
      return;
    }
    // Solo el botón izquierdo confirma: un release del derecho a mitad de
    // press no es un nodo (el mismo agujero que tenía el rectángulo).
    if (e.button !== 0) {
      journalRelease({ outcome: 'ignored', why: 'button', button: e.button });
      return;
    }
    pressRef.current = null;
    lastWorldRef.current = toWorld(e);
    if (press.closes) {
      // Zona muerta de distancia, no de tiempo, y SOLO tras cerrar con el
      // puntero: el segundo par de un doble clic sobre el nodo 1 cae aquí y no
      // arma un trazo nuevo. Tras Enter no sigue ningún par, y una zona muerta
      // ahí bloqueaba el clic que continúa desde el extremo recién terminado
      // (lo cazó el e2e de la gramática, 2026-08-29).
      const origin = nodesRef.current[0]?.point ?? null;
      journalRelease({ outcome: 'close' });
      finish(true);
      deadZoneRef.current = origin;
      return;
    }
    const point = press.snap?.point ?? press.world;
    const bezier = !!(press.moved && press.drag);
    const node: PolyPenNode = bezier && press.drag
      ? {
          point,
          type: 'bezier',
          handleOut: press.drag,
          handleIn: { x: 2 * point.x - press.drag.x, y: 2 * point.y - press.drag.y },
        }
      : { point, type: optsRef.current.nodeType };
    nodesRef.current = [...nodesRef.current, node];
    journalRelease({ outcome: 'node', bezier });
    publish();
  }, [toWorld, finish, publish]);

  const handleDoubleClick = useCallback(() => {
    if (nodesRef.current.length >= 2) finish(false);
  }, [finish]);

  // ─── Siguiente punto (spec 2026-08-29 § 7.2) ─────────────────────────────

  /** Tab: abre el panel prefijado con la goma (último nodo → cursor). */
  const openNextPoint = useCallback(() => {
    const nodes = nodesRef.current;
    if (nodes.length === 0) return;
    const from = nodes[nodes.length - 1].point;
    const { lengthMm, angleDeg } = polarOf(from, lastWorldRef.current ?? from);
    nextPointRef.current = { from, lengthMm, angleDeg };
    publish();
  }, [publish]);

  const closeNextPoint = useCallback(() => {
    if (!nextPointRef.current) return;
    nextPointRef.current = null;
    // Escape y "Cerrar" nacen dentro del panel: invisibles para el router.
    pushJournal('gesture', 'internalShape:nextPoint', { op: 'close' });
    publish();
  }, [publish]);

  /** Coloca un nodo del tipo latcheado a largo y ángulo del último (sin enganche). */
  const placePolar = useCallback((lengthMm: number, angleDeg: number) => {
    const nodes = nodesRef.current;
    if (nodes.length === 0) return;
    const from = nodes[nodes.length - 1].point;
    const point = polarPoint(from, lengthMm, angleDeg);
    nodesRef.current = [...nodes, { point, type: optsRef.current.nodeType }];
    if (nextPointRef.current) nextPointRef.current = { ...nextPointRef.current, from: point };
    pushJournal('gesture', 'internalShape:nextPoint', { op: 'place', length: lengthMm, angle: angleDeg, nodes: nodes.length + 1 });
    publish();
  }, [publish]);

  /** true = la tecla era del trazo y se consumió. */
  const handleKeyDown = useCallback((e: KeyboardEvent): boolean => {
    const nodes = nodesRef.current;
    switch (e.key) {
      case 'Escape':
        if (pressRef.current) { cancelPress(); return true; }
        if (nodes.length > 0) { reset(); return true; }
        return false;
      case 'Enter':
        if (nodes.length >= 2) { finish(false); return true; }
        return false;
      case 'Tab':
        if (nodes.length === 0) return false;
        openNextPoint();
        return true;
      case 'Backspace':
      case 'Delete':
        if (nodes.length === 0) return false;
        if (nodes.length === 1) { reset(); return true; }
        nodesRef.current = nodes.slice(0, -1);
        publish();
        return true;
      default:
        return false;
    }
  }, [cancelPress, reset, finish, publish, openNextPoint]);

  const isTracing = useCallback(() => nodesRef.current.length > 0 || pressRef.current !== null, []);
  const isArmed = useCallback(() => pressRef.current !== null, []);

  return {
    nodes: view.nodes,
    previewPoint: view.previewPoint,
    pressPoint: view.pressPoint,
    isDragging: view.isDragging,
    dragHandle: view.dragHandle,
    hover: view.hover,
    hostId: view.hostId,
    closeArmed: view.closeArmed,
    nextPoint: view.nextPoint,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleDoubleClick,
    handleKeyDown,
    openNextPoint,
    closeNextPoint,
    placePolar,
    cancelPress,
    reset,
    isTracing,
    isArmed,
  };
}
