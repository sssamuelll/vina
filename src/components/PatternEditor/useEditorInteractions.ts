import { useRef, useCallback, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../store';
import { selectPiece, togglePieceSelection, clearSelection, selectInternalLine, setZoom2D, setPan2D } from '../../store/editorSlice';
import { movePiece, updateInternalLine, removeInternalLine } from '../../store/projectSlice';
import { PatternPiece, Point2D, Tool2D, PathCommand, InternalLine } from '../../types/types';

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

const MEASURE_TOOL_IDS = new Set(['measure', 'measureCurve', 'compareCurves']);

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

/** Get the two endpoints of an internal line path */
function getInternalLineEndpoints(line: InternalLine): [Point2D, Point2D] | null {
  if (line.path.length < 2) return null;
  const first = line.path[0];
  if (first.type !== 'M' || first.values.length < 2) return null;
  const startPt: Point2D = { x: first.values[0], y: first.values[1] };
  const last = line.path[line.path.length - 1];
  let endPt: Point2D;
  if (last.type === 'L' && last.values.length >= 2) {
    endPt = { x: last.values[0], y: last.values[1] };
  } else if (last.type === 'C' && last.values.length >= 6) {
    endPt = { x: last.values[4], y: last.values[5] };
  } else if (last.type === 'Q' && last.values.length >= 4) {
    endPt = { x: last.values[2], y: last.values[3] };
  } else {
    return null;
  }
  return [startPt, endPt];
}

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
    enterEdit: (pieceId: string, selectedNode?: NodeRef) => void;
    handleMouseDown: (e: React.MouseEvent<SVGSVGElement>) => boolean;
    handleMouseMove: (e: React.MouseEvent<SVGSVGElement>) => boolean;
    handleMouseUp: () => void;
    handleKeyDown: (e: KeyboardEvent) => void;
  };
  transformTool: {
    handleMouseDown: (e: React.MouseEvent<SVGSVGElement>) => boolean;
    handleMouseMove: (e: React.MouseEvent<SVGSVGElement>) => boolean;
    handleMouseUp: () => void;
    handleKeyDown: (e: KeyboardEvent) => void;
    getCursor: (pt: Point2D) => string | null;
  };
  editPattern: {
    isEditing: boolean;
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
  mergeTool: {
    handleMouseDown: (e: React.MouseEvent<SVGSVGElement>) => void;
    handleMouseMove: (e: React.MouseEvent<SVGSVGElement>) => void;
    handleMouseUp: () => void;
    handleKeyDown: (e: KeyboardEvent) => void;
    getCursor: () => string;
    reset: () => void;
  };
  segmentSewingTool: {
    handleMouseDown: (e: React.MouseEvent<SVGSVGElement>) => void;
    handleMouseMove: (e: React.MouseEvent<SVGSVGElement>) => void;
    handleKeyDown: (e: KeyboardEvent) => void;
    getCursor: () => string;
    reset: () => void;
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
  const dragRef = useRef<{ pieceId: string; startMouse: Point2D; startPos: Point2D; lastPos?: Point2D } | null>(null);
  const panRef = useRef<{ startMouse: Point2D; startPan: Point2D; lastPos?: Point2D } | null>(null);
  const internalLineDragRef = useRef<{
    pieceId: string; lineId: string; endpointIndex: 0 | 1;
    startMouse: Point2D; startPos: Point2D;
  } | null>(null);

  const { pen, rectTool, lineTool, seamTool, notchTool, grainlineTool, measureTool, nodeEditor, transformTool, editPattern, scissorsTool, mergeTool, segmentSewingTool, topstitchTool, walkSeamTool } = tools;

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
    if (!MEASURE_TOOL_IDS.has(activeTool)) measureTool.clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- measureTool.clear is stable (useCallback with [])
  }, [activeTool, measureTool.clear]);

  // Clear walk seam when switching away
  useEffect(() => {
    if (activeTool !== 'walkSeam') walkSeamTool.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTool, walkSeamTool.reset]);

  // Delete/Backspace handler for selected internal line
  const handleInternalLineKeyDown = useCallback((e: KeyboardEvent) => {
    if (selectedInternalLine && (e.key === 'Delete' || e.key === 'Backspace')) {
      dispatch(removeInternalLine({
        pieceId: selectedInternalLine.pieceId,
        lineId: selectedInternalLine.lineId,
      }));
      dispatch(clearSelection());
      e.preventDefault();
    }
  }, [selectedInternalLine, dispatch]);

  // Keyboard events
  useEffect(() => {
    const handlers: ((e: KeyboardEvent) => void)[] = [];
    if (activeTool === 'pen') handlers.push(pen.handleKeyDown);
    if (activeTool === 'line') handlers.push(lineTool.handleKeyDown);
    if (activeTool === 'seam') handlers.push(seamTool.handleKeyDown);
    if (MEASURE_TOOL_IDS.has(activeTool)) handlers.push(measureTool.handleKeyDown);
    if (activeTool === 'transform') handlers.push(transformTool.handleKeyDown);
    if (nodeEditor.isEditing) handlers.push(nodeEditor.handleKeyDown);
    if (activeTool === 'editPattern') handlers.push(editPattern.handleKeyDown);
    if (activeTool === 'scissors') handlers.push(scissorsTool.handleKeyDown);
    if (activeTool === 'merge') handlers.push(mergeTool.handleKeyDown);
    if (activeTool === 'segmentSewing') handlers.push(segmentSewingTool.handleKeyDown);
    if (activeTool === 'topstitchSeamline' || activeTool === 'topstitchSegment' || activeTool === 'topstitchFree') handlers.push(topstitchTool.handleKeyDown);
    if (activeTool === 'walkSeam') handlers.push(walkSeamTool.handleKeyDown);
    if (activeTool === 'select' && selectedInternalLine) handlers.push(handleInternalLineKeyDown);
    if (handlers.length === 0) return;
    const handler = (e: KeyboardEvent) => handlers.forEach(h => h(e));
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeTool, pen.handleKeyDown, lineTool.handleKeyDown, seamTool.handleKeyDown, measureTool.handleKeyDown, transformTool.handleKeyDown, nodeEditor.isEditing, nodeEditor.handleKeyDown, editPattern.handleKeyDown, scissorsTool.handleKeyDown, mergeTool.handleKeyDown, segmentSewingTool.handleKeyDown, topstitchTool.handleKeyDown, walkSeamTool.handleKeyDown, selectedInternalLine, handleInternalLineKeyDown]);

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
    if (activeTool === 'editPattern') {
      const handled = editPattern.handleDoubleClick(e);
      if (handled) return;
    }
    if (activeTool === 'select') {
      const target = e.target as SVGElement;
      const pieceId = target.closest('[data-piece-id]')?.getAttribute('data-piece-id');
      if (pieceId) {
        nodeEditor.enterEdit(pieceId);
      }
    }
  }, [activeTool, nodeEditor, editPattern]);

  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button === 1) {
      panRef.current = { startMouse: { x: e.clientX, y: e.clientY }, startPan: { ...pan2D } };
      return;
    }
    if (nodeEditor.isEditing && activeTool === 'select') {
      const handled = nodeEditor.handleMouseDown(e);
      if (handled) return;
    }
    if (editPattern.isEditing && activeTool === 'editPattern') {
      const handled = editPattern.handleMouseDown(e);
      if (handled) return;
    }
    if (activeTool === 'editPattern') {
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
    if (activeTool === 'pen') { pen.handleMouseDown(e); return; }
    if (activeTool === 'rectangle') { rectTool.handleMouseDown(e); return; }
    if (activeTool === 'line') { lineTool.handleMouseDown(e); return; }
    if (activeTool === 'seam') { seamTool.handleMouseDown(e); return; }
    if (activeTool === 'notch') { notchTool.handleMouseDown(e); return; }
    if (activeTool === 'grainline') { grainlineTool.handleMouseDown(e); return; }
    if (MEASURE_TOOL_IDS.has(activeTool)) { measureTool.handleMouseDown(e); return; }
    if (activeTool === 'scissors') { scissorsTool.handleMouseDown(e); return; }
    if (activeTool === 'merge') { mergeTool.handleMouseDown(e); return; }
    if (activeTool === 'segmentSewing') { segmentSewingTool.handleMouseDown(e); return; }
    if (activeTool === 'topstitchSeamline' || activeTool === 'topstitchSegment' || activeTool === 'topstitchFree') { topstitchTool.handleMouseDown(e); return; }
    if (activeTool === 'walkSeam') { walkSeamTool.handleMouseDown(e); return; }
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
      const svg = e.currentTarget;
      const rect = svg.getBoundingClientRect();
      const clickX = (e.clientX - rect.left - pan2D.x) / zoom2D;
      const clickY = (e.clientY - rect.top - pan2D.y) / zoom2D;

      // Check if dragging an endpoint of the currently selected internal line
      if (selectedInternalLine) {
        const ilPiece = pieces.find(p => p.id === selectedInternalLine.pieceId);
        if (ilPiece) {
          const ilLine = ilPiece.internals.find(l => l.id === selectedInternalLine.lineId);
          if (ilLine) {
            const endpoints = getInternalLineEndpoints(ilLine);
            if (endpoints) {
              const localX = clickX - ilPiece.position.x;
              const localY = clickY - ilPiece.position.y;
              const EP_THRESHOLD = 8 / zoom2D;
              for (let i = 0; i < 2; i++) {
                if (Math.hypot(localX - endpoints[i].x, localY - endpoints[i].y) <= EP_THRESHOLD) {
                  internalLineDragRef.current = {
                    pieceId: selectedInternalLine.pieceId,
                    lineId: selectedInternalLine.lineId,
                    endpointIndex: i as 0 | 1,
                    startMouse: { x: e.clientX, y: e.clientY },
                    startPos: { ...endpoints[i] },
                  };
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
          const localX = clickX - piece.position.x;
          const localY = clickY - piece.position.y;
          const LINE_THRESHOLD = 5 / zoom2D;
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
          if (!piece.locked) {
            dragRef.current = { pieceId, startMouse: { x: e.clientX, y: e.clientY }, startPos: { ...piece.position } };
          }
        }
      } else {
        dispatch(clearSelection());
      }
    }
  }, [activeTool, pan2D, zoom2D, pen, rectTool, lineTool, seamTool, notchTool, grainlineTool, measureTool, scissorsTool, mergeTool, segmentSewingTool, topstitchTool, walkSeamTool, transformTool, editPattern, dispatch, pieces, nodeEditor, findClickedAnchorPoint, selectedInternalLine]);

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
    if (editPattern.isEditing && activeTool === 'editPattern') {
      editPattern.handleMouseMove(e);
      return;
    }
    if (internalLineDragRef.current && activeTool === 'select') {
      const dx = (e.clientX - internalLineDragRef.current.startMouse.x) / zoom2D;
      const dy = (e.clientY - internalLineDragRef.current.startMouse.y) / zoom2D;
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
      const dx = (e.clientX - dragRef.current.startMouse.x) / zoom2D;
      const dy = (e.clientY - dragRef.current.startMouse.y) / zoom2D;
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
      return;
    }
    if (nodeEditor.isEditing && activeTool === 'select') {
      const handled = nodeEditor.handleMouseMove(e);
      if (handled) return;
    }
    if (activeTool === 'transform') {
      const handled = transformTool.handleMouseMove(e);
      if (handled) return;
    }
    if (activeTool === 'pen') pen.handleMouseMove(e);
    if (activeTool === 'rectangle') rectTool.handleMouseMove(e);
    if (activeTool === 'line') lineTool.handleMouseMove(e);
    if (activeTool === 'seam') seamTool.handleMouseMove(e);
    if (activeTool === 'notch') notchTool.handleMouseMove(e);
    if (activeTool === 'grainline') grainlineTool.handleMouseMove(e);
    if (MEASURE_TOOL_IDS.has(activeTool)) measureTool.handleMouseMove(e);
    if (activeTool === 'scissors') scissorsTool.handleMouseMove(e);
    if (activeTool === 'merge') mergeTool.handleMouseMove(e);
    if (activeTool === 'segmentSewing') segmentSewingTool.handleMouseMove(e);
    if (activeTool === 'topstitchSeamline' || activeTool === 'topstitchSegment' || activeTool === 'topstitchFree') topstitchTool.handleMouseMove(e);
    if (activeTool === 'walkSeam') walkSeamTool.handleMouseMove(e);
  }, [activeTool, zoom2D, pen, rectTool, lineTool, seamTool, notchTool, grainlineTool, measureTool, scissorsTool, mergeTool, segmentSewingTool, topstitchTool, walkSeamTool, transformTool, editPattern, nodeEditor, pieces, dispatch]);

  const handleMouseUp = useCallback(() => {
    // Commit pan position to Redux on mouseUp
    if (panRef.current?.lastPos) {
      dispatch(setPan2D(panRef.current.lastPos));
    }
    // Commit piece position to Redux on mouseUp
    if (dragRef.current?.lastPos) {
      dispatch(movePiece({ id: dragRef.current.pieceId, x: dragRef.current.lastPos.x, y: dragRef.current.lastPos.y }));
    }
    panRef.current = null;
    dragRef.current = null;
    internalLineDragRef.current = null;
    if (activeTool === 'pen') pen.handleMouseUp();
    if (activeTool === 'rectangle') rectTool.handleMouseUp();
    if (activeTool === 'grainline') grainlineTool.handleMouseUp();
    if (activeTool === 'transform') transformTool.handleMouseUp();
    if (nodeEditor.isEditing) nodeEditor.handleMouseUp();
    if (activeTool === 'editPattern') editPattern.handleMouseUp();
    if (activeTool === 'scissors') scissorsTool.handleMouseUp();
    if (activeTool === 'merge') mergeTool.handleMouseUp();
  }, [activeTool, pen, rectTool, grainlineTool, transformTool, nodeEditor, editPattern, scissorsTool, mergeTool, dispatch]);

  const getCursor = () => {
    if (nodeEditor.isEditing) return nodeEditor.hoveredNode ? 'move' : 'default';
    switch (activeTool) {
      case 'pen': return 'crosshair';
      case 'hand': return panRef.current ? 'grabbing' : 'grab';
      case 'select': return dragRef.current ? 'grabbing' : 'default';
      case 'transform': return 'default';
      case 'editPattern': return editPattern.isEditing ? editPattern.getCursor() : 'default';
      case 'seam': return 'crosshair';
      case 'notch': return 'crosshair';
      case 'grainline': return 'crosshair';
      case 'measure': case 'measureCurve': case 'compareCurves': return 'crosshair';
      case 'scissors': return scissorsTool.getCursor();
      case 'merge': return mergeTool.getCursor();
      case 'segmentSewing': return segmentSewingTool.getCursor();
      case 'topstitchSeamline': case 'topstitchSegment': case 'topstitchFree': return topstitchTool.getCursor();
      case 'walkSeam': return walkSeamTool.getCursor();
      case 'topstitchEdit': return 'default';
      default: return 'crosshair';
    }
  };

  return { svgRef, handleWheel, handleDoubleClick, handleMouseDown, handleMouseMove, handleMouseUp, getCursor };
}
