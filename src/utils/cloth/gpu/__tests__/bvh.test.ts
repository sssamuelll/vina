import { describe, it, expect } from 'vitest';
import { buildLinearBVH } from '../bvh';
import type { CollisionMeshData } from '../../collisionMesh';

/** Two triangles forming a 1×1 floor plane at y=0 */
function makeFloorPlane(): CollisionMeshData {
  return {
    vertices: new Float32Array([
      -0.5, 0, -0.5,  0.5, 0, -0.5,  0.5, 0, 0.5,
      -0.5, 0, -0.5,  0.5, 0, 0.5,  -0.5, 0, 0.5,
    ]),
    normals: new Float32Array([0, 1, 0, 0, 1, 0]),
    triCount: 2,
  };
}

/** A cube (12 triangles) for BVH depth testing */
function makeCube(): CollisionMeshData {
  const v = [
    [-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5],
    [-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5],
  ];
  const faces = [
    [0, 1, 2], [0, 2, 3],
    [4, 6, 5], [4, 7, 6],
    [0, 4, 5], [0, 5, 1],
    [2, 6, 7], [2, 7, 3],
    [0, 3, 7], [0, 7, 4],
    [1, 5, 6], [1, 6, 2],
  ];
  const vertices = new Float32Array(faces.length * 9);
  const normals = new Float32Array(faces.length * 3);
  for (let i = 0; i < faces.length; i++) {
    const [a, b, c] = faces[i];
    vertices.set(v[a], i * 9);
    vertices.set(v[b], i * 9 + 3);
    vertices.set(v[c], i * 9 + 6);
    const abx = v[b][0] - v[a][0], aby = v[b][1] - v[a][1], abz = v[b][2] - v[a][2];
    const acx = v[c][0] - v[a][0], acy = v[c][1] - v[a][1], acz = v[c][2] - v[a][2];
    let nx = aby * acz - abz * acy;
    let ny = abz * acx - abx * acz;
    let nz = abx * acy - aby * acx;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (len > 0) { nx /= len; ny /= len; nz /= len; }
    normals.set([nx, ny, nz], i * 3);
  }
  return { vertices, normals, triCount: faces.length };
}

describe('buildLinearBVH', () => {
  it('returns valid LinearBVH for a simple floor plane', () => {
    const mesh = makeFloorPlane();
    const bvh = buildLinearBVH(mesh);

    expect(bvh.nodeCount).toBeGreaterThan(0);
    expect(bvh.triCount).toBe(2);
    expect(bvh.nodes.length).toBe(bvh.nodeCount * 8);
    expect(bvh.triVerts.length).toBe(2 * 9);
    expect(bvh.triNormals.length).toBe(2 * 3);
  });

  it('every triangle is reachable from leaf nodes', () => {
    const mesh = makeCube();
    const bvh = buildLinearBVH(mesh);

    const reachable = new Set<number>();
    for (let i = 0; i < bvh.nodeCount; i++) {
      const triCount = bvh.nodes[i * 8 + 7];
      if (triCount > 0) {
        const triStart = bvh.nodes[i * 8 + 6];
        for (let t = 0; t < triCount; t++) {
          reachable.add(triStart + t);
        }
      }
    }
    expect(reachable.size).toBe(mesh.triCount);
  });

  it('root node AABB contains all triangles', () => {
    const mesh = makeCube();
    const bvh = buildLinearBVH(mesh);

    const minX = bvh.nodes[0], minY = bvh.nodes[1], minZ = bvh.nodes[2];
    const maxX = bvh.nodes[3], maxY = bvh.nodes[4], maxZ = bvh.nodes[5];

    const eps = 1e-5;
    for (let i = 0; i < bvh.triVerts.length; i += 3) {
      expect(bvh.triVerts[i]).toBeGreaterThanOrEqual(minX - eps);
      expect(bvh.triVerts[i]).toBeLessThanOrEqual(maxX + eps);
      expect(bvh.triVerts[i + 1]).toBeGreaterThanOrEqual(minY - eps);
      expect(bvh.triVerts[i + 1]).toBeLessThanOrEqual(maxY + eps);
      expect(bvh.triVerts[i + 2]).toBeGreaterThanOrEqual(minZ - eps);
      expect(bvh.triVerts[i + 2]).toBeLessThanOrEqual(maxZ + eps);
    }
  });

  it('child AABBs are contained within parent AABBs', () => {
    const mesh = makeCube();
    const bvh = buildLinearBVH(mesh);

    const eps = 1e-5;
    for (let i = 0; i < bvh.nodeCount; i++) {
      const triCount = bvh.nodes[i * 8 + 7];
      if (triCount === 0) {
        const leftIdx = bvh.nodes[i * 8 + 6];
        const rightIdx = leftIdx + 1;

        const pMinX = bvh.nodes[i * 8], pMinY = bvh.nodes[i * 8 + 1], pMinZ = bvh.nodes[i * 8 + 2];
        const pMaxX = bvh.nodes[i * 8 + 3], pMaxY = bvh.nodes[i * 8 + 4], pMaxZ = bvh.nodes[i * 8 + 5];

        for (const cIdx of [leftIdx, rightIdx]) {
          if (cIdx >= bvh.nodeCount) continue;
          expect(bvh.nodes[cIdx * 8]).toBeGreaterThanOrEqual(pMinX - eps);
          expect(bvh.nodes[cIdx * 8 + 1]).toBeGreaterThanOrEqual(pMinY - eps);
          expect(bvh.nodes[cIdx * 8 + 2]).toBeGreaterThanOrEqual(pMinZ - eps);
          expect(bvh.nodes[cIdx * 8 + 3]).toBeLessThanOrEqual(pMaxX + eps);
          expect(bvh.nodes[cIdx * 8 + 4]).toBeLessThanOrEqual(pMaxY + eps);
          expect(bvh.nodes[cIdx * 8 + 5]).toBeLessThanOrEqual(pMaxZ + eps);
        }
      }
    }
  });

  it('handles empty mesh gracefully', () => {
    const mesh: CollisionMeshData = {
      vertices: new Float32Array(0),
      normals: new Float32Array(0),
      triCount: 0,
    };
    const bvh = buildLinearBVH(mesh);
    expect(bvh.nodeCount).toBe(0);
    expect(bvh.triCount).toBe(0);
  });

  it('leaf nodes have maxLeafSize or fewer triangles', () => {
    const mesh = makeCube();
    const bvh = buildLinearBVH(mesh);

    for (let i = 0; i < bvh.nodeCount; i++) {
      const triCount = bvh.nodes[i * 8 + 7];
      if (triCount > 0) {
        expect(triCount).toBeLessThanOrEqual(4);
      }
    }
  });
});
