/**
 * SeamRenderer — Renders sewing connections between pattern pieces.
 *
 * CLO3D parity:
 * - Dotted connection lines between sewn edges
 * - Directional arrows showing sewing order
 * - Length mismatch warnings (red highlight when edges differ >5%)
 * - Selected seam highlighted
 */

import { PatternPiece, Seam } from '../../../types/types';
import { getEdgeEndpoints, getEdgeLength } from '../../../utils/geometry/path';

interface SeamRendererProps {
  seams: Seam[];
  pieces: PatternPiece[];
  zoom2D: number;
  selectedSeamId: string | null;
}

/** Compute a small arrow marker at the midpoint of an edge, pointing in sewing direction */
function directionArrow(
  start: { x: number; y: number },
  end: { x: number; y: number },
  offset: { x: number; y: number },
  zoom: number,
) {
  const mx = (start.x + end.x) / 2 + offset.x;
  const my = (start.y + end.y) / 2 + offset.y;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 0.01) return null;
  const ux = dx / len;
  const uy = dy / len;
  const s = 6 / zoom; // arrow size
  // Arrow tip at midpoint, two barbs behind
  const tip = { x: mx + ux * s * 0.5, y: my + uy * s * 0.5 };
  const left = { x: mx - ux * s * 0.5 - uy * s * 0.4, y: my - uy * s * 0.5 + ux * s * 0.4 };
  const right = { x: mx - ux * s * 0.5 + uy * s * 0.4, y: my - uy * s * 0.5 - ux * s * 0.4 };
  return `M${tip.x},${tip.y} L${left.x},${left.y} L${right.x},${right.y} Z`;
}

const SEAM_PALETTE = [
  '#4a9eff', '#ff6b9d', '#6bffa6', '#ffa64a', '#9d6bff',
  '#ff4a4a', '#4affc8', '#ffd54a', '#c84aff', '#4affe5',
];

export default function SeamRenderer({ seams, pieces, zoom2D, selectedSeamId }: SeamRendererProps) {
  return (
    <>
      {seams.map((seam, seamIndex) => {
        const pieceA = pieces.find(p => p.id === seam.pieceA.pieceId);
        const pieceB = pieces.find(p => p.id === seam.pieceB.pieceId);
        if (!pieceA || !pieceB) return null;

        // Resolve semantic edge name to segment index
        const semEdgeA = pieceA.edges?.find(e => e.name === seam.pieceA.edgeName);
        const semEdgeB = pieceB.edges?.find(e => e.name === seam.pieceB.edgeName);
        const segIdxA = semEdgeA?.segmentRange[0] ?? 1;
        const segIdxB = semEdgeB?.segmentRange[0] ?? 1;

        const epA = getEdgeEndpoints(pieceA.outline, segIdxA);
        const epB = getEdgeEndpoints(pieceB.outline, segIdxB);
        if (!epA || !epB) return null;

        const offA = pieceA.position;
        const offB = pieceB.position;

        const midA = {
          x: (epA.start.x + epA.end.x) / 2 + offA.x,
          y: (epA.start.y + epA.end.y) / 2 + offA.y,
        };
        const midB = {
          x: (epB.start.x + epB.end.x) / 2 + offB.x,
          y: (epB.start.y + epB.end.y) / 2 + offB.y,
        };

        // Length validation
        const lenA = getEdgeLength(pieceA.outline, segIdxA);
        const lenB = getEdgeLength(pieceB.outline, segIdxB);
        const maxLen = Math.max(lenA, lenB, 0.01);
        const mismatch = Math.abs(lenA - lenB) / maxLen;
        const hasMismatch = mismatch > 0.05; // >5% difference

        const isSelected = selectedSeamId === seam.id;
        const isInactive = seam.active === false;
        const paletteColor = SEAM_PALETTE[seamIndex % SEAM_PALETTE.length];
        const baseColor = isInactive ? '#666' : isSelected ? '#ffffff' : hasMismatch ? '#ff9944' : paletteColor;
        const edgeDash = isInactive ? `${4 / zoom2D} ${3 / zoom2D}` : undefined;
        const edgeWidth = (seam.taped ? 4 : 2.5) / zoom2D;

        // Direction arrows
        const arrowA = directionArrow(epA.start, epA.end, offA, zoom2D);
        const arrowB = directionArrow(epB.start, epB.end, offB, zoom2D);

        return (
          <g key={seam.id} className="seam-connection" opacity={isInactive ? 0.5 : 1}>
            {/* Edge A highlight */}
            <line
              x1={epA.start.x + offA.x} y1={epA.start.y + offA.y}
              x2={epA.end.x + offA.x} y2={epA.end.y + offA.y}
              stroke={baseColor}
              strokeWidth={edgeWidth}
              strokeLinecap="round"
              strokeDasharray={edgeDash}
            />
            {/* Edge B highlight */}
            <line
              x1={epB.start.x + offB.x} y1={epB.start.y + offB.y}
              x2={epB.end.x + offB.x} y2={epB.end.y + offB.y}
              stroke={baseColor}
              strokeWidth={edgeWidth}
              strokeLinecap="round"
              strokeDasharray={edgeDash}
            />
            {/* Connection line (dotted) */}
            <line
              x1={midA.x} y1={midA.y}
              x2={midB.x} y2={midB.y}
              stroke={baseColor}
              strokeWidth={1 / zoom2D}
              strokeDasharray={`${5 / zoom2D} ${3 / zoom2D}`}
              opacity={0.6}
            />
            {/* Midpoint dots */}
            <circle cx={midA.x} cy={midA.y} r={3 / zoom2D} fill={baseColor} />
            <circle cx={midB.x} cy={midB.y} r={3 / zoom2D} fill={baseColor} />

            {/* Directional arrows */}
            {arrowA && <path d={arrowA} fill={baseColor} opacity={0.8} />}
            {arrowB && <path d={arrowB} fill={baseColor} opacity={0.8} />}

            {/* Length mismatch warning */}
            {hasMismatch && (
              <text
                x={(midA.x + midB.x) / 2}
                y={(midA.y + midB.y) / 2 - 8 / zoom2D}
                fontSize={9 / zoom2D}
                fill="#ff9944"
                textAnchor="middle"
                fontFamily="Inter, sans-serif"
                fontWeight={600}
              >
                ⚠ {Math.round(mismatch * 100)}% mismatch
              </text>
            )}

            {/* Tension label */}
            {seam.tension !== 100 && !isInactive && (
              <text
                x={(midA.x + midB.x) / 2}
                y={(midA.y + midB.y) / 2 + (hasMismatch ? 14 : -8) / zoom2D}
                fontSize={8 / zoom2D}
                fill={seam.tension < 100 ? '#e67e22' : '#3498db'}
                textAnchor="middle"
                fontFamily="Inter, sans-serif"
                fontWeight={600}
              >
                {seam.tension}%{seam.tension < 100 ? ' gather' : ' ease'}
              </text>
            )}

            {/* Length labels (on selected) */}
            {isSelected && (
              <>
                <text
                  x={midA.x} y={midA.y - 8 / zoom2D}
                  fontSize={8 / zoom2D} fill="#ccc" textAnchor="middle"
                  fontFamily="Inter, sans-serif"
                >
                  {lenA.toFixed(1)}mm
                </text>
                <text
                  x={midB.x} y={midB.y - 8 / zoom2D}
                  fontSize={8 / zoom2D} fill="#ccc" textAnchor="middle"
                  fontFamily="Inter, sans-serif"
                >
                  {lenB.toFixed(1)}mm
                </text>
              </>
            )}
          </g>
        );
      })}
    </>
  );
}
