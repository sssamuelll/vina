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

  // Filter out self-seams (same piece on both sides — should not happen
  // with the i<j loop above, but guard against edge cases)
  const safeCandidates = allCandidates.filter(c => c.edgeA.pieceId !== c.edgeB.pieceId);

  // Deduplicate and filter by confidence
  const ranked = rankAndDeduplicate(safeCandidates, minConfidence);

  // ── Orphan-bridging post-processing pass ─────────────────────────────────
  //
  // After greedy edge dedup, real patterns commonly end up with disconnected
  // sub-components — most often interfacing pieces (Cuff↔CuffInterface,
  // CollarBase↔CollarBaseInterface) that exhaust their parent's edges in
  // perfect-length interface-to-parent seams before the parent can match to
  // its downstream partner (sleeve/body). The greedy dedup is correct for
  // structural fabric seams (a side-seam edge IS only one seam), but it
  // over-restricts the special case of interface/lining stacks where multiple
  // layers physically share the same fabric edge in real construction.
  //
  // Rather than carve out a special-case rule for "interfacing" naming (which
  // would miss other patterns of legitimate orphans, e.g., T-shirt pieces
  // all named "Detail" where dedup blocks a marginal-confidence bridge),
  // we run a pattern-agnostic bridging pass: find connected components in
  // the seam graph, and for each non-main component, add the single best
  // candidate seam (from `safeCandidates`, NOT consumed by main dedup) that
  // connects it to the main component. This permits exactly one edge re-use
  // per bridge — the minimum to flip the connectivity gate without poisoning
  // the structural seam graph with duplicates.
  //
  // Bridges use a lower confidence floor (`bridgeMinConfidence`) because the
  // best bridge candidate has already lost the main dedup race; demanding the
  // primary 0.3-0.4 threshold would defeat the entire purpose of the pass.
  // 0.15 is loose enough to admit "Detail↔Detail" pairs with weak length sim
  // but tight enough to reject random pieces that share no real geometry.
  const bridgeCandidates = bridgeOrphanComponents(
    activePieces,
    ranked,
    safeCandidates,
    /* bridgeMinConfidence */ 0.15,
  );
  const finalRanked = [...ranked, ...bridgeCandidates];

  // Convert to ProposedSeam objects
  const seams: ProposedSeam[] = finalRanked.map((candidate, idx) => ({
    seam: {
      // state-encoded ID — see B10-state. The rank index is intentionally
      // baked into the auto-seam ID; do NOT migrate to newId().
      id: `auto-seam-${Date.now()}-${idx}`,
      pieceA: {
        pieceId: candidate.edgeA.pieceId,
        edgeName: candidate.edgeA.name,
        tStart: 0,
        tEnd: 1,
      },
      pieceB: {
        pieceId: candidate.edgeB.pieceId,
        edgeName: candidate.edgeB.name,
        tStart: 0,
        tEnd: 1,
      },
      type: 'standard' as const,
      tension: 100,
      strength: 1.0,
      active: true,
      taped: false,
      tapeWidth: 10,
    },
    confidence: candidate.confidence,
    reason: candidate.breakdown.reason,
    breakdown: candidate.breakdown,
  }));

  // Find unmatched edges
  const matchedEdgeKeys = new Set<string>();
  for (const s of finalRanked) {
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

/**
 * Find connected components in the seam graph and propose one bridging
 * candidate per orphan component to connect it to the main (largest)
 * component. Returns extra candidates that should be appended to the main
 * `ranked` set.
 *
 * Implementation detail: this REUSES `allCandidates` (the pre-dedup list)
 * to draw bridges from — that means each bridge is a seam that the main
 * pipeline already scored, just lost to a higher-confidence competitor.
 * No new geometry is computed; this is purely a graph-cover step.
 */
function bridgeOrphanComponents(
  pieces: PatternPiece[],
  rankedSeams: ScoredSeamCandidate[],
  allCandidates: ScoredSeamCandidate[],
  bridgeMinConfidence: number,
): ScoredSeamCandidate[] {
  if (pieces.length < 2) return [];

  // Build adjacency from the ranked seams produced by the main pass
  const adj = new Map<string, Set<string>>();
  pieces.forEach(p => adj.set(p.id, new Set()));
  for (const s of rankedSeams) {
    adj.get(s.edgeA.pieceId)?.add(s.edgeB.pieceId);
    adj.get(s.edgeB.pieceId)?.add(s.edgeA.pieceId);
  }

  // BFS to find connected components
  const visited = new Set<string>();
  const components: Set<string>[] = [];
  for (const p of pieces) {
    if (visited.has(p.id)) continue;
    const queue = [p.id];
    const members = new Set<string>();
    while (queue.length > 0) {
      const id = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);
      members.add(id);
      adj.get(id)?.forEach(n => {
        if (!visited.has(n)) queue.push(n);
      });
    }
    components.push(members);
  }

  if (components.length <= 1) return [];

  // Largest component = "main"; everything else is an orphan to bridge
  components.sort((a, b) => b.size - a.size);
  const mainComponent = components[0];

  const bridges: ScoredSeamCandidate[] = [];
  // Track edges that bridges added (to prevent duplicate bridge edges across
  // multiple orphan components landing on the same main-component edge — a
  // single edge can host multiple stacked bridges in theory, but for the
  // graph cover step we want one bridge per orphan).
  const bridgeUsedOrphanEdges = new Set<string>();

  for (let i = 1; i < components.length; i++) {
    const orphanComp = components[i];

    // Pick the highest-confidence candidate that has one endpoint in this
    // orphan component and the other in the main component. Crucially, do
    // NOT enforce edge-dedup against the main `rankedSeams` — the whole
    // point is to allow an edge in `mainComponent` to be re-used by a
    // bridging seam (typical case: a sleeve's wrist edge that already
    // anchors a Sleeve↔Body seam can also anchor a Sleeve↔Cuff bridge).
    let best: ScoredSeamCandidate | null = null;
    for (const cand of allCandidates) {
      if (cand.confidence < bridgeMinConfidence) continue;
      const aInOrphan = orphanComp.has(cand.edgeA.pieceId);
      const bInOrphan = orphanComp.has(cand.edgeB.pieceId);
      const aInMain = mainComponent.has(cand.edgeA.pieceId);
      const bInMain = mainComponent.has(cand.edgeB.pieceId);
      // Need one end in orphan and other in main (covers orphan→main bridges only)
      if (!((aInOrphan && bInMain) || (bInOrphan && aInMain))) continue;
      // Avoid re-using an orphan-side edge for two bridges (the orphan piece
      // would be over-constrained at one edge while another orphan edge sits
      // free).
      const orphanEdgeKey = aInOrphan
        ? `${cand.edgeA.pieceId}:${cand.edgeA.edgeIndex}`
        : `${cand.edgeB.pieceId}:${cand.edgeB.edgeIndex}`;
      if (bridgeUsedOrphanEdges.has(orphanEdgeKey)) continue;

      if (!best || cand.confidence > best.confidence) best = cand;
    }

    if (best) {
      const orphanEdgeKey = orphanComp.has(best.edgeA.pieceId)
        ? `${best.edgeA.pieceId}:${best.edgeA.edgeIndex}`
        : `${best.edgeB.pieceId}:${best.edgeB.edgeIndex}`;
      bridgeUsedOrphanEdges.add(orphanEdgeKey);
      bridges.push(best);
      // Merge this orphan into the main component for downstream bridges.
      // Without this, two orphan components could each bridge to main but
      // a third orphan-to-orphan bridge candidate would be missed.
      orphanComp.forEach(id => mainComponent.add(id));
    }
  }

  return bridges;
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
