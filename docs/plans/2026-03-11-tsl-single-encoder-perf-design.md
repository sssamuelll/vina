# TSL GPU Simulation Performance: Single Command Encoder + Substep Reduction

**Date**: 2026-03-11
**Status**: Approved

## Problem

The TSL GPU cloth simulation dispatches ~120 `renderer.compute()` calls per frame (15 substeps x ~8 passes each + 3 normal passes). Each call creates a separate `GPUCommandEncoder`, `ComputePass`, and `queue.submit()`, consuming ~12-20ms/frame in submission overhead alone. This leaves insufficient budget for camera interaction and rendering at 60fps.

### Rejected Approaches

- **Jacobi stretch iteration**: Replaced graph-colored Gauss-Seidel with atomicAdd accumulation + averaging. Caused visual quality regression (blocky "Minecraft" appearance) due to poor convergence with stiff compliance values (0.0). Reverted.
- **Off-thread WebGPU Worker**: GPUBuffers cannot be shared across GPUDevices, breaking the zero-copy architecture.
- **Three.js array batching** (`renderer.compute([array])`): Batches into one pass with no memory barriers between dispatches — unusable for dependent constraint passes.

## Solution

### Approach A: Single Command Encoder (Batched Compute)

Monkey-patch `backend.beginCompute` and `backend.finishCompute` to share a single `GPUCommandEncoder` across all `renderer.compute()` calls in a frame. Each dispatch still gets its own compute pass (with implicit inter-pass synchronization), but only one `queue.submit()` at the end.

#### Key Insight

WebGPU guarantees implicit synchronization between separate compute passes within the same `GPUCommandEncoder`. Dependent dispatches (preSolve -> stretch -> bend -> collision -> postSolve) each get their own pass, so memory barriers are preserved automatically.

#### Implementation

**New file: `src/utils/cloth/gpu/batchedCompute.ts`** (~25 lines)

```typescript
export function beginBatchedCompute(renderer: any): () => void {
  const backend = renderer.backend;
  const sharedEncoder = backend.device.createCommandEncoder({ label: 'clothSim' });

  const origBegin  = backend.beginCompute.bind(backend);
  const origFinish = backend.finishCompute.bind(backend);

  backend.beginCompute = function(computeGroup: any) {
    const groupGPU = this.get(computeGroup);
    groupGPU.cmdEncoderGPU = sharedEncoder;
    groupGPU.passEncoderGPU = sharedEncoder.beginComputePass({
      label: 'computeGroup_' + computeGroup.id
    });
  };

  backend.finishCompute = function(computeGroup: any) {
    this.get(computeGroup).passEncoderGPU.end();
  };

  return function endBatch() {
    backend.beginCompute = origBegin;
    backend.finishCompute = origFinish;
    backend.device.queue.submit([sharedEncoder.finish()]);
  };
}
```

**Modified file: `src/components/Viewport3D/GarmentSimulation.tsx`**

Wrap the useFrame dispatch loop:

```typescript
useFrame(({ gl }) => {
  const renderer = gl as any;
  const endBatch = beginBatchedCompute(renderer);

  for (let s = 0; s < substeps; s++) {
    renderer.compute(solver.preSolve);
    for (const stretchColor of solver.stretchColors) {
      renderer.compute(stretchColor);
    }
    if (solver.bend) renderer.compute(solver.bend);
    if (solver.seam) renderer.compute(solver.seam);
    for (const body of solver.collisionBodies) {
      renderer.compute(body.collisionNode);
    }
    renderer.compute(solver.groundClamp);
    renderer.compute(solver.postSolve);
  }
  renderer.compute(solver.normalZero);
  renderer.compute(solver.normalAccum);
  renderer.compute(solver.normalNormalize);

  endBatch(); // single queue.submit()
});
```

#### What We Skip

- `initTimestampQuery` / `prepareTimestampBuffer`: Profiling features only, no impact on correctness.

#### Expected Impact

~120 `queue.submit()` -> 1. Estimated **10-15ms saved per frame**.

### Approach B: Substep Reduction

- **Current**: 15 substeps (hardcoded)
- **Proposed**: 10 substeps for standard quality

Reduces total dispatches by ~33%. Graph-colored Gauss-Seidel converges faster per iteration than Jacobi, so 10 substeps with stiff compliance (0.0) still produces good stretch convergence.

Single-line change in `GarmentSimulation.tsx`:
```typescript
const substeps = 10; // was 15
```

Future: connect to `qualityPresets.ts` (Preview: 5, Standard: 10, Production: 15).

### Combined Expected Result

Frame GPU time: ~16-20ms -> ~3-5ms, freeing headroom for camera/rendering at 60fps.

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `src/utils/cloth/gpu/batchedCompute.ts` | Create | Batched compute utility |
| `src/components/Viewport3D/GarmentSimulation.tsx` | Modify | Wrap dispatch loop + reduce substeps |

## Testing

1. **Visual**: Verify cloth drape quality unchanged (no Minecraft artifacts)
2. **Performance**: Measure frame time before/after with browser DevTools GPU profiler
3. **Unit**: Existing `tslBuffers.test.ts` and `tslSolver.test.ts` must pass
4. **Camera**: Verify smooth orbit/pan/zoom during simulation
