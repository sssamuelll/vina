# GPU Self-Collision: Atomic i32 Accumulation Design (#293)

## Problem

The `resolveCollisions` kernel in `selfCollision.wgsl` directly writes position corrections to particle `j` via plain (non-atomic) stores. When two threads process overlapping pairs sharing the same particle, one correction is silently lost (last-write-wins). This race condition prevents enabling GPU self-collision.

## Approach

**Atomic i32 accumulation** — the same pattern already proven for GPU normals in both WGSL (`normals.wgsl`, scale=1000) and TSL (`tslSolver.ts`, scale=1e6).

Replace direct position writes with `atomicAdd` on a fixed-point i32 delta buffer, then apply averaged corrections in a separate pass.

## Decisions

- **Solver paths:** Both WGSL and TSL
- **Scale target:** Up to 200k particles (requires parallel prefix-sum)
- **Accuracy:** Performance-first — single resolve pass per substep
- **Fixed-point scale:** 1,000,000 (matches TSL normals)

## Pipeline: 5-Pass Compute (Per Substep)

```
Pass 1: hashCount         — each particle hashes to cell, atomicAdd(cellCount)
Pass 2: prefixSum         — parallel Blelloch scan → cellStart array
Pass 3: scatter           — each particle writes index into cellEntries
Pass 4: resolveCollisions — detect pairs in 27-cell neighborhood,
                            atomicAdd i32 corrections to delta buffer,
                            atomicAdd correction count per particle
Pass 5: applyCorrections  — read atomic deltas, ÷ count, i32→f32, add to
                            positions, reset delta + count buffers
```

Dispatched after stretch/bend/seam constraints, before postSolve.

## New GPU Buffers

| Buffer | Type | Size | Purpose |
|--------|------|------|---------|
| `scDeltaBuffer` | `array<atomic<i32>>` | N × 3 | Accumulated position corrections (fixed-point) |
| `scCorrCountBuffer` | `array<atomic<u32>>` | N | Correction count per particle |

Existing buffers (`cellCount`, `cellStart`, `cellEntries`, adjacency CSR) are unchanged.

## Fixed-Point Encoding

`COLLISION_SCALE = 1_000_000`

- Max single correction ≈ `thickness` (2mm) → i32 value = 2,000
- Max accumulated per particle ≈ 50 collisions → i32 value = 100,000
- Well within i32 range (±2.1 billion)
- Precision: 1 μm — negligible for collision corrections

## Parallel Prefix Sum (Replaces Serial Scan)

Blelloch work-efficient scan:
- Workgroup size 256, each thread handles 2 elements (512 per group)
- Two-phase: up-sweep (reduce) then down-sweep (distribute)
- Hierarchical for tables > 512: scan blocks → scan block sums → propagate
- 3 dispatches for large tables
- Expected: ~0.1ms at 400k cells (vs ~1.6ms serial)

Standalone `prefixSum.wgsl` module, reusable beyond self-collision.

## WGSL Changes

### `selfCollision.wgsl`

1. Add bindings for `scDeltaBuffer` (`array<atomic<i32>>`) and `scCorrCountBuffer` (`array<atomic<u32>>`)
2. In `resolveCollisions`: replace direct `positions[jdx] -= ...` writes with:
   ```wgsl
   let scale = 1000000.0;
   atomicAdd(&scDelta[idx],     i32(nx * corr * wi * scale));
   atomicAdd(&scDelta[idx+1u],  i32(ny * corr * wi * scale));
   atomicAdd(&scDelta[idx+2u],  i32(nz * corr * wi * scale));
   atomicAdd(&scDelta[jdx],     i32(-nx * corr * wj * scale));
   atomicAdd(&scDelta[jdx+1u],  i32(-ny * corr * wj * scale));
   atomicAdd(&scDelta[jdx+2u],  i32(-nz * corr * wj * scale));
   atomicAdd(&scCorrCount[i], 1u);
   atomicAdd(&scCorrCount[j], 1u);
   ```
3. Remove the per-thread local Jacobi accumulation (now handled by atomics for both i and j)
4. Add `applyCorrections` entry point:
   ```wgsl
   let count = atomicLoad(&scCorrCount[gid]);
   if (count > 0u) {
     let inv = 1.0 / (f32(count) * scale);
     positions[gid*3u]     += f32(atomicLoad(&scDelta[gid*3u])) * inv;
     positions[gid*3u+1u]  += f32(atomicLoad(&scDelta[gid*3u+1u])) * inv;
     positions[gid*3u+2u]  += f32(atomicLoad(&scDelta[gid*3u+2u])) * inv;
   }
   atomicStore(&scDelta[gid*3u], 0);
   atomicStore(&scDelta[gid*3u+1u], 0);
   atomicStore(&scDelta[gid*3u+2u], 0);
   atomicStore(&scCorrCount[gid], 0u);
   ```

### `prefixSum.wgsl` (New)

Standalone parallel Blelloch scan. Entry points:
- `scanBlock` — scan within a workgroup (512 elements)
- `scanBlockSums` — scan the per-block sums
- `propagate` — add block offsets to each element

### `gpuSolver.ts`

- Create `scDeltaBuffer` and `scCorrCountBuffer` in `initSelfCollision()`
- Create prefix-sum pipelines
- Replace serial prefix-sum dispatch with parallel scan dispatches
- Add `applyCorrections` pipeline + dispatch after resolve
- Clear delta + count buffers at start of self-collision sequence

## TSL Changes

### `tslBuffers.ts`

Add to `TslBufferSet`:
```typescript
scDeltaSBA: StorageBufferAttribute | null;       // Int32Array, N×3
scCorrCountSBA: StorageBufferAttribute | null;    // Uint32Array, N
scCellCountSBA: StorageBufferAttribute | null;    // Uint32Array, tableSize
scCellStartSBA: StorageBufferAttribute | null;    // Uint32Array, tableSize
scCellEntriesSBA: StorageBufferAttribute | null;  // Uint32Array, N
scAdjOffsetsSBA: StorageBufferAttribute | null;   // Uint32Array, N+1
scAdjNeighborsSBA: StorageBufferAttribute | null; // Uint32Array, adjacency edges
scTableSize: number;
```

Created only when `selfCollision: true` in config.

### `tslSelfCollision.ts` (New Module)

TSL `Fn()` compute functions:
- `makeHashCountFn(positionBuf, cellCountBuf, params)` — hash + atomicAdd
- `makePrefixSumFn(cellCountBuf, cellStartBuf, tableSize)` — parallel scan
- `makeScatterFn(positionBuf, cellCountBuf, cellStartBuf, cellEntriesBuf, params)`
- `makeResolveCollisionsFn(positionBuf, invMassBuf, cellStartBuf, cellEntriesBuf, adjBufs, deltaBuf, corrCountBuf, params)` — detect + atomicAdd
- `makeApplyCollisionCorrectionsFn(positionBuf, deltaBuf, corrCountBuf, N)` — drain + reset

### `tslSolver.ts`

- Add `selfCollision: boolean` to `TslSolverConfig` (default false)
- Create self-collision compute nodes in `createTslSolver()` when enabled
- Wire into dispatch sequence: after body collision, before postSolve
- Expose `selfCollisionNodes` on `TslSolver` interface for `renderer.compute()`

## Solver Integration

Both paths share:
- `buildAdjacency()` from `selfCollision.ts` — reuse existing CPU function
- `nextPrime(N * 2)` for hash table sizing
- `config.thickness` for collision distance (default 0.002m)
- Gated by `selfCollision: boolean` config flag

## Testing

1. **`tslSelfCollision.test.ts`** — mock SBA, verify buffer setup and Fn creation
2. **`selfCollision.wgsl` unit test** — extend existing tests, verify atomic accumulation matches CPU reference on known collision scenarios
3. **`gpuSolverClient.test.ts`** — enable `selfCollision: true`, verify no NaN after init
4. **`prefixSum.test.ts`** — verify parallel scan matches serial scan on various sizes

## Files

| Action | File |
|--------|------|
| Modify | `src/utils/cloth/gpu/shaders/selfCollision.wgsl` — atomic accumulation + apply pass |
| Create | `src/utils/cloth/gpu/shaders/prefixSum.wgsl` — parallel Blelloch scan |
| Modify | `src/utils/cloth/gpu/gpuSolver.ts` — new buffers, parallel scan, apply pass |
| Modify | `src/utils/cloth/gpu/tslBuffers.ts` — add self-collision buffer slots |
| Create | `src/utils/cloth/gpu/tslSelfCollision.ts` — TSL self-collision compute functions |
| Modify | `src/utils/cloth/gpu/tslSolver.ts` — wire self-collision into dispatch |
| Create | `src/utils/cloth/gpu/__tests__/tslSelfCollision.test.ts` |
| Create | `src/utils/cloth/gpu/__tests__/prefixSum.test.ts` |
| Modify | `src/utils/cloth/gpu/__tests__/gpuSolverClient.test.ts` — self-collision integration |
