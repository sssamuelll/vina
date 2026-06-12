/**
 * Auto-Sew Scorer — combines naming heuristics, arc-length matching,
 * and geometric proximity into a final seam confidence score.
 *
 * @module autoSew/scorer
 */

import type { Edge } from './edgeExtractor';
import type { NamingScore, EdgeHint } from './namingHeuristics';
import type { LengthMatch } from './arcLengthMatcher';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ScoredSeamCandidate {
  edgeA: Edge;
  edgeB: Edge;
  /** Combined confidence score 0-1 */
  confidence: number;
  /** Breakdown of score components */
  breakdown: ScoreBreakdown;
}

export interface ScoreBreakdown {
  /** Naming heuristic score (0-1), null if no naming rule matched */
  naming: number | null;
  /** Arc-length similarity (0-1) */
  lengthSimilarity: number;
  /** Geometric proximity score (0-1) */
  proximity: number;
  /** Edge position alignment score (0-1) */
  edgePosition: number;
  /** Semantic role correspondence (0 or 1): a known seam-partner pair
   *  (armhole↔sleeveCap, sideSeam↔sideSeam, neckline↔collarNeckEdge, …),
   *  applied only when the pair is geometrically plausible. */
  semanticMatch: number;
  /** Reason from naming rules */
  reason: string;
}

export interface ScorerWeights {
  naming: number;
  length: number;
  proximity: number;
  edgePosition: number;
}

const DEFAULT_WEIGHTS: ScorerWeights = {
  naming: 0.35,
  length: 0.35,
  proximity: 0.15,
  edgePosition: 0.15,
};

// ─── Geometric scoring ─────────────────────────────────────────────────────

function dist2D(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Score based on midpoint proximity. Edges that are close together on the
 * 2D workspace are more likely to be sewn together (pieces are usually
 * laid out near their partners).
 * 
 * Uses a sigmoid falloff: nearby = high score, far = low score.
 * The "nearby" threshold scales with edge length (longer edges span more).
 */
function proximityScore(edgeA: Edge, edgeB: Edge): number {
  const midDist = dist2D(edgeA.midpoint, edgeB.midpoint);
  const avgLen = (edgeA.arcLength + edgeB.arcLength) / 2;
  // Normalize distance by edge length — edges close relative to their size
  const normDist = avgLen > 0 ? midDist / avgLen : midDist;
  // Sigmoid: score drops from ~1 (normDist=0) to ~0 (normDist=5)
  return 1 / (1 + Math.exp(normDist - 2.5));
}

/**
 * Score based on edge position relative to piece bounding box.
 * Uses edge hints from naming rules to check if edges are in expected positions.
 */
function edgePositionScore(edgeA: Edge, edgeB: Edge, hints: EdgeHint[]): number {
  if (hints.length === 0) return 0.5; // Neutral if no hints

  // For now, check normal alignment — edges that face each other
  // (opposing normals) are likely seam partners
  const dot = edgeA.normal.x * edgeB.normal.x + edgeA.normal.y * edgeB.normal.y;
  // Opposing normals → dot ≈ -1 → score ≈ 1
  // Same direction → dot ≈ 1 → score ≈ 0
  const normalScore = (1 - dot) / 2;

  return normalScore;
}

/**
 * Score semantic role correspondence between two edges. Returns 1 when one
 * edge's matchHint references the other's role name (e.g. an armhole's
 * "pairs with sleeveCap" and an edge named "sleeveCap"), else 0.
 *
 * This is the signal DXF pieces lack: with no layout proximity and
 * similar-length edges everywhere, geometry alone pairs coincidentally.
 * Once pieces are classified, edges carry roles (armhole / neckline /
 * collarNeckEdge / sideSeam …) and known garment seams become explicit.
 */
function semanticMatchScore(edgeA: Edge, edgeB: Edge): number {
  const nameA = edgeA.name?.toLowerCase().replace(/-\d+$/, '') ?? '';
  const nameB = edgeB.name?.toLowerCase().replace(/-\d+$/, '') ?? '';
  // Unnamed / fallback edges carry no role signal.
  if (!nameA || !nameB || nameA.startsWith('edge-') || nameB.startsWith('edge-')) return 0;
  const hintA = edgeA.matchHint?.toLowerCase() ?? '';
  const hintB = edgeB.matchHint?.toLowerCase() ?? '';
  if (hintA && hintA.includes(nameB)) return 1;
  if (hintB && hintB.includes(nameA)) return 1;
  // CONTRADICTION (M3, camisa de María): both edges DECLARE a partner and
  // neither declaration references the other — pairing them contradicts
  // both. This is what let length coincidences steal anatomy: the 456mm
  // collar outer edge vs the 451mm sleeve cap, the 228mm collar halves vs
  // the 231mm armholes. A declared-elsewhere pair must lose to any aligned
  // or neutral candidate.
  if (hintA && hintB) return -1;
  return 0;
}

/**
 * True when the two edges DECLARE each other (one's matchHint references
 * the other's role). Exported for candidate GENERATION (index.ts): declared
 * anatomy must always reach the scorer — the Hungarian length-assignment
 * can otherwise pre-empt a true pair with a length coincidence.
 */
export function areDeclaredPartners(edgeA: Edge, edgeB: Edge): boolean {
  return semanticMatchScore(edgeA, edgeB) === 1;
}

/** How far a confirmed semantic match lifts confidence toward 1. */
const SEMANTIC_LIFT = 0.55;
/** Multiplier when both edges declare partners that contradict the pair. */
const CONTRADICTION_FACTOR = 0.3;
/** Edge types that are NOT seam material unless hints mutually align. */
const NON_SEAM_TYPES = new Set(['hem', 'fold', 'opening']);
/** Multiplier when a non-seam edge (hemline, fold, …) is paired without alignment. */
const NON_SEAM_FACTOR = 0.15;
/**
 * Generic zone names (unclassified pieces): their edgeTypes are heuristic
 * DEFAULTS (bottomEdge→'hem', leftEdge→'fold'), not semantic declarations —
 * the sewability gate only applies to role-bearing edges (hemline,
 * waistbandFold, neckline…), where the type IS anatomy.
 */
const GENERIC_NAMES = new Set(['topedge', 'bottomedge', 'leftedge', 'rightedge', 'edge']);
function isDeclaredNonSeam(edge: Edge): boolean {
  if (!edge.edgeType || !NON_SEAM_TYPES.has(edge.edgeType)) return false;
  const root = edge.name?.toLowerCase().replace(/-\d+$/, '') ?? '';
  return !GENERIC_NAMES.has(root) && !root.startsWith('edge-');
}

// ─── Composite scoring ─────────────────────────────────────────────────────

/**
 * Score a single edge pair as a seam candidate.
 */
export function scoreEdgePair(
  edgeA: Edge,
  edgeB: Edge,
  namingResult: NamingScore | null,
  lengthMatch: LengthMatch | null,
  weights: ScorerWeights = DEFAULT_WEIGHTS,
): ScoredSeamCandidate {
  const namingScore = namingResult?.score ?? null;
  const lenSim = lengthMatch?.similarity ?? 0;
  const proxScore = proximityScore(edgeA, edgeB);
  const posScore = edgePositionScore(edgeA, edgeB, namingResult?.edgeHints ?? []);

  // Weighted combination
  // If naming is null, redistribute its weight to length
  let totalWeight: number;
  let weightedSum: number;

  if (namingScore !== null) {
    weightedSum =
      namingScore * weights.naming +
      lenSim * weights.length +
      proxScore * weights.proximity +
      posScore * weights.edgePosition;
    totalWeight = weights.naming + weights.length + weights.proximity + weights.edgePosition;
  } else {
    // No naming info — redistribute naming weight to length (most reliable fallback)
    weightedSum =
      lenSim * (weights.length + weights.naming * 0.7) +
      proxScore * (weights.proximity + weights.naming * 0.15) +
      posScore * (weights.edgePosition + weights.naming * 0.15);
    totalWeight = weights.naming + weights.length + weights.proximity + weights.edgePosition;
  }

  const base = totalWeight > 0 ? weightedSum / totalWeight : 0;

  // Semantic role lift — but ONLY among geometrically plausible pairs. A
  // confirmed role match (armhole↔sleeveCap, …) lifts confidence toward 1,
  // letting a correct seam beat a coincidental similar-length one. The
  // plausibility gate (edges within ~2× length of each other) prevents a
  // mislabeled edge from forcing a confidently-wrong seam on bad geometry —
  // semantics disambiguate among plausible matches, they never override it.
  const maxLen = Math.max(edgeA.arcLength, edgeB.arcLength, 1e-6);
  const lenRatio = Math.min(edgeA.arcLength, edgeB.arcLength) / maxLen;
  const geometricallyPlausible = lenRatio >= 0.5;
  const semanticMatch = geometricallyPlausible ? semanticMatchScore(edgeA, edgeB) : 0;

  let confidence = semanticMatch > 0 ? base + SEMANTIC_LIFT * (1 - base) : base;
  // Declared-elsewhere contradiction: heavy penalty (see semanticMatchScore).
  if (semanticMatch < 0) confidence = base * CONTRADICTION_FACTOR;
  // Sewability gate (M3): hemlines, folds and openings are finished edges,
  // not seam material — unless their hints mutually align (the
  // neckline↔collarNeckEdge case, where 'opening' IS the declared partner).
  const nonSeam = isDeclaredNonSeam(edgeA) || isDeclaredNonSeam(edgeB);
  if (nonSeam && semanticMatch !== 1) confidence *= NON_SEAM_FACTOR;

  return {
    edgeA,
    edgeB,
    confidence,
    breakdown: {
      naming: namingScore,
      lengthSimilarity: lenSim,
      proximity: proxScore,
      edgePosition: posScore,
      semanticMatch,
      reason: namingResult?.reason ?? 'No naming heuristic matched',
    },
  };
}

/**
 * Filter and rank seam candidates, removing duplicates and low-confidence matches.
 * An edge should only appear in one seam (greedy assignment by confidence).
 */
export function rankAndDeduplicate(
  candidates: ScoredSeamCandidate[],
  minConfidence = 0.4
): ScoredSeamCandidate[] {
  // Sort by confidence descending
  const sorted = [...candidates]
    .filter(c => c.confidence >= minConfidence)
    .sort((a, b) => b.confidence - a.confidence);

  // Greedy: each edge can only be used once
  const usedEdges = new Set<string>();
  const result: ScoredSeamCandidate[] = [];

  for (const candidate of sorted) {
    const keyA = `${candidate.edgeA.pieceId}:${candidate.edgeA.edgeIndex}`;
    const keyB = `${candidate.edgeB.pieceId}:${candidate.edgeB.edgeIndex}`;

    if (!usedEdges.has(keyA) && !usedEdges.has(keyB)) {
      usedEdges.add(keyA);
      usedEdges.add(keyB);
      result.push(candidate);
    }
  }

  return result;
}
