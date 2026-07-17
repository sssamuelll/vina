import type { PatternPiece, Point2D } from '../../../../types/types';
import { outlineBBoxCenter } from '../../../../utils/geometry/transform';

interface EditPatternOverlayProps {
  zoom2D: number;
  pieces: PatternPiece[];
  editingPieceId: string;
  nodes: Array<{ position: Point2D; cp1?: Point2D; ref: { commandIndex: number } }>;
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
  nodes,
  selectedNodes,
  selectedSegments,
  hoveredNode,
  hoveredSegment,
  addPointPreview,
  marquee,
}: EditPatternOverlayProps) {
  const piece = pieces.find(p => p.id === editingPieceId);
  if (!piece) return null;

  const r = 5 / zoom2D;
  const sw = 1.2 / zoom2D;

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
            d={d}
            fill="none"
            stroke={isSelected ? '#FFD700' : '#6BB3FF'}
            strokeWidth={2.5 / zoom2D}
            opacity={isSelected ? 1 : 0.6}
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
            d={d}
            fill="none"
            stroke={isClosingSelected ? '#FFD700' : '#6BB3FF'}
            strokeWidth={2.5 / zoom2D}
            opacity={isClosingSelected ? 1 : 0.6}
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

        {/* Anchor points — curve anchors (C/Q, have cp1) are squares, corners circles */}
        {nodes.map((node, i) => {
          const isSelected = selectedNodes.has(node.ref.commandIndex);
          const isHovered = hoveredNode === node.ref.commandIndex;
          const fill = isSelected ? '#FFD700' : isHovered ? '#6BB3FF' : '#4A9EFF';
          if (node.cp1) {
            return (
              <rect
                key={i}
                x={node.position.x - r}
                y={node.position.y - r}
                width={r * 2}
                height={r * 2}
                fill={fill}
                stroke="#fff"
                strokeWidth={sw}
                style={{ cursor: 'move' }}
              />
            );
          }
          return (
            <circle
              key={i}
              cx={node.position.x}
              cy={node.position.y}
              r={r}
              fill={fill}
              stroke="#fff"
              strokeWidth={sw}
              style={{ cursor: 'move' }}
            />
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
