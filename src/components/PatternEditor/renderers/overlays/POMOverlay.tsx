/**
 * POMOverlay — Renders all Points of Measure as persistent dimension
 * annotations in the 2D pattern viewport.
 *
 * Straight POMs: dashed line with arrowheads + value label at midpoint.
 * Along-edge POMs: colored edge highlight + value label at edge midpoint.
 * Selected POM gets brighter color and thicker strokes.
 */

import type { PointOfMeasure, PatternPiece, Point2D } from '../../../../types/types';
import { getEdgeEndpoints } from '../../../../utils/geometry/path';

// ─── Colours ────────────────────────────────────────────────────────────────

const COLOR_STRAIGHT = '#8e44ad';
const COLOR_STRAIGHT_SELECTED = '#b565d9';
const COLOR_ALONG_EDGE = '#2980b9';
const COLOR_ALONG_EDGE_SELECTED = '#5dade2';

// ─── Props ──────────────────────────────────────────────────────────────────

export interface POMOverlayProps {
  poms: PointOfMeasure[];
  pieces: PatternPiece[];
  zoom2D: number;
  selectedPOMId: string | null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function resolveWorld(pt: { pieceId: string; localPosition: Point2D }, pieces: PatternPiece[]): Point2D | null {
  const piece = pieces.find(p => p.id === pt.pieceId);
  if (!piece) return null;
  return {
    x: (piece.position.x ?? 0) + pt.localPosition.x,
    y: (piece.position.y ?? 0) + pt.localPosition.y,
  };
}

/** Average character width factor (Inter digits ~0.55em) */
const CHAR_W = 0.55;
const LABEL_PAD = 6;

function DimensionLabel({
  x,
  y,
  label,
  zoom2D,
  color,
}: {
  x: number;
  y: number;
  label: string;
  zoom2D: number;
  color: string;
}) {
  const fontSize = 10 / zoom2D;
  const textW = label.length * CHAR_W * fontSize;
  const padW = LABEL_PAD / zoom2D;
  const totalW = textW + padW * 2;
  const h = 14 / zoom2D;
  return (
    <g transform={`translate(${x}, ${y})`} pointerEvents="none">
      <rect
        x={-totalW / 2}
        y={-h / 2}
        width={totalW}
        height={h}
        rx={3 / zoom2D}
        fill="rgba(0,0,0,0.72)"
        stroke={color}
        strokeWidth={0.5 / zoom2D}
      />
      <text
        textAnchor="middle"
        dominantBaseline="central"
        fill="#fff"
        fontSize={fontSize}
        fontFamily="Inter, sans-serif"
        fontWeight={500}
      >
        {label}
      </text>
    </g>
  );
}

/** Small arrowhead pointing outward from `from` toward `to`. */
function arrowhead(from: Point2D, to: Point2D, zoom: number): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len < 0.001) return '';
  const ux = dx / len;
  const uy = dy / len;
  const s = 4 / zoom;
  // Arrow tip at `from`, two barbs pointing toward `to`
  const tip = from;
  const left = { x: from.x + ux * s + uy * s * 0.5, y: from.y + uy * s - ux * s * 0.5 };
  const right = { x: from.x + ux * s - uy * s * 0.5, y: from.y + uy * s + ux * s * 0.5 };
  return `M${tip.x},${tip.y} L${left.x},${left.y} L${right.x},${right.y} Z`;
}

// ─── Straight POM ───────────────────────────────────────────────────────────

function StraightPOM({
  pom,
  pieces,
  zoom2D,
  isSelected,
}: {
  pom: PointOfMeasure;
  pieces: PatternPiece[];
  zoom2D: number;
  isSelected: boolean;
}) {
  const worldA = resolveWorld(pom.pointA, pieces);
  const worldB = resolveWorld(pom.pointB, pieces);
  if (!worldA || !worldB) return null;

  const color = isSelected ? COLOR_STRAIGHT_SELECTED : COLOR_STRAIGHT;
  const strokeW = isSelected ? 1.5 / zoom2D : 1 / zoom2D;
  const midX = (worldA.x + worldB.x) / 2;
  const midY = (worldA.y + worldB.y) / 2;
  const label = `${pom.name}: ${pom.value.toFixed(1)}mm`;
  const arrowA = arrowhead(worldA, worldB, zoom2D);
  const arrowB = arrowhead(worldB, worldA, zoom2D);

  return (
    <g pointerEvents="none">
      {/* Dashed dimension line */}
      <line
        x1={worldA.x}
        y1={worldA.y}
        x2={worldB.x}
        y2={worldB.y}
        stroke={color}
        strokeWidth={strokeW}
        strokeDasharray={`${4 / zoom2D} ${2.5 / zoom2D}`}
        opacity={isSelected ? 1 : 0.75}
      />
      {/* Arrowheads */}
      {arrowA && <path d={arrowA} fill={color} opacity={isSelected ? 1 : 0.75} />}
      {arrowB && <path d={arrowB} fill={color} opacity={isSelected ? 1 : 0.75} />}
      {/* End dots */}
      <circle cx={worldA.x} cy={worldA.y} r={2.5 / zoom2D} fill={color} />
      <circle cx={worldB.x} cy={worldB.y} r={2.5 / zoom2D} fill={color} />
      {/* Label */}
      <DimensionLabel x={midX} y={midY - 10 / zoom2D} label={label} zoom2D={zoom2D} color={color} />
    </g>
  );
}

// ─── Along-Edge POM ─────────────────────────────────────────────────────────

function AlongEdgePOM({
  pom,
  pieces,
  zoom2D,
  isSelected,
}: {
  pom: PointOfMeasure;
  pieces: PatternPiece[];
  zoom2D: number;
  isSelected: boolean;
}) {
  const piece = pieces.find(p => p.id === pom.pointA.pieceId);
  if (!piece) return null;

  const edgeName = pom.pointA.edgeName;
  if (!edgeName) return null;

  const edge = piece.edges?.find(e => e.name === edgeName);
  if (!edge) return null;

  const color = isSelected ? COLOR_ALONG_EDGE_SELECTED : COLOR_ALONG_EDGE;
  const strokeW = isSelected ? 2.5 / zoom2D : 1.5 / zoom2D;

  // Render each segment in the edge's range
  const [start, end] = edge.segmentRange;
  const segments: React.ReactNode[] = [];
  let midX = 0;
  let midY = 0;
  let segCount = 0;

  for (let i = start; i < end; i++) {
    const ep = getEdgeEndpoints(piece.outline, i);
    if (!ep) continue;

    const sx = ep.start.x + piece.position.x;
    const sy = ep.start.y + piece.position.y;
    const ex = ep.end.x + piece.position.x;
    const ey = ep.end.y + piece.position.y;

    segments.push(
      <line
        key={i}
        x1={sx}
        y1={sy}
        x2={ex}
        y2={ey}
        stroke={color}
        strokeWidth={strokeW}
        strokeLinecap="round"
        opacity={isSelected ? 1 : 0.75}
      />,
    );

    midX += (sx + ex) / 2;
    midY += (sy + ey) / 2;
    segCount++;
  }

  if (segCount === 0) return null;

  midX /= segCount;
  midY /= segCount;

  const label = `${pom.name}: ${pom.value.toFixed(1)}mm`;

  return (
    <g pointerEvents="none">
      {segments}
      <DimensionLabel x={midX} y={midY - 10 / zoom2D} label={label} zoom2D={zoom2D} color={color} />
    </g>
  );
}

// ─── Main overlay ───────────────────────────────────────────────────────────

export default function POMOverlay({ poms, pieces, zoom2D, selectedPOMId }: POMOverlayProps) {
  if (poms.length === 0) return null;

  return (
    <>
      {poms.map(pom => {
        const isSelected = pom.id === selectedPOMId;

        if (pom.method === 'alongEdge') {
          return (
            <AlongEdgePOM
              key={pom.id}
              pom={pom}
              pieces={pieces}
              zoom2D={zoom2D}
              isSelected={isSelected}
            />
          );
        }

        // Default: straight (also covers any other method)
        return (
          <StraightPOM
            key={pom.id}
            pom={pom}
            pieces={pieces}
            zoom2D={zoom2D}
            isSelected={isSelected}
          />
        );
      })}
    </>
  );
}
