import { describe, it, expect } from 'vitest';
import { wrapParamsForRegion, MAX_SLEEVE_WRAP, SLEEVE_CLEARANCE, DEFAULT_WRAP } from '../wrapParams';
import type { SurfaceFrame } from '../surfaceFrame';

const frame = (radius: number): SurfaceFrame => ({
  point: [0, 0, 0], normal: [0, 0, 1], tangent: [1, 0, 0], axis: [1, 0, 0], radius,
});

// Isometric parameterization (plan §6bis): wrapPanel measures the arc at the
// radius the cloth lives at (R + gap), so wrapParamsForRegion now derives the
// sleeve tube radius FROM the panel — rWrap = max(panelWidth/MAX_SLEEVE_WRAP,
// R + SLEEVE_CLEARANCE) — and returns it as gap = rWrap − R. The old pins here
// asserted thetaMax = min(330°, panelWidth/R) + fixed gap, which measured
// coverage at the BODY radius while the cloth sat at R + gap (the box-sleeve
// bug: ×1.6 over-curvature, 18% of vertices piled on the clamp lines).
describe('wrapParamsForRegion', () => {
  it('derives the tube radius from a wide sleeve panel (María: 381mm, armR 50mm)', () => {
    const R = 0.05;
    const wp = wrapParamsForRegion('left-sleeve', frame(R), 0.381);
    // Panel-derived radius wins: rWrap = 0.381/MAX_SLEEVE_WRAP ≈ 0.06615m.
    expect(wp.thetaMaxRad).toBeCloseTo(MAX_SLEEVE_WRAP, 5);
    expect(R + wp.gap).toBeCloseTo(0.381 / MAX_SLEEVE_WRAP, 5);
    // Coverage measured where the cloth lives = exactly the cap → zero piling.
    expect(0.381 / (R + wp.gap)).toBeCloseTo(MAX_SLEEVE_WRAP, 5);
  });

  it('floors the tube radius at R + SLEEVE_CLEARANCE for narrow panels (no clamp engages)', () => {
    const R = 0.05;
    const narrow = 0.1;
    const wp = wrapParamsForRegion('right-sleeve', frame(R), narrow);
    // 0.1/MAX_SLEEVE_WRAP ≈ 0.0174 < R + clearance → floor wins.
    expect(wp.gap).toBeCloseTo(SLEEVE_CLEARANCE, 5);
    // Coverage at the cloth radius is well under the cap — clamp never engages.
    expect(narrow / (R + wp.gap)).toBeLessThan(wp.thetaMaxRad);
  });

  it('keeps a full-circumference panel under the cap via the clearance floor', () => {
    // panelWidth = 2πR: at the body radius this would be 360° (> 330° cap),
    // but at the derived radius R + clearance it covers 2πR/(R+clearance) < 330°.
    const R = 0.05;
    const wp = wrapParamsForRegion('left-sleeve', frame(R), 2 * Math.PI * R);
    expect(wp.thetaMaxRad).toBeCloseTo(MAX_SLEEVE_WRAP, 5);
    expect(wp.gap).toBeCloseTo(SLEEVE_CLEARANCE, 5); // 2πR/MAX ≈ 0.0545 < 0.06 floor
    expect((2 * Math.PI * R) / (R + wp.gap)).toBeLessThan(MAX_SLEEVE_WRAP);
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
