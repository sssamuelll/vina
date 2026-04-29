/**
 * Layer offset computation for multi-layer garment collision margins.
 *
 * When garment pieces are stacked in layers (e.g., shirt over t-shirt),
 * each outer layer needs a larger collision margin so it doesn't interpenetrate
 * the layers beneath it. These utilities compute per-piece and per-vertex
 * margins derived from real fabric thickness data.
 *
 * @module layerOffsets
 */

import { getPhysicalFabric } from './physicalFabric';
import { mmToM } from '../geometry';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Minimal pattern-piece fields required for layer offset computation. */
interface LayerPiece {
  id: string;
  /** Garment layer; undefined treated as 1 (shell). */
  layer?: number;
  /** Fine ordering within same layer; undefined treated as 0. */
  sublayer?: number;
  /** Body region for grouping adjacent layers. */
  bodyRegion?: string;
  fabricId?: string;
}

/** Description of a merged mesh and the piece ranges within it. */
export interface MergedMeshInfo {
  vertexCount: number;
  pieces: { pieceId: string; start: number; count: number }[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Default fabric thickness in mm when no fabric is assigned or fabric is unknown. */
const DEFAULT_THICKNESS_MM = 0.5;

/** Base collision margin in meters applied to every vertex before layer offsets. */
const BASE_MARGIN_M = 0.002;

// ─── lookupFabricThickness ────────────────────────────────────────────────────

/**
 * Returns the fabric thickness in millimetres for a given fabricId.
 *
 * Fallback chain:
 *  1. No fabricId → 0.5 mm
 *  2. Fabric found in library → fabric.thickness (mm)
 *  3. Fabric not found → 0.5 mm
 */
export function lookupFabricThickness(fabricId?: string): number {
  if (!fabricId) return DEFAULT_THICKNESS_MM;
  const fabric = getPhysicalFabric(fabricId);
  if (!fabric) return DEFAULT_THICKNESS_MM;
  return fabric.thickness ?? DEFAULT_THICKNESS_MM;
}

// ─── computeLayerOffset ───────────────────────────────────────────────────────

/**
 * Computes the additional collision offset (in **metres**) for a piece based on
 * the cumulative thickness of all pieces on lower layers in the same body region.
 *
 * Rules:
 * - piece.layer <= 0 → returns 0 (innermost layer, no offset needed)
 * - Sums thickness of every piece where:
 *     p.layer < piece.layer AND p.bodyRegion === piece.bodyRegion AND p.id !== piece.id
 * - Converts the mm sum to metres (÷ 1000)
 */
export function computeLayerOffset(
  piece: LayerPiece,
  allPieces: LayerPiece[],
): number {
  const pieceLayer = piece.layer ?? 1;
  if (pieceLayer <= 0) return 0;

  let totalThicknessMm = 0;

  for (const p of allPieces) {
    if (p.id === piece.id) continue;
    if ((p.bodyRegion ?? '') !== (piece.bodyRegion ?? '')) continue;
    const pLayer = p.layer ?? 1;
    if (pLayer >= pieceLayer) continue;

    totalThicknessMm += lookupFabricThickness(p.fabricId);
  }

  return mmToM(totalThicknessMm);
}

// ─── buildMarginArray ─────────────────────────────────────────────────────────

/**
 * Builds a per-vertex collision margin array for a merged cloth mesh.
 *
 * Every vertex starts at the base margin (2 mm = 0.002 m). For each piece in
 * the merged mesh, the layer offset is added on top so that outer layers float
 * above inner ones during simulation.
 *
 * @param mergedMesh  Vertex count and piece ranges within the merged buffer.
 * @param pieces      The pattern pieces whose vertices are in this merged mesh
 *                    (used to look up layer / bodyRegion / fabricId).
 * @param allPieces   The full set of pieces in the garment (needed to find
 *                    what sits below each piece).
 * @returns Float32Array of length mergedMesh.vertexCount.
 */
export function buildMarginArray(
  mergedMesh: MergedMeshInfo,
  pieces: LayerPiece[],
  allPieces: LayerPiece[],
): Float32Array {
  const margins = new Float32Array(mergedMesh.vertexCount).fill(BASE_MARGIN_M);

  // Build a quick id → piece lookup
  const pieceById = new Map<string, LayerPiece>();
  for (const p of pieces) {
    pieceById.set(p.id, p);
  }

  for (const slot of mergedMesh.pieces) {
    const piece = pieceById.get(slot.pieceId);
    if (!piece) continue; // unknown piece id — leave base margin

    const layerOffset = computeLayerOffset(piece, allPieces);
    const margin = BASE_MARGIN_M + layerOffset;

    const end = slot.start + slot.count;
    for (let i = slot.start; i < end; i++) {
      margins[i] = margin;
    }
  }

  return margins;
}
