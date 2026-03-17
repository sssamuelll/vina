import type { FreeEdgeSelection } from '../../useFreeSewingTool';

interface FreeSewingOverlayProps {
  zoom2D: number;
  firstEdge: FreeEdgeSelection | null;
  hoveredEdge: FreeEdgeSelection | null;
  mode: 'free' | 'point';
}

export default function FreeSewingOverlay({ zoom2D, firstEdge, hoveredEdge, mode }: FreeSewingOverlayProps) {
  const dotR = 4 / zoom2D;

  return (
    <g className="free-sewing-tool-wip">
      {/* First selected edge: highlighted green segment + endpoint dots */}
      {firstEdge && (
        <>
          <line
            x1={firstEdge.start.x} y1={firstEdge.start.y}
            x2={firstEdge.end.x} y2={firstEdge.end.y}
            stroke="#2ecc71"
            strokeWidth={3 / zoom2D}
            strokeLinecap="round"
          />
          <circle cx={firstEdge.start.x} cy={firstEdge.start.y} r={dotR} fill="#2ecc71" />
          <circle cx={firstEdge.end.x} cy={firstEdge.end.y} r={dotR} fill="#2ecc71" />
        </>
      )}

      {/* Hovered edge: blue if first exists, green otherwise */}
      {hoveredEdge && (
        <>
          <line
            x1={hoveredEdge.start.x} y1={hoveredEdge.start.y}
            x2={hoveredEdge.end.x} y2={hoveredEdge.end.y}
            stroke={firstEdge ? '#3498db' : '#2ecc71'}
            strokeWidth={2.5 / zoom2D}
            strokeLinecap="round"
            opacity={0.7}
          />
          {mode === 'point' && (
            <>
              <circle cx={hoveredEdge.start.x} cy={hoveredEdge.start.y} r={dotR} fill={firstEdge ? '#3498db' : '#2ecc71'} opacity={0.7} />
              <circle cx={hoveredEdge.end.x} cy={hoveredEdge.end.y} r={dotR} fill={firstEdge ? '#3498db' : '#2ecc71'} opacity={0.7} />
            </>
          )}
        </>
      )}

      {/* Connection line between midpoints when hovering different piece */}
      {firstEdge && hoveredEdge && firstEdge.pieceId !== hoveredEdge.pieceId && (
        <line
          x1={firstEdge.midpoint.x} y1={firstEdge.midpoint.y}
          x2={hoveredEdge.midpoint.x} y2={hoveredEdge.midpoint.y}
          stroke="#2ecc71"
          strokeWidth={1 / zoom2D}
          strokeDasharray={`${4 / zoom2D} ${3 / zoom2D}`}
          opacity={0.5}
        />
      )}
    </g>
  );
}
