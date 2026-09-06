import type { PatternPiece } from '../types/types';

/**
 * ¿Está bloqueada esta pieza? Las dos formas del candado pesan igual: el de la
 * pieza (`piece.locked`, del menú contextual) y el de su capa
 * (`project.layerLocked`, de la fila de capas).
 *
 * Existe porque la regla estaba escrita a mano en seis sitios —`sujeto.ts` ×3,
 * `PieceRenderer`, `useScissorsTool`, `LayerPanel`— y todos ellos deciden qué
 * PINTAR. Ninguno decidía qué se puede ESCRIBIR, que es lo que #1136 encontró:
 * el chip del margen salía apagado sobre una pieza bloqueada y el gesto le
 * escribía el número igual. El comentario de `sujeto.ts:213-215` ya avisaba de
 * que esto "prometía escritura sobre una pieza bloqueada"; la promesa se
 * cumplió por el lado que ese comentario no miraba.
 *
 * Una pieza sin `layer` vive en la 1 — misma convención que `LayerPanel:48`.
 */
export function piezaBloqueada(
  piece: Pick<PatternPiece, 'locked' | 'layer'>,
  layerLocked: Readonly<Record<number, boolean>>,
): boolean {
  return Boolean(piece.locked) || Boolean(layerLocked[piece.layer ?? 1]);
}
