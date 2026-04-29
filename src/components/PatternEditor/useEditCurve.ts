import { useState, useCallback, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../store';
import { updatePiece } from '../../store/projectSlice';
import type { Point2D } from '../../types/types';
import {
  extractNodes,
  applyNodeMove,
  type EditableNode,
  type NodeRef,
} from './nodeEditorUtils';
import { screenToPattern, screenToPatternLength } from '../../utils/geometry';

export interface EditCurveState {
  isEditing: boolean;
  editingPieceId: string | null;
  selectedNode: NodeRef | null;
  hoveredNode: NodeRef | null;
  nodes: EditableNode[];
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

  const toPattern = useCallback(
    (screenX: number, screenY: number, svgRect: DOMRect): Point2D =>
      screenToPattern(screenX, screenY, svgRect, zoom, pan),
    [zoom, pan],
  );

  const enterEdit = useCallback((pieceId: string, selectedNode?: NodeRef) => {
    const piece = pieces.find(p => p.id === pieceId);
    if (!piece) return;
    setState({
      isEditing: true,
      editingPieceId: pieceId,
      selectedNode: selectedNode || null,
      hoveredNode: null,
      nodes: extractNodes(piece),
    });
  }, [pieces]);

  const exitEdit = useCallback(() => {
    setState({
      isEditing: false,
      editingPieceId: null,
      selectedNode: null,
      hoveredNode: null,
      nodes: [],
    });
    dragRef.current = null;
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!state.isEditing || !state.editingPieceId) return false;
    if (e.button !== 0) return false;

    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const pt = toPattern(e.clientX, e.clientY, rect);
    const piece = pieces.find(p => p.id === state.editingPieceId);
    if (!piece) return false;

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
      const dx = screenToPatternLength(e.clientX - dragRef.current.startMouse.x, zoom);
      const dy = screenToPatternLength(e.clientY - dragRef.current.startMouse.y, zoom);
      const newPos: Point2D = {
        x: dragRef.current.startPos.x + dx,
        y: dragRef.current.startPos.y + dy,
      };

      const piece = pieces.find(p => p.id === state.editingPieceId);
      if (piece) {
        const newOutline = applyNodeMove(
          piece.outline,
          dragRef.current.nodeRef.commandIndex,
          dragRef.current.nodeRef.pointType,
          newPos,
        );
        dispatch(updatePiece({ ...piece, outline: newOutline, updatedAt: Date.now() }));
        const updatedPiece = { ...piece, outline: newOutline };
        setState(s => ({ ...s, nodes: extractNodes(updatedPiece) }));
      }
      return true;
    }

    // Hover detection
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const pt = toPattern(e.clientX, e.clientY, rect);
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
  }, [state, pieces, zoom, toPattern, dispatch]);

  const handleMouseUp = useCallback(() => {
    dragRef.current = null;
  }, []);

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
