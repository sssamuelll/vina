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

const DEG2RAD = Math.PI / 180;

/**
 * Extracted mesh data for collision or analysis.
 */
export interface ExtractedMeshData {
  /** Flat vertex array [x0,y0,z0, x1,y1,z1, ...] */
  vertices: Float32Array;
  /** Triangle indices [i0,i1,i2, i3,i4,i5, ...] */
  indices: Uint32Array;
}

/**
 * Extract mesh data from a Three.js scene or object.
 * 
 * Traverses the scene to find all Mesh objects, extracts their geometry,
 * applies world transforms, and merges into a single mesh suitable for
 * SDF generation.
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
 * Create a simple test mesh for debugging SDF generation.
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
 * Validate extracted mesh data for SDF generation.
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
    warnings.push(`Large vertex count (${numVertices}) may impact SDF generation performance`);
  }
  
  if (numTriangles > 200000) {
    warnings.push(`Large triangle count (${numTriangles}) may impact SDF generation performance`);
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

// ─── A-Pose helpers ──────────────────────────────────────────────────────────

/**
 * Apply the same A-pose bone rotations that AvatarModel.tsx applies.
 * Uses the same Euler rotation approach for consistency.
 */
export function applyAPose(scene: THREE.Object3D): void {
  const boneMap = new Map<string, THREE.Bone>();
  const bindPoses = new Map<string, THREE.Quaternion>();

  // Collect bones
  scene.traverse((obj) => {
    if (!(obj as THREE.Bone).isBone) return;
    const bone = obj as THREE.Bone;
    boneMap.set(bone.name, bone);
    bindPoses.set(bone.name, bone.quaternion.clone());
  });

  // Apply A-pose rotations using the same logic as AvatarModel.tsx
  const aPoseJoints = POSE_PRESETS['A-pose'];
  boneMap.forEach((bone, name) => {
    const bindPose = bindPoses.get(name);
    if (!bindPose) return;

    const jointRot = aPoseJoints[name];
    if (jointRot) {
      const euler = new THREE.Euler(jointRot.x * DEG2RAD, jointRot.y * DEG2RAD, jointRot.z * DEG2RAD, 'ZYX');
      const rotQ = new THREE.Quaternion().setFromEuler(euler);
      bone.quaternion.copy(bindPose).multiply(rotQ);
    } else {
      bone.quaternion.copy(bindPose);
    }
  });
}

// ─── Mesh extraction (with skinning support) ─────────────────────────────────

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

    if (skinned?.skeleton) {
      skinned.skeleton.update();
    }

    const tempVec = new THREE.Vector3();

    for (let i = 0; i < numVerts; i++) {
      tempVec.set(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));

      if (skinned) {
        skinned.applyBoneTransform(i, tempVec);
        tempVec.applyMatrix4(mesh.matrixWorld);
      } else {
        tempVec.applyMatrix4(mesh.matrixWorld);
      }

      allVertices.push(tempVec.x, tempVec.y, tempVec.z);
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

  return {
    vertices: new Float32Array(allVertices),
    indices: new Uint32Array(allIndices),
  };
}