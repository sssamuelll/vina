/**
 * useEditPattern.ts — Edit Pattern (Z) hook.
 *
 * Manages point/segment selection (including multi-select and marquee),
 * dragging points and segments, and delegates mutations (add, delete, convert)
 * to nodeEditorUtils.
 *
 * Does NOT show bezier handles — that is for useEditCurve.
 */

import { useState, useCallback, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../store';
import { updatePiece } from '../../store/projectSlice';
import type { Point2D, PatternPiece } from '../../types/types';
import {
  extractNodes,
  hitTestNode,
  nearestSegment,
  applyNodeMove,
  splitSegmentAt,
  deletePoint,
  convertToCurve,
  convertToLine,
  type EditableNode,
} from './nodeEditorUtils';
import { screenToPattern, screenToPatternLength } from '../../utils/geometry';

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

// ─── Hook ───

export function useEditPattern(zoom: number, pan: Point2D) {
  const dispatch = useDispatch();
  const pieces = useSelector((s: RootState) => s.project.pieces);

  const [state, setState] = useState<EditPatternState>({ ...INITIAL_STATE });
  const dragRef = useRef<DragState | null>(null);

  // ─── Coordinate helpers ───

  /** Convert screen coords to pattern-space coords (accounting for pan/zoom) */
  const toPattern = useCallback(
    (e: React.MouseEvent<SVGSVGElement>): Point2D => {
      const rect = e.currentTarget.getBoundingClientRect();
      return screenToPattern(e.clientX, e.clientY, rect, zoom, pan);
    },
    [zoom, pan],
  );

  /** Convert screen coords to piece-local coords (subtract piece.position after pan/zoom) */
  const toLocal = useCallback(
    (e: React.MouseEvent<SVGSVGElement>, piece: PatternPiece): Point2D => {
      const pt = toPattern(e);
      return {
        x: pt.x - piece.position.x,
        y: pt.y - piece.position.y,
      };
    },
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
    (piece: PatternPiece, newOutline: PatternPiece['outline']) => {
      const updated: PatternPiece = {
        ...piece,
        outline: newOutline,
        updatedAt: Date.now(),
      };
      dispatch(updatePiece(updated));
      const newNodes = extractNodes(updated);
      setState(s => ({ ...s, nodes: newNodes }));
      return newNodes;
    },
    [dispatch],
  );

  // ─── enterEdit ───

  const enterEdit = useCallback(
    (pieceId: string) => {
      const piece = pieces.find(p => p.id === pieceId);
      if (!piece) return;
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
    [pieces],
  );

  // ─── exitEdit ───

  const exitEdit = useCallback(() => {
    setState({ ...INITIAL_STATE });
    dragRef.current = null;
  }, []);

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

        setState(s => {
          const newSelected = new Set(shift ? s.selectedNodes : []);
          if (shift && s.selectedNodes.has(idx)) {
            newSelected.delete(idx);
          } else {
            newSelected.add(idx);
          }
          return {
            ...s,
            selectedNodes: newSelected,
            selectedSegments: new Set<number>(),
          };
        });

        // Build startPositions for all selected nodes (including the new one)
        const selectedAfterClick = new Set(e.shiftKey ? state.selectedNodes : []);
        if (e.shiftKey && state.selectedNodes.has(idx)) {
          selectedAfterClick.delete(idx);
        } else {
          selectedAfterClick.add(idx);
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
          const dx = screenToPatternLength(e.clientX - drag.startMouse.x, zoom);
          const dy = screenToPatternLength(e.clientY - drag.startMouse.y, zoom);

          let outline = piece.outline;
          for (const [cmdIdx, startPos] of drag.startPositions) {
            const newPos: Point2D = {
              x: startPos.x + dx,
              y: startPos.y + dy,
            };
            outline = applyNodeMove(outline, cmdIdx, 'anchor', newPos);
          }

          dispatchAndRefresh(piece, outline);
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
    [state, getPiece, toLocal, toPattern, zoom, hitRadius, dispatchAndRefresh],
  );

  // ─── handleMouseUp ───

  const handleMouseUp = useCallback(() => {
    const drag = dragRef.current;
    dragRef.current = null;

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
        // Marquee is in pattern space; nodes are in piece-local space
        const minX = Math.min(start.x, current.x) - piece.position.x;
        const maxX = Math.max(start.x, current.x) - piece.position.x;
        const minY = Math.min(start.y, current.y) - piece.position.y;
        const maxY = Math.max(start.y, current.y) - piece.position.y;

        const insideNodes = new Set(s.selectedNodes); // keep existing if shift was held
        for (const node of s.nodes) {
          const { x, y } = node.position;
          if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
            insideNodes.add(node.ref.commandIndex);
          }
        }

        return { ...s, marquee: null, selectedNodes: insideNodes };
      });
      return;
    }

    // For node/segment drags, just clear — the mutations already happened during mousemove
  }, [pieces]);

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

        let outline = piece.outline;
        let deletedCount = 0;
        for (const idx of indices) {
          try {
            outline = deletePoint(outline, idx);
            deletedCount++;
          } catch {
            // Cannot delete — minimum 3 points
            break;
          }
        }

        if (deletedCount > 0) {
          const updated: PatternPiece = {
            ...piece,
            outline,
            updatedAt: Date.now(),
          };
          dispatch(updatePiece(updated));
          setState(s => ({
            ...s,
            nodes: extractNodes(updated),
            selectedNodes: new Set<number>(),
            selectedSegments: new Set<number>(),
          }));
        }

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
      const hr = hitRadius;

      const segHit = nearestSegment(localPt, piece.outline);
      if (segHit && segHit.distance < hr) {
        const newOutline = splitSegmentAt(piece.outline, segHit.commandIndex, segHit.t);
        dispatchAndRefresh(piece, newOutline);
        return true;
      }

      return false;
    },
    [state, getPiece, toLocal, hitRadius, dispatchAndRefresh],
  );

  // ─── convertSegment ───

  const convertSegment = useCallback(
    (commandIndex: number, toCurve: boolean) => {
      if (!state.editingPieceId) return;

      const piece = getPiece(state.editingPieceId);
      if (!piece) return;

      const newOutline = toCurve
        ? convertToCurve(piece.outline, commandIndex)
        : convertToLine(piece.outline, commandIndex);

      dispatchAndRefresh(piece, newOutline);
    },
    [state.editingPieceId, getPiece, dispatchAndRefresh],
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
