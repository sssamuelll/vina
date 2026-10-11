/**
 * Convert CPU/WASM seam init data to GPU-shape SeamPair[], and summarize
 * seam → constraint resolution for observability.
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
 * Because the resolution is the same logic the solver workers run, this
 * module doubles as the main-thread seam observability surface (CLO3D
 * parity plan Fase 4): `summarizeSeamResolution` reports per-seam
 * constraint counts BEFORE any worker is involved, so the UI can warn
 * about seams that resolve to zero constraints (they will not sew) with
 * the same numbers the solver will see.
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
import { renormalizeFilteredT } from '../seam/seamRange';
import type { SeamInitData } from './clothWorker';
import {
  parameterizeEdge,
  parameterizeEdgeFromBoundary,
  matchVertices,
  DEFAULT_SEAM_CONFIG,
  SEAM_CURVE_RESOLUTION,
  SEAM_MAX_EDGE_LENGTH,
} from './seamAssembly';
import { flattenPath, commandRangeToFlattened, edgeNToCommandIndex } from '../seam/index';

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
  /** Compliance XPBD per-seam: base[type] / strength × (taped ? 0.1 : 1) — espejo de buildSeamConstraints. */
  compliance: number;
  /** tension/100 — escala el target inicial (1 = distancia actual). */
  tensionFactor: number;
}

/**
 * Structural input — accepts `PlacedMesh` and the worker's piece type.
 * Only the fields required for edge-name resolution are listed.
 */
export interface PieceWithOutline {
  pieceId: string;
  outline: Array<{ type: string; values: number[] }>;
  edges?: Array<{ name: string; segmentRange: [number, number] }>;
  /**
   * Boundary-subdivision maxEdgeLength (mm) the MESHER used for this piece
   * (= per-piece particleDistance). MUST match or the reconstructed vertex
   * numbering drifts — see `PieceSeamData` in seamAssembly (M4). Legacy
   * fallback; superseded by `boundaryOrig` when present.
   */
  meshMaxEdgeLength?: number;
  /**
   * Mesher boundary provenance + piece-local vertex positions (M4): when
   * BOTH are present, resolution addresses the real boundary vertices via
   * `parameterizeEdgeFromBoundary` — required for real patterns, where
   * dedupe/winding/simplify break the legacy reconstruction.
   */
  boundaryOrig?: Float64Array;
  vertices?: Float32Array;
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
  // parameterizeEdge consumes (Fase 3 / BP-3). The legacy "edge-N"
  // fallback also names a COMMAND index (edgeNToCommandIndex) and goes
  // through the same conversion, mirroring buildSeamConstraints.
  if (semantic) {
    return commandRangeToFlattened(
      toPathCommands(piece.outline),
      semantic.segmentRange,
      SEAM_CURVE_RESOLUTION,
    );
  }

  const cmdIdx = edgeNToCommandIndex(toPathCommands(piece.outline), edgeName);
  if (cmdIdx === null) return null;
  return commandRangeToFlattened(
    toPathCommands(piece.outline),
    [cmdIdx, cmdIdx + 1],
    SEAM_CURVE_RESOLUTION,
  );
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

  const pieceById = buildPieceIndex(pieces, true);
  const pairs: SeamPair[] = [];

  for (const seam of seamData) {
    if (seam.active === false) continue;

    const resolved = resolveSeamVertexPairs(seam, pieceById, true);
    if (resolved.failure) continue;

    // Per-seam physics, mirroring buildSeamConstraints (seamAssembly.ts):
    // compliance = base[type] / strength × (taped ? 0.1 : 1);
    // tensionFactor scales the initial rest length (restLength = dist × tension/100).
    const baseCompliance = DEFAULT_SEAM_CONFIG.compliance[seam.type];
    pairs.push({
      pieceAId: seam.pieceAId,
      pieceBId: seam.pieceBId,
      vertexPairs: resolved.vertexPairs,
      compliance: (baseCompliance / (seam.strength ?? 1.0)) * (seam.taped ? 0.1 : 1.0),
      tensionFactor: (seam.tension ?? 100) / 100,
    });
  }

  return pairs;
}

// ─── Per-seam resolution core (shared by GPU pairs + observability) ──────────

/** Why an active seam resolved to zero constraints. */
export type SeamResolutionFailure =
  | 'missing-piece'
  | 'non-finite-outline'
  | 'unknown-edge'
  | 'empty-match';

interface ResolvedSeamVertexPairs {
  vertexPairs: Array<[LocalVertexIndex, LocalVertexIndex]>;
  /** `null` when the seam resolved to ≥1 vertex pair. */
  failure: SeamResolutionFailure | null;
}

function buildPieceIndex(
  pieces: PieceWithOutline[],
  warn: boolean,
): Map<string, PieceWithOutline> {
  const pieceById = new Map<string, PieceWithOutline>();
  for (const p of pieces) {
    if (warn && pieceById.has(p.pieceId)) {
      console.warn(`[seamPairs] duplicate pieceId in input: ${p.pieceId}, last entry wins`);
    }
    pieceById.set(p.pieceId, p);
  }
  return pieceById;
}

/**
 * Resolve one seam's edge names to LOCAL vertex-index pairs — the single
 * resolution path shared by `seamInitDataToPairs` (GPU init shape) and
 * `summarizeSeamResolution` (observability). The pair COUNT matches what
 * `buildSeamConstraints` produces inside the CPU/WASM workers (same
 * `parameterizeEdge` + t-range filter + `matchVertices` pipeline; the
 * vertex offset only shifts indices, never the count).
 *
 * @param warn  When true, per-failure `console.warn` with `[seamPairs]`
 *   prefix (the loud GPU-init convention per A3 § 3.2). The summary path
 *   passes false — its failures surface via toast + inspector slice
 *   instead, and double-warning the console would be noise.
 */
function resolveSeamVertexPairs(
  seam: SeamInitData,
  pieceById: Map<string, PieceWithOutline>,
  warn: boolean,
): ResolvedSeamVertexPairs {
  const fail = (failure: SeamResolutionFailure, msg: string): ResolvedSeamVertexPairs => {
    if (warn) console.warn(`[seamPairs] seam ${seam.id}: ${msg}`);
    return { vertexPairs: [], failure };
  };

  // Same-piece (self) seams are valid — e.g. a sleeve's underarm tube closure
  // (underarmSeam↔underarmSeam-2 on the same pieceId). The GPU consumer
  // (gpuSolverClient.ts) offsets both halves by the same per-piece vertex
  // offset, which yields distinct correct global indices. Resolves like any seam.

  const pieceA = pieceById.get(seam.pieceAId);
  const pieceB = pieceById.get(seam.pieceBId);
  if (!pieceA || !pieceB) {
    return fail('missing-piece', `missing piece (A=${seam.pieceAId}, B=${seam.pieceBId})`);
  }

  if (!hasFiniteOutline(pieceA.outline) || !hasFiniteOutline(pieceB.outline)) {
    return fail(
      'non-finite-outline',
      `non-finite outline values in piece (A=${seam.pieceAId}, B=${seam.pieceBId}), skipping`,
    );
  }

  const rangeA = resolveSegmentRange(pieceA, seam.pieceAEdgeName);
  const rangeB = resolveSegmentRange(pieceB, seam.pieceBEdgeName);
  if (!rangeA || !rangeB) {
    return fail(
      'unknown-edge',
      `unknown edge (A=${seam.pieceAEdgeName}, B=${seam.pieceBEdgeName})`,
    );
  }

  // Boundary resolution (M4): prefer the mesher's provenance (boundaryOrig
  // + vertices) — mirrors buildSeamConstraints exactly, preserving GPU
  // pair-count parity. Legacy reconstruction only for pieces meshed
  // outside the CDT mesher.
  const reversedB = seam.pieceBReversed === true;
  let edgeA = pieceA.boundaryOrig && pieceA.vertices
    ? parameterizeEdgeFromBoundary(
        pieceA.boundaryOrig, pieceA.vertices, 0,
        flattenPath(toPathCommands(pieceA.outline)).length, rangeA,
      )
    : parameterizeEdge(
        toPathCommands(pieceA.outline), rangeA[0], rangeA[1], 0,
        SEAM_CURVE_RESOLUTION, pieceA.meshMaxEdgeLength ?? SEAM_MAX_EDGE_LENGTH,
      );
  // Direction (Fase 5): mirror `buildSeamConstraints` — the B half may be
  // traversed end→start, pairing A's t=0 with B's t=1.
  let edgeB = pieceB.boundaryOrig && pieceB.vertices
    ? parameterizeEdgeFromBoundary(
        pieceB.boundaryOrig, pieceB.vertices, 0,
        flattenPath(toPathCommands(pieceB.outline)).length, rangeB, reversedB,
      )
    : parameterizeEdge(
        toPathCommands(pieceB.outline), rangeB[0], rangeB[1], 0,
        SEAM_CURVE_RESOLUTION, pieceB.meshMaxEdgeLength ?? SEAM_MAX_EDGE_LENGTH,
        reversedB,
      );

  // Filtro + RENORMALIZACIÓN de t al sub-rango (espejo exacto de
  // seamAssembly.ts — renormalizeFilteredT; los tiers no pueden divergir).
  if (seam.pieceARange) {
    const [t0, t1] = seam.pieceARange;
    edgeA = renormalizeFilteredT(edgeA.filter(v => v.t >= t0 && v.t <= t1), t0, t1);
  }
  if (seam.pieceBRange) {
    const [t0, t1] = seam.pieceBRange;
    edgeB = renormalizeFilteredT(edgeB.filter(v => v.t >= t0 && v.t <= t1), t0, t1);
  }

  const vertexPairs = matchVertices(edgeA, edgeB) as Array<[LocalVertexIndex, LocalVertexIndex]>;
  if (vertexPairs.length === 0) {
    return fail('empty-match', 'empty match');
  }

  return { vertexPairs, failure: null };
}

// ─── Observability (parity plan Fase 4) ──────────────────────────────────────

/** Per-seam resolution outcome for the observability surface. */
export interface SeamResolutionEntry {
  seamId: string;
  /** XPBD constraint pairs this seam resolves to (0 = will not sew). */
  constraintCount: number;
  /** Failure cause when `constraintCount === 0`, else `null`. */
  failure: SeamResolutionFailure | null;
}

/**
 * Summarize how each ACTIVE seam resolves to constraints, on the main
 * thread, before any solver init. Inactive seams are excluded (zero
 * constraints is their correct state, not a failure).
 *
 * Consumed by `useSimulationLifecycle` at sim start: total + zero-count
 * seams go to `simulation.seamResolution` (EstadoDeLaSimulacion),
 * zero-count seams additionally to `inspector.seamResolutionErrors` +
 * an error toast (E-async dual-surface convention).
 */
export function summarizeSeamResolution(
  seamData: SeamInitData[],
  pieces: PieceWithOutline[],
): SeamResolutionEntry[] {
  const active = seamData.filter(s => s.active !== false);
  if (active.length === 0) return [];

  const pieceById = buildPieceIndex(pieces, false);
  return active.map(seam => {
    const resolved = resolveSeamVertexPairs(seam, pieceById, false);
    return {
      seamId: seam.id,
      constraintCount: resolved.vertexPairs.length,
      failure: resolved.failure,
    };
  });
}
