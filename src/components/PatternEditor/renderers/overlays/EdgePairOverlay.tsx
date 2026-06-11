import type { FreeEdgeSelection } from '../../sewingUtils';
import { SEWING_PICK_FIRST, SEWING_PICK_SECOND } from '../seamVisuals';

interface EdgePairOverlayProps {
  zoom2D: number;
  firstEdge: FreeEdgeSelection | null;
  hoveredEdge: FreeEdgeSelection | null;
  mode?: 'free' | 'point';
}

export default function EdgePairOverlay({ zoom2D, firstEdge, hoveredEdge, mode = 'free' }: EdgePairOverlayProps) {
  const dotR = 4 / zoom2D;

  return (
    <g className="edge-pair-overlay">
      {firstEdge && (
        <>
          <line
            x1={firstEdge.start.x} y1={firstEdge.start.y}
            x2={firstEdge.end.x} y2={firstEdge.end.y}
            stroke={SEWING_PICK_FIRST}
            strokeWidth={3 / zoom2D}
            strokeLinecap="round"
          />
          <circle cx={firstEdge.start.x} cy={firstEdge.start.y} r={dotR} fill={SEWING_PICK_FIRST} />
          <circle cx={firstEdge.end.x} cy={firstEdge.end.y} r={dotR} fill={SEWING_PICK_FIRST} />
        </>
      )}

      {hoveredEdge && (
        <>
          <line
            x1={hoveredEdge.start.x} y1={hoveredEdge.start.y}
            x2={hoveredEdge.end.x} y2={hoveredEdge.end.y}
            stroke={firstEdge ? SEWING_PICK_SECOND : SEWING_PICK_FIRST}
            strokeWidth={2.5 / zoom2D}
            strokeLinecap="round"
            opacity={0.7}
          />
          {mode === 'point' && (
            <>
              <circle cx={hoveredEdge.start.x} cy={hoveredEdge.start.y} r={dotR} fill={firstEdge ? SEWING_PICK_SECOND : SEWING_PICK_FIRST} opacity={0.7} />
              <circle cx={hoveredEdge.end.x} cy={hoveredEdge.end.y} r={dotR} fill={firstEdge ? SEWING_PICK_SECOND : SEWING_PICK_FIRST} opacity={0.7} />
            </>
          )}
        </>
      )}

      {firstEdge && hoveredEdge && firstEdge.pieceId !== hoveredEdge.pieceId && (
        <line
          x1={firstEdge.midpoint.x} y1={firstEdge.midpoint.y}
          x2={hoveredEdge.midpoint.x} y2={hoveredEdge.midpoint.y}
          stroke={SEWING_PICK_FIRST}
          strokeWidth={1 / zoom2D}
          strokeDasharray={`${4 / zoom2D} ${3 / zoom2D}`}
          opacity={0.5}
        />
      )}
    </g>
  );
}
