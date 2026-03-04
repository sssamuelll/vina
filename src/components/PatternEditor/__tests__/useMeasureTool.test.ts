import { describe, it, expect } from 'vitest';
import { snapToOutline, calculatePathLength } from '../useMeasureTool';
import type { PatternPiece } from '../../../types/types';

describe('snapToOutline', () => {
  const piece: PatternPiece = {
    id: 'p1',
    name: 'Test',
    position: { x: 0, y: 0 },
    outline: [
      { type: 'M' as const, values: [0, 0] },
      { type: 'L' as const, values: [100, 0] },
      { type: 'L' as const, values: [100, 100] },
      { type: 'L' as const, values: [0, 100] },
      { type: 'Z' as const, values: [] },
    ],
    internals: [],
    rotation: 0,
    mirrored: false,
    seamAllowance: 0,
    createdAt: 0,
    updatedAt: 0,
  };

  it('snaps to nearest point on outline within threshold', () => {
    const result = snapToOutline({ x: 50, y: 2 }, piece, 1.0);
    expect(result).not.toBeNull();
    expect(result!.point.y).toBeCloseTo(0, 1);
    expect(result!.point.x).toBeCloseTo(50, 1);
  });

  it('returns null when point is far from outline', () => {
    const result = snapToOutline({ x: 50, y: 50 }, piece, 1.0);
    expect(result).toBeNull();
  });

  it('handles piece position offset', () => {
    const offsetPiece: PatternPiece = { ...piece, position: { x: 200, y: 300 } };
    const result = snapToOutline({ x: 250, y: 302 }, offsetPiece, 1.0);
    expect(result).not.toBeNull();
    expect(result!.point.y).toBeCloseTo(300, 1);
    expect(result!.point.x).toBeCloseTo(250, 1);
  });
});

describe('calculatePathLength', () => {
  it('calculates straight line length', () => {
    const points = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    expect(calculatePathLength(points)).toBeCloseTo(100, 1);
  });

  it('calculates polyline length (sum of segments)', () => {
    const points = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];
    expect(calculatePathLength(points)).toBeCloseTo(200, 1);
  });

  it('returns 0 for single point', () => {
    expect(calculatePathLength([{ x: 5, y: 5 }])).toBe(0);
  });

  it('returns 0 for empty array', () => {
    expect(calculatePathLength([])).toBe(0);
  });
});
