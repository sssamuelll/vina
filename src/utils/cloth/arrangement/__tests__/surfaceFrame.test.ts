import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { surfaceFrame, frameToEulerXYZ, SLEEVE_CAP_MARGIN } from '../surfaceFrame';
import type { BodyDimensions } from '../../garmentPlacement';
import { deriveDimensions } from '../../garmentPlacement';

const D: BodyDimensions = {
  heightM: 1.68, waistHeight: 0.924, shoulderHeight: 1.3776, neckHeight: 1.4616,
  chestRadius: 0.14, hipRadius: 0.1528, shoulderWidth: 0.4, armLength: 0.6,
  neckR: 0.056, armR: 0.05,
};

// Measurements with explicit neckCirc / upperArmCirc so neckR / armR differ
// from the fallback formulas (chestRadius*0.4 and 0.05).
// neckCirc=40 → neckR = 0.40/(2π) ≈ 0.0637  (fallback would be 0.14*0.4=0.056)
// upperArmCirc=32 → armR = 0.32/(2π) ≈ 0.0509 (fallback is exactly 0.05)
// Use upperArmCirc=34 → armR = 0.34/(2π) ≈ 0.0541  so it diverges clearly.
const D2 = deriveDimensions({
  height: 168, chest: 88, waist: 72, hips: 96,
  shoulder: 40, armLength: 60, inseam: 79,
  neckCirc: 40, upperArmCirc: 34,
});

const len = (v: [number, number, number]) => Math.hypot(v[0], v[1], v[2]);
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: number[], b: number[]): number[] => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

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

  it('frameToEulerXYZ handles a degenerate tangent (collinear with a near-+Y normal)', () => {
    const e = frameToEulerXYZ([0, 1, 0], [0, 1, 0]); // tangent parallel to normal → fallback path
    expect(e.every((n) => Number.isFinite(n))).toBe(true);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(e[0], e[1], e[2], 'XYZ'));
    const localY = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    expect(localY.dot(new THREE.Vector3(0, 1, 0))).toBeCloseTo(1, 5); // local +Y → normal (+Y)
  });

  // Task 2: anatomical radii + non-degenerate frames (axis × normal ≠ 0 for all regions).
  // D2 uses explicit neckCirc/upperArmCirc so D2.neckR / D2.armR differ from the
  // hardcoded fallbacks (chestRadius*0.4 and 0.05) — making these tests meaningful.
  it('collar wraps around the vertical axis with a horizontal binormal and uses neckR', () => {
    const f = surfaceFrame('collar', D2);
    const c = cross(f.axis, f.normal);
    const cLen = Math.hypot(c[0], c[1], c[2]);
    expect(cLen).toBeGreaterThan(0.99); // axis × normal is a valid horizontal binormal
    expect(f.radius).toBeCloseTo(D2.neckR, 4);
  });

  // Plan §6bis item 5: the sleeve tube anchors its CAP edge adjacent to the
  // armhole. Mesher-local length is bbox-centered (±L/2), so the proximal edge
  // of the wrapped tube is point − axis·L/2 = shoulder + axis·SLEEVE_CAP_MARGIN.
  it('anchors the sleeve cap edge at the shoulder when pieceLengthM is given', () => {
    const L = 0.3;
    const f = surfaceFrame('left-sleeve', D, undefined, L);
    const shoulder = [-(D.shoulderWidth / 2), D.shoulderHeight, 0];
    const capEdge = f.point.map((p, i) => p - f.axis[i] * (L / 2));
    for (let i = 0; i < 3; i++) {
      expect(capEdge[i]).toBeCloseTo(shoulder[i] + f.axis[i] * SLEEVE_CAP_MARGIN, 6);
    }
  });

  it('keeps mid-arm placement without pieceLengthM (back-compat) and for cuffs', () => {
    const f = surfaceFrame('right-sleeve', D);
    expect(f.point[0]).toBeCloseTo(D.shoulderWidth / 2 + D.armLength / 2, 6);
    const cuff = surfaceFrame('cuff-right', D, undefined, 0.08);
    expect(cuff.point[0]).toBeCloseTo(D.shoulderWidth / 2 + D.armLength / 2, 6);
  });

  it('sleeve frame uses armR, axis runs along the arm, and axis × normal is non-degenerate', () => {
    const f = surfaceFrame('left-sleeve', D2);
    expect(f.radius).toBeCloseTo(D2.armR, 4);
    expect(Math.abs(dot(f.axis, f.tangent))).toBeGreaterThan(0.99); // tangent IS the arm axis
    expect(Math.abs(dot(f.axis, f.normal))).toBeLessThan(0.01);     // normal ⊥ axis
    const c = cross(f.axis, f.normal);
    const cLen = Math.hypot(c[0], c[1], c[2]);
    expect(cLen).toBeGreaterThan(0.99); // axis × normal non-degenerate
  });
});
