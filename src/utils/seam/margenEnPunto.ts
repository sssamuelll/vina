import type { PatternPiece, SemanticEdge } from '../../types/types';

export type FuenteMargen = 'tramo' | 'borde' | 'pieza';

export type MargenEnPunto =
  | { mm: number; fuente: 'tramo'; spanIndex: number }
  | { mm: number; fuente: 'borde' | 'pieza' };

/** La cascada visible y editable del margen en un punto exacto del borde. */
export function margenEnPunto(
  piece: PatternPiece,
  edge: SemanticEdge,
  t: number,
): MargenEnPunto {
  const spanIndex = edge.seamAllowanceSpans?.findIndex(span => (
    span.tStart <= t && (t < span.tEnd || (t === 1 && span.tEnd === 1))
  )) ?? -1;
  if (spanIndex >= 0) {
    return {
      mm: edge.seamAllowanceSpans![spanIndex].width,
      fuente: 'tramo',
      spanIndex,
    };
  }
  if (edge.seamAllowanceWidth != null) {
    return { mm: edge.seamAllowanceWidth, fuente: 'borde' };
  }
  return { mm: piece.seamAllowance ?? 0, fuente: 'pieza' };
}
