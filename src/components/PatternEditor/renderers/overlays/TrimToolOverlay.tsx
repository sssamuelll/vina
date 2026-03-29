import type { TrimHover } from '../../useTrimTool';

interface TrimToolOverlayProps {
  zoom2D: number;
  hoveredEdge: TrimHover;
}

export default function TrimToolOverlay({ zoom2D, hoveredEdge }: TrimToolOverlayProps) {
  const r = 6 / zoom2D;
  const strokeW = 2 / zoom2D;

  return (
    <g className="trim-preview">
      {/* Snap dot */}
      <circle
        cx={hoveredEdge.point.x}
        cy={hoveredEdge.point.y}
        r={r * 0.6}
        fill="#ff9800"
        opacity={0.7}
      />
      {/* Ghost trim icon (dashed circle) */}
      <circle
        cx={hoveredEdge.point.x}
        cy={hoveredEdge.point.y}
        r={r}
        fill="none"
        stroke="#ff9800"
        strokeWidth={strokeW}
        strokeDasharray={`${3 / zoom2D} ${2 / zoom2D}`}
        opacity={0.5}
      />
    </g>
  );
}
