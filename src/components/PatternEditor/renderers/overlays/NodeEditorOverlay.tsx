import { PatternPiece, Point2D, UnitSystem } from '../../../../types/types';
import { NodeRef } from '../../nodeEditorUtils';
import { formatDimension } from '../../../../utils/units';

interface EditorNode {
  position: Point2D;
  cp1?: Point2D;
  ref: NodeRef;
}

interface NodeEditorOverlayProps {
  zoom2D: number;
  units: string;
  pieces: PatternPiece[];
  nodeEditorEditingPieceId: string;
  nodeEditorNodes: EditorNode[];
  selectedNode: NodeRef | null;
  hoveredNode: NodeRef | null;
}

export default function NodeEditorOverlay({ zoom2D, units, pieces, nodeEditorEditingPieceId, nodeEditorNodes, selectedNode, hoveredNode }: NodeEditorOverlayProps) {
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

  const selectedNodeData = selectedNode ? nodeEditorNodes.find(n => isNodeSelected(n.ref)) : null;

  return (
    <>
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

      {selectedNodeData && (
        <g transform={`translate(${selectedNodeData.position.x + piece.position.x}, ${selectedNodeData.position.y + piece.position.y - 20 / zoom2D})`}>
          <rect
            x={-40 / zoom2D} y={-8 / zoom2D}
            width={80 / zoom2D} height={16 / zoom2D}
            rx={8 / zoom2D} fill="rgba(0,0,0,0.75)"
          />
          <text
            textAnchor="middle" dominantBaseline="central"
            fill="#fff" fontSize={9 / zoom2D} pointerEvents="none"
          >
            x: {formatDimension(selectedNodeData.position.x, units as UnitSystem)}, y: {formatDimension(selectedNodeData.position.y, units as UnitSystem)}
          </text>
        </g>
      )}
    </>
  );
}
