import { Point2D, UnitSystem } from '../../../../types/types';
import { HANDLE_RADIUS, ANCHOR_RADIUS } from '../../utils';
import { formatDimension } from '../../../../utils/units';

interface PenNode {
  anchor: Point2D;
  handleIn: Point2D | null;
  handleOut: Point2D | null;
}

interface PenToolOverlayProps {
  zoom2D: number;
  units: string;
  penNodes: PenNode[];
  previewPath: string;
  guidePath: string | null;
  penDistance: { distance: number; position: Point2D } | null;
}

export default function PenToolOverlay({ zoom2D, units, penNodes, previewPath, guidePath, penDistance }: PenToolOverlayProps) {
  return (
    <>
      {penNodes.length > 0 && (
        <g className="pen-wip">
          <path
            d={previewPath}
            fill="none"
            stroke="#4a9eff"
            strokeWidth={1.5 / zoom2D}
            strokeLinejoin="round"
          />
          {guidePath && (
            <path
              d={guidePath}
              fill="none"
              stroke="rgba(74, 158, 255, 0.4)"
              strokeWidth={1 / zoom2D}
              strokeDasharray={`${4 / zoom2D} ${3 / zoom2D}`}
            />
          )}
          {penNodes.map((node, i) => (
            <g key={i}>
              {node.handleIn && (
                <>
                  <line
                    x1={node.anchor.x} y1={node.anchor.y}
                    x2={node.handleIn.x} y2={node.handleIn.y}
                    stroke="rgba(255, 107, 107, 0.6)"
                    strokeWidth={0.8 / zoom2D}
                  />
                  <circle
                    cx={node.handleIn.x} cy={node.handleIn.y}
                    r={HANDLE_RADIUS / zoom2D}
                    fill="#ff6b6b"
                    stroke="#fff"
                    strokeWidth={0.8 / zoom2D}
                  />
                </>
              )}
              {node.handleOut && (
                <>
                  <line
                    x1={node.anchor.x} y1={node.anchor.y}
                    x2={node.handleOut.x} y2={node.handleOut.y}
                    stroke="rgba(255, 107, 107, 0.6)"
                    strokeWidth={0.8 / zoom2D}
                  />
                  <circle
                    cx={node.handleOut.x} cy={node.handleOut.y}
                    r={HANDLE_RADIUS / zoom2D}
                    fill="#ff6b6b"
                    stroke="#fff"
                    strokeWidth={0.8 / zoom2D}
                  />
                </>
              )}
              <circle
                cx={node.anchor.x} cy={node.anchor.y}
                r={ANCHOR_RADIUS / zoom2D}
                fill={i === 0 ? '#ffd700' : '#4a9eff'}
                stroke="#fff"
                strokeWidth={1 / zoom2D}
              />
            </g>
          ))}
          {penNodes.length > 2 && penNodes[0] && (
            <circle
              cx={penNodes[0].anchor.x}
              cy={penNodes[0].anchor.y}
              r={HANDLE_RADIUS * 3 / zoom2D}
              fill="none"
              stroke="rgba(255, 215, 0, 0.3)"
              strokeWidth={1 / zoom2D}
              pointerEvents="none"
            />
          )}
        </g>
      )}

      {penDistance && (
        <g transform={`translate(${penDistance.position.x}, ${penDistance.position.y})`}>
          <rect
            x={-25 / zoom2D} y={-8 / zoom2D}
            width={50 / zoom2D} height={16 / zoom2D}
            rx={8 / zoom2D} fill="rgba(0,0,0,0.75)"
          />
          <text
            textAnchor="middle" dominantBaseline="central"
            fill="#fff" fontSize={10 / zoom2D}
            fontFamily="Inter, sans-serif" pointerEvents="none"
          >
            {formatDimension(penDistance.distance, units as UnitSystem)}
          </text>
        </g>
      )}
    </>
  );
}
