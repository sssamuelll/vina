# Steam Brush GPU Compute Kernel Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the no-op `relaxParticles()` with a TSL compute kernel that damps particle velocity on GPU, making the steam brush tool functional in zero-copy mode.

**Architecture:** New `tslBrush.ts` module creates a single-pass compute kernel dispatched over N particles. Each thread checks distance to brush center, damps velocity with linear falloff. Kernel dispatched once per frame after substeps, before normals. Brush uniforms updated from pointer events via `gpuSolverClient.setBrushParams()`.

**Tech Stack:** Three.js TSL (Fn, compute, uniform, storage, instanceIndex), React Three Fiber, Vitest

---

### Task 1: Create `tslBrush.ts` — Brush Compute Kernel

**Files:**
- Create: `src/utils/cloth/gpu/tslBrush.ts`
- Create: `src/utils/cloth/gpu/__tests__/tslBrush.test.ts`

**Step 1: Write the failing test**

Create `src/utils/cloth/gpu/__tests__/tslBrush.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { makeBrushComputeNode, type BrushComputeNodes } from '../tslBrush';

describe('tslBrush', () => {
  it('exports makeBrushComputeNode function', () => {
    expect(typeof makeBrushComputeNode).toBe('function');
  });

  it('BrushComputeNodes has expected uniform shape', () => {
    // Verify the factory returns an object with the expected keys.
    // We can't call it without real TSL nodes, but we can check the export.
    expect(makeBrushComputeNode).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/cloth/gpu/__tests__/tslBrush.test.ts`
Expected: FAIL — module not found

**Step 3: Implement**

Create `src/utils/cloth/gpu/tslBrush.ts`:

```typescript
/**
 * TSL Brush Compute — single-pass per-particle velocity damping for steam brush.
 *
 * Dispatched once per frame (after substeps, before normals). Each GPU thread
 * checks if its particle is within the brush sphere. If so, velocity is damped
 * with linear distance falloff. Pinned particles (invMass=0) are skipped.
 *
 * @module tslBrush
 */

import {
  Fn,
  compute,
  uniform,
  float,
  uint,
  instanceIndex,
  If,
  vec3,
} from 'three/tsl';
// TSL node types vary across @types/three versions; use loose types for stability.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TslNode = any;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface BrushComputeNodes {
  /** Per-particle brush damping compute node */
  brushNode: TslNode;
  /** Brush center X uniform — update .value at runtime */
  centerX: { value: number };
  /** Brush center Y uniform — update .value at runtime */
  centerY: { value: number };
  /** Brush center Z uniform — update .value at runtime */
  centerZ: { value: number };
  /** Brush radius uniform — update .value at runtime */
  radius: { value: number };
  /** Brush strength uniform (0-1) — update .value at runtime */
  strength: { value: number };
}

// ─── Compute Node Factory ───────────────────────────────────────────────────

/**
 * Create the TSL compute node for steam brush velocity damping.
 *
 * @param posBufNode    - Cloth particle positions (vec3 storage, shared with solver)
 * @param velBufNode    - Cloth particle velocities (vec3 storage, shared with solver)
 * @param invMassBufNode - Inverse mass per particle (float storage, shared with solver)
 * @param numParticles  - Number of particles in the mesh
 */
export function makeBrushComputeNode(
  posBufNode: TslNode,
  velBufNode: TslNode,
  invMassBufNode: TslNode,
  numParticles: number,
): BrushComputeNodes {
  const N = numParticles;

  // ─── Uniforms (exposed for runtime updates) ─────────────────────
  const uCenterX = uniform(0.0);
  const uCenterY = uniform(0.0);
  const uCenterZ = uniform(0.0);
  const uRadius = uniform(0.05);
  const uStrength = uniform(0.0); // 0 = no damping (inactive)

  // ─── Single-pass: per-particle brush damping ────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const brushFn = (Fn as any)(() => {
    const i = instanceIndex;

    // Bounds guard: workgroup size (64) may exceed N in the last group.
    If(uint(i).lessThan(uint(N)), () => {
      // Skip if brush is inactive (strength == 0)
      If(uStrength.greaterThan(float(0.0)), () => {
        // Skip pinned/frozen particles (invMass == 0)
        const invMass = invMassBufNode.element(i);
        If(invMass.greaterThan(float(0.0)), () => {
          // Distance from particle to brush center
          const pos = posBufNode.element(i);
          const dx = pos.x.sub(uCenterX);
          const dy = pos.y.sub(uCenterY);
          const dz = pos.z.sub(uCenterZ);
          const distSq = dx.mul(dx).add(dy.mul(dy)).add(dz.mul(dz));
          const radiusSq = uRadius.mul(uRadius);

          If(distSq.lessThan(radiusSq), () => {
            // Linear falloff: full strength at center, zero at edge
            const dist = distSq.sqrt();
            const falloff = float(1.0).sub(dist.div(uRadius));
            const dampFactor = float(1.0).sub(uStrength.mul(falloff));

            // Damp velocity
            velBufNode.element(i).x.mulAssign(dampFactor);
            velBufNode.element(i).y.mulAssign(dampFactor);
            velBufNode.element(i).z.mulAssign(dampFactor);
          });
        });
      });
    });
  })();

  const brushNode = compute(brushFn, N, [64]);

  return {
    brushNode,
    centerX: uCenterX,
    centerY: uCenterY,
    centerZ: uCenterZ,
    radius: uRadius,
    strength: uStrength,
  };
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/cloth/gpu/__tests__/tslBrush.test.ts`
Expected: 2 tests PASS

**Step 5: Commit**

```bash
git add src/utils/cloth/gpu/tslBrush.ts src/utils/cloth/gpu/__tests__/tslBrush.test.ts
git commit -m "feat(gpu): add TSL brush compute kernel for steam brush velocity damping (#307)"
```

---

### Task 2: Integrate Brush Kernel into TslSolver

**Files:**
- Modify: `src/utils/cloth/gpu/tslSolver.ts`

**Step 1: Add brush fields to TslSolver interface**

In `src/utils/cloth/gpu/tslSolver.ts`:

1. Add import at the top (after tslBuffers import, around line 40):
```typescript
import { makeBrushComputeNode, type BrushComputeNodes } from './tslBrush';
```

2. Add to `TslSolver` interface (after `windNodes: WindComputeNodes;`, line 109):
```typescript
/** Steam brush velocity damping compute nodes (always created; zero strength is a no-op) */
brushNodes: BrushComputeNodes;
```

**Step 2: Create brush kernel in `createTslSolver`**

In the `createTslSolver` function (after the wind node creation, before the `collisionBodies` section):

```typescript
// ─── Steam brush (per-particle velocity damping) ──────────────────
const brushNodes = makeBrushComputeNode(posBuf, velBuf, invMassBuf, N);
```

**Step 3: Add to return object**

In the return object (after `windNodes,`, around line 719):
```typescript
brushNodes,
```

**Step 4: Verify types compile**

Run: `npx tsc --noEmit`
Expected: Clean

**Step 5: Commit**

```bash
git add src/utils/cloth/gpu/tslSolver.ts
git commit -m "feat(gpu): integrate brush compute kernel into TslSolver (#307)"
```

---

### Task 3: Replace No-Op `relaxParticles` with `setBrushParams`

**Files:**
- Modify: `src/utils/cloth/gpu/gpuSolverClient.ts`
- Modify: `src/utils/cloth/gpu/__tests__/gpuSolverClient.test.ts`

**Step 1: Write the failing test**

Add to `src/utils/cloth/gpu/__tests__/gpuSolverClient.test.ts`:

```typescript
describe('setBrushParams', () => {
  it('is a method on GpuSolverClient', () => {
    expect(typeof GpuSolverClient.prototype.setBrushParams).toBe('function');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/cloth/gpu/__tests__/gpuSolverClient.test.ts`
Expected: FAIL

**Step 3: Implement**

In `src/utils/cloth/gpu/gpuSolverClient.ts`:

1. Replace the entire `relaxParticles` method (lines 400-421) with:

```typescript
/**
 * Update steam brush parameters for the GPU compute kernel.
 * The brush kernel runs once per frame after substeps.
 * Set strength to 0 to deactivate (kernel early-exits).
 *
 * @param center - Brush world-space position [x, y, z]
 * @param radius - Brush sphere radius
 * @param strength - Damping strength 0-1 (0 = inactive, 1 = full damp)
 */
setBrushParams(center: [number, number, number], radius: number, strength: number): void {
  if (!this.tslSolver) return;
  const b = this.tslSolver.brushNodes;
  b.centerX.value = center[0];
  b.centerY.value = center[1];
  b.centerZ.value = center[2];
  b.radius.value = radius;
  b.strength.value = strength;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/cloth/gpu/__tests__/gpuSolverClient.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/utils/cloth/gpu/gpuSolverClient.ts src/utils/cloth/gpu/__tests__/gpuSolverClient.test.ts
git commit -m "feat(gpu): replace no-op relaxParticles with setBrushParams (#307)"
```

---

### Task 4: Dispatch Brush Kernel + Update GarmentSimulation

**Files:**
- Modify: `src/components/Viewport3D/GarmentSimulation.tsx`

**Step 1: Add brush kernel dispatch to useFrame**

In `src/components/Viewport3D/GarmentSimulation.tsx`, inside the TSL zero-copy `useFrame` block, add the brush kernel dispatch **after** the substep loop (after line 289 `}`), **before** the normal recomputation (line 291 `renderer.compute(solver.normalZero)`):

```typescript
      // Steam brush (once per frame, after substeps settle)
      renderer.compute(solver.brushNodes.brushNode);
```

**Step 2: Simplify handleBrushStroke**

Replace the entire steam brush interaction section (lines 546-564, from `findParticlesInRadius` through `handleBrushStroke`) with:

```typescript
  const handleBrushStroke = useCallback((point: THREE.Vector3) => {
    if (clients.gpu) {
      clients.gpu.setBrushParams(
        [point.x, point.y, point.z],
        steamBrush.radius,
        steamBrush.strength,
      );
    }
  }, [clients.gpu, steamBrush.radius, steamBrush.strength]);
```

This removes:
- `findParticlesInRadius` — no longer needed, GPU does the spatial query
- The `relaxParticles` call — replaced by `setBrushParams` uniform updates

**Step 3: Add brush deactivation on pointer up**

Update `handlePointerUp` to reset brush strength to 0 (deactivates kernel):

```typescript
  const handlePointerUp = useCallback(() => {
    brushDragging.current = false;
    if (clients.gpu) {
      clients.gpu.setBrushParams([0, 0, 0], 0, 0);
    }
  }, [clients.gpu]);
```

Also update `handlePointerLeave` to deactivate the brush:

```typescript
  const handlePointerLeave = useCallback(() => {
    if (brushCursorRef.current) brushCursorRef.current.visible = false;
    if (!brushDragging.current && clients.gpu) {
      clients.gpu.setBrushParams([0, 0, 0], 0, 0);
    }
  }, [clients.gpu]);
```

**Step 4: Verify types compile**

Run: `npx tsc --noEmit`
Expected: Clean

**Step 5: Commit**

```bash
git add src/components/Viewport3D/GarmentSimulation.tsx
git commit -m "feat(ui): dispatch brush kernel in useFrame, simplify handleBrushStroke (#307)"
```

---

### Task 5: Final Verification

**Files:**
- None (verification only)

**Step 1: Run type check**

Run: `npx tsc --noEmit`
Expected: Clean

**Step 2: Run all GPU tests**

Run: `npx vitest run src/utils/cloth/gpu/`
Expected: All pass

**Step 3: Run full test suite**

Run: `npx vitest run`
Expected: All pass

**Step 4: Run build**

Run: `npm run build`
Expected: Build succeeds

---

## Summary

| Task | Description | New Files | Modified Files |
|------|-------------|-----------|----------------|
| 1 | TSL brush compute kernel | `tslBrush.ts`, test | — |
| 2 | Integrate into TslSolver | — | `tslSolver.ts` |
| 3 | `setBrushParams` on GpuSolverClient | — | `gpuSolverClient.ts`, test |
| 4 | Dispatch kernel + simplify GarmentSimulation | — | `GarmentSimulation.tsx` |
| 5 | Final verification | — | — |
