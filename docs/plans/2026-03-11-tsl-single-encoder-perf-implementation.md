# TSL Single Command Encoder Performance Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce TSL GPU cloth simulation frame time from ~16-20ms to ~3-5ms by batching all GPU compute submissions into a single command encoder per frame, and reducing substeps from 15 to 10.

**Architecture:** Monkey-patch Three.js WebGPU backend's `beginCompute`/`finishCompute` methods to share a single `GPUCommandEncoder` across all `renderer.compute()` calls within a frame. Each dispatch still gets its own compute pass (preserving implicit inter-pass synchronization). A single `queue.submit()` replaces ~120 separate submissions.

**Tech Stack:** Three.js r175 WebGPU backend, TSL compute nodes, WebGPU API

---

### Task 1: Create batchedCompute utility

**Files:**
- Create: `src/utils/cloth/gpu/batchedCompute.ts`
- Test: `src/utils/cloth/gpu/__tests__/batchedCompute.test.ts`

**Step 1: Write the test file**

Create `src/utils/cloth/gpu/__tests__/batchedCompute.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { beginBatchedCompute } from '../batchedCompute';

function makeMockRenderer() {
  const submitFn = vi.fn();
  const finishFn = vi.fn(() => 'finished-buffer');
  const endFn = vi.fn();
  const beginComputePassFn = vi.fn(() => ({ end: endFn }));
  const createCommandEncoderFn = vi.fn(() => ({
    beginComputePass: beginComputePassFn,
    finish: finishFn,
  }));

  const dataMap = new Map<object, Record<string, unknown>>();

  const backend = {
    device: {
      createCommandEncoder: createCommandEncoderFn,
      queue: { submit: submitFn },
    },
    get(key: object) {
      if (!dataMap.has(key)) dataMap.set(key, {});
      return dataMap.get(key)!;
    },
    beginCompute: vi.fn(),
    finishCompute: vi.fn(),
  };

  return {
    backend,
    mocks: { submitFn, finishFn, endFn, beginComputePassFn, createCommandEncoderFn },
  };
}

describe('beginBatchedCompute', () => {
  it('creates exactly one command encoder for the batch', () => {
    const { backend, mocks } = makeMockRenderer();
    const renderer = { backend };

    const endBatch = beginBatchedCompute(renderer);

    // Simulate 3 compute calls
    const group1 = { id: 1 };
    const group2 = { id: 2 };
    const group3 = { id: 3 };

    backend.beginCompute(group1);
    backend.finishCompute(group1);
    backend.beginCompute(group2);
    backend.finishCompute(group2);
    backend.beginCompute(group3);
    backend.finishCompute(group3);

    // Only 1 encoder created (by beginBatchedCompute), not 3
    expect(mocks.createCommandEncoderFn).toHaveBeenCalledTimes(1);
    // 3 compute passes created (one per beginCompute)
    expect(mocks.beginComputePassFn).toHaveBeenCalledTimes(3);
    // 3 passes ended
    expect(mocks.endFn).toHaveBeenCalledTimes(3);
    // No submit yet
    expect(mocks.submitFn).not.toHaveBeenCalled();

    endBatch();

    // Now submitted once
    expect(mocks.submitFn).toHaveBeenCalledTimes(1);
    expect(mocks.submitFn).toHaveBeenCalledWith(['finished-buffer']);
  });

  it('restores original methods after endBatch', () => {
    const { backend } = makeMockRenderer();
    const renderer = { backend };

    const origBegin = backend.beginCompute;
    const origFinish = backend.finishCompute;

    const endBatch = beginBatchedCompute(renderer);

    // Methods are overridden
    expect(backend.beginCompute).not.toBe(origBegin);
    expect(backend.finishCompute).not.toBe(origFinish);

    endBatch();

    // Methods are restored
    expect(backend.beginCompute).toBe(origBegin);
    expect(backend.finishCompute).toBe(origFinish);
  });

  it('sets cmdEncoderGPU and passEncoderGPU on group data', () => {
    const { backend } = makeMockRenderer();
    const renderer = { backend };

    beginBatchedCompute(renderer);

    const group = { id: 42 };
    backend.beginCompute(group);

    const groupData = backend.get(group);
    expect(groupData.cmdEncoderGPU).toBeDefined();
    expect(groupData.passEncoderGPU).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/cloth/gpu/__tests__/batchedCompute.test.ts`
Expected: FAIL — `Cannot find module '../batchedCompute'`

**Step 3: Write the implementation**

Create `src/utils/cloth/gpu/batchedCompute.ts`:

```typescript
/**
 * Batched GPU compute — reduces ~N separate queue.submit() calls to 1.
 *
 * Monkey-patches the Three.js WebGPU backend's beginCompute/finishCompute
 * to share a single GPUCommandEncoder across all renderer.compute() calls.
 * Each dispatch still gets its own compute pass, so WebGPU's implicit
 * inter-pass synchronization (memory barriers) is preserved.
 *
 * Usage:
 *   const endBatch = beginBatchedCompute(renderer);
 *   renderer.compute(nodeA);
 *   renderer.compute(nodeB);
 *   // ...
 *   endBatch(); // single queue.submit()
 *
 * @module batchedCompute
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function beginBatchedCompute(renderer: any): () => void {
  const backend = renderer.backend;
  const device = backend.device;

  const sharedEncoder = device.createCommandEncoder({ label: 'clothSim_batched' });

  const origBegin = backend.beginCompute.bind(backend);
  const origFinish = backend.finishCompute.bind(backend);

  backend.beginCompute = function (computeGroup: { id: number | string }) {
    const groupGPU = this.get(computeGroup);
    groupGPU.cmdEncoderGPU = sharedEncoder;
    groupGPU.passEncoderGPU = sharedEncoder.beginComputePass({
      label: 'computeGroup_' + computeGroup.id,
    });
  };

  backend.finishCompute = function (computeGroup: { id: number | string }) {
    this.get(computeGroup).passEncoderGPU.end();
  };

  return function endBatch() {
    backend.beginCompute = origBegin;
    backend.finishCompute = origFinish;
    device.queue.submit([sharedEncoder.finish()]);
  };
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/cloth/gpu/__tests__/batchedCompute.test.ts`
Expected: 3 tests PASS

**Step 5: Type check**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 6: Commit**

```bash
git add src/utils/cloth/gpu/batchedCompute.ts src/utils/cloth/gpu/__tests__/batchedCompute.test.ts
git commit -m "feat: add batchedCompute utility for single GPU command encoder"
```

---

### Task 2: Integrate batched compute into GarmentSimulation

**Files:**
- Modify: `src/components/Viewport3D/GarmentSimulation.tsx:256-288`

**Step 1: Add import**

At the top of `GarmentSimulation.tsx`, add the import. Find the existing GPU-related imports (around line 19-20) and add after them:

```typescript
import { beginBatchedCompute } from '../../utils/cloth/gpu/batchedCompute';
```

**Step 2: Wrap the dispatch loop with batched compute**

Replace lines 262-288 of `GarmentSimulation.tsx` (the TSL zero-copy path):

Before:
```typescript
    // ─── TSL zero-copy path ──────────────────────────────────────────
    if (solver) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const renderer = gl as any;
      const substeps = 15;

      for (let s = 0; s < substeps; s++) {
        renderer.compute(solver.preSolve);
        for (const stretchColor of solver.stretchColors) {
          renderer.compute(stretchColor);
        }
        if (solver.bend) renderer.compute(solver.bend);
        if (solver.seam) renderer.compute(solver.seam);
        // Body collision: BVH traversal per body per substep
        for (const body of solver.collisionBodies) {
          renderer.compute(body.collisionNode);
        }
        renderer.compute(solver.groundClamp);
        renderer.compute(solver.postSolve);
      }

      // Compute smooth vertex normals from final positions (once per frame)
      renderer.compute(solver.normalZero);
      renderer.compute(solver.normalAccum);
      renderer.compute(solver.normalNormalize);

      return;
    }
```

After:
```typescript
    // ─── TSL zero-copy path ──────────────────────────────────────────
    if (solver) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const renderer = gl as any;
      const substeps = 10;
      const endBatch = beginBatchedCompute(renderer);

      for (let s = 0; s < substeps; s++) {
        renderer.compute(solver.preSolve);
        for (const stretchColor of solver.stretchColors) {
          renderer.compute(stretchColor);
        }
        if (solver.bend) renderer.compute(solver.bend);
        if (solver.seam) renderer.compute(solver.seam);
        // Body collision: BVH traversal per body per substep
        for (const body of solver.collisionBodies) {
          renderer.compute(body.collisionNode);
        }
        renderer.compute(solver.groundClamp);
        renderer.compute(solver.postSolve);
      }

      // Compute smooth vertex normals from final positions (once per frame)
      renderer.compute(solver.normalZero);
      renderer.compute(solver.normalAccum);
      renderer.compute(solver.normalNormalize);

      endBatch();
      return;
    }
```

Changes: (a) `substeps = 10` instead of 15, (b) `beginBatchedCompute(renderer)` before the loop, (c) `endBatch()` after normals.

**Step 3: Type check**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 4: Run existing unit tests**

Run: `npx vitest run src/utils/cloth/gpu/__tests__/`
Expected: All tests pass (tslBuffers, tslSolver, batchedCompute)

**Step 5: Commit**

```bash
git add src/components/Viewport3D/GarmentSimulation.tsx
git commit -m "perf: batch GPU compute into single command encoder, reduce substeps to 10"
```

---

### Task 3: Manual visual + performance verification

**Step 1: Start dev server**

Run: `npm run dev`

**Step 2: Open browser with GPU profiling**

Open Chrome DevTools → Performance tab → check "GPU" option.

**Step 3: Verify visual quality**

1. Load a garment with multiple pieces
2. Start simulation
3. Verify cloth drapes naturally — no blocky/Minecraft artifacts
4. Verify seams hold together
5. Verify collision with avatar body works

**Step 4: Verify performance**

1. During simulation, check frame time in DevTools Performance panel
2. Expected: GPU frame time ~3-5ms (was ~16-20ms)
3. Orbit camera during simulation — should be smooth 60fps

**Step 5: Verify camera responsiveness**

1. While simulation is running, orbit/pan/zoom the camera
2. Should feel smooth and responsive, no choppiness

**Step 6: If visual quality degraded with 10 substeps**

Increase back to 12 in `GarmentSimulation.tsx` and retest. The batched encoder (Approach A) provides the main perf gain; substep count is tunable.
