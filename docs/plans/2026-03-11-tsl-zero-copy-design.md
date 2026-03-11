# TSL Zero-Copy Rendering Design

## Problem

The GPU cloth solver computes positions on the GPU, then reads them back to the CPU via `mapAsync`, copies them to a `BufferAttribute`, which Three.js re-uploads to the GPU for rendering. This GPU→CPU→GPU roundtrip negates the performance benefit of GPU compute.

A previous attempt to patch `StorageBufferAttribute.gpuBuffer` failed because Three.js `WebGPURenderer` creates its own internal GPU buffers and ignores patched references.

## Goal

Eliminate the readback roundtrip by rewriting the XPBD compute solver in TSL (Three Shading Language). TSL manages GPU buffers natively, and the same `StorageBufferAttribute` can be written by `renderer.compute()` and read by the vertex shader via `material.positionNode`.

## Architecture

### Current Data Flow (GPU→CPU→GPU)
```
gpuSolver.step()  →  mapAsync readback  →  CPU Float32Array  →  setAttribute  →  GPU re-upload  →  render
```

### Target Data Flow (zero-copy)
```
renderer.compute(tslSolver)  →  same buffer  →  render via positionNode/normalNode
```

### TSL Buffer Setup
```typescript
import { storage, StorageBufferAttribute } from 'three/webgpu';

const positionSBA = new StorageBufferAttribute(new Float32Array(N * 3), 3);
const prevPosSBA  = new StorageBufferAttribute(new Float32Array(N * 3), 3);
const velocitySBA = new StorageBufferAttribute(new Float32Array(N * 3), 3);
const invMassSBA  = new StorageBufferAttribute(new Float32Array(N), 1);
const normalsSBA  = new StorageBufferAttribute(new Float32Array(N * 3), 3);

const positions = storage(positionSBA, 'vec3', N);
const prevPos   = storage(prevPosSBA, 'vec3', N);
const velocity  = storage(velocitySBA, 'vec3', N);
const invMass   = storage(invMassSBA, 'float', N);
const normals   = storage(normalsSBA, 'vec3', N);

// Material reads directly from solver buffers
material.positionNode = positions.toAttribute();
material.normalNode   = normals.toAttribute();
```

### Compute Passes (TSL Fn())

Each WGSL shader becomes a TSL `Fn()` dispatched via `renderer.compute()`:

| Pass | Description | Per-frame dispatches |
|------|-------------|---------------------|
| `preSolve` | Gravity + Verlet integration | 1 per substep |
| `solveStretch` | Graph-colored distance constraints | N per substep (1 per color) |
| `solveBend` | Diagonal distance constraints | 1 per substep |
| `solveSeams` | Seam stitching constraints | 1 per substep |
| `postSolve` | Velocity update + clamping | 1 per substep |

Normal computation is deferred to Phase 2 (GPU atomics). Phase 1 uses `geometry.computeVertexNormals()` as a temporary fallback.

### Graph-Colored Stretch Dispatch

Stretch constraints are partitioned into color groups where no two constraints in the same group share a vertex. Each color group gets its own `StorageBufferAttribute` for constraint IDs and rest lengths. The solver dispatches one `renderer.compute()` call per color per substep.

```typescript
for (let sub = 0; sub < substeps; sub++) {
  renderer.compute(preSolveFn);
  for (const color of stretchColors) {
    // Swap constraint buffer references per color
    renderer.compute(color.stretchFn);
  }
  renderer.compute(bendFn);
  renderer.compute(seamFn);
  renderer.compute(postSolveFn);
}
```

## Phased Delivery

### Phase 1: Core Solver + Zero-Copy Rendering (this work)

**Scope:**
- TSL buffer setup (`tslBuffers.ts`)
- TSL compute functions: preSolve, stretch (graph-colored), bend, seams, postSolve (`tslSolver.ts`)
- `MeshStandardNodeMaterial` with `positionNode` in GarmentSimulation
- CPU-side `computeVertexNormals()` as temporary normal source
- Fallback: CPU readback still available for export, fit maps, recording

**Not included:**
- GPU normal accumulation (requires atomic i32 — Phase 2)
- Body collision (Phase 2)
- Self-collision (Phase 3, issue #293)

### Phase 2: GPU Normals + Body Collision (follow-up)

- Port `accumulateNormals` (atomic i32 fixed-point accumulation)
- Port `normalizeNormals` (atomic load + normalize)
- Port `bodyCollision` (brute-force point-triangle)
- Wire `normalNode` to GPU-computed normals

### Phase 3: GPU Self-Collision (issue #293)

- Port spatial hash (hashCount, prefixSum, scatter, resolve)

## Files

| File | Action |
|------|--------|
| `src/utils/cloth/gpu/tslBuffers.ts` | Create — StorageBufferAttribute setup, init data upload |
| `src/utils/cloth/gpu/tslSolver.ts` | Create — TSL Fn() compute functions + step orchestrator |
| `src/utils/cloth/gpu/gpuSolverClient.ts` | Modify — use TSL solver, expose SBAs for material |
| `src/components/Viewport3D/GarmentSimulation.tsx` | Modify — NodeMaterial with positionNode when GPU tier |
| `src/utils/cloth/gpu/gpuSolver.ts` | Keep — WGSL solver as fallback |
| `src/utils/cloth/gpu/gpuBuffers.ts` | Keep — used by WGSL fallback |

## CPU Readback Fallback

`readPositionsToCPU()` remains for infrequent operations:
- GLTF/USDZ export (needs CPU positions)
- Fit map computation (needs CPU positions)
- Simulation recording (frame snapshots)

The per-frame render loop is pure GPU — no readback.

## Risks

| Risk | Mitigation |
|------|------------|
| TSL atomic support insufficient for normals | Phase 1 uses CPU normals; validate atomics before Phase 2 |
| Graph-colored dispatch overhead in TSL | Profile; TSL generates same WGSL underneath |
| `renderer.compute()` per-call overhead (many calls per frame) | Three.js batches into same command encoder |
| NodeMaterial incompatible with existing cloth shading | Test MeshStandardNodeMaterial with fabric textures |
| R3F integration issues with NodeMaterial | Use `<primitive>` or attach material via ref |

## Related

- Issue #292 — True zero-copy via TSL
- Issue #293 — GPU self-collision (Phase 3)
- Issue #234 — WebGPU Cloth Simulation (epic)
- PR #287 — WebGPU migration
- PR #289 — GPU compute solver fixes
