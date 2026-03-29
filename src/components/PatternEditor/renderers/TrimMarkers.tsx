/**
 * TrimMarkers — SVG overlay for placed trims on the 2D pattern canvas.
 *
 * Renders each active trim at its placement positions on the corresponding
 * pattern piece. Point-mode trims draw circles with type-specific glyphs;
 * edge-mode trims show a label indicator near the piece origin.
 */

import type { PatternPiece } from '../../../types/types';
import type { Trim } from '../../../types/trim';

interface TrimMarkersProps {
  pieces: PatternPiece[];
  trims: Trim[];
  zoom2D: number;
}

/** Glyph per trim type rendered inside point markers */
function trimGlyph(type: Trim['type']): string {
  switch (type) {
    case 'button': return '\u25CF';    // ●
    case 'snap': return '\u25C9';      // ◉
    case 'rivet': return '\u2299';     // ⊙
    case 'hook-eye': return '\u223C';  // ∼
    default: return '\u2295';          // ⊕
  }
}

export default function TrimMarkers({ pieces, trims, zoom2D }: TrimMarkersProps) {
  const pieceMap = new Map(pieces.map(p => [p.id, p]));
  const strokeWidth = 0.5 / zoom2D;

  return (
    <g className="trim-markers" pointerEvents="none">
      {trims.filter(t => t.active).map(trim => {
        const piece = pieceMap.get(trim.pieceId);
        if (!piece) return null;

        if (trim.placement.mode === 'point') {
          return trim.placement.positions.map((pos, i) => (
            <g
              key={`${trim.id}-${i}`}
              transform={`translate(${piece.position.x + pos.x}, ${piece.position.y + pos.y})`}
            >
              <circle
                r={trim.size / 2}
                fill={trim.color}
                fillOpacity={0.6}
                stroke={trim.color}
                strokeWidth={strokeWidth}
              />
              {trim.size >= 10 && (
                <text
                  textAnchor="middle"
                  dy="0.35em"
                  fontSize={trim.size * 0.35}
                  fill="white"
                  pointerEvents="none"
                >
                  {trimGlyph(trim.type)}
                </text>
              )}
            </g>
          ));
        }

        // Edge-mode trims: render a label indicator near the piece
        if (trim.placement.mode === 'edge') {
          return (
            <g key={trim.id}>
              <text
                x={piece.position.x}
                y={piece.position.y - 5}
                fontSize={4}
                fill={trim.color}
                pointerEvents="none"
              >
                {'\u2307'} {trim.name}
              </text>
            </g>
          );
        }

        return null;
      })}
    </g>
  );
}
