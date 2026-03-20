/**
 * Data Collector for the Diagnostic Inspector
 *
 * Pure synchronous function that reads Redux state and assembles all
 * available inspection data for a given InspectionTarget.
 *
 * @module dataCollector
 */

import type { RootState } from '../store';
import { getPhysicalFabric } from '../utils/cloth/physicalFabric';
import type {
  InspectionTarget,
  InspectionData,
  InspectionPieceData,
  InspectionEdgeData,
  InspectionSeamData,
  InspectionInternalData,
  InspectionConstructionPointData,
  InspectionSimulationData,
} from './types';

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * Collect all available inspection data for the given target from Redux state.
 *
 * This function is pure and synchronous — it never dispatches actions or
 * produces side effects.
 */
export function collectInspectionData(
  target: InspectionTarget,
  state: RootState,
): InspectionData {
  const piece = state.project.pieces.find(p => p.id === target.pieceId);

  // ─── Fallback when piece is not found ────────────────────────────────────
  if (!piece) {
    return {
      target,
      timestamp: Date.now(),
      piece: {
        id: target.pieceId,
        name: 'Unknown',
        position: { x: 0, y: 0 },
        rotation: 0,
        seamAllowance: 0,
      },
      seams: [],
      internals: [],
    };
  }

  // ─── Piece metadata ───────────────────────────────────────────────────────
  const pieceData: InspectionPieceData = {
    id: piece.id,
    name: piece.name,
    position: piece.position ?? { x: 0, y: 0 },
    rotation: piece.rotation ?? 0,
    seamAllowance: piece.seamAllowance ?? 0,
  };

  // ─── Fabric ───────────────────────────────────────────────────────────────
  const fabric = piece.fabricId ? getPhysicalFabric(piece.fabricId) : undefined;

  // ─── Edge data ────────────────────────────────────────────────────────────
  let edge: InspectionEdgeData | undefined;
  if (target.edgeName && piece.edges) {
    const semanticEdge = piece.edges.find(e => e.name === target.edgeName);
    if (semanticEdge) {
      edge = {
        name: semanticEdge.name,
        type: semanticEdge.edgeType,
        length: semanticEdge.length ?? 0,
      };
    }
  }

  // ─── Seam connections ─────────────────────────────────────────────────────
  const seams: InspectionSeamData[] = [];
  for (const seam of state.project.seams) {
    const isA = seam.pieceA.pieceId === piece.id;
    const isB = seam.pieceB.pieceId === piece.id;

    if (isA) {
      const partnerPiece = state.project.pieces.find(p => p.id === seam.pieceB.pieceId);
      seams.push({
        id: seam.id,
        partnerPieceId: seam.pieceB.pieceId,
        partnerPieceName: partnerPiece?.name ?? 'Unknown',
        edgeName: seam.pieceA.edgeName,
        type: seam.type,
        tension: seam.tension,
        strength: seam.strength,
        active: seam.active,
        taped: seam.taped,
      });
    } else if (isB) {
      const partnerPiece = state.project.pieces.find(p => p.id === seam.pieceA.pieceId);
      seams.push({
        id: seam.id,
        partnerPieceId: seam.pieceA.pieceId,
        partnerPieceName: partnerPiece?.name ?? 'Unknown',
        edgeName: seam.pieceB.edgeName,
        type: seam.type,
        tension: seam.tension,
        strength: seam.strength,
        active: seam.active,
        taped: seam.taped,
      });
    }
  }

  // ─── Internal line counts grouped by type ────────────────────────────────
  const internalCountMap = new Map<string, number>();
  for (const internal of piece.internals) {
    internalCountMap.set(internal.type, (internalCountMap.get(internal.type) ?? 0) + 1);
  }
  const internals: InspectionInternalData[] = Array.from(internalCountMap.entries()).map(
    ([type, count]) => ({ type, count }),
  );

  // ─── Construction point ───────────────────────────────────────────────────
  let constructionPoint: InspectionConstructionPointData | undefined;
  if (target.constructionPointId) {
    const cPoint = state.construction.points.find(p => p.id === target.constructionPointId);
    if (cPoint) {
      constructionPoint = {
        label: cPoint.label,
        x: cPoint.x,
        y: cPoint.y,
        definitionType: cPoint.definition.type,
      };
    }
  }

  // ─── Simulation metadata ──────────────────────────────────────────────────
  const simulation: InspectionSimulationData = {
    particleCount: state.simulation.particleCount,
  };

  const pieces = state.project.pieces;

  return {
    target,
    timestamp: Date.now(),
    piece: pieceData,
    fabric,
    edge,
    seams,
    internals,
    constructionPoint,
    simulation,
    layer: piece.layer,
    sublayer: piece.sublayer,
    bodyRegion: piece.bodyRegion,
    piecesOnSameLayer: pieces
      .filter(p => p.id !== piece.id && (p.layer ?? 1) === (piece.layer ?? 1))
      .map(p => ({ id: p.id, name: p.name, bodyRegion: p.bodyRegion })),
    poms: state.project.poms,
    pieceActive: piece.active,
  };
}
