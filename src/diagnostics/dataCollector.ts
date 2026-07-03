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
import { flattenPath } from '../utils/seam';
import type { Point2D } from '../types/types';
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

// ─── Utilities ───────────────────────────────────────────────────────────────

/**
 * Compute the area of a polygon using the Shoelace formula.
 * The input points are assumed to be a closed loop in mm.
 *
 * @param points Array of Point2D coordinates
 * @returns Area in mm2
 */
function computeShoelaceArea(points: Point2D[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    area += p1.x * p2.y - p2.x * p1.y;
  }
  return Math.abs(area) / 2;
}

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
  // Stub data for a missing piece. area: 0 with empty seams[] would normally
  // trigger ruleTinyPiece, but this is harmless — the stub represents a deleted
  // or orphaned reference, and surfacing a "tiny piece" warning is appropriate.
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
        area: 0,
      },
      seams: [],
      internals: [],
    };
  }

  // ─── Piece metadata ───────────────────────────────────────────────────────
  const area = computeShoelaceArea(flattenPath(piece.outline));

  const pieceData: InspectionPieceData = {
    id: piece.id,
    name: piece.name,
    position: piece.position ?? { x: 0, y: 0 },
    rotation: piece.rotation ?? 0,
    seamAllowance: piece.seamAllowance ?? 0,
    area,
    category: piece.category,
    interfacingType: piece.interfacingType,
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

  // ─── Unresolved construction points ──────────────────────────────────────
  const unresolvedPoints: Array<{ label: string; error: string }> = [];
  const { pieceIdentityMap, pieces: cPieces, points: cPoints } = state.construction;
  // Reverse lookup: find construction piece ID whose pattern piece ID matches
  for (const [cPieceId, patternPieceId] of Object.entries(pieceIdentityMap)) {
    if (patternPieceId === piece.id) {
      const cPiece = cPieces.find(cp => cp.id === cPieceId);
      if (cPiece) {
        for (const node of cPiece.nodes) {
          const pt = cPoints.find(p => p.id === node.pointId);
          if (pt?.resolutionError) {
            unresolvedPoints.push({ label: pt.label, error: pt.resolutionError });
          }
        }
      }
      break;
    }
  }

  // ─── Simulation metadata ──────────────────────────────────────────────────
  // collisionDistance (mm): min signed cloth↔body distance from the
  // penetration metric (§A1) — feeds `fit:body-penetration` / `fit:pressure-point`.
  // null = never computed → left undefined so the fit rules stay silent.
  const simulation: InspectionSimulationData = {
    particleCount: state.simulation.particleCount,
    ...(state.simulation.collisionDistance !== null
      ? { collisionDistance: state.simulation.collisionDistance }
      : {}),
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
    ...(unresolvedPoints.length > 0 ? { unresolvedPoints } : {}),
  };
}
