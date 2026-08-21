import type { PatternPiece, Point2D } from '../../types/types';
import { outlineBBoxCenter, rotatePoint } from './transform';

/**
 * Espacio de patrón ↔ espacio local de la pieza.
 *
 * Desde #1033 el giro es DECLARATIVO: el tirador escribe `piece.rotation` y el
 * renderizador lo aplica como un `rotate()` sobre el grupo, en vez de hornear
 * el ángulo en las coordenadas del `outline`. Eso abre una diferencia real
 * entre los dos espacios, y cualquier conversión hecha a mano —restar solo
 * `position`— apunta a donde la pieza estaba ANTES de girar (#1064).
 *
 * Vivían en `components/PatternEditor/pieceTransform.ts`, que los sigue
 * re-exportando. Se mudaron aquí porque los hit-tests de `utils/seam/` también
 * los necesitan y no pueden importar hacia `components/`.
 */

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
