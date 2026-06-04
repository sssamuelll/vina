import { Point2D, UnitSystem } from '../../../types/types';
import { generateRulerTicks } from './rulerTicks';

interface RulerLayerProps {
  zoom2D: number;
  pan2D: Point2D;
  gridSize: number;
  units: UnitSystem;
  /** Viewport size in px (measured from the SVG element). */
  width: number;
  height: number;
}

const GUTTER = 20;
const UNIT_SUFFIX: Record<UnitSystem, string> = { mm: 'mm', cm: 'cm', inches: 'in' };

/**
 * Top + left rulers with a labeled 0,0 origin (design surface 5, P0.4).
 *
 * Screen-space (outside the scaled content group), like GridLayer, so ticks and
 * labels stay crisp at any zoom. Ticks come from the pure generateRulerTicks()
 * helper (major every 10cm, minor every 1cm, minors dropped when crowded).
 * Purely visual — pointerEvents disabled; the unit toggle lives in LogoMenu ▸ View (Ruler radios).
 */
export default function RulerLayer({ zoom2D, pan2D, gridSize, units, width, height }: RulerLayerProps) {
  if (width <= 0 || height <= 0) return null;

  const topTicks = generateRulerTicks({ lengthPx: width, panPx: pan2D.x, zoom2D, gridSizeMm: gridSize, units })
    .filter(t => t.posPx >= GUTTER && t.posPx <= width);
  const leftTicks = generateRulerTicks({ lengthPx: height, panPx: pan2D.y, zoom2D, gridSizeMm: gridSize, units })
    .filter(t => t.posPx >= GUTTER && t.posPx <= height);

  const ink = 'var(--ink-on-light)';
  const ink2 = 'var(--ink-on-light-2)';
  const paper = 'var(--canvas-2d)';
  const mono = 'var(--font-mono-2d)';

  return (
    <g className="ruler-layer" pointerEvents="none">
      {/* Gutter backgrounds */}
      <rect x={0} y={0} width={width} height={GUTTER} style={{ fill: paper }} />
      <rect x={0} y={0} width={GUTTER} height={height} style={{ fill: paper }} />
      {/* Gutter base lines */}
      <line x1={0} y1={GUTTER} x2={width} y2={GUTTER} style={{ stroke: 'var(--grid-2d-major)' }} strokeWidth={1} />
      <line x1={GUTTER} y1={0} x2={GUTTER} y2={height} style={{ stroke: 'var(--grid-2d-major)' }} strokeWidth={1} />

      {/* Top ruler ticks + labels */}
      {topTicks.map(t => (
        <g key={`t-${t.vMm}`}>
          <line
            x1={t.posPx} y1={GUTTER} x2={t.posPx} y2={GUTTER - (t.isMajor ? 8 : 4)}
            style={{ stroke: ink2 }} strokeWidth={1}
          />
          {t.label !== null && (
            <text
              x={t.posPx + 2} y={9}
              style={{ fill: ink, fontFamily: mono }}
              fontSize={9}
              dominantBaseline="middle"
            >
              {t.label}
            </text>
          )}
        </g>
      ))}

      {/* Left ruler ticks + labels (labels rotated to read along the gutter) */}
      {leftTicks.map(t => (
        <g key={`l-${t.vMm}`}>
          <line
            x1={GUTTER} y1={t.posPx} x2={GUTTER - (t.isMajor ? 8 : 4)} y2={t.posPx}
            style={{ stroke: ink2 }} strokeWidth={1}
          />
          {t.label !== null && (
            <text
              x={9} y={t.posPx - 2}
              style={{ fill: ink, fontFamily: mono }}
              fontSize={9}
              textAnchor="middle"
              transform={`rotate(-90, 9, ${t.posPx - 2})`}
            >
              {t.label}
            </text>
          )}
        </g>
      ))}

      {/* Origin corner: unit chip */}
      <rect x={0} y={0} width={GUTTER} height={GUTTER} style={{ fill: paper }} />
      <line x1={0} y1={GUTTER} x2={GUTTER} y2={GUTTER} style={{ stroke: 'var(--grid-2d-major)' }} strokeWidth={1} />
      <line x1={GUTTER} y1={0} x2={GUTTER} y2={GUTTER} style={{ stroke: 'var(--grid-2d-major)' }} strokeWidth={1} />
      <text
        x={GUTTER / 2} y={GUTTER / 2}
        style={{ fill: ink2, fontFamily: mono }}
        fontSize={8}
        textAnchor="middle"
        dominantBaseline="middle"
      >
        {UNIT_SUFFIX[units]}
      </text>
    </g>
  );
}
