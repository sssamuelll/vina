import { describe, it, expect } from 'vitest';
import { buildMatchLookup } from '../matchResolver';
import { measureBorderCutLength } from '../cornerTypes';
import type { PathCommand, PatternPiece, Seam, SemanticEdge } from '../../../types/types';

// ─── Fixtures ────────────────────────────────────────────────────────────────
//
// 100×100 square (CW in screen Y-down, same winding as cornerTypes.test.ts).
//   M(0,0)c0 · L(100,0)c1 · L(100,100)c2 · L(0,100)c3 · Z
// SemanticEdges partition the outline in command space:
//   top    [1,2)   right/sideSeam [2,3)   bottom [3,4)
// Corner vertex command 1 = (100,0): joint of `top` (covers cmd1) and
// `sideSeam` (covers cmd2).

const square: PathCommand[] = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [100, 0] },
  { type: 'L', values: [100, 100] },
  { type: 'L', values: [0, 100] },
  { type: 'Z', values: [] },
];

function se(name: string, range: [number, number]): SemanticEdge {
  return { id: `${name}`, name, segmentRange: range, edgeType: 'seam' };
}

function makePiece(id: string, over: Partial<PatternPiece> = {}): PatternPiece {
  return {
    id,
    name: id,
    outline: square,
    internals: [],
    position: { x: 0, y: 0 },
    rotation: 0,
    mirrored: false,
    seamAllowance: 10,
    edges: [se('top', [1, 2]), se('sideSeam', [2, 3]), se('bottom', [3, 4])],
    active: true,
    createdAt: 0,
    updatedAt: 0,
    ...over,
  } as PatternPiece;
}

function seam(aId: string, aEdge: string, bId: string, bEdge: string): Seam {
  return {
    id: `${aId}:${aEdge}~${bId}:${bEdge}`,
    pieceA: { pieceId: aId, edgeName: aEdge },
    pieceB: { pieceId: bId, edgeName: bEdge },
    type: 'standard',
    tension: 100,
    strength: 1,
    active: true,
    taped: false,
    tapeWidth: 10,
  };
}

// ─── measureBorderCutLength (mitered cut length of a border) ──────────────────

describe('measureBorderCutLength', () => {
  it('measures the sideSeam (right edge) mitered cut length = 120 on a 100² SA=10 square', () => {
    // Right edge offset x=110; its corners are miters (110,-10) and (110,110).
    const len = measureBorderCutLength(square, 10, makePiece('p').edges, [2, 3]);
    expect(len).not.toBeNull();
    expect(len!).toBeCloseTo(120, 3);
  });

  it('returns null for a border whose command range emits no edges', () => {
    expect(measureBorderCutLength(square, 10, makePiece('p').edges, [9, 10])).toBeNull();
  });

  // ── Real partner corners at the border extremes (the maria-164 fix) ──────────
  // The old measurement forced EVERY corner to mitered, so a partner whose sewn
  // border ends in a squared/envelope/… corner reported a length that was not
  // the real cut line ("lo primero que dices no es real"). The measurement must
  // use the partner's REAL corner geometry at the two border extremes, degrading
  // only `match` → mitered (one-level anti-recursion).
  //
  // sideSeam [2,3) = right edge, vertices v1=(100,0)..v2=(100,100). Mitered cut =
  // miter(110,-10)→miter(110,110) = 120. Squaring the TOP-RIGHT corner (command 1)
  // attributes the 10mm mitered overhang to the CORNER, not the border: the
  // sideSeam cut now starts at the on-edge point (110,0). Real length = 110.
  // NOTE: on a convex corner the miter apex is the OUTERMOST point, so any real
  // corner (squared/envelope/…) shortens the border cut vs the forced miter — the
  // design prose's "más larga" holds only for reflex corners; here the invariant
  // is that the length changes to the TRUE value, and mitered is the maximum.
  const edges = makePiece('p').edges;

  it('uses the partner REAL squared corner at the start extreme (110, not the forced-mitered 120)', () => {
    const mitered = measureBorderCutLength(square, 10, edges, [2, 3]);
    const squared = measureBorderCutLength(square, 10, edges, [2, 3], { 1: 'squared' });
    expect(mitered!).toBeCloseTo(120, 3);
    expect(squared!).toBeCloseTo(110, 3);
    expect(squared!).toBeLessThan(mitered!);
  });

  it('respects a real squared corner at BOTH border extremes (command 1 and command 2)', () => {
    // Squaring cmd2 (bottom-right, the END vertex) drops the other overhang too.
    const endOnly = measureBorderCutLength(square, 10, edges, [2, 3], { 2: 'squared' });
    const both = measureBorderCutLength(square, 10, edges, [2, 3], { 1: 'squared', 2: 'squared' });
    expect(endOnly!).toBeCloseTo(110, 3);
    expect(both!).toBeCloseTo(100, 3);
  });

  it('respects a real envelope corner at the start extreme (≠ mitered)', () => {
    // envelope tab starts at miter + nextDir*ext, ext = 10*0.75 = 7.5 → (110,-2.5);
    // cut = (110,-2.5)→(110,110) = 112.5.
    const envelope = measureBorderCutLength(square, 10, edges, [2, 3], { 1: 'envelope' });
    expect(envelope!).toBeCloseTo(112.5, 3);
    expect(envelope!).not.toBeCloseTo(120, 1);
  });

  it('degrades a partner `match` corner at the extreme to mitered (one-level anti-recursion)', () => {
    // A partner corner typed `match` must NOT re-resolve — measured as mitered.
    const asMatch = measureBorderCutLength(square, 10, edges, [2, 3], { 1: 'match' });
    expect(asMatch!).toBeCloseTo(120, 3);
  });

  it('is byte-identical to the forced-mitered length when the partner is all-mitered (regression pin)', () => {
    const noTypes = measureBorderCutLength(square, 10, edges, [2, 3]);
    const explicitDefault = measureBorderCutLength(square, 10, edges, [2, 3], {}, 'mitered');
    expect(noTypes!).toBeCloseTo(120, 6);
    expect(explicitDefault!).toBeCloseTo(noTypes!, 6);
  });
});

// ─── buildMatchLookup ────────────────────────────────────────────────────────

describe('buildMatchLookup', () => {
  it('resolves a match vertex → sewn border → partner targetLen', () => {
    // A's sideSeam (right edge) is sewn to B's sideSeam. The match corner is
    // vertex command 1, where `top` (unsewn) meets `sideSeam` (sewn) → side 'next'.
    const a = makePiece('A', { cornerTypes: { 1: 'match' } });
    const b = makePiece('B');
    const seams = [seam('A', 'sideSeam', 'B', 'sideSeam')];

    const lookup = buildMatchLookup(a, [a, b], seams);
    expect(lookup[1]).toBeDefined();
    expect(lookup[1].side).toBe('next');
    // Partner B's sideSeam mitered cut length = 120.
    expect(lookup[1].targetLen).toBeCloseTo(120, 3);
  });

  it('reads targetLen from the partner REAL corner, not a forced miter', () => {
    // A's sideSeam is sewn to B's sideSeam; B squares its top-right corner (cmd1),
    // an extreme of that border. A's match target must be B's TRUE cut length (110),
    // not the old forced-mitered 120.
    const a = makePiece('A', { cornerTypes: { 1: 'match' } });
    const b = makePiece('B', { cornerTypes: { 1: 'squared' } });
    const seams = [seam('A', 'sideSeam', 'B', 'sideSeam')];
    const lookup = buildMatchLookup(a, [a, b], seams);
    expect(lookup[1].targetLen).toBeCloseTo(110, 3);
  });

  it('is deterministic and mutually stable for two pieces matched to each other', () => {
    const a = makePiece('A', { cornerTypes: { 1: 'match' } });
    const b = makePiece('B', { cornerTypes: { 1: 'match' } });
    const seams = [seam('A', 'sideSeam', 'B', 'sideSeam')];

    const la1 = buildMatchLookup(a, [a, b], seams);
    const la2 = buildMatchLookup(a, [a, b], seams);
    const lb = buildMatchLookup(b, [a, b], seams);

    // Each resolves against the OTHER's mitered length (anti-recursion) →
    // identical, order-independent, stable across repeated calls.
    expect(la1[1].targetLen).toBeCloseTo(120, 3);
    expect(la2[1].targetLen).toBeCloseTo(la1[1].targetLen, 6);
    expect(lb[1].targetLen).toBeCloseTo(120, 3);
  });

  it('prefers the prev border (lower command) when both adjacent borders are sewn', () => {
    // Corner cmd1: top[1,2) and sideSeam[2,3) BOTH sewn → tiebreak = prev (top).
    const a = makePiece('A', { cornerTypes: { 1: 'match' } });
    const b = makePiece('B');
    const seams = [
      seam('A', 'top', 'B', 'bottom'),
      seam('A', 'sideSeam', 'B', 'sideSeam'),
    ];
    const lookup = buildMatchLookup(a, [a, b], seams);
    expect(lookup[1].side).toBe('prev');
  });

  it('produces no entry when neither adjacent border is sewn (fallback → mitered)', () => {
    const a = makePiece('A', { cornerTypes: { 1: 'match' } });
    const b = makePiece('B');
    const lookup = buildMatchLookup(a, [a, b], []); // no seams
    expect(lookup[1]).toBeUndefined();
  });

  it('produces no entry when the partner piece is missing', () => {
    const a = makePiece('A', { cornerTypes: { 1: 'match' } });
    const seams = [seam('A', 'sideSeam', 'B', 'sideSeam')];
    const lookup = buildMatchLookup(a, [a], seams); // B not in allPieces
    expect(lookup[1]).toBeUndefined();
  });

  it('ignores non-match vertices', () => {
    const a = makePiece('A', { cornerTypes: { 1: 'squared' } });
    const b = makePiece('B');
    const seams = [seam('A', 'sideSeam', 'B', 'sideSeam')];
    const lookup = buildMatchLookup(a, [a, b], seams);
    expect(Object.keys(lookup)).toHaveLength(0);
  });
});
