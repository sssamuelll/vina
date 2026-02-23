/**
 * ConstructionOverlay — renders construction points, lines, and curves
 * on the 2D pattern canvas.
 * 
 * Points are shown as labeled dots. Lines as dashed/solid paths.
 * Curves as bezier paths. All in a distinct construction color.
 */

import { useSelector } from 'react-redux';
import { RootState } from '../../../store';

const COLORS = {
  point: '#ff6b35',       // orange
  pointSelected: '#ff3366', // pink
  line: '#4ecdc4',        // teal
  curve: '#a855f7',       // purple
  label: '#ff6b35',
  pieceOutline: '#22d3ee', // cyan
};

export default function ConstructionOverlay({ zoom2D }: { zoom2D: number }) {
  const { points, lines, curves, pieces, showConstruction, selectedEntity } =
    useSelector((s: RootState) => s.construction);

  if (!showConstruction || (points.length === 0 && lines.length === 0)) return null;

  const pointSize = Math.max(3, 4 / zoom2D);
  const strokeWidth = Math.max(0.5, 1 / zoom2D);
  const fontSize = Math.max(8, 11 / zoom2D);

  // Build a quick lookup for point positions
  const ptMap = new Map(points.map(p => [p.id, p]));
  // Also by label
  for (const p of points) ptMap.set(p.label, p);

  return (
    <g className="construction-overlay">
      {/* Lines */}
      {lines.filter(l => l.visible).map(line => {
        const from = ptMap.get(line.from);
        const to = ptMap.get(line.to);
        if (!from || !to) return null;
        return (
          <line
            key={line.id}
            x1={from.x} y1={from.y}
            x2={to.x} y2={to.y}
            stroke={COLORS.line}
            strokeWidth={strokeWidth}
            strokeDasharray={line.style === 'dashed' ? `${6 / zoom2D} ${4 / zoom2D}` :
                             line.style === 'construction' ? `${3 / zoom2D} ${3 / zoom2D}` : 'none'}
            opacity={0.7}
          />
        );
      })}

      {/* Curves */}
      {curves.filter(c => c.visible).map(curve => {
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
          const cp1x = from.x + l1 * Math.cos(rad1);
          const cp1y = from.y - l1 * Math.sin(rad1);
          const cp2x = to.x + l2 * Math.cos(rad2);
          const cp2y = to.y - l2 * Math.sin(rad2);
          return (
            <path
              key={curve.id}
              d={`M ${from.x} ${from.y} C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${to.x} ${to.y}`}
              stroke={COLORS.curve}
              strokeWidth={strokeWidth * 1.5}
              fill="none"
              opacity={0.8}
            />
          );
        }
        return null;
      })}

      {/* Construction piece outlines (preview) */}
      {pieces.map(piece => {
        const pathParts: string[] = [];
        for (let i = 0; i < piece.nodes.length; i++) {
          const node = piece.nodes[i];
          const pt = ptMap.get(node.pointId);
          if (!pt) continue;
          if (i === 0) pathParts.push(`M ${pt.x} ${pt.y}`);
          else pathParts.push(`L ${pt.x} ${pt.y}`);
        }
        if (piece.closed) pathParts.push('Z');
        if (pathParts.length < 2) return null;
        return (
          <path
            key={piece.id}
            d={pathParts.join(' ')}
            stroke={COLORS.pieceOutline}
            strokeWidth={strokeWidth * 2}
            strokeDasharray={`${8 / zoom2D} ${4 / zoom2D}`}
            fill="none"
            opacity={0.6}
          />
        );
      })}

      {/* Points */}
      {points.filter(p => p.visible).map(point => {
        const isSelected = selectedEntity?.type === 'point' && selectedEntity.id === point.id;
        return (
          <g key={point.id}>
            <circle
              cx={point.x} cy={point.y}
              r={pointSize}
              fill={isSelected ? COLORS.pointSelected : COLORS.point}
              stroke="#fff"
              strokeWidth={strokeWidth * 0.5}
            />
            <text
              x={point.x + pointSize + 3 / zoom2D}
              y={point.y - pointSize}
              fontSize={fontSize}
              fill={COLORS.label}
              fontFamily="monospace"
              fontWeight={isSelected ? 'bold' : 'normal'}
            >
              {point.label}
            </text>
          </g>
        );
      })}
    </g>
  );
}
