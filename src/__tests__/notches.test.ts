import { describe, it, expect } from 'vitest';
import { generateNotchPath, DEFAULT_NOTCH_OPTIONS } from '../utils/notches';
import { NotchOptions, Point2D } from '../types/types';

const origin: Point2D = { x: 0, y: 0 };
const normalUp: Point2D = { x: 0, y: -1 }; // inward = up

function opts(overrides: Partial<NotchOptions> = {}): NotchOptions {
  return { ...DEFAULT_NOTCH_OPTIONS, ...overrides };
}

describe('generateNotchPath', () => {
  it('slit — returns M + L, correct length', () => {
    const path = generateNotchPath(origin, normalUp, opts({ shape: 'slit', length: 8 }));
    expect(path).toHaveLength(2);
    expect(path[0].type).toBe('M');
    expect(path[1].type).toBe('L');
    // End point should be 8 units in normal direction
    expect(path[1].values[0]).toBeCloseTo(0);
    expect(path[1].values[1]).toBeCloseTo(-8);
  });

  it('t-notch — slit + crossbar (4 commands)', () => {
    const path = generateNotchPath(origin, normalUp, opts({ shape: 't-notch' }));
    expect(path.length).toBeGreaterThanOrEqual(4);
    // First two: M + L (slit), next two: M + L (crossbar)
    expect(path[0].type).toBe('M');
    expect(path[1].type).toBe('L');
    expect(path[2].type).toBe('M');
    expect(path[3].type).toBe('L');
  });

  it('v-internal — 3 commands forming V pointing inward', () => {
    const path = generateNotchPath(origin, normalUp, opts({ shape: 'v-internal', length: 8, width: 4 }));
    expect(path).toHaveLength(3);
    expect(path[0].type).toBe('M');
    expect(path[1].type).toBe('L');
    expect(path[2].type).toBe('L');
    // Tip should be at length inward
    expect(path[1].values[1]).toBeCloseTo(-8);
  });

  it('v-external — 3 commands forming V pointing outward', () => {
    const path = generateNotchPath(origin, normalUp, opts({ shape: 'v-external', length: 8, width: 4 }));
    expect(path).toHaveLength(3);
    // Tip should be at length outward (positive y since normal is -y)
    expect(path[1].values[1]).toBeCloseTo(8);
  });

  it('u-notch — lines + arc segments (5 commands)', () => {
    const path = generateNotchPath(origin, normalUp, opts({ shape: 'u-notch' }));
    expect(path.length).toBeGreaterThanOrEqual(5);
    expect(path[0].type).toBe('M');
    expect(path[1].type).toBe('L');
    expect(path[2].type).toBe('C');
    expect(path[3].type).toBe('C');
    expect(path[4].type).toBe('L');
  });

  it('castle — 4 commands forming rectangle', () => {
    const path = generateNotchPath(origin, normalUp, opts({ shape: 'castle' }));
    expect(path).toHaveLength(4);
    expect(path[0].type).toBe('M');
    expect(path[1].type).toBe('L');
    expect(path[2].type).toBe('L');
    expect(path[3].type).toBe('L');
  });

  it('diamond — 5 commands forming diamond', () => {
    const path = generateNotchPath(origin, normalUp, opts({ shape: 'diamond' }));
    expect(path).toHaveLength(5);
    expect(path[4].type).toBe('Z');
  });

  it('count=2 produces two notch groups offset along edge', () => {
    const path = generateNotchPath(origin, normalUp, opts({ shape: 'slit', count: 2 }));
    // 2 slits × 2 commands = 4
    expect(path).toHaveLength(4);
    // The two M commands should be offset along x (edge direction)
    expect(path[0].values[0]).not.toBeCloseTo(path[2].values[0]);
  });

  it('count=3 produces three notch groups', () => {
    const path = generateNotchPath(origin, normalUp, opts({ shape: 'slit', count: 3 }));
    // 3 slits × 2 commands = 6
    expect(path).toHaveLength(6);
  });

  it('default options work correctly', () => {
    const path = generateNotchPath(origin, normalUp, DEFAULT_NOTCH_OPTIONS);
    // Defaults are slit/length=8 at origin with inward normal (0,-1):
    //   M (0,0) → L (0,-8). toEqual pins length, order, types, and coords.
    expect(path).toEqual([
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [0, -8] },
    ]);
  });
});
