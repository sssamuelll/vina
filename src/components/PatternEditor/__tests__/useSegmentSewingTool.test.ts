import { describe, it, expect } from 'vitest';
import { snapToEdge } from '../useSegmentSewingTool';
import type { PatternPiece } from '../../../types/types';

// A simple square piece: M 0,0 L 100,0 L 100,100 L 0,100 Z
const squarePiece: PatternPiece = {
  id: 'p1',
  name: 'Square',
  outline: [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [100, 0] },   // edge 1: top (0,0)→(100,0)
    { type: 'L', values: [100, 100] }, // edge 2: right (100,0)→(100,100)
    { type: 'L', values: [0, 100] },   // edge 3: bottom (100,100)→(0,100)
    { type: 'Z', values: [] },          // edge 4: left (0,100)→(0,0)
  ],
  position: { x: 0, y: 0 },
  rotation: 0,
  mirrored: false,
  seamAllowance: 0,
  internals: [],
  layer: 1,
  sublayer: 0,
  active: true,
  createdAt: 0,
  updatedAt: 0,
};

describe('snapToEdge', () => {
  it('snaps to middle of top edge', () => {
    const result = snapToEdge({ x: 50, y: 2 }, squarePiece, 1);
    expect(result).not.toBeNull();
    expect(result!.edgeIndex).toBe(1);
    expect(result!.point.x).toBeCloseTo(50, 0);
    expect(result!.point.y).toBeCloseTo(0, 0);
    expect(result!.t).toBeCloseTo(0.5, 1);
  });

  it('snaps to start of right edge', () => {
    const result = snapToEdge({ x: 98, y: 5 }, squarePiece, 1);
    expect(result).not.toBeNull();
    expect(result!.edgeIndex).toBe(2);
    expect(result!.point.x).toBeCloseTo(100, 0);
    expect(result!.t).toBeLessThan(0.1);
  });

  it('returns null when point is far from outline', () => {
    const result = snapToEdge({ x: 50, y: 50 }, squarePiece, 1);
    expect(result).toBeNull();
  });

  it('accounts for piece position offset', () => {
    const offsetPiece = { ...squarePiece, position: { x: 200, y: 200 } };
    const result = snapToEdge({ x: 250, y: 202 }, offsetPiece, 1);
    expect(result).not.toBeNull();
    expect(result!.edgeIndex).toBe(1);
    expect(result!.point.x).toBeCloseTo(250, 0);
    expect(result!.point.y).toBeCloseTo(200, 0);
  });

  it('constrains to same edge when edgeConstraint is given', () => {
    const result = snapToEdge({ x: 95, y: 5 }, squarePiece, 1, 1);
    expect(result).not.toBeNull();
    expect(result!.edgeIndex).toBe(1);
  });
});
