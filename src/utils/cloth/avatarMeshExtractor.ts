/**
 * Avatar Mesh Extractor — extracts vertex and index data from Three.js scenes.
 *
 * Provides functions for extracting world-space mesh data from avatar scenes,
 * including skinned mesh support and A-pose bone rotations.
 *
 * @module avatarMeshExtractor
 */

import * as THREE from 'three';
import { POSE_PRESETS } from '../../store/avatarSlice';
import { computeMorphWeights, MORPH_BONE_MAP, type MorphConfig } from '../avatar/morphTargets';

const DEG2RAD = Math.PI / 180;

/**
 * Extracted mesh data for collision or analysis.
 */
export interface ExtractedMeshData {
  /** Flat vertex array [x0,y0,z0, x1,y1,z1, ...] */
  vertices: Float32Array;
  /** Triangle indices [i0,i1,i2, i3,i4,i5, ...] */
  indices: Uint32Array;
  /** Optional vertex normals [nx0,ny0,nz0, ...] for face orientation hints */
  normals?: Float32Array;
}

/**
 * Extract mesh data from a Three.js scene or object.
 * 
 * Traverses the scene to find all Mesh objects, extracts their geometry,
 * applies world transforms, and merges into a single mesh suitable for
 * collision detection.
 * 
 * @param scene - Three.js Object3D (scene, group, or single mesh)
 * @returns Extracted mesh data or null if no valid geometry found
 */
export function extractAvatarMesh(scene: THREE.Object3D): ExtractedMeshData | null {
  const meshes: { geometry: THREE.BufferGeometry; matrix: THREE.Matrix4 }[] = [];
  
  // Traverse scene to find all meshes
  scene.traverse((object) => {
    if (object instanceof THREE.Mesh && object.geometry) {
      // Clone geometry to avoid modifying original
      const geometry = object.geometry.clone();
      
      // Compute world matrix
      const worldMatrix = new THREE.Matrix4();
      worldMatrix.copy(object.matrixWorld);
      
      meshes.push({ geometry, matrix: worldMatrix });
    }
  });
  
  if (meshes.length === 0) {
    return null;
  }
  
  // Collect all vertices and indices
  const allVertices: number[] = [];
  const allIndices: number[] = [];
  let vertexOffset = 0;
  
  for (const { geometry, matrix } of meshes) {
    // Get position attribute
    const positionAttribute = geometry.getAttribute('position');
    if (!positionAttribute) {
      continue;
    }
    
    // Get or generate index attribute
    const indexAttribute = geometry.getIndex();
    let indices: number[];
    
    if (indexAttribute) {
      // Use existing indices
      indices = Array.from(indexAttribute.array);
    } else {
      // Generate indices for non-indexed geometry
      const numVertices = positionAttribute.count;
      indices = Array.from({ length: numVertices }, (_, i) => i);
    }
    
    // Check if indices form complete triangles
    if (indices.length % 3 !== 0) {
      console.warn('Avatar mesh extractor: skipping geometry with incomplete triangles');
      continue;
    }
    
    // Transform vertices to world space
    const positions = positionAttribute.array as Float32Array;
    const vertex = new THREE.Vector3();
    
    for (let i = 0; i < positions.length; i += 3) {
      vertex.set(positions[i], positions[i + 1], positions[i + 2]);
      vertex.applyMatrix4(matrix);
      
      allVertices.push(vertex.x, vertex.y, vertex.z);
    }
    
    // Add indices with vertex offset
    for (const index of indices) {
      allIndices.push(vertexOffset + index);
    }
    
    vertexOffset += positions.length / 3;
  }
  
  if (allVertices.length === 0 || allIndices.length === 0) {
    return null;
  }
  
  // Validate indices
  const numVertices = allVertices.length / 3;
  for (const index of allIndices) {
    if (index < 0 || index >= numVertices) {
      console.error(`Avatar mesh extractor: invalid index ${index} (numVertices: ${numVertices})`);
      return null;
    }
  }
  
  return {
    vertices: new Float32Array(allVertices),
    indices: new Uint32Array(allIndices)
  };
}

/**
 * Create a simple test mesh for debugging collision detection.
 * 
 * @param type - Type of test mesh ('sphere' | 'cube')
 * @param resolution - Tessellation resolution for sphere
 * @returns Test mesh data
 */
export function createTestMesh(type: 'sphere' | 'cube', resolution: number = 32): ExtractedMeshData {
  let geometry: THREE.BufferGeometry;
  
  if (type === 'sphere') {
    geometry = new THREE.SphereGeometry(1.0, resolution, resolution);
  } else {
    geometry = new THREE.BoxGeometry(2, 2, 2);
  }
  
  const positions = geometry.getAttribute('position').array as Float32Array;
  const indices = geometry.getIndex()?.array as Uint32Array;
  
  return {
    vertices: new Float32Array(positions),
    indices: new Uint32Array(indices || [])
  };
}

/**
 * Validate extracted mesh data for collision detection.
 * 
 * @param meshData - Extracted mesh data
 * @returns Validation result with details
 */
export function validateMeshData(meshData: ExtractedMeshData): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Check vertex count
  if (meshData.vertices.length === 0) {
    errors.push('No vertices found');
  } else if (meshData.vertices.length % 3 !== 0) {
    errors.push('Vertex array length is not divisible by 3');
  }
  
  // Check index count
  if (meshData.indices.length === 0) {
    errors.push('No indices found');
  } else if (meshData.indices.length % 3 !== 0) {
    errors.push('Index array length is not divisible by 3');
  }
  
  const numVertices = meshData.vertices.length / 3;
  const numTriangles = meshData.indices.length / 3;
  
  // Check index bounds
  for (let i = 0; i < meshData.indices.length; i++) {
    const index = meshData.indices[i];
    if (index < 0 || index >= numVertices) {
      errors.push(`Index ${index} at position ${i} is out of bounds [0, ${numVertices - 1}]`);
      break; // Don't spam errors
    }
  }
  
  // Check for degenerate triangles
  let degenerateCount = 0;
  for (let i = 0; i < numTriangles; i++) {
    const i0 = meshData.indices[i * 3] * 3;
    const i1 = meshData.indices[i * 3 + 1] * 3;
    const i2 = meshData.indices[i * 3 + 2] * 3;
    
    const v0 = [meshData.vertices[i0], meshData.vertices[i0 + 1], meshData.vertices[i0 + 2]];
    const v1 = [meshData.vertices[i1], meshData.vertices[i1 + 1], meshData.vertices[i1 + 2]];
    const v2 = [meshData.vertices[i2], meshData.vertices[i2 + 1], meshData.vertices[i2 + 2]];
    
    // Check for duplicate vertices in triangle
    const d01 = Math.sqrt((v1[0] - v0[0]) ** 2 + (v1[1] - v0[1]) ** 2 + (v1[2] - v0[2]) ** 2);
    const d02 = Math.sqrt((v2[0] - v0[0]) ** 2 + (v2[1] - v0[1]) ** 2 + (v2[2] - v0[2]) ** 2);
    const d12 = Math.sqrt((v2[0] - v1[0]) ** 2 + (v2[1] - v1[1]) ** 2 + (v2[2] - v1[2]) ** 2);
    
    if (d01 < 1e-12 || d02 < 1e-12 || d12 < 1e-12) {
      degenerateCount++;
    }
  }
  
  if (degenerateCount > 0) {
    warnings.push(`Found ${degenerateCount} degenerate triangles`);
  }
  
  // Performance warnings
  if (numVertices > 100000) {
    warnings.push(`Large vertex count (${numVertices}) may impact collision detection performance`);
  }
  
  if (numTriangles > 200000) {
    warnings.push(`Large triangle count (${numTriangles}) may impact collision detection performance`);
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

// ─── A-Pose helpers ──────────────────────────────────────────────────────────

/**
 * Apply per-bone rotations (degrees, Euler ZYX, post-multiplied onto the bind quaternion).
 *
 * @param scene - Three.js scene containing bones
 * @param joints - Record mapping bone names to rotation in degrees { x, y, z }
 */
export function applyPose(
  scene: THREE.Object3D,
  joints: Record<string, { x: number; y: number; z: number }>,
): void {
  const boneMap = new Map<string, THREE.Bone>();
  const bindPoses = new Map<string, THREE.Quaternion>();
  scene.traverse((obj) => {
    if (!(obj as THREE.Bone).isBone) return;
    const bone = obj as THREE.Bone;
    boneMap.set(bone.name, bone);
    bindPoses.set(bone.name, bone.quaternion.clone());
  });
  boneMap.forEach((bone, name) => {
    const bindPose = bindPoses.get(name);
    if (!bindPose) return;
    const jointRot = joints[name];
    if (jointRot) {
      const euler = new THREE.Euler(jointRot.x * DEG2RAD, jointRot.y * DEG2RAD, jointRot.z * DEG2RAD, 'ZYX');
      const rotQ = new THREE.Quaternion().setFromEuler(euler);
      bone.quaternion.copy(bindPose).multiply(rotQ);
    } else {
      bone.quaternion.copy(bindPose);
    }
  });
}

/** Back-compat: A-pose from the static preset. */
export function applyAPose(scene: THREE.Object3D): void {
  applyPose(scene, POSE_PRESETS['A-pose']);
}

/**
 * Apply the SAME measurement morph the render does (AvatarModel.tsx:523-550) to a
 * freshly-loaded avatar scene, so the EXTRACTED collision mesh matches the RENDERED
 * (morphed) body instead of the base GLB. Without this the collider is the base avatar
 * (default measurements) while the render is morphed → cloth collides with a
 * differently-shaped invisible body (passes through / floats). Mirrors the render's
 * bone-scaling table (girth=X+Z, shoulder=X, limb=Y) + native morph-target influences
 * EXACTLY. Call AFTER applyPose, BEFORE updateMatrixWorld so scaled bones bake in.
 */
export function applyMorph(
  scene: THREE.Object3D,
  measurements: MorphConfig,
  morphTargets: Record<string, number>,
): void {
  const w = computeMorphWeights(measurements);
  scene.traverse((obj) => {
    if ((obj as THREE.Bone).isBone) {
      const bone = obj as THREE.Bone;
      const n = bone.name;
      if ((MORPH_BONE_MAP.chest as readonly string[]).includes(n)) bone.scale.set(w.chestScale, 1, w.chestScale);
      else if ((MORPH_BONE_MAP.waist as readonly string[]).includes(n)) bone.scale.set(w.waistScale, 1, w.waistScale);
      else if ((MORPH_BONE_MAP.hip as readonly string[]).includes(n)) bone.scale.set(w.hipScale, 1, w.hipScale);
      else if (n === MORPH_BONE_MAP.shoulderLeft || n === MORPH_BONE_MAP.shoulderRight) bone.scale.set(w.shoulderScale, 1, 1);
      else if (n === MORPH_BONE_MAP.armLeft || n === MORPH_BONE_MAP.armRight) bone.scale.set(1, w.armLength, 1);
      else if (n === MORPH_BONE_MAP.legLeft || n === MORPH_BONE_MAP.legRight) bone.scale.set(1, w.legLength, 1);
      else bone.scale.set(1, 1, 1); // mirror render's reset of non-morph bones
    }
    const mesh = obj as THREE.SkinnedMesh;
    if (mesh.isSkinnedMesh && mesh.morphTargetDictionary && mesh.morphTargetInfluences) {
      for (const [name, index] of Object.entries(mesh.morphTargetDictionary)) {
        const value = morphTargets[name];
        if (value !== undefined) mesh.morphTargetInfluences[index] = value;
      }
    }
  });
}

// ─── Mesh extraction (with skinning support) ─────────────────────────────────

/**
 * Extract world-space vertices and indices from all meshes in a scene.
 * For SkinnedMesh, bakes skeleton transforms into vertex positions.
 */
export function extractMeshData(scene: THREE.Object3D): ExtractedMeshData {
  const allVertices: number[] = [];
  const allNormals: number[] = [];
  const allIndices: number[] = [];
  let vertexOffset = 0;
  let anyNormals = false;

  scene.traverse((obj) => {
    if (!(obj as THREE.Mesh).isMesh) return;
    const mesh = obj as THREE.Mesh;
    const geo = mesh.geometry;
    if (!geo) return;

    const posAttr = geo.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (!posAttr) return;

    const normalAttr = geo.getAttribute('normal') as THREE.BufferAttribute | undefined;
    if (normalAttr) anyNormals = true;

    const numVerts = posAttr.count;
    const isSkinnedMesh = (mesh as THREE.SkinnedMesh).isSkinnedMesh;
    const skinned = isSkinnedMesh ? (mesh as THREE.SkinnedMesh) : null;

    if (skinned?.skeleton) {
      skinned.skeleton.update();
    }

    const tempVec = new THREE.Vector3();
    const tempNorm = new THREE.Vector3();
    // For non-skinned meshes, compute normal matrix once
    const normalMatrix = (!skinned && normalAttr) ? new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld) : null;

    for (let i = 0; i < numVerts; i++) {
      const origX = posAttr.getX(i), origY = posAttr.getY(i), origZ = posAttr.getZ(i);
      tempVec.set(origX, origY, origZ);

      if (skinned) {
        skinned.applyBoneTransform(i, tempVec);
        tempVec.applyMatrix4(mesh.matrixWorld);
      } else {
        tempVec.applyMatrix4(mesh.matrixWorld);
      }

      const worldX = tempVec.x, worldY = tempVec.y, worldZ = tempVec.z;
      allVertices.push(worldX, worldY, worldZ);

      // Extract vertex normals per-mesh (fill zeros if this mesh lacks normals)
      if (normalAttr) {
        if (skinned) {
          // Transform (position + normal) through bone transforms, then subtract
          // transformed position to isolate the rotation-only normal transform.
          const nx = normalAttr.getX(i), ny = normalAttr.getY(i), nz = normalAttr.getZ(i);
          tempNorm.set(origX + nx, origY + ny, origZ + nz);
          skinned.applyBoneTransform(i, tempNorm);
          tempNorm.applyMatrix4(mesh.matrixWorld);
          allNormals.push(tempNorm.x - worldX, tempNorm.y - worldY, tempNorm.z - worldZ);
        } else {
          tempNorm.set(normalAttr.getX(i), normalAttr.getY(i), normalAttr.getZ(i));
          tempNorm.applyMatrix3(normalMatrix!);
          allNormals.push(tempNorm.x, tempNorm.y, tempNorm.z);
        }
      } else {
        // No normals for this mesh — fill zeros (centroid fallback will handle these)
        allNormals.push(0, 0, 0);
      }
    }

    const index = geo.index;
    if (index) {
      for (let i = 0; i < index.count; i++) {
        allIndices.push(index.getX(i) + vertexOffset);
      }
    } else {
      for (let i = 0; i < numVerts; i++) {
        allIndices.push(i + vertexOffset);
      }
    }

    vertexOffset += numVerts;
  });

  const result: ExtractedMeshData = {
    vertices: new Float32Array(allVertices),
    indices: new Uint32Array(allIndices),
  };
  if (anyNormals && allNormals.length > 0) {
    result.normals = new Float32Array(allNormals);
  }
  return result;
}