/**
 * Regression guard for #506 follow-up — orphan-bridging post-processing.
 *
 * Greedy edge dedup in `rankAndDeduplicate` correctly enforces "each fabric
 * edge belongs to at most one seam" for the structural seam graph, but
 * over-restricts the common case of **interfacing/lining stacks**: pieces
 * like `CuffInterface` share IDENTICAL geometry with their parent `Cuff`,
 * so the four perfect Cuff↔CuffInterface candidates consume all of Cuff's
 * edges before Cuff↔Sleeve (an excellent naming-rule match at 0.9) can
 * fire. The result was the Male Shirt and T-Shirt cases on the #506 DoD
 * e2e: 17 pieces in 2 components instead of 1, gate fails.
 *
 * The fix is a single post-processing pass: find connected components, and
 * for each non-main component, attach the single highest-confidence
 * candidate that bridges it to the main component — drawn from the same
 * scored-candidates list, so no new geometry is computed, only the dedup
 * rule is relaxed for the bridge. The bridge candidate may re-use an edge
 * already used in the main pass (e.g., Sleeve's wrist edge anchors both
 * the Body↔Sleeve seam and the Sleeve↔Cuff bridge), which is what physical
 * stacking actually does.
 *
 * These tests lock in:
 *  (1) interfacing pieces with identical geometry don't strand the parent
 *  (2) the post-processing is non-invasive when no orphans exist
 *  (3) the bridge confidence floor (0.15) doesn't admit random pairings
 */
import { describe, it, expect } from 'vitest';
import type { PatternPiece, PathCommand } from '../../../types/types';
import { autoSew } from '../index';

function makeRect(id: string, name: string, x: number, y: number, w: number, h: number): PatternPiece {
  const outline: PathCommand[] = [
    { type: 'M', values: [x, y] },
    { type: 'L', values: [x + w, y] },
    { type: 'L', values: [x + w, y + h] },
    { type: 'L', values: [x, y + h] },
    { type: 'L', values: [x, y] },
    { type: 'Z', values: [] },
  ];
  return {
    id, name, outline,
    internals: [],
    position: { x: 0, y: 0 },
    rotation: 0,
    mirrored: false,
    seamAllowance: 10,
    layer: 1,
    sublayer: 0,
    active: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/**
 * Build adjacency from proposed seams and count connected components.
 * Mirrors the e2e DoD test's BFS.
 */
function countComponents(pieces: PatternPiece[], seams: Array<{ seam: { pieceA: { pieceId: string }; pieceB: { pieceId: string } } }>): number {
  const adj = new Map<string, Set<string>>();
  pieces.forEach(p => adj.set(p.id, new Set()));
  for (const s of seams) {
    adj.get(s.seam.pieceA.pieceId)?.add(s.seam.pieceB.pieceId);
    adj.get(s.seam.pieceB.pieceId)?.add(s.seam.pieceA.pieceId);
  }
  const visited = new Set<string>();
  let components = 0;
  for (const p of pieces) {
    if (visited.has(p.id)) continue;
    components++;
    const queue = [p.id];
    while (queue.length) {
      const id = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);
      adj.get(id)?.forEach(n => { if (!visited.has(n)) queue.push(n); });
    }
  }
  return components;
}

describe('#506 — orphan-bridging post-processing', () => {
  it('bridges an interfacing piece whose parent is otherwise stranded', () => {
    // Mimic the Male Shirt Cuff↔CuffInterface case: two identical
    // small-rectangle pieces that would consume each others' edges, plus
    // a sleeve that needs to attach to the cuff via the cuff's long edge.
    const sleeve = makeRect('sleeve', 'FullSleeve', 0, 0, 290, 600);     // 290mm wrist
    const cuff = makeRect('cuff', 'Cuff', 400, 600, 290, 60);            // 290mm × 60mm cuff
    const cuffInterface = makeRect('cuff_if', 'CuffInterface', 700, 600, 290, 60);
    // Add a "body" piece so the sleeve has a non-cuff partner and the
    // graph would otherwise be {sleeve+body} ∪ {cuff+cuffInterface}.
    const body = makeRect('body', 'FrontPanel', -400, 0, 400, 600);

    const result = autoSew([sleeve, cuff, cuffInterface, body], {
      minConfidence: 0.3,
    });

    // Bridge pass MUST connect the cuff cluster to the sleeve/body cluster.
    const components = countComponents([sleeve, cuff, cuffInterface, body], result.seams);
    expect(components).toBe(1);
  });

  it('does not add bridges when all pieces are already connected', () => {
    // Standard front + back + sleeve. Pre-existing autoSew already
    // produces a single component; the bridge pass should be a no-op.
    const front = makeRect('f', 'Front', 0, 0, 200, 400);
    const back = makeRect('b', 'Back', 250, 0, 200, 400);
    const sleeve = makeRect('s', 'Sleeve', 500, 0, 180, 350);

    const result = autoSew([front, back, sleeve], { minConfidence: 0.3 });
    const components = countComponents([front, back, sleeve], result.seams);
    expect(components).toBe(1);
    // The seam count should not be inflated by useless bridges. With 3
    // structural pieces we expect ≤ a handful of seams, not 10+.
    expect(result.seams.length).toBeLessThan(10);
  });

  it('does not bridge pieces that share no geometric similarity (e.g., unrelated rectangles)', () => {
    // Two clusters where the orphan piece is geometrically nothing like
    // anything in the main cluster. The 0.15 bridge floor should reject
    // every candidate, leaving the components separate.
    const main1 = makeRect('m1', 'Front', 0, 0, 200, 400);
    const main2 = makeRect('m2', 'Back', 250, 0, 200, 400);
    // An orphan piece with sizes (5mm × 7mm) — nothing in the main
    // cluster has edges close to these lengths, so all candidates
    // should score well below 0.15.
    const orphan = makeRect('o', 'WhateverTinyThing', 10000, 10000, 5, 7);

    const result = autoSew([main1, main2, orphan], { minConfidence: 0.3 });
    const components = countComponents([main1, main2, orphan], result.seams);
    // Orphan stays isolated — gate (and bridge floor) preserved.
    expect(components).toBeGreaterThanOrEqual(2);
  });

  it('bridges multiple independent orphan clusters into the main component', () => {
    // Three clusters: main (front+back), orphan-A (cuff pair), orphan-B
    // (collar pair). After bridging both A and B should merge into main.
    const front = makeRect('f', 'FrontPanel', 0, 0, 200, 400);
    const back = makeRect('b', 'BackPanel', 250, 0, 200, 400);
    const sleeve = makeRect('s', 'FullSleeve', 500, 0, 290, 350);   // 290mm sleeve wrist
    const cuff = makeRect('cuff', 'Cuff', 800, 0, 290, 60);
    const cuffIf = makeRect('cuff_if', 'CuffInterface', 1100, 0, 290, 60);
    const collar = makeRect('col', 'CollarBase', -400, 0, 232, 60);    // 232mm collar
    const collarIf = makeRect('col_if', 'CollarBaseInterface', -800, 0, 232, 60);

    const result = autoSew(
      [front, back, sleeve, cuff, cuffIf, collar, collarIf],
      { minConfidence: 0.3 },
    );
    const components = countComponents(
      [front, back, sleeve, cuff, cuffIf, collar, collarIf],
      result.seams,
    );
    expect(components).toBe(1);
  });

  it('bridge pass re-uses a main-pass edge (the "physical stacking" contract per index.ts:179)', () => {
    // Lock the semantic contract: the bridging pass may produce a seam that
    // re-uses an edge already consumed by the main pass. This is intentional
    // (interface/lining stacks physically share fabric edges), and the only
    // way the cuff↔sleeve bridge can fire after cuff↔cuffInterface consumes
    // all 4 cuff edges in the main pass.
    //
    // Topology: cuffInterface is STACKED on the cuff (same coordinates —
    // how an interface physically lives on its fabric), so the 4 identical
    // edge pairs are unbeatable proximity+length matches and the main pass
    // deterministically consumes all 4 cuff edges. The sleeve shares the
    // 290mm wrist length, so its high-confidence candidate to the cuff can
    // only fire as a bridge re-using a consumed edge.
    //
    // (M1 camisa de María: edges now come from the shared tram segmentation
    // with TRUE arc midpoints and outward normals; the old side-by-side
    // layout depended on corner-as-midpoint artifacts to rank the pairs.)
    const cuff = makeRect('cuff', 'Cuff', 0, 0, 290, 60);
    const cuffInterface = makeRect('cuff-interface', 'CuffInterface', 0, 0, 290, 60);
    const sleeve = makeRect('sleeve', 'FullSleeve', 800, 0, 290, 600);

    const result = autoSew([cuff, cuffInterface, sleeve], { minConfidence: 0.3 });

    // Sanity: connectivity flipped to a single component.
    expect(countComponents([cuff, cuffInterface, sleeve], result.seams)).toBe(1);
    // 4 main-pass cuff↔cuffInterface seams + ≥1 bridge.
    expect(result.seams.length).toBeGreaterThanOrEqual(5);

    // Build a map: cuff-edge-name → list of partner piece IDs across all seams
    // touching the cuff. An edge re-used in main+bridge will show two partners
    // (cuff-interface from the main pass, sleeve from the bridge pass).
    const cuffEdgeUsage = new Map<string, string[]>();
    for (const s of result.seams) {
      if (s.seam.pieceA.pieceId === 'cuff') {
        const key = s.seam.pieceA.edgeName;
        cuffEdgeUsage.set(key, [...(cuffEdgeUsage.get(key) ?? []), s.seam.pieceB.pieceId]);
      }
      if (s.seam.pieceB.pieceId === 'cuff') {
        const key = s.seam.pieceB.edgeName;
        cuffEdgeUsage.set(key, [...(cuffEdgeUsage.get(key) ?? []), s.seam.pieceA.pieceId]);
      }
    }
    const reusedEdges = [...cuffEdgeUsage.entries()].filter(([, partners]) => partners.length >= 2);
    // At least one cuff edge participates in two seams (one main + one bridge).
    expect(reusedEdges.length).toBeGreaterThanOrEqual(1);
    const partners = reusedEdges[0][1].slice().sort();
    expect(partners).toContain('cuff-interface');
    expect(partners).toContain('sleeve');
  });

  it('is deterministic: same input twice → identical seam set (guards against future ordering bugs)', () => {
    // Algorithm IS deterministic by construction (insertion-order iteration,
    // strict-greater comparison in the bridge picker), but a future refactor
    // could accidentally introduce Set→Array ordering or unstable `.sort()`
    // dependencies. This test locks the property.
    //
    // Use the multi-orphan fixture so both the main pass AND the bridge pass
    // have non-trivial work to do across multiple orphan components.
    const front = makeRect('f', 'FrontPanel', 0, 0, 200, 400);
    const back = makeRect('b', 'BackPanel', 250, 0, 200, 400);
    const sleeve = makeRect('s', 'FullSleeve', 500, 0, 290, 350);
    const cuff = makeRect('cuff', 'Cuff', 800, 0, 290, 60);
    const cuffIf = makeRect('cuff_if', 'CuffInterface', 1100, 0, 290, 60);
    const collar = makeRect('col', 'CollarBase', -400, 0, 232, 60);
    const collarIf = makeRect('col_if', 'CollarBaseInterface', -800, 0, 232, 60);
    const pieces = [front, back, sleeve, cuff, cuffIf, collar, collarIf];

    const run1 = autoSew(pieces, { minConfidence: 0.3 });
    const run2 = autoSew(pieces, { minConfidence: 0.3 });

    expect(run1.seams.length).toBe(run2.seams.length);

    // Project each seam to a stable, structure-only key (drop the timestamped
    // `id` field which is intentionally per-run unique per index.ts:201).
    type SeamKey = {
      a: string; aEdge: string;
      b: string; bEdge: string;
      confidence: number;
    };
    const project = (rs: typeof run1.seams): SeamKey[] =>
      rs.map(s => ({
        a: s.seam.pieceA.pieceId,
        aEdge: s.seam.pieceA.edgeName,
        b: s.seam.pieceB.pieceId,
        bEdge: s.seam.pieceB.edgeName,
        confidence: s.confidence,
      }));
    const byKey = (x: SeamKey, y: SeamKey): number =>
      x.a.localeCompare(y.a) || x.aEdge.localeCompare(y.aEdge)
      || x.b.localeCompare(y.b) || x.bEdge.localeCompare(y.bEdge);

    const k1 = project(run1.seams).sort(byKey);
    const k2 = project(run2.seams).sort(byKey);
    expect(JSON.stringify(k1)).toBe(JSON.stringify(k2));
  });

  it('does NOT produce self-component bridges (filter at index.ts:325 holds)', () => {
    // Pragmatic shortcut from the spec: rather than try to construct a
    // geometry where the highest-scored bridge candidate is intra-orphan
    // (which is fragile to scorer-weight changes), we exercise the filter
    // negatively. Two orphan components where neither shares any plausible
    // geometric similarity with the main component MUST stay orphaned —
    // proving the bridging pass refused to fall back to intra-orphan
    // candidates as bridges.
    //
    // Main: front + back (rectangular pair, matching sides).
    // OrphanX↔OrphanY: a pair of tiny identical squares that match each
    // other in the main pass but share NO edge length with main pieces
    // (all main edges are ≥200mm; orphans are 3mm × 3mm).
    const mainA = makeRect('main-a', 'FrontPanel', 0, 0, 200, 400);
    const mainB = makeRect('main-b', 'BackPanel', 250, 0, 200, 400);
    const orphanX = makeRect('orphan-x', 'WhateverDetail', 10000, 10000, 3, 3);
    const orphanY = makeRect('orphan-y', 'WhateverDetail', 10100, 10000, 3, 3);

    const result = autoSew([mainA, mainB, orphanX, orphanY], { minConfidence: 0.3 });

    // The orphan pair is internally connected (main-pass seams between them)
    // but the bridging pass must NOT promote an orphan↔orphan candidate to
    // bridge them with main — that would require the same-component filter
    // at index.ts:325 to be broken. Components stays ≥ 2.
    const components = countComponents([mainA, mainB, orphanX, orphanY], result.seams);
    expect(components).toBeGreaterThanOrEqual(2);

    // Direct assertion on the filter contract: every cross-piece seam either
    // stays within {main-a, main-b} or within {orphan-x, orphan-y}; no seam
    // bridges across the two components.
    const mainSet = new Set(['main-a', 'main-b']);
    const orphanSet = new Set(['orphan-x', 'orphan-y']);
    for (const s of result.seams) {
      const aMain = mainSet.has(s.seam.pieceA.pieceId);
      const bMain = mainSet.has(s.seam.pieceB.pieceId);
      const aOrphan = orphanSet.has(s.seam.pieceA.pieceId);
      const bOrphan = orphanSet.has(s.seam.pieceB.pieceId);
      // Each seam is fully within one cluster — no smuggled cross-cluster seam.
      expect((aMain && bMain) || (aOrphan && bOrphan)).toBe(true);
    }
  });
});
