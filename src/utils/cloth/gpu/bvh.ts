/**
 * BVH Linearizer — builds a GPU-friendly linearized BVH from CollisionMeshData.
 *
 * Uses `three-mesh-bvh` for CPU-side SAH BVH construction, then linearizes
 * the packed ArrayBuffer tree into a flat Float32Array suitable for GPU upload
 * as a StorageBufferAttribute.
 *
 * Linearized format: 8 floats per node.
 *   Internal: [minX, minY, minZ, maxX, maxY, maxZ, leftChildIndex, 0]
 *   Leaf:     [minX, minY, minZ, maxX, maxY, maxZ, triStart, triCount]
 *
 * Internal nodes: triCount=0, leftChildIndex points to left child.
 * Right child is always leftChildIndex + 1 (DFS layout guarantee).
 *
 * @module bvh
 */

import { MeshBVH } from 'three-mesh-bvh';
import * as THREE from 'three';
import type { CollisionMeshData } from '../collisionMesh';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface LinearBVH {
  /** 8 floats per node: [minX,minY,minZ, maxX,maxY,maxZ, child/triStart, triCount] */
  nodes: Float32Array;
  /** 9 floats per triangle: [v0x,v0y,v0z, v1x,v1y,v1z, v2x,v2y,v2z] — reordered by BVH leaf order */
  triVerts: Float32Array;
  /** 3 floats per triangle: [nx,ny,nz] — reordered to match triVerts */
  triNormals: Float32Array;
  nodeCount: number;
  triCount: number;
}

// ─── three-mesh-bvh constants ───────────────────────────────────────────────
// Mirrored from three-mesh-bvh/src/core/Constants.js

const BYTES_PER_NODE = 32; // 6 float32 (AABB) + 1 uint32 (offset/right) + 1 uint32 (splitAxis / leaf flag+count)
const UINT32_PER_NODE = BYTES_PER_NODE / 4; // 8
const IS_LEAFNODE_FLAG = 0xFFFF;

// ─── Builder ────────────────────────────────────────────────────────────────

/**
 * Build a linearized BVH from a collision mesh.
 *
 * 1. Creates a Three.js BufferGeometry from the flat expanded-triangle data.
 * 2. Builds a MeshBVH using CENTER strategy with maxLeafSize=4.
 * 3. DFS-traverses the packed binary tree, emitting nodes in depth-first order.
 * 4. Reorders triangle data to match the BVH's leaf ordering.
 *
 * Note: MeshBVH (non-indirect mode) reorders the geometry's index buffer during
 * construction. The leaf node "offset" refers to a face index in the reordered
 * index. We use the reordered index to map back to the original vertex positions.
 */
export function buildLinearBVH(mesh: CollisionMeshData): LinearBVH {
  if (mesh.triCount === 0) {
    return {
      nodes: new Float32Array(0),
      triVerts: new Float32Array(0),
      triNormals: new Float32Array(0),
      nodeCount: 0,
      triCount: 0,
    };
  }

  // ─── 1. Create indexed geometry from expanded triangles ─────────────
  // Each triangle in CollisionMeshData has 9 floats (3 vertices × 3 components).
  // We create a position buffer with one unique vertex per index entry
  // so that the BVH builder can partition by reordering indices.
  const vertexCount = mesh.triCount * 3;
  const positions = new Float32Array(vertexCount * 3);
  const indices = new Uint32Array(mesh.triCount * 3);

  for (let t = 0; t < mesh.triCount; t++) {
    const srcOff = t * 9;
    const dstVert = t * 3;

    // Copy 3 vertices (9 floats) for this triangle
    positions[dstVert * 3] = mesh.vertices[srcOff];
    positions[dstVert * 3 + 1] = mesh.vertices[srcOff + 1];
    positions[dstVert * 3 + 2] = mesh.vertices[srcOff + 2];
    positions[(dstVert + 1) * 3] = mesh.vertices[srcOff + 3];
    positions[(dstVert + 1) * 3 + 1] = mesh.vertices[srcOff + 4];
    positions[(dstVert + 1) * 3 + 2] = mesh.vertices[srcOff + 5];
    positions[(dstVert + 2) * 3] = mesh.vertices[srcOff + 6];
    positions[(dstVert + 2) * 3 + 1] = mesh.vertices[srcOff + 7];
    positions[(dstVert + 2) * 3 + 2] = mesh.vertices[srcOff + 8];

    indices[t * 3] = dstVert;
    indices[t * 3 + 1] = dstVert + 1;
    indices[t * 3 + 2] = dstVert + 2;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));

  // ─── 2. Build BVH ──────────────────────────────────────────────────
  // maxLeafSize replaces the deprecated maxLeafTris option.
  const bvh = new MeshBVH(geometry, { maxLeafSize: 4 });

  // After construction, geometry.index has been reordered by the BVH builder.
  // The reordered index maps face indices to vertex positions.
  const reorderedIndex = geometry.index!.array as Uint32Array;

  // ─── 3. Linearize via DFS traversal ────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- _roots is an internal property of MeshBVH
  const buffer = (bvh as any)._roots[0] as ArrayBuffer;
  const uint32 = new Uint32Array(buffer);
  const uint16 = new Uint16Array(buffer);
  const float32 = new Float32Array(buffer);

  // Pre-count nodes to allocate output array
  let nodeCount = 0;
  function countNodes(n32: number): void {
    nodeCount++;
    const n16 = n32 * 2;
    if (uint16[n16 + 15] !== IS_LEAFNODE_FLAG) {
      // Left child is immediately after parent in the packed buffer
      countNodes(n32 + UINT32_PER_NODE);
      // Right child offset is relative, in node units
      const relativeRight = uint32[n32 + 6];
      countNodes(n32 + relativeRight * UINT32_PER_NODE);
    }
  }
  countNodes(0);

  const outNodes = new Float32Array(nodeCount * 8);
  // triOrder collects original triangle indices in BVH leaf traversal order
  const triOrder: number[] = [];
  let outIdx = 0;

  function linearize(n32: number): number {
    const myIdx = outIdx++;
    const base = myIdx * 8;
    const n16 = n32 * 2;

    // Copy AABB (6 floats)
    outNodes[base] = float32[n32];         // minX
    outNodes[base + 1] = float32[n32 + 1]; // minY
    outNodes[base + 2] = float32[n32 + 2]; // minZ
    outNodes[base + 3] = float32[n32 + 3]; // maxX
    outNodes[base + 4] = float32[n32 + 4]; // maxY
    outNodes[base + 5] = float32[n32 + 5]; // maxZ

    const isLeaf = uint16[n16 + 15] === IS_LEAFNODE_FLAG;

    if (isLeaf) {
      const offset = uint32[n32 + 6];       // face index offset in reordered index
      const count = uint16[n16 + 14];       // number of triangles

      outNodes[base + 6] = triOrder.length;  // triStart in our output ordering
      outNodes[base + 7] = count;

      // Map BVH face indices back to original triangle indices.
      // The reordered index stores 3 vertex indices per face.
      // Original triangle index = vertex_index / 3 (since each triangle has 3 unique verts).
      for (let i = 0; i < count; i++) {
        const faceIdx = offset + i;
        // Each face's first vertex index in the reordered index
        const vertIdx = reorderedIndex[faceIdx * 3];
        // Original triangle index (we created 3 verts per tri: t*3, t*3+1, t*3+2)
        const origTri = Math.floor(vertIdx / 3);
        triOrder.push(origTri);
      }
    } else {
      // Internal node: DFS left, then right
      const leftN32 = n32 + UINT32_PER_NODE;
      const relativeRight = uint32[n32 + 6];
      const rightN32 = n32 + relativeRight * UINT32_PER_NODE;

      const leftChildIdx = linearize(leftN32);
      outNodes[base + 6] = leftChildIdx;   // left child index (right = left + 1)
      outNodes[base + 7] = 0;              // triCount=0 marks internal node

      linearize(rightN32);
    }

    return myIdx;
  }

  linearize(0);

  // ─── 4. Reorder triangles by BVH leaf order ────────────────────────
  const outTriVerts = new Float32Array(mesh.triCount * 9);
  const outTriNormals = new Float32Array(mesh.triCount * 3);

  for (let i = 0; i < triOrder.length; i++) {
    const origTri = triOrder[i];
    for (let j = 0; j < 9; j++) {
      outTriVerts[i * 9 + j] = mesh.vertices[origTri * 9 + j];
    }
    for (let j = 0; j < 3; j++) {
      outTriNormals[i * 3 + j] = mesh.normals[origTri * 3 + j];
    }
  }

  geometry.dispose();

  return {
    nodes: outNodes,
    triVerts: outTriVerts,
    triNormals: outTriNormals,
    nodeCount,
    triCount: mesh.triCount,
  };
}
