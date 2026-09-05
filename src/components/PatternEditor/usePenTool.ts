import { useState, useCallback, useRef, useMemo } from 'react';
import { Point2D, PathCommand, PatternPiece } from '../../types/types';
import { screenToPattern } from '../../utils/geometry';
import { draftedPieceDefaults } from '../../utils/defaults';
import { polarOf, polarPoint } from './polyPenGeometry';
import { buildSnapIndex, resolveSnap, verticesVisibles } from './snapIndex';
import type { SnapTarget } from './snapIndex';
import { EDGE_HIT_PX } from './gestureConstants';
import { screenToPatternLength } from '../../utils/geometry';
import { pushJournal } from '../../utils/telemetry/journal';
import { isDrag } from './gestureConstants';

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
export interface NextPointState {
  from: Point2D;
  lengthMm: number;
  angleDeg: number;
}

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
}

// El radio de cierre es el MISMO que el del enganche. El spec de la línea
// interna (2026-08-29 § 7) ya lo había decidido — «cierre | 12 px | 12 px,
// ahora EDGE_HIT_PX (sin cambio de valor)»— y se quedó sin hacer: había un 12
// literal aquí. Un solo radio para todo el enganche era el punto entero de esa
// decisión, y con la pluma enganchando de verdad (#1102) ya no es cosmético:
// dos radios distintos en la misma herramienta se notan.

const EMPTY: PenState = { nodes: [], isDragging: false, cursorPos: null, isClosed: false, nextPoint: null, nextPointSeq: 0 };

/** Identidad estable: un `[]` nuevo por render reharía el índice en cada frame. */
const VACIO: PatternPiece[] = [];

export function usePenTool(
  zoom: number,
  pan: Point2D,
  onComplete: (piece: Omit<PatternPiece, 'id' | 'createdAt' | 'updatedAt'>) => void,
  /**
   * Piezas VISIBLES en orden de dibujo, para enganchar (#1102). Opcional para
   * que los tests viejos de la pluma —que la prueban como creadora de piezas
   * desde la nada— sigan valiendo tal cual.
   */
  pieces: PatternPiece[] = VACIO,
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

  // Caro: se rehace solo cuando cambian las piezas, no por evento de ratón.
  const indice = useMemo(() => buildSnapIndex(pieces), [pieces]);
  const radio = useCallback(() => screenToPatternLength(EDGE_HIT_PX, zoom), [zoom]);
  // Lo que se pinta sale del MISMO índice que engancha: si divergieran, el
  // dibujo estaría prometiendo puntos que no atraen.
  const verticesDePiezas = useMemo(() => verticesVisibles(indice), [indice]);

  /** Distance between two points */
  const dist = (a: Point2D, b: Point2D) => Math.hypot(a.x - b.x, a.y - b.y);

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
    if (state.nodes.length === 0 || !state.cursorPos || state.isClosed) return '';
    const last = state.nodes[state.nodes.length - 1];
    const cp1 = last.handleOut || last.anchor;
    if (cp1 === last.anchor) {
      return `M${last.anchor.x},${last.anchor.y} L${state.cursorPos.x},${state.cursorPos.y}`;
    }
    return `M${last.anchor.x},${last.anchor.y} C${cp1.x},${cp1.y} ${state.cursorPos.x},${state.cursorPos.y} ${state.cursorPos.x},${state.cursorPos.y}`;
  }, [state.nodes, state.cursorPos, state.isClosed]);

  const complete = useCallback((nodes: PenNode[], closed: boolean) => {
    const commands = nodesToCommands(nodes, closed);
    onComplete({
      name: `Piece ${Date.now().toString(36)}`,
      outline: commands,
      ...draftedPieceDefaults(),
    });
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

    // Cerrar gana al enganche: si no, no se podría cerrar un trazo encima de
    // una pieza, que es donde más se dibuja.
    if (nodes.length > 2) {
      const first = nodes[0].anchor;
      // `<=`, igual que el enganche (`snapIndex` compara `<= radius`). Con `<`,
      // a EXACTAMENTE 12 px el enganche disparaba y el cierre no: el clic
      // colocaba un nodo encima del primero en vez de cerrar la pieza. Un
      // valor de ancho, pero es el caso que unificar la constante venía a
      // quitar.
      if (dist(pt, first) * zoom <= EDGE_HIT_PX) {
        pushJournal('gesture', 'pen:press', { closes: true, nodes: nodes.length });
        complete(nodes, true);
        return;
      }
    }

    // El nodo cae donde hay algo que enganchar, y si no, donde ella clicó
    // (#1102 [11:23]: «si yo ahora quiero crear una línea nueva que empiece
    // desde aquí»). La pluma sigue creando piezas desde la nada: sin objetivo
    // no hay imán.
    const enganche = resolveSnap(indice, pt, radio());
    const anchor = enganche?.point ?? pt;
    pushJournal('gesture', 'pen:press', { closes: false, nodes: nodes.length + 1, snap: enganche?.kind ?? null });
    const newNode: PenNode = { anchor, handleIn: null, handleOut: null };
    pressRef.current = { screen: { x: e.clientX, y: e.clientY }, moved: false };
    setState(prev => ({
      ...prev,
      nodes: [...prev.nodes, newNode],
      isDragging: false,
    }));
  }, [toPattern, zoom, complete, indice, radio]);

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
    setHover(press?.moved ? null : resolveSnap(indice, pt, radio()));

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
        return { ...prev, nodes, cursorPos: pt, isDragging: true };
      }
      return { ...prev, cursorPos: pt };
    });
  }, [toPattern, indice, radio]);

  const handleMouseUp = useCallback(() => {
    pressRef.current = null;
    setState(prev => ({ ...prev, isDragging: false }));
  }, []);

  /** Clear any in-progress stroke (used when switching away from the tool). */
  const reset = useCallback(() => {
    setHover(null);
    pressRef.current = null;
    setState(EMPTY);
  }, []);

  /** Doble clic = terminar abierta (= Enter). El nodo duplicado que deja el
   *  segundo par down/up cae encima del último: se descarta. */
  const handleDoubleClick = useCallback(() => {
    let nodes = nodesRef.current;
    if (nodes.length >= 2) {
      const a = nodes[nodes.length - 1].anchor;
      const b = nodes[nodes.length - 2].anchor;
      if (dist(a, b) * zoom < EDGE_HIT_PX) nodes = nodes.slice(0, -1);
    }
    if (nodes.length < 2) return;
    complete(nodes, false);
  }, [zoom, complete]);

  // ─── El tramo en curso, congelado (cotas vivas § 5.4, #1129) ─────────────

  /** Tab: congela el tramo, prefijado con la goma (último nodo → cursor). */
  const openNextPoint = useCallback(() => {
    const nodes = nodesRef.current;
    if (nodes.length === 0) return;
    const from = nodes[nodes.length - 1].anchor;
    const cursor = cursorRef.current ?? from;
    const { lengthMm, angleDeg } = polarOf(from, cursor);
    setState(prev => ({ ...prev, nextPoint: { from, lengthMm, angleDeg }, nextPointSeq: prev.nextPointSeq + 1 }));
  }, []);

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

  /** Coloca un nodo esquina a largo y ángulo del último; el par se re-ancla al nuevo. */
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
        // Re-ancla al nodo nuevo Y conserva el par que se acaba de colocar.
        // Antes conservaba el par ANTERIOR: tras escribir 80/90 y Enter, el
        // chip del ángulo volvía a 0 y repetir el mismo tramo con otro Enter
        // colocaba un tramo distinto. Encadenar es el punto de esta gramática.
        nextPoint: prev.nextPoint ? { from: anchor, lengthMm, angleDeg } : prev.nextPoint,
      };
    });
  }, []);

  /**
   * Escape = cancel, Enter = finalize open path, Tab = siguiente punto,
   * Retroceso/Supr = quitar el último. Devuelve si consumió la tecla: la
   * captura CF-1 detiene la propagación solo entonces (spec 2026-08-29 § 8).
   */
  const handleKeyDown = useCallback((e: KeyboardEvent): boolean => {
    const nodes = nodesRef.current;
    switch (e.key) {
      case 'Escape':
        // Peldaño nuevo (#1129): con el tramo congelado, Escape lo SUELTA y el
        // trazo sigue vivo — «vuelve a seguir al cursor», spec de cotas vivas
        // § 5.4. Antes esto no existía porque el Escape del panel nacía DENTRO
        // del panel y el router no lo veía; los chips sí están en el lienzo, y
        // sin este peldaño Escape se llevaba el trazo entero por delante.
        if (nextPointRef.current) { closeNextPoint(); return true; }
        if (nodes.length === 0) return false;
        setState(EMPTY);
        return true;
      case 'Enter':
        if (nodes.length < 2) return false;
        complete(nodes, false);
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

  // ¿El próximo clic cierra el contorno? Mismo umbral que el snap real de
  // handleMouseDown — el aviso y el comportamiento no pueden discrepar
  // (maria-196: el cierre existía pero era invisible).
  const willClose =
    state.nodes.length > 2 &&
    !!state.cursorPos &&
    !state.isClosed &&
    dist(state.cursorPos, state.nodes[0].anchor) * zoom < EDGE_HIT_PX;

  // Distance from last node to cursor for dimension label. Se apaga cuando
  // el cierre está armado: en ese momento la medida es ruido y era
  // exactamente lo que tapaba el punto de origen (maria-196).
  const lastPointDistance = state.nodes.length > 0 && state.cursorPos && !state.isClosed && !willClose
    ? {
        distance: dist(state.nodes[state.nodes.length - 1].anchor, state.cursorPos),
        position: state.cursorPos,
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
    /** Lo que el próximo clic va a enganchar, para que el overlay lo anuncie. */
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
