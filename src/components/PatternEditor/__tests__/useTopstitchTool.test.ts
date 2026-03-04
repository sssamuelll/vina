import { describe, it, expect } from 'vitest';
import { computeOffsetPath, computeSegmentOffsetPath } from '../useTopstitchTool';

describe('computeOffsetPath', () => {
  it('offsets a horizontal edge perpendicular (left normal)', () => {
    const start = { x: 0, y: 0 };
    const end = { x: 100, y: 0 };
    const result = computeOffsetPath(start, end, 5);
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe('M');
    expect(result[0].values[0]).toBeCloseTo(0, 0);
    expect(result[0].values[1]).toBeCloseTo(5, 0);
    expect(result[1].type).toBe('L');
    expect(result[1].values[0]).toBeCloseTo(100, 0);
    expect(result[1].values[1]).toBeCloseTo(5, 0);
  });

  it('offsets a vertical edge to the left', () => {
    const start = { x: 0, y: 0 };
    const end = { x: 0, y: 100 };
    const result = computeOffsetPath(start, end, 5);
    expect(result[0].values[0]).toBeCloseTo(-5, 0);
    expect(result[0].values[1]).toBeCloseTo(0, 0);
  });

  it('returns empty array for zero-length edge', () => {
    const result = computeOffsetPath({ x: 5, y: 5 }, { x: 5, y: 5 }, 5);
    expect(result).toHaveLength(0);
  });
});

describe('computeSegmentOffsetPath', () => {
  it('offsets a partial segment', () => {
    const start = { x: 0, y: 0 };
    const end = { x: 100, y: 0 };
    const result = computeSegmentOffsetPath(start, end, 0.2, 0.8, 5);
    expect(result).toHaveLength(2);
    expect(result[0].values[0]).toBeCloseTo(20, 0);
    expect(result[0].values[1]).toBeCloseTo(5, 0);
    expect(result[1].values[0]).toBeCloseTo(80, 0);
    expect(result[1].values[1]).toBeCloseTo(5, 0);
  });
});
