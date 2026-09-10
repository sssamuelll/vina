import type { PatternPiece, Point2D } from '../../../../types/types';
import { outlineBBoxCenter } from '../../../../utils/geometry/transform';
import { classifyEditableAnchors } from '../../anchorRoles';
import type { EditableNode } from '../../nodeEditorUtils';
import AnchorGlyph, { type AnchorVisualState } from '../AnchorGlyph';

interface EditPatternOverlayProps {
  zoom2D: number;
  pieces: PatternPiece[];
  editingPieceId: string | null;
  hoveredPieceId: string | null;
  nodes: EditableNode[];
  selectedNodes: Set<number>;
  selectedSegments: Set<number>;
  hoveredNode: number | null;
  hoveredSegment: number | null;
  addPointPreview: Point2D | null;
  marquee: { start: Point2D; current: Point2D } | null;
}

export default function EditPatternOverlay({
  zoom2D,
  pieces,
  editingPieceId,
  hoveredPieceId,
  nodes,
  selectedNodes,
  selectedSegments,
  hoveredNode,
  hoveredSegment,
  addPointPreview,
  marquee,
}: EditPatternOverlayProps) {
  const piece = pieces.find(p => p.id === (editingPieceId ?? hoveredPieceId));
  if (!piece) return null;

  const classifiedAnchors = editingPieceId
    ? classifyEditableAnchors(piece, nodes)
    : [];

  // Build segment paths for highlight
  const segmentHighlights: JSX.Element[] = [];
  const outline = piece.outline;
  let prevX = 0, prevY = 0;
  for (let i = 0; i < outline.length; i++) {
    const cmd = outline[i];
    const isSelected = selectedSegments.has(i);
    const isHovered = hoveredSegment === i && !isSelected;

    if (isSelected || isHovered) {
      let d = '';
      if (cmd.type === 'L') {
        d = `M ${prevX} ${prevY} L ${cmd.values[0]} ${cmd.values[1]}`;
      } else if (cmd.type === 'C') {
        d = `M ${prevX} ${prevY} C ${cmd.values.join(' ')}`;
      } else if (cmd.type === 'Q') {
        d = `M ${prevX} ${prevY} Q ${cmd.values.join(' ')}`;
      }
      if (d) {
        segmentHighlights.push(
          <path
            key={`seg-${i}`}
            data-tramo-hover={isHovered ? i : undefined}
            d={d}
            fill="none"
            stroke="var(--accent-2d)"
            strokeWidth={(isSelected ? 2.5 : 2) / zoom2D}
            opacity={isSelected ? 1 : 0.6}
            pointerEvents="none"
          />
        );
      }
    }

    // Track previous anchor for segment path construction
    switch (cmd.type) {
      case 'M':
      case 'L':
        prevX = cmd.values[0]; prevY = cmd.values[1]; break;
      case 'C':
        prevX = cmd.values[4]; prevY = cmd.values[5]; break;
      case 'Q':
        prevX = cmd.values[2]; prevY = cmd.values[3]; break;
    }
  }

  // Closing segment: last anchor → first anchor (Z command)
  const zIndex = outline.findIndex(c => c.type === 'Z');
  if (zIndex >= 0) {
    const isClosingSelected = selectedSegments.has(zIndex);
    const isClosingHovered = hoveredSegment === zIndex && !isClosingSelected;

    if (isClosingSelected || isClosingHovered) {
      const firstCmd = outline[0];
      if (firstCmd.type === 'M') {
        // prevX/prevY from the loop already hold the last anchor position
        const d = `M ${prevX} ${prevY} L ${firstCmd.values[0]} ${firstCmd.values[1]}`;
        segmentHighlights.push(
          <path
            key="seg-closing"
            data-tramo-hover={isClosingHovered ? zIndex : undefined}
            d={d}
            fill="none"
            stroke="var(--accent-2d)"
            strokeWidth={(isClosingSelected ? 2.5 : 2) / zoom2D}
            opacity={isClosingSelected ? 1 : 0.6}
            pointerEvents="none"
          />
        );
      }
    }
  }

  // Match the renderer's per-piece transform so anchor dots track a rotated
  // piece (nota de María #170): translate by position, then rotate about the
  // outline bbox center. The marquee stays screen-aligned (outside this group).
  const rot = piece.rotation ?? 0;
  const anchorTransform = (() => {
    const base = `translate(${piece.position.x}, ${piece.position.y})`;
    if (!rot) return base;
    const { x: cx, y: cy } = outlineBBoxCenter(piece.outline);
    return `${base} rotate(${rot}, ${cx}, ${cy})`;
  })();

  return (
    <>
      <g transform={anchorTransform}>
        {/* Segment highlights */}
        {segmentHighlights}

        {/* Add-point preview */}
        {addPointPreview && (
          <circle
            cx={addPointPreview.x}
            cy={addPointPreview.y}
            r={4 / zoom2D}
            fill="#4A9EFF"
            opacity={0.5}
          />
        )}

        {/* Semantic anchor glyphs */}
        {classifiedAnchors.map(({ node, role }) => {
          const commandIndex = node.ref.commandIndex;
          const state: AnchorVisualState = selectedNodes.has(commandIndex)
            ? 'selected'
            : hoveredNode === commandIndex
              ? 'hovered'
              : 'idle';
          return (
            <g key={commandIndex} data-command-index={commandIndex}>
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

      {/* Marquee selection rectangle */}
      {marquee && (
        <rect
          x={Math.min(marquee.start.x, marquee.current.x)}
          y={Math.min(marquee.start.y, marquee.current.y)}
          width={Math.abs(marquee.current.x - marquee.start.x)}
          height={Math.abs(marquee.current.y - marquee.start.y)}
          fill="rgba(74, 158, 255, 0.1)"
          stroke="#4A9EFF"
          strokeWidth={1 / zoom2D}
          strokeDasharray={`${4 / zoom2D}`}
        />
      )}
    </>
  );
}
