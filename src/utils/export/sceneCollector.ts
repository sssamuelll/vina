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
  // TODO: implement scene collection logic
  void scene;
  void options;
  throw new Error('collectExportScene is not implemented yet');
}
