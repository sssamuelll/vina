import type { PatternPiece, Point2D } from '../../types/types';
import { outlineBBoxCenter, rotatePoint } from '../../utils/geometry/transform';

/**
 * Las tres conversiones patrón ↔ local viven en `utils/geometry/pieceSpace.ts`
 * desde #1064: los hit-tests de `utils/seam/` también las necesitan y no pueden
 * importar hacia `components/`. Se re-exportan desde aquí para no mover los
 * callsites que ya las traían por esta puerta.
 */
export {
  patternToPieceLocal,
  patternToPieceLocalDirection,
  pieceLocalToPattern,
} from '../../utils/geometry/pieceSpace';

type TransformablePiece = Pick<PatternPiece, 'position' | 'outline' | 'rotation'>;

/**
 * Keep the rendered geometry stationary when an outline mutation changes the
 * bbox center used as the piece's rotation pivot.
 */
export function compensatePositionForPivotChange(
  piece: TransformablePiece,
  nextOutline: PatternPiece['outline'],
): Point2D {
  const rotation = piece.rotation ?? 0;
  if (!rotation) return piece.position;

  const previousCenter = outlineBBoxCenter(piece.outline);
  const nextCenter = outlineBBoxCenter(nextOutline);
  const pivotDelta = {
    x: previousCenter.x - nextCenter.x,
    y: previousCenter.y - nextCenter.y,
  };
  const rotatedDelta = rotatePoint(
    pivotDelta,
    { x: 0, y: 0 },
    rotation * Math.PI / 180,
  );

  return {
    x: piece.position.x + pivotDelta.x - rotatedDelta.x,
    y: piece.position.y + pivotDelta.y - rotatedDelta.y,
  };
}
