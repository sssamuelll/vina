/**
 * Render-mesh collision bake — collider FROM the live rendered avatar.
 *
 * The URL-based extraction (avatarCollisionMesh.ts) RE-IMPORTS the GLB and
 * re-derives scale / centering / pose / morphs on its own. Measured
 * 2026-07-03 (raycast + silhouette probes, María drape): the two pipelines
 * disagree by ~10-15mm — both center XZ on a POSE-DEPENDENT bounding box
 * evaluated in different skeleton states, and the initial loadCollision
 * doesn't pass morphs at all. The cloth then rides a correct 8-9mm above the
 * COLLISION surface while the RENDER body sticks ~1cm through it: the
 * remaining torso "skin patches" were exactly this, not physics.
 *
 * This module kills the class: bake the collider from the SAME meshes the
 * user sees, via `getVertexPosition` (applies morph targets + skinning —
 * r184 API) × matrixWorld. Whatever the render shows is what the cloth
 * collides with, by construction — centering, height scale, pose and morphs
 * can never diverge again.
 *
 * Registry pattern mirrors penetrationMetric: AvatarModel registers its
 * group; useSimulationLifecycle bakes at collision-load time and falls back
 * to the URL pipeline when no live avatar is registered (headless/tests).
 *
 * @module renderCollisionBake
 */
import * as THREE from 'three';
import type { CollisionMeshData } from './collisionMesh';
import { extractCollisionMesh } from './collisionMesh';

let renderRoot: THREE.Object3D | null = null;

/** Register the live avatar root (AvatarModel group). Null on unmount. */
export function registerAvatarRenderRoot(root: THREE.Object3D | null): void {
  renderRoot = root;
}

export function getAvatarRenderRoot(): THREE.Object3D | null {
  return renderRoot;
}

/** Yield to the event loop between bake chunks (keeps the render loop alive). */
const BAKE_CHUNK = 8192;
const yieldFrame = () => new Promise<void>((r) => setTimeout(r, 0));

/**
 * Bake a CollisionMeshData from the registered live avatar. Returns null when
 * no root is registered or it contains no skinned geometry (caller falls back
 * to the URL pipeline).
 *
 * ASYNC + chunked: getVertexPosition over ~60k verts costs a few hundred ms
 * of JS — done synchronously it lands one big hitch inside the fps windows
 * (measured 2026-07-03: DoD 32.5 → 21.0 fps). Chunking yields every
 * BAKE_CHUNK verts; the 2a init gate already holds the sim until collision
 * is ready, so the extra wall-time is invisible.
 *
 * Only SkinnedMesh instances are baked: the avatar body/parts are skinned,
 * while plain meshes under the group are tool visuals (IK target helpers)
 * that must not become colliders.
 */
export async function bakeCollisionFromRender(): Promise<CollisionMeshData | null> {
  const root = renderRoot;
  if (!root) return null;
  const t0 = performance.now();
  root.updateMatrixWorld(true);

  const meshes: THREE.SkinnedMesh[] = [];
  root.traverse((obj) => {
    const mesh = obj as THREE.SkinnedMesh;
    if (mesh.isSkinnedMesh && mesh.visible && mesh.geometry?.getAttribute('position')) {
      meshes.push(mesh);
    }
  });
  if (meshes.length === 0) return null;

  const allVertices: number[] = [];
  const allIndices: number[] = [];
  let vertexOffset = 0;
  const v = new THREE.Vector3();

  for (const mesh of meshes) {
    const geo = mesh.geometry;
    const posAttr = geo.getAttribute('position');
    mesh.skeleton?.update();

    const base = vertexOffset;
    for (let i = 0; i < posAttr.count; i++) {
      // Morph targets + skinning in local space, then world.
      mesh.getVertexPosition(i, v);
      v.applyMatrix4(mesh.matrixWorld);
      allVertices.push(v.x, v.y, v.z);
      if ((i + 1) % BAKE_CHUNK === 0) await yieldFrame();
    }
    vertexOffset += posAttr.count;

    // Winding: negative-determinant world matrices mirror triangles; swap
    // i1/i2 so cross-product face normals stay outward for that mesh.
    const flip = mesh.matrixWorld.determinant() < 0;
    const idx = geo.getIndex();
    const triCount = idx ? idx.count / 3 : posAttr.count / 3;
    for (let t = 0; t < triCount; t++) {
      const i0 = idx ? idx.getX(t * 3) : t * 3;
      const i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
      const i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
      if (flip) allIndices.push(base + i0, base + i2, base + i1);
      else allIndices.push(base + i0, base + i1, base + i2);
    }
    await yieldFrame();
  }

  if (allVertices.length === 0 || allIndices.length === 0) return null;
  await yieldFrame(); // normals + volume pass below is one more burst

  // Orientation hints: area-weighted vertex normals from the BAKED positions,
  // globally flipped per signed volume (divergence theorem — negative volume
  // means the winding produces inward normals on this closed-ish body). This
  // replaces extractCollisionMesh's centroid heuristic, which breaks in
  // non-convex regions (armpits).
  const verts = new Float32Array(allVertices);
  const indices = new Uint32Array(allIndices);
  let volume6 = 0;
  const vertNormals = new Float32Array(verts.length);
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3, b = indices[t + 1] * 3, c = indices[t + 2] * 3;
    const ax = verts[a], ay = verts[a + 1], az = verts[a + 2];
    const bx = verts[b], by = verts[b + 1], bz = verts[b + 2];
    const cx = verts[c], cy = verts[c + 1], cz = verts[c + 2];
    const nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
    const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    const nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    volume6 += ax * nx + ay * ny + az * nz; // Σ a·(ab×ac) ∝ signed volume
    for (const k of [a, b, c]) {
      vertNormals[k] += nx; vertNormals[k + 1] += ny; vertNormals[k + 2] += nz;
    }
  }
  if (volume6 < 0) {
    for (let i = 0; i < vertNormals.length; i++) vertNormals[i] = -vertNormals[i];
  }

  const out = extractCollisionMesh({
    attributes: {
      position: { array: verts, count: verts.length / 3 },
      normal: { array: vertNormals },
    },
    index: { array: indices, count: indices.length },
  });
  console.log(`[RenderBake] meshes=${meshes.length} verts=${verts.length / 3} tris=${out.triCount} ms=${(performance.now() - t0).toFixed(0)}`);
  return out;
}
