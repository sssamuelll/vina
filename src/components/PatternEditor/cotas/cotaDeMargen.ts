import type { PatternPiece, SemanticEdge } from '../../../types/types';
import { pointAt } from '../../../utils/geometry/outlineRing';
import { pieceLocalToPattern } from '../../../utils/geometry/pieceSpace';
import { bboxPivot, computeBoundingBox } from '../../../utils/geometry/transform';
import { margenEnPunto } from '../../../utils/seam/margenEnPunto';
import { spanLengthMm } from '../distanceCommit';
import { edgePointAtT, edgeSpanMm, ringForOutline } from '../edgeArc';
import { normalHaciaFuera, type Cota } from './cotas';

/** La lectura y la escritura del margen comparten una sola cota viva. */
export function cotaDeMargen(
  piece: PatternPiece,
  edge: SemanticEdge,
  t: number,
): Cota | null {
  // El mismo anillo (y el mismo caché) con el que el hook resolvió `t`.
  const ring = ringForOutline(piece.outline);
  if (!ring) return null;

  const spanMm = edgeSpanMm(ring, edge.segmentRange);
  const lengthMm = spanLengthMm(ring, spanMm);
  if (lengthMm <= 0) return null;

  const clampedT = Math.max(0, Math.min(1, t));
  const distanceMm = spanMm[0] + clampedT * lengthMm;
  const point = pieceLocalToPattern(edgePointAtT(ring, edge.segmentRange, clampedT), piece);
  const before = pieceLocalToPattern(pointAt(ring, distanceMm - 0.5).point, piece);
  const after = pieceLocalToPattern(pointAt(ring, distanceMm + 0.5).point, piece);
  // Con la propia pieza como única seleccionada, la caja nunca es null.
  const centro = bboxPivot(computeBoundingBox([piece], [piece.id])!);
  const margen = margenEnPunto(piece, edge, clampedT);

  return {
    id: `margen:${piece.id}:${edge.id}`,
    kind: 'margen',
    label: `Margen · ${edge.name}`,
    valueMm: margen.mm,
    unit: 'mm',
    min: 0,
    max: 100,
    primary: margen.fuente !== 'pieza',
    rotulo: margen.fuente === 'pieza'
      ? 'de la pieza'
      : margen.fuente === 'tramo'
        ? 'del tramo'
        : undefined,
    scrub: false,
    a: point,
    b: point,
    outward: normalHaciaFuera(before, after, centro),
    apply: width => ({
      kind: 'margen',
      pieceId: piece.id,
      edgeId: edge.id,
      fuente: margen.fuente,
      ...(margen.fuente === 'tramo' ? { spanIndex: margen.spanIndex } : {}),
      width,
    }),
  };
}
