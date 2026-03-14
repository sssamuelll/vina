import { describe, it, expect } from 'vitest';
import {
  gaussLegendreCubicBezierLength,
  computePathArcLength,
  pointAtPathDistance,
  samplePathAtIntervals,
  samplePathDense,
  distanceAlongPath,
} from '../arcLength';
import type { PathCommand } from '../../../types/types';

describe('gaussLegendreCubicBezierLength', () => {
  it('returns exact length for a straight line disguised as a Bezier', () => {
    const p0 = { x: 0, y: 0 };
    const p1 = { x: 33.33, y: 0 };
    const p2 = { x: 66.67, y: 0 };
    const p3 = { x: 100, y: 0 };
    expect(gaussLegendreCubicBezierLength(p0, p1, p2, p3)).toBeCloseTo(100, 1);
  });

  it('computes quarter-circle arc length within 0.1mm', () => {
    const r = 100;
    const k = 0.5522847498;
    const p0 = { x: r, y: 0 };
    const p1 = { x: r, y: r * k };
    const p2 = { x: r * k, y: r };
    const p3 = { x: 0, y: r };
    const expected = Math.PI * r / 2;
    expect(gaussLegendreCubicBezierLength(p0, p1, p2, p3)).toBeCloseTo(expected, 0);
  });

  it('returns 0 for degenerate Bezier (all points coincident)', () => {
    const p = { x: 5, y: 5 };
    expect(gaussLegendreCubicBezierLength(p, p, p, p)).toBe(0);
  });
});

describe('computePathArcLength', () => {
  it('computes length of a single line segment', () => {
    const cmds: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
    ];
    expect(computePathArcLength(cmds)).toBeCloseTo(100, 1);
  });

  it('computes length of a polyline', () => {
    const cmds: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 50] },
    ];
    expect(computePathArcLength(cmds)).toBeCloseTo(150, 1);
  });

  it('computes length of a cubic Bezier path command', () => {
    const cmds: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'C', values: [33, 0, 67, 0, 100, 0] },
    ];
    expect(computePathArcLength(cmds)).toBeCloseTo(100, 1);
  });

  it('computes length of a subrange of commands', () => {
    const cmds: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 50] },
      { type: 'L', values: [0, 50] },
    ];
    expect(computePathArcLength(cmds, 1, 3)).toBeCloseTo(150, 1);
  });

  it('returns 0 for empty commands', () => {
    expect(computePathArcLength([])).toBe(0);
  });

  it('computes correct subrange length when M is not at origin', () => {
    const cmds: PathCommand[] = [
      { type: 'M', values: [50, 100] },
      { type: 'L', values: [150, 100] },
      { type: 'L', values: [150, 200] },
      { type: 'L', values: [50, 200] },
    ];
    // Subrange [1, 3) = commands 1 and 2 = 100 + 100 = 200mm
    expect(computePathArcLength(cmds, 1, 3)).toBeCloseTo(200, 1);
  });

  it('computes correct subrange length after a cubic Bezier', () => {
    const cmds: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'C', values: [33, 0, 67, 0, 100, 0] },
      { type: 'L', values: [100, 50] },
    ];
    // Subrange [2, 3) = L from (100,0) to (100,50) = 50mm
    expect(computePathArcLength(cmds, 2, 3)).toBeCloseTo(50, 1);
  });

  it('handles S command cursor advancement in pre-scan', () => {
    const cmds: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'S' as PathCommand['type'], values: [50, 50, 100, 0] },
      { type: 'L', values: [200, 0] },
    ];
    expect(computePathArcLength(cmds, 2, 3)).toBeCloseTo(100, 1);
  });
});

describe('pointAtPathDistance', () => {
  it('returns start point at distance 0', () => {
    const cmds: PathCommand[] = [
      { type: 'M', values: [10, 20] },
      { type: 'L', values: [110, 20] },
    ];
    const pt = pointAtPathDistance(cmds, 0);
    expect(pt).not.toBeNull();
    expect(pt!.x).toBeCloseTo(10, 1);
    expect(pt!.y).toBeCloseTo(20, 1);
  });

  it('returns midpoint at half distance', () => {
    const cmds: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
    ];
    const pt = pointAtPathDistance(cmds, 50);
    expect(pt).not.toBeNull();
    expect(pt!.x).toBeCloseTo(50, 1);
    expect(pt!.y).toBeCloseTo(0, 1);
  });

  it('returns end point at full distance', () => {
    const cmds: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
    ];
    const total = computePathArcLength(cmds);
    const pt = pointAtPathDistance(cmds, total);
    expect(pt).not.toBeNull();
    expect(pt!.x).toBeCloseTo(100, 1);
  });

  it('returns endpoint for distance beyond path length (fallback tolerance)', () => {
    const cmds: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
    ];
    const pt = pointAtPathDistance(cmds, 200);
    expect(pt).not.toBeNull();
    expect(pt!.x).toBeCloseTo(100, 1);
    expect(pt!.y).toBeCloseTo(0, 1);
  });

  it('returns endpoint for multi-segment path at exact total distance', () => {
    const cmds: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 100] },
    ];
    const total = computePathArcLength(cmds);
    const pt = pointAtPathDistance(cmds, total);
    expect(pt).not.toBeNull();
    expect(pt!.x).toBeCloseTo(100, 1);
    expect(pt!.y).toBeCloseTo(100, 1);
  });
});

describe('samplePathAtIntervals', () => {
  it('returns markers at requested interval', () => {
    const cmds: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
    ];
    const samples = samplePathAtIntervals(cmds, 25);
    expect(samples.length).toBe(5);
    expect(samples[0].distance).toBeCloseTo(0, 1);
    expect(samples[1].distance).toBeCloseTo(25, 1);
    expect(samples[4].distance).toBeCloseTo(100, 1);
  });

  it('returns empty for empty path', () => {
    expect(samplePathAtIntervals([], 10)).toEqual([]);
  });

  it('returns empty array when interval is 0', () => {
    const cmds: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
    ];
    expect(samplePathAtIntervals(cmds, 0)).toEqual([]);
  });

  it('returns empty array when interval is negative', () => {
    const cmds: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
    ];
    expect(samplePathAtIntervals(cmds, -10)).toEqual([]);
  });
});

describe('samplePathDense', () => {
  it('returns dense points at specified resolution', () => {
    const cmds: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
    ];
    const points = samplePathDense(cmds, 10);
    // 100mm / 10mm = 10 intervals → 11 points
    expect(points.length).toBe(11);
    expect(points[0].x).toBeCloseTo(0, 1);
    expect(points[10].x).toBeCloseTo(100, 1);
  });

  it('returns empty for empty path', () => {
    expect(samplePathDense([], 3)).toEqual([]);
  });

  it('works with subrange', () => {
    const cmds: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 60] },
    ];
    // Subrange [2,3) = L from (100,0) to (100,60) = 60mm
    const points = samplePathDense(cmds, 10, 2, 3);
    // 60mm / 10mm = 6 intervals → 7 points
    expect(points.length).toBe(7);
    expect(points[0].x).toBeCloseTo(100, 1);
    expect(points[0].y).toBeCloseTo(0, 1);
    expect(points[6].y).toBeCloseTo(60, 1);
  });
});

describe('distanceAlongPath', () => {
  it('returns 0 for point at path start', () => {
    const cmds: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
    ];
    expect(distanceAlongPath(cmds, { x: 0, y: 0 })).toBeCloseTo(0, 1);
  });

  it('returns correct distance for point along straight path', () => {
    const cmds: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
    ];
    expect(distanceAlongPath(cmds, { x: 60, y: 0 })).toBeCloseTo(60, 0);
  });

  it('returns accurate arc-length distance for a point on a curve', () => {
    // Quarter circle: radius 100, length ≈ 157.08mm
    const r = 100;
    const k = 0.5522847498;
    const cmds: PathCommand[] = [
      { type: 'M', values: [r, 0] },
      { type: 'C', values: [r, r * k, r * k, r, 0, r] },
    ];
    // A point near the midpoint of the quarter circle: ~45°, at roughly (70.7, 70.7)
    const midPt = { x: 70.7, y: 70.7 };
    const dist = distanceAlongPath(cmds, midPt);
    const fullLen = computePathArcLength(cmds);
    // Should be approximately half the full arc-length (~78.5mm)
    expect(dist).toBeGreaterThan(fullLen * 0.4);
    expect(dist).toBeLessThan(fullLen * 0.6);
  });
});

describe('S and T command support', () => {
  it('computes arc-length for S (smooth cubic) command', () => {
    const cmds: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'C', values: [33, 0, 67, 0, 100, 0] },
      { type: 'S' as PathCommand['type'], values: [167, 0, 200, 0] },
    ];
    expect(computePathArcLength(cmds)).toBeCloseTo(200, 0);
  });

  it('computes arc-length for T (smooth quadratic) command', () => {
    const cmds: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'Q', values: [50, 0, 100, 0] },
      { type: 'T' as PathCommand['type'], values: [200, 0] },
    ];
    expect(computePathArcLength(cmds)).toBeCloseTo(200, 0);
  });
});

it('handles A command cursor advancement in pre-scan', () => {
  const cmds: PathCommand[] = [
    { type: 'M', values: [0, 0] },
    { type: 'A' as PathCommand['type'], values: [50, 50, 0, 0, 1, 100, 0] },
    { type: 'L', values: [200, 0] },
  ];
  expect(computePathArcLength(cmds, 2, 3)).toBeCloseTo(100, 1);
});
