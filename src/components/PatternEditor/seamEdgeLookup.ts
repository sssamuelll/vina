import type { Seam } from '../../types/types';

/**
 * Qué costuras tocan este borde, mirando las dos mitades.
 *
 * Un borde puede llevar más de una costura a propósito: una manga contra dos
 * mitades de sisa, un canesú partido. Por eso devuelve una lista y no una sola
 * — y por eso el modo Editar es un modo y no un hit-test que sustituya al de
 * crear (#219).
 */
export function seamsOnEdge(seams: Seam[], pieceId: string, edgeName: string): Seam[] {
  return seams.filter(s =>
    (s.pieceA.pieceId === pieceId && s.pieceA.edgeName === edgeName) ||
    (s.pieceB.pieceId === pieceId && s.pieceB.edgeName === edgeName),
  );
}

/** Clic repetido sobre el mismo borde: cicla por sus costuras. */
export function nextSeamOnEdge(onEdge: Seam[], currentId: string | null): Seam | null {
  if (onEdge.length === 0) return null;
  const i = currentId ? onEdge.findIndex(s => s.id === currentId) : -1;
  return onEdge[(i + 1) % onEdge.length];
}
