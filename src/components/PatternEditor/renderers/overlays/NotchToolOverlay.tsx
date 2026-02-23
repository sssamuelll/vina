import { Point2D } from '../../../../types/types';

interface NotchHover {
  point: Point2D;
  normal: Point2D;
}

interface NotchToolOverlayProps {
  zoom2D: number;
  notchHoveredPoint: NotchHover;
}

export default function NotchToolOverlay({ zoom2D, notchHoveredPoint }: NotchToolOverlayProps) {
  return (
    <g className="notch-preview">
      <line
        x1={notchHoveredPoint.point.x - notchHoveredPoint.normal.x * 4}
        y1={notchHoveredPoint.point.y - notchHoveredPoint.normal.y * 4}
        x2={notchHoveredPoint.point.x + notchHoveredPoint.normal.x * 8}
        y2={notchHoveredPoint.point.y + notchHoveredPoint.normal.y * 8}
        stroke="#ff9800"
        strokeWidth={2 / zoom2D}
        strokeLinecap="round"
        opacity={0.7}
      />
      <circle
        cx={notchHoveredPoint.point.x}
        cy={notchHoveredPoint.point.y}
        r={3 / zoom2D}
        fill="#ff9800"
        opacity={0.5}
      />
    </g>
  );
}
