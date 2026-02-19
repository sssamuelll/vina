import { PatternPiece } from '../../../types/types';
import { pathToSVG } from '../utils';

interface PieceRendererProps {
  pieces: PatternPiece[];
  selectedPieceIds: string[];
  zoom2D: number;
  showSeamAllowance: boolean;
  showGrainlines: boolean;
}

export default function PieceRenderer({ pieces, selectedPieceIds, zoom2D, showSeamAllowance, showGrainlines }: PieceRendererProps) {
  return (
    <>
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

            {showSeamAllowance && piece.seamAllowance > 0 && (
              <path
                d={pathToSVG(piece.outline)}
                fill="none"
                stroke="rgba(74, 158, 255, 0.25)"
                strokeWidth={0.8 / zoom2D}
                strokeDasharray={`${4 / zoom2D} ${3 / zoom2D}`}
              />
            )}

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
    </>
  );
}
