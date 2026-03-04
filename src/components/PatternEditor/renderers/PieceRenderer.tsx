
import { PatternPiece, PathCommand } from '../../../types/types';
import { pathToSVG } from '../utils';
import { generateSeamAllowance } from '../../../utils/seam';
import { extractNodes } from '../nodeEditorUtils';

/** Compute bounding box center of a path outline. */
function getOutlineCenter(outline: PathCommand[]): { cx: number; cy: number } {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const cmd of outline) {
    const v = cmd.values;
    if (cmd.type === 'M' || cmd.type === 'L') {
      if (v[0] < minX) minX = v[0]; if (v[0] > maxX) maxX = v[0];
      if (v[1] < minY) minY = v[1]; if (v[1] > maxY) maxY = v[1];
    } else if (cmd.type === 'C') {
      for (let i = 0; i < 6; i += 2) {
        if (v[i] < minX) minX = v[i]; if (v[i] > maxX) maxX = v[i];
        if (v[i + 1] < minY) minY = v[i + 1]; if (v[i + 1] > maxY) maxY = v[i + 1];
      }
    } else if (cmd.type === 'Q') {
      for (let i = 0; i < 4; i += 2) {
        if (v[i] < minX) minX = v[i]; if (v[i] > maxX) maxX = v[i];
        if (v[i + 1] < minY) minY = v[i + 1]; if (v[i + 1] > maxY) maxY = v[i + 1];
      }
    } else if (cmd.type === 'H') {
      if (v[0] < minX) minX = v[0]; if (v[0] > maxX) maxX = v[0];
    } else if (cmd.type === 'V') {
      if (v[0] < minY) minY = v[0]; if (v[0] > maxY) maxY = v[0];
    }
  }
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}

interface PieceRendererProps {
  pieces: PatternPiece[];
  selectedPieceIds: string[];
  zoom2D: number;
  showSeamAllowance: boolean;
  defaultSeamAllowanceWidth: number;
  showGrainlines: boolean;
  showPieceNames: boolean;
  renderMode2D: 'textured' | 'translucent' | 'wireframe';
  selectedInternalLine?: { pieceId: string; lineId: string } | null;
  editingPieceNameId?: string | null;
  onPieceNameDoubleClick?: (pieceId: string) => void;
  onPieceNameSave?: (pieceId: string, newName: string) => void;
  onPieceNameCancel?: () => void;
}

export default function PieceRenderer({
  pieces,
  selectedPieceIds,
  zoom2D,
  showSeamAllowance,
  defaultSeamAllowanceWidth,
  showGrainlines,
  showPieceNames,
  renderMode2D,
  selectedInternalLine,
  editingPieceNameId,
  onPieceNameDoubleClick,
  onPieceNameSave,
  onPieceNameCancel
}: PieceRendererProps) {
  return (
    <>
      {pieces.map(piece => {
        const isSelected = selectedPieceIds.includes(piece.id);
        const strokeColor = piece.linkedPieceId
          ? piece.linkMode === 'symmetry' ? '#64b5f6' : '#aed581'
          : '#4a9eff';
        const { cx, cy } = piece.outline?.length ? getOutlineCenter(piece.outline) : { cx: 0, cy: 0 };
        return (
          <g
            key={piece.id}
            data-piece-id={piece.id}
            transform={`translate(${piece.position.x}, ${piece.position.y}) rotate(${piece.rotation}, ${cx}, ${cy})`}
            className={`pattern-piece ${isSelected ? 'selected' : ''}`}
          >
            <path
              d={pathToSVG(piece.outline)}
              fill={
                renderMode2D === 'wireframe' ? 'none'
                : renderMode2D === 'translucent'
                ? (isSelected ? 'rgba(255, 215, 0, 0.08)' : 'rgba(74, 158, 255, 0.03)')
                : (isSelected ? 'rgba(255, 215, 0, 0.18)' : 'rgba(74, 158, 255, 0.08)')
              }
              stroke={strokeColor}
              strokeWidth={1.5 / zoom2D}
              strokeLinejoin="round"
            />

            {showSeamAllowance && (piece.seamAllowance > 0 || defaultSeamAllowanceWidth > 0) && (
              <path
                d={pathToSVG(generateSeamAllowance(piece.outline, piece.seamAllowance || defaultSeamAllowanceWidth))}
                fill="none"
                stroke="rgba(74, 158, 255, 0.4)"
                strokeWidth={0.8 / zoom2D}
                strokeDasharray={`${4 / zoom2D} ${3 / zoom2D}`}
              />
            )}

            {piece.internals.map(line => {
              const isNotch = line.type === 'notch';
              const hasFill = isNotch && line.notchOptions?.shape === 'diamond';
              const isLineSelected = selectedInternalLine?.pieceId === piece.id && selectedInternalLine?.lineId === line.id;
              return (
                <g key={line.id}>
                  <path
                    d={pathToSVG(line.path)}
                    fill={hasFill ? 'rgba(255, 152, 0, 0.3)' : 'none'}
                    stroke={
                      isLineSelected ? '#ffd700' :
                      line.type === 'grainline' ? '#6bff6b' :
                      line.type === 'dart' ? '#ff9800' :
                      line.type === 'notch' ? '#ff9800' :
                      line.type === 'fold' ? '#9c27b0' :
                      line.type === 'topstitch' ? (line.topstitchOptions?.threadColor ?? '#333') :
                      '#888'
                    }
                    strokeWidth={isLineSelected ? 2 / zoom2D : 0.8 / zoom2D}
                    strokeDasharray={
                      line.type === 'fold' ? `${5 / zoom2D} ${3 / zoom2D}` :
                      line.type === 'topstitch' ? `${(line.topstitchOptions?.stitchLength ?? 3) / zoom2D} ${1.5 / zoom2D}` :
                      'none'
                    }
                    opacity={line.type === 'grainline' && !showGrainlines ? 0 : isLineSelected ? 1 : 0.7}
                  />
                  {isLineSelected && (() => {
                    // Show draggable endpoints
                    const first = line.path[0];
                    const last = line.path[line.path.length - 1];
                    const points: { x: number; y: number }[] = [];
                    if (first?.type === 'M' && first.values.length >= 2) {
                      points.push({ x: first.values[0], y: first.values[1] });
                    }
                    if (last?.type === 'L' && last.values.length >= 2) {
                      points.push({ x: last.values[0], y: last.values[1] });
                    } else if (last?.type === 'C' && last.values.length >= 6) {
                      points.push({ x: last.values[4], y: last.values[5] });
                    } else if (last?.type === 'Q' && last.values.length >= 4) {
                      points.push({ x: last.values[2], y: last.values[3] });
                    }
                    return (
                      <g className="internal-line-endpoints">
                        {points.map((pt, i) => (
                          <circle
                            key={i}
                            cx={pt.x}
                            cy={pt.y}
                            r={3.5 / zoom2D}
                            fill="rgba(255, 215, 0, 0.7)"
                            stroke="#ffd700"
                            strokeWidth={1 / zoom2D}
                            style={{ cursor: 'move' }}
                            pointerEvents="none"
                          />
                        ))}
                      </g>
                    );
                  })()}
                </g>
              );
            })}

            {showPieceNames && (() => {
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
              const isEditing = editingPieceNameId === piece.id;
              
              if (isEditing) {
                // Inline editing mode - use foreignObject with HTML input
                return (
                  <foreignObject
                    x={cx - 50 / zoom2D} // Half-width of input (approximate)
                    y={cy - 8 / zoom2D}  // Half-height of input
                    width={100 / zoom2D}
                    height={16 / zoom2D}
                    transform={`rotate(${-piece.rotation}, ${cx}, ${cy})`}
                  >
                    <input
                      type="text"
                      defaultValue={piece.name}
                      autoFocus
                      style={{
                        width: '100%',
                        height: '100%',
                        background: 'transparent',
                        border: 'none',
                        outline: 'none',
                        fontSize: `${11 / zoom2D}px`,
                        fontFamily: 'Inter, sans-serif',
                        color: '#555',
                        textAlign: 'center',
                        padding: 0,
                        margin: 0,
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          onPieceNameSave?.(piece.id, e.currentTarget.value);
                        } else if (e.key === 'Escape') {
                          onPieceNameCancel?.();
                        }
                      }}
                      onBlur={(e) => {
                        onPieceNameSave?.(piece.id, e.currentTarget.value);
                      }}
                      onFocus={(e) => {
                        e.currentTarget.select(); // Auto-select all text
                      }}
                      onClick={(e) => {
                        e.stopPropagation(); // Prevent canvas interactions
                      }}
                    />
                  </foreignObject>
                );
              } else {
                // Regular text mode
                return (
                  <text
                    x={cx}
                    y={cy}
                    fontSize={11 / zoom2D}
                    fill="#555"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    pointerEvents="auto"
                    fontFamily="Inter, sans-serif"
                    transform={`rotate(${-piece.rotation}, ${cx}, ${cy})`}
                    onDoubleClick={(e) => {
                      e.stopPropagation(); // Prevent propagation to canvas
                      onPieceNameDoubleClick?.(piece.id);
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    {piece.name}
                  </text>
                );
              }
            })()}

            {/* Anchor points for selected pieces */}
            {isSelected && (() => {
              const nodes = extractNodes(piece);
              return (
                <g className="anchor-points">
                  {nodes.map((node, i) => (
                    <circle
                      key={i}
                      cx={node.position.x}
                      cy={node.position.y}
                      r={3 / zoom2D}
                      fill="rgba(74, 158, 255, 0.6)"
                      stroke="#4a9eff"
                      strokeWidth={1 / zoom2D}
                      pointerEvents="none"
                    />
                  ))}
                </g>
              );
            })()}
          </g>
        );
      })}
    </>
  );
}
