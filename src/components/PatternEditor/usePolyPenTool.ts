import { useState, useCallback, useRef, useMemo } from 'react';
import type { Point2D, PathCommand, PatternPiece } from '../../types/types';
import { screenToPattern, screenToPatternLength } from '../../utils/geometry';
import { patternToPieceLocal, pieceLocalToPattern } from '../../utils/geometry/pieceSpace';
import { pointInPolygon } from '../../utils/geometry/slashAndSpread';
import { buildRing, projectToRing, type OutlineRing } from '../../utils/geometry/outlineRing';
import { extractNodes, type EditableNode } from './nodeEditorUtils';
import { getInternalLineEndpoints } from './internalShapePath';
import { EDGE_HIT_PX, isDrag } from './gestureConstants';
import { nodesToCommands, type PolyPenNode } from './polyPenGeometry';

export type { PolyPenNode, PolyPenNodeType } from './polyPenGeometry';

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

export type SnapKind = 'firstNode' | 'vertex' | 'internalEnd' | 'outline';

export interface SnapTarget {
  kind: SnapKind;
  pieceId: string | null;
  /** Mundo (patrón). */
  point: Point2D;
}

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
}

const EMPTY: ViewState = {
  nodes: [], previewPoint: null, pressPoint: null, isDragging: false, dragHandle: null, hover: null, hostId: null, closeArmed: false,
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
  const [view, setView] = useState<ViewState>(EMPTY);

  const { pieces } = opts;

  // Memos por identidad de `pieces`, no por evento de mouse (como usePointTool).
  const nodesByPiece = useMemo(() => {
    const m = new Map<string, EditableNode[]>();
    for (const p of pieces) m.set(p.id, extractNodes(p));
    return m;
  }, [pieces]);

  const endsByPiece = useMemo(() => {
    const m = new Map<string, Point2D[]>();
    for (const p of pieces) {
      const ends: Point2D[] = [];
      for (const line of p.internals ?? []) {
        const ep = getInternalLineEndpoints(line);
        if (ep) ends.push(ep[0], ep[1]);
      }
      m.set(p.id, ends);
    }
    return m;
  }, [pieces]);

  // Anillo pre-aplanado por pieza: proyectar contra él es O(n) por evento.
  // `snapToEdge` re-aplana el contorno entero por comando y no cabe en un
  // frame con veinte piezas DXF (revisión Halberg, 2026-08-29).
  const ringsByPiece = useMemo(() => {
    const m = new Map<string, OutlineRing>();
    for (const p of pieces) {
      if (!p.outline?.length) continue;
      const built = buildRing(p.outline, 2);
      if (built.ok) m.set(p.id, built.value);
    }
    return m;
  }, [pieces]);

  const toWorld = useCallback(
    (e: React.MouseEvent<SVGSVGElement>): Point2D =>
      screenToPattern(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect(), zoom, pan),
    [zoom, pan],
  );

  const radius = useCallback(() => screenToPatternLength(EDGE_HIT_PX, zoom), [zoom]);

  /** Prioridad de la spec § 4.6; dentro de cada clase, la pieza de arriba primero. */
  const resolveSnap = useCallback((world: Point2D, allowFirstNode: boolean): SnapTarget | null => {
    const r = radius();
    const nodes = nodesRef.current;
    if (allowFirstNode && nodes.length >= 3 && dist(world, nodes[0].point) <= r) {
      return { kind: 'firstNode', pieceId: hostRef.current, point: nodes[0].point };
    }
    const ps = optsRef.current.pieces;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      const local = patternToPieceLocal(world, p);
      for (const nd of nodesByPiece.get(p.id) ?? []) {
        if (dist(local, nd.position) <= r) {
          return { kind: 'vertex', pieceId: p.id, point: pieceLocalToPattern(nd.position, p) };
        }
      }
    }
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      const local = patternToPieceLocal(world, p);
      for (const end of endsByPiece.get(p.id) ?? []) {
        if (dist(local, end) <= r) {
          return { kind: 'internalEnd', pieceId: p.id, point: pieceLocalToPattern(end, p) };
        }
      }
    }
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      const ring = ringsByPiece.get(p.id);
      if (!ring) continue;
      const local = patternToPieceLocal(world, p);
      const { point } = projectToRing(ring, local);
      if (dist(local, point) <= r) {
        return { kind: 'outline', pieceId: p.id, point: pieceLocalToPattern(point, p) };
      }
    }
    return null;
  }, [nodesByPiece, endsByPiece, ringsByPiece, radius]);

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
    });
  }, []);

  const reset = useCallback(() => {
    nodesRef.current = [];
    pressRef.current = null;
    hostRef.current = null;
    hoverRef.current = null;
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
    if (deadZoneRef.current && dist(world, deadZoneRef.current) <= r) return;

    const nodes = nodesRef.current;
    const closes = nodes.length >= 3 && dist(world, nodes[0].point) <= r;
    // Encima del último nodo: un tramo de largo cero es basura, y es lo que
    // el segundo clic de un doble clic pondría.
    if (!closes && nodes.length >= 1 && dist(world, nodes[nodes.length - 1].point) <= r) return;

    const snap = closes ? null : resolveSnap(world, false);
    if (nodes.length === 0) {
      // La anfitriona la fija el primer press: la pieza del objetivo si
      // engancha, si no la de arriba cuyo CONTORNO contiene el press.
      const hostId = snap?.pieceId ?? topmostContaining(world);
      if (!hostId) return;
      const host = optsRef.current.pieces.find(p => p.id === hostId);
      if (host?.locked) {
        optsRef.current.onLockedPress?.(hostId);
        return;
      }
      hostRef.current = hostId;
    }
    pressRef.current = { world, screen: { x: e.clientX, y: e.clientY }, snap, closes, moved: false, drag: null };
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
    if (!press) return;
    // Solo el botón izquierdo confirma: un release del derecho a mitad de
    // press no es un nodo (el mismo agujero que tenía el rectángulo).
    if (e.button !== 0) return;
    pressRef.current = null;
    lastWorldRef.current = toWorld(e);
    if (press.closes) {
      // Zona muerta de distancia, no de tiempo, y SOLO tras cerrar con el
      // puntero: el segundo par de un doble clic sobre el nodo 1 cae aquí y no
      // arma un trazo nuevo. Tras Enter no sigue ningún par, y una zona muerta
      // ahí bloqueaba el clic que continúa desde el extremo recién terminado
      // (lo cazó el e2e de la gramática, 2026-08-29).
      const origin = nodesRef.current[0]?.point ?? null;
      finish(true);
      deadZoneRef.current = origin;
      return;
    }
    const point = press.snap?.point ?? press.world;
    const node: PolyPenNode = press.moved && press.drag
      ? {
          point,
          type: 'bezier',
          handleOut: press.drag,
          handleIn: { x: 2 * point.x - press.drag.x, y: 2 * point.y - press.drag.y },
        }
      : { point, type: optsRef.current.nodeType };
    nodesRef.current = [...nodesRef.current, node];
    publish();
  }, [toWorld, finish, publish]);

  const handleDoubleClick = useCallback(() => {
    if (nodesRef.current.length >= 2) finish(false);
  }, [finish]);

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
  }, [cancelPress, reset, finish, publish]);

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
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleDoubleClick,
    handleKeyDown,
    cancelPress,
    reset,
    isTracing,
    isArmed,
  };
}
