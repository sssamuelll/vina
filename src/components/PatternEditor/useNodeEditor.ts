import { useState, useCallback, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../store';
import { updatePiece } from '../../store/projectSlice';
import { Point2D, PathCommand, PatternPiece } from '../../types/types';

/**
 * Node editor — allows selecting and dragging individual anchor points
 * and control handles on existing pattern pieces.
 * 
 * Active when tool = 'select' and a piece is selected.
 * Double-click a piece to enter node editing mode.
 * Click outside or press Escape to exit.
 */

export interface NodeRef {
  pieceId: string;
  /** Index in the outline PathCommand[] array */
  commandIndex: number;
  /** Which point within the command: 'anchor' or 'cp1'/'cp2' for cubic bezier */
  pointType: 'anchor' | 'cp1' | 'cp2';
}

export interface EditableNode {
  ref: NodeRef;
  position: Point2D;
  /** Control point 1 (for cubic bezier — handle before anchor) */
  cp1?: Point2D;
  /** Control point 2 (for cubic bezier — handle after anchor) */
  cp2?: Point2D;
}

/** Extract editable nodes from a piece's outline */
export function extractNodes(piece: PatternPiece): EditableNode[] {
  const nodes: EditableNode[] = [];
  const cmds = piece.outline;

  for (let i = 0; i < cmds.length; i++) {
    const cmd = cmds[i];
    const v = cmd.values;

    switch (cmd.type) {
      case 'M':
        nodes.push({
          ref: { pieceId: piece.id, commandIndex: i, pointType: 'anchor' },
          position: { x: v[0], y: v[1] },
        });
        break;
      case 'L':
        nodes.push({
          ref: { pieceId: piece.id, commandIndex: i, pointType: 'anchor' },
          position: { x: v[0], y: v[1] },
        });
        break;
      case 'C': {
        // Cubic bezier: cp1(v[0],v[1]), cp2(v[2],v[3]), anchor(v[4],v[5])
        nodes.push({
          ref: { pieceId: piece.id, commandIndex: i, pointType: 'anchor' },
          position: { x: v[4], y: v[5] },
          cp1: { x: v[2], y: v[3] }, // control point before this anchor
          cp2: undefined, // cp2 is the handleOut, stored in next command
        });
        break;
      }
      case 'Q': {
        nodes.push({
          ref: { pieceId: piece.id, commandIndex: i, pointType: 'anchor' },
          position: { x: v[2], y: v[3] },
          cp1: { x: v[0], y: v[1] },
        });
        break;
      }
      // Z doesn't add a node
    }
  }

  return nodes;
}

/** Apply a node position change back to the PathCommand array */
function applyNodeMove(
  outline: PathCommand[],
  commandIndex: number,
  pointType: 'anchor' | 'cp1' | 'cp2',
  newPos: Point2D,
): PathCommand[] {
  const cmds = outline.map(c => ({ ...c, values: [...c.values] }));
  const cmd = cmds[commandIndex];

  if (!cmd) return cmds;

  switch (cmd.type) {
    case 'M':
    case 'L':
      if (pointType === 'anchor') {
        cmd.values[0] = newPos.x;
        cmd.values[1] = newPos.y;
      }
      break;
    case 'C':
      if (pointType === 'anchor') {
        // Move anchor (v[4], v[5]) and drag control points with it
        const dx = newPos.x - cmd.values[4];
        const dy = newPos.y - cmd.values[5];
        cmd.values[4] = newPos.x;
        cmd.values[5] = newPos.y;
        // Move cp2 (incoming handle) with anchor
        cmd.values[2] += dx;
        cmd.values[3] += dy;
        // Also move cp1 of NEXT command if it's a C
        const nextIdx = commandIndex + 1;
        if (nextIdx < cmds.length && cmds[nextIdx].type === 'C') {
          cmds[nextIdx].values[0] += dx;
          cmds[nextIdx].values[1] += dy;
        }
      } else if (pointType === 'cp1') {
        // cp1 = outgoing handle of PREVIOUS node = values[0,1]
        cmd.values[0] = newPos.x;
        cmd.values[1] = newPos.y;
      } else if (pointType === 'cp2') {
        // cp2 = incoming handle of THIS node = values[2,3]
        cmd.values[2] = newPos.x;
        cmd.values[3] = newPos.y;
      }
      break;
    case 'Q':
      if (pointType === 'anchor') {
        const dx = newPos.x - cmd.values[2];
        const dy = newPos.y - cmd.values[3];
        cmd.values[2] = newPos.x;
        cmd.values[3] = newPos.y;
        cmd.values[0] += dx;
        cmd.values[1] += dy;
      } else if (pointType === 'cp1') {
        cmd.values[0] = newPos.x;
        cmd.values[1] = newPos.y;
      }
      break;
  }

  return cmds;
}

export interface NodeEditorState {
  /** Whether node editing mode is active */
  isEditing: boolean;
  /** Piece being edited */
  editingPieceId: string | null;
  /** Currently selected node */
  selectedNode: NodeRef | null;
  /** Currently hovered node */
  hoveredNode: NodeRef | null;
  /** Nodes of the piece being edited */
  nodes: EditableNode[];
}

export function useNodeEditor(zoom: number, pan: Point2D) {
  const dispatch = useDispatch();
  const pieces = useSelector((s: RootState) => s.project.pieces);
  
  const [state, setState] = useState<NodeEditorState>({
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

  const toPattern = useCallback((screenX: number, screenY: number, svgRect: DOMRect): Point2D => {
    return {
      x: (screenX - svgRect.left - pan.x) / zoom,
      y: (screenY - svgRect.top - pan.y) / zoom,
    };
  }, [zoom, pan]);

  /** Enter node editing mode for a piece */
  const enterNodeEdit = useCallback((pieceId: string, selectedNode?: NodeRef) => {
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

  /** Exit node editing mode */
  const exitNodeEdit = useCallback(() => {
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

    const HIT_RADIUS = 8 / zoom;

    // Check control points first (they should be clickable above anchors)
    for (const node of state.nodes) {
      if (node.cp1) {
        const d = Math.hypot(pt.x - node.cp1.x, pt.y - node.cp1.y);
        if (d < HIT_RADIUS) {
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
      if (d < HIT_RADIUS) {
        setState(s => ({ ...s, selectedNode: node.ref }));
        dragRef.current = { nodeRef: node.ref, startMouse: { x: e.clientX, y: e.clientY }, startPos: { ...node.position } };
        return true;
      }
    }

    // Clicked empty area — exit node edit
    exitNodeEdit();
    return false;
  }, [state, pieces, zoom, toPattern, exitNodeEdit]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!state.isEditing || !state.editingPieceId) return false;

    if (dragRef.current) {
      const dx = (e.clientX - dragRef.current.startMouse.x) / zoom;
      const dy = (e.clientY - dragRef.current.startMouse.y) / zoom;
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
        dispatch(updatePiece({
          ...piece,
          outline: newOutline,
          updatedAt: Date.now(),
        }));
        // Refresh nodes
        const updatedPiece = { ...piece, outline: newOutline };
        setState(s => ({ ...s, nodes: extractNodes(updatedPiece) }));
      }
      return true;
    }

    // Hover detection
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const pt = toPattern(e.clientX, e.clientY, rect);
    const HIT_RADIUS = 8 / zoom;

    let hovered: NodeRef | null = null;
    for (const node of state.nodes) {
      if (node.cp1) {
        const d = Math.hypot(pt.x - node.cp1.x, pt.y - node.cp1.y);
        if (d < HIT_RADIUS) {
          hovered = { ...node.ref, pointType: 'cp2' };
          break;
        }
      }
      const d = Math.hypot(pt.x - node.position.x, pt.y - node.position.y);
      if (d < HIT_RADIUS) {
        hovered = node.ref;
        break;
      }
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
      exitNodeEdit();
    }
  }, [state.isEditing, exitNodeEdit]);

  return {
    ...state,
    enterNodeEdit,
    exitNodeEdit,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleKeyDown,
  };
}
