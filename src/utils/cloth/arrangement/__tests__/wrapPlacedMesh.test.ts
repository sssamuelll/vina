import { describe, it, expect } from 'vitest';
import { wrapPlacedMesh } from '../wrapPlacedMesh';
import { DEFAULT_WRAP } from '../wrapParams';
import type { SurfaceFrame } from '../surfaceFrame';

const frame: SurfaceFrame = { point: [0, 1.4, 0], normal: [0, 0, 1], tangent: [1, 0, 0], axis: [1, 0, 0], radius: 0.045 };
const params = { thetaMaxRad: 2.618, gap: 0.03 };

describe('wrapPlacedMesh', () => {
  it('wraps every vertex (3 floats each) to radius+gap from the axis', () => {
    const flat = new Float32Array([0, 1.2, 0,  0.05, 1.2, 0.1,  -0.05, 1.2, -0.1]);
    const out = wrapPlacedMesh(flat, frame, params);
    expect(out.length).toBe(flat.length);
    for (let i = 0; i < out.length; i += 3) {
      const d = [out[i]-0, out[i+1]-1.4, out[i+2]-0];
      const along = d[0]*1; // axis +X
      const perp = Math.hypot(d[1], d[2]); // ⊥ to +X
      expect(perp).toBeCloseTo(0.075, 4);
      void along;
    }
  });

  it('DEFAULT_WRAP caps at 150°', () => {
    expect(DEFAULT_WRAP.thetaMaxRad).toBeCloseTo(150 * Math.PI / 180, 3);
  });

  it('flip pre-transforms [x,y,z] → [-x,y,-z] before wrapPanel', () => {
    // A single off-center vertex: with flip the local x (circumference) and z
    // (axis) both negate, so the wrapped point lands on the opposite side of
    // the axis line and at the mirrored position along the axis.
    const flat = new Float32Array([0.05, 1.2, 0.1]);
    const noFlip = wrapPlacedMesh(flat, frame, params, false);
    const flipped = wrapPlacedMesh(flat, frame, params, true);
    // Pre-flipping the input is identical to wrapping the manually-negated vertex.
    const manual = wrapPlacedMesh(new Float32Array([-0.05, 1.2, -0.1]), frame, params, false);
    expect(Array.from(flipped)).toEqual(Array.from(manual));
    // And it genuinely differs from the un-flipped wrap.
    expect(Array.from(flipped)).not.toEqual(Array.from(noFlip));
    // y (the flat mesher height) is ignored by wrapPanel either way.
  });

  it('defaults flip to false (Task-4 callers unaffected)', () => {
    const flat = new Float32Array([0.05, 1.2, 0.1]);
    expect(Array.from(wrapPlacedMesh(flat, frame, params))).toEqual(
      Array.from(wrapPlacedMesh(flat, frame, params, false)),
    );
  });
});
