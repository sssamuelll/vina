import { useRef, useEffect, useState, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../store';
import { PatternPiece, PathCommand, Point2D } from '../../types/types';
import './PatternEditor.css';

/** Convert pattern piece outline to SVG path string */
function pathToSVG(commands: PathCommand[]): string {
  return commands.map(c => `${c.type}${c.values.join(',')}`).join(' ');
}

export default function PatternEditor() {
  const svgRef = useRef<SVGSVGElement>(null);
  const dispatch = useDispatch();
  const { pieces } = useSelector((s: RootState) => s.project);
  const { activeTool, zoom2D, pan2D, showSeamAllowance, showGrainlines, snapToGrid, gridSize } =
    useSelector((s: RootState) => s.editor);
  const selectedPieceIds = useSelector((s: RootState) => s.editor.selectedPieceIds);

  // Grid rendering
  const gridSpacing = gridSize * zoom2D;

  return (
    <div className="pattern-editor">
      <svg
        ref={svgRef}
        className="pattern-svg"
        width="100%"
        height="100%"
      >
        {/* Grid */}
        <defs>
          <pattern
            id="grid-small"
            width={gridSpacing}
            height={gridSpacing}
            patternUnits="userSpaceOnUse"
            x={pan2D.x % gridSpacing}
            y={pan2D.y % gridSpacing}
          >
            <path
              d={`M ${gridSpacing} 0 L 0 0 0 ${gridSpacing}`}
              fill="none"
              stroke="rgba(0,0,0,0.08)"
              strokeWidth="0.5"
            />
          </pattern>
          <pattern
            id="grid-large"
            width={gridSpacing * 10}
            height={gridSpacing * 10}
            patternUnits="userSpaceOnUse"
            x={pan2D.x % (gridSpacing * 10)}
            y={pan2D.y % (gridSpacing * 10)}
          >
            <path
              d={`M ${gridSpacing * 10} 0 L 0 0 0 ${gridSpacing * 10}`}
              fill="none"
              stroke="rgba(0,0,0,0.15)"
              strokeWidth="1"
            />
          </pattern>
        </defs>

        <rect width="100%" height="100%" fill="url(#grid-small)" />
        <rect width="100%" height="100%" fill="url(#grid-large)" />

        {/* Transform group (pan + zoom) */}
        <g transform={`translate(${pan2D.x}, ${pan2D.y}) scale(${zoom2D})`}>
          {/* Pattern pieces */}
          {pieces.map(piece => (
            <g
              key={piece.id}
              transform={`translate(${piece.position.x}, ${piece.position.y}) rotate(${piece.rotation})`}
              className={`pattern-piece ${selectedPieceIds.includes(piece.id) ? 'selected' : ''}`}
            >
              {/* Main outline */}
              <path
                d={pathToSVG(piece.outline)}
                fill="rgba(74, 158, 255, 0.1)"
                stroke={selectedPieceIds.includes(piece.id) ? 'var(--selected)' : 'var(--accent)'}
                strokeWidth={1.5 / zoom2D}
              />

              {/* Seam allowance */}
              {showSeamAllowance && piece.seamAllowance > 0 && (
                <path
                  d={pathToSVG(piece.outline)}
                  fill="none"
                  stroke="rgba(74, 158, 255, 0.3)"
                  strokeWidth={1 / zoom2D}
                  strokeDasharray={`${4 / zoom2D} ${3 / zoom2D}`}
                  transform={`scale(${1 + piece.seamAllowance / 100})`}
                />
              )}

              {/* Internal lines */}
              {piece.internals.map(line => (
                <path
                  key={line.id}
                  d={pathToSVG(line.path)}
                  fill="none"
                  stroke={
                    line.type === 'grainline' ? 'var(--grainline-color)' :
                    line.type === 'dart' ? '#ff9800' :
                    'var(--text-muted)'
                  }
                  strokeWidth={1 / zoom2D}
                  strokeDasharray={line.type === 'fold' ? `${6 / zoom2D} ${3 / zoom2D}` : 'none'}
                  opacity={line.type === 'grainline' && !showGrainlines ? 0 : 1}
                />
              ))}

              {/* Piece label */}
              <text
                x={piece.position.x}
                y={piece.position.y}
                fontSize={12 / zoom2D}
                fill="#333"
                textAnchor="middle"
                dominantBaseline="middle"
                pointerEvents="none"
              >
                {piece.name}
              </text>
            </g>
          ))}
        </g>

        {/* Empty state */}
        {pieces.length === 0 && (
          <text
            x="50%"
            y="50%"
            textAnchor="middle"
            dominantBaseline="middle"
            fill="rgba(0,0,0,0.25)"
            fontSize="16"
          >
            Draw or import pattern pieces
          </text>
        )}
      </svg>
    </div>
  );
}
