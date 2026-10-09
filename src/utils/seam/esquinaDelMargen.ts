import type { PatternPiece, Point2D } from '../../types/types';
import { buildRing, projectToRing } from '../geometry/outlineRing';
import { patternToPieceLocal } from '../geometry/pieceSpace';
import { pointInPolygon } from '../geometry/slashAndSpread';
import { generateSeamAllowanceWithCorners } from './cornerTypes';
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

/** Cuánto se aleja el clic del vértice, como mucho, más allá de la punta del margen (px). */
const HOLGURA_PX = 10;
/** La orilla de la línea de corte que todavía cuenta como banda (px): el blanco que se ve, no un disco. */
const ORILLA_PX = 6;

/**
 * La línea de corte, como la pinta `PieceRenderer`.
 * ponytail: sin `matchLookup`, una esquina «empatada» se mide como la genera el
 * motor sin su pareja; si una de esas pierde el clic, pasarle la búsqueda.
 */
function lineaDeCorte(piece: PatternPiece) {
  return generateSeamAllowanceWithCorners(
    piece.outline,
    effectiveSeamAllowanceWidth(piece),
    piece.defaultCornerType ?? 'mitered',
    piece.cornerTypes ?? {},
    piece.edges,
  );
}

/** Sobre la banda pintada del margen: dentro de la línea de corte, o a `orilla` de ella. */
function sobreLaBanda(piece: PatternPiece, local: Point2D, orilla: number): boolean {
  const corte = lineaDeCorte(piece);
  if (corte.length === 0) return false;
  if (pointInPolygon(local, corte)) return true;
  const anillo = buildRing(corte, 2);
  if (!anillo.ok) return false;
  const { point } = projectToRing(anillo.value, local);
  return Math.hypot(point.x - local.x, point.y - local.y) <= orilla;
}

/**
 * La esquina del margen bajo un clic de Seleccionar (spec 2026-10-02 § 5.2,
 * P3c, la puerta de vuelta). La llama la rama del VACÍO del lienzo.
 *
 * El blanco es lo que se ve: la banda pintada del margen junto a la esquina.
 * - Fuera del contorno neto, aunque el relleno no reciba el clic («alambre»).
 * - Dentro de la línea de corte, o a 6 px de ella. Fuera de eso el clic sigue
 *   siendo vacío: suelta la selección y tira la goma (revisión final de P3c).
 * - Cerca del vértice: el ancho del margen por √2, más 10 px.
 * Solo donde el margen se ve. Entre varias piezas gana la esquina más cercana.
 *
 * ponytail: el radio usa el margen más ancho de la pieza; con un dobladillo
 * en otro borde, la banda de esta esquina cuenta hasta más lejos a lo largo
 * de sus lados. Si molesta, el ancho de los dos lados de la esquina.
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
    if (!v || (mejor && v.dist >= mejor.dist)) continue;
    if (pointInPolygon(local, piece.outline)) continue;
    if (!sobreLaBanda(piece, local, ORILLA_PX / zoom)) continue;
    mejor = { pieceId: piece.id, vertexIndex: v.index, dist: v.dist };
  }
  return mejor && { pieceId: mejor.pieceId, vertexIndex: mejor.vertexIndex };
}
