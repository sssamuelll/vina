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

  const confidence = totalWeight > 0 ? weightedSum / totalWeight : 0;

  return {
    edgeA,
    edgeB,
    confidence,
    breakdown: {
      naming: namingScore,
      lengthSimilarity: lenSim,
      proximity: proxScore,
      edgePosition: posScore,
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
