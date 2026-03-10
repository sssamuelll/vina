// src/utils/animation/__tests__/interpolation.test.ts
import { describe, it, expect } from 'vitest';
import { interpolate, interpolateVec3 } from '../interpolation';
import type { Keyframe } from '../types';

describe('interpolate', () => {
  it('returns undefined for empty keyframes', () => {
    expect(interpolate([], 5)).toBeUndefined();
  });

  it('holds first value before first keyframe', () => {
    const kf: Keyframe[] = [{ frame: 10, value: 5, interpolation: 'linear' }];
    expect(interpolate(kf, 0)).toBe(5);
  });

  it('holds last value after last keyframe', () => {
    const kf: Keyframe[] = [{ frame: 10, value: 5, interpolation: 'linear' }];
    expect(interpolate(kf, 20)).toBe(5);
  });

  it('returns exact value at keyframe', () => {
    const kf: Keyframe[] = [
      { frame: 0, value: 0, interpolation: 'linear' },
      { frame: 10, value: 100, interpolation: 'linear' },
    ];
    expect(interpolate(kf, 0)).toBe(0);
    expect(interpolate(kf, 10)).toBe(100);
  });

  it('linearly interpolates between keyframes', () => {
    const kf: Keyframe[] = [
      { frame: 0, value: 0, interpolation: 'linear' },
      { frame: 10, value: 100, interpolation: 'linear' },
    ];
    expect(interpolate(kf, 5)).toBe(50);
  });

  it('uses left keyframe interpolation type', () => {
    const kf: Keyframe[] = [
      { frame: 0, value: 0, interpolation: 'easeIn' },
      { frame: 10, value: 100, interpolation: 'linear' },
    ];
    // easeIn at t=0.5 -> 0.25 -> value 25
    expect(interpolate(kf, 5)).toBe(25);
  });

  it('easeOut interpolation', () => {
    const kf: Keyframe[] = [
      { frame: 0, value: 0, interpolation: 'easeOut' },
      { frame: 10, value: 100, interpolation: 'linear' },
    ];
    // easeOut at t=0.5 -> 0.75 -> value 75
    expect(interpolate(kf, 5)).toBe(75);
  });

  it('easeInOut interpolation at midpoint', () => {
    const kf: Keyframe[] = [
      { frame: 0, value: 0, interpolation: 'easeInOut' },
      { frame: 10, value: 100, interpolation: 'linear' },
    ];
    // easeInOut at t=0.5 -> 0.5 (midpoint of smoothstep)
    expect(interpolate(kf, 5)).toBe(50);
  });

  it('handles multiple segments', () => {
    const kf: Keyframe[] = [
      { frame: 0, value: 0, interpolation: 'linear' },
      { frame: 10, value: 100, interpolation: 'linear' },
      { frame: 20, value: 50, interpolation: 'linear' },
    ];
    expect(interpolate(kf, 15)).toBe(75);
  });
});

describe('interpolateVec3', () => {
  it('interpolates each axis independently', () => {
    const kfX: Keyframe[] = [
      { frame: 0, value: 0, interpolation: 'linear' },
      { frame: 10, value: 10, interpolation: 'linear' },
    ];
    const kfY: Keyframe[] = [
      { frame: 0, value: 100, interpolation: 'linear' },
      { frame: 10, value: 200, interpolation: 'linear' },
    ];
    const kfZ: Keyframe[] = [
      { frame: 0, value: -5, interpolation: 'linear' },
      { frame: 10, value: 5, interpolation: 'linear' },
    ];
    const result = interpolateVec3(kfX, kfY, kfZ, 5);
    expect(result).toEqual([5, 150, 0]);
  });

  it('returns undefined if any axis has no keyframes', () => {
    const kf: Keyframe[] = [{ frame: 0, value: 0, interpolation: 'linear' }];
    expect(interpolateVec3(kf, [], kf, 0)).toBeUndefined();
  });
});
