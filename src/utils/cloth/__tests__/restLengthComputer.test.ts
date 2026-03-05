import { describe, it, expect } from 'vitest';
import { computeRestLengths } from '../restLengthComputer';

describe('computeRestLengths', () => {
  it('computes rest lengths for stretch constraint edges', () => {
    const vertices = new Float32Array([
      0, 0, 0,
      0.1, 0, 0,
      0, 0, 0.1,
      0.1, 0, 0.1,
    ]);
    const stretchingIds = new Int32Array([0, 1, 1, 3, 0, 2]);
    const lengths = computeRestLengths(vertices, stretchingIds);
    expect(lengths.length).toBe(3);
    expect(lengths[0]).toBeCloseTo(0.1, 5);
    expect(lengths[1]).toBeCloseTo(0.1, 5);
    expect(lengths[2]).toBeCloseTo(0.1, 5);
  });

  it('returns empty array for empty inputs', () => {
    const lengths = computeRestLengths(new Float32Array(0), new Int32Array(0));
    expect(lengths.length).toBe(0);
  });

  it('computes correct diagonal length', () => {
    const vertices = new Float32Array([
      0, 0, 0,
      0.1, 0, 0.1,
    ]);
    const stretchingIds = new Int32Array([0, 1]);
    const lengths = computeRestLengths(vertices, stretchingIds);
    expect(lengths[0]).toBeCloseTo(Math.sqrt(0.02), 5);
  });
});
