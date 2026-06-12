/**
 * Extract CollisionMeshData from an avatar Three.js scene.
 * @module avatarCollisionMesh
 */

import type { CollisionMeshData } from './collisionMesh';
import { extractCollisionMesh } from './collisionMesh';
import { metresToImporter, importerToMetres } from '../geometry';

/**
 * Load avatar model, extract mesh data, and convert to flat CollisionMeshData.
 * Routes through the importMesh canonical (covers GLTF/GLB/OBJ/FBX/VRM with
 * unified unit detection, target-height scaling, center-on-ground, and
 * MeshImportLimitError safety) — see C8 Fase 2 doc.
 */
export async function extractAvatarCollisionMesh(
  avatarUrl: string,
  avatarHeight: number,
): Promise<CollisionMeshData | null> {
  const { extractMeshData } = await import('./avatarMeshExtractor');
  const { importMesh } = await import('../import/meshImporter');

  const filename = avatarUrl.split('/').pop() || avatarUrl;
  const result = await importMesh(avatarUrl, filename, {
    targetHeightMm: metresToImporter(avatarHeight),
  });

  importerToMetres(result.scene);
  // NOTE (M4-D): do NOT applyAPose() here. The visual avatar starts in
  // A-pose while this collision mesh bakes the GLB's T-pose bind — a real
  // mismatch — but applying the pose at this point CORRUPTS the skinned
  // bake (measured: the whole garment fell through to the ground,
  // minY≈0, vs a correct drape without it; rotating bones after the
  // import's scale pass desyncs the bind matrices `extractMeshData`
  // bakes with). Pose-matched collision needs the bake to happen in the
  // same skeleton state the renderer uses — tracked as a follow-up issue.
  result.scene.updateMatrixWorld(true);

  const { vertices, indices, normals } = extractMeshData(result.scene);
  console.log(`[AvatarCollision] extractMeshData: ${vertices.length / 3} verts, ${indices.length / 3} tris, normals=${normals ? normals.length / 3 : 'NONE'}`);

  if (vertices.length === 0 || indices.length === 0) return null;

  const geo = {
    attributes: {
      position: { array: vertices, count: vertices.length / 3 },
      ...(normals ? { normal: { array: normals } } : {}),
    },
    index: { array: indices, count: indices.length },
  };

  return extractCollisionMesh(geo as Parameters<typeof extractCollisionMesh>[0]);
}
