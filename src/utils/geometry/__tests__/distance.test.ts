import { describe, it, expect } from 'vitest';
import { dist, distToSegment, distToSegmentWithT } from '../distance';

describe('dist', () => {
  it('returns 0 for same point', () => {
    expect(dist({ x: 5, y: 5 }, { x: 5, y: 5 })).toBe(0);
  });
  it('returns correct distance', () => {
    expect(dist({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });
});

describe('distToSegment', () => {
  it('returns 0 when point is on segment', () => {
    expect(distToSegment({ x: 5, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(0);
  });
  it('returns perpendicular distance', () => {
    expect(distToSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(3);
  });
  it('returns distance to nearest endpoint when outside', () => {
    expect(distToSegment({ x: -3, y: 4 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(5);
  });
  it('handles zero-length segment', () => {
    expect(distToSegment({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toBe(5);
  });
});

describe('distToSegmentWithT', () => {
  it('returns t=0 at start of segment', () => {
    const r = distToSegmentWithT(0, 0, 0, 0, 10, 0);
    expect(r.t).toBe(0);
    expect(r.distance).toBe(0);
    expect(r.point).toEqual({ x: 0, y: 0 });
  });
  it('returns t=1 at end of segment', () => {
    const r = distToSegmentWithT(10, 0, 0, 0, 10, 0);
    expect(r.t).toBe(1);
    expect(r.distance).toBe(0);
  });
  it('returns t=0.5 at midpoint', () => {
    const r = distToSegmentWithT(5, 3, 0, 0, 10, 0);
    expect(r.t).toBe(0.5);
    expect(r.distance).toBe(3);
    expect(r.point).toEqual({ x: 5, y: 0 });
  });
  it('clamps t for points beyond segment', () => {
    const r = distToSegmentWithT(15, 0, 0, 0, 10, 0);
    expect(r.t).toBe(1);
    expect(r.point).toEqual({ x: 10, y: 0 });
  });
});
