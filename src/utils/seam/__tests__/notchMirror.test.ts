import { describe, it, expect } from 'vitest';
import { mapNotchAcrossSeam, findEdgeByName, interiorNormalAtPoint } from '../notchMirror';
import type { PatternPiece, Seam } from '../../../types/types';

// Piece A: square; right edge (x=200) is command index 2 → (200,0)→(200,400).
function pieceA(): PatternPiece {
  return {
    id: 'A', name: 'Front',
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [200, 0] },
      { type: 'L', values: [200, 400] },
      { type: 'L', values: [0, 400] },
      { type: 'Z', values: [] },
    ],
    edges: [{ id: 'A:side', name: 'sideSeam', segmentRange: [2, 3], edgeType: 'seam' }],
    internals: [], position: { x: 0, y: 0 }, rotation: 0, mirrored: false, seamAllowance: 0,
    active: true, createdAt: 1, updatedAt: 1,
  } as unknown as PatternPiece;
}

// Piece B: square offset right; left edge (x=0) is command index 1 → (0,0)→(0,400).
function pieceB(): PatternPiece {
  return {
    id: 'B', name: 'Back',
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [0, 400] },
      { type: 'L', values: [200, 400] },
      { type: 'L', values: [200, 0] },
      { type: 'Z', values: [] },
    ],
    edges: [{ id: 'B:side', name: 'sideSeam', segmentRange: [1, 2], edgeType: 'seam' }],
    internals: [], position: { x: 300, y: 0 }, rotation: 0, mirrored: false, seamAllowance: 0,
    active: true, createdAt: 1, updatedAt: 1,
  } as unknown as PatternPiece;
}

const seam: Seam = {
  id: 's1', pieceA: { pieceId: 'A', edgeName: 'sideSeam' }, pieceB: { pieceId: 'B', edgeName: 'sideSeam' },
  type: 'standard', tension: 100, strength: 1, active: true, taped: false, tapeWidth: 10,
} as unknown as Seam;

describe('notchMirror.mapNotchAcrossSeam', () => {
  it('maps a notch to the same fraction on the paired edge (direct sense)', () => {
    const r = mapNotchAcrossSeam({ sourcePiece: pieceA(), point: { x: 200, y: 100 }, seams: [seam], pieces: [pieceA(), pieceB()] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.pairedPieceId).toBe('B');
    expect(r.frac).toBeCloseTo(0.25, 4);          // 100 / 400
    expect(r.point.x).toBeCloseTo(0, 3);
    expect(r.point.y).toBeCloseTo(100, 3);        // 0.25 * 400 along B's left edge
  });

  it('invert flips the traversal sense (right-sides-together case)', () => {
    const r = mapNotchAcrossSeam({ sourcePiece: pieceA(), point: { x: 200, y: 100 }, seams: [seam], pieces: [pieceA(), pieceB()], invert: true });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.point.y).toBeCloseTo(300, 3);        // (1 - 0.25) * 400
  });

  it('errors clearly when the edge has no seam', () => {
    const r = mapNotchAcrossSeam({ sourcePiece: pieceA(), point: { x: 200, y: 100 }, seams: [], pieces: [pieceA(), pieceB()] });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('no-seam');
  });

  it('interior normal points inward (+x on B left edge, shoelace winding)', () => {
    const n = interiorNormalAtPoint(pieceB().outline, { x: 0, y: 100 });
    expect(n.x).toBeCloseTo(1, 3);
    expect(n.y).toBeCloseTo(0, 3);
  });

  it('findEdgeByName resolves by name and the edge-N positional fallback', () => {
    const p = pieceA();
    expect(findEdgeByName(p, 'sideSeam')?.id).toBe('A:side');
    expect(findEdgeByName(p, 'edge-0')?.id).toBe('A:side');
    expect(findEdgeByName(p, 'nope')).toBeNull();
  });
});
