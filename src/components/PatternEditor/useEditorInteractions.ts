import { useRef, useCallback, useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { selectPiece, clearSelection, setZoom2D, setPan2D } from '../../store/editorSlice';
import { movePiece } from '../../store/projectSlice';
import { PatternPiece, Point2D, Tool2D } from '../../types/types';
import { extractNodes, NodeRef } from './useNodeEditor';

interface ToolHooks {
  pen: { handleMouseDown: (e: React.MouseEvent<SVGSVGElement>) => void; handleMouseMove: (e: React.MouseEvent<SVGSVGElement>) => void; handleMouseUp: () => void; handleKeyDown: (e: KeyboardEvent) => void };
  rectTool: { handleMouseDown: (e: React.MouseEvent<SVGSVGElement>) => void; handleMouseMove: (e: React.MouseEvent<SVGSVGElement>) => void; handleMouseUp: () => void };
  lineTool: { handleMouseDown: (e: React.MouseEvent<SVGSVGElement>) => void; handleMouseMove: (e: React.MouseEvent<SVGSVGElement>) => void; handleKeyDown: (e: KeyboardEvent) => void };
  seamTool: { handleMouseDown: (e: React.MouseEvent<SVGSVGElement>) => void; handleMouseMove: (e: React.MouseEvent<SVGSVGElement>) => void; handleKeyDown: (e: KeyboardEvent) => void };
  notchTool: { handleMouseDown: (e: React.MouseEvent<SVGSVGElement>) => void; handleMouseMove: (e: React.MouseEvent<SVGSVGElement>) => void };
  grainlineTool: { handleMouseDown: (e: React.MouseEvent<SVGSVGElement>) => void; handleMouseMove: (e: React.MouseEvent<SVGSVGElement>) => void; handleMouseUp: () => void };
  measureTool: { handleMouseDown: (e: React.MouseEvent<SVGSVGElement>) => void; handleMouseMove: (e: React.MouseEvent<SVGSVGElement>) => void; handleKeyDown: (e: KeyboardEvent) => void; clear: () => void };
  nodeEditor: {
    isEditing: boolean;
    hoveredNode: unknown;
    enterNodeEdit: (pieceId: string, selectedNode?: NodeRef) => void;
    handleMouseDown: (e: React.MouseEvent<SVGSVGElement>) => boolean;
    handleMouseMove: (e: React.MouseEvent<SVGSVGElement>) => boolean;
    handleMouseUp: () => void;
    handleKeyDown: (e: KeyboardEvent) => void;
  };
}

export function useEditorInteractions(
  activeTool: Tool2D,
  zoom2D: number,
  pan2D: Point2D,
  pieces: PatternPiece[],
  tools: ToolHooks,
) {
  const dispatch = useDispatch();
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ pieceId: string; startMouse: Point2D; startPos: Point2D } | null>(null);
  const panRef = useRef<{ startMouse: Point2D; startPan: Point2D } | null>(null);

  const { pen, rectTool, lineTool, seamTool, notchTool, grainlineTool, measureTool, nodeEditor } = tools;

  /** Check if a click is near an anchor point of a piece */
  const findClickedAnchorPoint = useCallback((
    e: React.MouseEvent<SVGSVGElement>,
    piece: PatternPiece
  ): NodeRef | null => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const clickX = (e.clientX - rect.left - pan2D.x) / zoom2D;
    const clickY = (e.clientY - rect.top - pan2D.y) / zoom2D;
    
    // Convert to piece-local coordinates
    const localX = clickX - piece.position.x;
    const localY = clickY - piece.position.y;
    
    const nodes = extractNodes(piece);
    const CLICK_THRESHOLD = 8 / zoom2D; // 8 screen pixels
    
    for (const node of nodes) {
      const dx = localX - node.position.x;
      const dy = localY - node.position.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= CLICK_THRESHOLD) {
        return node.ref;
      }
    }
    return null;
  }, [pan2D, zoom2D]);

  // Clear measurements when switching away
  useEffect(() => {
    if (activeTool !== 'measure') measureTool.clear();
  }, [activeTool]);

  // Keyboard events
  useEffect(() => {
    const handlers: ((e: KeyboardEvent) => void)[] = [];
    if (activeTool === 'pen') handlers.push(pen.handleKeyDown);
    if (activeTool === 'line') handlers.push(lineTool.handleKeyDown);
    if (activeTool === 'seam') handlers.push(seamTool.handleKeyDown);
    if (activeTool === 'measure') handlers.push(measureTool.handleKeyDown);
    if (nodeEditor.isEditing) handlers.push(nodeEditor.handleKeyDown);
    if (handlers.length === 0) return;
    const handler = (e: KeyboardEvent) => handlers.forEach(h => h(e));
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeTool, pen.handleKeyDown, seamTool.handleKeyDown, measureTool.handleKeyDown, nodeEditor.isEditing, nodeEditor.handleKeyDown]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.1, Math.min(10, zoom2D * delta));
    const svg = svgRef.current;
    if (svg) {
      const rect = svg.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const scale = newZoom / zoom2D;
      dispatch(setPan2D({
        x: cx - scale * (cx - pan2D.x),
        y: cy - scale * (cy - pan2D.y),
      }));
    }
    dispatch(setZoom2D(newZoom));
  }, [zoom2D, pan2D, dispatch]);

  const handleDoubleClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (activeTool !== 'select') return;
    const target = e.target as SVGElement;
    const pieceId = target.closest('[data-piece-id]')?.getAttribute('data-piece-id');
    if (pieceId) {
      nodeEditor.enterNodeEdit(pieceId);
    }
  }, [activeTool, nodeEditor]);

  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button === 1) {
      panRef.current = { startMouse: { x: e.clientX, y: e.clientY }, startPan: { ...pan2D } };
      return;
    }
    if (nodeEditor.isEditing && activeTool === 'select') {
      const handled = nodeEditor.handleMouseDown(e);
      if (handled) return;
    }
    if (activeTool === 'pen') { pen.handleMouseDown(e); return; }
    if (activeTool === 'rectangle') { rectTool.handleMouseDown(e); return; }
    if (activeTool === 'line') { lineTool.handleMouseDown(e); return; }
    if (activeTool === 'seam') { seamTool.handleMouseDown(e); return; }
    if (activeTool === 'notch') { notchTool.handleMouseDown(e); return; }
    if (activeTool === 'grainline') { grainlineTool.handleMouseDown(e); return; }
    if (activeTool === 'measure') { measureTool.handleMouseDown(e); return; }
    if (activeTool === 'hand') {
      panRef.current = { startMouse: { x: e.clientX, y: e.clientY }, startPan: { ...pan2D } };
      return;
    }
    if (activeTool === 'select') {
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
              nodeEditor.enterNodeEdit(pieceId, clickedNode);
              return;
            }
          }
          
          // Regular piece selection
          dispatch(selectPiece(pieceId));
          dragRef.current = { pieceId, startMouse: { x: e.clientX, y: e.clientY }, startPos: { ...piece.position } };
        }
      } else {
        dispatch(clearSelection());
      }
    }
  }, [activeTool, pan2D, pen, dispatch, pieces, nodeEditor]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (panRef.current) {
      const dx = e.clientX - panRef.current.startMouse.x;
      const dy = e.clientY - panRef.current.startMouse.y;
      dispatch(setPan2D({ x: panRef.current.startPan.x + dx, y: panRef.current.startPan.y + dy }));
      return;
    }
    if (dragRef.current && activeTool === 'select') {
      const dx = (e.clientX - dragRef.current.startMouse.x) / zoom2D;
      const dy = (e.clientY - dragRef.current.startMouse.y) / zoom2D;
      dispatch(movePiece({ id: dragRef.current.pieceId, x: dragRef.current.startPos.x + dx, y: dragRef.current.startPos.y + dy }));
      return;
    }
    if (nodeEditor.isEditing && activeTool === 'select') {
      const handled = nodeEditor.handleMouseMove(e);
      if (handled) return;
    }
    if (activeTool === 'pen') pen.handleMouseMove(e);
    if (activeTool === 'rectangle') rectTool.handleMouseMove(e);
    if (activeTool === 'line') lineTool.handleMouseMove(e);
    if (activeTool === 'seam') seamTool.handleMouseMove(e);
    if (activeTool === 'notch') notchTool.handleMouseMove(e);
    if (activeTool === 'grainline') grainlineTool.handleMouseMove(e);
    if (activeTool === 'measure') measureTool.handleMouseMove(e);
  }, [activeTool, zoom2D, pen, seamTool, notchTool, grainlineTool, measureTool, dispatch]);

  const handleMouseUp = useCallback(() => {
    panRef.current = null;
    dragRef.current = null;
    if (activeTool === 'pen') pen.handleMouseUp();
    if (activeTool === 'rectangle') rectTool.handleMouseUp();
    if (activeTool === 'grainline') grainlineTool.handleMouseUp();
    if (nodeEditor.isEditing) nodeEditor.handleMouseUp();
  }, [activeTool, pen, grainlineTool, nodeEditor]);

  const getCursor = () => {
    if (nodeEditor.isEditing) return nodeEditor.hoveredNode ? 'move' : 'default';
    switch (activeTool) {
      case 'pen': return 'crosshair';
      case 'hand': return panRef.current ? 'grabbing' : 'grab';
      case 'select': return dragRef.current ? 'grabbing' : 'default';
      case 'seam': return 'crosshair';
      case 'notch': return 'crosshair';
      case 'grainline': return 'crosshair';
      case 'measure': return 'crosshair';
      default: return 'crosshair';
    }
  };

  return { svgRef, handleWheel, handleDoubleClick, handleMouseDown, handleMouseMove, handleMouseUp, getCursor };
}
