import type { PatternPiece } from '../../types/types';
import type { MeshedPiece as SimMeshedPiece } from '../../utils/cloth/simulationInitClient';
import type { MeshedPiece } from './useMeshing';

/**
 * Lo mallado más lo que el resto lee de su pieza: el contorno y los bordes
 * (las costuras se resuelven sobre ellos) y la densidad con que se malló (M4).
 * La llaman useMeshing, al pulsar «Simular», y el preparador (usePrepararTela):
 * de las mismas mallas, las mismas piezas y la misma huella de la tela.
 */
export function mallasDePiezas(
  meshed: SimMeshedPiece[],
  pieces: PatternPiece[],
  densidades: Record<string, number>,
  densidad: number,
): MeshedPiece[] {
  return meshed.map(m => {
    const piece = pieces.find(p => p.id === m.pieceId);
    return {
      ...m,
      outline: (piece?.outline ?? []) as Array<{ type: string; values: number[] }>,
      edges: piece?.edges?.map(e => ({ name: e.name, segmentRange: e.segmentRange })),
      meshMaxEdgeLength: densidades[m.pieceId] ?? densidad,
    };
  });
}
