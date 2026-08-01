import { describe, it, expect, vi } from 'vitest';
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

  it('returns empty group when garmentMesh is null and includeAvatar is false', () => {
    const { scene } = makeTestScene();
    const group = collectExportScene(scene, { garmentMesh: null, includeAvatar: false });
    let meshCount = 0;
    group.traverse((obj: THREE.Object3D) => { if ((obj as THREE.Mesh).isMesh) meshCount++; });
    expect(meshCount).toBe(0);
  });

  it('includes avatar even when garmentMesh is null', () => {
    const { scene } = makeTestScene();
    const group = collectExportScene(scene, { garmentMesh: null, includeAvatar: true });
    let hasSkinnedMesh = false;
    group.traverse((obj: THREE.Object3D) => { if ((obj as THREE.SkinnedMesh).isSkinnedMesh) hasSkinnedMesh = true; });
    expect(hasSkinnedMesh).toBe(true);
  });

  it('includes mannequin (plain mesh) with userData.vinaRole marker', () => {
    const scene = new THREE.Scene();
    const mannequinGroup = new THREE.Group();
    mannequinGroup.userData = { vinaRole: 'avatar' };
    const bodyMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.2),
      new THREE.MeshStandardMaterial(),
    );
    mannequinGroup.add(bodyMesh);
    scene.add(mannequinGroup);

    const group = collectExportScene(scene, { garmentMesh: null, includeAvatar: true });
    let meshCount = 0;
    group.traverse((obj: THREE.Object3D) => { if ((obj as THREE.Mesh).isMesh) meshCount++; });
    expect(meshCount).toBe(1);
  });

  it('excludes mannequin when includeAvatar is false', () => {
    const scene = new THREE.Scene();
    const mannequinGroup = new THREE.Group();
    mannequinGroup.userData = { vinaRole: 'avatar' };
    mannequinGroup.add(new THREE.Mesh(new THREE.SphereGeometry(0.2), new THREE.MeshStandardMaterial()));
    scene.add(mannequinGroup);

    const group = collectExportScene(scene, { garmentMesh: null, includeAvatar: false });
    let meshCount = 0;
    group.traverse((obj: THREE.Object3D) => { if ((obj as THREE.Mesh).isMesh) meshCount++; });
    expect(meshCount).toBe(0);
  });
});

// regla 5 (#694, fix shape from #690 b18f4762): unit-conversion helpers must
// scale ALL transformation components — scaling `scale` alone leaves `position`
// at source-unit magnitude, breaking the scene graph by orders of magnitude.
// Current callers pass freshly constructed groups with position=(0,0,0) so the
// bug is latent; these tests pin symmetric application to prevent the bug-#690
// class regressing on any future caller that pre-translates the group.
// Canonical: src/utils/geometry/boundaries.ts::importerToMetres.
describe('regla 5 unit-conversion symmetry (#694)', () => {
  it('applies scale to both group.scale and group.position when scale !== 1', () => {
    const scene = new THREE.Scene();
    const mesh = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial(),
    );
    scene.add(mesh);

    const spy = vi.spyOn(THREE.Vector3.prototype, 'multiplyScalar');
    try {
      collectExportScene(scene, { garmentMesh: mesh, scale: 0.001 });
      const callsWithFactor = spy.mock.calls.filter((args) => args[0] === 0.001);
      expect(callsWithFactor).toHaveLength(2);
    } finally {
      spy.mockRestore();
    }
  });

  it('scale=1 leaves transform untouched (default path)', () => {
    const scene = new THREE.Scene();
    const mesh = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial(),
    );
    scene.add(mesh);

    const group = collectExportScene(scene, { garmentMesh: mesh, scale: 1.0 });

    expect(group.scale.toArray()).toEqual([1, 1, 1]);
    expect(group.position.toArray()).toEqual([0, 0, 0]);
  });
});
