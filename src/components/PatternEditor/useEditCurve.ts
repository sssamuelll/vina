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
  applyNodeMove,
  type EditableNode,
  type NodeRef,
} from './nodeEditorUtils';
import { screenToPattern, screenToPatternLength } from '../../utils/geometry';
import { rotatePoint } from '../../utils/geometry/transform';
import {
  compensatePositionForPivotChange,
  patternToPieceLocal,
} from './pieceTransform';

export interface EditCurveState {
  isEditing: boolean;
  editingPieceId: string | null;
  selectedNode: NodeRef | null;
  hoveredNode: NodeRef | null;
  nodes: EditableNode[];
}

/**
 * Rebuild overlay nodes from the piece current outline after an EXTERNAL
 * change (undo/redo restoring project state), so the anchor dots never detach
 * from the path. Selection and hover are cleared, not remapped: command
 * indices shift when an insert is undone, so a surviving ref would silently
 * denote different geometry.
 */
function resyncCurveStateToPiece(
  state: EditCurveState,
  piece: PatternPiece,
): EditCurveState {
  return {
    ...state,
    nodes: extractNodes(piece),
    selectedNode: null,
    hoveredNode: null,
  };
}

export function useEditCurve(zoom: number, pan: Point2D) {
  const dispatch = useDispatch();
  const pieces = useSelector((s: RootState) => s.project.pieces);

  const [state, setState] = useState<EditCurveState>({
    isEditing: false,
    editingPieceId: null,
    selectedNode: null,
    hoveredNode: null,
    nodes: [],
  });

  const dragRef = useRef<{
    nodeRef: NodeRef;
    startMouse: Point2D;
    startPos: Point2D;
  } | null>(null);

  const dragBatchTokenRef = useRef<UndoBatchToken | null>(null);

  const beginDragBatch = useCallback((): UndoBatchToken => {
    const current = dragBatchTokenRef.current;
    if (current && isUndoBatchTokenActive(current)) return current;
    const token = beginUndoBatch(dispatch, 'Editar nodo');
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
   * effect treats a pieces change as internal only when the store outline
   * IS that object — a boolean flag would mis-consume an external restore
   * that lands in the same React batch as an internal edit.
   */
  const expectedOutlineRef = useRef<PathCommand[] | null>(null);
  /** Last outline (by identity) of the edited piece this hook has seen. */
  const seenOutlineRef = useRef<PathCommand[] | null>(null);

  const toPattern = useCallback(
    (screenX: number, screenY: number, svgRect: DOMRect): Point2D =>
      screenToPattern(screenX, screenY, svgRect, zoom, pan),
    [zoom, pan],
  );

  const enterEdit = useCallback((pieceId: string, selectedNode?: NodeRef) => {
    endDragBatch();
    const piece = pieces.find(p => p.id === pieceId);
    if (!piece) return;
    // Seed the seen-outline identity so the resync effect first run is a
    // no-op — otherwise it would immediately clear the node just selected.
    seenOutlineRef.current = piece.outline;
    expectedOutlineRef.current = null;
    setState({
      isEditing: true,
      editingPieceId: pieceId,
      selectedNode: selectedNode || null,
      hoveredNode: null,
      nodes: extractNodes(piece),
    });
    dragRef.current = null;
  }, [pieces, endDragBatch]);

  const exitEdit = useCallback(() => {
    endDragBatch();
    setState({
      isEditing: false,
      editingPieceId: null,
      selectedNode: null,
      hoveredNode: null,
      nodes: [],
    });
    dragRef.current = null;
    expectedOutlineRef.current = null;
    seenOutlineRef.current = null;
  }, [endDragBatch]);

  // Resync when the edited piece outline changes OUTSIDE this hook
  // (undo/redo via restoreState, copilot edits). Without this the dots detach
  // from the reverted path — nota de María #167, queja 3. The hook own
  // dispatches are skipped by outline identity.
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
    endDragBatch();
    dragRef.current = null;
    setState(s => resyncCurveStateToPiece(s, piece));
  }, [pieces, state.isEditing, state.editingPieceId, exitEdit, endDragBatch]);

  useEffect(() => () => endDragBatch(), [endDragBatch]);

  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!state.isEditing || !state.editingPieceId) return false;
    if (e.button !== 0) return false;

    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const piece = pieces.find(p => p.id === state.editingPieceId);
    if (!piece) return false;
    const pt = patternToPieceLocal(
      toPattern(e.clientX, e.clientY, rect),
      piece,
    );

    const HIT = screenToPatternLength(8, zoom);

    // Check control points first (they should be clickable above anchors)
    for (const node of state.nodes) {
      if (node.cp1) {
        const d = Math.hypot(pt.x - node.cp1.x, pt.y - node.cp1.y);
        if (d < HIT) {
          const ref: NodeRef = { ...node.ref, pointType: 'cp2' }; // cp1 in EditableNode = incoming handle = cp2 in command
          setState(s => ({ ...s, selectedNode: ref }));
          dragRef.current = { nodeRef: ref, startMouse: { x: e.clientX, y: e.clientY }, startPos: { ...node.cp1! } };
          return true;
        }
      }
    }

    // Check anchors
    for (const node of state.nodes) {
      const d = Math.hypot(pt.x - node.position.x, pt.y - node.position.y);
      if (d < HIT) {
        setState(s => ({ ...s, selectedNode: node.ref }));
        dragRef.current = { nodeRef: node.ref, startMouse: { x: e.clientX, y: e.clientY }, startPos: { ...node.position } };
        return true;
      }
    }

    // Clicked empty area — exit edit
    exitEdit();
    return false;
  }, [state, pieces, zoom, toPattern, exitEdit]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!state.isEditing || !state.editingPieceId) return false;

    if (dragRef.current) {
      const piece = pieces.find(p => p.id === state.editingPieceId);
      if (piece) {
        const dxPattern = screenToPatternLength(e.clientX - dragRef.current.startMouse.x, zoom);
        const dyPattern = screenToPatternLength(e.clientY - dragRef.current.startMouse.y, zoom);
        const rotation = piece.rotation ?? 0;
        const { x: dx, y: dy } = rotation
          ? rotatePoint(
              { x: dxPattern, y: dyPattern },
              { x: 0, y: 0 },
              -rotation * Math.PI / 180,
            )
          : { x: dxPattern, y: dyPattern };
        if (dx === 0 && dy === 0) return true;
        const undoBatchToken = beginDragBatch();
        const newPos: Point2D = {
          x: dragRef.current.startPos.x + dx,
          y: dragRef.current.startPos.y + dy,
        };
        const newOutline = applyNodeMove(
          piece.outline,
          dragRef.current.nodeRef.commandIndex,
          dragRef.current.nodeRef.pointType,
          newPos,
        );
        const updatedPiece = {
          ...piece,
          position: compensatePositionForPivotChange(piece, newOutline),
          outline: newOutline,
          updatedAt: Date.now(),
        };
        expectedOutlineRef.current = newOutline;
        dispatch(withUndoBatchToken(updatePiece(updatedPiece), undoBatchToken));
        setState(s => ({ ...s, nodes: extractNodes(updatedPiece) }));
      }
      return true;
    }

    // Hover detection
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const piece = pieces.find(p => p.id === state.editingPieceId);
    if (!piece) return false;
    const pt = patternToPieceLocal(
      toPattern(e.clientX, e.clientY, rect),
      piece,
    );
    const HIT = screenToPatternLength(8, zoom);

    let hovered: NodeRef | null = null;
    for (const node of state.nodes) {
      if (node.cp1) {
        const d = Math.hypot(pt.x - node.cp1.x, pt.y - node.cp1.y);
        if (d < HIT) { hovered = { ...node.ref, pointType: 'cp2' }; break; }
      }
      const d = Math.hypot(pt.x - node.position.x, pt.y - node.position.y);
      if (d < HIT) { hovered = node.ref; break; }
    }

    if (hovered !== state.hoveredNode) {
      setState(s => ({ ...s, hoveredNode: hovered }));
    }
    return false;
  }, [state, pieces, zoom, toPattern, dispatch, beginDragBatch]);

  const handleMouseUp = useCallback(() => {
    dragRef.current = null;
    endDragBatch();
  }, [endDragBatch]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape' && state.isEditing) {
      exitEdit();
    }
  }, [state.isEditing, exitEdit]);

  return {
    ...state,
    enterEdit,
    exitEdit,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleKeyDown,
  };
}
