import type { PatternPiece, Point2D } from '../../types/types';
import { patternToPieceLocal } from '../geometry/pieceSpace';
import { findNearestOutlineVertex } from './edgeHitTest';
import { effectiveSeamAllowanceWidth } from './index';

/** El margen más ancho de la pieza: el escalar, el de cada borde y el de cada tramo. */
export function margenMasAncho(piece: PatternPiece): number {
  const deBordes = (piece.edges ?? []).flatMap((e) => [
    e.seamAllowanceWidth ?? 0,
    ...(e.seamAllowanceSpans ?? []).map((s) => s.width),
  ]);
  return Math.max(effectiveSeamAllowanceWidth(piece), 0, ...deBordes);
}

/** Lo que el radio suma a la punta del margen, en px de pantalla. */
const HOLGURA_PX = 10;

/**
 * La esquina del margen bajo un clic de Seleccionar (spec 2026-10-02 § 5.2,
 * P3c, la puerta de vuelta). La llama la rama del VACÍO del lienzo: dentro del
 * contorno neto, el clic es de la pieza. Solo donde el margen se ve, porque sin
 * margen el tipo de esquina no pinta nada. El radio cubre la punta (el ancho
 * por √2) más 10 px. Entre varias piezas gana la esquina más cercana.
 *
 * ponytail: el radio usa el margen más ancho de la pieza; si una esquina de
 * margen estrecho le roba el clic a una vecina, el radio pasa a ser por esquina.
 */
export function esquinaDelMargenEn(
  pieces: readonly PatternPiece[],
  punto: Point2D,
  zoom: number,
  mostrarMargen: boolean,
): { pieceId: string; vertexIndex: number } | null {
  if (!mostrarMargen) return null;
  let mejor: { pieceId: string; vertexIndex: number; dist: number } | null = null;
  for (const piece of pieces) {
    const margen = margenMasAncho(piece);
    if (!(margen > 0) || !piece.outline?.length) continue;
    const local = patternToPieceLocal(punto, piece);
    const v = findNearestOutlineVertex(piece.outline, local, margen * Math.SQRT2 + HOLGURA_PX / zoom);
    if (v && (!mejor || v.dist < mejor.dist)) mejor = { pieceId: piece.id, vertexIndex: v.index, dist: v.dist };
  }
  return mejor && { pieceId: mejor.pieceId, vertexIndex: mejor.vertexIndex };
}
