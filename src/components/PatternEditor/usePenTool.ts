import { useState, useCallback, useRef, useMemo } from 'react';
import { Point2D, PathCommand, PatternPiece, Trazo } from '../../types/types';
import { screenToPattern } from '../../utils/geometry';
import { draftedPieceDefaults } from '../../utils/defaults';
import { polarOf, polarPoint } from './polyPenGeometry';
import { referenceForNext } from './angleReference';
import type { TramoEnCurso } from './cotas/tramoEnCurso';
import { buildSnapIndex, resolveSnap, verticesVisibles } from './snapIndex';
import type { SnapTarget } from './snapIndex';
import { EDGE_HIT_PX } from './gestureConstants';
import { screenToPatternLength } from '../../utils/geometry';
import { pushJournal } from '../../utils/telemetry/journal';
import { isDrag } from './gestureConstants';
import { restringirAHoja45 } from './restriccionShift';
import { useShiftSostenido } from './useShiftSostenido';

/**
 * A node in the pen path. Each node has an anchor point and optional
 * control handles for cubic bezier curves.
 *
 * Click = sharp corner (no handles)
 * Click+drag = smooth curve (symmetric handles)
 * Alt+drag handle = break tangent (asymmetric)
 */
export interface PenNode {
  anchor: Point2D;
  /** Control point before the anchor (incoming curve) */
  handleIn: Point2D | null;
  /** Control point after the anchor (outgoing curve) */
  handleOut: Point2D | null;
}

/** El tramo congelado con Tab: desde dónde y con qué par prefijado (#1129). */
export type NextPointState = TramoEnCurso;

interface PenState {
  nodes: PenNode[];
  /** Currently being dragged to create handles */
  isDragging: boolean;
  /** Preview line from last node to cursor */
  cursorPos: Point2D | null;
  /** Is the path closed? */
  isClosed: boolean;
  nextPoint: NextPointState | null;
  /**
   * Sube en cada Tab. La abre-el-chip de `PatternEditor` se enganchaba a la
   * posición del tramo, y `openNextPoint` conserva `from` mientras no se
   * coloque un punto: pulsar Tab una segunda vez no reabría el chip y, como el
   * router ya había hecho `preventDefault`, el Tab nativo tampoco navegaba.
   * Tecla muerta.
   */
  nextPointSeq: number;
  /** Shift sostenido: la goma se endereza respecto a la hoja (firma 23-09, opción B). */
  shift: boolean;
}

// El radio de cierre es el MISMO que el del enganche. El spec de la línea
// interna (2026-08-29 § 7) ya lo había decidido — «cierre | 12 px | 12 px,
// ahora EDGE_HIT_PX (sin cambio de valor)»— y se quedó sin hacer: había un 12
// literal aquí. Un solo radio para todo el enganche era el punto entero de esa
// decisión, y con la pluma enganchando de verdad (#1102) ya no es cosmético:
// dos radios distintos en la misma herramienta se notan.

const EMPTY: PenState = { nodes: [], isDragging: false, cursorPos: null, isClosed: false, nextPoint: null, nextPointSeq: 0, shift: false };

/** Identidad estable: un `[]` nuevo por render reharía el índice en cada frame. */
const VACIO: PatternPiece[] = [];

/** Por dónde terminó el trazo, para la bitácora (spec 2026-09-12 § 3.4). */
export type PenVia = 'close' | 'enter' | 'dblclick' | 'esc' | 'toolChange';

/** Lo que la Pluma entrega al terminar: cerrado es pieza, abierto es trazo (spec 2026-09-12 § 3.1). */
export type PenResult =
  | { kind: 'pieza'; piece: Omit<PatternPiece, 'id' | 'createdAt' | 'updatedAt'> }
  | { kind: 'trazo'; path: PathCommand[] };

/** Misma razón que `VACIO`: identidad estable para el índice de enganche. */
const SIN_TRAZOS: Trazo[] = [];

export function usePenTool(
  zoom: number,
  pan: Point2D,
  onComplete: (resultado: PenResult) => void,
  /**
   * Piezas VISIBLES en orden de dibujo, para enganchar (#1102). Opcional para
   * que los tests viejos de la pluma —que la prueban como creadora de piezas
   * desde la nada— sigan valiendo tal cual.
   */
  pieces: PatternPiece[] = VACIO,
  /** Trazos VISIBLES: enganchan igual que las piezas (spec 2026-09-12 § 5.1). */
  trazos: Trazo[] = SIN_TRAZOS,
) {
  const [state, setState] = useState<PenState>(EMPTY);
  const [hover, setHover] = useState<SnapTarget | null>(null);
  const nodesRef = useRef<PenNode[]>([]);
  nodesRef.current = state.nodes;
  const cursorRef = useRef<Point2D | null>(null);
  cursorRef.current = state.cursorPos;
  // Espejo del par congelado: `handleKeyDown` es un callback estable y no
  // puede leer `state` sin recrearse en cada tecla.
  const nextPointRef = useRef<NextPointState | null>(null);
  nextPointRef.current = state.nextPoint;
  const pressRef = useRef<{ screen: Point2D; moved: boolean } | null>(null);

  /** Convert screen coords to pattern space */
  const toPattern = useCallback(
    (screenX: number, screenY: number, svgRect: DOMRect): Point2D =>
      screenToPattern(screenX, screenY, svgRect, zoom, pan),
    [zoom, pan],
  );

  // Caro: se rehace solo cuando cambian las piezas o los trazos, no por evento
  // de ratón.
  const indice = useMemo(() => buildSnapIndex(pieces, trazos), [pieces, trazos]);
  const radio = useCallback(() => screenToPatternLength(EDGE_HIT_PX, zoom), [zoom]);
  // Lo que se pinta sale del MISMO índice que engancha: si divergieran, el
  // dibujo estaría prometiendo puntos que no atraen.
  const verticesDePiezas = useMemo(() => verticesVisibles(indice), [indice]);

  /**
   * Con Shift y un nodo del que partir, el punto sobre la guía de la hoja; si
   * no, `null` y manda lo de siempre. Shift va por encima del enganche
   * (contrato 2026-09-08 § 3.4): con la guía puesta, un vértice cercano no se
   * lleva el punto. El cierre sobre el primer nodo va por encima de Shift.
   */
  const enderezar = useCallback((nodes: PenNode[], cursor: Point2D, shift: boolean): Point2D | null =>
    shift && nodes.length > 0 ? restringirAHoja45(nodes[nodes.length - 1].anchor, cursor) : null, []);

  // Pulsar o soltar Shift con el ratón quieto también cuenta. Sin trazo en
  // curso no hay nada que enderezar y el estado no se toca: escribir
  // mayúsculas en el chat no puede re-renderizar el editor.
  const shiftRef = useShiftSostenido((shift) => {
    if (nodesRef.current.length === 0) return;
    const cursor = cursorRef.current;
    setHover(shift || pressRef.current?.moved || !cursor ? null : resolveSnap(indice, cursor, radio()));
    setState(prev => (prev.shift === shift ? prev : { ...prev, shift }));
  });

  /** Distance between two points */
  const dist = (a: Point2D, b: Point2D) => Math.hypot(a.x - b.x, a.y - b.y);

  /**
   * ¿Cierra el contorno un clic aquí? Si el ratón cae sobre el primer nodo, o
   * si cae ahí la guía de Shift: cerrar una forma dibujada con Shift es
   * enderezar el último lado justo hasta el primer punto.
   *
   * `<=`, igual que el enganche (`snapIndex` compara `<= radius`). Con `<`, a
   * EXACTAMENTE 12 px el enganche disparaba y el cierre no: el clic colocaba
   * un nodo encima del primero en vez de cerrar la pieza.
   */
  const cierraEn = useCallback((nodes: PenNode[], raton: Point2D, guia: Point2D | null): boolean =>
    nodes.length > 2
      && [raton, guia].some(p => p !== null && dist(p, nodes[0].anchor) * zoom <= EDGE_HIT_PX),
  [zoom]);

  /**
   * Adónde lleva un clic el siguiente punto, en el orden en que lo decide
   * `handleMouseDown`: cerrar, después Shift, después el enganche, después el
   * ratón. La goma, la píldora y Tab leen de aquí, así que el aviso y el clic
   * no pueden discrepar (maria-196).
   */
  const destinoDe = useCallback(
    (nodes: PenNode[], raton: Point2D, shift: boolean, enganche: Point2D | null) => {
      const guia = enderezar(nodes, raton, shift);
      if (cierraEn(nodes, raton, guia)) return { punto: nodes[0].anchor, cierra: true };
      return { punto: guia ?? enganche ?? raton, cierra: false };
    },
    [enderezar, cierraEn],
  );

  // Con la pareja congelada el clic sigue cerrando (handleMouseDown no mira
  // `nextPoint`), así que el aviso de cierre tampoco se apaga (maria-196, y la
  // revisión del 13-09 por el otro lado).
  const siguiente = state.cursorPos && !state.isClosed
    ? destinoDe(state.nodes, state.cursorPos, state.shift, hover?.point ?? null)
    : null;
  const willClose = !!siguiente?.cierra;
  // Arrastrando manejadores no hay punto que decidir: la goma enseña el
  // manejador tal cual, que es lo que se va a guardar.
  const destino = state.isDragging ? state.cursorPos : siguiente?.punto ?? state.cursorPos;

  /** Convert nodes array to PathCommand array */
  const nodesToCommands = useCallback((nodes: PenNode[], closed: boolean): PathCommand[] => {
    if (nodes.length === 0) return [];
    const cmds: PathCommand[] = [];
    cmds.push({ type: 'M', values: [nodes[0].anchor.x, nodes[0].anchor.y] });

    for (let i = 1; i < nodes.length; i++) {
      const prev = nodes[i - 1];
      const curr = nodes[i];
      const cp1 = prev.handleOut || prev.anchor;
      const cp2 = curr.handleIn || curr.anchor;

      // If both control points are at anchors → straight line
      if (cp1 === prev.anchor && cp2 === curr.anchor) {
        cmds.push({ type: 'L', values: [curr.anchor.x, curr.anchor.y] });
      } else {
        cmds.push({
          type: 'C',
          values: [cp1.x, cp1.y, cp2.x, cp2.y, curr.anchor.x, curr.anchor.y],
        });
      }
    }

    if (closed && nodes.length > 1) {
      const last = nodes[nodes.length - 1];
      const first = nodes[0];
      const cp1 = last.handleOut || last.anchor;
      const cp2 = first.handleIn || first.anchor;

      if (cp1 === last.anchor && cp2 === first.anchor) {
        cmds.push({ type: 'Z', values: [] });
      } else {
        cmds.push({
          type: 'C',
          values: [cp1.x, cp1.y, cp2.x, cp2.y, first.anchor.x, first.anchor.y],
        });
        cmds.push({ type: 'Z', values: [] });
      }
    }

    return cmds;
  }, []);

  /** Build SVG path string for preview */
  const buildPreviewPath = useCallback((): string => {
    const cmds = nodesToCommands(state.nodes, state.isClosed);
    return cmds.map(c => `${c.type}${c.values.join(',')}`).join(' ');
  }, [state.nodes, state.isClosed, nodesToCommands]);

  /** Build preview line from last node to cursor */
  const buildGuidePath = useCallback((): string => {
    const target = state.nextPoint
      ? polarPoint(state.nextPoint.from, state.nextPoint.lengthMm, state.nextPoint.angleDeg)
      : destino;
    if (state.nodes.length === 0 || !target || state.isClosed) return '';
    const last = state.nodes[state.nodes.length - 1];
    const cp1 = last.handleOut || last.anchor;
    if (cp1 === last.anchor) {
      return `M${last.anchor.x},${last.anchor.y} L${target.x},${target.y}`;
    }
    return `M${last.anchor.x},${last.anchor.y} C${cp1.x},${cp1.y} ${target.x},${target.y} ${target.x},${target.y}`;
  }, [state.nodes, state.isClosed, state.nextPoint, destino]);

  const complete = useCallback((nodes: PenNode[], closed: boolean, via: PenVia) => {
    const commands = nodesToCommands(nodes, closed);
    pushJournal('gesture', 'pen:complete', { kind: closed ? 'pieza' : 'trazo', nodes: nodes.length, via });
    if (closed) {
      onComplete({
        kind: 'pieza',
        piece: {
          name: `Piece ${Date.now().toString(36)}`,
          outline: commands,
          ...draftedPieceDefaults(),
        },
      });
    } else {
      // Abierto nunca es pieza: es una raya de construcción (spec § 3.1).
      onComplete({ kind: 'trazo', path: commands });
    }
    pressRef.current = null;
    // El anillo de enganche también se apaga: si no, cerrar una pieza lo deja
    // pintado sobre el último objetivo hasta el siguiente movimiento del ratón,
    // y volver a la pluma lo enseña apuntando a donde estuvo el cursor hace
    // tres gestos.
    setHover(null);
    setState(EMPTY);
  }, [nodesToCommands, onComplete]);

  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0) return; // left click only
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const pt = toPattern(e.clientX, e.clientY, rect);
    const nodes = nodesRef.current;
    shiftRef.current = e.shiftKey;

    // El segundo press de un doble clic con Shift repite el nodo que acaba de
    // poner el primero. Enderezarlo desde ESE nodo lo sacaba del sitio —30 mm
    // más allá en un doble clic a 30 mm de la guía— y `handleDoubleClick`, que
    // busca ese duplicado para quitarlo, lo conservaba: un trazo de dos nodos
    // terminaba en pieza triangular.
    const guia = e.shiftKey && e.detail >= 2 && nodes.length > 0
      ? nodes[nodes.length - 1].anchor
      : enderezar(nodes, pt, e.shiftKey);

    // Cerrar gana al enganche y a Shift: si no, no se podría cerrar un trazo
    // encima de una pieza, que es donde más se dibuja.
    if (cierraEn(nodes, pt, guia)) {
      pushJournal('gesture', 'pen:press', { closes: true, nodes: nodes.length });
      complete(nodes, true, 'close');
      return;
    }

    // El nodo cae donde hay algo que enganchar, y si no, donde ella clicó
    // (#1102 [11:23]: «si yo ahora quiero crear una línea nueva que empiece
    // desde aquí»). La pluma sigue creando piezas desde la nada: sin objetivo
    // no hay imán.
    const enganche = guia ? null : resolveSnap(indice, pt, radio());
    const anchor = guia ?? enganche?.point ?? pt;
    pushJournal('gesture', 'pen:press', {
      closes: false, nodes: nodes.length + 1, snap: enganche?.kind ?? null, ...(guia ? { shift: true } : {}),
    });
    const newNode: PenNode = { anchor, handleIn: null, handleOut: null };
    pressRef.current = { screen: { x: e.clientX, y: e.clientY }, moved: false };
    // Un clic con la pareja congelada la suelta: volver al ratón es volver del
    // todo (revisión 13-09, H1). Si no, la goma se quedaba clavada al destino
    // congelado y el chip sobre el tramo anterior hasta dos Escape.
    setState(prev => ({
      ...prev,
      nodes: [...prev.nodes, newNode],
      isDragging: false,
      nextPoint: null,
      shift: e.shiftKey,
    }));
  }, [toPattern, complete, indice, radio, enderezar, cierraEn, shiftRef]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const pt = toPattern(e.clientX, e.clientY, rect);
    const press = pressRef.current;
    if (press && !press.moved && isDrag(e.clientX - press.screen.x, e.clientY - press.screen.y)) {
      press.moved = true;
    }

    // El aviso de enganche. Sin esto el imán existe y es invisible, que es la
    // mitad literal de #1102 («no se está iluminando»). Durante un arrastre no:
    // ahí se están dibujando manijas, no eligiendo dónde cae el nodo.
    shiftRef.current = e.shiftKey;
    const conGuia = e.shiftKey && nodesRef.current.length > 0;
    setHover(press?.moved || conGuia ? null : resolveSnap(indice, pt, radio()));

    setState(prev => {
      if (press?.moved && prev.nodes.length > 0) {
        // Dragging = creating handles on last node
        const nodes = [...prev.nodes];
        const lastIdx = nodes.length - 1;
        const last = { ...nodes[lastIdx] };
        const anchor = last.anchor;

        // Symmetric handles: handleOut follows mouse, handleIn is mirrored
        last.handleOut = { x: pt.x, y: pt.y };
        last.handleIn = {
          x: 2 * anchor.x - pt.x,
          y: 2 * anchor.y - pt.y,
        };
        nodes[lastIdx] = last;
        return { ...prev, nodes, cursorPos: pt, isDragging: true, shift: e.shiftKey };
      }
      return { ...prev, cursorPos: pt, shift: e.shiftKey };
    });
  }, [toPattern, indice, radio, shiftRef]);

  const handleMouseUp = useCallback(() => {
    pressRef.current = null;
    setState(prev => ({ ...prev, isDragging: false }));
  }, []);

  /**
   * Salir de la Pluma no tira lo dibujado: con dos o más nodos queda un trazo
   * (spec 2026-09-12 § 3.2). Lo llaman el cambio de herramienta y
   * `pointercancel` — en los dos casos perder la raya era el fallo.
   */
  const reset = useCallback(() => {
    const nodes = nodesRef.current;
    if (nodes.length >= 2) { complete(nodes, false, 'toolChange'); return; }
    setHover(null);
    pressRef.current = null;
    setState(EMPTY);
  }, [complete]);

  /** Doble clic = terminar (= Enter): con tres nodos cierra la pieza; con dos
   *  queda el trazo abierto. El nodo duplicado del segundo par down/up se
   *  descarta. */
  const handleDoubleClick = useCallback(() => {
    let nodes = nodesRef.current;
    if (nodes.length >= 2) {
      const a = nodes[nodes.length - 1].anchor;
      const b = nodes[nodes.length - 2].anchor;
      if (dist(a, b) * zoom < EDGE_HIT_PX) nodes = nodes.slice(0, -1);
    }
    if (nodes.length < 2) return;
    complete(nodes, nodes.length >= 3, 'dblclick');
  }, [zoom, complete]);

  // ─── El tramo en curso, congelado (cotas vivas § 5.4, #1129) ─────────────

  /** Tab: congela el tramo, prefijado con la goma (último nodo → cursor). */
  const openNextPoint = useCallback(() => {
    const nodes = nodesRef.current;
    if (nodes.length === 0) return;
    const from = nodes[nodes.length - 1].anchor;
    const raton = cursorRef.current ?? from;
    const { punto } = destinoDe(nodes, raton, shiftRef.current, resolveSnap(indice, raton, radio())?.point ?? null);
    const { lengthMm, angleDeg } = polarOf(from, punto);
    const reference = referenceForNext(nodesToCommands(nodes, false), indice);
    setState(prev => ({ ...prev, nextPoint: { from, lengthMm, angleDeg, reference }, nextPointSeq: prev.nextPointSeq + 1 }));
  }, [indice, radio, nodesToCommands, destinoDe, shiftRef]);

  /**
   * Reescribe el par pendiente SIN colocar (#1129). Es lo que hace Tab dentro
   * de un chip: pasa de Largo a Angulo conservando lo escrito. Enter, en
   * cambio, va por `placePolar`.
   */
  const setNextPointValues = useCallback((lengthMm: number, angleDeg: number) => {
    setState(prev => (prev.nextPoint ? { ...prev, nextPoint: { ...prev.nextPoint, lengthMm, angleDeg } } : prev));
  }, []);

  const closeNextPoint = useCallback(() => {
    // Soltar el congelado sin tocar el trazo: el primer peldaño del Escape.
    pushJournal('gesture', 'pen:nextPoint', { op: 'close' });
    setState(prev => (prev.nextPoint ? { ...prev, nextPoint: null } : prev));
  }, []);

  /** Coloca una esquina exacta y devuelve el siguiente tramo al ratón. */
  const placePolar = useCallback((lengthMm: number, angleDeg: number) => {
    if (nodesRef.current.length === 0) return;
    pushJournal('gesture', 'pen:nextPoint', { op: 'place', length: lengthMm, angle: angleDeg, nodes: nodesRef.current.length + 1 });
    setState(prev => {
      if (prev.nodes.length === 0) return prev;
      const from = prev.nodes[prev.nodes.length - 1].anchor;
      const anchor = polarPoint(from, lengthMm, angleDeg);
      const node: PenNode = { anchor, handleIn: null, handleOut: null };
      return {
        ...prev,
        nodes: [...prev.nodes, node],
        nextPoint: null,
      };
    });
  }, []);

  /**
   * Escape = terminar dejando el trazo, Enter = terminar (cierra con ≥3 nodos), Tab = siguiente punto,
   * Retroceso/Supr = quitar el último. Devuelve si consumió la tecla: la
   * captura CF-1 detiene la propagación solo entonces (spec 2026-08-29 § 8).
   */
  const handleKeyDown = useCallback((e: KeyboardEvent): boolean => {
    const nodes = nodesRef.current;
    switch (e.key) {
      case 'Escape':
        // Escalera (#1129, enmendada por la spec 2026-09-12 § 3.3): con el
        // tramo congelado, Escape lo SUELTA y el trazo sigue vivo — «vuelve a
        // seguir al cursor», spec de cotas vivas § 5.4. El chip en edición
        // gestiona sus propios Esc antes de que la tecla llegue aquí.
        if (nextPointRef.current) { closeNextPoint(); return true; }
        if (nodes.length === 0) return false;
        // Spec 2026-09-12 § 3.2: Esc TERMINA el trazo (Illustrator/Figma), no
        // lo tira. Con un solo nodo no hay trazo que dejar. Lo que no se
        // quería, Ctrl+Z.
        if (nodes.length >= 2) { complete(nodes, false, 'esc'); return true; }
        setState(EMPTY);
        return true;
      case 'Enter':
        if (nodes.length < 2) return false;
        complete(nodes, nodes.length >= 3, 'enter');
        return true;
      case 'Tab':
        if (nodes.length === 0) return false;
        openNextPoint();
        return true;
      case 'Backspace':
      case 'Delete':
        if (nodes.length === 0) return false;
        pressRef.current = null;
        setState(prev => (prev.nodes.length <= 1 ? EMPTY : { ...prev, nodes: prev.nodes.slice(0, -1) }));
        return true;
      default:
        return false;
    }
  }, [complete, openNextPoint, closeNextPoint]);

  // Distance from last node to cursor for dimension label. Se apaga cuando
  // el cierre está armado: en ese momento la medida es ruido y era
  // exactamente lo que tapaba el punto de origen (maria-196).
  const angleReference = useMemo(() => referenceForNext(nodesToCommands(state.nodes, false), indice),
    [state.nodes, nodesToCommands, indice]);
  const lastPointDistance = state.nodes.length > 0 && destino && !state.isClosed && !willClose && !state.nextPoint
    ? {
        distance: polarOf(state.nodes[state.nodes.length - 1].anchor, destino).lengthMm,
        angleDeg: polarOf(state.nodes[state.nodes.length - 1].anchor, destino).angleDeg,
        reference: angleReference,
        position: destino,
      }
    : null;

  return {
    nodes: state.nodes,
    isDragging: state.isDragging,
    isClosed: state.isClosed,
    willClose,
    previewPath: buildPreviewPath(),
    guidePath: buildGuidePath(),
    lastPointDistance,
    /** Lo que el próximo clic va a enganchar, para que el overlay lo anuncie —
     *  también con la pareja congelada, porque ese clic engancha igual. */
    hover,
    /** Los vértices de las piezas visibles — #1102 [11:38]. */
    verticesDePiezas,
    nextPoint: state.nextPoint,
    nextPointSeq: state.nextPointSeq,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleDoubleClick,
    handleKeyDown,
    openNextPoint,
    closeNextPoint,
    setNextPointValues,
    placePolar,
    reset,
  };
}
