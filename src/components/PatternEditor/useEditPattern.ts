/**
 * useEditPattern.ts — Edit Pattern (Q) hook.
 *
 * Manages point/segment selection (including multi-select and marquee),
 * dragging points and segments, and delegates mutations (add, delete, convert)
 * to nodeEditorUtils.
 *
 * Does NOT show bezier handles — that is for useEditCurve.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
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
  splitSegmentAt,
  deletePoint,
  convertToCurve,
  convertToLine,
  anchorGroupOf,
  type EditableNode,
} from './nodeEditorUtils';
import { screenToPattern, screenToPatternLength } from '../../utils/geometry';
import { rotatePoint } from '../../utils/geometry/transform';
import { reanchorNotches } from '../../utils/notchReanchor';
import { convertSegmentToSpline, resmoothAfterMove } from './splineSegment';
import { showInfoToast } from '../../store/copilotUISlice';
import {
  compensatePositionForPivotChange,
  patternToPieceLocal,
  pieceLocalToPattern,
} from './pieceTransform';
export { patternToPieceLocal, pieceLocalToPattern } from './pieceTransform';

// ─── Constants ───

const HIT_RADIUS_PX = 8; // screen pixels

// ─── State ───

export interface EditPatternState {
  isEditing: boolean;
  editingPieceId: string | null;
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
  nodes: [],
  selectedNodes: new Set<number>(),
  selectedSegments: new Set<number>(),
  hoveredNode: null,
  hoveredSegment: null,
  addPointPreview: null,
  marquee: null,
};

// ─── Drag ref types ───

interface NodeDrag {
  type: 'node';
  startMouse: Point2D;
  /** Map from commandIndex → original position */
  startPositions: Map<number, Point2D>;
}

interface SegmentDrag {
  type: 'segment';
  startMouse: Point2D;
  /** Map from commandIndex → original position (both endpoints of each segment) */
  startPositions: Map<number, Point2D>;
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

  const [state, setState] = useState<EditPatternState>({ ...INITIAL_STATE });
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
   * Espejo de `state.editingPieceId` para `dispatchAndRefresh`, que necesita
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

  // ─── Helper: dispatch piece update and refresh nodes ───

  const dispatchAndRefresh = useCallback(
    (
      piece: PatternPiece,
      newOutline: PatternPiece['outline'],
      undoBatchToken?: UndoBatchToken,
    ) => {
      const updated: PatternPiece = {
        ...piece,
        position: compensatePositionForPivotChange(piece, newOutline),
        outline: newOutline,
        // Notches with a parametric anchor follow the reshaped edge (#171).
        // piece.outline is the pre-edit shape, which lets a dragged reference
        // corner be re-identified instead of stranding its notch.
        internals: reanchorNotches(piece.internals, newOutline, piece.outline),
        updatedAt: Date.now(),
      };
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
        expectedOutlineRef.current = newOutline;
        setState(s => ({ ...s, nodes: newNodes }));
      }
      return newNodes;
    },
    [dispatch],
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
        nodes: extractNodes(piece),
        selectedNodes: new Set<number>(),
        selectedSegments: new Set<number>(),
        hoveredNode: null,
        hoveredSegment: null,
        addPointPreview: null,
        marquee: null,
      });
      dragRef.current = null;
    },
    [pieces, endDragBatch, dispatch],
  );

  // ─── exitEdit ───

  const exitEdit = useCallback(() => {
    endDragBatch();
    setState({ ...INITIAL_STATE });
    dragRef.current = null;
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
    setState(s => resyncStateToPiece(s, piece));
  }, [pieces, state.isEditing, state.editingPieceId, exitEdit, endDragBatch]);

  useEffect(() => () => endDragBatch(), [endDragBatch]);

  // ─── handleMouseDown ───

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<SVGSVGElement>): boolean => {
      if (!state.isEditing || !state.editingPieceId) return false;
      if (e.button !== 0) return false;

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

        setState(s => {
          const newSelected = new Set(shift ? s.selectedNodes : []);
          if (shift && s.selectedNodes.has(idx)) {
            for (const ci of group) newSelected.delete(ci);
          } else {
            for (const ci of group) newSelected.add(ci);
          }
          return {
            ...s,
            selectedNodes: newSelected,
            selectedSegments: new Set<number>(),
          };
        });

        // Build startPositions for all selected nodes (including the new group)
        const selectedAfterClick = new Set(e.shiftKey ? state.selectedNodes : []);
        if (e.shiftKey && state.selectedNodes.has(idx)) {
          for (const ci of group) selectedAfterClick.delete(ci);
        } else {
          for (const ci of group) selectedAfterClick.add(ci);
        }

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
          startPositions,
        };

        return true;
      }

      // 2. Check segment hit
      const segHit = nearestSegment(localPt, piece.outline);
      if (segHit && segHit.distance < hr) {
        const idx = segHit.commandIndex;
        const shift = e.shiftKey;

        setState(s => {
          const newSelected = new Set(shift ? s.selectedSegments : []);
          if (shift && s.selectedSegments.has(idx)) {
            newSelected.delete(idx);
          } else {
            newSelected.add(idx);
          }
          return {
            ...s,
            selectedSegments: newSelected,
            selectedNodes: new Set<number>(),
          };
        });

        // Build startPositions for both endpoints of selected segments
        const selectedAfterClick = new Set(e.shiftKey ? state.selectedSegments : []);
        if (e.shiftKey && state.selectedSegments.has(idx)) {
          selectedAfterClick.delete(idx);
        } else {
          selectedAfterClick.add(idx);
        }

        const startPositions = new Map<number, Point2D>();
        for (const segIdx of selectedAfterClick) {
          // "to" node — the destination of this segment
          const toNode = state.nodes.find(n => n.ref.commandIndex === segIdx);
          if (toNode) {
            startPositions.set(segIdx, { ...toNode.position });
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
          startPositions,
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
    [state, getPiece, toLocal, toPattern, hitRadius],
  );

  // ─── handleMouseMove ───

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>): boolean => {
      if (!state.isEditing || !state.editingPieceId) return false;

      const piece = getPiece(state.editingPieceId);
      if (!piece) return false;

      const drag = dragRef.current;

      // Active drag
      if (drag) {
        if (drag.type === 'node' || drag.type === 'segment') {
          const dxS = screenToPatternLength(e.clientX - drag.startMouse.x, zoom);
          const dyS = screenToPatternLength(e.clientY - drag.startMouse.y, zoom);
          // Positions are stored un-rotated; rotate the screen delta into the
          // piece's local frame so a rotated piece drags in the pointer's
          // direction, not skewed (nota de María #170).
          const rot = piece.rotation ?? 0;
          const { x: dx, y: dy } = rot
            ? rotatePoint({ x: dxS, y: dyS }, { x: 0, y: 0 }, -rot * Math.PI / 180)
            : { x: dxS, y: dyS };

          if (drag.startPositions.size === 0 || (dx === 0 && dy === 0)) return true;
          const undoBatchToken = beginDragBatch();

          let outline = piece.outline;
          for (const [cmdIdx, startPos] of drag.startPositions) {
            const newPos: Point2D = {
              x: startPos.x + dx,
              y: startPos.y + dy,
            };
            outline = applyNodeMove(outline, cmdIdx, 'anchor', newPos);
          }

          // Curva por puntos (#197): en un tramo gestionado los manejadores se
          // rehacen desde las anclas, así que la curva sigue pasando por el
          // punto y sin picos. `piece.outline` es el contorno previo al frame,
          // que es donde vive la marca — después del movimiento ya no coincide.
          for (const cmdIdx of drag.startPositions.keys()) {
            outline = resmoothAfterMove(piece.outline, outline, cmdIdx);
          }

          dispatchAndRefresh(piece, outline, undoBatchToken);
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
    [state, getPiece, toLocal, toPattern, zoom, hitRadius, dispatchAndRefresh, beginDragBatch],
  );

  // ─── handleMouseUp ───

  const handleMouseUp = useCallback(() => {
    const drag = dragRef.current;
    dragRef.current = null;
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

    // For node/segment drags, just clear — the mutations already happened during mousemove
  }, [pieces, endDragBatch]);

  // ─── handleKeyDown ───

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!state.isEditing || !state.editingPieceId) return;

      if (e.key === 'Escape') {
        exitEdit();
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (state.selectedNodes.size === 0) return;

        const piece = getPiece(state.editingPieceId);
        if (!piece) return;

        // Sort indices descending to preserve earlier indices when deleting
        const indices = [...state.selectedNodes].sort((a, b) => b - a);

        // All-or-nothing: deleting part of a coincident group would leave a
        // stranded twin, and a partial multi-delete is worse than none.
        const anchorCount = piece.outline.filter(c => c.type !== 'Z').length;
        if (anchorCount - indices.length < 3) {
          dispatch(showInfoToast('No se puede borrar: la pieza necesita al menos 3 puntos'));
          // Early return skips preventDefault, which is safe: the global
          // delete shortcut runs on a document listener (ShortcutProvider)
          // that never checks defaultPrevented, and Delete/Backspace have
          // no native browser default worth suppressing here.
          return;
        }

        let outline = piece.outline;
        for (const idx of indices) {
          outline = deletePoint(outline, idx);
        }

        const updated: PatternPiece = {
          ...piece,
          position: compensatePositionForPivotChange(piece, outline),
          outline,
          internals: reanchorNotches(piece.internals, outline, piece.outline),
          updatedAt: Date.now(),
        };
        expectedOutlineRef.current = outline;
        dispatch(updatePiece(updated));
        setState(s => ({
          ...s,
          nodes: extractNodes(updated),
          selectedNodes: new Set<number>(),
          selectedSegments: new Set<number>(),
        }));

        e.preventDefault();
      }
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
        dispatchAndRefresh(piece, newOutline);
        return true;
      }

      return false;
    },
    [state, getPiece, toLocal, hitRadius, dispatchAndRefresh],
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

      dispatchAndRefresh(piece, newOutline);
    },
    [state.editingPieceId, getPiece, dispatchAndRefresh, guardLocked],
  );

  // ─── convertSegmentToPoints ───

  /** Curva por puntos: la que pidió María, con los puntos SOBRE la línea (#197). */
  const convertSegmentToPoints = useCallback(
    (commandIndex: number, pieceId?: string) => {
      const piece = getPiece(pieceId ?? state.editingPieceId);
      if (!piece || guardLocked(piece)) return;
      dispatchAndRefresh(piece, convertSegmentToSpline(piece.outline, commandIndex));
    },
    [state.editingPieceId, getPiece, dispatchAndRefresh, guardLocked],
  );

  // ─── addPointOnSegment ───

  /**
   * Punto sobre un lado, por la misma puerta que el doble clic (maria-203 /
   * tool Punto): pasa por dispatchAndRefresh, que compensa el pivote y
   * re-ancla piquetes — un splitSegmentAt + updatePiece crudo los dejaría
   * varados. `pieceId` explícito para callers fuera del modo edición.
   */
  const addPointOnSegment = useCallback(
    (commandIndex: number, t: number, pieceId?: string) => {
      const piece = getPiece(pieceId ?? state.editingPieceId);
      if (!piece || guardLocked(piece)) return;
      dispatchAndRefresh(piece, splitSegmentAt(piece.outline, commandIndex, t));
    },
    [state.editingPieceId, getPiece, dispatchAndRefresh, guardLocked],
  );

  // ─── getCursor ───

  const getCursor = useCallback((): string => {
    if (!state.isEditing) return 'default';
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
    exitEdit,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleKeyDown,
    handleDoubleClick,
    convertSegment,
    convertSegmentToPoints,
    addPointOnSegment,
    getCursor,
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
