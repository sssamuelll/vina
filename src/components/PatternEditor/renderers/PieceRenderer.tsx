import { PatternPiece } from '../../../types/types';
import { pathToSVG } from '../utils';
import { generateSeamAllowance } from '../../../utils/seam';

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
              fill={isSelected ? 'rgba(255, 215, 0, 0.18)' : 'rgba(74, 158, 255, 0.08)'}
              stroke="#4a9eff"
              strokeWidth={1.5 / zoom2D}
              strokeLinejoin="round"
            />

            {showSeamAllowance && piece.seamAllowance > 0 && (
              <path
                d={pathToSVG(generateSeamAllowance(piece.outline, piece.seamAllowance))}
                fill="none"
                stroke="rgba(74, 158, 255, 0.4)"
                strokeWidth={0.8 / zoom2D}
                strokeDasharray={`${4 / zoom2D} ${3 / zoom2D}`}
              />
            )}

            {piece.internals.map(line => {
              const isNotch = line.type === 'notch';
              const hasFill = isNotch && line.notchOptions?.shape === 'diamond';
              return (
                <path
                  key={line.id}
                  d={pathToSVG(line.path)}
                  fill={hasFill ? 'rgba(255, 152, 0, 0.3)' : 'none'}
                  stroke={
                    line.type === 'grainline' ? '#6bff6b' :
                    line.type === 'dart' ? '#ff9800' :
                    line.type === 'notch' ? '#ff9800' :
                    line.type === 'fold' ? '#9c27b0' :
                    '#888'
                  }
                  strokeWidth={0.8 / zoom2D}
                  strokeDasharray={line.type === 'fold' ? `${5 / zoom2D} ${3 / zoom2D}` : 'none'}
                  opacity={line.type === 'grainline' && !showGrainlines ? 0 : 0.7}
                />
              );
            })}

            {(() => {
              // Calculate piece center from outline
              let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
              for (const cmd of piece.outline) {
                for (let i = 0; i < cmd.values.length - 1; i += 2) {
                  minX = Math.min(minX, cmd.values[i]);
                  minY = Math.min(minY, cmd.values[i + 1]);
                  maxX = Math.max(maxX, cmd.values[i]);
                  maxY = Math.max(maxY, cmd.values[i + 1]);
                }
              }
              const cx = (minX + maxX) / 2;
              const cy = (minY + maxY) / 2;
              return (
                <text
                  x={cx}
                  y={cy}
                  fontSize={11 / zoom2D}
                  fill="#555"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  pointerEvents="none"
                  fontFamily="Inter, sans-serif"
                  transform={`rotate(${-piece.rotation}, ${cx}, ${cy})`}
                >
                  {piece.name}
                </text>
              );
            })()}
          </g>
        );
      })}
    </>
  );
}
