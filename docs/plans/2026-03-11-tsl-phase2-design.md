# TSL Phase 2 — GPU Body Collision + Normals Integration

> **Issue:** Continuation of TSL Zero-Copy Rendering (#292)
> **Date:** 2026-03-11
> **Status:** Approved
> **Depends on:** TSL Phase 1 (merged in PR #296)

## Goal

Complete the TSL zero-copy pipeline so cloth drapes correctly on the avatar with proper lighting. Phase 1 delivered the TSL compute solver and positionNode rendering. Phase 2 adds GPU body collision (BVH-accelerated) and wires normalNode for smooth-shaded lighting.

## Decisions

| Decision | Choice |
|----------|--------|
| Collision acceleration | GPU BVH traversal (O(N log M), industry standard) |
| BVH construction | CPU-side via `three-mesh-bvh`, linearized for GPU upload |
| Multi-body | Per-body BVH, one dispatch per body (matches existing architecture) |
| Friction | Position-based Coulomb (matching CPU solver) |
| Normal computation | Already implemented in Phase 1 — verify only |

---

## 1. Current State (Phase 1 Complete)

### What works
- TSL compute solver: preSolve, stretch (per-color), bend, seam, groundClamp, postSolve
- Zero-copy position rendering: `mat.positionNode = solver.positionBufNode.toAttribute()`
- GPU smooth normals: `normalZero` → `normalAccum` (atomic i32) → `normalNormalize` dispatched in useFrame
- Zero-copy normal rendering: `mat.normalNode = solver.normalBufNode.toAttribute()`
- Per-edge-type anisotropic compliance (warp/weft/shear from UV classification)

### What's missing
- **Body collision**: No collision dispatch in useFrame TSL path. Cloth falls through avatar.
- **Normal verification**: Normals are dispatched but not visually verified under real lighting.
- **`setCollisionMesh` routing**: Routes to WGSL solver, disconnected from TSL buffers.
- **Friction**: Not implemented in GPU collision (field exists in WGSL `CollisionParams`, never used).
- **TSL GPU→CPU readback**: Returns stale initial positions.

---

## 2. Architecture

```
Avatar GLTF → extractCollisionMesh() → CollisionMeshData
                                            ↓
                                  [CPU] three-mesh-bvh → MeshBVH
                                            ↓
                                  [CPU] linearizeBVH() → LinearBVH
                                            ↓
                                  [GPU] StorageBufferAttributes (nodes, triVerts, triNormals)
                                            ↓
                                  [GPU] TSL collision kernel (per particle, BVH traversal)
                                            ↓
                                  Positions corrected in-place (same posBuf as solver)
```

### Per-Frame Pipeline (useFrame)

```
for substep in 0..substeps:
  renderer.compute(preSolve)
  for color in stretchColors:
    renderer.compute(stretchColor)
  renderer.compute(bend)
  renderer.compute(seam)
  ──── NEW ────
  for body in collisionBodies:
    renderer.compute(body.collisionNode)
  ──────────────
  renderer.compute(groundClamp)
  renderer.compute(postSolve)

// Once per frame:
renderer.compute(normalZero)
renderer.compute(normalAccum)
renderer.compute(normalNormalize)
```

Collision goes after constraints, before groundClamp — matching the WGSL solver's pipeline ordering from `gpuSolver.ts:step()`.

---

## 3. CPU BVH Builder

### Module: `src/utils/cloth/gpu/bvh.ts`

Uses `three-mesh-bvh` to build the BVH on CPU, then linearizes into flat Float32Array for GPU upload.

### Linearized BVH Format

```typescript
interface LinearBVH {
  /** 8 floats per node: [minX, minY, minZ, maxX, maxY, maxZ, child/triStart, triCount]
   *  Internal node: triCount = 0, child = index of left child (right = left+1)
   *  Leaf node: triCount > 0, child = start index into triVerts */
  nodes: Float32Array;
  /** 9 floats per triangle: [v0x,v0y,v0z, v1x,v1y,v1z, v2x,v2y,v2z] */
  triVerts: Float32Array;
  /** 3 floats per triangle: [nx,ny,nz] — precomputed face normals */
  triNormals: Float32Array;
  nodeCount: number;
  triCount: number;
}
```

### Build + Linearize

```typescript
import { MeshBVH } from 'three-mesh-bvh';
import * as THREE from 'three';

export function buildLinearBVH(collisionMesh: CollisionMeshData): LinearBVH {
  // 1. Create Three.js geometry from flat collision mesh data
  const geometry = new THREE.BufferGeometry();
  // ... set positions + index from collisionMesh

  // 2. Build BVH
  const bvh = new MeshBVH(geometry, { maxLeafTris: 4 });

  // 3. Linearize: DFS traversal → flat node array
  const nodes: number[] = [];
  const triOrder: number[] = [];  // reordered triangle indices

  function linearize(node, depth) {
    const nodeIdx = nodes.length / 8;
    // Reserve 8 floats
    nodes.push(node.boundingData[0], node.boundingData[1], node.boundingData[2],
               node.boundingData[3], node.boundingData[4], node.boundingData[5],
               0, 0);  // placeholder for child/triStart + triCount

    if (node.count !== undefined) {
      // Leaf: store triangle range
      nodes[nodeIdx * 8 + 6] = triOrder.length;
      nodes[nodeIdx * 8 + 7] = node.count;
      for (let i = node.offset; i < node.offset + node.count; i++) {
        triOrder.push(i);
      }
    } else {
      // Internal: recurse, store left child index
      const leftIdx = nodes.length / 8;
      linearize(node.left, depth + 1);
      linearize(node.right, depth + 1);
      nodes[nodeIdx * 8 + 6] = leftIdx;
      nodes[nodeIdx * 8 + 7] = 0;  // 0 = internal node
    }
  }

  linearize(bvh._roots[0], 0);

  // 4. Build reordered triangle arrays following triOrder
  // ...

  return { nodes, triVerts, triNormals, nodeCount, triCount };
}
```

### Performance

- 50K triangle avatar: ~5-15ms build + linearize
- Only rebuilds on measurement slider release or pose change
- `three-mesh-bvh` refit() is <1ms for vertex updates without topology change

---

## 4. TSL Collision Kernel

### Module: `src/utils/cloth/gpu/tslCollision.ts`

### Algorithm (per particle)

Stack-based iterative BVH traversal:

```
1. Initialize stack with root node (index 0)
2. While stack not empty:
   a. Pop node index
   b. Test particle's expanded AABB (pos ± margin) against node AABB
   c. If no overlap → skip
   d. If leaf (triCount > 0):
      - For each triangle in [triStart, triStart+triCount):
        - Compute signed distance from particle to triangle
        - Track closest penetrating triangle
   e. If internal (triCount == 0):
      - Push left child, push right child
3. If collision found:
   a. Push: pos += normal * (margin - dist)
   b. Friction: pos -= friction * tangentialDisplacement
```

### TSL Implementation Notes

- **Stack:** TSL doesn't have dynamic arrays, but supports fixed-size `const` arrays. Use `uint` array of size 32 (max BVH depth). BVH depth for 50K triangles with leaf size 4 is ~14, so 32 is safe.
- **Point-to-triangle distance:** Full barycentric test including edge/vertex regions (matching CPU `pointToTriangleDist()`).
- **Friction:** Position-based: `tangential = (pos - prevPos) - dot(pos - prevPos, normal) * normal; pos -= friction * tangential`.
- **Max push clamp:** 0.05m (matching CPU solver's `MAX_PUSH_DIST`).
- **Pinned particles:** Skip if `invMass == 0`.

### Kernel Signature

```typescript
export function makeTslCollisionFn(
  posBuf: StorageBufferNode<'vec3'>,
  prevPosBuf: StorageBufferNode<'vec3'>,
  invMassBuf: StorageBufferNode<'float'>,
  bvhNodesBuf: StorageBufferNode<'float'>,
  triVertsBuf: StorageBufferNode<'float'>,
  triNormalsBuf: StorageBufferNode<'float'>,
  uniforms: { margin: FloatUniform, friction: FloatUniform, numNodes: UintUniform }
): ShaderNodeObject
```

---

## 5. Multi-Body Support

### Per-Body Storage

```typescript
interface TslCollisionBody {
  id: string;
  bvhNodesSBA: StorageBufferAttribute;
  triVertsSBA: StorageBufferAttribute;
  triNormalsSBA: StorageBufferAttribute;
  collisionNode: ComputeNode;        // ready for renderer.compute()
  margin: number;
  friction: number;
  nodeCount: number;
  triCount: number;
}
```

### TslSolver Extension

```typescript
interface TslSolver {
  // ... existing fields ...
  collisionBodies: TslCollisionBody[];
  setCollisionBody(id: string, bvh: LinearBVH, friction: number, margin: number): void;
  removeCollisionBody(id: string): void;
}
```

### Dispatch Strategy

One `renderer.compute()` call per body per substep:

```typescript
for (const body of solver.collisionBodies) {
  renderer.compute(body.collisionNode);
}
```

Each body's `collisionNode` reads from the same `posBuf`/`prevPosBuf`/`invMassBuf` (shared particle data) but has its own BVH/triangle SBAs. This matches the CPU solver pattern and CLO3D's multi-object approach.

### Adding/Removing Bodies at Runtime

- `setCollisionBody()`: Builds BVH → creates SBAs → creates ComputeNode → adds to `collisionBodies[]`
- `removeCollisionBody()`: Finds by ID → removes from array (SBA disposal handled by Three.js GC)

---

## 6. GpuSolverClient Routing

### TSL Mode Collision Methods

```typescript
// In GpuSolverClient:

setTslCollisionBody(id: string, mesh: CollisionMeshData, friction: number, margin: number): void {
  const bvh = buildLinearBVH(mesh);
  // Create SBAs from linearized BVH
  const bvhNodesSBA = new StorageBufferAttribute(bvh.nodes, 1);
  const triVertsSBA = new StorageBufferAttribute(bvh.triVerts, 1);
  const triNormalsSBA = new StorageBufferAttribute(bvh.triNormals, 1);
  // Create TSL collision compute node
  const collisionFn = makeTslCollisionFn(...);
  const collisionNode = compute(collisionFn, this.tslSolver.numParticles);
  // Register on solver
  this.tslSolver.setCollisionBody(id, { bvhNodesSBA, triVertsSBA, triNormalsSBA, collisionNode, ... });
}
```

### Backward Compatibility

Existing `setCollisionMesh()` and `updateCollisionMesh()`:
- If TSL mode: route to `setTslCollisionBody('__avatar__', ...)` (matching existing `__avatar__` convention)
- If WGSL mode: route to `this.solver.setCollisionMesh()` (unchanged)

---

## 7. useSimulationLifecycle Integration

### TSL Path Changes

The WebGPU block in `useSimulationLifecycle.ts` currently skips collision with a `// Body collision deferred to Phase 2` comment. Phase 2 adds:

```typescript
// After initMultiPieceTsl:
await loadCollisionTsl(gpuClient, avatarModelUrl, avatarHeight, collisionBodies, dispatch, cancelFlag);
```

`loadCollisionTsl()` is analogous to the existing `loadCollision()` but:
1. Calls `extractAvatarCollisionMesh()` (reuse existing)
2. Calls `gpuClient.setTslCollisionBody('__avatar__', mesh, friction, margin)`
3. For each custom collision body: same pattern

### Measurement Change Debounce

The existing debounced rebuild (lines 394-427) already calls `client.setCollisionMesh()`. In TSL mode this now routes through the backward compatibility shim to `setTslCollisionBody('__avatar__', ...)`, which rebuilds the BVH and recreates the collision ComputeNode.

---

## 8. GarmentSimulation useFrame Changes

```typescript
// In the TSL branch of useFrame:
const solver = tslSolverRef.current;
if (!solver) return;

const substeps = solver.numParticles > 0 ? 15 : 0;
for (let s = 0; s < substeps; s++) {
  renderer.compute(solver.preSolve);
  for (const c of solver.stretchColors) renderer.compute(c);
  if (solver.bend) renderer.compute(solver.bend);
  if (solver.seam) renderer.compute(solver.seam);
  // NEW: Body collision (per-body BVH traversal)
  for (const body of solver.collisionBodies) {
    renderer.compute(body.collisionNode);
  }
  renderer.compute(solver.groundClamp);
  renderer.compute(solver.postSolve);
}
// Normals (once per frame)
renderer.compute(solver.normalZero);
renderer.compute(solver.normalAccum);
renderer.compute(solver.normalNormalize);
```

---

## 9. Testing

| Test | Type | Purpose |
|------|------|---------|
| BVH construction correctness | Unit | Every triangle reachable, AABBs contain children |
| BVH linearization roundtrip | Unit | Linearized format traversable, matches original |
| Point-in-BVH vs brute-force | Unit | BVH query returns same nearest triangle as O(N) scan |
| TSL collision pushes particle out | Unit | Particle inside body gets pushed to surface |
| Friction reduces tangential motion | Unit | Particle sliding on surface decelerates |
| Multi-body collision | Unit | Particle collides with correct body |
| Normals visually correct | E2E | Cloth has smooth shading under directional light |
| Cloth drapes on avatar | E2E | Cloth doesn't fall through avatar body |
| Measurement slider change | E2E | BVH rebuilds without crash |
| Performance regression | Bench | TSL BVH traversal < 2ms/frame for 5K cloth × 50K avatar |

---

## 10. Files to Create/Modify

| Action | File | Purpose |
|--------|------|---------|
| Create | `src/utils/cloth/gpu/bvh.ts` | `buildLinearBVH()` — CPU BVH build + linearization |
| Create | `src/utils/cloth/gpu/tslCollision.ts` | `makeTslCollisionFn()` — TSL collision kernel with BVH traversal |
| Create | `src/utils/cloth/gpu/__tests__/bvh.test.ts` | BVH construction + linearization tests |
| Create | `src/utils/cloth/gpu/__tests__/tslCollision.test.ts` | Collision kernel logic tests |
| Modify | `src/utils/cloth/gpu/tslSolver.ts` | Add `collisionBodies[]`, `setCollisionBody()`, `removeCollisionBody()` to TslSolver |
| Modify | `src/utils/cloth/gpu/gpuSolverClient.ts` | Add `setTslCollisionBody()`, route `setCollisionMesh()` for TSL mode |
| Modify | `src/components/Viewport3D/GarmentSimulation.tsx` | Add collision dispatch loop in useFrame TSL path |
| Modify | `src/components/Viewport3D/useSimulationLifecycle.ts` | Call `loadCollisionTsl()` in WebGPU path |
| Modify | `tests/e2e/tsl-zero-copy.spec.ts` | Add collision + normals E2E tests |

---

## 11. Out of Scope

- GPU BVH construction (LBVH) — CPU build is fast enough for our use case
- Self-collision via BVH — separate feature, much more complex
- Continuous collision detection (CCD) — not needed for garment CAD
- GPU→CPU position readback for TSL — separate Phase 3 concern
- Avatar skeletal animation — morphTargets/blend shapes only for now
