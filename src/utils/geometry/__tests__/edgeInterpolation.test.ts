import { describe, it, expect } from 'vitest';
import { interpolateEdgePoint, computeEdgeLengthMM } from '../edgeInterpolation';
import type { PatternPiece } from '../../../types/types';

function makeRectPiece(): PatternPiece {
  return {
    id: 'p1',
    name: 'Test',
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },   // segment 0→1: top edge (100mm)
      { type: 'L', values: [100, 200] },  // segment 1→2: right edge (200mm)
      { type: 'L', values: [0, 200] },    // segment 2→3: bottom edge (100mm)
      { type: 'Z', values: [] },          // segment 3→0: left edge (200mm)
    ],
    internals: [],
    position: { x: 0, y: 0 },
    rotation: 0,
    mirrored: false,
    seamAllowance: 0,
    active: true,
    edges: [
      { id: 'e1', name: 'top', segmentRange: [0, 1] as [number, number], edgeType: 'seam' as const },
      { id: 'e2', name: 'right', segmentRange: [1, 2] as [number, number], edgeType: 'seam' as const },
      { id: 'e3', name: 'bottom', segmentRange: [2, 3] as [number, number], edgeType: 'seam' as const },
      { id: 'e4', name: 'left', segmentRange: [3, 4] as [number, number], edgeType: 'seam' as const },
    ],
  } as unknown as PatternPiece;
}

describe('interpolateEdgePoint', () => {
  it('returns null for unknown edge name', () => {
    expect(interpolateEdgePoint(makeRectPiece(), 'unknown', 0.5)).toBeNull();
  });

  it('returns start point at t=0', () => {
    const result = interpolateEdgePoint(makeRectPiece(), 'top', 0);
    expect(result).not.toBeNull();
    expect(result!.point.x).toBeCloseTo(0, 1);
    expect(result!.point.y).toBeCloseTo(0, 1);
  });

  it('returns end point at t=1', () => {
    const result = interpolateEdgePoint(makeRectPiece(), 'top', 1);
    expect(result).not.toBeNull();
    expect(result!.point.x).toBeCloseTo(100, 1);
    expect(result!.point.y).toBeCloseTo(0, 1);
  });

  it('returns midpoint at t=0.5', () => {
    const result = interpolateEdgePoint(makeRectPiece(), 'top', 0.5);
    expect(result).not.toBeNull();
    expect(result!.point.x).toBeCloseTo(50, 1);
    expect(result!.point.y).toBeCloseTo(0, 1);
  });

  it('returns correct tangent for horizontal edge', () => {
    const result = interpolateEdgePoint(makeRectPiece(), 'top', 0.5);
    expect(result).not.toBeNull();
    expect(result!.tangent.x).toBeCloseTo(1, 1);
    expect(result!.tangent.y).toBeCloseTo(0, 1);
  });

  it('interpolates vertical edge correctly', () => {
    const result = interpolateEdgePoint(makeRectPiece(), 'right', 0.5);
    expect(result).not.toBeNull();
    expect(result!.point.x).toBeCloseTo(100, 1);
    expect(result!.point.y).toBeCloseTo(100, 1);
  });

  it('clamps t to [0, 1]', () => {
    const resultNeg = interpolateEdgePoint(makeRectPiece(), 'top', -0.5);
    expect(resultNeg!.point.x).toBeCloseTo(0, 1);
    const resultOver = interpolateEdgePoint(makeRectPiece(), 'top', 1.5);
    expect(resultOver!.point.x).toBeCloseTo(100, 1);
  });
});

describe('computeEdgeLengthMM', () => {
  it('returns correct length for straight edge', () => {
    const len = computeEdgeLengthMM(makeRectPiece(), 'top');
    expect(len).toBeCloseTo(100, 1);
  });

  it('returns correct length for vertical edge', () => {
    const len = computeEdgeLengthMM(makeRectPiece(), 'right');
    expect(len).toBeCloseTo(200, 1);
  });

  it('returns 0 for unknown edge', () => {
    expect(computeEdgeLengthMM(makeRectPiece(), 'unknown')).toBe(0);
  });
});
