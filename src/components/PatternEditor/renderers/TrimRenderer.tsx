import { useSelector } from 'react-redux';
import type { RootState } from '../../../store';
import type { Trim, TrimType } from '../../../types/trim';
import type { PatternPiece, Point2D } from '../../../types/types';
// Todo lo que se dibuja aqui sale del `outline` (local) y este renderer vive
// en espacio de patron: el giro va puesto, no solo el desplazamiento (#1068).
import { pieceLocalToPattern } from '../pieceTransform';
import { interpolateEdgePoint } from '../../../utils/geometry/edgeInterpolation';

interface TrimIconProps {
  x: number;
  y: number;
  size: number;
  color: string;
  type: TrimType;
  zoom: number;
}

/** Renders an SVG icon for a trim type at a given position */
function TrimIcon({ x, y, size, color, type, zoom }: TrimIconProps) {
  // Size in pattern space (mm), clamped so it's visible at any zoom
  const r = Math.max(size / 2, 3 / zoom);
  const sw = 1 / zoom;

  switch (type) {
    case 'button':
      return (
        <g>
          <circle cx={x} cy={y} r={r} fill={color} stroke="#666" strokeWidth={sw} />
          {/* 4-hole pattern */}
          <circle cx={x - r * 0.3} cy={y - r * 0.3} r={r * 0.12} fill="#999" />
          <circle cx={x + r * 0.3} cy={y - r * 0.3} r={r * 0.12} fill="#999" />
          <circle cx={x - r * 0.3} cy={y + r * 0.3} r={r * 0.12} fill="#999" />
          <circle cx={x + r * 0.3} cy={y + r * 0.3} r={r * 0.12} fill="#999" />
        </g>
      );
    case 'snap':
      return (
        <g>
          <circle cx={x} cy={y} r={r} fill="none" stroke={color} strokeWidth={sw * 2} />
          <circle cx={x} cy={y} r={r * 0.5} fill={color} />
        </g>
      );
    case 'rivet':
      return (
        <g>
          <circle cx={x} cy={y} r={r} fill={color} stroke="#666" strokeWidth={sw} />
          <circle cx={x} cy={y} r={r * 0.3} fill="#999" />
        </g>
      );
    case 'buckle':
      return (
        <rect
          x={x - r}
          y={y - r * 0.6}
          width={r * 2}
          height={r * 1.2}
          rx={r * 0.2}
          fill="none"
          stroke={color}
          strokeWidth={sw * 2}
        />
      );
    case 'ring':
      return <circle cx={x} cy={y} r={r} fill="none" stroke={color} strokeWidth={sw * 2} />;
    case 'hook-eye':
      return (
        <g>
          {/* Hook */}
          <path
            d={`M${x - r * 0.4},${y} Q${x - r * 0.4},${y - r * 0.6} ${x},${y - r * 0.6} Q${x + r * 0.4},${y - r * 0.6} ${x + r * 0.4},${y}`}
            fill="none"
            stroke={color}
            strokeWidth={sw * 2}
          />
          {/* Eye */}
          <circle cx={x} cy={y + r * 0.4} r={r * 0.3} fill="none" stroke={color} strokeWidth={sw * 1.5} />
        </g>
      );
    case 'drawstring-stop':
      return (
        <rect
          x={x - r * 0.4}
          y={y - r * 0.4}
          width={r * 0.8}
          height={r * 0.8}
          fill={color}
          stroke="#666"
          strokeWidth={sw}
        />
      );
    case 'zipper':
      // Zippers render as a line along the edge range — handled at the caller level
      return <circle cx={x} cy={y} r={r * 0.3} fill={color} />;
    case 'custom':
    default:
      // Diamond marker
      return (
        <polygon
          points={`${x},${y - r} ${x + r * 0.7},${y} ${x},${y + r} ${x - r * 0.7},${y}`}
          fill={color}
          stroke="#666"
          strokeWidth={sw}
        />
      );
  }
}

/** Resolve positions for a trim on a piece and render icons */
function TrimOnPiece({ trim, piece, zoom }: { trim: Trim; piece: PatternPiece; zoom: number }) {
  const placement = trim.placement;

  if (placement.mode === 'edge-points') {
    const { edgeName, positions } = placement;
    return (
      <g>
        {positions.map((t, i) => {
          const result = interpolateEdgePoint(piece, edgeName, t);
          if (!result) return null;
          return (
            <TrimIcon
              key={`${trim.id}-${i}`}
              {...pieceLocalToPattern(result.point, piece)}
              size={trim.size}
              color={trim.color}
              type={trim.type}
              zoom={zoom}
            />
          );
        })}
      </g>
    );
  }

  if (placement.mode === 'edge') {
    // Render zipper as a thick dashed line along the edge range
    const { edgeName, tStart, tEnd } = placement;
    const steps = 20;
    const points: Point2D[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = tStart + (i / steps) * (tEnd - tStart);
      const result = interpolateEdgePoint(piece, edgeName, t);
      if (result) {
        points.push(pieceLocalToPattern(result.point, piece));
      }
    }
    if (points.length < 2) return null;
    const d = points.map((p, idx) => `${idx === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
    const sw = Math.max(trim.size / 2, 2 / zoom);
    return (
      <path
        d={d}
        fill="none"
        stroke={trim.color}
        strokeWidth={sw}
        strokeDasharray={`${4 / zoom} ${2 / zoom}`}
        strokeLinecap="round"
      />
    );
  }

  if (placement.mode === 'point') {
    const { positions } = placement;
    return (
      <g>
        {positions.map((pos, i) => (
          <TrimIcon
            key={`${trim.id}-${i}`}
            {...pieceLocalToPattern(pos, piece)}
            size={trim.size}
            color={trim.color}
            type={trim.type}
            zoom={zoom}
          />
        ))}
      </g>
    );
  }

  // count mode — no spatial rendering
  return null;
}

interface TrimRendererProps {
  zoom2D: number;
}

export default function TrimRenderer({ zoom2D }: TrimRendererProps) {
  const trims = useSelector((s: RootState) => s.project.trims);
  const pieces = useSelector((s: RootState) => s.project.pieces);

  if (trims.length === 0) return null;

  const pieceMap = new Map(pieces.map(p => [p.id, p]));

  return (
    <g className="trim-renderer">
      {trims
        .filter(t => t.active)
        .map(trim => {
          const piece = pieceMap.get(trim.pieceId);
          if (!piece) return null;
          return <TrimOnPiece key={trim.id} trim={trim} piece={piece} zoom={zoom2D} />;
        })}
    </g>
  );
}
