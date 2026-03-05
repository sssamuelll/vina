/**
 * Collision Mesh Data — flat triangle representation for worker-side collision.
 *
 * Flat triangle representation for body collision. Extracted on main thread from
 * Three.js BufferGeometry, transferred to worker via postMessage.
 *
 * @module collisionMesh
 */

export interface CollisionMeshData {
  vertices: Float32Array;
  normals: Float32Array;
  triCount: number;
}

export function extractCollisionMesh(
  geometry: { attributes: { position: { array: Float32Array; count: number } }; index: { array: Uint32Array | Uint16Array; count: number } | null },
): CollisionMeshData {
  const pos = geometry.attributes.position.array;
  const idx = geometry.index;
  const triCount = idx ? idx.count / 3 : geometry.attributes.position.count / 3;

  if (triCount === 0) {
    return { vertices: new Float32Array(0), normals: new Float32Array(0), triCount: 0 };
  }

  const vertices = new Float32Array(triCount * 9);
  const normals = new Float32Array(triCount * 3);

  for (let i = 0; i < triCount; i++) {
    const i0 = idx ? idx.array[i * 3] : i * 3;
    const i1 = idx ? idx.array[i * 3 + 1] : i * 3 + 1;
    const i2 = idx ? idx.array[i * 3 + 2] : i * 3 + 2;

    const ax = pos[i0 * 3], ay = pos[i0 * 3 + 1], az = pos[i0 * 3 + 2];
    const bx = pos[i1 * 3], by = pos[i1 * 3 + 1], bz = pos[i1 * 3 + 2];
    const cx = pos[i2 * 3], cy = pos[i2 * 3 + 1], cz = pos[i2 * 3 + 2];

    const off = i * 9;
    vertices[off] = ax; vertices[off + 1] = ay; vertices[off + 2] = az;
    vertices[off + 3] = bx; vertices[off + 4] = by; vertices[off + 5] = bz;
    vertices[off + 6] = cx; vertices[off + 7] = cy; vertices[off + 8] = cz;

    const abx = bx - ax, aby = by - ay, abz = bz - az;
    const acx = cx - ax, acy = cy - ay, acz = cz - az;
    let nx = aby * acz - abz * acy;
    let ny = abz * acx - abx * acz;
    let nz = abx * acy - aby * acx;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (len > 1e-12) { nx /= len; ny /= len; nz /= len; }
    else { nx = 0; ny = 1; nz = 0; }

    const noff = i * 3;
    normals[noff] = nx; normals[noff + 1] = ny; normals[noff + 2] = nz;
  }

  return { vertices, normals, triCount };
}

/**
 * Convert raw vertex + index buffers to CollisionMeshData.
 * Bridges avatarMeshExtractor output to collision format.
 */
export function collisionMeshFromBuffers(
  vertices: Float32Array,
  indices: Uint32Array,
): CollisionMeshData | null {
  if (vertices.length === 0 || indices.length === 0) return null;
  return extractCollisionMesh({
    attributes: { position: { array: vertices, count: vertices.length / 3 } },
    index: { array: indices, count: indices.length },
  });
}
