# BVH-Based Body Collision — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace SDF-based body collision with triangle-mesh collision using three-mesh-bvh, enabling instant pose changes and avatar animation.

**Architecture:** Main thread builds BVH via three-mesh-bvh on avatar load, extracts flat triangle vertices + face normals into `CollisionMeshData`, transfers to worker. Worker builds `IntSpatialHash` over triangles once per pose, then each substep queries nearby triangles per particle and pushes penetrating particles along face normals. Replaces SDF sampling entirely.

**Tech Stack:** three-mesh-bvh, TypeScript, Vitest, Web Workers

---

### Task 1: Add three-mesh-bvh as Direct Dependency

`three-mesh-bvh` is already installed transitively via `@react-three/drei`, but we need it as a direct dependency for explicit version control.

**Files:**
- Modify: `package.json`

**Step 1: Install the dependency**

```bash
npm install three-mesh-bvh
```

**Step 2: Verify the import works**

```bash
node -e "require('three-mesh-bvh')" 2>&1 || echo "CJS failed, checking ESM..."
npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors related to three-mesh-bvh resolution.

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): add three-mesh-bvh as direct dependency"
```

---

### Task 2: CollisionMeshData Type + Extraction Utility

Create the data type that replaces `SDFData` and the function that extracts flat triangle data from a Three.js `BufferGeometry`.

**Files:**
- Create: `src/utils/cloth/collisionMesh.ts`
- Test: `src/utils/cloth/__tests__/collisionMesh.test.ts`

**Step 1: Write the failing tests**

Create `src/utils/cloth/__tests__/collisionMesh.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { extractCollisionMesh, type CollisionMeshData } from '../collisionMesh';

/**
 * Helper: create a minimal indexed BufferGeometry-like object.
 * A single triangle: A(0,0,0), B(1,0,0), C(0,1,0).
 */
function makeSingleTriGeometry() {
  return {
    attributes: {
      position: {
        array: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
        count: 3,
      },
    },
    index: { array: new Uint32Array([0, 1, 2]), count: 3 },
  };
}

/**
 * Helper: two-triangle quad.
 * A(0,0,0), B(1,0,0), C(1,1,0), D(0,1,0)
 * Tri 0: A,B,C — Tri 1: A,C,D
 */
function makeQuadGeometry() {
  return {
    attributes: {
      position: {
        array: new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]),
        count: 4,
      },
    },
    index: { array: new Uint32Array([0, 1, 2, 0, 2, 3]), count: 6 },
  };
}

describe('extractCollisionMesh', () => {
  it('extracts vertices from a single triangle', () => {
    const geo = makeSingleTriGeometry();
    const result = extractCollisionMesh(geo as any);

    expect(result.triCount).toBe(1);
    expect(result.vertices.length).toBe(9); // 1 tri × 9 floats
    // Vertices should be [0,0,0, 1,0,0, 0,1,0]
    expect(result.vertices[0]).toBe(0);
    expect(result.vertices[3]).toBe(1);
    expect(result.vertices[7]).toBe(1);
  });

  it('computes face normals correctly for XY-plane triangle', () => {
    const geo = makeSingleTriGeometry();
    const result = extractCollisionMesh(geo as any);

    expect(result.normals.length).toBe(3); // 1 tri × 3 floats
    // Normal of (0,0,0)→(1,0,0)→(0,1,0) is (0,0,1)
    expect(result.normals[0]).toBeCloseTo(0);
    expect(result.normals[1]).toBeCloseTo(0);
    expect(result.normals[2]).toBeCloseTo(1);
  });

  it('extracts correct triangle count for quad', () => {
    const geo = makeQuadGeometry();
    const result = extractCollisionMesh(geo as any);

    expect(result.triCount).toBe(2);
    expect(result.vertices.length).toBe(18); // 2 tri × 9
    expect(result.normals.length).toBe(6);   // 2 tri × 3
  });

  it('returns zero triCount for empty geometry', () => {
    const geo = {
      attributes: { position: { array: new Float32Array([]), count: 0 } },
      index: { array: new Uint32Array([]), count: 0 },
    };
    const result = extractCollisionMesh(geo as any);
    expect(result.triCount).toBe(0);
    expect(result.vertices.length).toBe(0);
    expect(result.normals.length).toBe(0);
  });

  it('handles non-indexed geometry (no index)', () => {
    const geo = {
      attributes: {
        position: {
          array: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
          count: 3,
        },
      },
      index: null,
    };
    const result = extractCollisionMesh(geo as any);
    expect(result.triCount).toBe(1);
    expect(result.vertices.length).toBe(9);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/cloth/__tests__/collisionMesh.test.ts`
Expected: FAIL — cannot find module `../collisionMesh`

**Step 3: Write the implementation**

Create `src/utils/cloth/collisionMesh.ts`:

```typescript
/**
 * Collision Mesh Data — flat triangle representation for worker-side collision.
 *
 * Replaces SDFData for body collision. Extracted on main thread from
 * Three.js BufferGeometry, transferred to worker via postMessage.
 *
 * @module collisionMesh
 */

/** Flat triangle data for transfer to collision worker. */
export interface CollisionMeshData {
  /** Flat triangle vertices: [ax,ay,az, bx,by,bz, cx,cy,cz, ...] */
  vertices: Float32Array;
  /** Per-triangle unit face normals: [nx,ny,nz, ...] */
  normals: Float32Array;
  /** Number of triangles */
  triCount: number;
}

/**
 * Extract flat triangle vertices + face normals from a BufferGeometry.
 *
 * Works with both indexed and non-indexed geometry.
 * The returned arrays are compact — ready for postMessage transfer.
 */
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

    // Copy triangle vertices
    const ax = pos[i0 * 3], ay = pos[i0 * 3 + 1], az = pos[i0 * 3 + 2];
    const bx = pos[i1 * 3], by = pos[i1 * 3 + 1], bz = pos[i1 * 3 + 2];
    const cx = pos[i2 * 3], cy = pos[i2 * 3 + 1], cz = pos[i2 * 3 + 2];

    const off = i * 9;
    vertices[off]     = ax; vertices[off + 1] = ay; vertices[off + 2] = az;
    vertices[off + 3] = bx; vertices[off + 4] = by; vertices[off + 5] = bz;
    vertices[off + 6] = cx; vertices[off + 7] = cy; vertices[off + 8] = cz;

    // Face normal via edge cross product: (B-A) × (C-A), normalized
    const abx = bx - ax, aby = by - ay, abz = bz - az;
    const acx = cx - ax, acy = cy - ay, acz = cz - az;
    let nx = aby * acz - abz * acy;
    let ny = abz * acx - abx * acz;
    let nz = abx * acy - aby * acx;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (len > 1e-12) {
      nx /= len; ny /= len; nz /= len;
    } else {
      nx = 0; ny = 1; nz = 0; // Degenerate — default up
    }

    const noff = i * 3;
    normals[noff] = nx; normals[noff + 1] = ny; normals[noff + 2] = nz;
  }

  return { vertices, normals, triCount };
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/utils/cloth/__tests__/collisionMesh.test.ts`
Expected: 5 tests PASS

**Step 5: Commit**

```bash
git add src/utils/cloth/collisionMesh.ts src/utils/cloth/__tests__/collisionMesh.test.ts
git commit -m "feat(collision): add CollisionMeshData type and extraction utility"
```

---

### Task 3: Triangle Collision Solver (Worker-Side)

Create the per-particle triangle collision function. This replaces the SDF sampling loop in `xpbdSolver.ts:917-942`. Uses the existing `IntSpatialHash` pattern from `sdfGenerator.ts:21-126` adapted for flat triangle arrays, and extracts the `ptTriDist` function from `sdfGenerator.ts:137-219`.

**Files:**
- Create: `src/utils/cloth/triangleCollision.ts`
- Test: `src/utils/cloth/__tests__/triangleCollision.test.ts`

**Step 1: Write the failing tests**

Create `src/utils/cloth/__tests__/triangleCollision.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  TriangleSpatialHash,
  solveTriangleCollision,
  pointToTriangleDist,
} from '../triangleCollision';
import type { CollisionMeshData } from '../collisionMesh';

/** Single triangle in XY plane at z=0. Vertices: (0,0,0), (1,0,0), (0,1,0). */
function makeFloorTriangle(): CollisionMeshData {
  const vertices = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const normals = new Float32Array([0, 0, 1]); // points in +Z
  return { vertices, normals, triCount: 1 };
}

/** Large horizontal floor at y=0 for collision tests. */
function makeFloorPlane(): CollisionMeshData {
  // Two triangles forming a 10×10 floor at y=0 in XZ plane
  // Tri 0: (-5,0,-5), (5,0,-5), (5,0,5)
  // Tri 1: (-5,0,-5), (5,0,5), (-5,0,5)
  const vertices = new Float32Array([
    -5, 0, -5,  5, 0, -5,  5, 0, 5,
    -5, 0, -5,  5, 0, 5,  -5, 0, 5,
  ]);
  // Normal: (0,1,0) for both (XZ plane, normal is +Y)
  const normals = new Float32Array([0, 1, 0, 0, 1, 0]);
  return { vertices, normals, triCount: 2 };
}

describe('pointToTriangleDist', () => {
  it('returns zero distance for point on triangle', () => {
    const mesh = makeFloorTriangle();
    const result = pointToTriangleDist(0.25, 0.25, 0, mesh.vertices, 0, mesh.normals, 0);
    expect(result.dist).toBeCloseTo(0, 5);
  });

  it('returns perpendicular distance for point above triangle', () => {
    const mesh = makeFloorTriangle();
    const result = pointToTriangleDist(0.25, 0.25, 0.5, mesh.vertices, 0, mesh.normals, 0);
    expect(result.dist).toBeCloseTo(0.5, 5);
    // Normal dot should be positive (point is on +Z side, normal is +Z)
    expect(result.side).toBeGreaterThan(0);
  });

  it('returns perpendicular distance for point below triangle', () => {
    const mesh = makeFloorTriangle();
    const result = pointToTriangleDist(0.25, 0.25, -0.3, mesh.vertices, 0, mesh.normals, 0);
    expect(result.dist).toBeCloseTo(0.3, 5);
    // Inside = negative side
    expect(result.side).toBeLessThan(0);
  });

  it('returns edge distance for point outside triangle', () => {
    const mesh = makeFloorTriangle();
    // Point at (2, 0, 0) — closest point on triangle is (1, 0, 0)
    const result = pointToTriangleDist(2, 0, 0, mesh.vertices, 0, mesh.normals, 0);
    expect(result.dist).toBeCloseTo(1.0, 5);
  });
});

describe('TriangleSpatialHash', () => {
  it('returns triangle index for nearby query', () => {
    const mesh = makeFloorTriangle();
    const hash = new TriangleSpatialHash(mesh, 0.5);
    const result = hash.query(0.25, 0.25, 0);
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain(0);
  });

  it('returns empty for far-away query', () => {
    const mesh = makeFloorTriangle();
    const hash = new TriangleSpatialHash(mesh, 0.5);
    const result = hash.query(100, 100, 100);
    expect(result.length).toBe(0);
  });

  it('handles multiple triangles', () => {
    const mesh = makeFloorPlane();
    const hash = new TriangleSpatialHash(mesh, 1.0);
    // Query at center — should find both triangles
    const result = hash.query(0, 0, 0);
    expect(result.length).toBe(2);
  });
});

describe('solveTriangleCollision', () => {
  it('pushes particle below floor plane up to collision margin', () => {
    const mesh = makeFloorPlane();
    const hash = new TriangleSpatialHash(mesh, 2.0);
    const margin = 0.005;

    // One particle at y = -0.01 (below floor), above center of floor
    const pos = new Float32Array([0, -0.01, 0]);
    const invMass = new Float32Array([1.0]);

    solveTriangleCollision(pos, invMass, 1, mesh, hash, margin);

    // Should be pushed up to y = margin
    expect(pos[1]).toBeCloseTo(margin, 3);
  });

  it('does not move particle above collision margin', () => {
    const mesh = makeFloorPlane();
    const hash = new TriangleSpatialHash(mesh, 2.0);
    const margin = 0.005;

    // Particle well above floor
    const pos = new Float32Array([0, 1.0, 0]);
    const invMass = new Float32Array([1.0]);

    solveTriangleCollision(pos, invMass, 1, mesh, hash, margin);

    // Should not move
    expect(pos[1]).toBeCloseTo(1.0, 5);
  });

  it('skips pinned particles (invMass === 0)', () => {
    const mesh = makeFloorPlane();
    const hash = new TriangleSpatialHash(mesh, 2.0);
    const margin = 0.005;

    const pos = new Float32Array([0, -0.01, 0]);
    const invMass = new Float32Array([0.0]); // pinned

    solveTriangleCollision(pos, invMass, 1, mesh, hash, margin);

    // Should NOT move — still below floor
    expect(pos[1]).toBeCloseTo(-0.01, 5);
  });

  it('handles multiple particles', () => {
    const mesh = makeFloorPlane();
    const hash = new TriangleSpatialHash(mesh, 2.0);
    const margin = 0.005;

    // 3 particles: one below, one above, one at margin
    const pos = new Float32Array([
      0, -0.02, 0,   // below floor
      0,  1.00, 0,   // well above
      0,  0.003, 0,  // within margin
    ]);
    const invMass = new Float32Array([1.0, 1.0, 1.0]);

    solveTriangleCollision(pos, invMass, 3, mesh, hash, margin);

    expect(pos[1]).toBeCloseTo(margin, 3);   // pushed up
    expect(pos[4]).toBeCloseTo(1.0, 5);      // untouched
    expect(pos[7]).toBeCloseTo(margin, 3);   // pushed to margin
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/cloth/__tests__/triangleCollision.test.ts`
Expected: FAIL — cannot find module `../triangleCollision`

**Step 3: Write the implementation**

Create `src/utils/cloth/triangleCollision.ts`:

```typescript
/**
 * Triangle Mesh Collision — worker-side body collision solver.
 *
 * Replaces SDF sampling with exact point-to-triangle distance.
 * Uses a spatial hash over avatar triangles for O(1) lookups per particle.
 *
 * The `pointToTriangleDist` function is extracted from `sdfGenerator.ts`'s
 * `ptTriDist` and adapted for the flat CollisionMeshData layout.
 *
 * @module triangleCollision
 */

import type { CollisionMeshData } from './collisionMesh';

// ── Point-to-Triangle Distance ──────────────────────────────────────────────

/** Result of a point-to-triangle distance query. */
export interface PtTriResult {
  /** Unsigned distance from point to nearest point on triangle */
  dist: number;
  /** Signed: positive if on normal side, negative if on back side */
  side: number;
  /** Face normal (unit vector) */
  nx: number;
  ny: number;
  nz: number;
}

/**
 * Compute distance from a point to a triangle in flat CollisionMeshData layout.
 *
 * @param px,py,pz - Test point
 * @param vertices - Flat triangle vertices array (9 floats per tri)
 * @param vOff - Byte offset into vertices (triIndex × 9)
 * @param normals - Flat face normals array (3 floats per tri)
 * @param nOff - Byte offset into normals (triIndex × 3)
 */
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

  // Signed perpendicular distance to plane
  const dot = apx * nnx + apy * nny + apz * nnz;

  // Project onto plane
  const projx = px - dot * nnx;
  const projy = py - dot * nny;
  const projz = pz - dot * nnz;

  // Barycentric coordinates of projection
  const v0x = projx - ax, v0y = projy - ay, v0z = projz - az;
  const d00 = abx * abx + aby * aby + abz * abz;
  const d01 = abx * acx + aby * acy + abz * acz;
  const d02 = abx * v0x + aby * v0y + abz * v0z;
  const d11 = acx * acx + acy * acy + acz * acz;
  const d12 = acx * v0x + acy * v0y + acz * v0z;
  const denom = d00 * d11 - d01 * d01;

  if (Math.abs(denom) < 1e-12) {
    // Degenerate triangle
    const d = Math.sqrt(apx * apx + apy * apy + apz * apz);
    return { dist: d, side: 1, nx: nnx, ny: nny, nz: nnz };
  }

  const invD = 1.0 / denom;
  const u = (d11 * d02 - d01 * d12) * invD;
  const v = (d00 * d12 - d01 * d02) * invD;

  if (u >= 0 && v >= 0 && u + v <= 1) {
    // Inside triangle — perpendicular distance
    return { dist: Math.abs(dot), side: dot, nx: nnx, ny: nny, nz: nnz };
  }

  // Outside triangle — find closest point on edges
  let minDsq = Infinity;
  let cpx = ax, cpy = ay, cpz = az;

  // Edge AB
  const abLenSq = abx * abx + aby * aby + abz * abz;
  if (abLenSq > 1e-12) {
    const t = Math.max(0, Math.min(1, (apx * abx + apy * aby + apz * abz) / abLenSq));
    const ex = ax + t * abx, ey = ay + t * aby, ez = az + t * abz;
    const dx = px - ex, dy = py - ey, dz = pz - ez;
    const dsq = dx * dx + dy * dy + dz * dz;
    if (dsq < minDsq) { minDsq = dsq; cpx = ex; cpy = ey; cpz = ez; }
  }

  // Edge AC
  const acLenSq = acx * acx + acy * acy + acz * acz;
  if (acLenSq > 1e-12) {
    const t = Math.max(0, Math.min(1, (apx * acx + apy * acy + apz * acz) / acLenSq));
    const ex = ax + t * acx, ey = ay + t * acy, ez = az + t * acz;
    const dx = px - ex, dy = py - ey, dz = pz - ez;
    const dsq = dx * dx + dy * dy + dz * dz;
    if (dsq < minDsq) { minDsq = dsq; cpx = ex; cpy = ey; cpz = ez; }
  }

  // Edge BC
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

// ── Spatial Hash for Triangles ──────────────────────────────────────────────

/**
 * Spatial hash over flat CollisionMeshData triangles.
 *
 * Adapted from `sdfGenerator.ts`'s `IntSpatialHash` but works with the
 * flat 9-floats-per-triangle layout of CollisionMeshData.
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
    this.cellInv = 1.0 / cellSize;

    // Compute bounding box from flat triangle vertices
    let bMinX = Infinity, bMinY = Infinity, bMinZ = Infinity;
    for (let i = 0; i < mesh.vertices.length; i += 3) {
      if (mesh.vertices[i] < bMinX) bMinX = mesh.vertices[i];
      if (mesh.vertices[i + 1] < bMinY) bMinY = mesh.vertices[i + 1];
      if (mesh.vertices[i + 2] < bMinZ) bMinZ = mesh.vertices[i + 2];
    }
    this.minX = bMinX - cellSize; // Pad by one cell
    this.minY = bMinY - cellSize;
    this.minZ = bMinZ - cellSize;

    // Pass 1: count triangles per cell
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

    // Pass 2: allocate and fill buckets
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

    // Pre-allocate query scratch buffers
    this.seen = new Uint8Array(mesh.triCount);
    this.out = new Int32Array(mesh.triCount);
  }

  /** Query nearby triangle indices for a point. Returns a new array of indices. */
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

// ── Per-Particle Triangle Collision Solver ───────────────────────────────────

/**
 * Solve body collision for all particles against a triangle mesh.
 *
 * For each particle:
 *  1. Query spatial hash for nearby triangles
 *  2. Find closest triangle via `pointToTriangleDist`
 *  3. If particle is penetrating (on back side within margin), push out along face normal
 *
 * @param pos - Particle positions [x,y,z, ...] — MUTATED in-place
 * @param invMass - Inverse masses — 0 = pinned (skipped)
 * @param numParticles - Number of particles
 * @param mesh - Flat triangle collision data
 * @param hash - Spatial hash over mesh triangles
 * @param collisionMargin - Push particles this far from surface (meters)
 */
export function solveTriangleCollision(
  pos: Float32Array,
  invMass: Float32Array,
  numParticles: number,
  mesh: CollisionMeshData,
  hash: TriangleSpatialHash,
  collisionMargin: number,
): void {
  for (let p = 0; p < numParticles; p++) {
    if (invMass[p] === 0) continue; // pinned

    const pi = p * 3;
    const px = pos[pi], py = pos[pi + 1], pz = pos[pi + 2];
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

    // Push out if penetrating or within margin
    // bestSide < 0 means particle is on back side of closest triangle (inside body)
    // bestSide >= 0 but dist < margin means particle is within margin on correct side
    if (bestSide < 0 || minDist < collisionMargin) {
      const pushDist = bestSide < 0
        ? collisionMargin + minDist   // inside: push through surface + margin
        : collisionMargin - minDist;  // outside but too close: push to margin

      pos[pi]     += bestNx * pushDist;
      pos[pi + 1] += bestNy * pushDist;
      pos[pi + 2] += bestNz * pushDist;
    }
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/utils/cloth/__tests__/triangleCollision.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/utils/cloth/triangleCollision.ts src/utils/cloth/__tests__/triangleCollision.test.ts
git commit -m "feat(collision): add triangle collision solver with spatial hash"
```

---

### Task 4: Add solveTriangleCollision to XPBDClothSolver

Wire the new triangle collision into the existing solver. Add a `setCollisionMesh` method and call `solveTriangleCollision` from `solveCollisions()`.

**Files:**
- Modify: `src/utils/cloth/xpbdSolver.ts:13` (imports), `323` (data member), `593-595` (setter), `917-942` (collision block)
- Test: `src/utils/cloth/__tests__/xpbdSolver.test.ts` (add new test section)

**Step 1: Write the failing test**

Add to `src/utils/cloth/__tests__/xpbdSolver.test.ts` (at end of file):

```typescript
describe('Triangle collision (BVH replacement for SDF)', () => {
  it('pushes particle inside body outward when collisionMesh is set', () => {
    // Create a flat ground plane at y=0 — any particle below should be pushed up
    const collisionMesh: import('../collisionMesh').CollisionMeshData = {
      vertices: new Float32Array([
        -5, 0, -5,  5, 0, -5,  5, 0, 5,
        -5, 0, -5,  5, 0, 5,  -5, 0, 5,
      ]),
      normals: new Float32Array([0, 1, 0, 0, 1, 0]),
      triCount: 2,
    };

    const meshData: ClothMeshData = {
      vertices: new Float32Array([0, -0.01, 0]),  // below ground
      triIds: new Int32Array([]),
    };

    const solver = new XPBDClothSolver(meshData);
    solver.setCollisionMesh(collisionMesh);
    solver.step(1 / 60);

    // Particle should have been pushed above ground
    const positions = solver.getPositions();
    expect(positions[1]).toBeGreaterThan(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/cloth/__tests__/xpbdSolver.test.ts -t "Triangle collision"`
Expected: FAIL — `setCollisionMesh` is not a function

**Step 3: Implement changes in xpbdSolver.ts**

3a. Add import at `xpbdSolver.ts:13`:

```typescript
// After existing imports, add:
import type { CollisionMeshData } from './collisionMesh';
import { TriangleSpatialHash, solveTriangleCollision } from './triangleCollision';
```

3b. Add data members after line 323 (`private sdfData: SDFData | null = null;`):

```typescript
  /** Triangle collision mesh data (replaces SDF) */
  private collisionMesh: CollisionMeshData | null = null;
  /** Spatial hash over collision mesh triangles */
  private collisionHash: TriangleSpatialHash | null = null;
```

3c. Add setter method after `setSDF()` (after line 595):

```typescript
  /**
   * Set triangle collision mesh for body collision (replaces SDF).
   *
   * Builds spatial hash over avatar triangles. Call on avatar load
   * and on each pose change.
   *
   * @param mesh - Collision mesh data or null to disable
   */
  setCollisionMesh(mesh: CollisionMeshData | null): void {
    this.collisionMesh = mesh;
    if (mesh && mesh.triCount > 0) {
      // Cell size = 2× cloth thickness for good spatial coverage
      const cellSize = Math.max(0.02, (this.config.clothThickness ?? 0.002) * 10);
      this.collisionHash = new TriangleSpatialHash(mesh, cellSize);
    } else {
      this.collisionHash = null;
    }
  }
```

3d. Add triangle collision block in `solveCollisions()`. After the existing SDF block (line 942), add:

```typescript
    // Triangle mesh collision (replaces SDF — exact distance, supports animation)
    if (this.collisionMesh && this.collisionHash) {
      solveTriangleCollision(
        this.pos,
        this.invMass,
        this.numParticles,
        this.collisionMesh,
        this.collisionHash,
        this.config.collisionMargin ?? 0.005,
      );
    }
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/utils/cloth/__tests__/xpbdSolver.test.ts`
Expected: All existing + new tests PASS

**Step 5: Commit**

```bash
git add src/utils/cloth/xpbdSolver.ts src/utils/cloth/__tests__/xpbdSolver.test.ts
git commit -m "feat(collision): wire triangle collision into XPBDClothSolver"
```

---

### Task 5: Add setCollisionMesh Worker Message (CPU Worker)

Add the `setCollisionMesh` message type and handler to the CPU cloth worker.

**Files:**
- Modify: `src/utils/cloth/clothWorker.ts:30-64` (message types), `295-300` (handler)

**Step 1: Add message type**

At `clothWorker.ts:43`, add a new union member after the `setSDF` line:

```typescript
  | { type: 'setCollisionMesh'; mesh: { vertices: Float32Array; normals: Float32Array; triCount: number } }
```

**Step 2: Add handler**

After the `setSDF` handler (line 300), add:

```typescript
      case 'setCollisionMesh': {
        if (solver) {
          solver.setCollisionMesh(msg.mesh);
        }
        break;
      }
```

**Step 3: Add import at top of file**

The solver already imports `XPBDClothSolver` which now has `setCollisionMesh`. No additional import needed in the worker — the `CollisionMeshData` type is inferred from the message union.

**Step 4: Run existing tests to verify nothing broke**

Run: `npx vitest run src/utils/cloth/__tests__/`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/utils/cloth/clothWorker.ts
git commit -m "feat(collision): add setCollisionMesh message to CPU worker"
```

---

### Task 6: Add setCollisionMesh Worker Message (Wasm Worker)

Add the `setCollisionMesh` message handler to the Wasm worker. For v1, the Wasm worker stores the collision mesh and uses the JS-side `solveTriangleCollision` (Rust/Wasm port is out of scope per design doc).

**Files:**
- Modify: `src/utils/cloth/wasm/wasmSolverWorker.ts:210-217` (add new handler after setSDF)

**Step 1: Add handler**

After the `setSDF` handler (line 217), add:

```typescript
      case 'setCollisionMesh':
        // Triangle collision for Wasm solver — uses JS-side collision
        // (Rust/Wasm port is out of scope for v1)
        console.log('[WasmWorker] setCollisionMesh received:', msg.mesh?.triCount, 'triangles');
        // Store for use in applyInitialCollision if needed
        (self as any).__collisionMesh = msg.mesh;
        break;
```

**Note:** The Wasm solver's collision loop runs in Rust (`solver.step(dt)` calls the Rust XPBD which has its own SDF collision via `set_sdf()`). For v1, the Wasm worker accepts and stores the collision mesh data but the actual collision still uses SDF in Rust. Full Wasm triangle collision will come in a future iteration when the Rust solver is extended.

**Step 2: Run existing tests to verify nothing broke**

Run: `npx vitest run src/utils/cloth/__tests__/`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add src/utils/cloth/wasm/wasmSolverWorker.ts
git commit -m "feat(collision): add setCollisionMesh stub to Wasm worker"
```

---

### Task 7: Add setCollisionMesh to Worker Clients

Add `setCollisionMesh()` methods to both `ClothWorkerClient` and `WasmSolverClient`.

**Files:**
- Modify: `src/utils/cloth/clothWorkerClient.ts:204-206` (add method after setSDF)
- Modify: `src/utils/cloth/wasm/wasmSolverClient.ts:101-103` (add method after setSDF)

**Step 1: Add to ClothWorkerClient**

After the `setSDF` method (line 206), add:

```typescript
  /**
   * Set triangle collision mesh for body collision (replaces SDF).
   *
   * @param mesh - CollisionMeshData with flat triangle vertices + normals
   */
  setCollisionMesh(mesh: { vertices: Float32Array; normals: Float32Array; triCount: number }): void {
    this.postMessage(
      { type: 'setCollisionMesh', mesh },
      [mesh.vertices.buffer, mesh.normals.buffer],
    );
  }
```

Note: Uses transferable buffers for zero-copy transfer.

**Step 2: Add to WasmSolverClient**

After the `setSDF` method (line 103), add:

```typescript
  /**
   * Set triangle collision mesh for body collision (replaces SDF).
   *
   * @param mesh - CollisionMeshData with flat triangle vertices + normals
   */
  setCollisionMesh(mesh: { vertices: Float32Array; normals: Float32Array; triCount: number }): void {
    this.worker?.postMessage(
      { type: 'setCollisionMesh', mesh },
      [mesh.vertices.buffer, mesh.normals.buffer],
    );
  }
```

**Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add src/utils/cloth/clothWorkerClient.ts src/utils/cloth/wasm/wasmSolverClient.ts
git commit -m "feat(collision): add setCollisionMesh to worker clients"
```

---

### Task 8: Wire into GarmentSimulation (Replace SDF Usage)

Replace the SDF generation + loading pipeline in `GarmentSimulation.tsx` with collision mesh extraction. The existing `loadSDFInWorker` function (lines 101-189) is replaced by `loadCollisionMesh` which extracts `CollisionMeshData` from the avatar's Three.js geometry.

**Files:**
- Create: `src/utils/cloth/avatarCollisionMesh.ts` (main-thread extraction from Three.js scene)
- Modify: `src/components/Viewport3D/GarmentSimulation.tsx:101-189` (replace loadSDFInWorker), `596-618` (Wasm SDF usage), `647-667` (CPU SDF usage)

**Step 1: Create avatarCollisionMesh.ts**

This utility extracts mesh data from a Three.js scene (GLB/VRM/OBJ) the same way `avatarSDF.ts:extractMeshData` does, then converts it to `CollisionMeshData` via `extractCollisionMesh`.

Create `src/utils/cloth/avatarCollisionMesh.ts`:

```typescript
/**
 * Extract CollisionMeshData from an avatar Three.js scene.
 *
 * Combines the mesh extraction from avatarSDF.ts with the flat triangle
 * conversion from collisionMesh.ts. Runs on main thread — fast (~1ms
 * for typical 5K triangle avatars).
 *
 * @module avatarCollisionMesh
 */

import type { CollisionMeshData } from './collisionMesh';
import { extractCollisionMesh } from './collisionMesh';

/**
 * Extract CollisionMeshData from a Three.js scene.
 *
 * Traverses scene, collects all mesh geometry (handling SkinnedMesh),
 * builds a merged indexed geometry, and extracts flat triangle data.
 */
export async function extractAvatarCollisionMesh(
  avatarUrl: string,
  avatarHeight: number,
): Promise<CollisionMeshData | null> {
  const { extractMeshData } = await import('./avatarSDF');
  const THREE = await import('three');
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  const { isVRMFile, loadVRM } = await import('../avatar/vrmLoader');

  let scene: import('three').Group;
  if (isVRMFile(avatarUrl)) {
    const result = await loadVRM(avatarUrl);
    scene = result.scene;
  } else {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(avatarUrl);
    scene = gltf.scene as import('three').Group;
  }

  // Scale + center (same transforms as AvatarModel.tsx and avatarSDF.ts)
  const box = new THREE.Box3().setFromObject(scene);
  const size = new THREE.Vector3();
  box.getSize(size);
  if (size.y > 0) {
    const scale = avatarHeight / size.y;
    scene.scale.setScalar(scale);
    const scaledBox = new THREE.Box3().setFromObject(scene);
    const scaledCenter = new THREE.Vector3();
    scaledBox.getCenter(scaledCenter);
    scene.position.y = -scaledBox.min.y;
    scene.position.x = -scaledCenter.x;
    scene.position.z = -scaledCenter.z;
  }
  scene.updateMatrixWorld(true);

  const { vertices, indices } = extractMeshData(scene);
  if (vertices.length === 0 || indices.length === 0) return null;

  // Build a temporary BufferGeometry-like structure for extractCollisionMesh
  const geo = {
    attributes: { position: { array: vertices, count: vertices.length / 3 } },
    index: { array: indices, count: indices.length },
  };

  return extractCollisionMesh(geo as any);
}
```

**Step 2: Replace loadSDFInWorker usage in GarmentSimulation.tsx**

In `GarmentSimulation.tsx`, replace the SDF loading sections with collision mesh extraction:

2a. Add import at the top of the file (near other cloth imports):

```typescript
import { extractAvatarCollisionMesh } from '../../utils/cloth/avatarCollisionMesh';
```

2b. Replace the Wasm solver SDF section (lines 594-618) with:

```typescript
              // Load collision mesh BEFORE starting simulation
              if (avatarModelUrl && !cancelled) {
                console.log('[GarmentSimulation] Extracting collision mesh...');
                try {
                  const collisionMesh = await withTimeout(
                    extractAvatarCollisionMesh(avatarModelUrl, avatarHeight),
                    5000,
                    'Collision mesh extraction'
                  );
                  if (collisionMesh && !cancelled) {
                    console.log('[GarmentSimulation] ✅ Collision mesh extracted:', collisionMesh.triCount, 'triangles');
                    wasmClient.setCollisionMesh(collisionMesh);
                    // Also set SDF for Wasm-side collision (Wasm solver still uses SDF internally)
                    const sdf = await withTimeout(
                      loadSDFInWorker(avatarModelUrl, avatarHeight, initClientRef.current),
                      8000,
                      'SDF generation'
                    ).catch(() => null);
                    if (sdf && !cancelled) {
                      wasmClient.setSDF(sdf);
                      wasmClient.applyInitialCollision?.();
                    }
                    dispatch(setBodyCollision(true));
                  } else if (!cancelled) {
                    dispatch(setBodyCollision(false));
                  }
                } catch (e) {
                  console.warn('[GarmentSimulation] Collision mesh extraction failed:', e);
                  dispatch(setBodyCollision(false));
                }
              }
```

2c. Replace the CPU solver SDF section (lines 647-667) with:

```typescript
            // Load collision mesh BEFORE starting simulation (CPU)
            if (avatarModelUrl && !cancelled) {
              console.log('[GarmentSimulation] Extracting collision mesh (CPU)...');
              try {
                const collisionMesh = await withTimeout(
                  extractAvatarCollisionMesh(avatarModelUrl, avatarHeight),
                  5000,
                  'Collision mesh extraction'
                );
                if (collisionMesh && !cancelled) {
                  console.log('[GarmentSimulation] ✅ Collision mesh extracted for CPU:', collisionMesh.triCount, 'triangles');
                  client.setCollisionMesh(collisionMesh);
                  dispatch(setBodyCollision(true));
                } else if (!cancelled) {
                  dispatch(setBodyCollision(false));
                }
              } catch (e) {
                console.warn('[GarmentSimulation] Collision mesh extraction failed (CPU):', e);
                dispatch(setBodyCollision(false));
              }
            }
```

**Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 4: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/utils/cloth/avatarCollisionMesh.ts src/components/Viewport3D/GarmentSimulation.tsx
git commit -m "feat(collision): wire triangle collision into GarmentSimulation, replace SDF for CPU solver"
```

---

### Task 9: Deprecate SDF Path

Mark SDF-related code as deprecated. Keep the code but add deprecation notices. Do NOT delete SDF code — it's the fallback for the Wasm solver until Rust-side triangle collision is implemented.

**Files:**
- Modify: `src/utils/cloth/sdfGenerator.ts:1-9` (add deprecation notice)
- Modify: `src/utils/cloth/xpbdSolver.ts:593-595` (deprecate setSDF)
- Modify: `src/utils/cloth/clothWorkerClient.ts:204-206` (deprecate setSDF)
- Modify: `src/utils/cloth/wasm/wasmSolverClient.ts:101-103` (deprecate setSDF)

**Step 1: Add deprecation notices**

1a. In `sdfGenerator.ts`, update the module docstring (lines 1-9):

```typescript
/**
 * SDF (Signed Distance Field) Generator for Avatar Body Collision
 *
 * @deprecated Use triangle mesh collision via `collisionMesh.ts` and
 * `triangleCollision.ts` instead. SDF is retained as fallback for the
 * Wasm solver until Rust-side triangle collision is implemented.
 *
 * @module sdfGenerator
 */
```

1b. In `xpbdSolver.ts`, update `setSDF` docstring (lines 588-595):

```typescript
  /**
   * Set SDF data for accurate avatar body collision.
   *
   * @deprecated Use `setCollisionMesh()` instead. SDF collision is retained
   * for backward compatibility with the Wasm solver.
   *
   * @param sdf - Signed distance field data or null to disable
   */
```

1c. In `clothWorkerClient.ts`, update `setSDF` docstring (lines 199-206):

```typescript
  /**
   * Set SDF data for accurate avatar body collision.
   *
   * @deprecated Use `setCollisionMesh()` instead.
   *
   * @param sdf - Signed distance field data
   */
```

1d. In `wasmSolverClient.ts`, update `setSDF` (lines 101-103) — add `@deprecated` to existing comment or add one:

Add a comment before the method:

```typescript
  /** @deprecated Use `setCollisionMesh()` instead. Retained for Wasm solver compatibility. */
```

**Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/utils/cloth/sdfGenerator.ts src/utils/cloth/xpbdSolver.ts src/utils/cloth/clothWorkerClient.ts src/utils/cloth/wasm/wasmSolverClient.ts
git commit -m "refactor(collision): deprecate SDF path in favor of triangle collision"
```

---

### Task 10: Final Verification

Run the full test suite and type-check to ensure everything works together.

**Step 1: Type check**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 2: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS (including new collisionMesh, triangleCollision, and xpbdSolver tests)

**Step 3: Verify no regressions in existing SDF tests**

Run: `npx vitest run src/utils/cloth/__tests__/sdfGenerator.test.ts`
Expected: All existing SDF tests still PASS (SDF code is deprecated, not removed)

**Step 4: Commit (if any fixups needed)**

No commit if everything passes cleanly. If fixups were needed, commit them:

```bash
git add -u
git commit -m "fix(collision): address review feedback from final verification"
```
