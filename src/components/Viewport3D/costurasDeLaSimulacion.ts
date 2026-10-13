import type { Seam, SeamGroup } from '../../types/types';
import type { SeamInitData } from '../../utils/cloth/clothWorker';

/**
 * Convert Seam[] to SeamInitData[] for the worker.
 * Filters out inactive seams and passes extended fields (tension, strength, etc.).
 */
export function seamsToInitData(seams: Seam[], seamGroups?: SeamGroup[]): SeamInitData[] {
  // Convert regular seams, filtering out inactive ones
  const seamEntries: SeamInitData[] = seams
    .filter(s => s.active !== false)
    .map(s => ({
      id: s.id,
      pieceAId: s.pieceA.pieceId,
      pieceAEdgeName: s.pieceA.edgeName,
      pieceBId: s.pieceB.pieceId,
      pieceBEdgeName: s.pieceB.edgeName,
      type: s.type,
      pieceARange: s.pieceA.tStart != null && s.pieceA.tEnd != null
        ? [s.pieceA.tStart, s.pieceA.tEnd] as [number, number]
        : undefined,
      pieceBRange: s.pieceB.tStart != null && s.pieceB.tEnd != null
        ? [s.pieceB.tStart, s.pieceB.tEnd] as [number, number]
        : undefined,
      // Sewing direction (Fase 5) — flows through every tier's resolution.
      pieceBReversed: s.pieceB.reversed === true ? true : undefined,
      tension: s.tension ?? 100,
      strength: s.strength ?? 1.0,
      active: true,
      taped: s.taped ?? false,
      // Proveniencia — solo para el color de las seam lines (seamThreadColor).
      createdBy: s.createdBy,
    }));

  // Flatten SeamGroups into additional SeamInitData entries
  if (seamGroups) {
    for (const group of seamGroups) {
      if (!group.active) continue;
      const count = Math.min(group.edgesA.length, group.edgesB.length);
      for (let i = 0; i < count; i++) {
        const edgeA = group.edgesA[i];
        const edgeB = group.edgesB[i];
        seamEntries.push({
          id: `${group.id}_${i}`,
          pieceAId: edgeA.pieceId,
          pieceAEdgeName: edgeA.edgeName,
          pieceBId: edgeB.pieceId,
          pieceBEdgeName: edgeB.edgeName,
          type: group.type,
          pieceARange: edgeA.tStart != null && edgeA.tEnd != null
            ? [edgeA.tStart, edgeA.tEnd] as [number, number]
            : undefined,
          pieceBRange: edgeB.tStart != null && edgeB.tEnd != null
            ? [edgeB.tStart, edgeB.tEnd] as [number, number]
            : undefined,
          tension: group.tension ?? 100,
          strength: group.strength ?? 1.0,
          active: true,
          taped: group.taped ?? false,
        });
      }
    }
  }

  return seamEntries;
}
