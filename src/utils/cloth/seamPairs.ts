/**
 * Convert CPU/WASM seam init data to GPU-shape SeamPair[].
 *
 * The CPU and WASM tiers consume edge-name-based `SeamInitData` and build
 * full XPBD distance constraint sets (rest lengths + compliance) via
 * `seamAssembly.buildSeamConstraints`. The GPU TSL kernel computes those
 * internally and only needs vertex-index pairs per piece pair.
 *
 * This helper mirrors the edge-name → vertex-index resolution from
 * `buildSeamConstraints` (`parameterizeEdge` + `matchVertices`) but emits
 * LOCAL piece-relative indices because `GpuSolverClient.initMultiPieceTsl`
 * adds per-piece vertex offsets internally when packing the GPU buffer.
 *
 * Per A3 § 3.2 (silent fallback UI surfacing), per-seam resolution failures
 * (missing piece, unknown edge, empty match) are logged loudly via
 * `console.warn` with `[seamPairs]` prefix and skipped. CPU/WASM also skip
 * the same inputs in `buildSeamConstraints`, but more quietly; this helper
 * is intentionally louder so divergent input data shows up in dev tools.
 * The asymmetry is intentional — GPU init is one-shot (warn fires once per
 * session per bad seam input) vs CPU/WASM per-step (a warn there would
 * flood the console unactionably).
 * Net effect: same skip behavior across tiers, audibility added on GPU.
 *
 * @see #732 — GPU tier seam constraints integration.
 * @see seamAssembly.ts:buildSeamConstraints — reference implementation.
 *
 * @module seamPairs
 */

import type { PathCommand } from '../../types/types';
import type { SeamInitData } from './clothWorker';
import { parameterizeEdge, matchVertices } from './seamAssembly';
import { flattenPath } from '../seam/index';

/**
 * GPU-tier seam pair: piece IDs + LOCAL (piece-relative) vertex index pairs.
 *
 * Matches the param shape consumed by `GpuSolverClient.initMultiPieceTsl`,
 * which adds the per-piece vertex offset internally when building the GPU
 * seam constraint buffer.
 */
export interface SeamPair {
  pieceAId: string;
  pieceBId: string;
  /** [localVertexIdxInPieceA, localVertexIdxInPieceB] pairs. */
  vertexPairs: Array<[number, number]>;
}

/**
 * Structural input — accepts `PlacedMesh` and the worker's piece type.
 * Only the fields required for edge-name resolution are listed.
 */
export interface PieceWithOutline {
  pieceId: string;
  outline: Array<{ type: string; values: number[] }>;
  edges?: Array<{ name: string; segmentRange: [number, number] }>;
}

// MUST match the literals used by `seamAssembly.buildSeamConstraints` (the
// `parameterizeEdge` calls there, ~line 429). Desync = GPU and CPU/WASM emit
// different vertex counts per seam edge → divergent simulation behavior.
const CURVE_RESOLUTION = 12;
const MAX_EDGE_LENGTH = 15;

function resolveSegmentRange(
  piece: PieceWithOutline,
  edgeName: string,
): [number, number] | null {
  const semantic = piece.edges?.find(e => e.name === edgeName);
  if (semantic) return semantic.segmentRange;

  const match = edgeName.match(/^edge-(\d+)$/);
  if (!match) return null;

  const idx = parseInt(match[1], 10);
  const numSegments = flattenPath(piece.outline as PathCommand[]).length;
  if (idx >= numSegments) return null;
  return [idx, (idx + 1) % numSegments];
}

/**
 * Convert `SeamInitData[]` (CPU/WASM shape) to `SeamPair[]` (GPU shape).
 *
 * @param seamData  Seams from `seamsToInitData()` — typically already filtered
 *   to active seams by the caller, but `active === false` entries are skipped
 *   defensively here as well.
 * @param pieces    Pieces with outlines (`PlacedMesh`-compatible).
 * @returns         `SeamPair[]` with LOCAL piece-relative vertex indices.
 */
export function seamInitDataToPairs(
  seamData: SeamInitData[],
  pieces: PieceWithOutline[],
): SeamPair[] {
  if (seamData.length === 0 || pieces.length === 0) return [];

  const pieceById = new Map<string, PieceWithOutline>();
  for (const p of pieces) pieceById.set(p.pieceId, p);

  const pairs: SeamPair[] = [];

  for (const seam of seamData) {
    if (seam.active === false) continue;

    const pieceA = pieceById.get(seam.pieceAId);
    const pieceB = pieceById.get(seam.pieceBId);
    if (!pieceA || !pieceB) {
      console.warn(
        `[seamPairs] seam ${seam.id}: missing piece (A=${seam.pieceAId}, B=${seam.pieceBId})`,
      );
      continue;
    }

    const rangeA = resolveSegmentRange(pieceA, seam.pieceAEdgeName);
    const rangeB = resolveSegmentRange(pieceB, seam.pieceBEdgeName);
    if (!rangeA || !rangeB) {
      console.warn(
        `[seamPairs] seam ${seam.id}: unknown edge (A=${seam.pieceAEdgeName}, B=${seam.pieceBEdgeName})`,
      );
      continue;
    }

    let edgeA = parameterizeEdge(
      pieceA.outline as PathCommand[],
      rangeA[0],
      rangeA[1],
      0,
      CURVE_RESOLUTION,
      MAX_EDGE_LENGTH,
    );
    let edgeB = parameterizeEdge(
      pieceB.outline as PathCommand[],
      rangeB[0],
      rangeB[1],
      0,
      CURVE_RESOLUTION,
      MAX_EDGE_LENGTH,
    );

    if (seam.pieceARange) {
      const [t0, t1] = seam.pieceARange;
      edgeA = edgeA.filter(v => v.t >= t0 && v.t <= t1);
    }
    if (seam.pieceBRange) {
      const [t0, t1] = seam.pieceBRange;
      edgeB = edgeB.filter(v => v.t >= t0 && v.t <= t1);
    }

    const vertexPairs = matchVertices(edgeA, edgeB);
    if (vertexPairs.length === 0) {
      console.warn(`[seamPairs] seam ${seam.id}: empty match`);
      continue;
    }

    pairs.push({
      pieceAId: seam.pieceAId,
      pieceBId: seam.pieceBId,
      vertexPairs,
    });
  }

  return pairs;
}
