/**
 * Auto-Sew — automatic seam detection for pattern pieces.
 * 
 * This is OpenClo's competitive advantage: no other open-source (or commercial)
 * tool does automatic seam matching. It combines:
 * 
 * 1. **Naming heuristics** — patternmaking domain knowledge (front↔back, bodice↔sleeve)
 * 2. **Arc-length matching** — Hungarian algorithm for optimal edge pairing by length
 * 3. **Geometric proximity** — edges near each other on the workspace
 * 4. **Normal alignment** — edges facing each other are likely seam partners
 * 
 * The LLM copilot acts as a fallback for ambiguous cases.
 *
 * @module autoSew
 */

import type { PatternPiece, Seam } from '../../types/types';
import { extractEdges, type Edge } from './edgeExtractor';
import { scorePieceNames } from './namingHeuristics';
import { matchEdgesByLength, lengthSimilarity } from './arcLengthMatcher';
import { scoreEdgePair, rankAndDeduplicate, type ScoredSeamCandidate, type ScorerWeights } from './scorer';

// ─── Public types ───────────────────────────────────────────────────────────

export interface AutoSewOptions {
  /** Minimum confidence to include a seam (0-1, default 0.4) */
  minConfidence?: number;
  /** Arc length tolerance in mm (default 5) */
  lengthTolerance?: number;
  /** Custom scorer weights */
  weights?: Partial<ScorerWeights>;
  /** Exclude specific piece IDs from matching */
  excludePieceIds?: string[];
  /** Only match between specific piece ID pairs */
  onlyPairs?: Array<[string, string]>;
}

export interface AutoSewResult {
  /** Proposed seams sorted by confidence */
  seams: ProposedSeam[];
  /** Edges that couldn't be matched (orphans) */
  unmatchedEdges: Edge[];
  /** Total pieces analyzed */
  piecesAnalyzed: number;
  /** Total edges extracted */
  edgesExtracted: number;
}

export interface ProposedSeam {
  /** Generated seam object ready to dispatch to Redux */
  seam: Seam;
  /** Confidence score 0-1 */
  confidence: number;
  /** Human-readable explanation */
  reason: string;
  /** Full score breakdown */
  breakdown: ScoredSeamCandidate['breakdown'];
}

// ─── Main API ───────────────────────────────────────────────────────────────

/**
 * Automatically detect seams between pattern pieces.
 * 
 * @param pieces - All pattern pieces in the project
 * @param options - Configuration options
 * @returns Proposed seams with confidence scores
 */
export function autoSew(
  pieces: PatternPiece[],
  options: AutoSewOptions = {}
): AutoSewResult {
  const {
    minConfidence = 0.4,
    lengthTolerance = 5,
    weights,
    excludePieceIds = [],
    onlyPairs,
  } = options;

  // Filter pieces
  const activePieces = pieces.filter(p => !excludePieceIds.includes(p.id));
  if (activePieces.length < 2) {
    return { seams: [], unmatchedEdges: [], piecesAnalyzed: activePieces.length, edgesExtracted: 0 };
  }

  // Extract edges from all pieces
  const pieceEdges = new Map<string, Edge[]>();
  let totalEdges = 0;
  for (const piece of activePieces) {
    const edges = extractEdges(piece);
    pieceEdges.set(piece.id, edges);
    totalEdges += edges.length;
  }

  // Score all valid piece pairs
  const allCandidates: ScoredSeamCandidate[] = [];

  for (let i = 0; i < activePieces.length; i++) {
    for (let j = i + 1; j < activePieces.length; j++) {
      const pieceA = activePieces[i];
      const pieceB = activePieces[j];

      // Filter by onlyPairs if specified
      if (onlyPairs) {
        const isPair = onlyPairs.some(
          ([a, b]) => (a === pieceA.id && b === pieceB.id) || (a === pieceB.id && b === pieceA.id)
        );
        if (!isPair) continue;
      }

      const edgesA = pieceEdges.get(pieceA.id) || [];
      const edgesB = pieceEdges.get(pieceB.id) || [];
      if (edgesA.length === 0 || edgesB.length === 0) continue;

      // Get naming score for this piece pair
      const namingResult = scorePieceNames(pieceA.name, pieceB.name);

      // Get length-based matches (Hungarian)
      const lengthMatches = matchEdgesByLength(edgesA, edgesB, lengthTolerance, 0.1);

      // Score each possible edge combination
      // First: use Hungarian matches
      for (const lm of lengthMatches) {
        const candidate = scoreEdgePair(
          lm.edgeA, lm.edgeB, namingResult, lm,
          weights ? { ...DEFAULT_WEIGHTS, ...weights } : undefined
        );
        allCandidates.push(candidate);
      }

      // Also try edges not in Hungarian matches (naming might override length)
      if (namingResult && namingResult.score > 0.7) {
        for (const eA of edgesA) {
          for (const eB of edgesB) {
            // Skip if already in length matches
            const alreadyMatched = lengthMatches.some(
              lm => lm.edgeA.edgeIndex === eA.edgeIndex && lm.edgeB.edgeIndex === eB.edgeIndex
            );
            if (alreadyMatched) continue;

            const sim = lengthSimilarity(eA.arcLength, eB.arcLength, lengthTolerance);
            const candidate = scoreEdgePair(
              eA, eB, namingResult,
              { edgeA: eA, edgeB: eB, similarity: sim, lengthDiff: Math.abs(eA.arcLength - eB.arcLength) },
              weights ? { ...DEFAULT_WEIGHTS, ...weights } : undefined
            );
            allCandidates.push(candidate);
          }
        }
      }
    }
  }

  // Deduplicate and filter by confidence
  const ranked = rankAndDeduplicate(allCandidates, minConfidence);

  // Convert to ProposedSeam objects
  const seams: ProposedSeam[] = ranked.map((candidate, idx) => ({
    seam: {
      id: `auto-seam-${Date.now()}-${idx}`,
      pieceA: {
        pieceId: candidate.edgeA.pieceId,
        edgeName: candidate.edgeA.name,
      },
      pieceB: {
        pieceId: candidate.edgeB.pieceId,
        edgeName: candidate.edgeB.name,
      },
      type: 'standard' as const,
    },
    confidence: candidate.confidence,
    reason: candidate.breakdown.reason,
    breakdown: candidate.breakdown,
  }));

  // Find unmatched edges
  const matchedEdgeKeys = new Set<string>();
  for (const s of ranked) {
    matchedEdgeKeys.add(`${s.edgeA.pieceId}:${s.edgeA.edgeIndex}`);
    matchedEdgeKeys.add(`${s.edgeB.pieceId}:${s.edgeB.edgeIndex}`);
  }
  const unmatchedEdges: Edge[] = [];
  for (const edges of pieceEdges.values()) {
    for (const edge of edges) {
      if (!matchedEdgeKeys.has(`${edge.pieceId}:${edge.edgeIndex}`)) {
        unmatchedEdges.push(edge);
      }
    }
  }

  return {
    seams,
    unmatchedEdges,
    piecesAnalyzed: activePieces.length,
    edgesExtracted: totalEdges,
  };
}

// Re-export default weights for the fallback import
const DEFAULT_WEIGHTS: ScorerWeights = {
  naming: 0.35,
  length: 0.35,
  proximity: 0.15,
  edgePosition: 0.15,
};

// ─── Re-exports ─────────────────────────────────────────────────────────────

export { extractEdges, extractAllEdges, type Edge } from './edgeExtractor';
export { scorePieceNames, findNamingCandidates, type NamingScore } from './namingHeuristics';
export { hungarian, matchEdgesByLength, lengthSimilarity, type LengthMatch } from './arcLengthMatcher';
export { scoreEdgePair, rankAndDeduplicate, type ScoredSeamCandidate, type ScoreBreakdown, type ScorerWeights } from './scorer';
