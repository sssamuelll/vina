import type { Point2D, PatternPiece } from '../../../../types/types';
import type { WalkSeamEdge, GhostTransform, MismatchSample, WalkSeamMetrics } from '../../useWalkSeamTool';
import { pathToSVG } from '../../utils';
import { pointAtPathDistance, computePathArcLength } from '../../../../utils/geometry/arcLength';

interface WalkSeamOverlayProps {
  zoom2D: number;
  stationaryEdge: WalkSeamEdge | null;
  mobileEdge: WalkSeamEdge | null;
  walkDistance: number;
  ghostTransform: GhostTransform | null;
  ghostOpacity: number;
  mismatchSamples: MismatchSample[];
  metrics: WalkSeamMetrics | null;
  formatDistance: (d: number) => string;
  hoveredSnapPoint: Point2D | null;
}

// ─── Constants ──────────────────────────────────────────────────────────────

/** Average character width factor for Inter font at fontSize. */
const CHAR_W = 0.55;
const LABEL_PAD = 6; // horizontal padding in unscaled px

const COLORS = {
  green: '#4caf50',
  yellow: '#ff9800',
  red: '#f44336',
  stationary: '#2196f3',
  ghost: '#9c27b0',
  walkIndicator: '#ff5722',
} as const;

// ─── Sub-components ─────────────────────────────────────────────────────────

/** Floating panel showing A length, B length, delta, ease%, walk position */
function MetricsPanel({
  metrics, zoom2D, formatDistance, stationaryEdge,
}: {
  metrics: WalkSeamMetrics;
  zoom2D: number;
  formatDistance: (d: number) => string;
  stationaryEdge: WalkSeamEdge;
}) {
  // Position the panel near the midpoint of the stationary edge
  const midDist = stationaryEdge.arcLength / 2;
  const midPt = pointAtPathDistance(
    stationaryEdge.piece.outline,
    midDist,
    stationaryEdge.edge.segmentRange[0],
    stationaryEdge.edge.segmentRange[1],
  );
  if (!midPt) return null;

  const px = midPt.x + stationaryEdge.piece.position.x;
  const py = midPt.y + stationaryEdge.piece.position.y - 30 / zoom2D;

  const sign = metrics.delta >= 0 ? '+' : '';
  const lines = [
    `A: ${formatDistance(metrics.lengthA)}`,
    `B: ${formatDistance(metrics.lengthB)}`,
    `\u0394 ${sign}${formatDistance(metrics.delta)} (${metrics.easePercent.toFixed(1)}%)`,
    `Walk: ${formatDistance(metrics.walkPosition)}`,
  ];

  const fontSize = 10 / zoom2D;
  const lineH = 14 / zoom2D;
  const maxTextW = Math.max(...lines.map(l => l.length * CHAR_W * fontSize));
  const padW = LABEL_PAD / zoom2D;
  const totalW = maxTextW + padW * 2;
  const totalH = lines.length * lineH + 4 / zoom2D;

  return (
    <g transform={`translate(${px}, ${py})`}>
      <rect
        x={-totalW / 2} y={-totalH}
        width={totalW} height={totalH}
        rx={4 / zoom2D} fill="rgba(0,0,0,0.8)"
      />
      {lines.map((line, i) => (
        <text
          key={i}
          x={0}
          y={-totalH + lineH * (i + 0.75)}
          textAnchor="middle" dominantBaseline="central"
          fill="#fff" fontSize={fontSize}
          fontFamily="Inter, sans-serif" pointerEvents="none"
        >
          {line}
        </text>
      ))}
    </g>
  );
}

/** Renders an edge as a thick polyline (sample at 3mm intervals for smooth curves) */
function EdgeHighlight({
  edge, color, zoom2D,
}: {
  edge: WalkSeamEdge;
  color: string;
  zoom2D: number;
}) {
  const [segStart, segEnd] = edge.edge.segmentRange;
  const arcLen = computePathArcLength(edge.piece.outline, segStart, segEnd);
  if (arcLen <= 0) return null;

  const INTERVAL = 3; // mm
  const numSamples = Math.max(2, Math.ceil(arcLen / INTERVAL) + 1);
  const points: Point2D[] = [];

  for (let i = 0; i < numSamples; i++) {
    const d = (i / (numSamples - 1)) * arcLen;
    const pt = pointAtPathDistance(edge.piece.outline, d, segStart, segEnd);
    if (pt) {
      points.push({
        x: pt.x + edge.piece.position.x,
        y: pt.y + edge.piece.position.y,
      });
    }
  }

  if (points.length < 2) return null;
  const polyStr = points.map(p => `${p.x},${p.y}`).join(' ');

  return (
    <polyline
      points={polyStr}
      fill="none"
      stroke={color}
      strokeWidth={3 / zoom2D}
      opacity={0.7}
      pointerEvents="none"
    />
  );
}

/** Renders mismatch samples as colored line segments along the stationary edge */
function MismatchStripe({
  samples, stationaryEdge, zoom2D,
}: {
  samples: MismatchSample[];
  stationaryEdge: WalkSeamEdge;
  zoom2D: number;
}) {
  if (samples.length < 2) return null;

  const pos = stationaryEdge.piece.position;

  return (
    <g pointerEvents="none">
      {samples.map((sample, i) => {
        if (i === 0) return null;
        const prev = samples[i - 1];
        return (
          <line
            key={i}
            x1={prev.pointA.x + pos.x} y1={prev.pointA.y + pos.y}
            x2={sample.pointA.x + pos.x} y2={sample.pointA.y + pos.y}
            stroke={COLORS[sample.color]}
            strokeWidth={5 / zoom2D}
            opacity={0.6}
            strokeLinecap="round"
          />
        );
      })}
    </g>
  );
}

/** Renders the mobile piece as a semi-transparent ghost with outline path */
function GhostPiece({
  piece, transform, opacity, zoom2D,
}: {
  piece: PatternPiece;
  transform: GhostTransform;
  opacity: number;
  zoom2D: number;
}) {
  if (!piece.outline?.length) return null;

  return (
    <g
      opacity={opacity / 100}
      transform={`translate(${piece.position.x + transform.tx}, ${piece.position.y + transform.ty}) rotate(${transform.angleDeg}, ${transform.pivotX}, ${transform.pivotY})`}
      pointerEvents="none"
    >
      <path
        d={pathToSVG(piece.outline)}
        fill="rgba(156,39,176,0.08)"
        stroke={COLORS.ghost}
        strokeWidth={1.5 / zoom2D}
        strokeDasharray={`${4 / zoom2D} ${3 / zoom2D}`}
      />
    </g>
  );
}

/** Orange circle at the current walk position on the stationary edge */
function WalkIndicator({
  stationaryEdge, walkDistance, zoom2D,
}: {
  stationaryEdge: WalkSeamEdge;
  walkDistance: number;
  zoom2D: number;
}) {
  const [segStart, segEnd] = stationaryEdge.edge.segmentRange;
  const pt = pointAtPathDistance(
    stationaryEdge.piece.outline, walkDistance, segStart, segEnd,
  );
  if (!pt) return null;

  const wx = pt.x + stationaryEdge.piece.position.x;
  const wy = pt.y + stationaryEdge.piece.position.y;

  return (
    <circle
      cx={wx} cy={wy}
      r={5 / zoom2D}
      fill={COLORS.walkIndicator}
      stroke="#fff" strokeWidth={1.5 / zoom2D}
      opacity={0.9}
      pointerEvents="none"
    />
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function WalkSeamOverlay({
  zoom2D,
  stationaryEdge,
  mobileEdge,
  walkDistance,
  ghostTransform,
  ghostOpacity,
  mismatchSamples,
  metrics,
  formatDistance,
  hoveredSnapPoint,
}: WalkSeamOverlayProps) {
  return (
    <g className="walk-seam-overlay">
      {/* Phase 1: No stationary edge — just show snap indicator */}
      {!stationaryEdge && hoveredSnapPoint && (
        <circle
          cx={hoveredSnapPoint.x} cy={hoveredSnapPoint.y}
          r={4 / zoom2D} fill={COLORS.stationary} opacity={0.5}
          pointerEvents="none"
        />
      )}

      {/* Phase 2: Stationary edge selected, no mobile yet */}
      {stationaryEdge && !mobileEdge && (
        <>
          <EdgeHighlight edge={stationaryEdge} color={COLORS.stationary} zoom2D={zoom2D} />
          {hoveredSnapPoint && (
            <circle
              cx={hoveredSnapPoint.x} cy={hoveredSnapPoint.y}
              r={4 / zoom2D} fill={COLORS.stationary} opacity={0.5}
              pointerEvents="none"
            />
          )}
        </>
      )}

      {/* Phase 3: Both edges selected — full walk mode */}
      {stationaryEdge && mobileEdge && (
        <>
          <EdgeHighlight edge={stationaryEdge} color={COLORS.stationary} zoom2D={zoom2D} />
          <EdgeHighlight edge={mobileEdge} color={COLORS.ghost} zoom2D={zoom2D} />
          <MismatchStripe samples={mismatchSamples} stationaryEdge={stationaryEdge} zoom2D={zoom2D} />
          {ghostTransform && (
            <GhostPiece
              piece={mobileEdge.piece}
              transform={ghostTransform}
              opacity={ghostOpacity}
              zoom2D={zoom2D}
            />
          )}
          <WalkIndicator stationaryEdge={stationaryEdge} walkDistance={walkDistance} zoom2D={zoom2D} />
          {metrics && (
            <MetricsPanel
              metrics={metrics}
              zoom2D={zoom2D}
              formatDistance={formatDistance}
              stationaryEdge={stationaryEdge}
            />
          )}
        </>
      )}
    </g>
  );
}
