import { Point2D } from '../../../types/types';

interface GridLayerProps {
  zoom2D: number;
  pan2D: Point2D;
  gridSize: number;
}

export default function GridLayer({ zoom2D, pan2D, gridSize }: GridLayerProps) {
  const gridSpacing = gridSize * zoom2D;

  return (
    <>
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
            stroke="rgba(0,0,0,0.06)"
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
            stroke="rgba(0,0,0,0.12)"
            strokeWidth="1"
          />
        </pattern>
      </defs>

      <rect width="100%" height="100%" fill="url(#grid-small)" />
      <rect width="100%" height="100%" fill="url(#grid-large)" />

      {/* Origin crosshair */}
      <line
        x1={pan2D.x} y1={pan2D.y - 20}
        x2={pan2D.x} y2={pan2D.y + 20}
        stroke="rgba(0,0,0,0.2)" strokeWidth="1"
      />
      <line
        x1={pan2D.x - 20} y1={pan2D.y}
        x2={pan2D.x + 20} y2={pan2D.y}
        stroke="rgba(0,0,0,0.2)" strokeWidth="1"
      />
    </>
  );
}
