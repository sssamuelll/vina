import { useRef, useEffect, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../store';
import { addPiece, movePiece, addSeam, addInternalLine, setInternalLine } from '../../store/projectSlice';
import { selectPiece, clearSelection, setZoom2D, setPan2D, selectSeam } from '../../store/editorSlice';
import { PatternPiece, PathCommand, Point2D, Seam, InternalLine } from '../../types/types';
import { usePenTool } from './usePenTool';
import { useSeamTool, getEdgeEndpoints } from './useSeamTool';
import { useNotchTool } from './useNotchTool';
import { useGrainlineTool } from './useGrainlineTool';
import { useNodeEditor, EditableNode, NodeRef } from './useNodeEditor';
import { useMeasureTool } from './useMeasureTool';
import './PatternEditor.css';

/** Convert PathCommand array to SVG path string */
function pathToSVG(commands: PathCommand[]): string {
  return commands.map(c => `${c.type}${c.values.join(',')}`).join(' ');
}

/** Handle radius in screen pixels (unscaled) */
const HANDLE_RADIUS = 4;
const ANCHOR_RADIUS = 4;

export default function PatternEditor() {
  const svgRef = useRef<SVGSVGElement>(null);
  const dispatch = useDispatch();
  const { pieces, seams } = useSelector((s: RootState) => s.project);
  const editor = useSelector((s: RootState) => s.editor);
  const { activeTool, zoom2D, pan2D, showSeamAllowance, showGrainlines, gridSize } = editor;
  const selectedPieceIds = editor.selectedPieceIds;

  // Dragging state for select tool
  const dragRef = useRef<{ pieceId: string; startMouse: Point2D; startPos: Point2D } | null>(null);

  const handlePieceComplete = useCallback((piece: Omit<PatternPiece, 'id' | 'createdAt' | 'updatedAt'>) => {
    const fullPiece: PatternPiece = {
      ...piece,
      id: `piece-${Date.now()}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    dispatch(addPiece(fullPiece));
    dispatch(selectPiece(fullPiece.id));
  }, [dispatch]);

  const pen = usePenTool(zoom2D, pan2D, handlePieceComplete);

  const handleSeamComplete = useCallback((seam: Omit<Seam, 'id'>) => {
    const fullSeam: Seam = { ...seam, id: `seam-${Date.now()}` };
    dispatch(addSeam(fullSeam));
    dispatch(selectSeam(fullSeam.id));
  }, [dispatch]);

  const seamTool = useSeamTool(zoom2D, pan2D, pieces, handleSeamComplete);

  const handleNotchAdd = useCallback((pieceId: string, notch: InternalLine) => {
    dispatch(addInternalLine({ pieceId, line: notch }));
  }, [dispatch]);

  const notchTool = useNotchTool(zoom2D, pan2D, pieces, handleNotchAdd);

  const handleGrainlineSet = useCallback((pieceId: string, grainline: InternalLine) => {
    dispatch(setInternalLine({ pieceId, line: grainline }));
  }, [dispatch]);

  const grainlineTool = useGrainlineTool(zoom2D, pan2D, pieces, handleGrainlineSet);

  // Node editor (double-click to edit nodes)
  const nodeEditor = useNodeEditor(zoom2D, pan2D);

  // Measure tool
  const measureTool = useMeasureTool(zoom2D, pan2D);

  // Clear measurements when switching away from measure tool
  useEffect(() => {
    if (activeTool !== 'measure') measureTool.clear();
  }, [activeTool]);

  // Keyboard events for pen/seam/node-editor
  useEffect(() => {
    const handlers: ((e: KeyboardEvent) => void)[] = [];
    if (activeTool === 'pen') handlers.push(pen.handleKeyDown);
    if (activeTool === 'seam') handlers.push(seamTool.handleKeyDown);
    if (activeTool === 'measure') handlers.push(measureTool.handleKeyDown);
    if (nodeEditor.isEditing) handlers.push(nodeEditor.handleKeyDown);
    if (handlers.length === 0) return;
    const handler = (e: KeyboardEvent) => handlers.forEach(h => h(e));
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeTool, pen.handleKeyDown, seamTool.handleKeyDown, measureTool.handleKeyDown, nodeEditor.isEditing, nodeEditor.handleKeyDown]);

  // Zoom with wheel
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.1, Math.min(10, zoom2D * delta));
    
    // Zoom toward cursor
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

  // Pan with middle mouse / hand tool
  const panRef = useRef<{ startMouse: Point2D; startPan: Point2D } | null>(null);

  // Double-click handler for entering node edit mode
  const handleDoubleClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (activeTool !== 'select') return;
    const target = e.target as SVGElement;
    const pieceId = target.closest('[data-piece-id]')?.getAttribute('data-piece-id');
    if (pieceId) {
      nodeEditor.enterNodeEdit(pieceId);
    }
  }, [activeTool, nodeEditor]);

  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    // Middle mouse = pan always
    if (e.button === 1) {
      panRef.current = {
        startMouse: { x: e.clientX, y: e.clientY },
        startPan: { ...pan2D },
      };
      return;
    }

    // Node editor takes priority when active
    if (nodeEditor.isEditing && activeTool === 'select') {
      const handled = nodeEditor.handleMouseDown(e);
      if (handled) return;
    }

    if (activeTool === 'pen') {
      pen.handleMouseDown(e);
      return;
    }

    if (activeTool === 'seam') {
      seamTool.handleMouseDown(e);
      return;
    }

    if (activeTool === 'notch') {
      notchTool.handleMouseDown(e);
      return;
    }

    if (activeTool === 'grainline') {
      grainlineTool.handleMouseDown(e);
      return;
    }

    if (activeTool === 'measure') {
      measureTool.handleMouseDown(e);
      return;
    }

    if (activeTool === 'hand') {
      panRef.current = {
        startMouse: { x: e.clientX, y: e.clientY },
        startPan: { ...pan2D },
      };
      return;
    }

    if (activeTool === 'select') {
      // Check if clicking on a piece (via data attribute)
      const target = e.target as SVGElement;
      const pieceId = target.closest('[data-piece-id]')?.getAttribute('data-piece-id');
      if (pieceId) {
        dispatch(selectPiece(pieceId));
        const piece = pieces.find(p => p.id === pieceId);
        if (piece) {
          dragRef.current = {
            pieceId,
            startMouse: { x: e.clientX, y: e.clientY },
            startPos: { ...piece.position },
          };
        }
      } else {
        dispatch(clearSelection());
      }
    }
  }, [activeTool, pan2D, pen, dispatch, pieces, nodeEditor]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    // Panning
    if (panRef.current) {
      const dx = e.clientX - panRef.current.startMouse.x;
      const dy = e.clientY - panRef.current.startMouse.y;
      dispatch(setPan2D({
        x: panRef.current.startPan.x + dx,
        y: panRef.current.startPan.y + dy,
      }));
      return;
    }

    // Select tool drag
    if (dragRef.current && activeTool === 'select') {
      const dx = (e.clientX - dragRef.current.startMouse.x) / zoom2D;
      const dy = (e.clientY - dragRef.current.startMouse.y) / zoom2D;
      dispatch(movePiece({
        id: dragRef.current.pieceId,
        x: dragRef.current.startPos.x + dx,
        y: dragRef.current.startPos.y + dy,
      }));
      return;
    }

    // Node editor
    if (nodeEditor.isEditing && activeTool === 'select') {
      const handled = nodeEditor.handleMouseMove(e);
      if (handled) return;
    }

    if (activeTool === 'pen') {
      pen.handleMouseMove(e);
    }

    if (activeTool === 'seam') {
      seamTool.handleMouseMove(e);
    }

    if (activeTool === 'notch') {
      notchTool.handleMouseMove(e);
    }

    if (activeTool === 'grainline') {
      grainlineTool.handleMouseMove(e);
    }

    if (activeTool === 'measure') {
      measureTool.handleMouseMove(e);
    }
  }, [activeTool, zoom2D, pen, seamTool, notchTool, grainlineTool, measureTool, dispatch]);

  const handleMouseUp = useCallback(() => {
    panRef.current = null;
    dragRef.current = null;
    if (activeTool === 'pen') {
      pen.handleMouseUp();
    }
    if (activeTool === 'grainline') {
      grainlineTool.handleMouseUp();
    }
    if (nodeEditor.isEditing) {
      nodeEditor.handleMouseUp();
    }
  }, [activeTool, pen, grainlineTool, nodeEditor]);

  // Cursor based on tool
  const getCursor = () => {
    if (nodeEditor.isEditing) {
      return nodeEditor.hoveredNode ? 'move' : 'default';
    }
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

  const gridSpacing = gridSize * zoom2D;

  return (
    <div className="pattern-editor">
      <svg
        ref={svgRef}
        className="pattern-svg"
        width="100%"
        height="100%"
        style={{ cursor: getCursor() }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onDoubleClick={handleDoubleClick}
        onWheel={handleWheel}
        onContextMenu={e => e.preventDefault()}
      >
        {/* Grid */}
        <defs>
          <pattern
            id="grid-small"
            width={gridSpacing}
            height={gridSpacing}
            patternUnits="userSpaceOnUse"
            x={pan2D.x % gridSpacing}
            y={pan2D.y % gridSpacing}
          >
            <path
              d={`M ${gridSpacing} 0 L 0 0 0 ${gridSpacing}`}
              fill="none"
              stroke="rgba(0,0,0,0.06)"
              strokeWidth="0.5"
            />
          </pattern>
          <pattern
            id="grid-large"
            width={gridSpacing * 10}
            height={gridSpacing * 10}
            patternUnits="userSpaceOnUse"
            x={pan2D.x % (gridSpacing * 10)}
            y={pan2D.y % (gridSpacing * 10)}
          >
            <path
              d={`M ${gridSpacing * 10} 0 L 0 0 0 ${gridSpacing * 10}`}
              fill="none"
              stroke="rgba(0,0,0,0.12)"
              strokeWidth="1"
            />
          </pattern>
        </defs>

        <rect width="100%" height="100%" fill="url(#grid-small)" />
        <rect width="100%" height="100%" fill="url(#grid-large)" />

        {/* Origin crosshair */}
        <line
          x1={pan2D.x} y1={pan2D.y - 20}
          x2={pan2D.x} y2={pan2D.y + 20}
          stroke="rgba(0,0,0,0.2)" strokeWidth="1"
        />
        <line
          x1={pan2D.x - 20} y1={pan2D.y}
          x2={pan2D.x + 20} y2={pan2D.y}
          stroke="rgba(0,0,0,0.2)" strokeWidth="1"
        />

        {/* Transform group (pan + zoom) */}
        <g transform={`translate(${pan2D.x}, ${pan2D.y}) scale(${zoom2D})`}>
          {/* Existing pattern pieces */}
          {pieces.map(piece => {
            const isSelected = selectedPieceIds.includes(piece.id);
            return (
              <g
                key={piece.id}
                data-piece-id={piece.id}
                transform={`translate(${piece.position.x}, ${piece.position.y}) rotate(${piece.rotation})`}
                className={`pattern-piece ${isSelected ? 'selected' : ''}`}
              >
                <path
                  d={pathToSVG(piece.outline)}
                  fill={isSelected ? 'rgba(74, 158, 255, 0.15)' : 'rgba(74, 158, 255, 0.08)'}
                  stroke={isSelected ? '#ffd700' : '#4a9eff'}
                  strokeWidth={1.5 / zoom2D}
                  strokeLinejoin="round"
                />

                {/* Seam allowance dashed */}
                {showSeamAllowance && piece.seamAllowance > 0 && (
                  <path
                    d={pathToSVG(piece.outline)}
                    fill="none"
                    stroke="rgba(74, 158, 255, 0.25)"
                    strokeWidth={0.8 / zoom2D}
                    strokeDasharray={`${4 / zoom2D} ${3 / zoom2D}`}
                  />
                )}

                {/* Internal lines */}
                {piece.internals.map(line => (
                  <path
                    key={line.id}
                    d={pathToSVG(line.path)}
                    fill="none"
                    stroke={
                      line.type === 'grainline' ? '#6bff6b' :
                      line.type === 'dart' ? '#ff9800' :
                      line.type === 'fold' ? '#9c27b0' :
                      '#888'
                    }
                    strokeWidth={0.8 / zoom2D}
                    strokeDasharray={line.type === 'fold' ? `${5 / zoom2D} ${3 / zoom2D}` : 'none'}
                    opacity={line.type === 'grainline' && !showGrainlines ? 0 : 0.7}
                  />
                ))}

                {/* Piece label */}
                <text
                  fontSize={11 / zoom2D}
                  fill="#555"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  pointerEvents="none"
                  fontFamily="Inter, sans-serif"
                >
                  {piece.name}
                </text>
              </g>
            );
          })}

          {/* ─── Seam connections ─── */}
          {seams.map(seam => {
            const pieceA = pieces.find(p => p.id === seam.pieceA.pieceId);
            const pieceB = pieces.find(p => p.id === seam.pieceB.pieceId);
            if (!pieceA || !pieceB) return null;
            const epA = getEdgeEndpoints(pieceA.outline, seam.pieceA.edgeStart);
            const epB = getEdgeEndpoints(pieceB.outline, seam.pieceB.edgeStart);
            if (!epA || !epB) return null;
            const midA = {
              x: (epA.start.x + epA.end.x) / 2 + pieceA.position.x,
              y: (epA.start.y + epA.end.y) / 2 + pieceA.position.y,
            };
            const midB = {
              x: (epB.start.x + epB.end.x) / 2 + pieceB.position.x,
              y: (epB.start.y + epB.end.y) / 2 + pieceB.position.y,
            };
            const isSelected = editor.selectedSeamId === seam.id;
            return (
              <g key={seam.id} className="seam-connection">
                {/* Edge highlight on piece A */}
                <line
                  x1={epA.start.x + pieceA.position.x} y1={epA.start.y + pieceA.position.y}
                  x2={epA.end.x + pieceA.position.x} y2={epA.end.y + pieceA.position.y}
                  stroke={isSelected ? '#ff6b6b' : '#e74c3c'}
                  strokeWidth={2.5 / zoom2D}
                  strokeLinecap="round"
                />
                {/* Edge highlight on piece B */}
                <line
                  x1={epB.start.x + pieceB.position.x} y1={epB.start.y + pieceB.position.y}
                  x2={epB.end.x + pieceB.position.x} y2={epB.end.y + pieceB.position.y}
                  stroke={isSelected ? '#ff6b6b' : '#e74c3c'}
                  strokeWidth={2.5 / zoom2D}
                  strokeLinecap="round"
                />
                {/* Dashed line connecting midpoints */}
                <line
                  x1={midA.x} y1={midA.y}
                  x2={midB.x} y2={midB.y}
                  stroke={isSelected ? '#ff6b6b' : '#e74c3c'}
                  strokeWidth={1 / zoom2D}
                  strokeDasharray={`${5 / zoom2D} ${3 / zoom2D}`}
                  opacity={0.6}
                />
                {/* Midpoint dots */}
                <circle cx={midA.x} cy={midA.y} r={3 / zoom2D} fill="#e74c3c" />
                <circle cx={midB.x} cy={midB.y} r={3 / zoom2D} fill="#e74c3c" />
              </g>
            );
          })}

          {/* ─── Seam tool: edge highlights ─── */}
          {activeTool === 'seam' && (
            <g className="seam-tool-wip">
              {/* First selected edge */}
              {seamTool.firstEdge && (() => {
                const piece = pieces.find(p => p.id === seamTool.firstEdge!.pieceId);
                if (!piece) return null;
                const ep = getEdgeEndpoints(piece.outline, seamTool.firstEdge!.edgeIndex);
                if (!ep) return null;
                return (
                  <line
                    x1={ep.start.x + piece.position.x} y1={ep.start.y + piece.position.y}
                    x2={ep.end.x + piece.position.x} y2={ep.end.y + piece.position.y}
                    stroke="#2ecc71"
                    strokeWidth={3 / zoom2D}
                    strokeLinecap="round"
                  />
                );
              })()}
              {/* Hovered edge */}
              {seamTool.hoveredEdge && (() => {
                const piece = pieces.find(p => p.id === seamTool.hoveredEdge!.pieceId);
                if (!piece) return null;
                const ep = getEdgeEndpoints(piece.outline, seamTool.hoveredEdge!.edgeIndex);
                if (!ep) return null;
                return (
                  <line
                    x1={ep.start.x + piece.position.x} y1={ep.start.y + piece.position.y}
                    x2={ep.end.x + piece.position.x} y2={ep.end.y + piece.position.y}
                    stroke={seamTool.firstEdge ? '#3498db' : '#2ecc71'}
                    strokeWidth={2.5 / zoom2D}
                    strokeLinecap="round"
                    opacity={0.7}
                  />
                );
              })()}
              {/* Guide line from first edge to hovered */}
              {seamTool.firstEdge && seamTool.hoveredEdge && seamTool.firstEdge.pieceId !== seamTool.hoveredEdge.pieceId && (
                <line
                  x1={seamTool.firstEdge.midpoint.x} y1={seamTool.firstEdge.midpoint.y}
                  x2={seamTool.hoveredEdge.midpoint.x} y2={seamTool.hoveredEdge.midpoint.y}
                  stroke="#2ecc71"
                  strokeWidth={1 / zoom2D}
                  strokeDasharray={`${4 / zoom2D} ${3 / zoom2D}`}
                  opacity={0.5}
                />
              )}
            </g>
          )}

          {/* ─── Notch tool: hover preview ─── */}
          {activeTool === 'notch' && notchTool.hoveredPoint && (
            <g className="notch-preview">
              <line
                x1={notchTool.hoveredPoint.point.x - notchTool.hoveredPoint.normal.x * 4}
                y1={notchTool.hoveredPoint.point.y - notchTool.hoveredPoint.normal.y * 4}
                x2={notchTool.hoveredPoint.point.x + notchTool.hoveredPoint.normal.x * 8}
                y2={notchTool.hoveredPoint.point.y + notchTool.hoveredPoint.normal.y * 8}
                stroke="#ff9800"
                strokeWidth={2 / zoom2D}
                strokeLinecap="round"
                opacity={0.7}
              />
              <circle
                cx={notchTool.hoveredPoint.point.x}
                cy={notchTool.hoveredPoint.point.y}
                r={3 / zoom2D}
                fill="#ff9800"
                opacity={0.5}
              />
            </g>
          )}

          {/* ─── Grainline tool: drag preview ─── */}
          {activeTool === 'grainline' && grainlineTool.isDragging && grainlineTool.startPoint && grainlineTool.endPoint && grainlineTool.pieceId && (() => {
            const piece = pieces.find(p => p.id === grainlineTool.pieceId);
            if (!piece) return null;
            const sx = grainlineTool.startPoint!.x + piece.position.x;
            const sy = grainlineTool.startPoint!.y + piece.position.y;
            const ex = grainlineTool.endPoint!.x + piece.position.x;
            const ey = grainlineTool.endPoint!.y + piece.position.y;
            // Arrow head
            const dx = ex - sx, dy = ey - sy;
            const len = Math.hypot(dx, dy);
            if (len < 2) return null;
            const ux = dx / len, uy = dy / len;
            const arrowSize = 6 / zoom2D;
            return (
              <g className="grainline-preview">
                <line x1={sx} y1={sy} x2={ex} y2={ey}
                  stroke="#6bff6b" strokeWidth={1.5 / zoom2D} opacity={0.8} />
                {/* Arrow head */}
                <polygon
                  points={`${ex},${ey} ${ex - ux * arrowSize + uy * arrowSize * 0.5},${ey - uy * arrowSize - ux * arrowSize * 0.5} ${ex - ux * arrowSize - uy * arrowSize * 0.5},${ey - uy * arrowSize + ux * arrowSize * 0.5}`}
                  fill="#6bff6b" opacity={0.8}
                />
              </g>
            );
          })()}

          {/* ─── Pen tool: work-in-progress path ─── */}
          {activeTool === 'pen' && pen.nodes.length > 0 && (
            <g className="pen-wip">
              {/* Completed segments */}
              <path
                d={pen.previewPath}
                fill="none"
                stroke="#4a9eff"
                strokeWidth={1.5 / zoom2D}
                strokeLinejoin="round"
              />

              {/* Guide line to cursor */}
              {pen.guidePath && (
                <path
                  d={pen.guidePath}
                  fill="none"
                  stroke="rgba(74, 158, 255, 0.4)"
                  strokeWidth={1 / zoom2D}
                  strokeDasharray={`${4 / zoom2D} ${3 / zoom2D}`}
                />
              )}

              {/* Nodes: anchors + handles */}
              {pen.nodes.map((node, i) => (
                <g key={i}>
                  {/* Handle lines */}
                  {node.handleIn && (
                    <>
                      <line
                        x1={node.anchor.x} y1={node.anchor.y}
                        x2={node.handleIn.x} y2={node.handleIn.y}
                        stroke="rgba(255, 107, 107, 0.6)"
                        strokeWidth={0.8 / zoom2D}
                      />
                      <circle
                        cx={node.handleIn.x} cy={node.handleIn.y}
                        r={HANDLE_RADIUS / zoom2D}
                        fill="#ff6b6b"
                        stroke="#fff"
                        strokeWidth={0.8 / zoom2D}
                      />
                    </>
                  )}
                  {node.handleOut && (
                    <>
                      <line
                        x1={node.anchor.x} y1={node.anchor.y}
                        x2={node.handleOut.x} y2={node.handleOut.y}
                        stroke="rgba(255, 107, 107, 0.6)"
                        strokeWidth={0.8 / zoom2D}
                      />
                      <circle
                        cx={node.handleOut.x} cy={node.handleOut.y}
                        r={HANDLE_RADIUS / zoom2D}
                        fill="#ff6b6b"
                        stroke="#fff"
                        strokeWidth={0.8 / zoom2D}
                      />
                    </>
                  )}

                  {/* Anchor point */}
                  <circle
                    cx={node.anchor.x} cy={node.anchor.y}
                    r={ANCHOR_RADIUS / zoom2D}
                    fill={i === 0 ? '#ffd700' : '#4a9eff'}
                    stroke="#fff"
                    strokeWidth={1 / zoom2D}
                  />
                </g>
              ))}

              {/* Close indicator on first node */}
              {pen.nodes.length > 2 && pen.nodes[0] && (
                <circle
                  cx={pen.nodes[0].anchor.x}
                  cy={pen.nodes[0].anchor.y}
                  r={HANDLE_RADIUS * 3 / zoom2D}
                  fill="none"
                  stroke="rgba(255, 215, 0, 0.3)"
                  strokeWidth={1 / zoom2D}
                  pointerEvents="none"
                />
              )}
            </g>
          )}

          {/* ─── Measure tool: measurement lines ─── */}
          {activeTool === 'measure' && (
            <g className="measure-lines">
              {measureTool.measurements.map(m => {
                const mx = (m.startPoint.x + m.endPoint.x) / 2;
                const my = (m.startPoint.y + m.endPoint.y) / 2;
                const angle = Math.atan2(m.endPoint.y - m.startPoint.y, m.endPoint.x - m.startPoint.x) * 180 / Math.PI;
                const label = measureTool.formatDistance(m.distance);
                return (
                  <g key={m.id}>
                    <line
                      x1={m.startPoint.x} y1={m.startPoint.y}
                      x2={m.endPoint.x} y2={m.endPoint.y}
                      stroke="#9c27b0" strokeWidth={1.5 / zoom2D}
                      strokeDasharray={`${5 / zoom2D} ${3 / zoom2D}`}
                    />
                    <circle cx={m.startPoint.x} cy={m.startPoint.y} r={3 / zoom2D} fill="#9c27b0" />
                    <circle cx={m.endPoint.x} cy={m.endPoint.y} r={3 / zoom2D} fill="#9c27b0" />
                    <g transform={`translate(${mx}, ${my})`}>
                      <rect
                        x={-label.length * 3 / zoom2D} y={-7 / zoom2D}
                        width={label.length * 6 / zoom2D} height={14 / zoom2D}
                        rx={7 / zoom2D} fill="rgba(0,0,0,0.75)"
                      />
                      <text
                        textAnchor="middle" dominantBaseline="central"
                        fill="#fff" fontSize={10 / zoom2D}
                        fontFamily="Inter, sans-serif" pointerEvents="none"
                      >
                        {label}
                      </text>
                    </g>
                  </g>
                );
              })}
              {/* Guide line from current start to cursor */}
              {measureTool.currentStart && measureTool.cursorPos && (() => {
                const s = measureTool.currentStart;
                const c = measureTool.cursorPos;
                const d = Math.hypot(c.x - s.x, c.y - s.y);
                const label = measureTool.formatDistance(d);
                const mx = (s.x + c.x) / 2;
                const my = (s.y + c.y) / 2;
                return (
                  <>
                    <line
                      x1={s.x} y1={s.y} x2={c.x} y2={c.y}
                      stroke="#9c27b0" strokeWidth={1 / zoom2D}
                      strokeDasharray={`${4 / zoom2D} ${3 / zoom2D}`} opacity={0.6}
                    />
                    <circle cx={s.x} cy={s.y} r={3 / zoom2D} fill="#9c27b0" />
                    <g transform={`translate(${mx}, ${my})`}>
                      <rect
                        x={-label.length * 3 / zoom2D} y={-7 / zoom2D}
                        width={label.length * 6 / zoom2D} height={14 / zoom2D}
                        rx={7 / zoom2D} fill="rgba(0,0,0,0.6)"
                      />
                      <text
                        textAnchor="middle" dominantBaseline="central"
                        fill="#fff" fontSize={10 / zoom2D}
                        fontFamily="Inter, sans-serif" pointerEvents="none"
                      >
                        {label}
                      </text>
                    </g>
                  </>
                );
              })()}
            </g>
          )}

          {/* ─── Node Editor: editable anchor points & handles ─── */}
          {nodeEditor.isEditing && nodeEditor.editingPieceId && (() => {
            const piece = pieces.find(p => p.id === nodeEditor.editingPieceId);
            if (!piece) return null;
            const isNodeSelected = (ref: NodeRef) =>
              nodeEditor.selectedNode &&
              nodeEditor.selectedNode.commandIndex === ref.commandIndex &&
              nodeEditor.selectedNode.pointType === ref.pointType;
            const isNodeHovered = (ref: NodeRef) =>
              nodeEditor.hoveredNode &&
              nodeEditor.hoveredNode.commandIndex === ref.commandIndex &&
              nodeEditor.hoveredNode.pointType === ref.pointType;

            return (
              <g className="node-editor" transform={`translate(${piece.position.x}, ${piece.position.y})`}>
                {nodeEditor.nodes.map((node, i) => (
                  <g key={i}>
                    {/* Control handle lines + circles */}
                    {node.cp1 && (
                      <>
                        <line
                          x1={node.position.x} y1={node.position.y}
                          x2={node.cp1.x} y2={node.cp1.y}
                          stroke="rgba(255, 107, 107, 0.5)"
                          strokeWidth={0.8 / zoom2D}
                        />
                        <rect
                          x={node.cp1.x - 3.5 / zoom2D}
                          y={node.cp1.y - 3.5 / zoom2D}
                          width={7 / zoom2D}
                          height={7 / zoom2D}
                          fill={isNodeSelected({ ...node.ref, pointType: 'cp2' }) ? '#ff6b6b' : '#fff'}
                          stroke="#ff6b6b"
                          strokeWidth={1 / zoom2D}
                          style={{ cursor: 'move' }}
                          rx={1 / zoom2D}
                        />
                      </>
                    )}

                    {/* Anchor point */}
                    <circle
                      cx={node.position.x}
                      cy={node.position.y}
                      r={4.5 / zoom2D}
                      fill={isNodeSelected(node.ref) ? '#ffd700' : isNodeHovered(node.ref) ? '#6bb3ff' : '#4a9eff'}
                      stroke="#fff"
                      strokeWidth={1.2 / zoom2D}
                      style={{ cursor: 'move' }}
                    />
                  </g>
                ))}
              </g>
            );
          })()}
        </g>

        {/* Node editor hint */}
        {nodeEditor.isEditing && (
          <text
            x="50%" y="98%"
            textAnchor="middle" dominantBaseline="auto"
            fill="rgba(255, 215, 0, 0.5)"
            fontSize="11" fontFamily="Inter, sans-serif"
          >
            Editing nodes — Drag to move · Esc to exit
          </text>
        )}

        {/* Empty state */}
        {pieces.length === 0 && activeTool !== 'pen' && (
          <text
            x="50%"
            y="50%"
            textAnchor="middle"
            dominantBaseline="middle"
            fill="rgba(0,0,0,0.2)"
            fontSize="15"
            fontFamily="Inter, sans-serif"
          >
            Select the Pen tool (P) to draw pattern pieces
          </text>
        )}

        {/* Notch tool hint */}
        {activeTool === 'notch' && pieces.length > 0 && (
          <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle"
            fill="rgba(0,0,0,0.2)" fontSize="13" fontFamily="Inter, sans-serif">
            Click on a piece edge to place a notch mark
          </text>
        )}

        {/* Grainline tool hint */}
        {activeTool === 'grainline' && pieces.length > 0 && (
          <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle"
            fill="rgba(0,0,0,0.2)" fontSize="13" fontFamily="Inter, sans-serif">
            Click and drag inside a piece to set grain direction
          </text>
        )}

        {/* Seam tool hint */}
        {activeTool === 'seam' && !seamTool.firstEdge && (
          <text
            x="50%"
            y="50%"
            textAnchor="middle"
            dominantBaseline="middle"
            fill="rgba(0,0,0,0.2)"
            fontSize="13"
            fontFamily="Inter, sans-serif"
          >
            Click an edge on piece A · Then click an edge on piece B · Esc to cancel
          </text>
        )}
        {activeTool === 'seam' && seamTool.firstEdge && (
          <text
            x="50%"
            y="95%"
            textAnchor="middle"
            dominantBaseline="middle"
            fill="rgba(46, 204, 113, 0.5)"
            fontSize="12"
            fontFamily="Inter, sans-serif"
          >
            Edge A selected — now click an edge on a different piece
          </text>
        )}

        {/* Pen tool hint */}
        {activeTool === 'measure' && measureTool.measurements.length === 0 && !measureTool.currentStart && (
          <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle"
            fill="rgba(0,0,0,0.2)" fontSize="13" fontFamily="Inter, sans-serif">
            Click two points to measure distance · Esc to clear · Delete to remove last
          </text>
        )}

        {activeTool === 'pen' && pen.nodes.length === 0 && (
          <text
            x="50%"
            y="50%"
            textAnchor="middle"
            dominantBaseline="middle"
            fill="rgba(0,0,0,0.2)"
            fontSize="13"
            fontFamily="Inter, sans-serif"
          >
            Click to add points · Drag to curve · Click first point to close · Enter to finish open · Esc to cancel
          </text>
        )}
      </svg>
    </div>
  );
}
