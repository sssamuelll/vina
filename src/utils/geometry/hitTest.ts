// src/utils/geometry/hitTest.ts
import type { Point2D, PatternPiece } from '../../types/types';
import { patternToPieceLocal } from './pieceSpace';

/**
 * Caja del contorno en el marco LOCAL de la pieza — sin posición y sin giro.
 *
 * Construirla en espacio de patrón sumando `position` daba la caja del
 * fantasma sin girar: desde #1033 el ángulo vive en `piece.rotation` y no en
 * las coordenadas del contorno (#1064). Midiendo en local y trayendo el punto
 * hasta aquí sale además la caja ORIENTADA de balde, que es la que la pieza
 * ocupa de verdad y no su envolvente eje-alineada.
 */
function localBBox(piece: PatternPiece) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const cmd of piece.outline) {
    const v = cmd.values;
    for (let i = 0; i + 1 < v.length; i += 2) {
      if (v[i] < minX) minX = v[i];
      if (v[i] > maxX) maxX = v[i];
      if (v[i + 1] < minY) minY = v[i + 1];
      if (v[i + 1] > maxY) maxY = v[i + 1];
    }
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Bounding-box hit test: find the first piece whose bbox contains the point.
 * Iterates piece outlines to compute bbox on the fly.
 */
export function hitTestPieceBBox(pt: Point2D, pieces: PatternPiece[]): PatternPiece | null {
  for (const piece of pieces) {
    const { minX, minY, maxX, maxY } = localBBox(piece);
    const local = patternToPieceLocal(pt, piece);
    if (local.x >= minX && local.x <= maxX && local.y >= minY && local.y <= maxY) {
      return piece;
    }
  }
  return null;
}
