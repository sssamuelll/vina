import { describe, it, expect } from 'vitest';
import { wrapPlacedMesh } from '../wrapPlacedMesh';
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
});
