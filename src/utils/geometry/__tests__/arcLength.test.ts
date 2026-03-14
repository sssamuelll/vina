import { describe, it, expect } from 'vitest';
import {
  gaussLegendreCubicBezierLength,
  computePathArcLength,
  pointAtPathDistance,
  samplePathAtIntervals,
  distanceAlongPath,
} from '../arcLength';
import type { PathCommand, Point2D } from '../../../types/types';

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

  it('returns null for distance beyond path length', () => {
    const cmds: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
    ];
    expect(pointAtPathDistance(cmds, 200)).toBeNull();
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
});
