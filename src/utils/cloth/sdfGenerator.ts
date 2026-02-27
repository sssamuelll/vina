/**
 * SDF (Signed Distance Field) Generator for Avatar Body Collision
 * 
 * Generates a 3D signed distance field from triangle mesh data.
 * Optimized for Web Worker execution — zero allocations in hot loop,
 * integer-keyed spatial hash, no string operations.
 * 
 * @module sdfGenerator
 */

export interface SDFData {
  distances: Float32Array;
  resolution: number;
  min: [number, number, number];
  max: [number, number, number];
  cellSize: number;
}

// ── Spatial Hash (optimized for performance and collision avoidance) ────────

class IntSpatialHash {
  private readonly buckets: Map<number, Int32Array>;
  private readonly cellInv: number;

  constructor(
    vertices: Float32Array,
    indices: Uint32Array,
    cellSize: number,
    minX: number, minY: number, minZ: number,
    sizeX: number, sizeY: number, sizeZ: number
  ) {
    this.cellInv = 1.0 / cellSize;

    const counts = new Map<number, number>();
    const numTri = indices.length / 3;

    for (let t = 0; t < numTri; t++) {
      const i0 = indices[t * 3] * 3;
      const i1 = indices[t * 3 + 1] * 3;
      const i2 = indices[t * 3 + 2] * 3;

      const cxMin = Math.floor((Math.min(vertices[i0], vertices[i1], vertices[i2]) - minX) * this.cellInv);
      const cxMax = Math.floor((Math.max(vertices[i0], vertices[i1], vertices[i2]) - minX) * this.cellInv);
      const cyMin = Math.floor((Math.min(vertices[i0+1], vertices[i1+1], vertices[i2+1]) - minY) * this.cellInv);
      const cyMax = Math.floor((Math.max(vertices[i0+1], vertices[i1+1], vertices[i2+1]) - minY) * this.cellInv);
      const czMin = Math.floor((Math.min(vertices[i0+2], vertices[i1+2], vertices[i2+2]) - minZ) * this.cellInv);
      const czMax = Math.floor((Math.max(vertices[i0+2], vertices[i1+2], vertices[i2+2]) - minZ) * this.cellInv);

      for (let cx = cxMin; cx <= cxMax; cx++)
        for (let cy = cyMin; cy <= cyMax; cy++)
          for (let cz = czMin; cz <= czMax; cz++) {
            const key = this.getKey(cx, cy, cz);
            counts.set(key, (counts.get(key) || 0) + 1);
          }
    }

    const offsets = new Map<number, number>();
    this.buckets = new Map();
    for (const [key, count] of counts) {
      this.buckets.set(key, new Int32Array(count));
      offsets.set(key, 0);
    }

    for (let t = 0; t < numTri; t++) {
      const i0 = indices[t * 3] * 3;
      const i1 = indices[t * 3 + 1] * 3;
      const i2 = indices[t * 3 + 2] * 3;

      const cxMin = Math.floor((Math.min(vertices[i0], vertices[i1], vertices[i2]) - minX) * this.cellInv);
      const cxMax = Math.floor((Math.max(vertices[i0], vertices[i1], vertices[i2]) - minX) * this.cellInv);
      const cyMin = Math.floor((Math.min(vertices[i0+1], vertices[i1+1], vertices[i2+1]) - minY) * this.cellInv);
      const cyMax = Math.floor((Math.max(vertices[i0+1], vertices[i1+1], vertices[i2+1]) - minY) * this.cellInv);
      const czMin = Math.floor((Math.min(vertices[i0+2], vertices[i1+2], vertices[i2+2]) - minZ) * this.cellInv);
      const czMax = Math.floor((Math.max(vertices[i0+2], vertices[i1+2], vertices[i2+2]) - minZ) * this.cellInv);

      for (let cx = cxMin; cx <= cxMax; cx++)
        for (let cy = cyMin; cy <= cyMax; cy++)
          for (let cz = czMin; cz <= czMax; cz++) {
            const key = this.getKey(cx, cy, cz);
            const arr = this.buckets.get(key)!;
            const off = offsets.get(key)!;
            arr[off] = t;
            offsets.set(key, off + 1);
          }
    }
  }

  /**
   * Robust 3D integer hashing.
   * Offsets negatives and uses primes to avoid collisions in a 1024^3 virtual grid.
   */
  private getKey(cx: number, cy: number, cz: number): number {
    // Offset by 512 to handle points slightly outside the padded box
    const x = (cx + 512) & 1023;
    const y = (cy + 512) & 1023;
    const z = (cz + 512) & 1023;
    return (x << 20) | (y << 10) | z;
  }

  query(
    px: number, py: number, pz: number,
    minX: number, minY: number, minZ: number,
    out: Int32Array, seen: Uint8Array, seenStamp: number
  ): number {
    const cx = Math.floor((px - minX) * this.cellInv);
    const cy = Math.floor((py - minY) * this.cellInv);
    const cz = Math.floor((pz - minZ) * this.cellInv);
    let count = 0;

    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (let dz = -1; dz <= 1; dz++) {
          const key = this.getKey(cx + dx, cy + dy, cz + dz);
          const bucket = this.buckets.get(key);
          if (!bucket) continue;
          for (let i = 0, len = bucket.length; i < len; i++) {
            const triIdx = bucket[i];
            if (seen[triIdx] !== seenStamp) {
              seen[triIdx] = seenStamp;
              out[count++] = triIdx;
            }
          }
        }

    return count;
  }
}

// ── Point-to-triangle (zero allocation) ───────────────────────────

// Shared scratch arrays to avoid per-call allocation
const _cp = new Float64Array(3); // closest point result

/**
 * Compute unsigned distance from point to triangle + dot with normal for sign.
 * Returns [distance, normalDot] — no object allocation.
 */
function ptTriDist(
  px: number, py: number, pz: number,
  vertices: Float32Array, i0: number, i1: number, i2: number
): [number, number] {
  const ax = vertices[i0], ay = vertices[i0+1], az = vertices[i0+2];
  const bx = vertices[i1], by = vertices[i1+1], bz = vertices[i1+2];
  const cx = vertices[i2], cy = vertices[i2+1], cz = vertices[i2+2];

  const abx = bx-ax, aby = by-ay, abz = bz-az;
  const acx = cx-ax, acy = cy-ay, acz = cz-az;
  const apx = px-ax, apy = py-ay, apz = pz-az;

  // Normal
  const nx = aby*acz - abz*acy;
  const ny = abz*acx - abx*acz;
  const nz = abx*acy - aby*acx;
  const nlen = Math.sqrt(nx*nx + ny*ny + nz*nz);

  if (nlen < 1e-12) {
    const d = Math.sqrt(apx*apx + apy*apy + apz*apz);
    return [d, 1];
  }

  const nnx = nx/nlen, nny = ny/nlen, nnz = nz/nlen;
  const dot = apx*nnx + apy*nny + apz*nnz;

  // Project onto plane
  const projx = px - dot*nnx;
  const projy = py - dot*nny;
  const projz = pz - dot*nnz;

  // Barycentric
  const v0x = projx-ax, v0y = projy-ay, v0z = projz-az;
  const d00 = abx*abx + aby*aby + abz*abz;
  const d01 = abx*acx + aby*acy + abz*acz;
  const d02 = abx*v0x + aby*v0y + abz*v0z;
  const d11 = acx*acx + acy*acy + acz*acz;
  const d12 = acx*v0x + acy*v0y + acz*v0z;
  const invD = 1.0 / (d00*d11 - d01*d01);
  const u = (d11*d02 - d01*d12) * invD;
  const v = (d00*d12 - d01*d02) * invD;

  if (u >= 0 && v >= 0 && u+v <= 1) {
    // Inside triangle — distance is |dot| (perpendicular)
    return [Math.abs(dot), dot];
  }

  // Closest on edges
  let minDsq = Infinity;

  // Edge AB
  const t1d = abx*abx + aby*aby + abz*abz;
  if (t1d > 1e-12) {
    const t1 = Math.max(0, Math.min(1, (apx*abx + apy*aby + apz*abz) / t1d));
    const ex = ax+t1*abx - px, ey = ay+t1*aby - py, ez = az+t1*abz - pz;
    const dsq = ex*ex + ey*ey + ez*ez;
    if (dsq < minDsq) { minDsq = dsq; _cp[0] = ax+t1*abx; _cp[1] = ay+t1*aby; _cp[2] = az+t1*abz; }
  }

  // Edge AC
  const t2d = acx*acx + acy*acy + acz*acz;
  if (t2d > 1e-12) {
    const t2 = Math.max(0, Math.min(1, (apx*acx + apy*acy + apz*acz) / t2d));
    const ex = ax+t2*acx - px, ey = ay+t2*acy - py, ez = az+t2*acz - pz;
    const dsq = ex*ex + ey*ey + ez*ez;
    if (dsq < minDsq) { minDsq = dsq; _cp[0] = ax+t2*acx; _cp[1] = ay+t2*acy; _cp[2] = az+t2*acz; }
  }

  // Edge BC
  const bcx = cx-bx, bcy = cy-by, bcz = cz-bz;
  const bpx = px-bx, bpy = py-by, bpz = pz-bz;
  const t3d = bcx*bcx + bcy*bcy + bcz*bcz;
  if (t3d > 1e-12) {
    const t3 = Math.max(0, Math.min(1, (bpx*bcx + bpy*bcy + bpz*bcz) / t3d));
    const ex = bx+t3*bcx - px, ey = by+t3*bcy - py, ez = bz+t3*bcz - pz;
    const dsq = ex*ex + ey*ey + ez*ez;
    if (dsq < minDsq) { minDsq = dsq; _cp[0] = bx+t3*bcx; _cp[1] = by+t3*bcy; _cp[2] = bz+t3*bcz; }
  }

  const dist = Math.sqrt(minDsq);
  const ndot = (px - _cp[0])*nnx + (py - _cp[1])*nny + (pz - _cp[2])*nnz;
  return [dist, ndot];
}

// ── Main SDF Generator ────────────────────────────────────────────

export function generateSDF(vertices: Float32Array, indices: Uint32Array, resolution: number): SDFData | null {
  if (vertices.length < 9 || indices.length < 3) return null;

  const numVerts = vertices.length / 3;
  const numTri = indices.length / 3;

  // Bounding box
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < numVerts; i++) {
    const x = vertices[i*3], y = vertices[i*3+1], z = vertices[i*3+2];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }

  // 10% padding (was 5cm fixed — percentage scales better)
  const pad = Math.max(maxX-minX, maxY-minY, maxZ-minZ) * 0.1;
  minX -= pad; minY -= pad; minZ -= pad;
  maxX += pad; maxY += pad; maxZ += pad;

  const sizeX = maxX-minX, sizeY = maxY-minY, sizeZ = maxZ-minZ;
  const maxSize = Math.max(sizeX, sizeY, sizeZ);
  const cellSize = maxSize / (resolution - 1);

  // Make cubic
  const cx = (minX+maxX)*0.5, cy = (minY+maxY)*0.5, cz = (minZ+maxZ)*0.5;
  const half = maxSize * 0.5;
  const sdfMin: [number, number, number] = [cx-half, cy-half, cz-half];
  const sdfMax: [number, number, number] = [cx+half, cy+half, cz+half];

  // Spatial hash — cell size = 4× SDF cell for good coverage
  const hashCellSize = cellSize * 4;
  const hash = new IntSpatialHash(
    vertices, indices, hashCellSize,
    sdfMin[0], sdfMin[1], sdfMin[2],
    maxSize, maxSize, maxSize
  );

  // Pre-allocate query buffers
  const queryOut = new Int32Array(numTri); // worst case
  const seen = new Uint8Array(numTri);
  let seenStamp = 1;

  const distances = new Float32Array(resolution * resolution * resolution);
  const res2 = resolution * resolution;

  for (let zi = 0; zi < resolution; zi++) {
    const z = sdfMin[2] + zi * cellSize;
    for (let yi = 0; yi < resolution; yi++) {
      const y = sdfMin[1] + yi * cellSize;
      for (let xi = 0; xi < resolution; xi++) {
        const x = sdfMin[0] + xi * cellSize;

        // Bump stamp (avoids clearing `seen` array — wraps at 255)
        seenStamp++;
        if (seenStamp > 250) { seenStamp = 1; seen.fill(0); }

        const nearCount = hash.query(x, y, z, sdfMin[0], sdfMin[1], sdfMin[2], queryOut, seen, seenStamp);

        let minDist = Infinity;
        let bestDot = 1.0;

        if (nearCount > 0) {
          for (let qi = 0; qi < nearCount; qi++) {
            const t = queryOut[qi];
            const [dist, ndot] = ptTriDist(
              x, y, z,
              vertices,
              indices[t*3] * 3,
              indices[t*3+1] * 3,
              indices[t*3+2] * 3
            );
            if (dist < minDist) {
              minDist = dist;
              bestDot = ndot;
            }
          }
        } else {
          // Fallback: brute force (should rarely happen with good hash cell size)
          // Log only once per generation to avoid flooding
          if (zi === 0 && yi === 0 && xi === 0) {
            console.warn('[sdfGenerator] Hash query returned 0 triangles, falling back to brute force (O(N)). Grid resolution:', resolution);
          }
          for (let t = 0; t < numTri; t++) {
            const [dist, ndot] = ptTriDist(
              x, y, z,
              vertices,
              indices[t*3] * 3,
              indices[t*3+1] * 3,
              indices[t*3+2] * 3
            );
            if (dist < minDist) {
              minDist = dist;
              bestDot = ndot;
            }
          }
        }

        // Sign: positive outside (normal dot > 0), negative inside
        distances[zi * res2 + yi * resolution + xi] = bestDot > 0 ? minDist : -minDist;
      }
    }
  }

  return { distances, resolution, min: sdfMin, max: sdfMax, cellSize };
}

// ── SDF Sampling ──────────────────────────────────────────────────

export function sampleSDF(sdf: SDFData, point: [number, number, number]): number {
  const { distances, resolution, min, cellSize } = sdf;
  const gx = (point[0] - min[0]) / cellSize;
  const gy = (point[1] - min[1]) / cellSize;
  const gz = (point[2] - min[2]) / cellSize;

  if (gx < 0 || gx >= resolution-1 || gy < 0 || gy >= resolution-1 || gz < 0 || gz >= resolution-1) return 1.0;

  const x0 = Math.floor(gx), y0 = Math.floor(gy), z0 = Math.floor(gz);
  const x1 = x0+1, y1 = y0+1, z1 = z0+1;
  const fx = gx-x0, fy = gy-y0, fz = gz-z0;
  const r = resolution, r2 = r*r;

  const c000 = distances[z0*r2 + y0*r + x0];
  const c100 = distances[z0*r2 + y0*r + x1];
  const c010 = distances[z0*r2 + y1*r + x0];
  const c110 = distances[z0*r2 + y1*r + x1];
  const c001 = distances[z1*r2 + y0*r + x0];
  const c101 = distances[z1*r2 + y0*r + x1];
  const c011 = distances[z1*r2 + y1*r + x0];
  const c111 = distances[z1*r2 + y1*r + x1];

  const c00 = c000*(1-fx) + c100*fx;
  const c01 = c001*(1-fx) + c101*fx;
  const c10 = c010*(1-fx) + c110*fx;
  const c11 = c011*(1-fx) + c111*fx;
  const c0 = c00*(1-fy) + c10*fy;
  const c1 = c01*(1-fy) + c11*fy;
  return c0*(1-fz) + c1*fz;
}

export function sdfGradient(sdf: SDFData, point: [number, number, number]): [number, number, number] {
  const h = sdf.cellSize * 0.5;
  const dx = (sampleSDF(sdf, [point[0]+h, point[1], point[2]]) - sampleSDF(sdf, [point[0]-h, point[1], point[2]])) / (2*h);
  const dy = (sampleSDF(sdf, [point[0], point[1]+h, point[2]]) - sampleSDF(sdf, [point[0], point[1]-h, point[2]])) / (2*h);
  const dz = (sampleSDF(sdf, [point[0], point[1], point[2]+h]) - sampleSDF(sdf, [point[0], point[1], point[2]-h])) / (2*h);
  const len = Math.sqrt(dx*dx + dy*dy + dz*dz);
  return len < 1e-12 ? [0, 1, 0] : [dx/len, dy/len, dz/len];
}
