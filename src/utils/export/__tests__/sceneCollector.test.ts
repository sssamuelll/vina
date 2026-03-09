import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { collectExportScene } from '../sceneCollector';

function makeTestScene() {
  const scene = new THREE.Scene();

  // Garment mesh
  const garmentGeo = new THREE.BufferGeometry();
  garmentGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0,0,0, 1,0,0, 0,1,0]), 3));
  garmentGeo.setIndex([0, 1, 2]);
  const garmentMat = new THREE.MeshPhysicalMaterial({ color: '#ffffff' });
  const garmentMesh = new THREE.Mesh(garmentGeo, garmentMat);
  garmentMesh.name = 'garment';
  scene.add(garmentMesh);

  // Avatar — a group containing a SkinnedMesh
  const avatarGroup = new THREE.Group();
  avatarGroup.name = 'avatar-group';
  const avatarGeo = new THREE.BufferGeometry();
  avatarGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0,0,0, 1,0,0, 0,1,0, 1,1,0]), 3));
  avatarGeo.setAttribute('skinIndex', new THREE.BufferAttribute(new Uint16Array([0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0]), 4));
  avatarGeo.setAttribute('skinWeight', new THREE.BufferAttribute(new Float32Array([1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0]), 4));
  avatarGeo.setIndex([0, 1, 2, 1, 3, 2]);
  const bone = new THREE.Bone();
  const skeleton = new THREE.Skeleton([bone]);
  const avatarMesh = new THREE.SkinnedMesh(avatarGeo, new THREE.MeshStandardMaterial());
  avatarMesh.add(bone);
  avatarMesh.bind(skeleton);
  avatarGroup.add(avatarMesh);
  scene.add(avatarGroup);

  // Lights, helpers, ground — should be excluded
  scene.add(new THREE.DirectionalLight(0xffffff));
  scene.add(new THREE.GridHelper(10, 10));
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 20),
    new THREE.MeshStandardMaterial(),
  );
  ground.name = 'ground';
  scene.add(ground);

  return { scene, garmentMesh, avatarMesh };
}

describe('collectExportScene', () => {
  it('includes garment mesh by default', () => {
    const { scene, garmentMesh } = makeTestScene();
    const group = collectExportScene(scene, { garmentMesh });
    let meshCount = 0;
    group.traverse((obj: THREE.Object3D) => { if ((obj as THREE.Mesh).isMesh) meshCount++; });
    expect(meshCount).toBeGreaterThanOrEqual(1);
  });

  it('includes avatar when includeAvatar is true', () => {
    const { scene, garmentMesh } = makeTestScene();
    const group = collectExportScene(scene, { garmentMesh, includeAvatar: true });
    let hasSkinnedMesh = false;
    group.traverse((obj: THREE.Object3D) => { if ((obj as THREE.SkinnedMesh).isSkinnedMesh) hasSkinnedMesh = true; });
    expect(hasSkinnedMesh).toBe(true);
  });

  it('excludes avatar when includeAvatar is false', () => {
    const { scene, garmentMesh } = makeTestScene();
    const group = collectExportScene(scene, { garmentMesh, includeAvatar: false });
    let hasSkinnedMesh = false;
    group.traverse((obj: THREE.Object3D) => { if ((obj as THREE.SkinnedMesh).isSkinnedMesh) hasSkinnedMesh = true; });
    expect(hasSkinnedMesh).toBe(false);
  });

  it('excludes lights, helpers, and ground', () => {
    const { scene, garmentMesh } = makeTestScene();
    const group = collectExportScene(scene, { garmentMesh, includeAvatar: true });
    let hasLight = false;
    let hasHelper = false;
    group.traverse((obj: THREE.Object3D) => {
      if ((obj as THREE.Light).isLight) hasLight = true;
      if (obj.type.includes('Helper')) hasHelper = true;
    });
    expect(hasLight).toBe(false);
    expect(hasHelper).toBe(false);
  });

  it('applies scale factor', () => {
    const { scene, garmentMesh } = makeTestScene();
    const group = collectExportScene(scene, { garmentMesh, scale: 0.1 });
    expect(group.scale.x).toBeCloseTo(0.1);
    expect(group.scale.y).toBeCloseTo(0.1);
    expect(group.scale.z).toBeCloseTo(0.1);
  });

  it('returns empty group when garmentMesh is null', () => {
    const { scene } = makeTestScene();
    const group = collectExportScene(scene, { garmentMesh: null });
    let meshCount = 0;
    group.traverse((obj: THREE.Object3D) => { if ((obj as THREE.Mesh).isMesh) meshCount++; });
    expect(meshCount).toBe(0);
  });
});
