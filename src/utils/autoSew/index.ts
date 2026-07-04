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
import { scoreEdgePair, rankAndDeduplicate, areDeclaredPartners, type ScoredSeamCandidate, type ScorerWeights } from './scorer';

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

      // Semantic-aligned pairs are ALWAYS candidates (M3, camisa de María):
      // the Hungarian length-assignment is 1:1 optimal on LENGTH alone and
      // can pre-empt declared anatomy — on the real shirt it assigned the
      // 228mm collarNeckEdge to the 231mm armhole (similarity 0.99), so the
      // true collarNeckEdge↔neckline pair never existed as a candidate, and
      // armhole↔sleeveCap (231 vs 451mm) never survived the tolerance. An
      // edge pair that DECLARES itself (mutual matchHint) reaches the
      // scorer regardless.
      for (const eA of edgesA) {
        for (const eB of edgesB) {
          if (!areDeclaredPartners(eA, eB)) continue;
          const alreadyMatched = lengthMatches.some(
            lm => lm.edgeA.edgeIndex === eA.edgeIndex && lm.edgeB.edgeIndex === eB.edgeIndex
          );
          if (alreadyMatched) continue;
          const sim = lengthSimilarity(eA.arcLength, eB.arcLength, lengthTolerance);
          allCandidates.push(scoreEdgePair(
            eA, eB, namingResult,
            { edgeA: eA, edgeB: eB, similarity: sim, lengthDiff: Math.abs(eA.arcLength - eB.arcLength) },
            weights ? { ...DEFAULT_WEIGHTS, ...weights } : undefined
          ));
        }
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

  // ── Sisa split pass (proceso de cosido María-style, 2026-07-04) ──────────
  //
  // Una camisa real cose el CAP de la manga a AMBOS armholes (delantero Y
  // espalda) — la sisa es una curva continua una vez cerrados hombros y
  // costados. El dedup greedy de arriba es 1:1 (cada edge una costura), así
  // que cada cap reclamaba UN armhole y los de la otra pieza del torso
  // quedaban huérfanos. Medido en vivo (sonda seam-gap): el centro del cap
  // cerraba a 1.3cm y los extremos quedaban a 12-16cm — media manga sin
  // partner ("chaleco + brazaletes").
  //
  // Split: cada costura cap↔armhole se parte en DOS medias costuras con
  // rango parcial en el lado del cap (t 0-0.5 / 0.5-1 — la maquinaria de
  // rangos + renormalizeFilteredT es de Fase 5), la segunda apuntando al
  // mejor armhole NO consumido de OTRA pieza (ya scoreado por el pipeline —
  // armhole↔sleeveCap son declared partners, siempre llegan al scorer).
  // Qué mitad va a cuál armhole y la dirección los decide worldRefine en
  // pose MUNDO (permutación del grupo bodice:armhole↔sleeve:sleevecap,
  // ahora de 4 miembros — cabe en MAX_GROUP_PERMUTE).
  const edgeRootOf = (n: string) => n.toLowerCase().replace(/-\d+$/, '');
  interface SeamSpec {
    cand: ScoredSeamCandidate;
    /** Rango t del lado CAP ('A'|'B' de cand) — solo en medias costuras de sisa. */
    capSide?: 'A' | 'B';
    capRange?: [number, number];
  }
  const usedEdgeKeys = new Set(finalRanked.flatMap(s => [
    `${s.edgeA.pieceId}:${s.edgeA.edgeIndex}`,
    `${s.edgeB.pieceId}:${s.edgeB.edgeIndex}`,
  ]));
  const splitExtras: ScoredSeamCandidate[] = [];
  const seamSpecs: SeamSpec[] = [];
  for (const cand of finalRanked) {
    const rootA = edgeRootOf(cand.edgeA.name);
    const rootB = edgeRootOf(cand.edgeB.name);
    const capSide: 'A' | 'B' | null =
      rootA === 'sleevecap' && rootB === 'armhole' ? 'A'
      : rootB === 'sleevecap' && rootA === 'armhole' ? 'B'
      : null;
    if (!capSide) { seamSpecs.push({ cand }); continue; }
    const cap = capSide === 'A' ? cand.edgeA : cand.edgeB;
    const arm = capSide === 'A' ? cand.edgeB : cand.edgeA;

    // Mejor segundo armhole para ESTE cap, en otra pieza, con edge libre.
    let second: ScoredSeamCandidate | null = null;
    let secondCapSide: 'A' | 'B' = 'A';
    for (const c of safeCandidates) {
      const capIsA = c.edgeA.pieceId === cap.pieceId && c.edgeA.edgeIndex === cap.edgeIndex;
      const capIsB = c.edgeB.pieceId === cap.pieceId && c.edgeB.edgeIndex === cap.edgeIndex;
      if (!capIsA && !capIsB) continue;
      const other = capIsA ? c.edgeB : c.edgeA;
      if (edgeRootOf(other.name) !== 'armhole') continue;
      if (other.pieceId === arm.pieceId) continue;
      if (usedEdgeKeys.has(`${other.pieceId}:${other.edgeIndex}`)) continue;
      if (!second || c.confidence > second.confidence) {
        second = c;
        secondCapSide = capIsA ? 'A' : 'B';
      }
    }
    if (!second) { seamSpecs.push({ cand }); continue; }

    const secondArm = secondCapSide === 'A' ? second.edgeB : second.edgeA;
    usedEdgeKeys.add(`${secondArm.pieceId}:${secondArm.edgeIndex}`);
    splitExtras.push(second);
    seamSpecs.push({ cand, capSide, capRange: [0, 0.5] });
    seamSpecs.push({ cand: second, capSide: secondCapSide, capRange: [0.5, 1] });
  }

  // Convert to ProposedSeam objects
  const seams: ProposedSeam[] = seamSpecs.map(({ cand: candidate, capSide, capRange }, idx) => ({
    seam: {
      // state-encoded ID — see B10-state. The rank index is intentionally
      // baked into the auto-seam ID; do NOT migrate to newId().
      id: `auto-seam-${Date.now()}-${idx}`,
      pieceA: {
        pieceId: candidate.edgeA.pieceId,
        edgeName: candidate.edgeA.name,
        tStart: capSide === 'A' && capRange ? capRange[0] : 0,
        tEnd: capSide === 'A' && capRange ? capRange[1] : 1,
      },
      pieceB: {
        pieceId: candidate.edgeB.pieceId,
        edgeName: candidate.edgeB.name,
        tStart: capSide === 'B' && capRange ? capRange[0] : 0,
        tEnd: capSide === 'B' && capRange ? capRange[1] : 1,
      },
      type: 'standard' as const,
      tension: 100,
      strength: 1.0,
      active: true,
      taped: false,
      tapeWidth: 10,
      createdBy: 'ai' as const, // auto-sew proposal — review me
    },
    confidence: candidate.confidence,
    reason: candidate.breakdown.reason,
    breakdown: candidate.breakdown,
  }));

  // ── Self-close pass (sleeve tube closure) ─────────────────────────────────
  // The pipeline above pairs only DISTINCT pieces (the i<j loop + the
  // same-piece filter), so a sleeve's two underarm edges — which must seam to
  // EACH OTHER to close the tube around the arm — are never paired. This
  // additive pass consumes the 'self-close' matchHint (semanticEdges.ts) to
  // emit one same-piece underarm seam per piece that has exactly two such
  // edges. buildSeamConstraints supports same-piece seams; worldRefine passes
  // them through (Task 1). See the sleeve-tube-closure design doc.
  //
  // NOTE: onlyPairs is a CROSS-PIECE pairing whitelist — a same-piece tube
  // closure cannot be expressed as a pair, so onlyPairs must NOT gate this
  // pass. Every activePiece with exactly two self-close edges gets a seam.
  const d2 = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.hypot(a.x - b.x, a.y - b.y);
  const selfCloseSeams: ProposedSeam[] = [];
  const selfCloseEdgeKeys = new Set<string>();
  for (const piece of activePieces) {
    const sc = (pieceEdges.get(piece.id) ?? []).filter(e => e.matchHint === 'self-close');
    if (sc.length !== 2) {
      if (sc.length > 0) {
        console.warn(`[autoSew] piece ${piece.id} has ${sc.length} self-close edges (expected 2); skipping tube closure`);
      }
      continue;
    }
    const [eA, eB] = sc;
    // reversed: the two underarm edges traverse the outline loop in opposite
    // directions, so pairing start↔start joins diagonal corners. Pick the
    // pairing (straight vs crossed) with the smaller endpoint distance so the
    // cap end of A meets the cap end of B (a straight seam, not an X).
    const straight = d2(eA.start, eB.start) + d2(eA.end, eB.end);
    const crossed = d2(eA.start, eB.end) + d2(eA.end, eB.start);
    const reversed = crossed < straight;
    selfCloseEdgeKeys.add(`${piece.id}:${eA.edgeIndex}`);
    selfCloseEdgeKeys.add(`${piece.id}:${eB.edgeIndex}`);
    selfCloseSeams.push({
      seam: {
        // state-encoded ID — see B10-state; do NOT migrate to newId().
        id: `auto-seam-selfclose-${Date.now()}-${piece.id}`,
        pieceA: { pieceId: piece.id, edgeName: eA.name, tStart: 0, tEnd: 1 },
        pieceB: { pieceId: piece.id, edgeName: eB.name, tStart: 0, tEnd: 1, reversed },
        type: 'standard' as const,
        tension: 100,
        strength: 1.0,
        active: true,
        taped: false,
        tapeWidth: 10,
        createdBy: 'ai' as const,
      },
      confidence: 1.0,
      reason: 'sleeve underarm tube closure (self-seam)',
      breakdown: {
        naming: null, lengthSimilarity: 1, proximity: 1,
        edgePosition: 1, semanticMatch: 1, reason: 'self-close',
      },
    });
  }

  // Find unmatched edges (exclude self-close edges already claimed above)
  const matchedEdgeKeys = new Set<string>();
  for (const s of [...finalRanked, ...splitExtras]) {
    matchedEdgeKeys.add(`${s.edgeA.pieceId}:${s.edgeA.edgeIndex}`);
    matchedEdgeKeys.add(`${s.edgeB.pieceId}:${s.edgeB.edgeIndex}`);
  }
  for (const key of selfCloseEdgeKeys) matchedEdgeKeys.add(key);
  const unmatchedEdges: Edge[] = [];
  for (const edges of pieceEdges.values()) {
    for (const edge of edges) {
      if (!matchedEdgeKeys.has(`${edge.pieceId}:${edge.edgeIndex}`)) {
        unmatchedEdges.push(edge);
      }
    }
  }

  return {
    seams: [...seams, ...selfCloseSeams],
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
