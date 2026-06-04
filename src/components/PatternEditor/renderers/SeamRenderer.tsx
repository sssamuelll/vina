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
import { getEdgeEndpoints, getEdgeArcLength, getEdgePathD } from '../../../utils/geometry/path';

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

// Categorical palette for distinguishing seam groups — muted for the cream
// paper ground (was a neon set built for a dark canvas). Mid-tone, lower
// chroma, still mutually distinguishable.
const SEAM_PALETTE = [
  '#4a7fb5', '#b56d8a', '#5a9e72', '#c08a4a', '#8a6db5',
  '#b55a4a', '#4a9e8f', '#b59a4a', '#a45ab5', '#4a9eae',
];

export default function SeamRenderer({ seams, pieces, zoom2D, selectedSeamId }: SeamRendererProps) {
  return (
    <>
      {seams.map((seam, seamIndex) => {
        const pieceA = pieces.find(p => p.id === seam.pieceA.pieceId);
        const pieceB = pieces.find(p => p.id === seam.pieceB.pieceId);
        if (!pieceA || !pieceB) return null;

        // Resolve semantic edge name to segment index (with edge-N fallback)
        const semEdgeA = pieceA.edges?.find(e => e.name === seam.pieceA.edgeName);
        const semEdgeB = pieceB.edges?.find(e => e.name === seam.pieceB.edgeName);
        let segIdxA = semEdgeA?.segmentRange[0] ?? -1;
        let segIdxB = semEdgeB?.segmentRange[0] ?? -1;
        // Fallback: parse "edge-N" pattern
        if (segIdxA < 0) {
          const m = seam.pieceA.edgeName.match(/^edge-(\d+)$/);
          segIdxA = m ? parseInt(m[1], 10) + 1 : 1; // +1: command index (skip M)
        }
        if (segIdxB < 0) {
          const m = seam.pieceB.edgeName.match(/^edge-(\d+)$/);
          segIdxB = m ? parseInt(m[1], 10) + 1 : 1;
        }

        const epA = getEdgeEndpoints(pieceA.outline, segIdxA);
        const epB = getEdgeEndpoints(pieceB.outline, segIdxB);
        if (!epA || !epB) return null;

        const offA = pieceA.position;
        const offB = pieceB.position;

        // SVG path data following curves (not straight lines)
        const pathDA = getEdgePathD(pieceA.outline, segIdxA, offA.x, offA.y);
        const pathDB = getEdgePathD(pieceB.outline, segIdxB, offB.x, offB.y);

        const midA = {
          x: (epA.start.x + epA.end.x) / 2 + offA.x,
          y: (epA.start.y + epA.end.y) / 2 + offA.y,
        };
        const midB = {
          x: (epB.start.x + epB.end.x) / 2 + offB.x,
          y: (epB.start.y + epB.end.y) / 2 + offB.y,
        };

        // Length validation. Use ARC length (samples curves), not the chord:
        // autoSew pairs edges by arc length, so a chord-based mismatch wildly
        // over-reports curved seams (armholes, caps, necklines) — a correctly
        // matched curved seam would otherwise show a huge false mismatch.
        const lenA = getEdgeArcLength(pieceA.outline, segIdxA);
        const lenB = getEdgeArcLength(pieceB.outline, segIdxB);
        const maxLen = Math.max(lenA, lenB, 0.01);
        const mismatch = Math.abs(lenA - lenB) / maxLen;
        const hasMismatch = mismatch > 0.05; // >5% difference

        const isSelected = selectedSeamId === seam.id;
        const isInactive = seam.active === false;
        const paletteColor = SEAM_PALETTE[seamIndex % SEAM_PALETTE.length];
        // State colors borrow the piece selection/error language; otherwise the
        // muted seam-group palette. var() tokens must be applied via `style`
        // (SVG presentation attrs can't read CSS variables).
        const baseColor = isInactive
          ? 'var(--ink-on-light-3)'
          : isSelected
            ? 'var(--accent-2d)'
            : hasMismatch
              ? 'var(--piece-error-2d)'
              : paletteColor;
        // Type-specific line styles (CLO3D parity)
        const z = zoom2D;
        let edgeDash: string | undefined;
        if (isInactive) {
          edgeDash = `${4 / z} ${3 / z}`;
        } else {
          switch (seam.type) {
            case 'french': edgeDash = `${6 / z} ${3 / z}`; break;                       // dashed
            case 'overlock': edgeDash = `${2 / z} ${2 / z} ${6 / z} ${2 / z}`; break;   // dash-dot (zigzag feel)
            case 'flat-felled': edgeDash = `${8 / z} ${2 / z} ${2 / z} ${2 / z}`; break; // long-short-short
            default: edgeDash = undefined; break;                                         // solid (standard)
          }
        }
        const edgeWidth = (isSelected ? 4 : seam.taped ? 4 : 2.5) / zoom2D;

        // Direction arrows
        const arrowA = directionArrow(epA.start, epA.end, offA, zoom2D);
        const arrowB = directionArrow(epB.start, epB.end, offB, zoom2D);

        return (
          <g key={seam.id} className="seam-connection" opacity={isInactive ? 0.5 : 1}>
            {/* Selection glow (wider semi-transparent behind main stroke) */}
            {isSelected && pathDA && (
              <path d={pathDA} fill="none" style={{ stroke: 'var(--accent-2d)' }} strokeWidth={edgeWidth * 3} strokeLinecap="round" opacity={0.2} />
            )}
            {isSelected && pathDB && (
              <path d={pathDB} fill="none" style={{ stroke: 'var(--accent-2d)' }} strokeWidth={edgeWidth * 3} strokeLinecap="round" opacity={0.2} />
            )}
            {/* Edge A highlight (follows curves) */}
            {pathDA ? (
              <path
                d={pathDA}
                fill="none"
                style={{ stroke: baseColor }}
                strokeWidth={edgeWidth}
                strokeLinecap="round"
                strokeDasharray={edgeDash}
              />
            ) : (
              <line
                x1={epA.start.x + offA.x} y1={epA.start.y + offA.y}
                x2={epA.end.x + offA.x} y2={epA.end.y + offA.y}
                style={{ stroke: baseColor }} strokeWidth={edgeWidth} strokeLinecap="round" strokeDasharray={edgeDash}
              />
            )}
            {/* Edge B highlight (follows curves) */}
            {pathDB ? (
              <path
                d={pathDB}
                fill="none"
                style={{ stroke: baseColor }}
                strokeWidth={edgeWidth}
                strokeLinecap="round"
                strokeDasharray={edgeDash}
              />
            ) : (
              <line
                x1={epB.start.x + offB.x} y1={epB.start.y + offB.y}
                x2={epB.end.x + offB.x} y2={epB.end.y + offB.y}
                style={{ stroke: baseColor }} strokeWidth={edgeWidth} strokeLinecap="round" strokeDasharray={edgeDash}
              />
            )}
            {/* Connection line (dotted) */}
            <line
              x1={midA.x} y1={midA.y}
              x2={midB.x} y2={midB.y}
              style={{ stroke: baseColor }}
              strokeWidth={1 / zoom2D}
              strokeDasharray={`${5 / zoom2D} ${3 / zoom2D}`}
              opacity={0.6}
            />
            {/* Midpoint dots */}
            <circle cx={midA.x} cy={midA.y} r={3 / zoom2D} style={{ fill: baseColor }} />
            <circle cx={midB.x} cy={midB.y} r={3 / zoom2D} style={{ fill: baseColor }} />

            {/* Directional arrows */}
            {arrowA && <path d={arrowA} style={{ fill: baseColor }} opacity={0.8} />}
            {arrowB && <path d={arrowB} style={{ fill: baseColor }} opacity={0.8} />}

            {/* Length mismatch warning */}
            {hasMismatch && (
              <text
                x={(midA.x + midB.x) / 2}
                y={(midA.y + midB.y) / 2 - 8 / zoom2D}
                fontSize={9 / zoom2D}
                textAnchor="middle"
                fontWeight={600}
                style={{ fill: 'var(--piece-error-2d)', fontFamily: 'var(--font-mono-2d)' }}
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
                textAnchor="middle"
                fontWeight={600}
                style={{ fill: seam.tension < 100 ? 'var(--seam-tension-gather-2d)' : 'var(--seam-tension-ease-2d)', fontFamily: 'var(--font-mono-2d)' }}
              >
                {seam.tension}%{seam.tension < 100 ? ' gather' : ' ease'}
              </text>
            )}

            {/* Length labels (on selected) */}
            {isSelected && (
              <>
                <text
                  x={midA.x} y={midA.y - 8 / zoom2D}
                  fontSize={8 / zoom2D} textAnchor="middle"
                  style={{ fill: 'var(--ink-on-light-2)', fontFamily: 'var(--font-mono-2d)' }}
                >
                  {lenA.toFixed(1)}mm
                </text>
                <text
                  x={midB.x} y={midB.y - 8 / zoom2D}
                  fontSize={8 / zoom2D} textAnchor="middle"
                  style={{ fill: 'var(--ink-on-light-2)', fontFamily: 'var(--font-mono-2d)' }}
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
