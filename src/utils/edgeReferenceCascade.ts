/**
 * Edge Reference Cascade — updates edgeName references across seams,
 * elastics, and pleats when edges are renamed or removed.
 *
 * @module edgeReferenceCascade
 */

import type { Seam, Elastic, Pleat } from '../types/types';

/**
 * Rename an edge across all referencing entities.
 * Returns updated copies of the arrays (immutable).
 */
export function renameEdgeReferences(
  pieceId: string,
  oldName: string,
  newName: string,
  seams: Seam[],
  elastics: Elastic[],
  pleats: Pleat[],
): { seams: Seam[]; elastics: Elastic[]; pleats: Pleat[] } {
  const updatedSeams = seams.map(s => {
    let changed = false;
    const a = { ...s.pieceA };
    const b = { ...s.pieceB };
    if (a.pieceId === pieceId && a.edgeName === oldName) { a.edgeName = newName; changed = true; }
    if (b.pieceId === pieceId && b.edgeName === oldName) { b.edgeName = newName; changed = true; }
    return changed ? { ...s, pieceA: a, pieceB: b } : s;
  });

  const updatedElastics = elastics.map(e =>
    e.pieceId === pieceId && e.edgeName === oldName
      ? { ...e, edgeName: newName }
      : e,
  );

  const updatedPleats = pleats.map(p =>
    p.pieceId === pieceId && p.edgeName === oldName
      ? { ...p, edgeName: newName }
      : p,
  );

  return { seams: updatedSeams, elastics: updatedElastics, pleats: updatedPleats };
}

/**
 * Remove all references to a deleted edge.
 * Seams referencing the edge are removed entirely.
 * Elastics and pleats referencing the edge are removed.
 */
export function removeEdgeReferences(
  pieceId: string,
  edgeName: string,
  seams: Seam[],
  elastics: Elastic[],
  pleats: Pleat[],
): { seams: Seam[]; elastics: Elastic[]; pleats: Pleat[] } {
  return {
    seams: seams.filter(s =>
      !(s.pieceA.pieceId === pieceId && s.pieceA.edgeName === edgeName) &&
      !(s.pieceB.pieceId === pieceId && s.pieceB.edgeName === edgeName),
    ),
    elastics: elastics.filter(e => !(e.pieceId === pieceId && e.edgeName === edgeName)),
    pleats: pleats.filter(p => !(p.pieceId === pieceId && p.edgeName === edgeName)),
  };
}
