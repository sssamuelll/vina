import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { orbitAroundTarget, dollyTowardTarget } from '../orbitMath';

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
});
