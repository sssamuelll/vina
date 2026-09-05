import type { CotasLayerHandle } from './cotas/CotasLayer';
import { useRef, useCallback, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../store';
import { selectPiece, togglePieceSelection, clearSelection, selectAllPieces, selectInternalLine, setZoom2D, setPan2D } from '../../store/editorSlice';
import { movePiece, updateInternalLine } from '../../store/projectSlice';
import { PatternPiece, Point2D, Tool2D, PathCommand, InternalLine } from '../../types/types';
import { wheelIntent, zoomFactor, type InputSchemeId } from '../../input/wheelIntents';
import { isPinnedAtZoomCeiling, zoomAtPoint } from '../../input/zoom2d';
import { showInfoToast } from '../../store/copilotUISlice';
import { createTimeWindowLimiter } from '../../utils/rateLimit';

/** Compute bounding box center (duplicated from PieceRenderer for drag transform). */
function getOutlineCenterForDrag(outline: PathCommand[]): { cx: number; cy: number } {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const cmd of outline) {
    const v = cmd.values;
    if (cmd.type === 'M' || cmd.type === 'L') {
      if (v[0] < minX) minX = v[0]; if (v[0] > maxX) maxX = v[0];
      if (v[1] < minY) minY = v[1]; if (v[1] > maxY) maxY = v[1];
    } else if (cmd.type === 'C') {
      for (let i = 0; i < 6; i += 2) {
        if (v[i] < minX) minX = v[i]; if (v[i] > maxX) maxX = v[i];
        if (v[i + 1] < minY) minY = v[i + 1]; if (v[i + 1] > maxY) maxY = v[i + 1];
      }
    } else if (cmd.type === 'Q') {
      for (let i = 0; i < 4; i += 2) {
        if (v[i] < minX) minX = v[i]; if (v[i] > maxX) maxX = v[i];
        if (v[i + 1] < minY) minY = v[i + 1]; if (v[i + 1] > maxY) maxY = v[i + 1];
      }
    }
  }
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}
import { extractNodes, NodeRef } from './nodeEditorUtils';
import { getInternalLineEndpoints } from './internalShapePath';
import { screenToPattern, screenToPatternLength } from '../../utils/geometry';
import { patternToPieceLocal } from './pieceTransform';
import { DRAG_THRESHOLD_PX, isDrag } from './gestureConstants';
import { pushJournal } from '../../utils/telemetry/journal';

const MEASURE_TOOL_IDS = new Set(['measure', 'measureCurve', 'compareCurves']);
const zoomCeilingToastLimiter = createTimeWindowLimiter(3000);

/** Un campo editable es dueño de sus teclas: el router no las toca (spec 2026-08-29 § 8). */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

// ─── Sondas de la bitácora (spec caja-negra-bitacora § 3.2) ─────────────────
// El router es la puerta por la que pasan todos los mousedown/up/keydown de
// todas las herramientas: una sonda aquí las cubre a todas. Los ganchos solo
// añaden lo que únicamente ellos saben (enganche, anfitriona, desenlace).

/** Qué había bajo el cursor, en una palabra: rol de ancla, pieza, o el tag. */
function describeTarget(target: EventTarget | null | undefined): string {
  const el = target as (Partial<Element> & { tagName?: string }) | null | undefined;
  if (!el) return 'none';
  const role = typeof el.getAttribute === 'function' ? el.getAttribute('data-anchor-role') : null;
  if (role) return role;
  if (typeof el.closest === 'function' && el.closest('[data-piece-id]')) return 'piece';
  return typeof el.tagName === 'string' ? el.tagName.toLowerCase() : 'unknown';
}

/** Punto de patrón redondeado a 1 decimal; `null` si el evento no trae con qué medirlo. */
function worldOf(e: React.MouseEvent<SVGSVGElement>, zoom: number, pan: Point2D): { x: number; y: number } | null {
  const rect = e.currentTarget?.getBoundingClientRect?.();
  if (!rect || typeof e.clientX !== 'number') return null;
  const p = screenToPattern(e.clientX, e.clientY, rect, zoom, pan);
  return { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 };
}

/** Distance from point (px,py) to line segment (x1,y1)-(x2,y2) */
function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/** Minimum distance from a point to any segment of an internal line path */
function distToInternalLine(px: number, py: number, path: PathCommand[]): number {
  let minDist = Infinity;
  let prevX = 0, prevY = 0;
  for (const cmd of path) {
    switch (cmd.type) {
      case 'M':
        prevX = cmd.values[0]; prevY = cmd.values[1];
        break;
      case 'L':
        minDist = Math.min(minDist, distToSegment(px, py, prevX, prevY, cmd.values[0], cmd.values[1]));
        prevX = cmd.values[0]; prevY = cmd.values[1];
        break;
      case 'C':
        minDist = Math.min(minDist, distToSegment(px, py, prevX, prevY, cmd.values[4], cmd.values[5]));
        prevX = cmd.values[4]; prevY = cmd.values[5];
        break;
      case 'Q':
        minDist = Math.min(minDist, distToSegment(px, py, prevX, prevY, cmd.values[2], cmd.values[3]));
        prevX = cmd.values[2]; prevY = cmd.values[3];
        break;
    }
  }
  return minDist;
}

interface ToolHooks {
  /** Capa de cotas vivas: Tab desde el lienzo enfoca el primer chip (spec 2026-08-30 § 5.3). */
  cotas?: React.RefObject<CotasLayerHandle>;
  /** `handleKeyDown` devuelve si consumió la tecla (la captura CF-1 detiene la propagación solo entonces). */
  pen: { handleMouseDown: (e: React.MouseEvent<SVGSVGElement>) => void; handleMouseMove: (e: React.MouseEvent<SVGSVGElement>) => void; handleMouseUp: () => void; handleKeyDown: (e: KeyboardEvent) => boolean; handleDoubleClick: () => void; reset: () => void };
  rectTool: {
    handleMouseDown: (e: React.MouseEvent<SVGSVGElement>) => void;
    handleMouseMove: (e: React.MouseEvent<SVGSVGElement>) => void;
    handleMouseUp: (e?: React.MouseEvent<SVGSVGElement>) => void;
    /** true = consumió (Escape con press vivo). */
    handleKeyDown: (e: KeyboardEvent) => boolean;
    cancel: () => void;
    isArmed: () => boolean;
  };
  /** Círculo / elipse (#1111): misma superficie que el rectángulo, hermano suyo. */
  circleTool: {
    handleMouseDown: (e: React.MouseEvent<SVGSVGElement>) => void;
    handleMouseMove: (e: React.MouseEvent<SVGSVGElement>) => void;
    handleMouseUp: (e?: React.MouseEvent<SVGSVGElement>) => void;
    /** true = consumió (Escape con press vivo). */
    handleKeyDown: (e: KeyboardEvent) => boolean;
    cancel: () => void;
    isArmed: () => boolean;
  };
  /** Triángulo (#1111, tanda 8): la misma superficie que el rectángulo y el círculo. */
  triangleTool: {
    handleMouseDown: (e: React.MouseEvent<SVGSVGElement>) => void;
    handleMouseMove: (e: React.MouseEvent<SVGSVGElement>) => void;
    handleMouseUp: (e?: React.MouseEvent<SVGSVGElement>) => void;
    /** true = consumió (Escape con press vivo). */
    handleKeyDown: (e: KeyboardEvent) => boolean;
    cancel: () => void;
    isArmed: () => boolean;
  };
  seamTool: { handleMouseDown: (e: React.MouseEvent<SVGSVGElement>) => void; handleMouseMove: (e: React.MouseEvent<SVGSVGElement>) => void; handleMouseUp: (e: React.MouseEvent<SVGSVGElement>) => void; handleKeyDown: (e: KeyboardEvent) => void };
  notchTool: {
    handleMouseDown: (e: React.MouseEvent<SVGSVGElement>) => void;
    handleMouseMove: (e: React.MouseEvent<SVGSVGElement>) => void;
    handleMouseUp: (e: React.MouseEvent<SVGSVGElement>) => void;
    handleKeyDown: (e: KeyboardEvent) => void;
    cancel: () => void;
    isArmed: () => boolean;
  };
  pointTool: {
    armed: boolean;
    handleMouseDown: (e: React.MouseEvent<SVGSVGElement>) => void;
    handleMouseMove: (e: React.MouseEvent<SVGSVGElement>) => void;
    handleMouseUp: (e: React.MouseEvent<SVGSVGElement>) => void;
    handleKeyDown: (e: KeyboardEvent) => void;
    getCursor: () => string;
  };
  seamAllowanceTool: {
    handleMouseDown: (e: React.MouseEvent<SVGSVGElement>) => void;
    handleMouseMove: (e: React.MouseEvent<SVGSVGElement>) => void;
    handleMouseUp: (e: React.MouseEvent<SVGSVGElement>) => void;
    handleKeyDown: (e: KeyboardEvent) => void;
    cancel: () => void;
    isArmed: () => boolean;
    limpiarHover: () => void;
  };
  trimTool: { handleMouseDown: (e: React.MouseEvent<SVGSVGElement>) => void; handleMouseMove: (e: React.MouseEvent<SVGSVGElement>) => void };
  grainlineTool: { handleMouseDown: (e: React.MouseEvent<SVGSVGElement>) => void; handleMouseMove: (e: React.MouseEvent<SVGSVGElement>) => void; handleMouseUp: (e?: React.MouseEvent<SVGSVGElement>) => void; cancel: () => void };
  measureTool: { handleMouseDown: (e: React.MouseEvent<SVGSVGElement>) => void; handleMouseMove: (e: React.MouseEvent<SVGSVGElement>) => void; handleKeyDown: (e: KeyboardEvent) => void; clear: () => void };
  nodeEditor: {
    isEditing: boolean;
    hoveredNode: unknown;
    enterEdit: (pieceId: string, selectedNode?: NodeRef) => void;
    exitEdit: () => void;
    handleMouseDown: (e: React.MouseEvent<SVGSVGElement>) => boolean;
    handleMouseMove: (e: React.MouseEvent<SVGSVGElement>) => boolean;
    handleMouseUp: () => void;
    handleKeyDown: (e: KeyboardEvent) => void;
  };
  transformTool: {
    isDragging: boolean;
    handleMouseDown: (e: React.MouseEvent<SVGSVGElement>) => boolean;
    handleMouseMove: (e: React.MouseEvent<SVGSVGElement>) => boolean;
    handleMouseUp: () => void;
    handleKeyDown: (e: KeyboardEvent) => void;
    getCursor: (pt: Point2D) => string | null;
  };
  editPattern: {
    isEditing: boolean;
    editingPieceId: string | null;
    hoveredNode: number | null;
    hoveredSegment: number | null;
    enterEdit: (pieceId: string) => void;
    exitEdit: () => void;
    handleMouseDown: (e: React.MouseEvent<SVGSVGElement>) => boolean;
    handleMouseMove: (e: React.MouseEvent<SVGSVGElement>) => boolean;
    handleMouseUp: () => void;
    handleKeyDown: (e: KeyboardEvent) => void;
    handleDoubleClick: (e: React.MouseEvent<SVGSVGElement>) => boolean;
    getCursor: () => string;
  };
  scissorsTool: {
    handleMouseDown: (e: React.MouseEvent<SVGSVGElement>) => void;
    handleMouseMove: (e: React.MouseEvent<SVGSVGElement>) => void;
    handleMouseUp: () => void;
    handleKeyDown: (e: KeyboardEvent) => void;
    getCursor: () => string;
    reset: () => void;
  };
  slashAndSpreadTool: {
    handleMouseDown: (e: React.MouseEvent<SVGSVGElement>) => void;
    handleMouseMove: (e: React.MouseEvent<SVGSVGElement>) => void;
    handleMouseUp: () => void;
    handleKeyDown: (e: KeyboardEvent) => void;
    getCursor: () => string;
    reset: () => void;
  };
  mergeTool: {
    handleMouseDown: (e: React.MouseEvent<SVGSVGElement>) => void;
    handleMouseMove: (e: React.MouseEvent<SVGSVGElement>) => void;
    handleMouseUp: () => void;
    handleKeyDown: (e: KeyboardEvent) => void;
    getCursor: () => string;
    reset: () => void;
  };
  seamEditTool: {
    handleMouseDown: (e: React.MouseEvent<SVGSVGElement>) => void;
    handleMouseMove: (e: React.MouseEvent<SVGSVGElement>) => void;
    handleKeyDown: (e: KeyboardEvent) => void;
  };
  topstitchTool: {
    handleMouseDown: (e: React.MouseEvent<SVGSVGElement>) => void;
    handleMouseMove: (e: React.MouseEvent<SVGSVGElement>) => void;
    handleKeyDown: (e: KeyboardEvent) => void;
    getCursor: () => string;
    reset: () => void;
  };
  walkSeamTool: {
    handleMouseDown: (e: React.MouseEvent<SVGSVGElement>) => void;
    handleMouseMove: (e: React.MouseEvent<SVGSVGElement>) => void;
    handleKeyDown: (e: KeyboardEvent) => void;
    getCursor: () => string;
    reset: () => void;
  };
  offsetTool: {
    handleMouseDown: (e: React.MouseEvent<SVGSVGElement>) => void;
    handleMouseMove: (e: React.MouseEvent<SVGSVGElement>) => void;
    handleMouseUp: () => void;
    handleKeyDown: (e: KeyboardEvent) => void;
    getCursor: () => string;
    reset: () => void;
  };
  extendTrimTool: {
    handleMouseDown: (e: React.MouseEvent<SVGSVGElement>) => void;
    handleMouseMove: (e: React.MouseEvent<SVGSVGElement>) => void;
    handleMouseUp: () => void;
    handleKeyDown: (e: KeyboardEvent) => void;
    getCursor: () => string;
    reset: () => void;
  };
  /** El motor de "Línea interna" (`usePolyPenTool`). */
  internalShapeTool: {
    handleMouseDown: (e: React.MouseEvent<SVGSVGElement>) => void;
    handleMouseMove: (e: React.MouseEvent<SVGSVGElement>) => void;
    handleMouseUp: (e: React.MouseEvent<SVGSVGElement>) => void;
    /** true = consumió la tecla. */
    handleKeyDown: (e: KeyboardEvent) => boolean;
    handleDoubleClick: () => void;
    /** Descarta solo el press vivo (pointercancel, blur). */
    cancelPress: () => void;
    reset: () => void;
    isTracing: () => boolean;
    isArmed: () => boolean;
  };
  pleatTool: {
    handleMouseDown: (e: React.MouseEvent<SVGSVGElement>) => void;
    handleMouseMove: (e: React.MouseEvent<SVGSVGElement>) => void;
  };
  elasticTool: {
    handleMouseDown: (e: React.MouseEvent<SVGSVGElement>) => void;
    handleMouseMove: (e: React.MouseEvent<SVGSVGElement>) => void;
    handleKeyDown: (e: KeyboardEvent) => boolean;
  };
}

/**
 * Decide si el transform box (mover/escalar/rotar) se muestra y se hit-testea.
 * Única fuente de verdad para render (ToolOverlay), hit (handleMouseDown) y
 * cursor (getCursor) — así los tres coinciden. Reglas:
 *  - `transform` tool: siempre (comportamiento standalone intacto).
 *  - `select`: solo con selección, desbloqueada y fuera de la altitud POINT
 *    (G7: la altitud POINT nunca dibuja el box).
 */
export function shouldShowTransformBox(opts: {
  activeTool: Tool2D;
  isNodeEditing: boolean;
  selectedCount: number;
  selectionHasLocked: boolean;
  hasSelectedInternalLine?: boolean;
}): boolean {
  if (opts.hasSelectedInternalLine) return false;
  // Una pieza bloqueada nunca enseña el box, tampoco en el tool transform:
  // sus handles redimensionan/rotan, y eso es modificar (maria-204 cerró
  // este bypass — el lock solo cubría el verbo select).
  if (opts.selectionHasLocked) return false;
  if (opts.activeTool === 'transform') return true;
  return opts.activeTool === 'select'
    && !opts.isNodeEditing
    && opts.selectedCount > 0;
}

export function useEditorInteractions(
  activeTool: Tool2D,
  zoom2D: number,
  pan2D: Point2D,
  pieces: PatternPiece[],
  tools: ToolHooks,
) {
  const dispatch = useDispatch();
  const selectedInternalLine = useSelector((s: RootState) => s.editor.selectedInternalLine);
  const svgRef = useRef<SVGSVGElement>(null);
  /** Posición de pantalla del último press, para que la bitácora mida `drag` en el release. */
  const pressRef = useRef<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ pieceId: string; startMouse: Point2D; startPos: Point2D; lastPos?: Point2D } | null>(null);
  const panRef = useRef<{ startMouse: Point2D; startPan: Point2D; lastPos?: Point2D } | null>(null);
  const internalLineDragRef = useRef<{
    pieceId: string; lineId: string; endpointIndex: 0 | 1;
    startMouse: Point2D; startPos: Point2D;
  } | null>(null);
  const marqueeRef = useRef<{ startPattern: Point2D; currentPattern: Point2D; shiftKey: boolean } | null>(null);
  const [selectMarquee, setSelectMarquee] = useState<{ start: Point2D; current: Point2D } | null>(null);
  const [hoverCursor, setHoverCursor] = useState<string | null>(null);
  /** true mientras una pieza se arrastra de verdad (≥ DRAG_THRESHOLD_PX). Suprime la
   *  cromía que se pinta desde Redux y se quedaba clavada en el origen durante
   *  el drag por DOM: la caja de transformación y la barra flotante (maria-200)
   *  y los overlays de anclas de editPattern / editCurve (maria-194 — el rastro
   *  de puntos que ella fotografió aparece al entrar a "Editar patrón", volver a
   *  la flecha sin Esc y arrastrar). Se exporta para ese segundo grupo. */
  const [isDraggingPiece, setIsDraggingPiece] = useState(false);
  /** El ref mueve el extremo sin renderizar por sí solo; este espejo observable
   *  apaga las cotas que, si no, ofrecerían otro mando durante el gesto y
   *  quedarían visualmente ancladas a la geometría anterior. */
  const [isDraggingEndpoint, setIsDraggingEndpoint] = useState(false);
  const selectedPieceIds = useSelector((s: RootState) => s.editor.selectedPieceIds);

  const { pen, rectTool, circleTool, triangleTool, seamTool, notchTool, pointTool, seamAllowanceTool, trimTool, grainlineTool, measureTool, nodeEditor, transformTool, editPattern, scissorsTool, slashAndSpreadTool, mergeTool, topstitchTool, walkSeamTool, seamEditTool, offsetTool, extendTrimTool, internalShapeTool, pleatTool, elasticTool, cotas } = tools;

  const selectionHasLocked = selectedPieceIds.some(
    id => pieces.find(p => p.id === id)?.locked,
  );
  // Un undo puede borrar la línea y dejar el par pieza/línea colgando en
  // Redux: sin este chequeo de vida, la caja de transformación se queda
  // apagada (cree que sigue habiendo una interna seleccionada) y la usuaria
  // se queda sin ningún control hasta volver a hacer clic en la pieza.
  const selectedInternalLineIsLive = selectedInternalLine !== null && pieces.some(
    p => p.id === selectedInternalLine.pieceId
      && p.internals.some(l => l.id === selectedInternalLine.lineId),
  );
  const showTransformBox = shouldShowTransformBox({
    activeTool,
    isNodeEditing: nodeEditor.isEditing,
    selectedCount: selectedPieceIds.length,
    selectionHasLocked,
    hasSelectedInternalLine: selectedInternalLineIsLive,
  }) && !isDraggingPiece;

  /** Check if a click is near an anchor point of a piece */
  const findClickedAnchorPoint = useCallback((
    e: React.MouseEvent<SVGSVGElement>,
    piece: PatternPiece
  ): NodeRef | null => {
    const rect = e.currentTarget.getBoundingClientRect();
    const { x: clickX, y: clickY } = screenToPattern(e.clientX, e.clientY, rect, zoom2D, pan2D);

    const local = patternToPieceLocal({ x: clickX, y: clickY }, piece);

    const nodes = extractNodes(piece);
    const CLICK_THRESHOLD = screenToPatternLength(8, zoom2D); // 8 screen pixels
    
    for (const node of nodes) {
      const dx = local.x - node.position.x;
      const dy = local.y - node.position.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= CLICK_THRESHOLD) {
        return node.ref;
      }
    }
    return null;
  }, [pan2D, zoom2D]);

  // Clear measurements when switching away
  useEffect(() => {
    if (!MEASURE_TOOL_IDS.has(activeTool)) measureTool.clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- measureTool.clear is stable (useCallback with [])
  }, [activeTool, measureTool.clear]);

  // Clear walk seam when switching away
  useEffect(() => {
    if (activeTool !== 'walkSeam') walkSeamTool.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTool, walkSeamTool.reset]);

  // Limpia Tijeras al cambiar de herramienta
  useEffect(() => {
    if (activeTool !== 'scissors') scissorsTool.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTool, scissorsTool.reset]);

  // Clear slash-and-spread when switching away
  useEffect(() => {
    if (activeTool !== 'slashAndSpread') slashAndSpreadTool.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTool, slashAndSpreadTool.reset]);

  // Clear the in-progress internal shape when switching away
  useEffect(() => {
    if (activeTool !== 'internalShape') internalShapeTool.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTool, internalShapeTool.reset]);

  // Clear an abandoned pen/polyPen stroke when switching away — otherwise it
  // reappears "already placed" on re-activation (nota de María)
  useEffect(() => {
    if (activeTool !== 'pen') pen.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTool, pen.reset]);

  // El borrado de la línea interna seleccionada YA NO vive aquí (#1115). Tenía
  // un duelo perdido de antemano: el atajo global escucha en `document` en
  // burbuja y corre antes que este router en `window`, así que la pieza se
  // borraba primero y la línea se iba en cascada. Ahora el sujeto lo decide
  // `resolverBorrado` (src/store/borradoDeSeleccion.ts) y lo despacha el atajo
  // global — un solo dueño, sin doble despacho. Un manejador local aquí solo
  // volvería a borrar lo mismo un tick después.

  // Keyboard events (burbuja). La pluma y la línea interna NO están aquí: sus
  // teclas viven en la captura CF-1 de abajo — una tecla, un sitio.
  useEffect(() => {
    const handlers: ((e: KeyboardEvent) => void)[] = [];
    if (activeTool === 'seam') handlers.push(seamTool.handleKeyDown);
    if (MEASURE_TOOL_IDS.has(activeTool)) handlers.push(measureTool.handleKeyDown);
    if (activeTool === 'transform') handlers.push(transformTool.handleKeyDown);
    if (nodeEditor.isEditing) handlers.push(nodeEditor.handleKeyDown);
    if (activeTool === 'editPattern') handlers.push(editPattern.handleKeyDown);
    if (activeTool === 'scissors') handlers.push(scissorsTool.handleKeyDown);
    // F8 (#1115): estaba en las dependencias pero nadie lo montaba, así que
    // Escape en Corte y apertura no hacía nada.
    if (activeTool === 'slashAndSpread') handlers.push(slashAndSpreadTool.handleKeyDown);
    if (activeTool === 'merge') handlers.push(mergeTool.handleKeyDown);
    if (activeTool === 'seamEdit') handlers.push(seamEditTool.handleKeyDown);
    if (activeTool === 'topstitchSeamline' || activeTool === 'topstitchSegment' || activeTool === 'topstitchFree') handlers.push(topstitchTool.handleKeyDown);
    if (activeTool === 'walkSeam') handlers.push(walkSeamTool.handleKeyDown);
    if (activeTool === 'offsetOutline') handlers.push(offsetTool.handleKeyDown);
    if (activeTool === 'extendTrim') handlers.push(extendTrimTool.handleKeyDown);
    if (handlers.length === 0) return;
    const handler = (e: KeyboardEvent) => handlers.forEach(h => h(e));
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeTool, seamTool.handleKeyDown, measureTool.handleKeyDown, transformTool.handleKeyDown, nodeEditor.isEditing, nodeEditor.handleKeyDown, editPattern.handleKeyDown, scissorsTool.handleKeyDown, slashAndSpreadTool.handleKeyDown, mergeTool.handleKeyDown, seamEditTool.handleKeyDown, topstitchTool.handleKeyDown, walkSeamTool.handleKeyDown, offsetTool.handleKeyDown, extendTrimTool.handleKeyDown]);

  // Coordinación de teclas (CF-1): un gesto vivo es dueño de sus teclas, EN
  // CAPTURA. `ShortcutProvider` escucha en `document` (burbuja) y corre antes
  // que el router de herramientas en `window` (burbuja): un Retroceso con la
  // anfitriona seleccionada borraba la pieza antes de que el trazo lo viera.
  // Solo la captura en `window` llega primero. Cuando el gesto consume, se
  // detiene la propagación; si no, la tecla fluye al global.
  // Spec: docs/superpowers/specs/2026-08-29-linea-interna-y-medidas-design.md § 8
  useEffect(() => {
    // Quién consumió la tecla, si alguien lo dijo. Solo los tres ganchos cuyo
    // `handleKeyDown` devuelve boolean pueden decirlo; los demás se ven en la
    // bitácora por lo que despachan.
    type KeyConsumer = 'internalShape' | 'pen' | 'rectangle' | 'circle' | 'triangle' | 'cotas' | 'elastic' | null;
    const routeKey = (e: KeyboardEvent): KeyConsumer => {
      // Línea interna: con trazo vivo, Escape / Enter / Retroceso / Supr son
      // del motor. `handleKeyDown` dice si consumió.
      if (activeTool === 'internalShape' && internalShapeTool.isTracing()) {
        if (internalShapeTool.handleKeyDown(e)) {
          e.preventDefault();
          e.stopPropagation();
          return 'internalShape';
        }
        return null;
      }
      // Pluma: Escape con trazo y Enter con ≥ 2 nodos. Antes vivía en la
      // burbuja y el Escape disparaba además la deselección global.
      if (activeTool === 'pen') {
        if (pen.handleKeyDown(e)) {
          e.preventDefault();
          e.stopPropagation();
          return 'pen';
        }
        return null;
      }
      // Rectángulo: Escape con press vivo cancela el arrastre (spec § 6).
      if (activeTool === 'rectangle' && rectTool.isArmed()) {
        if (rectTool.handleKeyDown(e)) {
          e.preventDefault();
          e.stopPropagation();
          return 'rectangle';
        }
        return null;
      }
      // Círculo: la misma ley que el rectángulo, su hermano (#1111).
      if (activeTool === 'circle' && circleTool.isArmed()) {
        if (circleTool.handleKeyDown(e)) {
          e.preventDefault();
          e.stopPropagation();
          return 'circle';
        }
        return null;
      }
      // Triángulo: la misma ley que sus hermanos (#1111, tanda 8).
      if (activeTool === 'triangle' && triangleTool.isArmed()) {
        if (triangleTool.handleKeyDown(e)) {
          e.preventDefault();
          e.stopPropagation();
          return 'triangle';
        }
        return null;
      }
      // Elástico: con uno seleccionado, Supr lo borra y Escape lo suelta. Va
      // aquí y no en la burbuja porque `edit.delete` es un atajo GLOBAL que
      // corre antes, y desde la burbuja Supr habría borrado la pieza además
      // del elástico. Sin selección devuelve `false` y el Supr sigue su camino.
      if (activeTool === 'elastic') {
        if (elasticTool.handleKeyDown(e)) {
          e.preventDefault();
          e.stopPropagation();
          return 'elastic';
        }
        return null;
      }
      // Tab desde el lienzo: a la primera cota viva (spec cotas vivas § 5.3).
      // Solo desde el <svg> o el body — desde el dock o desde un chip en
      // reposo, Tab es el nativo (si no, un Tab desde un chip volvería al
      // primero en bucle).
      if (e.key === 'Tab' && !e.shiftKey) {
        const t = e.target as HTMLElement | null;
        const desdeElLienzo = t === document.body || (t?.tagName ?? '').toLowerCase() === 'svg';
        if (desdeElLienzo && cotas?.current?.focusFirst()) {
          e.preventDefault();
          e.stopPropagation();
          return 'cotas';
        }
      }
      if (e.key !== 'Escape') return null;
      // Tool Punto armado: cancelar SOLO la colocación pendiente (el hook hace
      // preventDefault + stopPropagation). Sin armar, el Esc fluye normal.
      if (activeTool === 'point' && pointTool.armed) {
        pointTool.handleKeyDown(e);
        return null;
      }
      // El piquete comparte la misma ley que Coser: mientras el press siga
      // vivo, Escape pertenece al gesto y no a la selección.
      if (activeTool === 'notch' && notchTool.isArmed()) {
        notchTool.handleKeyDown(e);
        return null;
      }
      // El tramo de margen ya fijó su borde en el press; Escape pertenece a
      // ese gesto y no debe caer además en la deselección global.
      if (activeTool === 'seamAllowance' && seamAllowanceTool.isArmed()) {
        seamAllowanceTool.handleKeyDown(e);
        return null;
      }
      // Coser: con un gesto armado o una mitad sostenida, el Esc es del tool.
      // El hook hace preventDefault + stopPropagation cuando cancela algo; si
      // no hay nada que cancelar, el Esc fluye normal → deseleccionar.
      if (activeTool === 'seam') {
        seamTool.handleKeyDown(e);
        return null;
      }
      if (activeTool !== 'select') return null;
      if (!transformTool.isDragging) return null;
      transformTool.handleKeyDown(e);
      e.preventDefault();
      e.stopPropagation();
      return null;
    };
    const onKeyCapture = (e: KeyboardEvent) => {
      // Las teclas que nacen dentro de un campo editable pertenecen al campo.
      if (isEditableTarget(e.target)) return;
      // La tecla entra a la bitácora ANTES de sus consecuencias (la acción que
      // despache el gancho); quién la consumió se completa al volver. La
      // repetición automática de una tecla sostenida no es un gesto nuevo.
      const entry = e.repeat ? null : pushJournal('gesture', 'key', {
        tool: activeTool, key: e.key,
        ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey, alt: e.altKey,
        consumedBy: null,
      });
      const consumedBy = routeKey(e);
      if (entry?.data) entry.data.consumedBy = consumedBy;
    };
    window.addEventListener('keydown', onKeyCapture, { capture: true });
    return () => window.removeEventListener('keydown', onKeyCapture, { capture: true });
  }, [activeTool, transformTool, pointTool, seamTool, notchTool, seamAllowanceTool, internalShapeTool, pen, rectTool, circleTool, triangleTool, elasticTool, cotas]);

  // Refs to avoid stale closures in the wheel handler
  const zoomRef = useRef(zoom2D);
  zoomRef.current = zoom2D;
  const panRef2 = useRef(pan2D);
  panRef2.current = pan2D;

  const inputScheme = useSelector((s: RootState) => s.inputScheme.scheme);
  const inputSchemeRef = useRef<InputSchemeId>(inputScheme);
  inputSchemeRef.current = inputScheme;

  // Register wheel handler with { passive: false } to allow preventDefault
  // React's onWheel uses passive listeners by default in Chrome, causing
  // "Unable to preventDefault inside passive event listener" warnings.
  //
  // rAF-coalesced (spec 2026-06-04 § Momentum): trackpad momentum emits
  // dozens of events/s with no terminator; accumulate per frame and dispatch
  // at most once per frame instead of per event (Halberg constraint 4).
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    let panAcc = { dx: 0, dy: 0 };
    let zoomAcc = { factor: 1, cx: 0, cy: 0 };
    let rafId = 0;

    const flush = () => {
      rafId = 0;
      let basePan = panRef2.current;
      if (zoomAcc.factor !== 1) {
        const zoomFactorForFrame = zoomAcc.factor;
        const next = zoomAtPoint(
          { zoom: zoomRef.current, pan: basePan },
          zoomFactorForFrame, zoomAcc.cx, zoomAcc.cy,
        );
        dispatch(setPan2D(next.pan));
        dispatch(setZoom2D(next.zoom));
        if (isPinnedAtZoomCeiling(zoomRef.current, zoomFactorForFrame) && zoomCeilingToastLimiter.tryEmit()) {
          dispatch(showInfoToast('Zoom máximo'));
        }
        basePan = next.pan;
        zoomAcc = { factor: 1, cx: 0, cy: 0 };
      }
      if (panAcc.dx !== 0 || panAcc.dy !== 0) {
        // Note: basePan is the last Redux-committed pan (or this frame's zoom
        // adjustment). If a middle-click drag is active, the live DOM transform
        // differs — simultaneous wheel+drag is not a realistic gesture; tolerated.
        // natural-scroll convention: content follows fingers (deltaY>0 → view down)
        dispatch(setPan2D({ x: basePan.x - panAcc.dx, y: basePan.y - panAcc.dy }));
        panAcc = { dx: 0, dy: 0 };
      }
    };

    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const intent = wheelIntent(e, inputSchemeRef.current, '2d');
      if (!intent) return;
      if (intent.kind === 'pan') {
        panAcc.dx += intent.dx;
        panAcc.dy += intent.dy;
      } else if (intent.kind === 'zoom') {
        zoomAcc.factor *= zoomFactor(intent.delta);
        const rect = svg.getBoundingClientRect();
        zoomAcc.cx = e.clientX - rect.left;
        zoomAcc.cy = e.clientY - rect.top;
      }
      if (!rafId) rafId = requestAnimationFrame(flush);
    };

    svg.addEventListener('wheel', handler, { passive: false });
    return () => {
      svg.removeEventListener('wheel', handler);
      if (rafId) cancelAnimationFrame(rafId);
      flush(); // commit any pending deltas on unmount (spec § error handling)
    };
  }, [dispatch]);

  // Keep handleWheel as a no-op for the return signature (SVG onWheel removed)
  const handleWheel = useCallback((_e: React.WheelEvent) => { /* handled by native listener */ }, []);

  const handleDoubleClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    pushJournal('gesture', 'dblclick', { tool: activeTool });
    if (activeTool === 'editPattern') {
      const handled = editPattern.handleDoubleClick(e);
      if (handled) return;
    }
    if (activeTool === 'internalShape') {
      internalShapeTool.handleDoubleClick();
      return;
    }
    if (activeTool === 'pen') {
      pen.handleDoubleClick();
      return;
    }
    if (activeTool === 'select') {
      const target = e.target as SVGElement;
      const pieceId = target.closest('[data-piece-id]')?.getAttribute('data-piece-id');
      if (pieceId) {
        nodeEditor.enterEdit(pieceId);
      }
    }
  }, [activeTool, nodeEditor, editPattern, internalShapeTool, pen]);

  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    pressRef.current = { x: e.clientX, y: e.clientY };
    pushJournal('gesture', 'down', {
      tool: activeTool, button: e.button, ...(worldOf(e, zoom2D, pan2D) ?? {}),
      target: describeTarget(e.target),
      shift: !!e.shiftKey, ctrl: !!(e.ctrlKey || e.metaKey), alt: !!e.altKey,
    });
    if (e.button === 1) {
      if (activeTool === 'seamAllowance') seamAllowanceTool.limpiarHover();
      panRef.current = { startMouse: { x: e.clientX, y: e.clientY }, startPan: { ...pan2D } };
      return;
    }
    if (nodeEditor.isEditing && (activeTool === 'select' || activeTool === 'editCurve')) {
      const handled = nodeEditor.handleMouseDown(e);
      if (handled) return;
    }
    if (editPattern.isEditing && activeTool === 'editPattern') {
      // Clicking a DIFFERENT piece switches the edit target (nota de María
      // #170). The tool's handleMouseDown consumes every click — its last
      // branch turns a miss into a marquee — so without this check the entry
      // below is unreachable while editing and you stay locked on the first
      // piece, with Escape as the only way out. Nothing under the cursor
      // (empty canvas, or a node glyph, which lives in the overlay and hangs
      // off no [data-piece-id]) still goes to the tool, so marquee and point
      // dragging are untouched.
      // Con el botón derecho no se cambia de pieza en edición, por la misma
      // razón que no se reentra en la que ya está: `enterEdit` resetea el
      // estado y BORRA la selección de puntos, así que el clic derecho sobre
      // otra pieza dejaba el menú sin sujeto. La guarda de abajo cubría solo la
      // mitad del recorrido — lo señaló la revisión adversarial del 06-09.
      const clicked = (e.target as SVGElement)
        .closest('[data-piece-id]')?.getAttribute('data-piece-id');
      if (e.button === 0 && clicked && clicked !== editPattern.editingPieceId) {
        editPattern.enterEdit(clicked);
        return;
      }
      const handled = editPattern.handleMouseDown(e);
      if (handled) return;
    }
    if (activeTool === 'editPattern') {
      // El botón derecho NO cambia de sujeto: pregunta por el que hay. Sin esta
      // guarda, clicar con el derecho sobre la pieza que ya se está editando
      // caía aquí —`handleMouseDown` del hook devuelve `false` para cualquier
      // botón que no sea el izquierdo— y volvía a llamar `enterEdit` sobre la
      // MISMA pieza, que resetea el estado entero y BORRA la selección de
      // puntos. Medido el 2026-09-06: los chips del punto pasaban de dos a cero
      // en el propio clic que iba a abrir su menú, así que «Mover exacto…»
      // nunca tenía sujeto. Es la puerta de la petición literal de María
      // [02:34], cerrándose sola al tocarla.
      if (e.button !== 0) return;
      // Not yet editing — click piece to enter
      const target = e.target as SVGElement;
      const pieceId = target.closest('[data-piece-id]')?.getAttribute('data-piece-id');
      if (pieceId) {
        editPattern.enterEdit(pieceId);
      } else {
        editPattern.exitEdit();
      }
      return;
    }
    if (activeTool === 'editCurve') {
      // El dock tool "Edit Curve Points" existía pero ningún handler ruteaba
      // hacia él — clicar la pieza no hacía nada (maria-203). Mismo patrón de
      // entrada que editPattern; el bloque isEditing de arriba ya cubre el
      // resto del ciclo, y un clic sobre OTRA pieza cae aquí y cambia el
      // objetivo de edición.
      const target = e.target as SVGElement;
      const pieceId = target.closest('[data-piece-id]')?.getAttribute('data-piece-id');
      if (pieceId) {
        nodeEditor.enterEdit(pieceId);
      } else {
        nodeEditor.exitEdit();
      }
      return;
    }
    if (activeTool === 'pen') { pen.handleMouseDown(e); return; }
    if (activeTool === 'rectangle') { rectTool.handleMouseDown(e); return; }
    if (activeTool === 'circle') { circleTool.handleMouseDown(e); return; }
    if (activeTool === 'triangle') { triangleTool.handleMouseDown(e); return; }
    if (activeTool === 'seam') { seamTool.handleMouseDown(e); return; }
    if (activeTool === 'notch') { notchTool.handleMouseDown(e); return; }
    if (activeTool === 'point') { pointTool.handleMouseDown(e); return; }
    if (activeTool === 'seamAllowance') { seamAllowanceTool.handleMouseDown(e); return; }
    if (activeTool === 'trimPlace') { trimTool.handleMouseDown(e); return; }
    if (activeTool === 'grainline') { grainlineTool.handleMouseDown(e); return; }
    if (MEASURE_TOOL_IDS.has(activeTool)) { measureTool.handleMouseDown(e); return; }
    if (activeTool === 'scissors') { scissorsTool.handleMouseDown(e); return; }
    if (activeTool === 'slashAndSpread') { slashAndSpreadTool.handleMouseDown(e); return; }
    if (activeTool === 'merge') { mergeTool.handleMouseDown(e); return; }
    if (activeTool === 'seamEdit') { seamEditTool.handleMouseDown(e); return; }
    if (activeTool === 'topstitchSeamline' || activeTool === 'topstitchSegment' || activeTool === 'topstitchFree') { topstitchTool.handleMouseDown(e); return; }
    if (activeTool === 'walkSeam') { walkSeamTool.handleMouseDown(e); return; }
    if (activeTool === 'offsetOutline') { offsetTool.handleMouseDown(e); return; }
    if (activeTool === 'extendTrim') { extendTrimTool.handleMouseDown(e); return; }
    if (activeTool === 'internalShape') { internalShapeTool.handleMouseDown(e); return; }
    if (activeTool === 'pleat') { pleatTool.handleMouseDown(e); return; }
    if (activeTool === 'elastic') { elasticTool.handleMouseDown(e); return; }
    if (activeTool === 'transform') {
      const handled = transformTool.handleMouseDown(e);
      if (handled) return;
      // Fall through to piece selection if no handle was hit
      const target = e.target as SVGElement;
      const pieceId = target.closest('[data-piece-id]')?.getAttribute('data-piece-id');
      if (pieceId) {
        if (e.shiftKey) {
          dispatch(togglePieceSelection(pieceId));
        } else {
          dispatch(selectPiece(pieceId));
        }
      } else {
        dispatch(clearSelection());
      }
      return;
    }
    if (activeTool === 'hand') {
      panRef.current = { startMouse: { x: e.clientX, y: e.clientY }, startPan: { ...pan2D } };
      return;
    }
    if (activeTool === 'select') {
      // Transform box en el verbo por defecto (nota 170): sus handles se hit-testean
      // primero. Gateado por showTransformBox → una pieza bloqueada (box oculto) y la
      // altitud POINT (G7) nunca rutean acá.
      if (showTransformBox) {
        const handled = transformTool.handleMouseDown(e);
        if (handled) return;
      }
      const rect = e.currentTarget.getBoundingClientRect();
      const { x: clickX, y: clickY } = screenToPattern(e.clientX, e.clientY, rect, zoom2D, pan2D);

      // Check if dragging an endpoint of the currently selected internal line
      if (selectedInternalLine) {
        const ilPiece = pieces.find(p => p.id === selectedInternalLine.pieceId);
        if (ilPiece) {
          const ilLine = ilPiece.internals.find(l => l.id === selectedInternalLine.lineId);
          if (ilLine) {
            const endpoints = getInternalLineEndpoints(ilLine);
            if (endpoints) {
              const { x: localX, y: localY } = patternToPieceLocal({ x: clickX, y: clickY }, ilPiece);
              const EP_THRESHOLD = screenToPatternLength(8, zoom2D);
              for (let i = 0; i < 2; i++) {
                if (Math.hypot(localX - endpoints[i].x, localY - endpoints[i].y) <= EP_THRESHOLD) {
                  internalLineDragRef.current = {
                    pieceId: selectedInternalLine.pieceId,
                    lineId: selectedInternalLine.lineId,
                    endpointIndex: i as 0 | 1,
                    startMouse: { x: e.clientX, y: e.clientY },
                    startPos: { ...endpoints[i] },
                  };
                  setIsDraggingEndpoint(true);
                  return;
                }
              }
            }
          }
        }
      }

      const target = e.target as SVGElement;
      const pieceId = target.closest('[data-piece-id]')?.getAttribute('data-piece-id');
      
      if (pieceId) {
        const piece = pieces.find(p => p.id === pieceId);
        if (piece) {
          // Check if click is on an anchor point of the currently selected piece
          const selectedEls = target.ownerSVGElement?.querySelectorAll('.pattern-piece.selected');
          const selectedIds = new Set<string>();
          selectedEls?.forEach(el => {
            const id = el.getAttribute('data-piece-id');
            if (id) selectedIds.add(id);
          });
          
          if (selectedIds.has(pieceId)) {
            const clickedNode = findClickedAnchorPoint(e, piece);
            if (clickedNode) {
              // Enter node editing mode with this node selected
              nodeEditor.enterEdit(pieceId, clickedNode);
              return;
            }
          }

          // Check if clicking on an internal line
          const { x: localX, y: localY } = patternToPieceLocal({ x: clickX, y: clickY }, piece);
          const LINE_THRESHOLD = screenToPatternLength(5, zoom2D);
          let nearestLine: InternalLine | null = null;
          let nearestDist = Infinity;
          for (const line of piece.internals) {
            const dist = distToInternalLine(localX, localY, line.path);
            if (dist < LINE_THRESHOLD && dist < nearestDist) {
              nearestDist = dist;
              nearestLine = line;
            }
          }
          if (nearestLine) {
            dispatch(selectInternalLine({ pieceId: piece.id, lineId: nearestLine.id }));
            return;
          }
          
          // Shift+click = multi-select (CLO3D standard), regular click = single select
          if (e.shiftKey) {
            dispatch(togglePieceSelection(pieceId));
          } else {
            dispatch(selectPiece(pieceId));
          }
          // Bloqueada = geometría intocable, no el sitio (maria-204): mover
          // se permite; modificar sigue bloqueado en sus superficies (box de
          // transform oculto, editores de nodos con guard, curation gates).
          dragRef.current = { pieceId, startMouse: { x: e.clientX, y: e.clientY }, startPos: { ...piece.position } };
        }
      } else {
        // Empty area: start marquee selection
        if (!e.shiftKey) {
          dispatch(clearSelection());
        }
        marqueeRef.current = {
          startPattern: { x: clickX, y: clickY },
          currentPattern: { x: clickX, y: clickY },
          shiftKey: e.shiftKey,
        };
      }
    }
  }, [activeTool, pan2D, zoom2D, pen, rectTool, circleTool, triangleTool, seamTool, notchTool, pointTool, seamAllowanceTool, trimTool, grainlineTool, measureTool, scissorsTool, slashAndSpreadTool, mergeTool, seamEditTool, topstitchTool, walkSeamTool, transformTool, editPattern, dispatch, pieces, nodeEditor, findClickedAnchorPoint, selectedInternalLine, offsetTool, extendTrimTool, internalShapeTool, pleatTool, elasticTool, showTransformBox]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (panRef.current) {
      const dx = e.clientX - panRef.current.startMouse.x;
      const dy = e.clientY - panRef.current.startMouse.y;
      // Update SVG transform directly during drag (no Redux dispatch)
      const newX = panRef.current.startPan.x + dx;
      const newY = panRef.current.startPan.y + dy;
      const mainG = svgRef.current?.querySelector<SVGGElement>('[data-pan-zoom-group]');
      if (mainG) {
        mainG.setAttribute('transform', `translate(${newX}, ${newY}) scale(${zoom2D})`);
      }
      panRef.current.lastPos = { x: newX, y: newY };
      return;
    }
    if (transformTool.isDragging && activeTool === 'select') {
      transformTool.handleMouseMove(e);
      return;
    }
    if (editPattern.isEditing && activeTool === 'editPattern') {
      editPattern.handleMouseMove(e);
      return;
    }
    if (internalLineDragRef.current && activeTool === 'select') {
      const dx = screenToPatternLength(e.clientX - internalLineDragRef.current.startMouse.x, zoom2D);
      const dy = screenToPatternLength(e.clientY - internalLineDragRef.current.startMouse.y, zoom2D);
      const newPos: Point2D = {
        x: internalLineDragRef.current.startPos.x + dx,
        y: internalLineDragRef.current.startPos.y + dy,
      };
      const piece = pieces.find(p => p.id === internalLineDragRef.current!.pieceId);
      if (piece) {
        const line = piece.internals.find(l => l.id === internalLineDragRef.current!.lineId);
        if (line) {
          const newPath = line.path.map(c => ({ ...c, values: [...c.values] }));
          if (internalLineDragRef.current.endpointIndex === 0) {
            newPath[0].values[0] = newPos.x;
            newPath[0].values[1] = newPos.y;
          } else {
            const last = newPath[newPath.length - 1];
            if (last.type === 'L') {
              last.values[0] = newPos.x; last.values[1] = newPos.y;
            } else if (last.type === 'C') {
              const ddx = newPos.x - last.values[4], ddy = newPos.y - last.values[5];
              last.values[4] = newPos.x; last.values[5] = newPos.y;
              last.values[2] += ddx; last.values[3] += ddy;
            } else if (last.type === 'Q') {
              const ddx = newPos.x - last.values[2], ddy = newPos.y - last.values[3];
              last.values[2] = newPos.x; last.values[3] = newPos.y;
              last.values[0] += ddx; last.values[1] += ddy;
            }
          }
          dispatch(updateInternalLine({
            pieceId: internalLineDragRef.current.pieceId,
            lineId: internalLineDragRef.current.lineId,
            path: newPath,
          }));
        }
      }
      return;
    }
    if (dragRef.current && activeTool === 'select') {
      const dx = screenToPatternLength(e.clientX - dragRef.current.startMouse.x, zoom2D);
      const dy = screenToPatternLength(e.clientY - dragRef.current.startMouse.y, zoom2D);
      const newX = dragRef.current.startPos.x + dx;
      const newY = dragRef.current.startPos.y + dy;
      // Update SVG transform directly during drag (no Redux dispatch)
      const pieceG = svgRef.current?.querySelector<SVGGElement>(`[data-piece-id="${dragRef.current.pieceId}"]`);
      if (pieceG) {
        const piece = pieces.find(p => p.id === dragRef.current!.pieceId);
        if (piece) {
          const { cx, cy } = piece.outline?.length ? getOutlineCenterForDrag(piece.outline) : { cx: 0, cy: 0 };
          pieceG.setAttribute('transform', `translate(${newX}, ${newY}) rotate(${piece.rotation}, ${cx}, ${cy})`);
        }
      }
      dragRef.current.lastPos = { x: newX, y: newY };
      // Mismo umbral que el commit: un temblor de clic no esconde la caja.
      // setState repetido con true es no-op para React — no re-renderiza.
      if (Math.hypot(e.clientX - dragRef.current.startMouse.x, e.clientY - dragRef.current.startMouse.y) >= DRAG_THRESHOLD_PX) {
        setIsDraggingPiece(true);
      }
      return;
    }
    if (marqueeRef.current && activeTool === 'select') {
      const svg = svgRef.current;
      if (svg) {
        const svgRect = svg.getBoundingClientRect();
        const patternPoint = screenToPattern(e.clientX, e.clientY, svgRect, zoom2D, pan2D);
        marqueeRef.current.currentPattern = patternPoint;
        setSelectMarquee({ start: marqueeRef.current.startPattern, current: patternPoint });
      }
      return;
    }
    if (nodeEditor.isEditing && (activeTool === 'select' || activeTool === 'editCurve')) {
      const handled = nodeEditor.handleMouseMove(e);
      if (handled) return;
    }
    // Hover idle en select: predice el clic para que el cursor diga la verdad
    // sobre los handles (nota 170). Sin drag activo → barato, acotado a ≤9
    // handles. El functional-update evita re-render salvo al cruzar un borde.
    if (activeTool === 'select') {
      let c: string | null = null;
      if (showTransformBox) {
        const rect = e.currentTarget.getBoundingClientRect();
        const pt = screenToPattern(e.clientX, e.clientY, rect, zoom2D, pan2D);
        c = transformTool.getCursor(pt);
      }
      setHoverCursor(prev => (prev === c ? prev : c));
      return;
    }
    if (activeTool === 'transform') {
      const handled = transformTool.handleMouseMove(e);
      if (handled) return;
    }
    if (activeTool === 'pen') pen.handleMouseMove(e);
    if (activeTool === 'rectangle') rectTool.handleMouseMove(e);
    if (activeTool === 'circle') circleTool.handleMouseMove(e);
    if (activeTool === 'triangle') triangleTool.handleMouseMove(e);
    if (activeTool === 'seam') {
      seamTool.handleMouseMove(e);
      seamEditTool.handleMouseMove(e);
    }
    if (activeTool === 'notch') notchTool.handleMouseMove(e);
    if (activeTool === 'point') pointTool.handleMouseMove(e);
    if (activeTool === 'trimPlace') trimTool.handleMouseMove(e);
    if (activeTool === 'seamAllowance') seamAllowanceTool.handleMouseMove(e);
    if (activeTool === 'grainline') grainlineTool.handleMouseMove(e);
    if (MEASURE_TOOL_IDS.has(activeTool)) measureTool.handleMouseMove(e);
    if (activeTool === 'scissors') scissorsTool.handleMouseMove(e);
    if (activeTool === 'slashAndSpread') slashAndSpreadTool.handleMouseMove(e);
    if (activeTool === 'merge') mergeTool.handleMouseMove(e);
    if (activeTool === 'seamEdit') seamEditTool.handleMouseMove(e);
    if (activeTool === 'topstitchSeamline' || activeTool === 'topstitchSegment' || activeTool === 'topstitchFree') topstitchTool.handleMouseMove(e);
    if (activeTool === 'walkSeam') walkSeamTool.handleMouseMove(e);
    if (activeTool === 'offsetOutline') offsetTool.handleMouseMove(e);
    if (activeTool === 'extendTrim') extendTrimTool.handleMouseMove(e);
    if (activeTool === 'internalShape') internalShapeTool.handleMouseMove(e);
    if (activeTool === 'pleat') pleatTool.handleMouseMove(e);
    if (activeTool === 'elastic') elasticTool.handleMouseMove(e);
  }, [activeTool, zoom2D, pan2D, pen, rectTool, circleTool, triangleTool, seamTool, notchTool, pointTool, trimTool, seamAllowanceTool, grainlineTool, measureTool, scissorsTool, slashAndSpreadTool, mergeTool, seamEditTool, topstitchTool, walkSeamTool, transformTool, editPattern, nodeEditor, pieces, dispatch, setSelectMarquee, offsetTool, extendTrimTool, internalShapeTool, pleatTool, elasticTool, showTransformBox]);

  const handleMouseUp = useCallback((e?: React.MouseEvent<SVGSVGElement>) => {
    const press = pressRef.current;
    pressRef.current = null;
    if (e) {
      pushJournal('gesture', 'up', {
        tool: activeTool, button: e.button, ...(worldOf(e, zoom2D, pan2D) ?? {}),
        drag: press ? isDrag(e.clientX - press.x, e.clientY - press.y) : false,
      });
    } else {
      // Sin evento (blur, reentrada con buttons === 0): el release es sintético.
      pushJournal('gesture', 'up', { tool: activeTool, synthetic: true });
    }
    // Resolve marquee selection
    if (marqueeRef.current) {
      const mq = marqueeRef.current;
      const mx1 = Math.min(mq.startPattern.x, mq.currentPattern.x);
      const my1 = Math.min(mq.startPattern.y, mq.currentPattern.y);
      const mx2 = Math.max(mq.startPattern.x, mq.currentPattern.x);
      const my2 = Math.max(mq.startPattern.y, mq.currentPattern.y);
      const MIN_DRAG = screenToPatternLength(DRAG_THRESHOLD_PX, zoom2D);
      if (mx2 - mx1 > MIN_DRAG || my2 - my1 > MIN_DRAG) {
        const hitIds: string[] = [];
        for (const piece of pieces) {
          if (!piece.outline?.length) continue;
          let pMinX = Infinity, pMaxX = -Infinity, pMinY = Infinity, pMaxY = -Infinity;
          for (const cmd of piece.outline) {
            const v = cmd.values;
            if (cmd.type === 'M' || cmd.type === 'L') {
              const px = v[0] + piece.position.x, py = v[1] + piece.position.y;
              if (px < pMinX) pMinX = px; if (px > pMaxX) pMaxX = px;
              if (py < pMinY) pMinY = py; if (py > pMaxY) pMaxY = py;
            } else if (cmd.type === 'C') {
              for (let i = 0; i < 6; i += 2) {
                const px = v[i] + piece.position.x, py = v[i + 1] + piece.position.y;
                if (px < pMinX) pMinX = px; if (px > pMaxX) pMaxX = px;
                if (py < pMinY) pMinY = py; if (py > pMaxY) pMaxY = py;
              }
            } else if (cmd.type === 'Q') {
              for (let i = 0; i < 4; i += 2) {
                const px = v[i] + piece.position.x, py = v[i + 1] + piece.position.y;
                if (px < pMinX) pMinX = px; if (px > pMaxX) pMaxX = px;
                if (py < pMinY) pMinY = py; if (py > pMaxY) pMaxY = py;
              }
            }
          }
          if (pMaxX >= mx1 && pMinX <= mx2 && pMaxY >= my1 && pMinY <= my2) {
            hitIds.push(piece.id);
          }
        }
        if (hitIds.length > 0) {
          if (mq.shiftKey) {
            const merged = new Set([...selectedPieceIds, ...hitIds]);
            dispatch(selectAllPieces(Array.from(merged)));
          } else {
            dispatch(selectAllPieces(hitIds));
          }
        }
      }
      marqueeRef.current = null;
      setSelectMarquee(null);
    }
    // Commit pan position to Redux on mouseUp
    if (panRef.current?.lastPos) {
      dispatch(setPan2D(panRef.current.lastPos));
    }
    // Commit piece position to Redux on mouseUp — solo pasado el umbral de
    // arrastre. Un clic normal tiembla sub-pixel entre down y up; sin este
    // gate cada clic despachaba un "Move Piece" de cero intención al undo
    // (EB-1/EB-2). Espeja el gate del marquee (:731).
    const d = dragRef.current;
    if (d?.lastPos) {
      const moved = Math.hypot(d.lastPos.x - d.startPos.x, d.lastPos.y - d.startPos.y);
      if (moved >= screenToPatternLength(DRAG_THRESHOLD_PX, zoom2D)) {
        dispatch(movePiece({ id: d.pieceId, x: d.lastPos.x, y: d.lastPos.y }));
      } else {
        // Sin commit no hay re-render que corrija el transform manual: la
        // pieza quedaba desplazada esos px sin estado que la respalde
        // (maria-200). Devolver el DOM a la verdad de Redux.
        const pieceG = svgRef.current?.querySelector<SVGGElement>(`[data-piece-id="${d.pieceId}"]`);
        const piece = pieces.find(p => p.id === d.pieceId);
        if (pieceG && piece) {
          const { cx, cy } = piece.outline?.length ? getOutlineCenterForDrag(piece.outline) : { cx: 0, cy: 0 };
          pieceG.setAttribute('transform', `translate(${piece.position.x}, ${piece.position.y}) rotate(${piece.rotation}, ${cx}, ${cy})`);
        }
      }
    }
    setIsDraggingPiece(false);
    panRef.current = null;
    dragRef.current = null;
    internalLineDragRef.current = null;
    setIsDraggingEndpoint(false);
    if (activeTool === 'pen') pen.handleMouseUp();
    if (activeTool === 'rectangle') {
      // Sin evento (blur, reentrada con buttons === 0) no hay release fiable:
      // se cancela el press en vez de crear un rectángulo inventado.
      if (e) rectTool.handleMouseUp(e);
      else rectTool.cancel();
    }
    if (activeTool === 'circle') {
      // Misma ley que el rectángulo: sin evento no se inventa geometría.
      if (e) circleTool.handleMouseUp(e);
      else circleTool.cancel();
    }
    if (activeTool === 'triangle') {
      // Misma ley que sus hermanos: sin evento no se inventa geometría.
      if (e) triangleTool.handleMouseUp(e);
      else triangleTool.cancel();
    }
    if (activeTool === 'seamAllowance') {
      // Blur no trae un release geométrico fiable. La captura de puntero hace
      // llegar el evento real incluso fuera del SVG; sin evento se cancela.
      if (e) seamAllowanceTool.handleMouseUp(e);
      else seamAllowanceTool.cancel();
    }
    if (activeTool === 'grainline') grainlineTool.handleMouseUp(e);
    if (activeTool === 'transform' || (activeTool === 'select' && transformTool.isDragging)) transformTool.handleMouseUp();
    if (nodeEditor.isEditing) nodeEditor.handleMouseUp();
    if (activeTool === 'editPattern') editPattern.handleMouseUp();
    if (activeTool === 'scissors') scissorsTool.handleMouseUp();
    if (activeTool === 'slashAndSpread') slashAndSpreadTool.handleMouseUp();
    if (activeTool === 'merge') mergeTool.handleMouseUp();
    if (activeTool === 'offsetOutline') offsetTool.handleMouseUp();
    if (activeTool === 'extendTrim') extendTrimTool.handleMouseUp();
    if (activeTool === 'internalShape') {
      // Sin evento (blur, reentrada con buttons === 0) no hay release
      // geométrico fiable: se descarta el press, no el trazo.
      if (e) internalShapeTool.handleMouseUp(e);
      else internalShapeTool.cancelPress();
    }
    if (activeTool === 'point' && e) pointTool.handleMouseUp(e);
    if (activeTool === 'seam' && e) seamTool.handleMouseUp(e);
    if (activeTool === 'notch' && e) notchTool.handleMouseUp(e);
  }, [activeTool, pen, rectTool, circleTool, triangleTool, seamAllowanceTool, grainlineTool, transformTool, nodeEditor, editPattern, scissorsTool, slashAndSpreadTool, mergeTool, dispatch, pieces, zoom2D, pan2D, selectedPieceIds, setSelectMarquee, offsetTool, extendTrimTool, internalShapeTool, pointTool, seamTool, notchTool]);

  const handlePointerCancel = useCallback(() => {
    pushJournal('gesture', 'cancel', { tool: activeTool });
    // `pointercancel` no trae una posición final fiable. Tratarlo como mouseup
    // inventaría un valor; tratarlo como Escape conserva el último estado
    // estable y deja el siguiente gesto limpio.
    if (activeTool === 'notch' && notchTool.isArmed()) notchTool.cancel();
    // Sin condición de armado: un press sobre una esquina o el vacío no arma
    // gesto pero sí deja el botón "abajo" para la lectura del margen; si el
    // navegador se queda el puntero, solo `cancel()` lo suelta (5b-3).
    if (activeTool === 'seamAllowance') seamAllowanceTool.cancel();
    // La línea interna descarta solo el press vivo (los nodos quedan); la
    // pluma no separa press de trazo y suelta el trazo entero.
    if (activeTool === 'internalShape') internalShapeTool.cancelPress();
    if (activeTool === 'pen') pen.reset();
    if (activeTool === 'rectangle') rectTool.cancel();
    if (activeTool === 'circle') circleTool.cancel();
    if (activeTool === 'triangle') triangleTool.cancel();
    if (activeTool === 'grainline') grainlineTool.cancel();
    internalLineDragRef.current = null;
    setIsDraggingEndpoint(false);
  }, [activeTool, notchTool, seamAllowanceTool, internalShapeTool, pen, rectTool, circleTool, triangleTool, grainlineTool]);

  const handleMouseLeave = useCallback(() => {
    if (activeTool === 'seamAllowance') seamAllowanceTool.limpiarHover();
  }, [activeTool, seamAllowanceTool]);

  const getCursor = () => {
    if (nodeEditor.isEditing) return nodeEditor.hoveredNode ? 'move' : 'default';
    switch (activeTool) {
      case 'pen': return 'crosshair';
      case 'hand': return panRef.current ? 'grabbing' : 'grab';
      case 'select':
        if (dragRef.current) return 'grabbing';
        if (marqueeRef.current) return 'crosshair';
        return hoverCursor ?? 'default';
      case 'transform': return 'default';
      case 'editPattern': return editPattern.isEditing ? editPattern.getCursor() : 'default';
      case 'seam': return 'crosshair';
      case 'notch': return 'crosshair';
      case 'point': return pointTool.getCursor();
      case 'seamAllowance': return 'crosshair';
      case 'trimPlace': return 'crosshair';
      case 'grainline': return 'crosshair';
      case 'measure': case 'measureCurve': case 'compareCurves': return 'crosshair';
      case 'scissors': return scissorsTool.getCursor();
      case 'slashAndSpread': return slashAndSpreadTool.getCursor();
      case 'merge': return mergeTool.getCursor();
      case 'seamEdit': return 'pointer';
      case 'topstitchSeamline': case 'topstitchSegment': case 'topstitchFree': return topstitchTool.getCursor();
      case 'walkSeam': return walkSeamTool.getCursor();
      case 'topstitchEdit': return 'default';
      case 'pleat': return 'crosshair';
      case 'offsetOutline': return offsetTool.getCursor();
      case 'extendTrim': return extendTrimTool.getCursor();
      case 'elastic': return 'crosshair';
      default: return 'crosshair';
    }
  };

  return { svgRef, handleWheel, handleDoubleClick, handleMouseDown, handleMouseMove, handleMouseUp, handleMouseLeave, handlePointerCancel, getCursor, selectMarquee, showTransformBox, isDraggingPiece, isDraggingEndpoint };
}
