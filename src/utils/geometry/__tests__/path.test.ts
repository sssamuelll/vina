// src/utils/geometry/__tests__/path.test.ts
import { describe, it, expect } from 'vitest';
import { getEdgeEndpoints, getEdgeLength, computeOffsetPath, computeSegmentOffsetPath } from '../path';
import type { PathCommand } from '../../../types/types';

const triangle: PathCommand[] = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [10, 0] },
  { type: 'L', values: [5, 10] },
  { type: 'Z', values: [] },
];

describe('getEdgeEndpoints', () => {
  it('returns start/end for first edge', () => {
    const r = getEdgeEndpoints(triangle, 1);
    expect(r).toEqual({ start: { x: 0, y: 0 }, end: { x: 10, y: 0 } });
  });
  it('returns start/end for second edge', () => {
    const r = getEdgeEndpoints(triangle, 2);
    expect(r).toEqual({ start: { x: 10, y: 0 }, end: { x: 5, y: 10 } });
  });
  it('returns null for out-of-range', () => {
    expect(getEdgeEndpoints(triangle, 0)).toBeNull();
    expect(getEdgeEndpoints(triangle, 10)).toBeNull();
  });
});

describe('getEdgeLength', () => {
  it('computes length of horizontal edge', () => {
    expect(getEdgeLength(triangle, 1)).toBe(10);
  });
  it('returns 0 for invalid index', () => {
    expect(getEdgeLength(triangle, 0)).toBe(0);
  });
});

describe('computeOffsetPath', () => {
  it('offsets a horizontal segment', () => {
    const r = computeOffsetPath({ x: 0, y: 0 }, { x: 10, y: 0 }, 5);
    expect(r).toHaveLength(2);
    // For horizontal line (dx=10, dy=0): nx = -0/10 = 0, ny = 10/10 = 1
    // So offset is in +y direction
    expect(r[0]).toEqual({ type: 'M', values: [0, 5] });
    expect(r[1]).toEqual({ type: 'L', values: [10, 5] });
  });
  it('returns empty for zero-length segment', () => {
    expect(computeOffsetPath({ x: 5, y: 5 }, { x: 5, y: 5 }, 3)).toEqual([]);
  });
});

describe('computeSegmentOffsetPath', () => {
  it('offsets a partial segment', () => {
    const r = computeSegmentOffsetPath({ x: 0, y: 0 }, { x: 10, y: 0 }, 0, 0.5, 5);
    expect(r).toHaveLength(2);
    // Sub-segment is (0,0)-(5,0), offset by 5 in +y
    expect(r[0]).toEqual({ type: 'M', values: [0, 5] });
    expect(r[1]).toEqual({ type: 'L', values: [5, 5] });
  });
});
