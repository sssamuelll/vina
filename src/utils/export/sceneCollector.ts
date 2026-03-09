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

  // 2. Add avatar — find groups containing SkinnedMesh
  if (includeAvatar && garmentMesh) {
    for (const child of scene.children) {
      if (child === garmentMesh) continue;
      let hasSkinnedMesh = false;
      child.traverse(obj => {
        if ((obj as THREE.SkinnedMesh).isSkinnedMesh) hasSkinnedMesh = true;
      });
      if (hasSkinnedMesh) {
        group.add(child.clone(true));
      }
    }
  }

  // 3. Apply scale
  if (scale !== 1.0) {
    group.scale.set(scale, scale, scale);
    group.updateMatrixWorld(true);
  }

  return group;
}
