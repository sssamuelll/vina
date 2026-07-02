import { describe, it, expect } from 'vitest';
import { wrapPanel } from '../wrapPanel';
import type { SurfaceFrame } from '../surfaceFrame';

// Sleeve-like frame: axis +X, normal +Z, radius 0.045
const frame: SurfaceFrame = { point: [0, 1.4, 0], normal: [0, 0, 1], tangent: [1, 0, 0], axis: [1, 0, 0], radius: 0.045 };
const params = { thetaMaxRad: 2.618, gap: 0.03 };
const distToAxis = (p: number[]) => { // perpendicular distance from p to the line point+t*axis
  const d = [p[0]-frame.point[0], p[1]-frame.point[1], p[2]-frame.point[2]];
  const along = d[0]*frame.axis[0]+d[1]*frame.axis[1]+d[2]*frame.axis[2];
  const perp = [d[0]-along*frame.axis[0], d[1]-along*frame.axis[1], d[2]-along*frame.axis[2]];
  return Math.hypot(...perp);
};

describe('wrapPanel', () => {
  it('places every vertex at radius+gap from the axis (outside the cylinder)', () => {
    for (const w of [-0.05, 0, 0.05]) {
      const p = wrapPanel([w, 1.2, 0.1], frame, params);
      expect(distToAxis(p)).toBeCloseTo(frame.radius + params.gap, 4);
    }
  });
  it('center of width (w=0) lands on the normal side', () => {
    const p = wrapPanel([0, 1.2, 0], frame, params);
    // point + (R+gap)*normal = [0,1.4,0] + 0.075*[0,0,1]
    expect(p[2]).toBeCloseTo(0.075, 4);
  });
  it('preserves the along-axis coordinate (u)', () => {
    const p = wrapPanel([0, 1.2, 0.123], frame, params);
    const d = [p[0]-frame.point[0], p[1]-frame.point[1], p[2]-frame.point[2]];
    const along = d[0]*frame.axis[0]+d[1]*frame.axis[1]+d[2]*frame.axis[2];
    expect(along).toBeCloseTo(0.123, 4);
  });
  it('clamps the wrap angle to thetaMax/2', () => {
    const big = wrapPanel([10, 1.2, 0], frame, params); // w huge → clamp
    // Isometric parameterization (plan §6bis): φ = w / (R + gap) — the arc is
    // measured at the radius the cloth lives at, so the cap sits at
    // w = (R + gap)·thetaMax/2 (the old pin used R·thetaMax/2, which
    // over-curved the panel ×(R+gap)/R and piled vertices on the clamp lines).
    const wAtCap = (frame.radius + params.gap) * params.thetaMaxRad / 2;
    const small = wrapPanel([wAtCap, 1.2, 0], frame, params); // exactly at cap
    expect(distToAxis(big)).toBeCloseTo(frame.radius + params.gap, 4);
    // both clamped to the same angular position
    expect(big[0]).toBeCloseTo(small[0], 3);
    expect(big[1]).toBeCloseTo(small[1], 3);
    expect(big[2]).toBeCloseTo(small[2], 3);
  });
});
