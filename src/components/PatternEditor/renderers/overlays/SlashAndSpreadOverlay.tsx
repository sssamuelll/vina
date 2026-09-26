import type { Point2D, PatternPiece, PathCommand } from '../../../../types/types';
import type { SlashAndSpreadPhase } from '../../useSlashAndSpreadTool';

interface SlashAndSpreadOverlayProps {
  zoom2D: number;
  pieces: PatternPiece[];
  phase: SlashAndSpreadPhase;
  targetPieceId: string | null;
  startPoint: Point2D | null;
  endPoint: Point2D | null;
  halfA: PathCommand[] | null;
  halfB: PathCommand[] | null;
  selectedHalf: 'A' | 'B' | null;
  hoveredHalf: 'A' | 'B' | null;
  pivotPoint: Point2D | null;
  spreadAmount: number;
  previewPiece: PatternPiece | null;
}

/** Convert a PathCommand[] to an SVG path string. */
function pathToD(cmds: PathCommand[]): string {
  return cmds
    .map(c => {
      switch (c.type) {
        case 'M': return `M${c.values[0]},${c.values[1]}`;
        case 'L': return `L${c.values[0]},${c.values[1]}`;
        case 'C': return `C${c.values[0]},${c.values[1]} ${c.values[2]},${c.values[3]} ${c.values[4]},${c.values[5]}`;
        case 'Q': return `Q${c.values[0]},${c.values[1]} ${c.values[2]},${c.values[3]}`;
        case 'Z': return 'Z';
        default: return '';
      }
    })
    .join(' ');
}

/** Build an SVG arc path for a small angle indicator near the pivot. */
function buildArcPath(
  pivot: Point2D,
  radius: number,
  startAngleRad: number,
  endAngleRad: number,
): string {
  const sx = pivot.x + radius * Math.cos(startAngleRad);
  const sy = pivot.y + radius * Math.sin(startAngleRad);
  const ex = pivot.x + radius * Math.cos(endAngleRad);
  const ey = pivot.y + radius * Math.sin(endAngleRad);
  const largeArc = Math.abs(endAngleRad - startAngleRad) > Math.PI ? 1 : 0;
  const sweep = endAngleRad > startAngleRad ? 1 : 0;
  return `M${sx},${sy} A${radius},${radius} 0 ${largeArc} ${sweep} ${ex},${ey}`;
}

export default function SlashAndSpreadOverlay({
  zoom2D,
  pieces,
  phase,
  targetPieceId,
  startPoint,
  endPoint,
  halfA,
  halfB,
  selectedHalf,
  hoveredHalf,
  pivotPoint,
  spreadAmount,
  previewPiece,
}: SlashAndSpreadOverlayProps) {
  if (!targetPieceId) return null;

  const piece = pieces.find(p => p.id === targetPieceId);
  if (!piece) return null;

  const sw = 1.5 / zoom2D;
  const thinSw = 1 / zoom2D;
  const r = 6 / zoom2D;
  const ox = piece.position?.x ?? 0;
  const oy = piece.position?.y ?? 0;

  return (
    <g>
      {/* ── drawingSlash: dashed line from start to mouse ── */}
      {phase === 'drawingSlash' && startPoint && endPoint && (
        <>
          <line
            x1={startPoint.x}
            y1={startPoint.y}
            x2={endPoint.x}
            y2={endPoint.y}
            stroke="#FF6600"
            strokeWidth={sw}
            strokeDasharray={`${5 / zoom2D} ${3 / zoom2D}`}
            pointerEvents="none"
          />
          {/* Snap indicator at start */}
          <circle
            cx={startPoint.x}
            cy={startPoint.y}
            r={r}
            fill="#FF6600"
            stroke="#fff"
            strokeWidth={1.2 / zoom2D}
            pointerEvents="none"
          />
        </>
      )}

      {/* ── slashComplete: solid slash line + half highlights ── */}
      {(phase === 'slashComplete' || phase === 'selectingHalf') && startPoint && endPoint && (
        <>
          <line
            x1={startPoint.x}
            y1={startPoint.y}
            x2={endPoint.x}
            y2={endPoint.y}
            stroke="#FF6600"
            strokeWidth={sw}
            pointerEvents="none"
          />
          {/* Directional arrows at midpoint of each half */}
          {halfA && (
            <path
              d={pathToD(halfA)}
              transform={`translate(${ox}, ${oy})`}
              fill={hoveredHalf === 'A' ? 'rgba(173, 216, 230, 0.3)' : 'none'}
              stroke="none"
              pointerEvents="none"
            />
          )}
          {halfB && (
            <path
              d={pathToD(halfB)}
              transform={`translate(${ox}, ${oy})`}
              fill={hoveredHalf === 'B' ? 'rgba(173, 216, 230, 0.3)' : 'none'}
              stroke="none"
              pointerEvents="none"
            />
          )}
          {/* Start / end dots */}
          <circle cx={startPoint.x} cy={startPoint.y} r={4 / zoom2D} fill="#FF6600" pointerEvents="none" />
          <circle cx={endPoint.x} cy={endPoint.y} r={4 / zoom2D} fill="#FF6600" pointerEvents="none" />
        </>
      )}

      {/* ── halfConfirmed: selected half filled yellow, pivot indicators ── */}
      {(phase === 'halfConfirmed' || phase === 'awaitingDrag') && startPoint && endPoint && (
        <>
          {/* Slash line */}
          <line
            x1={startPoint.x}
            y1={startPoint.y}
            x2={endPoint.x}
            y2={endPoint.y}
            stroke="#FF6600"
            strokeWidth={sw}
            pointerEvents="none"
          />
          {/* Selected half */}
          {selectedHalf === 'A' && halfA && (
            <path
              d={pathToD(halfA)}
              transform={`translate(${ox}, ${oy})`}
              fill="rgba(255, 215, 0, 0.3)"
              stroke="#FFD700"
              strokeWidth={thinSw}
              pointerEvents="none"
            />
          )}
          {selectedHalf === 'B' && halfB && (
            <path
              d={pathToD(halfB)}
              transform={`translate(${ox}, ${oy})`}
              fill="rgba(255, 215, 0, 0.3)"
              stroke="#FFD700"
              strokeWidth={thinSw}
              pointerEvents="none"
            />
          )}
          {/* Pivot point indicator dots on slash endpoints */}
          <circle
            cx={startPoint.x}
            cy={startPoint.y}
            r={r}
            fill={pivotPoint ? '#22CC22' : '#FF6600'}
            stroke="#fff"
            strokeWidth={1.2 / zoom2D}
            pointerEvents="none"
          />
          <circle
            cx={endPoint.x}
            cy={endPoint.y}
            r={r}
            fill={pivotPoint ? '#22CC22' : '#FF6600'}
            stroke="#fff"
            strokeWidth={1.2 / zoom2D}
            pointerEvents="none"
          />
          {/* Active pivot highlighted */}
          {pivotPoint && (
            <circle
              cx={pivotPoint.x + ox}
              cy={pivotPoint.y + oy}
              r={r * 1.4}
              fill="none"
              stroke="#22CC22"
              strokeWidth={sw}
              pointerEvents="none"
            />
          )}
        </>
      )}

      {/* ── spreading / spreadPreview: live transformed half + angle/distance ── */}
      {(phase === 'spreading' || phase === 'spreadPreview') && startPoint && endPoint && (
        <>
          {/* Original piece outline faded */}
          <path
            d={pathToD(piece.outline)}
            transform={`translate(${ox}, ${oy})`}
            fill="none"
            stroke="#999"
            strokeWidth={thinSw}
            strokeDasharray={`${3 / zoom2D} ${2 / zoom2D}`}
            opacity={0.5}
            pointerEvents="none"
          />
          {/* Preview piece outline */}
          {previewPiece && (
            <path
              d={pathToD(previewPiece.outline)}
              transform={`translate(${previewPiece.position?.x ?? ox}, ${previewPiece.position?.y ?? oy})`}
              fill="rgba(255, 215, 0, 0.1)"
              stroke="#FF6600"
              strokeWidth={sw}
              pointerEvents="none"
            />
          )}
          {/* Pivot point */}
          {pivotPoint && (
            <>
              <circle
                cx={pivotPoint.x + ox}
                cy={pivotPoint.y + oy}
                r={r}
                fill="#22CC22"
                stroke="#fff"
                strokeWidth={1.2 / zoom2D}
                pointerEvents="none"
              />
              {/* Angle arc for pivot mode */}
              {spreadAmount !== 0 && (
                <path
                  d={buildArcPath(
                    { x: pivotPoint.x + ox, y: pivotPoint.y + oy },
                    20 / zoom2D,
                    0,
                    (spreadAmount * Math.PI) / 180,
                  )}
                  fill="none"
                  stroke="#FF6600"
                  strokeWidth={thinSw}
                  strokeDasharray={`${4 / zoom2D} ${2 / zoom2D}`}
                  pointerEvents="none"
                />
              )}
            </>
          )}
          {/* Degree / mm label */}
          {spreadAmount !== 0 && (
            <text
              x={(startPoint.x + endPoint.x) / 2}
              y={(startPoint.y + endPoint.y) / 2 - 12 / zoom2D}
              textAnchor="middle"
              fill="#FF6600"
              fontSize={12 / zoom2D}
              fontFamily="var(--font-mono-2d)"
              pointerEvents="none"
            >
              {pivotPoint
                ? `${spreadAmount.toFixed(1)}\u00B0`
                : `${spreadAmount.toFixed(1)} mm`}
            </text>
          )}
        </>
      )}
    </g>
  );
}
