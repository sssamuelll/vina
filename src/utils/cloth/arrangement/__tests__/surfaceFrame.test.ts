import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { surfaceFrame, frameToEulerXYZ } from '../surfaceFrame';
import type { BodyDimensions } from '../../garmentPlacement';

const D: BodyDimensions = {
  heightM: 1.68, waistHeight: 0.924, shoulderHeight: 1.3776, neckHeight: 1.4616,
  chestRadius: 0.14, hipRadius: 0.1528, shoulderWidth: 0.4, armLength: 0.6,
};

const len = (v: [number, number, number]) => Math.hypot(v[0], v[1], v[2]);
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

describe('surfaceFrame', () => {
  it('returns an orthonormal outward frame for the front torso', () => {
    const f = surfaceFrame('front-torso', D);
    expect(len(f.normal)).toBeCloseTo(1, 5);
    expect(len(f.tangent)).toBeCloseTo(1, 5);
    expect(dot(f.normal, f.tangent)).toBeCloseTo(0, 5);  // orthogonal
    expect(f.normal[2]).toBeGreaterThan(0);               // front faces +Z
    expect(f.radius).toBeCloseTo(D.chestRadius, 5);
  });

  it('aligns the sleeve tangent with the arm axis and normal outward', () => {
    const f = surfaceFrame('left-sleeve', D);
    expect(dot(f.normal, f.tangent)).toBeCloseTo(0, 5);
    expect(dot(f.normal, f.axis)).toBeCloseTo(0, 5);      // normal radial to the limb axis
    expect(f.point[0]).toBeLessThan(0);                   // left arm is -X
  });

  it('honors an axisHint (A-pose arm tilted down)', () => {
    const hint: [number, number, number] = [-0.7, -0.7, 0];
    const f = surfaceFrame('left-sleeve', D, hint);
    expect(dot(f.normal, f.axis)).toBeCloseTo(0, 5);
    // axis follows the hint direction
    expect(f.axis[1]).toBeLessThan(0);
  });

  it('frameToEulerXYZ maps a flat piece local +Y to the normal and +Z to the tangent', () => {
    const normal: [number, number, number] = [0, 0, 1];
    const tangent: [number, number, number] = [0, 1, 0];
    const e = frameToEulerXYZ(normal, tangent);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(e[0], e[1], e[2], 'XYZ'));
    const localY = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    const localZ = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    expect(localY.z).toBeCloseTo(1, 5);  // local +Y → world normal (+Z)
    expect(localZ.y).toBeCloseTo(1, 5);  // local +Z → world tangent (+Y)
  });
});
