import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

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

  // 2. Add avatar — find groups marked with userData.opencloRole === 'avatar'
  //    or containing SkinnedMesh (fallback for unmarked avatar models)
  if (includeAvatar) {
    for (const child of scene.children) {
      if (child === garmentMesh) continue;
      const isAvatar = child.userData?.opencloRole === 'avatar';
      if (!isAvatar) {
        let hasSkinnedMesh = false;
        child.traverse(obj => {
          if ((obj as THREE.SkinnedMesh).isSkinnedMesh) hasSkinnedMesh = true;
        });
        if (!hasSkinnedMesh) continue;
      }
      // Use SkeletonUtils.clone for groups with SkinnedMesh, plain clone otherwise
      let hasSkinnedMesh = false;
      child.traverse(obj => {
        if ((obj as THREE.SkinnedMesh).isSkinnedMesh) hasSkinnedMesh = true;
      });
      group.add(hasSkinnedMesh ? SkeletonUtils.clone(child) : child.clone(true));
    }
  }

  // 3. Apply scale
  if (scale !== 1.0) {
    group.scale.set(scale, scale, scale);
    group.updateMatrixWorld(true);
  }

  return group;
}
