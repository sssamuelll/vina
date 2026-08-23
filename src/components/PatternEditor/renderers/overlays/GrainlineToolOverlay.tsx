import { PatternPiece, Point2D } from '../../../../types/types';
import { pieceLocalToPattern } from '../../pieceTransform';

interface GrainlineToolOverlayProps {
  zoom2D: number;
  pieces: PatternPiece[];
  grainlineStartPoint: Point2D;
  grainlineEndPoint: Point2D;
  grainlinePieceId: string;
}

export default function GrainlineToolOverlay({ zoom2D, pieces, grainlineStartPoint, grainlineEndPoint, grainlinePieceId }: GrainlineToolOverlayProps) {
  const piece = pieces.find(p => p.id === grainlinePieceId);
  if (!piece) return null;
  // Los dos puntos llegan en LOCAL desde `useGrainlineTool`, que los pasa por
  // `patternToPieceLocal`. Este overlay cuelga de `ToolOverlay`, o sea espacio
  // de patron: hay que devolverlos con el giro puesto, no solo desplazados
  // (#1068).
  const { x: sx, y: sy } = pieceLocalToPattern(grainlineStartPoint, piece);
  const { x: ex, y: ey } = pieceLocalToPattern(grainlineEndPoint, piece);
  const dx = ex - sx, dy = ey - sy;
  const len = Math.hypot(dx, dy);
  if (len < 2) return null;
  const ux = dx / len, uy = dy / len;
  const arrowSize = 6 / zoom2D;
  return (
    <g className="grainline-preview">
      <line x1={sx} y1={sy} x2={ex} y2={ey}
        stroke="#6bff6b" strokeWidth={1.5 / zoom2D} opacity={0.8} />
      <polygon
        points={`${ex},${ey} ${ex - ux * arrowSize + uy * arrowSize * 0.5},${ey - uy * arrowSize - ux * arrowSize * 0.5} ${ex - ux * arrowSize - uy * arrowSize * 0.5},${ey - uy * arrowSize + ux * arrowSize * 0.5}`}
        fill="#6bff6b" opacity={0.8}
      />
    </g>
  );
}
