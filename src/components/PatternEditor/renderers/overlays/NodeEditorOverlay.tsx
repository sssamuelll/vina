import type { PatternPiece, UnitSystem } from '../../../../types/types';
import { outlineBBoxCenter } from '../../../../utils/geometry/transform';
import { formatDimension } from '../../../../utils/units';
import { classifyEditableAnchors } from '../../anchorRoles';
import type { EditableNode, NodeRef } from '../../nodeEditorUtils';
import { pieceLocalToPattern } from '../../pieceTransform';
import AnchorGlyph, { type AnchorVisualState } from '../AnchorGlyph';
import { READOUT_FONT_PX, pildoraDeMedida } from './pildoraDeMedida';

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
      <g className="node-editor" data-piece-id={piece.id} transform={anchorTransform}>
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
              {handles.map(h => {
                const selected = Boolean(isNodeSelected(h.ref));
                const hovered = !selected && Boolean(isNodeHovered(h.ref));
                const halfSize = (selected ? 5 : hovered ? 4.25 : 3.5) / zoom2D;
                const handleStrokeWidth = (selected ? 2 : hovered ? 1.5 : 1) / zoom2D;
                return (
                  <g key={h.key}>
                    {/* El rojo del asa NO se migra a token en esta tanda: era
                        una decisión visual fijada a propósito (el test de
                        paridad se llamaba "keeps a Bezier control handle
                        red"), y distingue el asa del azul de las anclas en un
                        overlay denso. Migrarla exige elegir un tono nuevo
                        viéndolo en pantalla, no de memoria. Pendiente aparte. */}
                    <line
                      x1={node.position.x} y1={node.position.y}
                      x2={h.pos.x} y2={h.pos.y}
                      stroke="rgba(255, 107, 107, 0.5)"
                      strokeWidth={0.8 / zoom2D}
                    />
                    <rect
                      className="node-editor__control-handle"
                      x={h.pos.x - halfSize}
                      y={h.pos.y - halfSize}
                      width={halfSize * 2}
                      height={halfSize * 2}
                      fill={selected ? '#ff6b6b' : '#fff'}
                      stroke="#ff6b6b"
                      strokeWidth={handleStrokeWidth}
                      style={{ cursor: 'move' }}
                      rx={1 / zoom2D}
                    />
                  </g>
                );
              })}
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

      {selectedNodeData && selectedNodePatternPosition && (() => {
        // La píldora se dimensiona desde SU texto: con el ancho escrito a mano
        // (80 px) "x: 489.1 mm, y: 411.0 mm" se salía por los dos lados y la
        // mitad del número quedaba sobre la cuadrícula clara, ilegible.
        const lectura = `x: ${formatDimension(selectedNodeData.position.x, units as UnitSystem)}, y: ${formatDimension(selectedNodeData.position.y, units as UnitSystem)}`;
        const fontSize = READOUT_FONT_PX / zoom2D;
        const pildora = pildoraDeMedida(lectura, fontSize);
        return (
          <g transform={`translate(${selectedNodePatternPosition.x}, ${selectedNodePatternPosition.y - 20 / zoom2D})`}>
            <rect {...pildora} fill="var(--readout-bg-2d)" />
            <text
              textAnchor="middle" dominantBaseline="central"
              fill="var(--readout-ink-2d)" fontSize={fontSize} pointerEvents="none"
              style={{ fontFamily: 'var(--font-mono-2d)' }}
            >
              {lectura}
            </text>
          </g>
        );
      })()}
    </>
  );
}
