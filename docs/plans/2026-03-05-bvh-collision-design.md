# BVH-Based Body Collision — Design Doc

> **Issue:** #6
> **Date:** 2026-03-05
> **Status:** Approved

## Goal

Replace SDF-based body collision with triangle-mesh collision using `three-mesh-bvh`. Enables pose changes and avatar animation without expensive SDF regeneration.

## Decisions

| Decision | Choice |
|----------|--------|
| Scope | Replace SDF entirely (not dual system) |
| Library | three-mesh-bvh (build BVH on main thread) |
| Worker strategy | Main builds BVH + extracts triangles, worker does per-particle collision |
| Spatial acceleration in worker | Reuse IntSpatialHash over avatar triangles |

---

## 1. Problem: Current SDF Limitations

The current collision system generates a 64^3 signed distance field from the avatar mesh. This works well for static A-pose avatars but:

- **Pose changes:** Re-generating the SDF takes 2-5s. Users must wait after every pose adjustment.
- **Animation:** Impossible. SDF regeneration per frame is orders of magnitude too slow.
- **Accuracy:** Limited by grid resolution. 64^3 means ~5mm cells for a human body.
- **Gradient:** Computed via finite differences — approximate, can produce artifacts at grid boundaries.

CLO3D uses triangle-mesh collision with spatial acceleration (BVH-like), not SDF. This allows instant pose changes and smooth animation.

---

## 2. Architecture

```
Avatar mesh (Three.js)
    ↓
[Main thread] three-mesh-bvh builds BVH on load
    ↓ refit() on pose change (<1ms)
[Main thread] Extract triangle positions + face normals → Float32Array
    ↓ postMessage with transferable buffers
[Worker] Build IntSpatialHash over triangles (one-time per pose)
    ↓ per substep (15×/frame)
[Worker] Per-particle: hash lookup → nearest triangle → push out if penetrating
```

### Data Flow

1. **Avatar loads:** Main thread creates `MeshBVH` from avatar geometry. Extracts `CollisionMeshData` (flat triangle vertices + face normals). Sends to worker.
2. **Pose changes:** Main thread calls `bvh.refit()` (<1ms). Re-extracts triangle positions. Sends updated `CollisionMeshData` to worker.
3. **Animation:** Same as pose change, but per frame. Refit + extract + transfer ≈ 2ms.
4. **Worker collision:** Each substep, for each particle: query spatial hash for nearby triangles, compute point-to-triangle distance, push out along face normal if penetrating.

---

## 3. CollisionMeshData (replaces SDFData)

```typescript
interface CollisionMeshData {
  /** Flat triangle vertices: [ax,ay,az, bx,by,bz, cx,cy,cz, ...] */
  vertices: Float32Array;
  /** Per-triangle face normals: [nx,ny,nz, ...] */
  normals: Float32Array;
  /** Number of triangles */
  triCount: number;
}
```

Memory: ~300KB for a typical 5K-triangle avatar (vs ~1MB for 64^3 SDF).

### Extraction from Three.js Geometry

```typescript
function extractCollisionMesh(geometry: THREE.BufferGeometry): CollisionMeshData {
  const pos = geometry.attributes.position.array;
  const idx = geometry.index!.array;
  const triCount = idx.length / 3;
  const vertices = new Float32Array(triCount * 9);
  const normals = new Float32Array(triCount * 3);

  for (let i = 0; i < triCount; i++) {
    const i0 = idx[i * 3], i1 = idx[i * 3 + 1], i2 = idx[i * 3 + 2];
    // Copy triangle vertices
    vertices.set([pos[i0*3], pos[i0*3+1], pos[i0*3+2]], i * 9);
    vertices.set([pos[i1*3], pos[i1*3+1], pos[i1*3+2]], i * 9 + 3);
    vertices.set([pos[i2*3], pos[i2*3+1], pos[i2*3+2]], i * 9 + 6);
    // Compute face normal
    // ... edge cross product, normalize
  }

  return { vertices, normals, triCount };
}
```

---

## 4. Worker-Side Triangle Collision

### Spatial Hash (reuse existing IntSpatialHash)

```typescript
// Build hash over avatar triangles (once per pose change)
const hash = new IntSpatialHash(cellSize); // cellSize ~ 2× collision margin
for (let t = 0; t < triCount; t++) {
  const offset = t * 9;
  // Insert triangle into all hash cells its AABB overlaps
  hash.insertTriangleAABB(t, vertices, offset);
}
```

### Per-Particle Collision (per substep)

```typescript
function solveTriangleCollision(
  pos: Float32Array,
  invMass: Float32Array,
  numParticles: number,
  collisionMesh: CollisionMeshData,
  hash: IntSpatialHash,
  collisionMargin: number,
): void {
  for (let p = 0; p < numParticles; p++) {
    if (invMass[p] === 0) continue; // pinned

    const px = pos[p*3], py = pos[p*3+1], pz = pos[p*3+2];
    const nearbyTris = hash.query(px, py, pz);

    let minDist = Infinity;
    let closestNx = 0, closestNy = 0, closestNz = 0;
    let closestPx = 0, closestPy = 0, closestPz = 0;

    for (const triIdx of nearbyTris) {
      const { dist, closest, normal } = pointToTriangleDistance(
        px, py, pz,
        collisionMesh.vertices, triIdx * 9,
        collisionMesh.normals, triIdx * 3,
      );
      if (dist < minDist) {
        minDist = dist;
        closestNx = normal[0]; closestNy = normal[1]; closestNz = normal[2];
        closestPx = closest[0]; closestPy = closest[1]; closestPz = closest[2];
      }
    }

    // Push out if penetrating
    if (minDist < collisionMargin) {
      const pushDist = collisionMargin - minDist;
      pos[p*3]     += closestNx * pushDist;
      pos[p*3 + 1] += closestNy * pushDist;
      pos[p*3 + 2] += closestNz * pushDist;
    }
  }
}
```

### Point-to-Triangle Distance

The existing `sdfGenerator.ts` already has a robust `pointToTriangleDistance` function using barycentric coordinates and edge projection. We extract and reuse it.

---

## 5. SDF vs BVH + Triangle Mesh Comparison

| Aspect | SDF (current) | Triangle Mesh (proposed) |
|--------|--------------|--------------------------|
| Static pose | Fast (pre-computed) | Fast (hash built once) |
| Pose change | 2-5s (regenerate grid) | <2ms (refit + transfer) |
| Animation | Impossible | ~2ms/frame (refit + transfer) |
| Memory | ~1MB (64^3 grid) | ~300KB (5K triangles) |
| Accuracy | Grid-limited (~5mm) | Exact triangle distance |
| Normal | Finite differences | Exact face normal |
| Complexity | Simple grid sampling | Triangle distance computation |

---

## 6. Main Thread: three-mesh-bvh Integration

```typescript
import { MeshBVH } from 'three-mesh-bvh';

// On avatar load:
const geometry = avatarMesh.geometry;
geometry.boundsTree = new MeshBVH(geometry);

// Extract collision mesh:
const collisionMesh = extractCollisionMesh(geometry);
worker.postMessage(
  { type: 'setCollisionMesh', mesh: collisionMesh },
  [collisionMesh.vertices.buffer, collisionMesh.normals.buffer],
);

// On pose change:
geometry.boundsTree.refit(); // <1ms
const updated = extractCollisionMesh(geometry);
worker.postMessage(
  { type: 'setCollisionMesh', mesh: updated },
  [updated.vertices.buffer, updated.normals.buffer],
);
```

---

## 7. Worker Messages (replacing SDF messages)

```
Main → Worker:
  { type: 'setCollisionMesh', mesh: CollisionMeshData }

Worker → Main:
  (no response needed — collision is part of simulation loop)
```

The existing `setSDF` message is deprecated but kept for fallback during migration.

---

## 8. Migration Path

1. Add `three-mesh-bvh` dependency
2. Create `CollisionMeshData` type + extraction utility
3. Create `triangleCollision.ts` — point-to-triangle + spatial hash collision
4. Add `setCollisionMesh` worker message to both CPU and Wasm workers
5. Add `solveTriangleCollision()` to XPBDClothSolver
6. Wire into GarmentSimulation: extract mesh → send to worker (replaces SDF generation)
7. Update worker clients: `setCollisionMesh()` method
8. Deprecate SDF path (keep code, remove usage)

---

## 9. Files to Create/Modify

| Action | File | Purpose |
|--------|------|---------|
| Create | `src/utils/cloth/collisionMesh.ts` | CollisionMeshData type + extraction from Three.js geometry |
| Create | `src/utils/cloth/triangleCollision.ts` | Point-to-triangle distance + spatial hash collision solver |
| Create | `src/utils/cloth/__tests__/triangleCollision.test.ts` | Tests for triangle collision |
| Create | `src/utils/cloth/__tests__/collisionMesh.test.ts` | Tests for mesh extraction |
| Modify | `src/utils/cloth/clothWorker.ts` | Add `setCollisionMesh` message + use triangle collision |
| Modify | `src/utils/cloth/wasm/wasmSolverWorker.ts` | Same for Wasm worker |
| Modify | `src/utils/cloth/xpbdSolver.ts` | Add `solveTriangleCollision`, deprecate `solveSDFCollision` |
| Modify | `src/utils/cloth/clothWorkerClient.ts` | Add `setCollisionMesh()` method |
| Modify | `src/utils/cloth/wasm/wasmSolverClient.ts` | Same |
| Modify | `src/components/Viewport3D/GarmentSimulation.tsx` | Extract mesh → send collision mesh |

---

## 10. Out of Scope (v1)

- Rust/Wasm triangle collision (keep JS, port later for performance)
- GPU compute shader for triangle collision
- Self-collision via BVH (separate feature)
- Continuous collision detection (CCD)
- Avatar skinning/bone animation (just mesh vertex updates for now)
- Removing SDF code entirely (deprecate, keep as fallback)
