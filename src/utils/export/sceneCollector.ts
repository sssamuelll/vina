import * as THREE from 'three';

export interface CollectExportSceneOptions {
  garmentMesh: THREE.Mesh | null;
  includeAvatar?: boolean;
  scale?: number;
}

/**
 * Traverse the live Three.js scene and build a clean group for export.
 * Includes garment mesh, optionally avatar, and excludes lights/helpers/ground.
 */
export function collectExportScene(
  scene: THREE.Scene,
  options: CollectExportSceneOptions,
): THREE.Group {
  const { garmentMesh, includeAvatar = true, scale = 1.0 } = options;
  const group = new THREE.Group();

  // 1. Add garment mesh clone
  if (garmentMesh) {
    group.add(garmentMesh.clone(true));
  }

  // 2. Add avatar — find groups containing SkinnedMesh or vinaRole marker
  if (includeAvatar) {
    for (const child of scene.children) {
      if (child === garmentMesh) continue;
      let isAvatar = false;
      // Check for SkinnedMesh (rigged avatar)
      child.traverse(obj => {
        if ((obj as THREE.SkinnedMesh).isSkinnedMesh) isAvatar = true;
      });
      // Check for vinaRole marker (mannequin / dress form)
      if (!isAvatar && child.userData?.vinaRole === 'avatar') {
        isAvatar = true;
      }
      if (isAvatar) {
        group.add(child.clone(true));
      }
    }
  }

  // 3. Apply scale.
  // regla 5 (#694, fix shape from #690 b18f4762): unit-conversion helpers must
  // touch ALL transformation components — scaling `scale` alone leaves
  // `position` at source-unit magnitude (the bug-#690 class). Group is fresh
  // here with position=(0,0,0) so the multiply is a no-op today; symmetric
  // application prevents any future caller that pre-translates from regressing.
  // Canonical: src/utils/geometry/boundaries.ts::importerToMetres.
  if (scale !== 1.0) {
    group.scale.multiplyScalar(scale);
    group.position.multiplyScalar(scale);
    group.updateMatrixWorld(true);
  }

  return group;
}
