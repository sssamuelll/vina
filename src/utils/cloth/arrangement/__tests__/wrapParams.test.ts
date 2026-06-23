import { describe, it, expect } from 'vitest';
import { wrapParamsForRegion, MAX_SLEEVE_WRAP, DEFAULT_WRAP } from '../wrapParams';
import type { SurfaceFrame } from '../surfaceFrame';

const frame = (radius: number): SurfaceFrame => ({
  point: [0, 0, 0], normal: [0, 0, 1], tangent: [1, 0, 0], axis: [1, 0, 0], radius,
});

describe('wrapParamsForRegion', () => {
  it('caps a full-circumference sleeve at MAX_SLEEVE_WRAP (~330°)', () => {
    // panelWidth ≈ circumference = 2πR ⇒ panelWidth/R ≈ 6.28 > MAX_SLEEVE_WRAP
    const R = 0.05;
    const wp = wrapParamsForRegion('left-sleeve', frame(R), 2 * Math.PI * R);
    expect(wp.thetaMaxRad).toBeCloseTo(MAX_SLEEVE_WRAP, 5);
    expect(wp.gap).toBe(DEFAULT_WRAP.gap);
  });

  it('uses panelWidth/R when the sleeve panel is narrower than the cap', () => {
    const R = 0.05;
    const narrow = 0.1; // 0.1 / 0.05 = 2.0 rad < MAX_SLEEVE_WRAP
    const wp = wrapParamsForRegion('right-sleeve', frame(R), narrow);
    expect(wp.thetaMaxRad).toBeCloseTo(2.0, 5);
  });

  it('returns the 150° default for non-sleeve regions', () => {
    expect(wrapParamsForRegion('front-torso', frame(0.14), 0.4)).toEqual(DEFAULT_WRAP);
    expect(wrapParamsForRegion('collar', frame(0.056), 0.3)).toEqual(DEFAULT_WRAP);
  });

  it('applies to cuff regions too', () => {
    const wp = wrapParamsForRegion('cuff-left', frame(0.05), 2 * Math.PI * 0.05);
    expect(wp.thetaMaxRad).toBeCloseTo(MAX_SLEEVE_WRAP, 5);
  });
});
