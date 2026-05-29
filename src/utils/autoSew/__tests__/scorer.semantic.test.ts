import { describe, it, expect } from 'vitest';
import { scoreEdgePair } from '../scorer';
import type { Edge } from '../edgeExtractor';
import type { LengthMatch } from '../arcLengthMatcher';

function edge(
  name: string,
  arcLength: number,
  opts: { pieceId?: string; edgeIndex?: number; matchHint?: string } = {},
): Edge {
  return {
    pieceId: opts.pieceId ?? 'p',
    edgeIndex: opts.edgeIndex ?? 0,
    segStart: 0,
    segEnd: 1,
    arcLength,
    midpoint: { x: 0, y: 0 },
    normal: { x: 1, y: 0 },
    start: { x: 0, y: 0 },
    end: { x: 0, y: 0 },
    points: [],
    name,
    matchHint: opts.matchHint,
  };
}

function lm(a: Edge, b: Edge, similarity: number): LengthMatch {
  return { edgeA: a, edgeB: b, similarity, lengthDiff: Math.abs(a.arcLength - b.arcLength) };
}

describe('scoreEdgePair — semantic role lift (#3 phase 2: DXF pairing)', () => {
  it('boosts a geometrically-plausible semantic match above an identical-geometry generic pair', () => {
    const armhole = edge('armhole', 300, { pieceId: 'bodice', edgeIndex: 1, matchHint: 'pairs with sleeveCap' });
    const sleeveCap = edge('sleeveCap', 310, { pieceId: 'sleeve', edgeIndex: 0, matchHint: 'pairs with armhole' });
    const semantic = scoreEdgePair(armhole, sleeveCap, null, lm(armhole, sleeveCap, 0.9));

    const g1 = edge('edge-1', 300, { pieceId: 'a', edgeIndex: 1 });
    const g2 = edge('edge-2', 310, { pieceId: 'b', edgeIndex: 0 });
    const generic = scoreEdgePair(g1, g2, null, lm(g1, g2, 0.9));

    expect(semantic.breakdown.semanticMatch).toBe(1);
    expect(generic.breakdown.semanticMatch).toBe(0);
    expect(semantic.confidence).toBeGreaterThan(generic.confidence);
  });

  it('matches sideSeam↔sideSeam via the cross-piece hint', () => {
    const front = edge('sideSeam', 500, { pieceId: 'f', edgeIndex: 2, matchHint: 'pairs with back-sideSeam' });
    const back = edge('sideSeam', 505, { pieceId: 'b', edgeIndex: 2, matchHint: 'pairs with front-sideSeam' });
    const scored = scoreEdgePair(front, back, null, lm(front, back, 0.95));
    expect(scored.breakdown.semanticMatch).toBe(1);
  });

  it('does NOT lift when geometry is implausible (mislabel guard)', () => {
    // A 300mm armhole and a 60mm "sleeveCap" (ratio 0.2 < 0.5) — a likely
    // mislabel. The plausibility gate must withhold the lift so it cannot
    // force a confidently-wrong seam.
    const armhole = edge('armhole', 300, { matchHint: 'pairs with sleeveCap' });
    const tinyCap = edge('sleeveCap', 60, { matchHint: 'pairs with armhole' });
    const scored = scoreEdgePair(armhole, tinyCap, null, lm(armhole, tinyCap, 0.1));
    expect(scored.breakdown.semanticMatch).toBe(0);
  });

  it('does not match unrelated roles (neckline does not pair with cuffEdge)', () => {
    const neckline = edge('neckline', 200, { matchHint: 'pairs with collarNeckEdge' });
    const cuff = edge('cuffEdge', 205);
    const scored = scoreEdgePair(neckline, cuff, null, lm(neckline, cuff, 0.95));
    expect(scored.breakdown.semanticMatch).toBe(0);
  });
});
