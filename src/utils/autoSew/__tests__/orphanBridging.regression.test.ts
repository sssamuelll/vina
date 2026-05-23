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
});
