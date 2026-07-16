import { Point2D, UnitSystem } from '../../../../types/types';
import { formatDimension } from '../../../../utils/units';

interface LineToolOverlayProps {
  zoom2D: number;
  units: string;
  lineStart: Point2D;
  lineCursor: Point2D | null;
  lineLength: { length: number; midpoint: Point2D } | null;
}

export default function LineToolOverlay({ zoom2D, units, lineStart, lineCursor, lineLength }: LineToolOverlayProps) {
  return (
    <>
      <g>
        <circle cx={lineStart.x} cy={lineStart.y} r={4 / zoom2D} fill="#4a9eff" />
        {lineCursor && (
          <line
            x1={lineStart.x} y1={lineStart.y}
            x2={lineCursor.x} y2={lineCursor.y}
            stroke="#4a9eff"
            strokeWidth={1.5 / zoom2D}
            strokeDasharray={`${4 / zoom2D}`}
          />
        )}
      </g>

      {lineLength && (
        <g transform={`translate(${lineLength.midpoint.x}, ${lineLength.midpoint.y})`}>
          <rect
            x={-25 / zoom2D} y={-8 / zoom2D}
            width={50 / zoom2D} height={16 / zoom2D}
            rx={8 / zoom2D} fill="rgba(0,0,0,0.75)"
          />
          <text
            textAnchor="middle" dominantBaseline="central"
            fill="#fff" fontSize={10 / zoom2D} pointerEvents="none"
          >
            {formatDimension(lineLength.length, units as UnitSystem)}
          </text>
        </g>
      )}
    </>
  );
}
