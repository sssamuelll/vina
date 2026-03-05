/**
 * Extract CollisionMeshData from an avatar Three.js scene.
 * @module avatarCollisionMesh
 */

import type { CollisionMeshData } from './collisionMesh';
import { extractCollisionMesh } from './collisionMesh';

/**
 * Load avatar model, extract mesh data, and convert to flat CollisionMeshData.
 * Reuses the same avatar loading pipeline as GarmentSimulation.
 */
export async function extractAvatarCollisionMesh(
  avatarUrl: string,
  avatarHeight: number,
): Promise<CollisionMeshData | null> {
  const { extractMeshData } = await import('./avatarMeshExtractor');
  const THREE = await import('three');
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  const { isVRMFile, loadVRM } = await import('../avatar/vrmLoader');

  let scene: import('three').Group;
  if (isVRMFile(avatarUrl)) {
    const result = await loadVRM(avatarUrl);
    scene = result.scene;
  } else {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(avatarUrl);
    scene = gltf.scene as import('three').Group;
  }

  // Scale + center (same transforms as AvatarModel.tsx)
  const box = new THREE.Box3().setFromObject(scene);
  const size = new THREE.Vector3();
  box.getSize(size);
  if (size.y > 0) {
    const scale = avatarHeight / size.y;
    scene.scale.setScalar(scale);
    const scaledBox = new THREE.Box3().setFromObject(scene);
    const scaledCenter = new THREE.Vector3();
    scaledBox.getCenter(scaledCenter);
    scene.position.y = -scaledBox.min.y;
    scene.position.x = -scaledCenter.x;
    scene.position.z = -scaledCenter.z;
  }
  scene.updateMatrixWorld(true);

  const { vertices, indices } = extractMeshData(scene);
  if (vertices.length === 0 || indices.length === 0) return null;

  const geo = {
    attributes: { position: { array: vertices, count: vertices.length / 3 } },
    index: { array: indices, count: indices.length },
  };

  return extractCollisionMesh(geo as Parameters<typeof extractCollisionMesh>[0]);
}
