import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { computeAutoFrame } from '../../garmentPlacement';
import type { BodyMeasurements } from '../../../../types/types';

const MEAS = { height: 168, chest: 88, waist: 72, hips: 96, shoulder: 40, armLength: 60, inseam: 80 } as BodyMeasurements;
const GEOM = { widthMm: 300, heightMm: 400 };

/** Distance from world point p to the infinite line through `point` along unit `axis`. */
function distToAxis(p: THREE.Vector3, point: THREE.Vector3, axis: THREE.Vector3): number {
  const w = p.clone().sub(point);
  return w.clone().sub(axis.clone().multiplyScalar(w.dot(axis))).length();
}

describe('computeAutoFrame — collision-aware placement', () => {
  it('places every corner of the piece OUTSIDE the body cylinder (no gross interpenetration)', () => {
    for (const region of ['front-torso', 'left-sleeve', 'right-sleeve', 'collar'] as const) {
      const { placement, frame } = computeAutoFrame(region, MEAS, GEOM);
      const q = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(placement.rotation[0], placement.rotation[1], placement.rotation[2], 'XYZ'),
      );
      const center = new THREE.Vector3(...placement.position);
      const axisPoint = new THREE.Vector3(...frame.point);
      const axisDir = new THREE.Vector3(...frame.axis).normalize();
      // Piece is flat: width along local X, length along local Z. Sample its 4 corners.
      const hw = (GEOM.widthMm / 1000) / 2, hl = (GEOM.heightMm / 1000) / 2;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const corner = new THREE.Vector3(sx * hw, 0, sz * hl).applyQuaternion(q).add(center);
        expect(distToAxis(corner, axisPoint, axisDir)).toBeGreaterThanOrEqual(frame.radius - 1e-6);
      }
    }
  });

  it('faces the piece outward (transformed local +Y ≈ frame normal)', () => {
    const { placement, frame } = computeAutoFrame('front-torso', MEAS, GEOM);
    const q = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(placement.rotation[0], placement.rotation[1], placement.rotation[2], 'XYZ'),
    );
    const faced = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    expect(faced.dot(new THREE.Vector3(...frame.normal))).toBeGreaterThan(0.99);
  });
});
