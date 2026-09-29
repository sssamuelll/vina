/**
 * ConstructionOverlay — renders construction points, lines, and curves
 * aligned to their corresponding pattern pieces in local coordinates.
 *
 * For manual construction (no pieces yet), falls back to absolute rendering.
 */

import { useSelector } from 'react-redux';
import { RootState } from '../../../store';
import type { PatternPiece } from '../../../types/types';
import type { CPoint, CCurve } from '../../../types/construction';

const COLORS = {
  point: '#ff6b35',
  pointSelected: '#ff3366',
  line: '#4ecdc4',
  curve: '#a855f7',
  label: '#ff6b35',
  pieceOutline: '#22d3ee',
};

interface ConstructionOverlayProps {
  zoom2D: number;
  pieces?: PatternPiece[];
}

export default function ConstructionOverlay({ zoom2D, pieces }: ConstructionOverlayProps) {
  const construction = useSelector((s: RootState) => s.construction);
  const { points, curves, showConstruction, selectedEntity } = construction;

  if (!showConstruction || points.length === 0) return null;

  const pointSize = Math.max(3, 4 / zoom2D);
  const strokeWidth = Math.max(0.5, 1 / zoom2D);
  const fontSize = Math.max(8, 11 / zoom2D);

  // If we have construction pieces with blockIds, render per-piece
  const cPieces = construction.pieces;
  const hasBlockIds = cPieces.some(cp => cp.blockId);

  if (hasBlockIds && pieces && pieces.length > 0) {
    return (
      <g className="construction-overlay">
        {cPieces.map(cPiece => {
          // Find matching PatternPiece
          const patternPiece = pieces.find(p => p.constructionPieceId === cPiece.id);
          if (!patternPiece) return null;

          // Get points and curves for this block
          const blockPoints = points.filter(p => p.blockId === cPiece.blockId);
          const blockCurves = curves.filter(c => c.blockId === cPiece.blockId);

          // Build lookup
          const ptMap = new Map<string, CPoint>();
          for (const p of blockPoints) { ptMap.set(p.id, p); ptMap.set(p.label, p); }

          return (
            <g
              key={cPiece.id}
              transform={`translate(${patternPiece.position.x}, ${patternPiece.position.y})`}
            >
              {/* Curves */}
              {renderCurves(blockCurves, ptMap, 0, 0, strokeWidth)}

              {/* Points */}
              {blockPoints.filter(p => p.visible).map(point => (
                <g key={point.id}>
                  <circle
                    cx={point.x} cy={point.y}
                    r={pointSize}
                    fill={selectedEntity?.id === point.id ? COLORS.pointSelected : COLORS.point}
                    stroke="#fff"
                    strokeWidth={strokeWidth * 0.5}
                  />
                  <text
                    x={point.x + pointSize + 3 / zoom2D}
                    y={point.y - pointSize}
                    fontSize={fontSize}
                    fill={COLORS.label}
                    fontFamily="var(--font-mono-2d)"
                  >
                    {point.label}
                  </text>
                </g>
              ))}
            </g>
          );
        })}
      </g>
    );
  }

  // Fallback: absolute rendering for manual construction (no blocks)
  const ptMap = new Map<string, CPoint>();
  for (const p of points) { ptMap.set(p.id, p); ptMap.set(p.label, p); }

  return (
    <g className="construction-overlay">
      {renderCurves(curves, ptMap, 0, 0, strokeWidth)}

      {points.filter(p => p.visible).map(point => (
        <g key={point.id}>
          <circle
            cx={point.x} cy={point.y}
            r={pointSize}
            fill={selectedEntity?.id === point.id ? COLORS.pointSelected : COLORS.point}
            stroke="#fff"
            strokeWidth={strokeWidth * 0.5}
          />
          <text
            x={point.x + pointSize + 3 / zoom2D}
            y={point.y - pointSize}
            fontSize={fontSize}
            fill={COLORS.label}
            fontFamily="var(--font-mono-2d)"
          >
            {point.label}
          </text>
        </g>
      ))}
    </g>
  );
}

function renderCurves(
  curves: CCurve[],
  ptMap: Map<string, CPoint>,
  offsetX: number, offsetY: number,
  strokeWidth: number,
) {
  return curves.filter(c => c.visible).map(curve => {
    const def = curve.definition;
    if (def.type === 'spline') {
      const from = ptMap.get(def.from);
      const to = ptMap.get(def.to);
      if (!from || !to) return null;
      const a1 = typeof def.angle1 === 'number' ? def.angle1 : 0;
      const a2 = typeof def.angle2 === 'number' ? def.angle2 : 0;
      const l1 = typeof def.length1 === 'number' ? def.length1 : 50;
      const l2 = typeof def.length2 === 'number' ? def.length2 : 50;
      const rad1 = (a1 * Math.PI) / 180;
      const rad2 = ((a2 + 180) * Math.PI) / 180;
      const fx = from.x - offsetX, fy = from.y - offsetY;
      const tx = to.x - offsetX, ty = to.y - offsetY;
      const cp1x = fx + l1 * Math.cos(rad1);
      const cp1y = fy - l1 * Math.sin(rad1);
      const cp2x = tx + l2 * Math.cos(rad2);
      const cp2y = ty - l2 * Math.sin(rad2);
      return (
        <path
          key={curve.id}
          d={`M ${fx} ${fy} C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${tx} ${ty}`}
          stroke={COLORS.curve}
          strokeWidth={strokeWidth * 1.5}
          fill="none"
          opacity={0.8}
        />
      );
    }
    return null;
  });
}
