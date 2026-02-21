/**
 * Avatar SDF Builder — generates a signed distance field from a GLB avatar mesh.
 *
 * Loads the avatar, applies the same transforms as AvatarModel.tsx (scaling, centering,
 * A-pose), then extracts world-space vertices and calls generateSDF().
 *
 * @module avatarSDF
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { generateSDF, type SDFData } from './sdfGenerator';

// ─── Cache ───────────────────────────────────────────────────────────────────

const sdfCache = new Map<string, SDFData>();

function cacheKey(url: string, height: number, resolution: number): string {
  return `${url}|${height.toFixed(4)}|${resolution}`;
}

/**
 * Clear the SDF cache (useful when avatar changes).
 */
export function clearAvatarSDFCache(): void {
  sdfCache.clear();
}

// ─── A-Pose helpers ──────────────────────────────────────────────────────────

const DEG65 = (Math.PI / 180) * 65;
const DEG5 = (Math.PI / 180) * 5;

/**
 * Apply the same A-pose bone rotations that AvatarModel.tsx applies.
 * For Mixamo rigs: Z-axis rotation lowers arms from T-pose to A-pose.
 * Left arm: negative Z (down), Right arm: positive Z (down).
 */
function applyAPose(scene: THREE.Object3D): void {
  let left: THREE.Bone | null = null;
  let right: THREE.Bone | null = null;
  let leftShoulder: THREE.Bone | null = null;
  let rightShoulder: THREE.Bone | null = null;

  scene.traverse((obj) => {
    if (!(obj as THREE.Bone).isBone) return;
    const bone = obj as THREE.Bone;
    if (bone.name === 'LeftArm' || bone.name === 'LeftUpperArm') left = bone;
    else if (bone.name === 'RightArm' || bone.name === 'RightUpperArm') right = bone;
    else if (bone.name === 'LeftShoulder') leftShoulder = bone;
    else if (bone.name === 'RightShoulder') rightShoulder = bone;
  });

  const leftArmRot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -DEG65);
  const rightArmRot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), DEG65);
  if (left) (left as THREE.Bone).quaternion.multiply(leftArmRot);
  if (right) (right as THREE.Bone).quaternion.multiply(rightArmRot);

  const leftShoulderRot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -DEG5);
  const rightShoulderRot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), DEG5);
  if (leftShoulder) (leftShoulder as THREE.Bone).quaternion.multiply(leftShoulderRot);
  if (rightShoulder) (rightShoulder as THREE.Bone).quaternion.multiply(rightShoulderRot);
}

// ─── Mesh extraction ─────────────────────────────────────────────────────────

/**
 * Extract world-space vertices and indices from all meshes in a scene.
 * For SkinnedMesh, bakes skeleton transforms into vertex positions.
 */
export function extractMeshData(scene: THREE.Object3D): {
  vertices: Float32Array;
  indices: Uint32Array;
} {
  const allVertices: number[] = [];
  const allIndices: number[] = [];
  let vertexOffset = 0;

  scene.traverse((obj) => {
    if (!(obj as THREE.Mesh).isMesh) return;
    const mesh = obj as THREE.Mesh;
    const geo = mesh.geometry;
    if (!geo) return;

    const posAttr = geo.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (!posAttr) return;

    const numVerts = posAttr.count;
    const isSkinnedMesh = (mesh as THREE.SkinnedMesh).isSkinnedMesh;
    const skinned = isSkinnedMesh ? (mesh as THREE.SkinnedMesh) : null;

    // Ensure skeleton is up to date
    if (skinned?.skeleton) {
      skinned.skeleton.update();
    }

    const tempVec = new THREE.Vector3();

    for (let i = 0; i < numVerts; i++) {
      tempVec.set(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));

      if (skinned) {
        // Apply bone transforms via applyBoneTransform (Three.js r151+)
        skinned.applyBoneTransform(i, tempVec);
        // applyBoneTransform gives local-skinned coords; apply mesh world matrix
        tempVec.applyMatrix4(mesh.matrixWorld);
      } else {
        tempVec.applyMatrix4(mesh.matrixWorld);
      }

      allVertices.push(tempVec.x, tempVec.y, tempVec.z);
    }

    // Indices
    const index = geo.index;
    if (index) {
      for (let i = 0; i < index.count; i++) {
        allIndices.push(index.getX(i) + vertexOffset);
      }
    } else {
      // Non-indexed: generate sequential indices
      for (let i = 0; i < numVerts; i++) {
        allIndices.push(i + vertexOffset);
      }
    }

    vertexOffset += numVerts;
  });

  return {
    vertices: new Float32Array(allVertices),
    indices: new Uint32Array(allIndices),
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Build a signed distance field from an avatar GLB.
 *
 * Applies the same transforms as AvatarModel.tsx:
 * 1. Scale to target height
 * 2. Center horizontally, feet at y=0
 * 3. A-pose bone rotations
 *
 * Results are cached by (url, height, resolution).
 *
 * @param avatarUrl - URL to the GLB file
 * @param height - Target height in meters
 * @param resolution - SDF grid resolution (default 64)
 * @returns SDF data for body collision
 */
export async function buildAvatarSDF(
  avatarUrl: string,
  height: number,
  resolution: number = 64,
): Promise<SDFData> {
  const key = cacheKey(avatarUrl, height, resolution);
  const cached = sdfCache.get(key);
  if (cached) return cached;

  // Load GLB
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(avatarUrl);
  const scene = gltf.scene;

  // 1. Scale to target height (same as AvatarModel)
  const box = new THREE.Box3().setFromObject(scene);
  const size = new THREE.Vector3();
  box.getSize(size);

  if (size.y > 0) {
    const scale = height / size.y;
    scene.scale.setScalar(scale);

    // Recompute after scaling
    const scaledBox = new THREE.Box3().setFromObject(scene);
    const scaledCenter = new THREE.Vector3();
    scaledBox.getCenter(scaledCenter);

    // 2. Center horizontally, feet at y=0
    scene.position.y = -scaledBox.min.y;
    scene.position.x = -scaledCenter.x;
    scene.position.z = -scaledCenter.z;
  }

  // 3. Apply A-pose
  applyAPose(scene);

  // 4. Bake all transforms
  scene.updateMatrixWorld(true);

  // 5. Extract world-space mesh data
  const { vertices, indices } = extractMeshData(scene);

  if (vertices.length === 0 || indices.length === 0) {
    throw new Error('Avatar mesh has no geometry');
  }

  // 6. Generate SDF
  const sdf = generateSDF(vertices, indices, resolution);

  if (!sdf) {
    throw new Error('SDF generation failed');
  }

  // Cache and return
  sdfCache.set(key, sdf);
  return sdf;
}
