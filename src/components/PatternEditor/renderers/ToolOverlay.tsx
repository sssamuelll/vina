import { PatternPiece, Point2D, Tool2D } from '../../../types/types';
import { getEdgeEndpoints } from '../useSeamTool';
import { NodeRef } from '../useNodeEditor';
import { HANDLE_RADIUS, ANCHOR_RADIUS } from '../utils';

interface PenNode {
  anchor: Point2D;
  handleIn: Point2D | null;
  handleOut: Point2D | null;
}

interface SeamEdge {
  pieceId: string;
  edgeIndex: number;
  midpoint: Point2D;
}

interface NotchHover {
  point: Point2D;
  normal: Point2D;
}

interface EditorNode {
  position: Point2D;
  cp1?: Point2D;
  ref: NodeRef;
}

interface Measurement {
  id: string;
  startPoint: Point2D;
  endPoint: Point2D;
  distance: number;
}

interface ToolOverlayProps {
  activeTool: Tool2D;
  zoom2D: number;
  pieces: PatternPiece[];
  // Pen
  penNodes: PenNode[];
  previewPath: string;
  guidePath: string | null;
  rectPreview: { x: number; y: number; width: number; height: number } | null;
  lineStart: Point2D | null;
  lineCursor: Point2D | null;
  // Seam
  firstEdge: SeamEdge | null;
  hoveredEdge: SeamEdge | null;
  // Notch
  notchHoveredPoint: NotchHover | null;
  // Grainline
  grainlineIsDragging: boolean;
  grainlineStartPoint: Point2D | null;
  grainlineEndPoint: Point2D | null;
  grainlinePieceId: string | null;
  // Measure
  measurements: Measurement[];
  currentStart: Point2D | null;
  cursorPos: Point2D | null;
  formatDistance: (d: number) => string;
  // Node editor
  nodeEditorIsEditing: boolean;
  nodeEditorEditingPieceId: string | null;
  nodeEditorNodes: EditorNode[];
  selectedNode: NodeRef | null;
  hoveredNode: NodeRef | null;
}

export default function ToolOverlay(props: ToolOverlayProps) {
  const {
    activeTool, zoom2D, pieces,
    penNodes, previewPath, guidePath, rectPreview, lineStart, lineCursor,
    firstEdge, hoveredEdge,
    notchHoveredPoint,
    grainlineIsDragging, grainlineStartPoint, grainlineEndPoint, grainlinePieceId,
    measurements, currentStart, cursorPos, formatDistance,
    nodeEditorIsEditing, nodeEditorEditingPieceId, nodeEditorNodes, selectedNode, hoveredNode,
  } = props;

  return (
    <>
      {/* ─── Seam tool: edge highlights ─── */}
      {activeTool === 'seam' && (
        <g className="seam-tool-wip">
          {firstEdge && (() => {
            const piece = pieces.find(p => p.id === firstEdge.pieceId);
            if (!piece) return null;
            const ep = getEdgeEndpoints(piece.outline, firstEdge.edgeIndex);
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
          {hoveredEdge && (() => {
            const piece = pieces.find(p => p.id === hoveredEdge.pieceId);
            if (!piece) return null;
            const ep = getEdgeEndpoints(piece.outline, hoveredEdge.edgeIndex);
            if (!ep) return null;
            return (
              <line
                x1={ep.start.x + piece.position.x} y1={ep.start.y + piece.position.y}
                x2={ep.end.x + piece.position.x} y2={ep.end.y + piece.position.y}
                stroke={firstEdge ? '#3498db' : '#2ecc71'}
                strokeWidth={2.5 / zoom2D}
                strokeLinecap="round"
                opacity={0.7}
              />
            );
          })()}
          {firstEdge && hoveredEdge && firstEdge.pieceId !== hoveredEdge.pieceId && (
            <line
              x1={firstEdge.midpoint.x} y1={firstEdge.midpoint.y}
              x2={hoveredEdge.midpoint.x} y2={hoveredEdge.midpoint.y}
              stroke="#2ecc71"
              strokeWidth={1 / zoom2D}
              strokeDasharray={`${4 / zoom2D} ${3 / zoom2D}`}
              opacity={0.5}
            />
          )}
        </g>
      )}

      {/* ─── Notch tool: hover preview ─── */}
      {activeTool === 'notch' && notchHoveredPoint && (
        <g className="notch-preview">
          <line
            x1={notchHoveredPoint.point.x - notchHoveredPoint.normal.x * 4}
            y1={notchHoveredPoint.point.y - notchHoveredPoint.normal.y * 4}
            x2={notchHoveredPoint.point.x + notchHoveredPoint.normal.x * 8}
            y2={notchHoveredPoint.point.y + notchHoveredPoint.normal.y * 8}
            stroke="#ff9800"
            strokeWidth={2 / zoom2D}
            strokeLinecap="round"
            opacity={0.7}
          />
          <circle
            cx={notchHoveredPoint.point.x}
            cy={notchHoveredPoint.point.y}
            r={3 / zoom2D}
            fill="#ff9800"
            opacity={0.5}
          />
        </g>
      )}

      {/* ─── Grainline tool: drag preview ─── */}
      {activeTool === 'grainline' && grainlineIsDragging && grainlineStartPoint && grainlineEndPoint && grainlinePieceId && (() => {
        const piece = pieces.find(p => p.id === grainlinePieceId);
        if (!piece) return null;
        const sx = grainlineStartPoint.x + piece.position.x;
        const sy = grainlineStartPoint.y + piece.position.y;
        const ex = grainlineEndPoint.x + piece.position.x;
        const ey = grainlineEndPoint.y + piece.position.y;
        const dx = ex - sx, dy = ey - sy;
        const len = Math.hypot(dx, dy);
        if (len < 2) return null;
        const ux = dx / len, uy = dy / len;
        const arrowSize = 6 / zoom2D;
        return (
          <g className="grainline-preview">
            <line x1={sx} y1={sy} x2={ex} y2={ey}
              stroke="#6bff6b" strokeWidth={1.5 / zoom2D} opacity={0.8} />
            <polygon
              points={`${ex},${ey} ${ex - ux * arrowSize + uy * arrowSize * 0.5},${ey - uy * arrowSize - ux * arrowSize * 0.5} ${ex - ux * arrowSize - uy * arrowSize * 0.5},${ey - uy * arrowSize + ux * arrowSize * 0.5}`}
              fill="#6bff6b" opacity={0.8}
            />
          </g>
        );
      })()}

      {/* ─── Pen tool: work-in-progress path ─── */}
      {activeTool === 'pen' && penNodes.length > 0 && (
        <g className="pen-wip">
          <path
            d={previewPath}
            fill="none"
            stroke="#4a9eff"
            strokeWidth={1.5 / zoom2D}
            strokeLinejoin="round"
          />
          {guidePath && (
            <path
              d={guidePath}
              fill="none"
              stroke="rgba(74, 158, 255, 0.4)"
              strokeWidth={1 / zoom2D}
              strokeDasharray={`${4 / zoom2D} ${3 / zoom2D}`}
            />
          )}
          {penNodes.map((node, i) => (
            <g key={i}>
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
              <circle
                cx={node.anchor.x} cy={node.anchor.y}
                r={ANCHOR_RADIUS / zoom2D}
                fill={i === 0 ? '#ffd700' : '#4a9eff'}
                stroke="#fff"
                strokeWidth={1 / zoom2D}
              />
            </g>
          ))}
          {penNodes.length > 2 && penNodes[0] && (
            <circle
              cx={penNodes[0].anchor.x}
              cy={penNodes[0].anchor.y}
              r={HANDLE_RADIUS * 3 / zoom2D}
              fill="none"
              stroke="rgba(255, 215, 0, 0.3)"
              strokeWidth={1 / zoom2D}
              pointerEvents="none"
            />
          )}
        </g>
      )}

      {/* ─── Line tool: start point + preview line ─── */}
      {activeTool === 'line' && lineStart && (
        <g>
          <circle cx={lineStart.x} cy={lineStart.y} r={4 / zoom2D} fill="#4a9eff" />
          {lineCursor && (
            <line
              x1={lineStart.x} y1={lineStart.y}
              x2={lineCursor.x} y2={lineCursor.y}
              stroke="#4a9eff"
              strokeWidth={1.5 / zoom2D}
              strokeDasharray={`${4 / zoom2D}`}
            />
          )}
        </g>
      )}

      {/* ─── Rectangle tool: drag preview ─── */}
      {activeTool === 'rectangle' && rectPreview && (
        <rect
          x={rectPreview.x}
          y={rectPreview.y}
          width={rectPreview.width}
          height={rectPreview.height}
          fill="rgba(74, 158, 255, 0.15)"
          stroke="#4a9eff"
          strokeWidth={1.5 / zoom2D}
          strokeDasharray={`${4 / zoom2D}`}
        />
      )}

      {/* ─── Measure tool: measurement lines ─── */}
      {activeTool === 'measure' && (
        <g className="measure-lines">
          {measurements.map(m => {
            const mx = (m.startPoint.x + m.endPoint.x) / 2;
            const my = (m.startPoint.y + m.endPoint.y) / 2;
            const label = formatDistance(m.distance);
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
          {currentStart && cursorPos && (() => {
            const s = currentStart;
            const c = cursorPos;
            const d = Math.hypot(c.x - s.x, c.y - s.y);
            const label = formatDistance(d);
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

      {/* ─── Node Editor overlay ─── */}
      {nodeEditorIsEditing && nodeEditorEditingPieceId && (() => {
        const piece = pieces.find(p => p.id === nodeEditorEditingPieceId);
        if (!piece) return null;
        const isNodeSelected = (ref: NodeRef) =>
          selectedNode &&
          selectedNode.commandIndex === ref.commandIndex &&
          selectedNode.pointType === ref.pointType;
        const isNodeHovered = (ref: NodeRef) =>
          hoveredNode &&
          hoveredNode.commandIndex === ref.commandIndex &&
          hoveredNode.pointType === ref.pointType;

        return (
          <g className="node-editor" transform={`translate(${piece.position.x}, ${piece.position.y})`}>
            {nodeEditorNodes.map((node, i) => (
              <g key={i}>
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
    </>
  );
}
