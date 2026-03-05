import { describe, it, expect } from 'vitest';
import { lerp, lerp2D, evalCubic, evalQuadratic, distToBezier } from '../bezier';

describe('lerp', () => {
  it('returns a at t=0', () => expect(lerp(0, 10, 0)).toBe(0));
  it('returns b at t=1', () => expect(lerp(0, 10, 1)).toBe(10));
  it('returns midpoint at t=0.5', () => expect(lerp(0, 10, 0.5)).toBe(5));
});

describe('lerp2D', () => {
  it('returns a at t=0', () => {
    expect(lerp2D({ x: 0, y: 0 }, { x: 10, y: 20 }, 0)).toEqual({ x: 0, y: 0 });
  });
  it('returns b at t=1', () => {
    expect(lerp2D({ x: 0, y: 0 }, { x: 10, y: 20 }, 1)).toEqual({ x: 10, y: 20 });
  });
  it('returns midpoint at t=0.5', () => {
    expect(lerp2D({ x: 0, y: 0 }, { x: 10, y: 20 }, 0.5)).toEqual({ x: 5, y: 10 });
  });
});

describe('evalCubic', () => {
  const p0 = { x: 0, y: 0 };
  const p1 = { x: 0, y: 10 };
  const p2 = { x: 10, y: 10 };
  const p3 = { x: 10, y: 0 };
  it('returns p0 at t=0', () => expect(evalCubic(p0, p1, p2, p3, 0)).toEqual(p0));
  it('returns p3 at t=1', () => expect(evalCubic(p0, p1, p2, p3, 1)).toEqual(p3));
  it('returns a point between at t=0.5', () => {
    const mid = evalCubic(p0, p1, p2, p3, 0.5);
    expect(mid.x).toBe(5);
    expect(mid.y).toBe(7.5);
  });
});

describe('evalQuadratic', () => {
  const p0 = { x: 0, y: 0 };
  const p1 = { x: 5, y: 10 };
  const p2 = { x: 10, y: 0 };
  it('returns p0 at t=0', () => expect(evalQuadratic(p0, p1, p2, 0)).toEqual(p0));
  it('returns p2 at t=1', () => expect(evalQuadratic(p0, p1, p2, 1)).toEqual(p2));
  it('returns peak at t=0.5', () => {
    const mid = evalQuadratic(p0, p1, p2, 0.5);
    expect(mid.x).toBe(5);
    expect(mid.y).toBe(5);
  });
});

describe('distToBezier', () => {
  it('finds closest point on a straight-line bezier', () => {
    const evalFn = (t: number) => ({ x: t * 10, y: 0 });
    const r = distToBezier(5, 3, evalFn, 20);
    expect(r.distance).toBeCloseTo(3, 1);
    expect(r.t).toBeCloseTo(0.5, 1);
  });
});
