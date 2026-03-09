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
  geometry: {
    attributes: {
      position: { array: Float32Array; count: number };
      normal?: { array: Float32Array };
    };
    index: { array: Uint32Array | Uint16Array; count: number } | null;
  },
): CollisionMeshData {
  const pos = geometry.attributes.position.array;
  const vtxNormals = geometry.attributes.normal?.array;
  const idx = geometry.index;
  const triCount = idx ? idx.count / 3 : geometry.attributes.position.count / 3;

  console.log(`[CollisionMesh] extractCollisionMesh: ${triCount} tris, vtxNormals=${vtxNormals ? 'YES(' + vtxNormals.length / 3 + ')' : 'NO'}`);

  if (triCount === 0) {
    return { vertices: new Float32Array(0), normals: new Float32Array(0), triCount: 0 };
  }

  // Always compute mesh centroid as fallback for faces with missing vertex normals
  let centX = 0, centY = 0, centZ = 0;
  const vertCount = pos.length / 3;
  for (let i = 0; i < pos.length; i += 3) {
    centX += pos[i]; centY += pos[i + 1]; centZ += pos[i + 2];
  }
  centX /= vertCount; centY /= vertCount; centZ /= vertCount;

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

    // Ensure normal points outward.
    // Skinned mesh bone transforms can flip triangle winding, producing
    // inward-facing normals that cause collision to push particles INTO the body.
    if (vtxNormals) {
      // Use vertex normals as reliable orientation hints — these are correctly
      // transformed through the bone pipeline and work for non-convex meshes.
      const vnx = vtxNormals[i0 * 3] + vtxNormals[i1 * 3] + vtxNormals[i2 * 3];
      const vny = vtxNormals[i0 * 3 + 1] + vtxNormals[i1 * 3 + 1] + vtxNormals[i2 * 3 + 1];
      const vnz = vtxNormals[i0 * 3 + 2] + vtxNormals[i1 * 3 + 2] + vtxNormals[i2 * 3 + 2];
      const vnDot = vnx * nx + vny * ny + vnz * nz;
      if (vnDot < -1e-6) {
        // Vertex normals disagree with face normal — flip
        nx = -nx; ny = -ny; nz = -nz;
      } else if (vnDot > 1e-6) {
        // Vertex normals agree — keep face normal as-is
      } else {
        // Vertex normals are zero/degenerate — fall back to centroid heuristic
        const triCx = (ax + bx + cx) / 3 - centX;
        const triCy = (ay + by + cy) / 3 - centY;
        const triCz = (az + bz + cz) / 3 - centZ;
        if (triCx * nx + triCy * ny + triCz * nz < 0) {
          nx = -nx; ny = -ny; nz = -nz;
        }
      }
    } else {
      // Fallback: centroid heuristic (less reliable for non-convex meshes)
      const triCx = (ax + bx + cx) / 3 - centX;
      const triCy = (ay + by + cy) / 3 - centY;
      const triCz = (az + bz + cz) / 3 - centZ;
      if (triCx * nx + triCy * ny + triCz * nz < 0) {
        nx = -nx; ny = -ny; nz = -nz;
      }
    }

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
  normals?: Float32Array,
): CollisionMeshData | null {
  if (vertices.length === 0 || indices.length === 0) return null;
  return extractCollisionMesh({
    attributes: {
      position: { array: vertices, count: vertices.length / 3 },
      ...(normals ? { normal: { array: normals } } : {}),
    },
    index: { array: indices, count: indices.length },
  });
}
