import type { Point2D } from '../../../../types/types';
import type { Measurement, SelectedEdgeInfo, CurveComparison } from '../../useMeasureTool';

interface MeasureToolOverlayProps {
  zoom2D: number;
  measurements: Measurement[];
  currentStart: Point2D | null;
  cursorPos: Point2D | null;
  hoveredSnapPoint: Point2D | null;
  formatDistance: (d: number) => string;
  showAngle?: boolean;
  // Along-curve mode
  measureMode?: 'point-to-point' | 'along-curve' | 'compare';
  selectedEdge?: SelectedEdgeInfo | null;
  hoverDistance?: number | null;
  // Compare mode
  compareEdgeA?: SelectedEdgeInfo | null;
  compareEdgeB?: SelectedEdgeInfo | null;
  comparison?: CurveComparison | null;
}

function MeasurementLabel({ x, y, label, zoom2D, bold }: { x: number; y: number; label: string; zoom2D: number; bold?: boolean }) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <rect
        x={-label.length * 3 / zoom2D} y={-7 / zoom2D}
        width={label.length * 6 / zoom2D} height={14 / zoom2D}
        rx={7 / zoom2D} fill={bold ? 'rgba(123,31,162,0.85)' : 'rgba(0,0,0,0.75)'}
      />
      <text
        textAnchor="middle" dominantBaseline="central"
        fill="#fff" fontSize={10 / zoom2D}
        fontFamily="Inter, sans-serif" pointerEvents="none"
        fontWeight={bold ? 700 : 400}
      >
        {label}
      </text>
    </g>
  );
}

function AngleArc({ start, end, zoom2D }: { start: Point2D; end: Point2D; zoom2D: number }) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const angle = Math.atan2(dy, dx);
  const angleDeg = angle * (180 / Math.PI);
  const r = 15 / zoom2D;

  const arcEnd = {
    x: start.x + r * Math.cos(angle),
    y: start.y + r * Math.sin(angle),
  };
  const horizontal = { x: start.x + r, y: start.y };
  const sweep = angleDeg >= 0 ? 1 : 0;
  const largeArc = Math.abs(angleDeg) > 180 ? 1 : 0;

  const label = `${Math.abs(angleDeg).toFixed(1)}°`;
  const labelAngle = angle / 2;
  const labelR = r + 8 / zoom2D;
  const labelPos = {
    x: start.x + labelR * Math.cos(labelAngle),
    y: start.y + labelR * Math.sin(labelAngle),
  };

  return (
    <g opacity={0.6}>
      <line x1={start.x} y1={start.y} x2={horizontal.x} y2={horizontal.y}
        stroke="#9c27b0" strokeWidth={0.5 / zoom2D} strokeDasharray={`${2 / zoom2D}`} />
      <path
        d={`M ${horizontal.x} ${horizontal.y} A ${r} ${r} 0 ${largeArc} ${sweep} ${arcEnd.x} ${arcEnd.y}`}
        fill="none" stroke="#9c27b0" strokeWidth={1 / zoom2D}
      />
      <text
        x={labelPos.x} y={labelPos.y}
        textAnchor="middle" dominantBaseline="central"
        fill="#9c27b0" fontSize={8 / zoom2D}
        fontFamily="Inter, sans-serif" pointerEvents="none"
      >
        {label}
      </text>
    </g>
  );
}

function EdgeHighlight({ edge, zoom2D, formatDistance }: {
  edge: SelectedEdgeInfo; zoom2D: number; formatDistance: (d: number) => string;
}) {
  const points = edge.pathPoints;
  if (points.length < 2) return null;
  const d = points.map(p => `${p.x},${p.y}`).join(' ');

  return (
    <g>
      <polyline points={d} fill="none" stroke="#9c27b0" strokeWidth={3 / zoom2D} opacity={0.7} />
      {edge.markers.map((m, i) => {
        const wx = m.point.x + edge.piece.position.x;
        const wy = m.point.y + edge.piece.position.y;
        return (
          <g key={i} transform={`translate(${wx}, ${wy})`}>
            <circle r={2.5 / zoom2D} fill="#9c27b0" />
            {i > 0 && (
              <MeasurementLabel
                x={0} y={-10 / zoom2D}
                label={formatDistance(m.distance)} zoom2D={zoom2D}
              />
            )}
          </g>
        );
      })}
      {points.length > 1 && (() => {
        const mid = points[Math.floor(points.length / 2)];
        return (
          <MeasurementLabel
            x={mid.x} y={mid.y - 16 / zoom2D}
            label={`Total: ${formatDistance(edge.arcLength)}`}
            zoom2D={zoom2D} bold
          />
        );
      })()}
    </g>
  );
}

function WalkDot({ edge, zoom2D }: { edge: SelectedEdgeInfo; zoom2D: number }) {
  const points = edge.walkPoints;
  if (points.length < 2) return null;

  return (
    <circle r={4 / zoom2D} fill="#9c27b0" opacity={0.9}>
      <animateMotion
        dur="3s"
        repeatCount="indefinite"
        path={`M ${points.map(p => `${p.x} ${p.y}`).join(' L ')}`}
      />
    </circle>
  );
}

function CompareVisualization({ comparison, zoom2D, formatDistance }: {
  comparison: CurveComparison; zoom2D: number; formatDistance: (d: number) => string;
}) {
  const { edgeA, edgeB, delta, easePercent } = comparison;
  return (
    <g>
      <EdgeHighlight edge={edgeA} zoom2D={zoom2D} formatDistance={formatDistance} />
      <EdgeHighlight edge={edgeB} zoom2D={zoom2D} formatDistance={formatDistance} />
      {edgeA.pathPoints.length > 0 && edgeB.pathPoints.length > 0 && (() => {
        const midA = edgeA.pathPoints[Math.floor(edgeA.pathPoints.length / 2)];
        const midB = edgeB.pathPoints[Math.floor(edgeB.pathPoints.length / 2)];
        const mx = (midA.x + midB.x) / 2;
        const my = (midA.y + midB.y) / 2;
        const sign = delta >= 0 ? '+' : '';
        return (
          <MeasurementLabel
            x={mx} y={my}
            label={`Δ ${sign}${formatDistance(delta)} (${easePercent.toFixed(1)}%)`}
            zoom2D={zoom2D} bold
          />
        );
      })()}
    </g>
  );
}

export default function MeasureToolOverlay({
  zoom2D, measurements, currentStart, cursorPos,
  hoveredSnapPoint, formatDistance, showAngle,
  measureMode, selectedEdge, hoverDistance,
  compareEdgeA, comparison,
}: MeasureToolOverlayProps) {
  return (
    <g className="measure-lines">
      {hoveredSnapPoint && (
        <circle
          cx={hoveredSnapPoint.x} cy={hoveredSnapPoint.y}
          r={4 / zoom2D} fill="#9c27b0" opacity={0.5}
        />
      )}

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
            <MeasurementLabel x={mx} y={my} label={label} zoom2D={zoom2D} />
            {showAngle && <AngleArc start={m.startPoint} end={m.endPoint} zoom2D={zoom2D} />}
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
            <MeasurementLabel x={mx} y={my} label={label} zoom2D={zoom2D} />
            {showAngle && <AngleArc start={s} end={c} zoom2D={zoom2D} />}
          </>
        );
      })()}

      {/* Along-curve mode */}
      {measureMode === 'along-curve' && selectedEdge && (
        <>
          <EdgeHighlight edge={selectedEdge} zoom2D={zoom2D} formatDistance={formatDistance} />
          <WalkDot edge={selectedEdge} zoom2D={zoom2D} />
          {hoverDistance != null && cursorPos && (
            <MeasurementLabel
              x={cursorPos.x} y={cursorPos.y - 14 / zoom2D}
              label={formatDistance(hoverDistance)} zoom2D={zoom2D}
            />
          )}
        </>
      )}

      {/* Compare mode */}
      {measureMode === 'compare' && comparison && (
        <CompareVisualization comparison={comparison} zoom2D={zoom2D} formatDistance={formatDistance} />
      )}
      {measureMode === 'compare' && !comparison && compareEdgeA && (
        <EdgeHighlight edge={compareEdgeA} zoom2D={zoom2D} formatDistance={formatDistance} />
      )}
    </g>
  );
}
