/**
 * Triangle Mesh Collision — worker-side body collision solver.
 * @module triangleCollision
 */

import type { CollisionMeshData } from './collisionMesh';

export interface PtTriResult {
  dist: number;
  side: number;
  nx: number;
  ny: number;
  nz: number;
}

export function pointToTriangleDist(
  px: number, py: number, pz: number,
  vertices: Float32Array, vOff: number,
  normals: Float32Array, nOff: number,
): PtTriResult {
  const ax = vertices[vOff],     ay = vertices[vOff + 1], az = vertices[vOff + 2];
  const bx = vertices[vOff + 3], by = vertices[vOff + 4], bz = vertices[vOff + 5];
  const cx = vertices[vOff + 6], cy = vertices[vOff + 7], cz = vertices[vOff + 8];

  const nnx = normals[nOff], nny = normals[nOff + 1], nnz = normals[nOff + 2];

  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const acx = cx - ax, acy = cy - ay, acz = cz - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;

  const dot = apx * nnx + apy * nny + apz * nnz;

  const projx = px - dot * nnx;
  const projy = py - dot * nny;
  const projz = pz - dot * nnz;

  const v0x = projx - ax, v0y = projy - ay, v0z = projz - az;
  const d00 = abx * abx + aby * aby + abz * abz;
  const d01 = abx * acx + aby * acy + abz * acz;
  const d02 = abx * v0x + aby * v0y + abz * v0z;
  const d11 = acx * acx + acy * acy + acz * acz;
  const d12 = acx * v0x + acy * v0y + acz * v0z;
  const denom = d00 * d11 - d01 * d01;

  if (Math.abs(denom) < 1e-12) {
    const d = Math.sqrt(apx * apx + apy * apy + apz * apz);
    return { dist: d, side: 1, nx: nnx, ny: nny, nz: nnz };
  }

  const invD = 1.0 / denom;
  const u = (d11 * d02 - d01 * d12) * invD;
  const v = (d00 * d12 - d01 * d02) * invD;

  if (u >= 0 && v >= 0 && u + v <= 1) {
    return { dist: Math.abs(dot), side: dot, nx: nnx, ny: nny, nz: nnz };
  }

  let minDsq = Infinity;
  let cpx = ax, cpy = ay, cpz = az;

  const abLenSq = abx * abx + aby * aby + abz * abz;
  if (abLenSq > 1e-12) {
    const t = Math.max(0, Math.min(1, (apx * abx + apy * aby + apz * abz) / abLenSq));
    const ex = ax + t * abx, ey = ay + t * aby, ez = az + t * abz;
    const dx = px - ex, dy = py - ey, dz = pz - ez;
    const dsq = dx * dx + dy * dy + dz * dz;
    if (dsq < minDsq) { minDsq = dsq; cpx = ex; cpy = ey; cpz = ez; }
  }

  const acLenSq = acx * acx + acy * acy + acz * acz;
  if (acLenSq > 1e-12) {
    const t = Math.max(0, Math.min(1, (apx * acx + apy * acy + apz * acz) / acLenSq));
    const ex = ax + t * acx, ey = ay + t * acy, ez = az + t * acz;
    const dx = px - ex, dy = py - ey, dz = pz - ez;
    const dsq = dx * dx + dy * dy + dz * dz;
    if (dsq < minDsq) { minDsq = dsq; cpx = ex; cpy = ey; cpz = ez; }
  }

  const bcx = cx - bx, bcy = cy - by, bcz = cz - bz;
  const bpx = px - bx, bpy = py - by, bpz = pz - bz;
  const bcLenSq = bcx * bcx + bcy * bcy + bcz * bcz;
  if (bcLenSq > 1e-12) {
    const t = Math.max(0, Math.min(1, (bpx * bcx + bpy * bcy + bpz * bcz) / bcLenSq));
    const ex = bx + t * bcx, ey = by + t * bcy, ez = bz + t * bcz;
    const dx = px - ex, dy = py - ey, dz = pz - ez;
    const dsq = dx * dx + dy * dy + dz * dz;
    if (dsq < minDsq) { minDsq = dsq; cpx = ex; cpy = ey; cpz = ez; }
  }

  const dist = Math.sqrt(minDsq);
  const edgeSide = (px - cpx) * nnx + (py - cpy) * nny + (pz - cpz) * nnz;
  return { dist, side: edgeSide, nx: nnx, ny: nny, nz: nnz };
}

/**
 * Spatial hash for triangle-vs-particle collision (cloth ↔ kinematic body).
 *
 * Domain: indexed by triangle ID; AABB-expanded grid over a static triangle
 * mesh. Built once per kinematic body, immutable for the body's lifetime.
 * Storage shape: `Map<key, Int32Array>` per-bucket.
 *
 * Distinct from `SpatialHashGrid` (selfCollision.ts) which indexes particle
 * IDs for self-collision and rebuilds every frame. See A4 Fase 2
 * (`docs/reports/2026-05-02-drift-fase2-a4-cross-language-geometry-mesh.md`
 * § 2.4) for the role separation ratification.
 *
 * Shared between CPU + WASM solver tiers (xpbdSolver.ts + wasmSolverWorker.ts).
 */
export class TriangleSpatialHash {
  private readonly buckets: Map<number, Int32Array>;
  private readonly cellInv: number;
  private readonly minX: number;
  private readonly minY: number;
  private readonly minZ: number;
  private readonly seen: Uint8Array;
  private seenStamp = 0;
  private readonly out: Int32Array;

  constructor(mesh: CollisionMeshData, cellSize: number) {
    if (mesh.triCount < 0) {
      throw new Error(`Invalid collision mesh: triCount must be non-negative, got ${mesh.triCount}`);
    }
    const requiredVerts = mesh.triCount * 9;
    if (mesh.vertices.length < requiredVerts) {
      throw new Error(
        `Invalid collision mesh: vertices.length (${mesh.vertices.length}) < triCount * 9 (${requiredVerts}). ` +
        `Mesh data is truncated or triCount is wrong.`,
      );
    }
    const requiredNormals = mesh.triCount * 3;
    if (mesh.normals.length < requiredNormals) {
      throw new Error(
        `Invalid collision mesh: normals.length (${mesh.normals.length}) < triCount * 3 (${requiredNormals}). ` +
        `Mesh data is truncated or triCount is wrong.`,
      );
    }

    this.cellInv = 1.0 / cellSize;

    let bMinX = Infinity, bMinY = Infinity, bMinZ = Infinity;
    for (let i = 0; i < mesh.vertices.length; i += 3) {
      if (mesh.vertices[i] < bMinX) bMinX = mesh.vertices[i];
      if (mesh.vertices[i + 1] < bMinY) bMinY = mesh.vertices[i + 1];
      if (mesh.vertices[i + 2] < bMinZ) bMinZ = mesh.vertices[i + 2];
    }
    this.minX = bMinX - cellSize;
    this.minY = bMinY - cellSize;
    this.minZ = bMinZ - cellSize;

    const counts = new Map<number, number>();
    for (let t = 0; t < mesh.triCount; t++) {
      const off = t * 9;
      const xMin = Math.min(mesh.vertices[off], mesh.vertices[off + 3], mesh.vertices[off + 6]);
      const xMax = Math.max(mesh.vertices[off], mesh.vertices[off + 3], mesh.vertices[off + 6]);
      const yMin = Math.min(mesh.vertices[off + 1], mesh.vertices[off + 4], mesh.vertices[off + 7]);
      const yMax = Math.max(mesh.vertices[off + 1], mesh.vertices[off + 4], mesh.vertices[off + 7]);
      const zMin = Math.min(mesh.vertices[off + 2], mesh.vertices[off + 5], mesh.vertices[off + 8]);
      const zMax = Math.max(mesh.vertices[off + 2], mesh.vertices[off + 5], mesh.vertices[off + 8]);

      const cxMin = Math.floor((xMin - this.minX) * this.cellInv);
      const cxMax = Math.floor((xMax - this.minX) * this.cellInv);
      const cyMin = Math.floor((yMin - this.minY) * this.cellInv);
      const cyMax = Math.floor((yMax - this.minY) * this.cellInv);
      const czMin = Math.floor((zMin - this.minZ) * this.cellInv);
      const czMax = Math.floor((zMax - this.minZ) * this.cellInv);

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

    for (let t = 0; t < mesh.triCount; t++) {
      const off = t * 9;
      const xMin = Math.min(mesh.vertices[off], mesh.vertices[off + 3], mesh.vertices[off + 6]);
      const xMax = Math.max(mesh.vertices[off], mesh.vertices[off + 3], mesh.vertices[off + 6]);
      const yMin = Math.min(mesh.vertices[off + 1], mesh.vertices[off + 4], mesh.vertices[off + 7]);
      const yMax = Math.max(mesh.vertices[off + 1], mesh.vertices[off + 4], mesh.vertices[off + 7]);
      const zMin = Math.min(mesh.vertices[off + 2], mesh.vertices[off + 5], mesh.vertices[off + 8]);
      const zMax = Math.max(mesh.vertices[off + 2], mesh.vertices[off + 5], mesh.vertices[off + 8]);

      const cxMin = Math.floor((xMin - this.minX) * this.cellInv);
      const cxMax = Math.floor((xMax - this.minX) * this.cellInv);
      const cyMin = Math.floor((yMin - this.minY) * this.cellInv);
      const cyMax = Math.floor((yMax - this.minY) * this.cellInv);
      const czMin = Math.floor((zMin - this.minZ) * this.cellInv);
      const czMax = Math.floor((zMax - this.minZ) * this.cellInv);

      for (let cx = cxMin; cx <= cxMax; cx++)
        for (let cy = cyMin; cy <= cyMax; cy++)
          for (let cz = czMin; cz <= czMax; cz++) {
            const key = this.getKey(cx, cy, cz);
            const arr = this.buckets.get(key)!;
            const o = offsets.get(key)!;
            arr[o] = t;
            offsets.set(key, o + 1);
          }
    }

    this.seen = new Uint8Array(Math.max(1, mesh.triCount));
    this.out = new Int32Array(Math.max(1, mesh.triCount));
  }

  query(px: number, py: number, pz: number): Int32Array {
    this.seenStamp++;
    if (this.seenStamp > 254) {
      this.seenStamp = 1;
      this.seen.fill(0);
    }

    const cx = Math.floor((px - this.minX) * this.cellInv);
    const cy = Math.floor((py - this.minY) * this.cellInv);
    const cz = Math.floor((pz - this.minZ) * this.cellInv);
    let count = 0;

    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (let dz = -1; dz <= 1; dz++) {
          const key = this.getKey(cx + dx, cy + dy, cz + dz);
          const bucket = this.buckets.get(key);
          if (!bucket) continue;
          for (let i = 0, len = bucket.length; i < len; i++) {
            const triIdx = bucket[i];
            if (this.seen[triIdx] !== this.seenStamp) {
              this.seen[triIdx] = this.seenStamp;
              this.out[count++] = triIdx;
            }
          }
        }

    return this.out.subarray(0, count);
  }

  private getKey(cx: number, cy: number, cz: number): number {
    const x = (cx + 512) & 1023;
    const y = (cy + 512) & 1023;
    const z = (cz + 512) & 1023;
    return (x << 20) | (y << 10) | z;
  }
}

/** Maximum displacement per collision correction (meters). Prevents NaN cascade. */
const MAX_PUSH_DIST = 0.05;

export function solveTriangleCollision(
  pos: Float32Array,
  invMass: Float32Array,
  numParticles: number,
  mesh: CollisionMeshData,
  hash: TriangleSpatialHash,
  collisionMargin: number,
  friction: number = 0,
  prevPos?: Float32Array,
  marginPerVertex?: Float32Array,
): void {
  for (let p = 0; p < numParticles; p++) {
    if (invMass[p] === 0) continue;

    const pi = p * 3;
    const px = pos[pi], py = pos[pi + 1], pz = pos[pi + 2];

    // Skip NaN particles — they can't be recovered by collision
    if (px !== px || py !== py || pz !== pz) continue;

    const nearby = hash.query(px, py, pz);

    if (nearby.length === 0) continue;

    let minDist = Infinity;
    let bestNx = 0, bestNy = 0, bestNz = 0;
    let bestSide = 1;

    for (let i = 0; i < nearby.length; i++) {
      const triIdx = nearby[i];
      const result = pointToTriangleDist(
        px, py, pz,
        mesh.vertices, triIdx * 9,
        mesh.normals, triIdx * 3,
      );
      if (result.dist < minDist) {
        minDist = result.dist;
        bestNx = result.nx;
        bestNy = result.ny;
        bestNz = result.nz;
        bestSide = result.side;
      }
    }

    const margin = marginPerVertex ? marginPerVertex[p] : collisionMargin;
    if (bestSide < 0 || minDist < margin) {
      let pushDist = bestSide < 0
        ? margin + minDist
        : margin - minDist;

      // Clamp to prevent extreme displacements that cause NaN cascade
      if (pushDist > MAX_PUSH_DIST) pushDist = MAX_PUSH_DIST;

      pos[pi]     += bestNx * pushDist;
      pos[pi + 1] += bestNy * pushDist;
      pos[pi + 2] += bestNz * pushDist;

      // Hybrid Coulomb friction with stiction (#902).
      //   scale = min(1, max(friction, friction*pushDist/|t|))
      // The max(friction, …) keeps the old kinetic floor (≥friction of the
      // tangential slide is always removed) so the garment doesn't slide off
      // during the high-motion settling phase. The depth-budgeted Coulomb term
      // raises scale toward 1 as motion slows: at rest the residual slide is
      // removed in full (stiction), killing the creep. scale ∈ [friction, 1]
      // ≤ 1 → never injects energy (PBD-safe). Mirror: gpu/tslCollision.ts.
      if (friction > 0 && prevPos) {
        const dx = pos[pi] - prevPos[pi];
        const dy = pos[pi + 1] - prevPos[pi + 1];
        const dz = pos[pi + 2] - prevPos[pi + 2];
        const vn = dx * bestNx + dy * bestNy + dz * bestNz;
        const tx = dx - vn * bestNx;
        const ty = dy - vn * bestNy;
        const tz = dz - vn * bestNz;
        const tLen = Math.sqrt(tx * tx + ty * ty + tz * tz);
        const scale = Math.min(1, Math.max(friction, (friction * pushDist) / Math.max(tLen, 1e-8)));
        pos[pi]     -= tx * scale;
        pos[pi + 1] -= ty * scale;
        pos[pi + 2] -= tz * scale;
      }
    }
  }
}
