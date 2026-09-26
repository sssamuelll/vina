import type { PatternPiece } from '../../../../types/types';

interface MergeOverlayProps {
  zoom2D: number;
  pieces: PatternPiece[];
  pieceIdA: string | null;
  pieceIdB: string | null;
  sharedEdgeFound: boolean;
  error: string | null;
}

export default function MergeOverlay({
  zoom2D,
  pieces,
  pieceIdA,
  pieceIdB,
  sharedEdgeFound,
  error,
}: MergeOverlayProps) {
  if (!pieceIdA) return null;

  const sw = 2 / zoom2D;

  // Highlight selected pieces with colored outlines
  const renderHighlight = (pieceId: string, color: string) => {
    const piece = pieces.find(p => p.id === pieceId);
    if (!piece) return null;

    // Build SVG path from outline
    const d = piece.outline
      .map(cmd => {
        switch (cmd.type) {
          case 'M': return `M${cmd.values[0]},${cmd.values[1]}`;
          case 'L': return `L${cmd.values[0]},${cmd.values[1]}`;
          case 'C': return `C${cmd.values.join(',')}`;
          case 'Q': return `Q${cmd.values.join(',')}`;
          case 'Z': return 'Z';
          default: return '';
        }
      })
      .join(' ');

    return (
      <g transform={`translate(${piece.position.x}, ${piece.position.y})`}>
        <path
          d={d}
          fill={color}
          fillOpacity={0.15}
          stroke={color}
          strokeWidth={sw}
          pointerEvents="none"
        />
      </g>
    );
  };

  return (
    <g>
      {renderHighlight(pieceIdA, 'var(--accent-2d)')}
      {pieceIdB && renderHighlight(pieceIdB, sharedEdgeFound ? '#4CAF50' : '#FF4444')}

      {/* Error message */}
      {error && pieceIdB && (
        <text
          x={0}
          y={-10 / zoom2D}
          fill="#FF4444"
          fontSize={12 / zoom2D}
          textAnchor="middle"
          pointerEvents="none"
        >
          {error}
        </text>
      )}
    </g>
  );
}
