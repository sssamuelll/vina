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
import {
  parameterizeEdge,
  matchVertices,
  SEAM_CURVE_RESOLUTION,
  SEAM_MAX_EDGE_LENGTH,
} from './seamAssembly';
import { flattenPath, commandRangeToFlattened } from '../seam/index';

/**
 * Branded vertex index — piece-LOCAL (not merged-mesh global).
 *
 * The GPU consumer `GpuSolverClient.initMultiPieceTsl` adds the per-piece
 * vertex offset internally when building the seam constraint buffer. A
 * regression that passes global indices here would double-offset the GPU
 * buffer and corrupt seam constraints. This brand prevents accidental
 * cross-pollination from helpers that return global indices.
 *
 * Construction site: `seamInitDataToPairs` (single brand cast after
 * `matchVertices`). All other code should treat this as opaque.
 */
declare const __localVertexBrand: unique symbol;
export type LocalVertexIndex = number & { readonly [__localVertexBrand]: true };

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
  vertexPairs: Array<[LocalVertexIndex, LocalVertexIndex]>;
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

function toPathCommands(outline: PieceWithOutline['outline']): PathCommand[] {
  // Structural-to-nominal type narrowing. The caller has already validated
  // outline shape (presence + numeric values) via hasFiniteOutline. This
  // single boundary point makes the cast easy to grep and harden later.
  return outline as PathCommand[];
}

function resolveSegmentRange(
  piece: PieceWithOutline,
  edgeName: string,
): [number, number] | null {
  const semantic = piece.edges?.find(e => e.name === edgeName);
  // Semantic ranges live in COMMAND space (the detectSemanticEdges
  // contract) — convert at this boundary to the flattened-point space
  // parameterizeEdge consumes (Fase 3 / BP-3). The "edge-N" fallback
  // below already indexes the flattened outline, so no conversion.
  if (semantic) {
    return commandRangeToFlattened(
      toPathCommands(piece.outline),
      semantic.segmentRange,
      SEAM_CURVE_RESOLUTION,
    );
  }

  const match = edgeName.match(/^edge-(\d+)$/);
  if (!match) return null;

  const idx = parseInt(match[1], 10);
  const numSegments = flattenPath(toPathCommands(piece.outline)).length;
  if (idx >= numSegments) return null;
  return [idx, (idx + 1) % numSegments];
}

/**
 * Scan a piece outline for NaN/Infinity values. Returns true iff every
 * numeric value across every path command is finite. Cheap O(N) walk —
 * runs once per seam-piece lookup, not per particle, so the budget is
 * negligible relative to `parameterizeEdge` itself.
 */
function hasFiniteOutline(outline: PieceWithOutline['outline']): boolean {
  for (const cmd of outline) {
    for (const v of cmd.values) {
      if (!Number.isFinite(v)) return false;
    }
  }
  return true;
}

/**
 * Convert `SeamInitData[]` (CPU/WASM shape) to `SeamPair[]` (GPU shape).
 *
 * @param seamData  Seams from `seamsToInitData()` — typically already filtered
 *   to active seams by the caller, but `active === false` entries are skipped
 *   defensively here as well. **Note:** if `seam.pieceARange` / `pieceBRange`
 *   are present, this helper applies t-range filtering silently — callers
 *   that build SeamInitData should be aware these fields gate the output.
 * @param pieces    Pieces with outlines (`PlacedMesh`-compatible).
 * @returns         `SeamPair[]` with LOCAL piece-relative vertex indices
 *                  (branded as `LocalVertexIndex`).
 */
export function seamInitDataToPairs(
  seamData: SeamInitData[],
  pieces: PieceWithOutline[],
): SeamPair[] {
  if (seamData.length === 0 || pieces.length === 0) return [];

  const pieceById = new Map<string, PieceWithOutline>();
  const seenIds = new Set<string>();
  for (const p of pieces) {
    if (seenIds.has(p.pieceId)) {
      console.warn(`[seamPairs] duplicate pieceId in input: ${p.pieceId}, last entry wins`);
    }
    seenIds.add(p.pieceId);
    pieceById.set(p.pieceId, p);
  }

  const pairs: SeamPair[] = [];

  for (const seam of seamData) {
    if (seam.active === false) continue;

    if (seam.pieceAId === seam.pieceBId) {
      console.warn(`[seamPairs] seam ${seam.id}: self-seam (pieceAId === pieceBId), skipping`);
      continue;
    }

    const pieceA = pieceById.get(seam.pieceAId);
    const pieceB = pieceById.get(seam.pieceBId);
    if (!pieceA || !pieceB) {
      console.warn(
        `[seamPairs] seam ${seam.id}: missing piece (A=${seam.pieceAId}, B=${seam.pieceBId})`,
      );
      continue;
    }

    if (!hasFiniteOutline(pieceA.outline) || !hasFiniteOutline(pieceB.outline)) {
      console.warn(
        `[seamPairs] seam ${seam.id}: non-finite outline values in piece (A=${seam.pieceAId}, B=${seam.pieceBId}), skipping`,
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
      toPathCommands(pieceA.outline),
      rangeA[0],
      rangeA[1],
      0,
      SEAM_CURVE_RESOLUTION,
      SEAM_MAX_EDGE_LENGTH,
    );
    let edgeB = parameterizeEdge(
      toPathCommands(pieceB.outline),
      rangeB[0],
      rangeB[1],
      0,
      SEAM_CURVE_RESOLUTION,
      SEAM_MAX_EDGE_LENGTH,
    );

    if (seam.pieceARange) {
      const [t0, t1] = seam.pieceARange;
      edgeA = edgeA.filter(v => v.t >= t0 && v.t <= t1);
    }
    if (seam.pieceBRange) {
      const [t0, t1] = seam.pieceBRange;
      edgeB = edgeB.filter(v => v.t >= t0 && v.t <= t1);
    }

    const vertexPairs = matchVertices(edgeA, edgeB) as Array<[LocalVertexIndex, LocalVertexIndex]>;
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
