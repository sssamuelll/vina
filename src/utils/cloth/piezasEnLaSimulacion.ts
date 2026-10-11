import type { PatternPiece } from '../../types/types';

/**
 * Por qué la simulación deja fuera una pieza, o `null` si la coloca y la
 * viste: apagada, oculta en 3D o en una capa oculta. Es el único filtro: lo
 * usan GarmentSimulation (lo que llega al solver), Viewport3D (la colocación)
 * y la superficie (IA 1b-2), para que el agente vea las piezas que la app
 * viste. Antes eran dos copias a mano y los verbos miraban solo `active`.
 */
export function porQueNoSeSimula(
  p: PatternPiece,
  hiddenPieceIds: readonly string[],
  hiddenLayerIds: readonly number[],
): string | null {
  if (p.active === false) return 'inactive';
  if (hiddenPieceIds.includes(p.id)) return 'hidden in 3D';
  const capa = p.layer ?? 1;
  if (hiddenLayerIds.includes(capa)) return `layer ${capa} is hidden`;
  return null;
}

export function seSimula(
  p: PatternPiece,
  hiddenPieceIds: readonly string[],
  hiddenLayerIds: readonly number[],
): boolean {
  return porQueNoSeSimula(p, hiddenPieceIds, hiddenLayerIds) === null;
}
