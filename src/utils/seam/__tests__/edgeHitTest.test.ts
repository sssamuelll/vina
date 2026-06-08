import { describe, it, expect } from 'vitest';
import { pickEdgeForSeamAllowance, findNearestOutlineVertex, resolveSeamAllowanceClick } from '../edgeHitTest';
import type { PathCommand, PatternPiece, SemanticEdge } from '../../../types/types';

// Square M(0,0) L(200,0) L(200,200) L(0,200) Z. Segments are command-indexed:
//   cmd1 top (0,0)→(200,0), cmd2 right (200,0)→(200,200), cmd3 bottom (200,200)→(0,200).
// (The closing left edge comes from Z and carries no segment / no SemanticEdge.)
const square: PathCommand[] = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [200, 0] },
  { type: 'L', values: [200, 200] },
  { type: 'L', values: [0, 200] },
  { type: 'Z', values: [] },
];

const edges: SemanticEdge[] = [
  { id: 'p:top', name: 'top', segmentRange: [1, 2], edgeType: 'seam' },
  { id: 'p:right', name: 'right', segmentRange: [2, 3], edgeType: 'seam' },
  { id: 'p:bottom', name: 'bottom', segmentRange: [3, 4], edgeType: 'hem' },
];

describe('findNearestOutlineVertex', () => {
  it('finds the nearest M/L vertex within range, returning its command index', () => {
    const v = findNearestOutlineVertex(square, { x: 2, y: 2 }, 10);
    expect(v).toEqual({ index: 0, dist: expect.any(Number) });
  });
  it('returns null when no vertex is within range', () => {
    expect(findNearestOutlineVertex(square, { x: 100, y: 100 }, 10)).toBeNull();
  });
  it('picks the corner command index for a click near (200,0)', () => {
    const v = findNearestOutlineVertex(square, { x: 198, y: 2 }, 10);
    expect(v?.index).toBe(1); // command 1 = L(200,0)
  });
});

describe('resolveSeamAllowanceClick', () => {
  const piece = {
    id: 'p', name: 'Square', outline: square, position: { x: 0, y: 0 },
    edges, seamAllowance: 10, internals: [],
  } as unknown as PatternPiece;
  const pieces = [piece];

  it('resolves a click near a corner to that vertex (vertex wins over edge)', () => {
    const r = resolveSeamAllowanceClick(pieces, { x: 2, y: 2 }, 10, 12);
    expect(r).toEqual({ kind: 'vertex', pieceId: 'p', vertexIndex: 0 });
  });
  it('resolves a click near an edge midpoint to that edge', () => {
    const r = resolveSeamAllowanceClick(pieces, { x: 100, y: 2 }, 10, 12);
    expect(r).toEqual({ kind: 'edge', pieceId: 'p', edgeId: 'p:top' });
  });
  it('resolves a click in the body to the whole piece', () => {
    const r = resolveSeamAllowanceClick(pieces, { x: 100, y: 100 }, 10, 12);
    expect(r).toEqual({ kind: 'piece', pieceId: 'p' });
  });
  it('returns null for a click far outside any piece', () => {
    expect(resolveSeamAllowanceClick(pieces, { x: 999, y: 999 }, 10, 12)).toBeNull();
  });
  it('honors piece position offset', () => {
    const moved = [{ ...piece, position: { x: 500, y: 500 } } as unknown as PatternPiece];
    const r = resolveSeamAllowanceClick(moved, { x: 600, y: 502 }, 10, 12);
    expect(r).toEqual({ kind: 'edge', pieceId: 'p', edgeId: 'p:top' });
  });
});

describe('pickEdgeForSeamAllowance', () => {
  it('picks the top edge when clicking near the top segment', () => {
    const e = pickEdgeForSeamAllowance(square, edges, { x: 100, y: 2 }, 10);
    expect(e?.name).toBe('top');
  });

  it('picks the right edge when clicking near the right segment', () => {
    const e = pickEdgeForSeamAllowance(square, edges, { x: 198, y: 100 }, 10);
    expect(e?.name).toBe('right');
  });

  it('picks the bottom edge when clicking near the bottom segment', () => {
    const e = pickEdgeForSeamAllowance(square, edges, { x: 100, y: 198 }, 10);
    expect(e?.name).toBe('bottom');
  });

  it('returns null when the click is farther than maxDist from any edge', () => {
    expect(pickEdgeForSeamAllowance(square, edges, { x: 100, y: 100 }, 10)).toBeNull();
  });

  it('returns null when the nearest segment has no covering semantic edge (closing edge)', () => {
    // Click near the left/closing edge (x≈0) — no segment/SemanticEdge covers it.
    expect(pickEdgeForSeamAllowance(square, edges, { x: 2, y: 100 }, 10)).toBeNull();
  });

  it('returns null when there are no semantic edges', () => {
    expect(pickEdgeForSeamAllowance(square, [], { x: 100, y: 2 }, 10)).toBeNull();
  });
});
