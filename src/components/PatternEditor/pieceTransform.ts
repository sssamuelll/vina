import type { PatternPiece, Point2D } from '../../types/types';
import { outlineBBoxCenter, rotatePoint } from '../../utils/geometry/transform';

type TransformablePiece = Pick<PatternPiece, 'position' | 'outline' | 'rotation'>;

/**
 * Express a pattern-space point in the piece's unrotated local frame by
 * removing its offset and render rotation around the current outline pivot.
 */
export function patternToPieceLocal(
  patternPt: Point2D,
  piece: TransformablePiece,
): Point2D {
  const local = {
    x: patternPt.x - piece.position.x,
    y: patternPt.y - piece.position.y,
  };
  const rotation = piece.rotation ?? 0;
  if (!rotation) return local;
  return rotatePoint(
    local,
    outlineBBoxCenter(piece.outline),
    -rotation * Math.PI / 180,
  );
}

/**
 * Igual que {@link patternToPieceLocal} pero para una DIRECCIÓN — una normal,
 * un eje, un vector de arrastre: se gira, no se traslada.
 *
 * Existe porque tratar una dirección como punto la manda a la otra punta de la
 * pieza: la traslación no tiene sentido sobre algo que solo lleva sentido y
 * magnitud. `createNotchLine` recibe un punto Y una normal, y cada uno va por
 * su lado.
 */
export function patternToPieceLocalDirection(
  dir: Point2D,
  piece: TransformablePiece,
): Point2D {
  const rotation = piece.rotation ?? 0;
  if (!rotation) return dir;
  return rotatePoint(dir, { x: 0, y: 0 }, -rotation * Math.PI / 180);
}

/** Project an unrotated piece-local point through the piece's render transform. */
export function pieceLocalToPattern(
  localPt: Point2D,
  piece: TransformablePiece,
): Point2D {
  const rotation = piece.rotation ?? 0;
  const projected = rotation
    ? rotatePoint(
        localPt,
        outlineBBoxCenter(piece.outline),
        rotation * Math.PI / 180,
      )
    : localPt;
  return {
    x: projected.x + piece.position.x,
    y: projected.y + piece.position.y,
  };
}

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
