/**
 * useEditPattern.ts — Edit Pattern (Q) hook.
 *
 * Manages point/segment selection (including multi-select and marquee),
 * dragging points and segments, and delegates mutations (add, delete, convert)
 * to nodeEditorUtils.
 *
 * Does NOT show bezier handles — that is for useEditCurve.
 */

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../store';
import { updatePiece } from '../../store/projectSlice';
import {
  beginUndoBatch,
  endUndoBatch,
  isUndoBatchTokenActive,
  withUndoBatchToken,
  type UndoBatchToken,
} from '../../store/undoMiddleware';
import type { Point2D, PatternPiece, PathCommand } from '../../types/types';
import {
  extractNodes,
  hitTestNode,
  nearestSegment,
  applyNodeMove,
  applyAnchorMoves,
  splitSegmentAt,
  deletePoint,
  convertToCurve,
  convertToLine,
  anchorGroupOf,
  coincidentAnchorGroups,
  type EditableNode,
} from './nodeEditorUtils';
import { screenToPattern, screenToPatternLength } from '../../utils/geometry';
import { piezaBloqueada } from '../../utils/piezaBloqueada';
import { convertSegmentToSpline, resmoothAfterMove, toManualBezier } from './splineSegment';
import { guiasShift, type GuiaShift, type GuiasShift } from './restriccionShift';
import { useShiftSostenido, type ModoShift } from './useShiftSostenido';
import { ABSOLUTE_REFERENCE, arrivingReference, chordReference, type AngleReference } from './angleReference';
import { isDrag } from './gestureConstants';
import { showInfoToast } from '../../store/copilotUISlice';
import {
  patternToPieceLocal,
  patternToPieceLocalDirection,
  pieceLocalToPattern,
} from './pieceTransform';
export { patternToPieceLocal, pieceLocalToPattern } from './pieceTransform';
import { conPaths, CLAVE_CONTORNO, type ClaveLinea } from './lineaEditable';

// ─── Constants ───

const HIT_RADIUS_PX = 8; // screen pixels
const NO_HIDDEN_LAYER_IDS: number[] = [];

// ─── State ───

export interface EditPatternState {
  isEditing: boolean;
  editingPieceId: string | null;
  hoveredPieceId: string | null;
  nodes: EditableNode[];
  selectedNodes: Set<number>;       // commandIndex set (multi-select)
  selectedSegments: Set<number>;    // commandIndex of segment destination
  hoveredNode: number | null;       // commandIndex
  hoveredSegment: number | null;    // commandIndex
  addPointPreview: Point2D | null;  // preview dot on edge hover
  marquee: { start: Point2D; current: Point2D } | null;
}

const INITIAL_STATE: EditPatternState = {
  isEditing: false,
  editingPieceId: null,
  hoveredPieceId: null,
  nodes: [],
  selectedNodes: new Set<number>(),
  selectedSegments: new Set<number>(),
  hoveredNode: null,
  hoveredSegment: null,
  addPointPreview: null,
  marquee: null,
};

// ─── Drag ref types ───

/** Lo que un gesto arrastra de UNA línea. */
interface ArrastreDeLinea {
  /** El path de la línea al empezar el gesto: cada frame se calcula desde aquí. */
  startPath: PathCommand[];
  /** commandIndex → posición original (un tramo agarrado guarda sus dos extremos). */
  startPositions: Map<number, Point2D>;
  /** Grupo de anclas coincidentes de cada punto arrastrado, en `startPath`. */
  groups?: Map<number, number[]>;
}

/** Lo que comparten el arrastre de puntos y el de tramos. */
interface OutlineDrag {
  startMouse: Point2D;
  /**
   * Las líneas que mueve el gesto, cada una con su punto de partida. Todas con
   * el mismo vector (spec 2026-09-24 § 4.1). En la fase 1, solo el contorno.
   */
  porLinea: Map<ClaveLinea, ArrastreDeLinea>;
  /** Último ratón del arrastre: pulsar Shift con la mano quieta lo re-aplica. */
  lastMouse?: Point2D;
  /** El último desplazamiento escrito (marco local). */
  lastDelta?: Point2D;
  /** Ya escribió al menos un frame. */
  wrote?: boolean;
  /** Shift+press sobre algo ya seleccionado: se quita al soltar si no hubo arrastre. */
  quitarAlSoltar?: { clave: ClaveLinea; indices: readonly number[] };
  /**
   * El marco de Shift dos veces, congelado al empezar (spec 2026-09-23 § 3.4):
   * desde dónde salen las guías —la posición inicial del punto agarrado, o el
   * punto del lado donde se pulsó— y respecto a qué lado, en espacio de patrón.
   * Un marco vivo giraría la guía bajo la mano mientras el lado se inclina.
   */
  marco: { desde: Point2D; referencia: AngleReference };
}

interface NodeDrag extends OutlineDrag {
  type: 'node';
}

interface SegmentDrag extends OutlineDrag {
  type: 'segment';
}

interface MarqueeDrag {
  type: 'marquee';
  startMouse: Point2D;
  startPositions: Map<number, Point2D>; // unused, kept for type uniformity
}

type DragState = NodeDrag | SegmentDrag | MarqueeDrag;

// ─── Pure helpers ───

/**
 * Where a double-click should insert a new point, if anywhere. Guards against
 * the phantom-point bug: a click on (or near) an existing anchor must NOT
 * split the adjacent segment — at a corner the vertex lies on both segments
 * at distance ~0, so the segment test alone always passes there.
 */
export function findInsertTarget(
  localPt: Point2D,
  nodes: EditableNode[],
  outline: PathCommand[],
  hitRadius: number,
): { commandIndex: number; t: number } | null {
  if (hitTestNode(localPt, nodes, hitRadius)) return null;
  const segHit = nearestSegment(localPt, outline);
  if (segHit && segHit.distance < hitRadius) {
    // An M target is nearestSegment's phantom closing edge of an OPEN
    // outline — there is no real edge there, so inserting is meaningless
    // (and would push a junk no-op entry onto the undo stack).
    if (outline[segHit.commandIndex]?.type === 'M') return null;
    return { commandIndex: segHit.commandIndex, t: segHit.t };
  }
  return null;
}

/**
 * Rebuild overlay nodes from the piece's current outline after an EXTERNAL
 * change (undo/redo restoring project state), so the anchor dots never detach
 * from the path. Selections and transient hover state are cleared, not
 * remapped: command indices shift when an insert is undone, so a surviving
 * index would silently denote different geometry (and a Delete on it would
 * destroy a legitimate corner).
 */
export function resyncStateToPiece(
  state: EditPatternState,
  piece: PatternPiece,
): EditPatternState {
  return {
    ...state,
    nodes: extractNodes(piece),
    selectedNodes: new Set<number>(),
    selectedSegments: new Set<number>(),
    hoveredPieceId: null,
    hoveredNode: null,
    hoveredSegment: null,
    addPointPreview: null,
    marquee: null,
  };
}

// ─── Hook ───

export function useEditPattern(zoom: number, pan: Point2D) {
  const dispatch = useDispatch();
  const pieces = useSelector((s: RootState) => s.project.pieces);
  const layerLocked = useSelector((s: RootState) => s.project.layerLocked);
  // `?? []`: varios arneses de prueba de este hook montan una tienda mínima
  // con solo el reducer `project` (útil desde antes de esta tanda). Con
  // `simulation` ausente ahí, este selector no puede exigirlo.
  const hiddenLayerIds = useSelector((s: RootState) => s.simulation?.hiddenLayerIds ?? NO_HIDDEN_LAYER_IDS);
  // Mismo criterio que `drawablePieces`/`PieceRenderer` (PatternEditor.tsx:198-206):
  // "solo lo que se dibuja puede prometer una lectura o recibir el clic", y
  // de arriba hacia abajo — si dos piezas se solapan, el hover-sin-clic no
  // puede señalar una que el clic real (hit-test del DOM, topmost por
  // definición) ignoraría por estar tapada.
  const hoverablePieces = useMemo(
    () => pieces
      .filter(p => !piezaBloqueada(p, layerLocked) && !hiddenLayerIds.includes(p.layer ?? 1))
      .sort((a, b) => (a.zOrder ?? 0) - (b.zOrder ?? 0))
      .reverse(),
    [pieces, hiddenLayerIds, layerLocked],
  );

  const [state, setState] = useState<EditPatternState>({ ...INITIAL_STATE });
  /** Shift ahora mismo: la pista del pie lo lee antes de agarrar nada. */
  const [modoShift, setModoShift] = useState<ModoShift>('suelto');
  /** Las guías del arrastre en curso, para `GuiasShiftOverlay`. */
  const [guias, setGuias] = useState<GuiasShift | null>(null);
  /** Solo reescribe el estado si lo que se pinta cambió. */
  const publicarGuias = useCallback((g: GuiasShift | null) => {
    setGuias(prev => (mismasGuias(prev, g) ? prev : g));
  }, []);

  useEffect(() => {
    if (state.isEditing || !state.hoveredPieceId) return;
    if (hoverablePieces.some(piece => piece.id === state.hoveredPieceId)) return;
    setState(current => ({
      ...current,
      hoveredPieceId: null,
      hoveredNode: null,
      hoveredSegment: null,
    }));
  }, [hoverablePieces, state.isEditing, state.hoveredPieceId]);

  const dragRef = useRef<DragState | null>(null);
  const dragBatchTokenRef = useRef<UndoBatchToken | null>(null);

  const beginDragBatch = useCallback((): UndoBatchToken => {
    const current = dragBatchTokenRef.current;
    if (current && isUndoBatchTokenActive(current)) return current;
    const token = beginUndoBatch(dispatch, 'Editar puntos del patrón');
    dragBatchTokenRef.current = token;
    return token;
  }, [dispatch]);

  const endDragBatch = useCallback(() => {
    const token = dragBatchTokenRef.current;
    if (!token) return;
    dragBatchTokenRef.current = null;
    endUndoBatch(dispatch, token);
  }, [dispatch]);
  /**
   * Outline object (by identity) this hook itself dispatched. The resync
   * effect treats a pieces change as internal only when the store's outline
   * IS that object — a boolean flag would mis-consume an external restore
   * that lands in the same React batch as an internal edit.
   */
  const expectedOutlineRef = useRef<PathCommand[] | null>(null);
  /** Last outline (by identity) of the edited piece this hook has seen. */
  const seenOutlineRef = useRef<PathCommand[] | null>(null);
  /**
   * Espejo de `state.editingPieceId` para `escribirLineas`, que necesita
   * saber a quién pertenece el overlay sin re-crearse en cada cambio de estado
   * (su identidad alimenta media docena de useCallback aguas abajo).
   */
  const editingPieceIdRef = useRef<string | null>(null);
  editingPieceIdRef.current = state.editingPieceId;

  // ─── Coordinate helpers ───

  /** Convert screen coords to pattern-space coords (accounting for pan/zoom) */
  const toPattern = useCallback(
    (e: React.MouseEvent<SVGSVGElement>): Point2D => {
      const rect = e.currentTarget.getBoundingClientRect();
      return screenToPattern(e.clientX, e.clientY, rect, zoom, pan);
    },
    [zoom, pan],
  );

  /** Convert screen coords to piece-local coords (undo position + render rotation) */
  const toLocal = useCallback(
    (e: React.MouseEvent<SVGSVGElement>, piece: PatternPiece): Point2D =>
      patternToPieceLocal(toPattern(e), piece),
    [toPattern],
  );

  /** Hit radius in pattern-space units */
  const hitRadius = screenToPatternLength(HIT_RADIUS_PX, zoom);

  // ─── Helper: get current piece ───

  const getPiece = useCallback(
    (pieceId: string | null): PatternPiece | undefined => {
      if (!pieceId) return undefined;
      return pieces.find(p => p.id === pieceId);
    },
    [pieces],
  );

  // ─── Helper: la única puerta de escritura (spec 2026-09-24 § 8) ───

  const escribirLineas = useCallback(
    (
      piece: PatternPiece,
      cambios: ReadonlyMap<ClaveLinea, PathCommand[] | null>,
      undoBatchToken?: UndoBatchToken,
    ) => {
      const updated = conPaths(piece, cambios);
      const action = updatePiece(updated);
      dispatch(undoBatchToken ? withUndoBatchToken(action, undoBatchToken) : action);
      const newNodes = extractNodes(updated);
      // El overlay pinta `nodes` con la transformada de `editingPieceId`, así
      // que un verbo sobre OTRA pieza no puede reescribirlos: serían las
      // coordenadas LOCALES de una pieza dibujadas en el sitio de otra. Ese es
      // el eco del #218 — el tool Punto pasa su propio `pieceId` ("callers
      // fuera del modo edición") y con Editar patrón abierto sobre A, poner un
      // punto en B dejaba las anclas de B flotando sobre la lona.
      if (piece.id === editingPieceIdRef.current) {
        expectedOutlineRef.current = updated.outline;
        // Si el verbo insertó o borró comandos, todo índice guardado corrió de
        // sitio y pasa a denotar OTRA geometría — exactamente lo que el JSDoc
        // de `resyncStateToPiece` explica para el undo externo. Es el mismo
        // caso, así que es la misma limpieza (#1122).
        //
        // Con guarda de longitud y no siempre: arrastrar y `moveNodeTo` mutan
        // valores en el sitio, y hay un contrato verde que EXIGE que la
        // selección sobreviva a un arrastre.
        //
        // ponytail: la longitud basta hoy porque ningún verbo inserta y borra
        // a la vez; si alguno llega con saldo neto cero, esto pasa a ser un
        // parámetro explícito del verbo.
        const estructural = updated.outline.length !== piece.outline.length;
        setState(s => (estructural
          ? resyncStateToPiece(s, updated)
          : { ...s, nodes: newNodes }));
      }
    },
    [dispatch],
  );

  /** Solo el contorno: lo que escribían los verbos de siempre. */
  const escribirContorno = useCallback(
    (piece: PatternPiece, outline: PathCommand[], undoBatchToken?: UndoBatchToken) =>
      escribirLineas(piece, new Map([[CLAVE_CONTORNO, outline]]), undoBatchToken),
    [escribirLineas],
  );

  // ─── Helper: candado en los verbos ───

  /**
   * Candado (maria-204) en la puerta común: los verbos de este hook son el
   * único camino compartido de TODOS sus callers (menú contextual + tool
   * Punto). El gate `notLocked` de actionCuration protege solo la puerta del
   * menú — sin este guard, el tool Punto escribiría sobre piezas bloqueadas.
   * Mismo aviso que enterEdit.
   */
  const guardLocked = useCallback(
    (piece: PatternPiece): boolean => {
      if (!piece.locked) return false;
      dispatch(showInfoToast('Pieza bloqueada: se puede mover, pero no editar. Desbloquéala con clic derecho.'));
      return true;
    },
    [dispatch],
  );

  // ─── enterEdit ───

  const enterEdit = useCallback(
    (pieceId: string) => {
      endDragBatch();
      const piece = pieces.find(p => p.id === pieceId);
      if (!piece) return;
      if (piece.locked) {
        // Bloqueada = no editable (maria-204). Sin aviso sería otro "clicaba
        // y nada pasaba"; el toast enseña la regla y la salida.
        dispatch(showInfoToast('Pieza bloqueada: se puede mover, pero no editar. Desbloquéala con clic derecho.'));
        return;
      }
      seenOutlineRef.current = piece.outline;
      expectedOutlineRef.current = null;
      setState({
        isEditing: true,
        editingPieceId: pieceId,
        hoveredPieceId: null,
        nodes: extractNodes(piece),
        selectedNodes: new Set<number>(),
        selectedSegments: new Set<number>(),
        hoveredNode: null,
        hoveredSegment: null,
        addPointPreview: null,
        marquee: null,
      });
      dragRef.current = null;
      setGuias(null);
    },
    [pieces, endDragBatch, dispatch],
  );

  /**
   * Entra a una pieza y, solo cuando el press tiene un sujeto concreto, deja
   * armado ese mismo gesto. El hit-test usa nodos recién extraídos: antes de
   * entrar, `state.nodes` todavía pertenece a la sesión vacía de React.
   *
   * `false` deja la entrada pura en manos del router. Así el relleno de la
   * pieza conserva el contrato anterior y no nace un marquee por accidente.
   */
  const enterEditActuando = useCallback(
    (pieceId: string, e: React.MouseEvent<SVGSVGElement>): boolean => {
      if (e.button !== 0) return false;
      const piece = pieces.find(p => p.id === pieceId);
      if (!piece) return false;
      if (piezaBloqueada(piece, layerLocked)) {
        // El candado propio conserva el aviso de `enterEdit`. El de capa no
        // puede usar ese texto —se desbloquea en Capas, no con clic derecho—
        // pero tampoco puede quedarse callado: `enterEdit` ya lleva escrito
        // por qué (maria-204), "sin aviso sería otro clicaba y nada pasaba".
        if (piece.locked) enterEdit(pieceId);
        else dispatch(showInfoToast('La capa de esta pieza está bloqueada: desbloquéala en Capas para editarla.'));
        return true;
      }

      const nodes = extractNodes(piece);
      const localPt = toLocal(e, piece);
      const nodeHit = hitTestNode(localPt, nodes, hitRadius);

      if (nodeHit) {
        endDragBatch();
        const selectedNodes = new Set(anchorGroupOf(piece.outline, nodeHit.commandIndex));
        const startPositions = new Map<number, Point2D>();
        for (const commandIndex of selectedNodes) {
          const node = nodes.find(n => n.ref.commandIndex === commandIndex);
          if (node) startPositions.set(commandIndex, { ...node.position });
        }

        seenOutlineRef.current = piece.outline;
        expectedOutlineRef.current = null;
        setState({
          isEditing: true,
          editingPieceId: pieceId,
          hoveredPieceId: null,
          nodes,
          selectedNodes,
          selectedSegments: new Set<number>(),
          hoveredNode: null,
          hoveredSegment: null,
          addPointPreview: null,
          marquee: null,
        });
        dragRef.current = {
          type: 'node',
          startMouse: { x: e.clientX, y: e.clientY },
          porLinea: new Map([[CLAVE_CONTORNO, { startPath: piece.outline, startPositions }]]),
          marco: marcoDelPunto(piece, startPositions.get(nodeHit.commandIndex) ?? localPt, nodeHit.commandIndex),
        };
        return true;
      }

      const segmentHit = nearestSegment(localPt, piece.outline);
      if (segmentHit
          && segmentHit.distance < hitRadius
          && piece.outline[segmentHit.commandIndex]?.type !== 'M') {
        endDragBatch();
        const selectedSegments = new Set([segmentHit.commandIndex]);
        const startPositions = new Map<number, Point2D>();
        const toIndex = piece.outline[segmentHit.commandIndex]?.type === 'Z'
          ? 0
          : segmentHit.commandIndex;
        const toNode = nodes.find(n => n.ref.commandIndex === toIndex);
        if (toNode) startPositions.set(toIndex, { ...toNode.position });
        const fromNode = findFromNode(nodes, segmentHit.commandIndex);
        if (fromNode && !startPositions.has(fromNode.ref.commandIndex)) {
          startPositions.set(fromNode.ref.commandIndex, { ...fromNode.position });
        }

        seenOutlineRef.current = piece.outline;
        expectedOutlineRef.current = null;
        setState({
          isEditing: true,
          editingPieceId: pieceId,
          hoveredPieceId: null,
          nodes,
          selectedNodes: new Set<number>(),
          selectedSegments,
          hoveredNode: null,
          hoveredSegment: null,
          addPointPreview: null,
          marquee: null,
        });
        dragRef.current = {
          type: 'segment',
          startMouse: { x: e.clientX, y: e.clientY },
          porLinea: new Map([[CLAVE_CONTORNO, { startPath: piece.outline, startPositions }]]),
          marco: marcoDelTramo(piece, nodes, segmentHit.commandIndex, pieceLocalToPattern(segmentHit.point, piece)),
        };
        return true;
      }

      return false;
    },
    [pieces, layerLocked, toLocal, hitRadius, endDragBatch, enterEdit, dispatch],
  );

  // ─── exitEdit ───

  const exitEdit = useCallback(() => {
    endDragBatch();
    setState({ ...INITIAL_STATE });
    dragRef.current = null;
    setGuias(null);
    expectedOutlineRef.current = null;
    seenOutlineRef.current = null;
  }, [endDragBatch]);

  // Resync when the edited piece's outline changes OUTSIDE this hook
  // (undo/redo via restoreState, copilot edits). Without this the dots detach
  // from the reverted path and points appear to vanish. The hook's own
  // dispatches are skipped by outline identity — they already refreshed
  // nodes, and clearing selection/drag on them would kill an active drag.
  useEffect(() => {
    if (!state.isEditing || !state.editingPieceId) return;
    const piece = pieces.find(p => p.id === state.editingPieceId);
    if (!piece) {
      exitEdit();
      return;
    }
    if (seenOutlineRef.current === piece.outline) return;
    seenOutlineRef.current = piece.outline;
    if (expectedOutlineRef.current === piece.outline) {
      expectedOutlineRef.current = null;
      return;
    }
    // External change: refresh nodes, drop selections (indices may denote
    // different geometry now), and cancel any in-flight drag so the next
    // mousemove can't re-impose pre-undo positions.
    endDragBatch();
    dragRef.current = null;
    setGuias(null);
    setState(s => resyncStateToPiece(s, piece));
  }, [pieces, state.isEditing, state.editingPieceId, exitEdit, endDragBatch]);

  useEffect(() => () => endDragBatch(), [endDragBatch]);

  // Pulsar o soltar Shift a mitad del arrastre, con la mano quieta, re-aplica
  // el último ratón: el punto se endereza (o se suelta) en ese instante. Los
  // handlers de ratón pasan su `e.shiftKey` por `sincronizar`, así que teclado y
  // ratón no pueden discrepar sobre si Shift está pulsado.
  //
  // El modo vive también en el estado (arriba): la pista del pie lo lee antes
  // de agarrar nada (spec 2026-09-23 § 4.2).
  const { modoRef, sincronizar } = useShiftSostenido((modo) => {
    setModoShift(modo);
    const drag = dragRef.current;
    if (!drag || drag.type === 'marquee' || !drag.lastMouse || !state.editingPieceId) return;
    const piece = getPiece(state.editingPieceId);
    if (piece) aplicarArrastre(piece, drag, drag.lastMouse, modo);
  });

  // ─── handleMouseDown ───

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<SVGSVGElement>): boolean => {
      if (!state.isEditing || !state.editingPieceId) return false;
      if (e.button !== 0) return false;
      sincronizar(e.shiftKey);
      setModoShift(modoRef.current);

      const piece = getPiece(state.editingPieceId);
      if (!piece) return false;

      const localPt = toLocal(e, piece);
      const hr = hitRadius;

      // 1. Check anchor hit
      const nodeHit = hitTestNode(localPt, state.nodes, hr);
      if (nodeHit) {
        const idx = nodeHit.commandIndex;
        const shift = e.shiftKey;
        // A coincident group is one point: selecting a member selects them all,
        // so Delete removes the corner instead of leaving its twin behind.
        const group = anchorGroupOf(piece.outline, idx);
        // Shift+press sobre un punto YA seleccionado: quitarlo se decide al
        // soltar, y solo si no hubo arrastre. Pulsar Shift y después agarrar es
        // como se endereza un arrastre (firma del 23-09); quitarlo en el press
        // dejaba el arrastre sin sujeto y el punto no se movía.
        const quitarAlSoltar = shift && state.selectedNodes.has(idx);

        setState(s => {
          const newSelected = new Set(shift ? s.selectedNodes : []);
          for (const ci of group) newSelected.add(ci);
          return {
            ...s,
            selectedNodes: newSelected,
            selectedSegments: new Set<number>(),
          };
        });

        // Build startPositions for all selected nodes (including the new group)
        const selectedAfterClick = new Set(shift ? state.selectedNodes : []);
        for (const ci of group) selectedAfterClick.add(ci);

        const startPositions = new Map<number, Point2D>();
        for (const ci of selectedAfterClick) {
          const node = state.nodes.find(n => n.ref.commandIndex === ci);
          if (node) {
            startPositions.set(ci, { ...node.position });
          }
        }

        dragRef.current = {
          type: 'node',
          startMouse: { x: e.clientX, y: e.clientY },
          porLinea: new Map([[CLAVE_CONTORNO, { startPath: piece.outline, startPositions }]]),
          marco: marcoDelPunto(piece, startPositions.get(idx) ?? localPt, idx),
          ...(quitarAlSoltar ? { quitarAlSoltar: { clave: CLAVE_CONTORNO, indices: group } } : {}),
        };

        return true;
      }

      // 2. Check segment hit
      const segHit = nearestSegment(localPt, piece.outline);
      if (segHit && segHit.distance < hr) {
        const idx = segHit.commandIndex;
        const shift = e.shiftKey;
        // El mismo aplazamiento que el de los puntos.
        const quitarAlSoltar = shift && state.selectedSegments.has(idx);

        setState(s => {
          const newSelected = new Set(shift ? s.selectedSegments : []);
          newSelected.add(idx);
          return {
            ...s,
            selectedSegments: newSelected,
            selectedNodes: new Set<number>(),
          };
        });

        // Build startPositions for both endpoints of selected segments
        const selectedAfterClick = new Set(shift ? state.selectedSegments : []);
        selectedAfterClick.add(idx);

        const startPositions = new Map<number, Point2D>();
        for (const segIdx of selectedAfterClick) {
          // "to" node — the destination of this segment
          const toIndex = piece.outline[segIdx]?.type === 'Z' ? 0 : segIdx;
          const toNode = state.nodes.find(n => n.ref.commandIndex === toIndex);
          if (toNode) {
            startPositions.set(toIndex, { ...toNode.position });
          }
          // "from" node — the previous command's anchor
          const fromNode = findFromNode(state.nodes, segIdx);
          if (fromNode && !startPositions.has(fromNode.ref.commandIndex)) {
            startPositions.set(fromNode.ref.commandIndex, { ...fromNode.position });
          }
        }

        dragRef.current = {
          type: 'segment',
          startMouse: { x: e.clientX, y: e.clientY },
          porLinea: new Map([[CLAVE_CONTORNO, { startPath: piece.outline, startPositions }]]),
          marco: marcoDelTramo(piece, state.nodes, idx, pieceLocalToPattern(segHit.point, piece)),
          ...(quitarAlSoltar ? { quitarAlSoltar: { clave: CLAVE_CONTORNO, indices: [idx] } } : {}),
        };

        return true;
      }

      // 3. Empty area → start marquee
      const patPt = toPattern(e);
      setState(s => ({
        ...s,
        selectedNodes: e.shiftKey ? s.selectedNodes : new Set<number>(),
        selectedSegments: new Set<number>(),
        marquee: { start: patPt, current: patPt },
      }));

      dragRef.current = {
        type: 'marquee',
        startMouse: { x: e.clientX, y: e.clientY },
        startPositions: new Map(),
      };

      return true;
    },
    [state, getPiece, toLocal, toPattern, hitRadius, modoRef, sincronizar],
  );

  // ─── El arrastre de nodos y tramos ───

  /**
   * Mueve lo arrastrado según el ratón. Con Shift una vez, el desplazamiento
   * se endereza respecto a la HOJA —horizontal, vertical o diagonal— desde
   * donde estaba el punto (firma de María del 23-09, opción B; «cuánto lo
   * quieres mover en esa dirección», #1112). Con Shift dos veces, respecto al
   * lado congelado en `drag.marco` (spec 2026-09-23 § 3.4).
   */
  const aplicarArrastre = useCallback(
    (piece: PatternPiece, drag: NodeDrag | SegmentDrag, mouse: Point2D, modo: ModoShift) => {
      drag.lastMouse = mouse;
      if (![...drag.porLinea.values()].some(l => l.startPositions.size > 0)) return;
      const pantalla = { x: mouse.x - drag.startMouse.x, y: mouse.y - drag.startMouse.y };
      // Shift+press sobre algo ya seleccionado es un clic —que lo quita al
      // soltar— hasta que la mano cruza el umbral de arrastre: un temblor no
      // puede mover la selección ni anular la deselección.
      if (drag.quitarAlSoltar && !drag.wrote && !isDrag(pantalla.x, pantalla.y)) return;
      const enHoja = {
        x: screenToPatternLength(pantalla.x, zoom),
        y: screenToPatternLength(pantalla.y, zoom),
      };
      // Se endereza en espacio de patrón —la hoja, o el lado, que ya va girado
      // en su referencia— ANTES de pasar el delta al marco de la pieza: en una
      // pieza girada la hoja no gira con ella. Y el delta se gira porque las
      // posiciones se guardan sin girar: así una pieza girada se arrastra hacia
      // donde va el puntero, no en diagonal (nota de María #170). Las guías
      // salen del mismo cálculo que el punto.
      let enPatron = enHoja;
      if (modo !== 'suelto') {
        const { desde, referencia } = drag.marco;
        const g = guiasShift(desde, { x: desde.x + enHoja.x, y: desde.y + enHoja.y }, referencia, modo === 'borde');
        enPatron = { x: g.punto.x - desde.x, y: g.punto.y - desde.y };
        publicarGuias(g);
      } else {
        publicarGuias(null);
      }
      const { x: dx, y: dy } = patternToPieceLocalDirection(enPatron, piece);
      // Un desplazamiento igual al último escrito no reescribe nada: con Shift,
      // mover la mano en perpendicular a la guía no cambia el punto; y antes
      // del primer frame, el delta cero tampoco.
      const ultimo = drag.lastDelta ?? { x: 0, y: 0 };
      if (dx === ultimo.x && dy === ultimo.y) return;
      const undoBatchToken = beginDragBatch();

      // Cada línea desde su path del INICIO del gesto, ancla por ancla y con
      // los grupos de anclas coincidentes de ESE path. Reagrupar frame a frame
      // sobre el path ya movido capturaba cualquier ancla por la que el
      // arrastre pasara exactamente encima, y se la llevaba.
      const cambios = new Map<ClaveLinea, PathCommand[]>();
      for (const [clave, linea] of drag.porLinea) {
        if (linea.startPositions.size === 0) continue;
        linea.groups ??= new Map([...linea.startPositions.keys()].map((cmdIdx): [number, number[]] => {
          const grupo = anchorGroupOf(linea.startPath, cmdIdx);
          return [cmdIdx, grupo.length > 0 ? grupo : [cmdIdx]];
        }));
        const moves = new Map<number, Point2D>();
        for (const [cmdIdx, startPos] of linea.startPositions) {
          const destino = { x: startPos.x + dx, y: startPos.y + dy };
          for (const miembro of linea.groups.get(cmdIdx) ?? [cmdIdx]) moves.set(miembro, destino);
        }
        let path = applyAnchorMoves(linea.startPath, moves);
        // Curva por puntos (#197): en un tramo gestionado los manejadores se
        // rehacen desde las anclas, así que la curva sigue pasando por el
        // punto y sin picos. La marca vive en el path previo al gesto.
        for (const cmdIdx of linea.startPositions.keys()) {
          path = resmoothAfterMove(linea.startPath, path, cmdIdx);
        }
        cambios.set(clave, path);
      }

      escribirLineas(piece, cambios, undoBatchToken);
      drag.lastDelta = { x: dx, y: dy };
      drag.wrote = true;
    },
    [zoom, beginDragBatch, escribirLineas, publicarGuias],
  );

  // ─── handleMouseMove ───

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>): boolean => {
      if (!state.isEditing) {
        const hr = hitRadius;
        const target = e.target as Element | null;
        const domPieceId = typeof target?.closest === 'function'
          ? target.closest('[data-piece-id]')?.getAttribute('data-piece-id')
          : null;
        // Cuando el DOM ya resolvió qué pieza está arriba, el hover no
        // puede mirar a través de su relleno y prometer un gesto sobre otra.
        const candidates = domPieceId
          ? hoverablePieces.filter(piece => piece.id === domPieceId)
          : hoverablePieces;

        for (const piece of candidates) {
          const localPt = toLocal(e, piece);
          const nodeHit = hitTestNode(localPt, extractNodes(piece), hr);
          if (nodeHit) {
            setState(s => ({
              ...s,
              hoveredPieceId: piece.id,
              hoveredNode: nodeHit.commandIndex,
              hoveredSegment: null,
            }));
            return false;
          }

          const segHit = nearestSegment(localPt, piece.outline);
          if (segHit
              && segHit.distance < hr
              && piece.outline[segHit.commandIndex]?.type !== 'M') {
            setState(s => ({
              ...s,
              hoveredPieceId: piece.id,
              hoveredNode: null,
              hoveredSegment: segHit.commandIndex,
            }));
            return false;
          }
        }

        setState(s => ({
          ...s,
          hoveredPieceId: null,
          hoveredNode: null,
          hoveredSegment: null,
        }));
        return false;
      }

      if (!state.editingPieceId) return false;

      const piece = getPiece(state.editingPieceId);
      if (!piece) return false;

      const drag = dragRef.current;

      // Active drag
      if (drag) {
        if (drag.type === 'node' || drag.type === 'segment') {
          sincronizar(e.shiftKey);
          setModoShift(modoRef.current);
          aplicarArrastre(piece, drag, { x: e.clientX, y: e.clientY }, modoRef.current);
          return true;
        }

        if (drag.type === 'marquee') {
          const patPt = toPattern(e);
          setState(s => {
            if (!s.marquee) return s;
            return { ...s, marquee: { ...s.marquee, current: patPt } };
          });
          return true;
        }
      }

      // Hover detection
      const localPt = toLocal(e, piece);
      const hr = hitRadius;

      // Check node hover
      const nodeHit = hitTestNode(localPt, state.nodes, hr);
      if (nodeHit) {
        setState(s => ({
          ...s,
          hoveredNode: nodeHit.commandIndex,
          hoveredSegment: null,
          addPointPreview: null,
        }));
        return false;
      }

      // Check segment hover
      const segHit = nearestSegment(localPt, piece.outline);
      if (segHit && segHit.distance < hr) {
        // addPointPreview is in piece-local space
        setState(s => ({
          ...s,
          hoveredNode: null,
          hoveredSegment: segHit.commandIndex,
          addPointPreview: segHit.point,
        }));
        return false;
      }

      // Nothing hovered
      setState(s => ({
        ...s,
        hoveredNode: null,
        hoveredSegment: null,
        addPointPreview: null,
      }));
      return false;
    },
    [state, hoverablePieces, getPiece, toLocal, toPattern, hitRadius, aplicarArrastre, modoRef, sincronizar],
  );

  // ─── handleMouseUp ───

  const handleMouseUp = useCallback(() => {
    const drag = dragRef.current;
    dragRef.current = null;
    setGuias(null);
    endDragBatch();

    if (!drag) return;

    if (drag.type === 'marquee') {
      // Resolve marquee selection
      setState(s => {
        if (!s.marquee || !s.editingPieceId) {
          return { ...s, marquee: null };
        }

        const piece = pieces.find(p => p.id === s.editingPieceId);
        if (!piece) return { ...s, marquee: null };

        const { start, current } = s.marquee;
        // Marquee is a screen-aligned box in pattern space; project each
        // (un-rotated) node to its rotated pattern position before the test.
        const minX = Math.min(start.x, current.x);
        const maxX = Math.max(start.x, current.x);
        const minY = Math.min(start.y, current.y);
        const maxY = Math.max(start.y, current.y);

        const insideNodes = new Set(s.selectedNodes); // keep existing if shift was held
        for (const node of s.nodes) {
          const { x, y } = pieceLocalToPattern(node.position, piece);
          if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
            insideNodes.add(node.ref.commandIndex);
          }
        }

        return { ...s, marquee: null, selectedNodes: insideNodes };
      });
      return;
    }

    // Node/segment drags already wrote during mousemove. What is left is the
    // Shift+click that never became a drag: now it does deselect. En la fase 1
    // la única línea es el contorno.
    const quitar = drag.quitarAlSoltar;
    if (!quitar || drag.wrote) return;
    if (drag.type === 'node') {
      setState(s => {
        const selectedNodes = new Set(s.selectedNodes);
        for (const ci of quitar.indices) selectedNodes.delete(ci);
        return { ...s, selectedNodes };
      });
    } else {
      setState(s => {
        const selectedSegments = new Set(s.selectedSegments);
        for (const ci of quitar.indices) selectedSegments.delete(ci);
        return { ...s, selectedSegments };
      });
    }
  }, [pieces, endDragBatch]);

  // ─── handleKeyDown ───

  /**
   * P1 (#1115): devuelve si consumió la tecla.
   *
   * Este gancho se llama desde DOS sitios, y la diferencia importa:
   *
   * - **Supr y Retroceso, desde la captura CF-1.** El atajo global
   *   `edit.delete` escucha en `document` en burbuja y corría ANTES, así que
   *   Supr sobre un nodo borraba la pieza entera y este manejador llegaba a
   *   una pieza que ya no existía.
   * - **Escape, desde la burbuja, como siempre.** Consumirlo en captura
   *   parecía más limpio y resultó ser una regresión: `stopPropagation` en
   *   captura sobre `window` mata TODA la propagación posterior, y con eso el
   *   menú contextual (`ContextMenu.tsx`, que escucha en `document` en
   *   burbuja) se quedaba abierto. Es el menú que lleva las firmas de María
   *   del #1166. La ventana de `isEditing` es un MODO largo, no un gesto: una
   *   puerta estrecha en teclas no basta si la condición es ancha.
   *
   * `false` deja la tecla seguir su camino a propósito: sin sujeto local,
   * Supr tiene que poder borrar la pieza como en cualquier otro sitio.
   */
  const handleKeyDown = useCallback(
    (e: KeyboardEvent): boolean => {
      if (!state.isEditing || !state.editingPieceId) return false;

      if (e.key === 'Escape') {
        // Peldaño 3 de la escalera (E-4): la sub-selección se suelta ANTES de
        // salir. Un Escape = un peldaño. Salir de golpe con un nodo agarrado
        // le quita el modo entero a María cuando solo quería soltar el punto.
        //
        // Pero el peldaño 2 —GESTO VIVO— manda sobre el 3. Con un arrastre
        // abierto, Escape lo cancela y cierra su lote de deshacer; quedarse en
        // el peldaño 3 dejaba el lote abierto y la siguiente acción entraba
        // dentro de él (lo cazó `useEditPattern.undo.test.tsx`, no yo).
        if (!dragRef.current
            && (state.selectedNodes.size > 0 || state.selectedSegments.size > 0)) {
          setState(s => ({ ...s, selectedNodes: new Set(), selectedSegments: new Set() }));
          e.preventDefault();
          e.stopPropagation();
          return true;
        }
        exitEdit();
        return true;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (state.selectedNodes.size === 0) {
          // Un TRAMO elegido también es sujeto local: se pinta
          // (`EditPatternOverlay`) y el Escape de arriba ya lo trata como tal.
          // No existe «borrar tramo», así que aquí no se borra nada — pero se
          // consume igual, porque soltar la tecla se la entrega al global y
          // entonces desaparece la pieza con el tramo resaltado en pantalla.
          // Mismo argumento que el aviso de los tres puntos, más abajo.
          return state.selectedSegments.size > 0;
        }

        const piece = getPiece(state.editingPieceId);
        if (!piece) return false;

        // Sort indices descending to preserve earlier indices when deleting
        const indices = [...state.selectedNodes].sort((a, b) => b - a);

        // All-or-nothing: deleting part of a coincident group would leave a
        // stranded twin, and a partial multi-delete is worse than none.
        const remainingAnchorCount = coincidentAnchorGroups(
          piece.outline.filter((_, index) => !state.selectedNodes.has(index)),
        ).size;
        if (remainingAnchorCount < 3) {
          dispatch(showInfoToast('No se puede borrar: la pieza necesita al menos 3 puntos'));
          // CONSUME igual (#1115). El comentario viejo decia que soltar la
          // tecla aqui «era seguro porque el atajo global no mira
          // defaultPrevented» — y esa era justo la trampa: al soltarla, el
          // global se llevaba LA PIEZA ENTERA. O sea, «no puedo borrar el
          // nodo porque hacen falta tres puntos» terminaba borrandolo todo.
          return true;
        }

        let outline = piece.outline;
        for (const idx of indices) {
          outline = deletePoint(outline, idx);
        }

        const updated = conPaths(piece, new Map([[CLAVE_CONTORNO, outline]]));
        expectedOutlineRef.current = outline;
        dispatch(updatePiece(updated));
        // Este camino no pasa por `escribirLineas`. Ya limpiaba la
        // selección, pero dejaba vivos el hover y la previsualización con
        // índices de un contorno que acaba de encoger (#1122).
        setState(s => resyncStateToPiece(s, updated));

        e.preventDefault();
        return true;
      }

      return false;
    },
    [state, exitEdit, getPiece, dispatch],
  );

  // ─── handleDoubleClick ───

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>): boolean => {
      if (!state.isEditing || !state.editingPieceId) return false;

      const piece = getPiece(state.editingPieceId);
      if (!piece) return false;

      const localPt = toLocal(e, piece);

      const target = findInsertTarget(localPt, state.nodes, piece.outline, hitRadius);
      if (target) {
        const newOutline = splitSegmentAt(piece.outline, target.commandIndex, target.t);
        escribirContorno(piece, newOutline);
        return true;
      }

      return false;
    },
    [state, getPiece, toLocal, hitRadius, escribirContorno],
  );

  // ─── convertSegment ───

  const convertSegment = useCallback(
    // `pieceId` explícito para el clic derecho FUERA de "Editar patrón" (#197):
    // ahí no hay pieza en edición y el hit-test es quien sabe cuál se tocó.
    (commandIndex: number, toCurve: boolean, pieceId?: string) => {
      const piece = getPiece(pieceId ?? state.editingPieceId);
      if (!piece || guardLocked(piece)) return;

      const newOutline = toCurve
        ? convertToCurve(piece.outline, commandIndex)
        : convertToLine(piece.outline, commandIndex);

      escribirContorno(piece, newOutline);
    },
    [state.editingPieceId, getPiece, escribirContorno, guardLocked],
  );

  // ─── moveNodeTo (#1112: escribir la distancia a un vecino) ───

  /**
   * Mueve un nodo a un punto exacto, en coordenadas LOCALES de la pieza.
   *
   * Es la puerta de los chips del nodo. Existe para que el chip NO reconstruya
   * el contorno por su cuenta: aquí está la compensación de pivote, el
   * re-anclado de piquetes y el refresco del overlay, y tener eso duplicado en
   * la capa de cotas es exactamente el fallo que este repo tiene escrito con
   * nombre propio («dos listas se desincronizan»).
   *
   * `applyNodeMove` mueve el GRUPO de anclas coincidentes, no un comando: en el
   * DXF de María cada esquina son dos o tres comandos en la misma coordenada, y
   * mover uno solo rompería el contorno en una púa.
   */
  const moveNodeTo = useCallback(
    (pieceId: string, commandIndex: number, destino: Point2D) => {
      const piece = getPiece(pieceId);
      if (!piece || guardLocked(piece)) return;
      escribirContorno(piece, applyNodeMove(piece.outline, commandIndex, 'anchor', destino));
    },
    [getPiece, escribirContorno, guardLocked],
  );

  // ─── convertSegmentToPoints ───

  /** Curva por puntos: la que pidió María, con los puntos SOBRE la línea (#197). */
  const convertSegmentToPoints = useCallback(
    (commandIndex: number, pieceId?: string) => {
      const piece = getPiece(pieceId ?? state.editingPieceId);
      if (!piece || guardLocked(piece)) return;
      escribirContorno(piece, convertSegmentToSpline(piece.outline, commandIndex));
    },
    [state.editingPieceId, getPiece, escribirContorno, guardLocked],
  );

  // ─── addPointOnSegment ───
  const convertSegmentToBezier = useCallback(
    (commandIndex: number, pieceId?: string) => {
      const piece = getPiece(pieceId ?? state.editingPieceId);
      if (!piece || guardLocked(piece)) return;
      const outline = toManualBezier(piece.outline, commandIndex);
      if (outline) escribirContorno(piece, outline);
    },
    [state.editingPieceId, getPiece, escribirContorno, guardLocked],
  );

  /**
   * Punto sobre un lado, por la misma puerta que el doble clic (maria-203 /
   * tool Punto): pasa por escribirLineas, que compensa el pivote y
   * re-ancla piquetes — un splitSegmentAt + updatePiece crudo los dejaría
   * varados. `pieceId` explícito para callers fuera del modo edición.
   */
  const addPointOnSegment = useCallback(
    (commandIndex: number, t: number, pieceId?: string) => {
      const piece = getPiece(pieceId ?? state.editingPieceId);
      if (!piece || guardLocked(piece)) return;
      escribirContorno(piece, splitSegmentAt(piece.outline, commandIndex, t));
    },
    [state.editingPieceId, getPiece, escribirContorno, guardLocked],
  );

  // ─── getCursor ───

  const limpiarHover = useCallback(() => {
    setState(current => current.isEditing
      ? current
      : {
          ...current,
          hoveredPieceId: null,
          hoveredNode: null,
          hoveredSegment: null,
          addPointPreview: null,
        });
  }, []);

  const getCursor = useCallback((): string => {
    if (!state.isEditing) {
      // Hover-sin-clic (2026-09-10): el sujeto ya no espera la sesión
      // entrada. El cursor distingue el nodo que se moverá del tramo que se
      // seleccionará, para anunciar exactamente lo que hará el primer press.
      if (state.hoveredNode !== null) return 'move';
      return state.hoveredSegment !== null ? 'pointer' : 'default';
    }
    if (dragRef.current) {
      if (dragRef.current.type === 'marquee') return 'crosshair';
      return 'move';
    }
    if (state.hoveredNode !== null) return 'move';
    if (state.addPointPreview !== null) return 'cell';
    if (state.hoveredSegment !== null) return 'pointer';
    return 'default';
  }, [state.isEditing, state.hoveredNode, state.hoveredSegment, state.addPointPreview]);


  return {
    ...state,
    enterEdit,
    enterEditActuando,
    exitEdit,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleKeyDown,
    handleDoubleClick,
    convertSegment,
    convertSegmentToPoints,
    convertSegmentToBezier,
    addPointOnSegment,
    moveNodeTo,
    limpiarHover,
    getCursor,
    /** Las dos guías de Shift del arrastre en curso; `null` sin Shift o sin arrastre. */
    guias,
    /** Shift ahora mismo, para la pista del pie. */
    modoShift,
  };
}

// ─── Internal helpers ───

/**
 * Find the "from" node of a segment. The segment ends at `commandIndex`;
 * the "from" node is the previous node whose commandIndex < commandIndex.
 */
function findFromNode(nodes: EditableNode[], commandIndex: number): EditableNode | null {
  let best: EditableNode | null = null;
  let bestIdx = -1;
  for (const node of nodes) {
    const ci = node.ref.commandIndex;
    if (ci < commandIndex && ci > bestIdx) {
      bestIdx = ci;
      best = node;
    }
  }
  return best;
}

/** El marco de un punto agarrado: el lado que le llega, desde su posición inicial. */
function marcoDelPunto(piece: PatternPiece, position: Point2D, commandIndex: number): OutlineDrag['marco'] {
  return { desde: pieceLocalToPattern(position, piece), referencia: arrivingReference(piece, commandIndex) };
}

/** El marco de un lado agarrado: su propia recta, desde el punto del lado bajo el press (no el pulso, que cae hasta 8 px fuera). */
function marcoDelTramo(
  piece: PatternPiece, nodes: EditableNode[], commandIndex: number, pulsado: Point2D,
): OutlineDrag['marco'] {
  const toIndex = piece.outline[commandIndex]?.type === 'Z' ? 0 : commandIndex;
  const to = nodes.find(n => n.ref.commandIndex === toIndex)?.position;
  const from = findFromNode(nodes, commandIndex)?.position;
  return { desde: pulsado, referencia: to && from ? chordReference(piece, from, to) : ABSOLUTE_REFERENCE };
}

function mismaGuia(a: GuiaShift | null, b: GuiaShift | null): boolean {
  return a === b
    || (!!a && !!b && a.angleDeg === b.angleDeg && a.desde.x === b.desde.x && a.desde.y === b.desde.y);
}

/** Lo que se pinta no cambió: el estado no se reescribe y no re-renderiza. */
function mismasGuias(a: GuiasShift | null, b: GuiasShift | null): boolean {
  return a === b || (!!a && !!b && mismaGuia(a.activa, b.activa) && mismaGuia(a.tenue, b.tenue));
}
