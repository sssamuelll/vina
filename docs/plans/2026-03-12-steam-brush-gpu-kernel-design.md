# Steam Brush GPU Compute Kernel — Design

**Issue:** #307
**Date:** 2026-03-12

## Problem

`relaxParticles()` on `GpuSolverClient` is a no-op in TSL zero-copy mode. The CPU-side `velocitySBA.array` is stale (never read back from GPU). Bumping `version++` would upload zeros, freezing the entire cloth.

## Solution

A single-pass TSL compute kernel (`tslBrush.ts`) dispatched over all N particles once per frame, after the substep loop completes. Each GPU thread checks its particle against a brush sphere (center + radius), damps velocity with distance-based linear falloff.

## Architecture

### Data Flow

1. User drags on mesh → R3F `onPointerMove` → `handleBrushStroke(e.point)`
2. `handleBrushStroke` updates uniforms on solver: `solver.brushCenterX.value = x`, etc.
3. Next `useFrame`: after substep loop, before normals → `renderer.compute(solver.brushNode)`
4. Kernel reads `positionBufNode` for distance, writes `velBufNode` for damping
5. Skips pinned/frozen particles (`invMass == 0`)

### Kernel (per-particle, single pass)

```
for each particle i (GPU thread):
  if invMass[i] == 0: skip
  dist = distance(position[i], brushCenter)
  if dist > brushRadius: skip
  falloff = 1 - (dist / brushRadius)     // linear: full strength at center, zero at edge
  dampFactor = 1 - (strength * falloff)
  velocity[i] *= dampFactor
```

No atomics needed — each thread writes only its own particle's velocity.

### Timing

Runs **once per frame** after all substeps (after `postSolve`), before normal recomputation. The velocity being damped is the final Verlet-derived velocity, so no overwrite issue.

### Interface

New fields on `TslSolver`:

```typescript
brushNode: ComputeNode | null;
brushCenterX: { value: number };
brushCenterY: { value: number };
brushCenterZ: { value: number };
brushRadius: { value: number };
brushStrength: { value: number };
```

`brushNode` is `null` when brush strength is 0 (no dispatch needed). Set to the compute node when brush is active.

### Files

| Action | File | Change |
|--------|------|--------|
| Create | `src/utils/cloth/gpu/tslBrush.ts` | Kernel module (matching tslWind.ts pattern) |
| Modify | `src/utils/cloth/gpu/tslSolver.ts` | Add brush fields to TslSolver, create kernel |
| Modify | `src/utils/cloth/gpu/gpuSolverClient.ts` | Replace no-op `relaxParticles` with uniform updates |
| Modify | `src/components/Viewport3D/GarmentSimulation.tsx` | Dispatch brush kernel, simplify handleBrushStroke |

### What Gets Removed

- `findParticlesInRadius()` in GarmentSimulation (GPU does spatial query now)
- CPU-side particle index search in `handleBrushStroke`
- The `relaxParticles()` method signature changes: takes `(center, radius, strength)` instead of `(indices, strength)`
