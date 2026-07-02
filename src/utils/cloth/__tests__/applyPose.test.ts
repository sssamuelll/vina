import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { applyPose } from '../avatarMeshExtractor';

describe('applyPose', () => {
  it('rotates a named bone by the joint (deg, ZYX, post-mult on bind)', () => {
    const bone = new THREE.Bone();
    bone.name = 'LeftArm';
    const scene = new THREE.Object3D();
    scene.add(bone);
    const bind = bone.quaternion.clone(); // identity
    applyPose(scene, { LeftArm: { x: 25, y: 0, z: 0 } });
    const expected = bind.clone().multiply(
      new THREE.Quaternion().setFromEuler(new THREE.Euler(25 * Math.PI / 180, 0, 0, 'ZYX')),
    );
    expect(bone.quaternion.angleTo(expected)).toBeLessThan(1e-6);
  });
  it('leaves un-listed bones at their bind pose', () => {
    const bone = new THREE.Bone(); bone.name = 'Spine';
    const scene = new THREE.Object3D(); scene.add(bone);
    const bind = bone.quaternion.clone();
    applyPose(scene, { LeftArm: { x: 25, y: 0, z: 0 } });
    expect(bone.quaternion.angleTo(bind)).toBeLessThan(1e-6);
  });
});
