import { describe, it, expect } from 'vitest';
import { pickEdgeForSeamAllowance } from '../edgeHitTest';
import type { PathCommand, SemanticEdge } from '../../../types/types';

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
