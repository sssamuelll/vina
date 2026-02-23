import { Point2D } from '../../../../types/types';

interface Measurement {
  id: string;
  startPoint: Point2D;
  endPoint: Point2D;
  distance: number;
}

interface MeasureToolOverlayProps {
  zoom2D: number;
  measurements: Measurement[];
  currentStart: Point2D | null;
  cursorPos: Point2D | null;
  formatDistance: (d: number) => string;
}

export default function MeasureToolOverlay({ zoom2D, measurements, currentStart, cursorPos, formatDistance }: MeasureToolOverlayProps) {
  return (
    <g className="measure-lines">
      {measurements.map(m => {
        const mx = (m.startPoint.x + m.endPoint.x) / 2;
        const my = (m.startPoint.y + m.endPoint.y) / 2;
        const label = formatDistance(m.distance);
        return (
          <g key={m.id}>
            <line
              x1={m.startPoint.x} y1={m.startPoint.y}
              x2={m.endPoint.x} y2={m.endPoint.y}
              stroke="#9c27b0" strokeWidth={1.5 / zoom2D}
              strokeDasharray={`${5 / zoom2D} ${3 / zoom2D}`}
            />
            <circle cx={m.startPoint.x} cy={m.startPoint.y} r={3 / zoom2D} fill="#9c27b0" />
            <circle cx={m.endPoint.x} cy={m.endPoint.y} r={3 / zoom2D} fill="#9c27b0" />
            <g transform={`translate(${mx}, ${my})`}>
              <rect
                x={-label.length * 3 / zoom2D} y={-7 / zoom2D}
                width={label.length * 6 / zoom2D} height={14 / zoom2D}
                rx={7 / zoom2D} fill="rgba(0,0,0,0.75)"
              />
              <text
                textAnchor="middle" dominantBaseline="central"
                fill="#fff" fontSize={10 / zoom2D}
                fontFamily="Inter, sans-serif" pointerEvents="none"
              >
                {label}
              </text>
            </g>
          </g>
        );
      })}
      {currentStart && cursorPos && (() => {
        const s = currentStart;
        const c = cursorPos;
        const d = Math.hypot(c.x - s.x, c.y - s.y);
        const label = formatDistance(d);
        const mx = (s.x + c.x) / 2;
        const my = (s.y + c.y) / 2;
        return (
          <>
            <line
              x1={s.x} y1={s.y} x2={c.x} y2={c.y}
              stroke="#9c27b0" strokeWidth={1 / zoom2D}
              strokeDasharray={`${4 / zoom2D} ${3 / zoom2D}`} opacity={0.6}
            />
            <circle cx={s.x} cy={s.y} r={3 / zoom2D} fill="#9c27b0" />
            <g transform={`translate(${mx}, ${my})`}>
              <rect
                x={-label.length * 3 / zoom2D} y={-7 / zoom2D}
                width={label.length * 6 / zoom2D} height={14 / zoom2D}
                rx={7 / zoom2D} fill="rgba(0,0,0,0.6)"
              />
              <text
                textAnchor="middle" dominantBaseline="central"
                fill="#fff" fontSize={10 / zoom2D}
                fontFamily="Inter, sans-serif" pointerEvents="none"
              >
                {label}
              </text>
            </g>
          </>
        );
      })()}
    </g>
  );
}
