import { Point2D } from '../../../types/types';
import { computeGridTiers } from './gridTiers';

interface GridLayerProps {
  zoom2D: number;
  pan2D: Point2D;
  gridSize: number;
}

/**
 * Paper background + zoom-aware grid for the 2D canvas (design surface 5).
 *
 * Rendered OUTSIDE the scaled content group (screen space): grid lines stay 1px
 * crisp at any zoom without dividing strokeWidth by zoom. Three cadence tiers
 * (major 10cm always on, minor 1cm fades out when zoomed out, 5mm sub-grid
 * appears when zoomed in) come from the pure computeGridTiers() helper. Colors
 * are CSS tokens applied via `style` (SVG presentation attributes can't read
 * var()).
 */
export default function GridLayer({ zoom2D, pan2D, gridSize }: GridLayerProps) {
  const tiers = computeGridTiers(gridSize, zoom2D).filter(t => t.opacity > 0 && t.spacingPx >= 2);

  return (
    <>
      <defs>
        {tiers.map(tier => (
          <pattern
            key={tier.key}
            id={`grid-${tier.key}`}
            width={tier.spacingPx}
            height={tier.spacingPx}
            patternUnits="userSpaceOnUse"
            x={pan2D.x % tier.spacingPx}
            y={pan2D.y % tier.spacingPx}
          >
            <path
              d={`M ${tier.spacingPx} 0 L 0 0 0 ${tier.spacingPx}`}
              fill="none"
              style={{ stroke: `var(${tier.colorVar})` }}
              strokeWidth={tier.strokeWidth}
              opacity={tier.opacity}
            />
          </pattern>
        ))}
      </defs>

      {/* Paper surface */}
      <rect width="100%" height="100%" style={{ fill: 'var(--canvas-2d)' }} />
      {tiers.map(tier => (
        <rect key={tier.key} width="100%" height="100%" fill={`url(#grid-${tier.key})`} />
      ))}

      {/* Origin marker (0,0) */}
      <g style={{ stroke: 'var(--ink-on-light-2)' }} opacity={0.55}>
        <line x1={pan2D.x} y1={pan2D.y - 14} x2={pan2D.x} y2={pan2D.y + 14} strokeWidth="1" />
        <line x1={pan2D.x - 14} y1={pan2D.y} x2={pan2D.x + 14} y2={pan2D.y} strokeWidth="1" />
        <circle cx={pan2D.x} cy={pan2D.y} r={2.5} fill="none" strokeWidth="1" />
      </g>
    </>
  );
}
