import type { PatternPiece, UnitSystem } from '../../../../types/types';
import { outlineBBoxCenter } from '../../../../utils/geometry/transform';
import { formatDimension } from '../../../../utils/units';
import { classifyEditableAnchors } from '../../anchorRoles';
import type { EditableNode, NodeRef } from '../../nodeEditorUtils';
import { pieceLocalToPattern } from '../../pieceTransform';
import AnchorGlyph, { type AnchorVisualState } from '../AnchorGlyph';

interface NodeEditorOverlayProps {
  zoom2D: number;
  units: string;
  pieces: PatternPiece[];
  nodeEditorEditingPieceId: string;
  nodeEditorNodes: EditableNode[];
  selectedNode: NodeRef | null;
  hoveredNode: NodeRef | null;
}

export default function NodeEditorOverlay({ zoom2D, units, pieces, nodeEditorEditingPieceId, nodeEditorNodes, selectedNode, hoveredNode }: NodeEditorOverlayProps) {
  const piece = pieces.find(p => p.id === nodeEditorEditingPieceId);
  if (!piece) return null;

  const classifiedAnchors = classifyEditableAnchors(piece, nodeEditorNodes);
  const rotation = piece.rotation ?? 0;
  const center = outlineBBoxCenter(piece.outline);
  const anchorTransform = rotation
    ? `translate(${piece.position.x}, ${piece.position.y}) rotate(${rotation}, ${center.x}, ${center.y})`
    : `translate(${piece.position.x}, ${piece.position.y})`;

  const isNodeSelected = (ref: NodeRef) =>
    selectedNode &&
    selectedNode.commandIndex === ref.commandIndex &&
    selectedNode.pointType === ref.pointType;
  const isNodeHovered = (ref: NodeRef) =>
    hoveredNode &&
    hoveredNode.commandIndex === ref.commandIndex &&
    hoveredNode.pointType === ref.pointType;

  const selectedNodeData = selectedNode ? nodeEditorNodes.find(n => isNodeSelected(n.ref)) : null;
  const selectedNodePatternPosition = selectedNodeData
    ? pieceLocalToPattern(selectedNodeData.position, piece)
    : null;

  return (
    <>
      <g className="node-editor" transform={anchorTransform}>
        {classifiedAnchors.map(({ node, role }) => {
          const state: AnchorVisualState = isNodeSelected(node.ref)
            ? 'selected'
            : isNodeHovered(node.ref)
              ? 'hovered'
              : 'idle';
          // maria-203: ambos manejadores del ancla — entrada (cp1) y salida
          // (cp2) — con el ref de arrastre que le corresponde a cada uno.
          const handles: Array<{ key: string; pos: NonNullable<EditableNode['cp1']>; ref: NodeRef }> = [];
          if (node.cp1 && node.cp1Ref) handles.push({ key: 'in', pos: node.cp1, ref: node.cp1Ref });
          if (node.cp2 && node.cp2Ref) handles.push({ key: 'out', pos: node.cp2, ref: node.cp2Ref });
          return (
            <g key={node.ref.commandIndex} data-command-index={node.ref.commandIndex}>
              {handles.map(h => (
                <g key={h.key}>
                  <line
                    x1={node.position.x} y1={node.position.y}
                    x2={h.pos.x} y2={h.pos.y}
                    stroke="rgba(255, 107, 107, 0.5)"
                    strokeWidth={0.8 / zoom2D}
                  />
                  <rect
                    className="node-editor__control-handle"
                    x={h.pos.x - 3.5 / zoom2D}
                    y={h.pos.y - 3.5 / zoom2D}
                    width={7 / zoom2D}
                    height={7 / zoom2D}
                    fill={isNodeSelected(h.ref) ? '#ff6b6b' : '#fff'}
                    stroke="#ff6b6b"
                    strokeWidth={1 / zoom2D}
                    style={{ cursor: 'move' }}
                    rx={1 / zoom2D}
                  />
                </g>
              ))}
              <AnchorGlyph
                role={role}
                position={node.position}
                zoom2D={zoom2D}
                state={state}
              />
            </g>
          );
        })}
      </g>

      {selectedNodeData && selectedNodePatternPosition && (
        <g transform={`translate(${selectedNodePatternPosition.x}, ${selectedNodePatternPosition.y - 20 / zoom2D})`}>
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
