import { describe, it, expect } from 'vitest';
import { computeStiffnessMultiplier } from '../interfacing';

describe('computeStiffnessMultiplier', () => {
  it('returns 1.0 for none + 0', () => {
    expect(computeStiffnessMultiplier('none', 0)).toBe(1.0);
  });

  it('returns 4.0 for fusible-medium + 0', () => {
    expect(computeStiffnessMultiplier('fusible-medium', 0)).toBe(4.0);
  });

  it('returns 10.0 for canvas + 0', () => {
    expect(computeStiffnessMultiplier('canvas', 0)).toBe(10.0);
  });

  it('returns 10.0 for none + 1 (solidify only)', () => {
    expect(computeStiffnessMultiplier('none', 1)).toBe(10.0);
  });

  it('clamps canvas + 1 to 50 (not 100)', () => {
    // canvas=10 * solidify(1+9)=10 => 100, clamped to 50
    expect(computeStiffnessMultiplier('canvas', 1)).toBe(50);
  });

  it('returns 22 for fusible-medium + 0.5', () => {
    // fusible-medium=4 * solidify(1+0.5*9)=5.5 => 22
    expect(computeStiffnessMultiplier('fusible-medium', 0.5)).toBe(22);
  });

  it('returns 1.0 for undefined inputs (defaults)', () => {
    expect(computeStiffnessMultiplier()).toBe(1.0);
    expect(computeStiffnessMultiplier(undefined, undefined)).toBe(1.0);
  });

  it('clamps solidifyFactor below 0 to 0', () => {
    // solidifyFactor=-5 clamped to 0 => solidifyMul=1
    expect(computeStiffnessMultiplier('fusible-light', -5)).toBe(2.0);
  });

  it('clamps solidifyFactor above 1 to 1', () => {
    // solidifyFactor=99 clamped to 1 => solidifyMul=10
    // fusible-light=2 * 10 = 20
    expect(computeStiffnessMultiplier('fusible-light', 99)).toBe(20);
  });
});
