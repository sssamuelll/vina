import { useState, useCallback, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../store';
import { updatePiece } from '../../store/projectSlice';
import type { PatternPiece, Point2D } from '../../types/types';
import {
  extractNodes,
  applyNodeMove,
  type EditableNode,
  type NodeRef,
} from './nodeEditorUtils';
import { screenToPattern, screenToPatternLength } from '../../utils/geometry';
import { outlineBBoxCenter, rotatePoint } from '../../utils/geometry/transform';
import { patternToPieceLocal } from './useEditPattern';

function compensatePositionForPivotChange(
  piece: PatternPiece,
  nextOutline: PatternPiece['outline'],
): Point2D {
  const rotation = piece.rotation ?? 0;
  if (!rotation) return piece.position;

  const previousCenter = outlineBBoxCenter(piece.outline);
  const nextCenter = outlineBBoxCenter(nextOutline);
  const pivotDelta = {
    x: previousCenter.x - nextCenter.x,
    y: previousCenter.y - nextCenter.y,
  };
  const rotatedDelta = rotatePoint(
    pivotDelta,
    { x: 0, y: 0 },
    rotation * Math.PI / 180,
  );

  return {
    x: piece.position.x + pivotDelta.x - rotatedDelta.x,
    y: piece.position.y + pivotDelta.y - rotatedDelta.y,
  };
}

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
        dispatch(updatePiece(updatedPiece));
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
