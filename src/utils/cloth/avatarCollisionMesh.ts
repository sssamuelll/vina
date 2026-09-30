/**
 * Extract CollisionMeshData from an avatar Three.js scene.
 * @module avatarCollisionMesh
 */

import type { CollisionMeshData } from './collisionMesh';
import { extractCollisionMesh } from './collisionMesh';
import { metresToImporter, importerToMetres } from '../geometry';
import type { MorphConfig } from '../avatar/morphTargets';
import { avatarPorUrl } from '../../avatares/catalogo';

/** El mismo estiramiento que el render, con la referencia del cuerpo cargado (referenciaDeMorph). */
export interface MorphDelCuerpo {
  medidas: MorphConfig;
  morphTargets: Record<string, number>;
  referencia: MorphConfig;
}

/**
 * Load avatar model, extract mesh data, and convert to flat CollisionMeshData.
 * Routes through the importMesh canonical (covers GLTF/GLB/OBJ/FBX/VRM with
 * unified unit detection, target-height scaling, center-on-ground, and
 * MeshImportLimitError safety) — see C8 Fase 2 doc.
 */
export async function extractAvatarCollisionMesh(
  avatarUrl: string,
  avatarHeight: number,
  joints?: Record<string, { x: number; y: number; z: number }>,
  morph?: MorphDelCuerpo,
): Promise<CollisionMeshData | null> {
  const { extractMeshData, applyPose, applyMorph } = await import('./avatarMeshExtractor');
  const { importMesh } = await import('../import/meshImporter');

  const filename = avatarUrl.split('/').pop() || avatarUrl;
  const result = await importMesh(avatarUrl, filename, {
    targetHeightMm: metresToImporter(avatarHeight),
    centrar: !avatarPorUrl(avatarUrl),
  });

  importerToMetres(result.scene);
  result.scene.updateMatrixWorld(true);

  // Pose-matched bake: rotate bones to the rendered pose, then REFRESH the
  // world-matrix tree before extractMeshData's skeleton.update() reads
  // bone.matrixWorld. Without this second update the bake mixes posed
  // quaternions with stale (import-scaled) world matrices → minY≈0 collapse.
  // Also apply the same measurement MORPH (bone scaling + blendshapes) the render
  // does (#frente2 collision fix): without it the collider is the BASE avatar while
  // the render is morphed, so cloth collides with a differently-shaped invisible body.
  const posed = !!(joints && Object.keys(joints).length > 0);
  if (posed) applyPose(result.scene, joints!);
  if (morph) applyMorph(result.scene, morph.medidas, morph.morphTargets, morph.referencia);
  if (posed || morph) result.scene.updateMatrixWorld(true);

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
