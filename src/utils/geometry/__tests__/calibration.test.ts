import { describe, it, expect } from 'vitest';
import { computePixelsPerMm } from '../calibration';

describe('computePixelsPerMm', () => {
  it('100px apart horizontally, 50mm → pixelsPerMm = 2.0', () => {
    expect(computePixelsPerMm({ x: 0, y: 0 }, { x: 100, y: 0 }, 50)).toBe(2);
  });

  it('diagonal distance computed correctly (3-4-5 triangle)', () => {
    // dist = sqrt(30² + 40²) = 50, 50/25 = 2
    expect(computePixelsPerMm({ x: 0, y: 0 }, { x: 30, y: 40 }, 25)).toBe(2);
  });

  it('non-integer result', () => {
    // 200px / 30mm = 6.666...
    expect(computePixelsPerMm({ x: 0, y: 0 }, { x: 200, y: 0 }, 30)).toBeCloseTo(6.667, 2);
  });

  it('throws on zero pixel distance (same points)', () => {
    expect(() => computePixelsPerMm({ x: 50, y: 50 }, { x: 50, y: 50 }, 100)).toThrow(/different positions/);
  });

  it('throws on zero mm input', () => {
    expect(() => computePixelsPerMm({ x: 0, y: 0 }, { x: 100, y: 0 }, 0)).toThrow(/positive/);
  });

  it('throws on negative mm input', () => {
    expect(() => computePixelsPerMm({ x: 0, y: 0 }, { x: 100, y: 0 }, -50)).toThrow(/positive/);
  });
});
