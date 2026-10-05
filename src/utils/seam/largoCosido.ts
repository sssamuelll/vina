import type { PatternPiece, Seam } from '../../types/types';
import { computeRangeLengthMM } from '../geometry/edgeInterpolation';
import { sewnLengthMm } from './seamRange';
import { edgeNToCommandIndex } from './index';

/**
 * El largo cosido de un lado de una costura, medido en el momento (spec
 * 2026-10-05 § 5.3, regla 2): el borde ENTERO —el DXF de María trae bordes
 * de 14-20 comandos— por la fracción cosida. `reversed` cambia el sentido,
 * no el largo. `undefined` si el borde no existe: no se inventa un número.
 */
export function largoCosidoDeLado(piece: PatternPiece, lado: Seam['pieceA'] | Seam['pieceB']): number | undefined {
  const borde = piece.edges?.find(e => e.name === lado.edgeName);
  if (borde) return sewnLengthMm(computeRangeLengthMM(piece.outline, borde.segmentRange), lado);
  // «edge-N» heredado: N ES un índice de comando (el contrato de
  // resolveEdgeName), y ese borde es ese único comando.
  const indice = edgeNToCommandIndex(piece.outline, lado.edgeName);
  if (indice == null) return undefined;
  return sewnLengthMm(computeRangeLengthMM(piece.outline, [indice, indice + 1]), lado);
}

/** Los dos largos cosidos de una costura: una sola medida para el lienzo y para los agentes. */
export function largosDeCostura(seam: Seam, pieces: readonly PatternPiece[]): { a: number | undefined; b: number | undefined } {
  const pa = pieces.find(p => p.id === seam.pieceA.pieceId);
  const pb = pieces.find(p => p.id === seam.pieceB.pieceId);
  return {
    a: pa ? largoCosidoDeLado(pa, seam.pieceA) : undefined,
    b: pb ? largoCosidoDeLado(pb, seam.pieceB) : undefined,
  };
}
