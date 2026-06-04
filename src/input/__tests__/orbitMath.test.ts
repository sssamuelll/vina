import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { orbitAroundTarget, dollyTowardTarget, panViewpoint } from '../orbitMath';

const target = new THREE.Vector3(0, 0.75, 0);

describe('orbitAroundTarget', () => {
  it('preserves distance to target', () => {
    const pos = new THREE.Vector3(0, 0.85, 3.0);
    const before = pos.distanceTo(target);
    orbitAroundTarget(pos, target, 25, -12);
    expect(pos.distanceTo(target)).toBeCloseTo(before, 10);
  });

  it('dx rotates azimuth, dy rotates polar', () => {
    const pos = new THREE.Vector3(0, 0.75, 3.0); // level with target
    orbitAroundTarget(pos, target, 10, 0);
    expect(pos.x).not.toBeCloseTo(0, 5);          // moved sideways
    expect(pos.y).toBeCloseTo(0.75, 5);           // height unchanged by pure azimuth
  });

  it('clamps polar angle — camera never flips over the pole', () => {
    const pos = new THREE.Vector3(0, 0.85, 3.0);
    for (let i = 0; i < 500; i++) orbitAroundTarget(pos, target, 0, 10);
    const offset = pos.clone().sub(target);
    const phi = new THREE.Spherical().setFromVector3(offset).phi;
    expect(phi).toBeGreaterThanOrEqual(0.05 - 1e-9);
    expect(phi).toBeLessThanOrEqual(Math.PI - 0.05 + 1e-9);
  });

  it('positive dy decreases phi (camera moves toward the north pole)', () => {
    const pos = new THREE.Vector3(0, 0.85, 3.0);
    const before = new THREE.Spherical().setFromVector3(pos.clone().sub(target)).phi;
    orbitAroundTarget(pos, target, 0, 10);
    const after = new THREE.Spherical().setFromVector3(pos.clone().sub(target)).phi;
    expect(after).toBeLessThan(before);
  });
});

describe('dollyTowardTarget', () => {
  it('factor <1 moves closer, >1 moves away', () => {
    const pos = new THREE.Vector3(0, 0.85, 3.0);
    const before = pos.distanceTo(target);
    dollyTowardTarget(pos, target, 0.9, 0.6, 5);
    expect(pos.distanceTo(target)).toBeCloseTo(before * 0.9, 10);
  });

  it('clamps to [minDistance, maxDistance]', () => {
    const near = new THREE.Vector3(0, 0.75, 0.61);
    dollyTowardTarget(near, target, 0.01, 0.6, 5);
    expect(near.distanceTo(target)).toBeCloseTo(0.6, 10);
    const far = new THREE.Vector3(0, 0.75, 4.9);
    dollyTowardTarget(far, target, 100, 0.6, 5);
    expect(far.distanceTo(target)).toBeCloseTo(5, 10);
  });

  it('escapes cleanly when camera is exactly at target (zero offset)', () => {
    const pos = new THREE.Vector3(0, 0.75, 0); // AT target
    dollyTowardTarget(pos, target, 0.9, 0.6, 5);
    expect(pos.distanceTo(target)).toBeCloseTo(0.6, 10);
    expect(Number.isFinite(pos.x) && Number.isFinite(pos.y) && Number.isFinite(pos.z)).toBe(true);
  });
});

describe('panViewpoint — CLO3D-style pan moves camera AND focus point together', () => {
  const right = new THREE.Vector3(1, 0, 0);
  const up = new THREE.Vector3(0, 1, 0);

  it('preserves the camera→target offset (no slow angle drift while panning)', () => {
    const pos = new THREE.Vector3(0, 0.85, 3.0);
    const tgt = target.clone();
    const offsetBefore = pos.clone().sub(tgt);
    panViewpoint(pos, tgt, right, up, 40, -25, 0.002);
    const offsetAfter = pos.clone().sub(tgt);
    expect(offsetAfter.distanceTo(offsetBefore)).toBeCloseTo(0, 10);
  });

  it('moves the focus point — subsequent orbit pivots around the new spot', () => {
    const pos = new THREE.Vector3(0, 0.85, 3.0);
    const tgt = target.clone();
    panViewpoint(pos, tgt, right, up, 100, 0, 0.002);
    expect(tgt.x).toBeCloseTo(-0.2, 10); // -dx * speed along camera-right
    expect(tgt.y).toBeCloseTo(0.75, 10);
  });

  it('applies screen-space convention: drag right moves view left, drag down moves view up', () => {
    const pos = new THREE.Vector3(0, 0.85, 3.0);
    const tgt = target.clone();
    panViewpoint(pos, tgt, right, up, 10, 10, 0.001);
    expect(tgt.x).toBeCloseTo(-0.01, 10); // -dx along right
    expect(tgt.y).toBeCloseTo(0.75 + 0.01, 10); // +dy along up
    expect(pos.x).toBeCloseTo(-0.01, 10);
    expect(pos.y).toBeCloseTo(0.85 + 0.01, 10);
  });
});
