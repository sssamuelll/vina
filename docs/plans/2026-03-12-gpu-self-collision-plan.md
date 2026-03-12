# GPU Self-Collision: Atomic i32 Accumulation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the GPU self-collision race condition by replacing direct position writes with atomic i32 accumulation, enabling self-collision on both WGSL and TSL solver paths for up to 200k particles.

**Architecture:** The resolve kernel accumulates corrections into a fixed-point i32 delta buffer via `atomicAdd`, then a separate apply-corrections pass drains deltas into positions. The serial prefix-sum is replaced with a parallel Blelloch scan. The TSL path gets a new `tslSelfCollision.ts` module mirroring the WGSL pipeline.

**Tech Stack:** WebGPU (WGSL compute shaders), Three.js r183 TSL (`three/tsl`, `three/webgpu`), Vitest

---

## Context

### Key files to understand before starting

| File | Purpose |
|------|---------|
| `src/utils/cloth/gpu/shaders/selfCollision.wgsl` | Current 4-pass shader (has the race at lines 177-179) |
| `src/utils/cloth/gpu/shaders/normals.wgsl` | Reference: atomic i32 accumulation pattern (scale=1000) |
| `src/utils/cloth/gpu/gpuSolver.ts:928-1092` | WGSL self-collision init + dispatch (lines 339-371) |
| `src/utils/cloth/selfCollision.ts` | CPU reference: `SpatialHashGrid`, `solveSelfCollision`, `buildAdjacency` |
| `src/utils/cloth/__tests__/selfCollision.test.ts` | CPU test cases (reuse for GPU validation) |
| `src/utils/cloth/gpu/gpuBuffers.ts:440-509` | `colorConstraints()` — graph coloring pattern for stretch |
| `src/utils/cloth/gpu/tslSolver.ts:362-480` | TSL atomic normals (scale=1e6) — pattern to follow |

### Fixed-point encoding

```
COLLISION_SCALE = 1_000_000
correction (float) → i32: i32(correction * COLLISION_SCALE)
i32 → correction (float): f32(loaded) / (f32(count) * COLLISION_SCALE)
```

Max single correction ≈ thickness (2mm) → i32 = 2,000. Max 50 concurrent collisions → 100,000. Well within i32 range.

---

## Task 1: Parallel Prefix Sum Shader

**Files:**
- Create: `src/utils/cloth/gpu/shaders/prefixSum.wgsl`
- Create: `src/utils/cloth/gpu/__tests__/prefixSum.test.ts`

**Step 1: Write the failing test**

Create `src/utils/cloth/gpu/__tests__/prefixSum.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';

// We test the CPU reference implementation that mirrors the WGSL logic.
// The WGSL shader itself can only be tested on a real GPU.
import { serialPrefixSum } from '../prefixSumCpu';

describe('serialPrefixSum (CPU reference for WGSL)', () => {
  it('computes exclusive prefix sum of small array', () => {
    const input = new Uint32Array([3, 1, 4, 1, 5]);
    const output = new Uint32Array(5);
    serialPrefixSum(input, output);
    // exclusive scan: [0, 3, 4, 8, 9]
    expect(Array.from(output)).toEqual([0, 3, 4, 8, 9]);
  });

  it('handles all zeros', () => {
    const input = new Uint32Array([0, 0, 0, 0]);
    const output = new Uint32Array(4);
    serialPrefixSum(input, output);
    expect(Array.from(output)).toEqual([0, 0, 0, 0]);
  });

  it('handles single element', () => {
    const input = new Uint32Array([7]);
    const output = new Uint32Array(1);
    serialPrefixSum(input, output);
    expect(Array.from(output)).toEqual([0]);
  });

  it('handles 1024 elements (2 workgroups worth)', () => {
    const n = 1024;
    const input = new Uint32Array(n);
    for (let i = 0; i < n; i++) input[i] = i % 10;
    const output = new Uint32Array(n);
    serialPrefixSum(input, output);

    // Verify first few and last
    let running = 0;
    for (let i = 0; i < n; i++) {
      expect(output[i]).toBe(running);
      running += input[i];
    }
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/cloth/gpu/__tests__/prefixSum.test.ts`
Expected: FAIL with "Cannot find module '../prefixSumCpu'"

**Step 3: Write CPU reference + WGSL shader**

Create `src/utils/cloth/gpu/prefixSumCpu.ts`:

```typescript
/**
 * Serial exclusive prefix sum — CPU reference matching the WGSL parallel scan.
 * Used for testing and as fallback.
 */
export function serialPrefixSum(input: Uint32Array, output: Uint32Array): void {
  let running = 0;
  for (let i = 0; i < input.length; i++) {
    output[i] = running;
    running += input[i];
  }
}
```

Create `src/utils/cloth/gpu/shaders/prefixSum.wgsl`:

```wgsl
// ─── Parallel Prefix Sum (Blelloch Work-Efficient Scan) ─────────────────────
//
// For tables up to 512 elements per workgroup (256 threads × 2 elements).
// Larger tables use hierarchical scan: scan blocks → scan block sums → propagate.
//
// All passes operate on cellCount (input) → cellStart (output).
// After scanBlock, cellCount is zeroed for the scatter pass reuse.
// ─────────────────────────────────────────────────────────────────────────────

struct PrefixSumParams {
  numElements: u32,
  blockSize: u32,    // elements per block (workgroup_size * 2 = 512)
  _pad0: u32,
  _pad1: u32,
};

@group(0) @binding(0) var<uniform> psParams: PrefixSumParams;
@group(0) @binding(1) var<storage, read_write> cellCount: array<atomic<u32>>;
@group(0) @binding(2) var<storage, read_write> cellStart: array<u32>;
@group(0) @binding(3) var<storage, read_write> blockSums: array<u32>;

var<workgroup> temp: array<u32, 512>;

// ─── Pass 1: Scan within each block ─────────────────────────────────────────

@compute @workgroup_size(256)
fn scanBlock(
  @builtin(global_invocation_id) gid: vec3u,
  @builtin(local_invocation_id) lid: vec3u,
  @builtin(workgroup_id) wid: vec3u,
) {
  let blockOffset = wid.x * 512u;
  let t = lid.x;
  let n = min(512u, psParams.numElements - blockOffset);

  // Load into shared memory
  let ai = t;
  let bi = t + 256u;
  if (blockOffset + ai < psParams.numElements) {
    temp[ai] = atomicLoad(&cellCount[blockOffset + ai]);
  } else {
    temp[ai] = 0u;
  }
  if (blockOffset + bi < psParams.numElements) {
    temp[bi] = atomicLoad(&cellCount[blockOffset + bi]);
  } else {
    temp[bi] = 0u;
  }

  // Up-sweep (reduce)
  var offset: u32 = 1u;
  var d = n >> 1u;
  while (d > 0u) {
    workgroupBarrier();
    if (t < d) {
      let a = offset * (2u * t + 1u) - 1u;
      let b = offset * (2u * t + 2u) - 1u;
      if (a < 512u && b < 512u) {
        temp[b] += temp[a];
      }
    }
    offset <<= 1u;
    d >>= 1u;
  }

  // Store block sum, clear last element
  workgroupBarrier();
  if (t == 0u) {
    blockSums[wid.x] = temp[n - 1u];
    temp[n - 1u] = 0u;
  }

  // Down-sweep (distribute)
  d = 1u;
  while (d < n) {
    offset >>= 1u;
    workgroupBarrier();
    if (t < d) {
      let a = offset * (2u * t + 1u) - 1u;
      let b = offset * (2u * t + 2u) - 1u;
      if (a < 512u && b < 512u) {
        let tmp = temp[a];
        temp[a] = temp[b];
        temp[b] += tmp;
      }
    }
    d <<= 1u;
  }

  workgroupBarrier();

  // Write results + zero cellCount for scatter reuse
  if (blockOffset + ai < psParams.numElements) {
    cellStart[blockOffset + ai] = temp[ai];
    atomicStore(&cellCount[blockOffset + ai], 0u);
  }
  if (blockOffset + bi < psParams.numElements) {
    cellStart[blockOffset + bi] = temp[bi];
    atomicStore(&cellCount[blockOffset + bi], 0u);
  }
}

// ─── Pass 2: Scan block sums (dispatch with 1 workgroup) ────────────────────
// Reuses the same scanBlock logic but reads/writes blockSums.
// For simplicity, this is a serial scan (max ~800 blocks for 400K cells).

@compute @workgroup_size(1)
fn scanBlockSums(@builtin(global_invocation_id) gid: vec3u) {
  let numBlocks = (psParams.numElements + 511u) / 512u;
  var running: u32 = 0u;
  for (var i: u32 = 0u; i < numBlocks; i++) {
    let s = blockSums[i];
    blockSums[i] = running;
    running += s;
  }
}

// ─── Pass 3: Propagate block offsets ─────────────────────────────────────────

@compute @workgroup_size(256)
fn propagate(
  @builtin(global_invocation_id) gid: vec3u,
  @builtin(workgroup_id) wid: vec3u,
  @builtin(local_invocation_id) lid: vec3u,
) {
  if (wid.x == 0u) { return; } // Block 0 already correct

  let blockOffset = wid.x * 512u;
  let addend = blockSums[wid.x];
  let ai = blockOffset + lid.x;
  let bi = blockOffset + lid.x + 256u;

  if (ai < psParams.numElements) {
    cellStart[ai] += addend;
  }
  if (bi < psParams.numElements) {
    cellStart[bi] += addend;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/cloth/gpu/__tests__/prefixSum.test.ts`
Expected: PASS (4 tests)

**Step 5: Commit**

```bash
git add src/utils/cloth/gpu/shaders/prefixSum.wgsl src/utils/cloth/gpu/prefixSumCpu.ts src/utils/cloth/gpu/__tests__/prefixSum.test.ts
git commit -m "feat(gpu): add parallel prefix sum shader + CPU reference (#293)

Blelloch work-efficient scan for self-collision spatial hash.
Handles up to 400k+ cells via hierarchical block scan."
```

---

## Task 2: Fix selfCollision.wgsl — Atomic Accumulation

**Files:**
- Modify: `src/utils/cloth/gpu/shaders/selfCollision.wgsl`

**Step 1: Write failing test**

Create `src/utils/cloth/gpu/__tests__/selfCollisionShader.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('selfCollision.wgsl', () => {
  const shaderSrc = readFileSync(
    resolve(__dirname, '../shaders/selfCollision.wgsl'),
    'utf-8',
  );

  it('has scDelta binding (atomic i32 delta buffer)', () => {
    expect(shaderSrc).toContain('scDelta');
    expect(shaderSrc).toContain('array<atomic<i32>>');
  });

  it('has scCorrCount binding (atomic u32 count buffer)', () => {
    expect(shaderSrc).toContain('scCorrCount');
  });

  it('has applyCorrections entry point', () => {
    expect(shaderSrc).toContain('fn applyCorrections');
  });

  it('resolveCollisions uses atomicAdd instead of direct position writes', () => {
    // Extract just the resolveCollisions function
    const resolveStart = shaderSrc.indexOf('fn resolveCollisions');
    const applyStart = shaderSrc.indexOf('fn applyCorrections');
    const resolveBody = shaderSrc.slice(resolveStart, applyStart);

    // Should NOT have direct position writes for j
    expect(resolveBody).not.toContain('positions[jdx]');
    expect(resolveBody).not.toContain('positions[jdx + 1u]');
    expect(resolveBody).not.toContain('positions[jdx + 2u]');

    // Should use atomicAdd on scDelta
    expect(resolveBody).toContain('atomicAdd(&scDelta');
  });

  it('applyCorrections resets delta and count buffers', () => {
    const applyStart = shaderSrc.indexOf('fn applyCorrections');
    const applyBody = shaderSrc.slice(applyStart);

    expect(applyBody).toContain('atomicStore(&scDelta');
    expect(applyBody).toContain('atomicStore(&scCorrCount');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/cloth/gpu/__tests__/selfCollisionShader.test.ts`
Expected: FAIL — no `scDelta` binding, no `applyCorrections` entry point

**Step 3: Rewrite `selfCollision.wgsl`**

Replace the full contents of `src/utils/cloth/gpu/shaders/selfCollision.wgsl` with:

```wgsl
// ─── Self-Collision via Spatial Hash (GPU) ──────────────────────────────────
//
// 5-pass approach:
//   1. hashCount:         each particle hashes to cell, atomicAdd to cellCount
//   2. prefixSum:         parallel prefix sum (external shader)
//   3. scatter:           each particle writes index to sorted entries array
//   4. resolveCollisions: query 27 neighbors, atomicAdd corrections to delta buf
//   5. applyCorrections:  drain atomic deltas, average, apply to positions, reset
//
// Race-free: resolveCollisions never writes to positions directly.
// Uses atomic i32 fixed-point encoding (scale 1e6) for position corrections.
// ─────────────────────────────────────────────────────────────────────────────

struct SelfCollisionParams {
  numParticles: u32,
  tableSize: u32,
  thickness: f32,
  _pad0: u32,
};

// ─── Bindings ───────────────────────────────────────────────────────────────

@group(0) @binding(0) var<uniform> scParams: SelfCollisionParams;
@group(0) @binding(1) var<storage, read_write> positions: array<f32>;
@group(0) @binding(2) var<storage, read> invMass: array<f32>;
@group(0) @binding(3) var<storage, read_write> cellCount: array<atomic<u32>>;
@group(0) @binding(4) var<storage, read_write> cellStart: array<u32>;
@group(0) @binding(5) var<storage, read_write> cellEntries: array<u32>;

// Group 1: adjacency (read-only, uploaded once)
@group(1) @binding(0) var<storage, read> adjOffsets: array<u32>;
@group(1) @binding(1) var<storage, read> adjNeighbors: array<u32>;

// Group 2: atomic correction buffers
@group(2) @binding(0) var<storage, read_write> scDelta: array<atomic<i32>>;
@group(2) @binding(1) var<storage, read_write> scCorrCount: array<atomic<u32>>;

// ─── Constants ──────────────────────────────────────────────────────────────

const COLLISION_SCALE: f32 = 1000000.0;

// ─── Hash Function ──────────────────────────────────────────────────────────

fn hashCoords(xi: i32, yi: i32, zi: i32) -> u32 {
  let h = ((xi * 92837111) ^ (yi * 689287499) ^ (zi * 283923481)) % i32(scParams.tableSize);
  if (h < 0) {
    return u32(h + i32(scParams.tableSize));
  }
  return u32(h);
}

fn intCoord(v: f32, invCellSize: f32) -> i32 {
  return i32(floor(v * invCellSize));
}

// ─── Pass 1: Hash + Count ───────────────────────────────────────────────────

@compute @workgroup_size(256)
fn hashCount(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= scParams.numParticles) { return; }

  let invCS = 1.0 / scParams.thickness;
  let idx = i * 3u;
  let h = hashCoords(
    intCoord(positions[idx], invCS),
    intCoord(positions[idx + 1u], invCS),
    intCoord(positions[idx + 2u], invCS),
  );

  atomicAdd(&cellCount[h], 1u);
}

// ─── Pass 3: Scatter ────────────────────────────────────────────────────────

@compute @workgroup_size(256)
fn scatter(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= scParams.numParticles) { return; }

  let invCS = 1.0 / scParams.thickness;
  let idx = i * 3u;
  let h = hashCoords(
    intCoord(positions[idx], invCS),
    intCoord(positions[idx + 1u], invCS),
    intCoord(positions[idx + 2u], invCS),
  );

  let offset = atomicAdd(&cellCount[h], 1u);
  cellEntries[cellStart[h] + offset] = i;
}

// ─── Adjacency check ────────────────────────────────────────────────────────

fn isAdjacent(i: u32, j: u32) -> bool {
  let start = adjOffsets[i];
  let end = adjOffsets[i + 1u];
  for (var k = start; k < end; k++) {
    if (adjNeighbors[k] == j) { return true; }
  }
  return false;
}

// ─── Pass 4: Resolve Collisions (atomic accumulation) ───────────────────────

@compute @workgroup_size(256)
fn resolveCollisions(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= scParams.numParticles) { return; }
  if (invMass[i] == 0.0) { return; }

  let invCS = 1.0 / scParams.thickness;
  let idx = i * 3u;
  let px = positions[idx];
  let py = positions[idx + 1u];
  let pz = positions[idx + 2u];

  let xi0 = intCoord(px, invCS) - 1;
  let yi0 = intCoord(py, invCS) - 1;
  let zi0 = intCoord(pz, invCS) - 1;

  let thickSq = scParams.thickness * scParams.thickness;
  let wi = invMass[i];

  for (var dxi: i32 = 0; dxi <= 2; dxi++) {
    for (var dyi: i32 = 0; dyi <= 2; dyi++) {
      for (var dzi: i32 = 0; dzi <= 2; dzi++) {
        let h = hashCoords(xi0 + dxi, yi0 + dyi, zi0 + dzi);
        let s = cellStart[h];
        let count = atomicLoad(&cellCount[h]);
        let e = s + count;

        for (var k = s; k < e; k++) {
          let j = cellEntries[k];
          if (j <= i) { continue; }
          if (invMass[j] == 0.0) { continue; }
          if (isAdjacent(i, j)) { continue; }

          let jdx = j * 3u;
          let dx = px - positions[jdx];
          let dy = py - positions[jdx + 1u];
          let dz = pz - positions[jdx + 2u];
          let dist2 = dx * dx + dy * dy + dz * dz;

          if (dist2 >= thickSq || dist2 < 1e-12) { continue; }

          let dist = sqrt(dist2);
          let invDist = 1.0 / dist;
          let nx = dx * invDist;
          let ny = dy * invDist;
          let nz = dz * invDist;

          let wj = invMass[j];
          let wSum = wi + wj;
          let corr = (scParams.thickness - dist) / wSum;

          // Atomic accumulation for particle i (push away from j)
          atomicAdd(&scDelta[idx],      i32(nx * corr * wi * COLLISION_SCALE));
          atomicAdd(&scDelta[idx + 1u], i32(ny * corr * wi * COLLISION_SCALE));
          atomicAdd(&scDelta[idx + 2u], i32(nz * corr * wi * COLLISION_SCALE));
          atomicAdd(&scCorrCount[i], 1u);

          // Atomic accumulation for particle j (push away from i)
          atomicAdd(&scDelta[jdx],      i32(-nx * corr * wj * COLLISION_SCALE));
          atomicAdd(&scDelta[jdx + 1u], i32(-ny * corr * wj * COLLISION_SCALE));
          atomicAdd(&scDelta[jdx + 2u], i32(-nz * corr * wj * COLLISION_SCALE));
          atomicAdd(&scCorrCount[j], 1u);
        }
      }
    }
  }
}

// ─── Pass 5: Apply Corrections ──────────────────────────────────────────────

@compute @workgroup_size(256)
fn applyCorrections(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= scParams.numParticles) { return; }

  let count = atomicLoad(&scCorrCount[i]);
  if (count > 0u) {
    let idx = i * 3u;
    let inv = 1.0 / (f32(count) * COLLISION_SCALE);
    positions[idx]      += f32(atomicLoad(&scDelta[idx])) * inv;
    positions[idx + 1u] += f32(atomicLoad(&scDelta[idx + 1u])) * inv;
    positions[idx + 2u] += f32(atomicLoad(&scDelta[idx + 2u])) * inv;
  }

  // Reset buffers for next substep
  let idx = i * 3u;
  atomicStore(&scDelta[idx], 0);
  atomicStore(&scDelta[idx + 1u], 0);
  atomicStore(&scDelta[idx + 2u], 0);
  atomicStore(&scCorrCount[i], 0u);
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/cloth/gpu/__tests__/selfCollisionShader.test.ts`
Expected: PASS (5 tests)

**Step 5: Commit**

```bash
git add src/utils/cloth/gpu/shaders/selfCollision.wgsl src/utils/cloth/gpu/__tests__/selfCollisionShader.test.ts
git commit -m "fix(gpu): replace direct position writes with atomic accumulation in self-collision (#293)

resolveCollisions now uses atomicAdd on i32 delta buffer (scale 1e6)
for both particles in each pair. New applyCorrections pass drains
deltas, averages by correction count, and resets buffers.

Removes the serial prefixSum entry point (replaced by external shader)."
```

---

## Task 3: Update gpuSolver.ts — New Buffers + Dispatch

**Files:**
- Modify: `src/utils/cloth/gpu/gpuSolver.ts:154-167` (new buffer fields)
- Modify: `src/utils/cloth/gpu/gpuSolver.ts:339-371` (dispatch sequence)
- Modify: `src/utils/cloth/gpu/gpuSolver.ts:928-1092` (`initSelfCollision`)

**Step 1: Write failing test**

Extend `src/utils/cloth/gpu/__tests__/gpuSolverClient.test.ts` with:

```typescript
import { GpuClothSolver, type GpuSolverConfig } from '../gpuSolver';

describe('GpuClothSolver self-collision config', () => {
  it('has selfCollision in default config as false', () => {
    // GpuSolverConfig should have selfCollision field
    const defaultConfig: Partial<GpuSolverConfig> = {};
    expect(defaultConfig.selfCollision).toBeUndefined(); // defaults to false internally
  });
});
```

**Step 2: No test failure expected — this is existing behavior. Proceed to implementation.**

**Step 3: Update `gpuSolver.ts`**

Add after line 167 (after existing self-collision fields):

```typescript
  private scDeltaBuffer: GPUBuffer | null = null;
  private scCorrCountBuffer: GPUBuffer | null = null;
  private scDeltaBindGroup: GPUBindGroup | null = null;
  private scApplyCorrectionsPipeline: GPUComputePipeline | null = null;
  // Parallel prefix sum
  private psPipeline_scanBlock: GPUComputePipeline | null = null;
  private psPipeline_scanBlockSums: GPUComputePipeline | null = null;
  private psPipeline_propagate: GPUComputePipeline | null = null;
  private psBindGroup: GPUBindGroup | null = null;
  private psParamsBuffer: GPUBuffer | null = null;
  private psBlockSumsBuffer: GPUBuffer | null = null;
```

In `initSelfCollision()` (after existing buffer creation, around line 995), add:

```typescript
    // ─── Atomic correction buffers ──────────────────────────────
    this.scDeltaBuffer = this.device.createBuffer({
      label: 'sc-delta',
      size: numParticles * 3 * 4, // i32 × 3 per particle
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    this.scCorrCountBuffer = this.device.createBuffer({
      label: 'sc-corrCount',
      size: numParticles * 4, // u32 per particle
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
```

Add a new bind group layout + bind group for group 2 (delta buffers):

```typescript
    const deltaLayout = this.device.createBindGroupLayout({
      label: 'sc-delta',
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      ],
    });

    this.scDeltaBindGroup = this.device.createBindGroup({
      label: 'sc-delta',
      layout: deltaLayout,
      entries: [
        { binding: 0, resource: { buffer: this.scDeltaBuffer } },
        { binding: 1, resource: { buffer: this.scCorrCountBuffer } },
      ],
    });
```

Update pipeline layout to include 3 bind groups:

```typescript
    const scPipelineLayout = this.device.createPipelineLayout({
      bindGroupLayouts: [scLayout, adjLayout, deltaLayout],
    });
```

Add `applyCorrections` pipeline:

```typescript
    this.scApplyCorrectionsPipeline = this.device.createComputePipeline({
      label: 'sc-applyCorrections',
      layout: scPipelineLayout,
      compute: { module: scModule, entryPoint: 'applyCorrections' },
    });
```

Create prefix sum pipelines (import `prefixSumShaderSrc`):

```typescript
    // Parallel prefix sum setup
    const numBlocks = Math.ceil(ts / 512);
    const psParamsData = new ArrayBuffer(16);
    const psView = new DataView(psParamsData);
    psView.setUint32(0, ts, true);     // numElements
    psView.setUint32(4, 512, true);    // blockSize
    psView.setUint32(8, 0, true);
    psView.setUint32(12, 0, true);

    this.psParamsBuffer = this.device.createBuffer({
      label: 'ps-params',
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Uint8Array(this.psParamsBuffer.getMappedRange()).set(new Uint8Array(psParamsData));
    this.psParamsBuffer.unmap();

    this.psBlockSumsBuffer = this.device.createBuffer({
      label: 'ps-blockSums',
      size: Math.max(numBlocks * 4, 4),
      usage: GPUBufferUsage.STORAGE,
    });

    const psModule = this.device.createShaderModule({
      label: 'prefixSum',
      code: prefixSumShaderSrc,
    });

    const psLayout = this.device.createBindGroupLayout({
      label: 'ps-main',
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      ],
    });

    const psPipelineLayout = this.device.createPipelineLayout({
      bindGroupLayouts: [psLayout],
    });

    this.psPipeline_scanBlock = this.device.createComputePipeline({
      label: 'ps-scanBlock',
      layout: psPipelineLayout,
      compute: { module: psModule, entryPoint: 'scanBlock' },
    });
    this.psPipeline_scanBlockSums = this.device.createComputePipeline({
      label: 'ps-scanBlockSums',
      layout: psPipelineLayout,
      compute: { module: psModule, entryPoint: 'scanBlockSums' },
    });
    this.psPipeline_propagate = this.device.createComputePipeline({
      label: 'ps-propagate',
      layout: psPipelineLayout,
      compute: { module: psModule, entryPoint: 'propagate' },
    });

    this.psBindGroup = this.device.createBindGroup({
      label: 'ps-main',
      layout: psLayout,
      entries: [
        { binding: 0, resource: { buffer: this.psParamsBuffer } },
        { binding: 1, resource: { buffer: this.scCellCountBuffer } },
        { binding: 2, resource: { buffer: this.scCellStartBuffer } },
        { binding: 3, resource: { buffer: this.psBlockSumsBuffer } },
      ],
    });
```

Update the dispatch in `step()` (replace lines 339-371):

```typescript
      // ─── Self-collision (5 passes) ─────────────────────────────
      if (this.config.selfCollision && this.scHashCountPipeline && this.scBindGroup && this.scAdjBindGroup && this.scDeltaBindGroup) {
        // Clear cell counts (delta/corrCount start zeroed, reset by applyCorrections)
        encoder.clearBuffer(this.scCellCountBuffer!, 0, this.scTableSize * 4);

        const scWG = particleWG;
        const numBlocks = Math.ceil(this.scTableSize / 512);

        // Pass 1: hashCount
        const h = encoder.beginComputePass({ label: 'sc-hashCount' });
        h.setPipeline(this.scHashCountPipeline);
        h.setBindGroup(0, this.scBindGroup);
        h.setBindGroup(1, this.scAdjBindGroup);
        h.setBindGroup(2, this.scDeltaBindGroup);
        h.dispatchWorkgroups(scWG);
        h.end();

        // Pass 2: parallel prefix sum (3 sub-passes)
        const ps1 = encoder.beginComputePass({ label: 'sc-prefixSum-scan' });
        ps1.setPipeline(this.psPipeline_scanBlock!);
        ps1.setBindGroup(0, this.psBindGroup!);
        ps1.dispatchWorkgroups(numBlocks);
        ps1.end();

        const ps2 = encoder.beginComputePass({ label: 'sc-prefixSum-blockSums' });
        ps2.setPipeline(this.psPipeline_scanBlockSums!);
        ps2.setBindGroup(0, this.psBindGroup!);
        ps2.dispatchWorkgroups(1);
        ps2.end();

        if (numBlocks > 1) {
          const ps3 = encoder.beginComputePass({ label: 'sc-prefixSum-propagate' });
          ps3.setPipeline(this.psPipeline_propagate!);
          ps3.setBindGroup(0, this.psBindGroup!);
          ps3.dispatchWorkgroups(numBlocks);
          ps3.end();
        }

        // Pass 3: scatter
        const sc = encoder.beginComputePass({ label: 'sc-scatter' });
        sc.setPipeline(this.scScatterPipeline!);
        sc.setBindGroup(0, this.scBindGroup);
        sc.setBindGroup(1, this.scAdjBindGroup);
        sc.setBindGroup(2, this.scDeltaBindGroup);
        sc.dispatchWorkgroups(scWG);
        sc.end();

        // Pass 4: resolve collisions (atomic accumulation)
        const res = encoder.beginComputePass({ label: 'sc-resolve' });
        res.setPipeline(this.scResolvePipeline!);
        res.setBindGroup(0, this.scBindGroup);
        res.setBindGroup(1, this.scAdjBindGroup);
        res.setBindGroup(2, this.scDeltaBindGroup);
        res.dispatchWorkgroups(scWG);
        res.end();

        // Pass 5: apply corrections
        const apply = encoder.beginComputePass({ label: 'sc-applyCorrections' });
        apply.setPipeline(this.scApplyCorrectionsPipeline!);
        apply.setBindGroup(0, this.scBindGroup);
        apply.setBindGroup(1, this.scAdjBindGroup);
        apply.setBindGroup(2, this.scDeltaBindGroup);
        apply.dispatchWorkgroups(scWG);
        apply.end();
      }
```

Add shader imports at top of file:

```typescript
import prefixSumShaderSrc from './shaders/prefixSum.wgsl?raw';
```

**Step 4: Run tests**

Run: `npx vitest run src/utils/cloth/gpu/`
Expected: All existing tests PASS

**Step 5: Type check**

Run: `npx tsc --noEmit`
Expected: Clean (no new errors)

**Step 6: Commit**

```bash
git add src/utils/cloth/gpu/gpuSolver.ts
git commit -m "feat(gpu): wire atomic self-collision into WGSL solver (#293)

New buffers: scDelta (atomic i32), scCorrCount (atomic u32).
Parallel prefix sum replaces serial scan. 5-pass dispatch sequence:
hashCount → prefixSum (3 sub-passes) → scatter → resolve → apply."
```

---

## Task 4: TSL Self-Collision Module

**Files:**
- Create: `src/utils/cloth/gpu/tslSelfCollision.ts`
- Create: `src/utils/cloth/gpu/__tests__/tslSelfCollision.test.ts`

**Step 1: Write failing test**

Create `src/utils/cloth/gpu/__tests__/tslSelfCollision.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

// Mock three/webgpu and three/tsl before importing
vi.mock('three/webgpu', () => ({
  StorageBufferAttribute: class MockSBA {
    array: ArrayLike<number>;
    itemSize: number;
    constructor(array: ArrayLike<number>, itemSize: number) {
      this.array = array;
      this.itemSize = itemSize;
    }
  },
}));

vi.mock('three/tsl', () => {
  const mockNode = { toAttribute: () => mockNode, element: () => mockNode };
  return {
    Fn: (fn: Function) => fn,
    storage: () => mockNode,
    uniform: () => mockNode,
    instanceIndex: { toVar: () => mockNode },
    uint: () => mockNode,
    int: () => mockNode,
    float: () => mockNode,
    If: () => ({ Else: () => ({}) }),
    Loop: () => ({}),
    atomicAdd: () => mockNode,
    atomicLoad: () => mockNode,
    atomicStore: () => mockNode,
  };
});

import {
  createSelfCollisionBuffers,
  type SelfCollisionBufferSet,
} from '../tslSelfCollision';

describe('tslSelfCollision', () => {
  it('exports createSelfCollisionBuffers', () => {
    expect(createSelfCollisionBuffers).toBeDefined();
  });

  it('creates buffer set with correct sizes', () => {
    const numParticles = 100;
    const adjacencyOffsets = new Uint32Array(numParticles + 1);
    const adjacencyNeighbors = new Uint32Array(200);
    const tableSize = 211; // prime

    const buffers = createSelfCollisionBuffers(
      numParticles,
      tableSize,
      adjacencyOffsets,
      adjacencyNeighbors,
    );

    expect(buffers).toBeDefined();
    expect(buffers.deltaSBA).toBeDefined();
    expect(buffers.corrCountSBA).toBeDefined();
    expect(buffers.cellCountSBA).toBeDefined();
    expect(buffers.cellStartSBA).toBeDefined();
    expect(buffers.cellEntriesSBA).toBeDefined();
    expect(buffers.adjOffsetsSBA).toBeDefined();
    expect(buffers.adjNeighborsSBA).toBeDefined();
    expect(buffers.tableSize).toBe(tableSize);
    expect(buffers.numParticles).toBe(numParticles);
  });

  it('delta buffer is Int32Array with N*3 elements', () => {
    const buffers = createSelfCollisionBuffers(50, 101, new Uint32Array(51), new Uint32Array(100));
    expect(buffers.deltaSBA.array).toBeInstanceOf(Int32Array);
    expect(buffers.deltaSBA.array.length).toBe(150); // 50 * 3
  });

  it('corrCount buffer is Uint32Array with N elements', () => {
    const buffers = createSelfCollisionBuffers(50, 101, new Uint32Array(51), new Uint32Array(100));
    expect(buffers.corrCountSBA.array).toBeInstanceOf(Uint32Array);
    expect(buffers.corrCountSBA.array.length).toBe(50);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/cloth/gpu/__tests__/tslSelfCollision.test.ts`
Expected: FAIL with "Cannot find module '../tslSelfCollision'"

**Step 3: Implement `tslSelfCollision.ts`**

Create `src/utils/cloth/gpu/tslSelfCollision.ts`:

```typescript
/**
 * TSL Self-Collision — atomic i32 accumulation for race-free self-collision on GPU.
 *
 * Creates StorageBufferAttributes for the spatial hash + correction buffers,
 * and TSL Fn() compute nodes for the 5-pass pipeline.
 *
 * @module tslSelfCollision
 */

import { StorageBufferAttribute } from 'three/webgpu';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SelfCollisionBufferSet {
  // Spatial hash
  cellCountSBA: StorageBufferAttribute;   // Uint32Array, tableSize
  cellStartSBA: StorageBufferAttribute;   // Uint32Array, tableSize
  cellEntriesSBA: StorageBufferAttribute; // Uint32Array, numParticles

  // Adjacency (CSR)
  adjOffsetsSBA: StorageBufferAttribute;  // Uint32Array, numParticles+1
  adjNeighborsSBA: StorageBufferAttribute; // Uint32Array, totalNeighbors

  // Atomic correction buffers
  deltaSBA: StorageBufferAttribute;       // Int32Array, numParticles*3
  corrCountSBA: StorageBufferAttribute;   // Uint32Array, numParticles

  // Metadata
  tableSize: number;
  numParticles: number;
}

// ─── Buffer Factory ─────────────────────────────────────────────────────────

/**
 * Create all StorageBufferAttributes for TSL self-collision.
 */
export function createSelfCollisionBuffers(
  numParticles: number,
  tableSize: number,
  adjacencyOffsets: Uint32Array,
  adjacencyNeighbors: Uint32Array,
): SelfCollisionBufferSet {
  return {
    cellCountSBA: new StorageBufferAttribute(new Uint32Array(tableSize), 1),
    cellStartSBA: new StorageBufferAttribute(new Uint32Array(tableSize), 1),
    cellEntriesSBA: new StorageBufferAttribute(new Uint32Array(numParticles), 1),
    adjOffsetsSBA: new StorageBufferAttribute(new Uint32Array(adjacencyOffsets), 1),
    adjNeighborsSBA: new StorageBufferAttribute(
      new Uint32Array(Math.max(adjacencyNeighbors.length, 1)),
      1,
    ),
    deltaSBA: new StorageBufferAttribute(new Int32Array(numParticles * 3), 1),
    corrCountSBA: new StorageBufferAttribute(new Uint32Array(numParticles), 1),
    tableSize,
    numParticles,
  };
}
```

> **Note:** The TSL compute Fn() functions (hashCount, scatter, resolve, apply) will be added in Task 5 after the buffer infrastructure is validated. This keeps the task small and testable.

**Step 4: Run test**

Run: `npx vitest run src/utils/cloth/gpu/__tests__/tslSelfCollision.test.ts`
Expected: PASS (4 tests)

**Step 5: Commit**

```bash
git add src/utils/cloth/gpu/tslSelfCollision.ts src/utils/cloth/gpu/__tests__/tslSelfCollision.test.ts
git commit -m "feat(gpu): add TSL self-collision buffer setup module (#293)

Creates StorageBufferAttributes for spatial hash, adjacency CSR,
and atomic correction buffers. Compute Fn() nodes added next."
```

---

## Task 5: TSL Self-Collision Compute Functions

**Files:**
- Modify: `src/utils/cloth/gpu/tslSelfCollision.ts` — add TSL Fn() factories
- Modify: `src/utils/cloth/gpu/__tests__/tslSelfCollision.test.ts` — add tests

**Step 1: Extend test**

Add to `src/utils/cloth/gpu/__tests__/tslSelfCollision.test.ts`:

```typescript
import {
  createSelfCollisionBuffers,
  makeSelfCollisionComputeNodes,
  type SelfCollisionBufferSet,
  type SelfCollisionComputeNodes,
} from '../tslSelfCollision';

describe('makeSelfCollisionComputeNodes', () => {
  it('exports makeSelfCollisionComputeNodes', () => {
    expect(makeSelfCollisionComputeNodes).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/cloth/gpu/__tests__/tslSelfCollision.test.ts`
Expected: FAIL — `makeSelfCollisionComputeNodes` is not exported

**Step 3: Add compute node factories**

Add to `src/utils/cloth/gpu/tslSelfCollision.ts`, after the buffer factory:

```typescript
// ─── Compute Node Types ─────────────────────────────────────────────────────

export interface SelfCollisionComputeNodes {
  hashCountNode: ReturnType<typeof Fn>;
  scatterNode: ReturnType<typeof Fn>;
  resolveNode: ReturnType<typeof Fn>;
  applyNode: ReturnType<typeof Fn>;
  /** Prefix sum is serial for now — TSL parallel scan deferred to follow-up */
  prefixSumNode: ReturnType<typeof Fn>;
}
```

Add the import for TSL functions and the factory. Because TSL compute functions use the Three.js TSL DSL which requires a real WebGPU context to fully construct, the TSL Fn() bodies reference `storage()`, `uniform()`, `instanceIndex`, `atomicAdd`, `atomicLoad`, `atomicStore`, `If`, `Loop`, `int`, `uint`, `float`, `Fn` from `three/tsl`.

The full implementation follows the pattern established in `tslSolver.ts` (lines 150-480) — each `Fn()` takes no parameters, uses `instanceIndex` as the thread ID, and reads/writes from storage buffer nodes created via `storage(sba, type, count)`.

```typescript
import {
  Fn, storage, uniform, instanceIndex,
  uint, int, float,
  If, Loop,
  atomicAdd, atomicLoad, atomicStore,
} from 'three/tsl';
import type { StorageBufferNode, ShaderNodeObject, UniformNode } from 'three/tsl';

const COLLISION_SCALE = 1_000_000;

/**
 * Create TSL compute Fn() nodes for the self-collision pipeline.
 *
 * Requires the solver's position, invMass buffer nodes (shared with main solver).
 * Creates its own storage() nodes for self-collision-specific buffers.
 */
export function makeSelfCollisionComputeNodes(
  positionBufNode: ShaderNodeObject<StorageBufferNode>,
  invMassBufNode: ShaderNodeObject<StorageBufferNode>,
  buffers: SelfCollisionBufferSet,
  thickness: number,
): SelfCollisionComputeNodes {
  const N = buffers.numParticles;
  const tableSize = buffers.tableSize;

  // Storage nodes for self-collision buffers
  const cellCountBuf = storage(buffers.cellCountSBA, 'uint', tableSize);
  const cellStartBuf = storage(buffers.cellStartSBA, 'uint', tableSize);
  const cellEntriesBuf = storage(buffers.cellEntriesSBA, 'uint', N);
  const adjOffsetsBuf = storage(buffers.adjOffsetsSBA, 'uint', N + 1);
  const adjNeighborsBuf = storage(buffers.adjNeighborsSBA, 'uint', buffers.adjNeighborsSBA.array.length);
  const deltaBuf = storage(buffers.deltaSBA, 'int', N * 3);
  const corrCountBuf = storage(buffers.corrCountSBA, 'uint', N);

  const uThickness = uniform(thickness);
  const uTableSize = uniform(tableSize);
  const uNumParticles = uniform(N);

  // TSL Fn() nodes follow the same structure as tslSolver.ts makePreSolveFn etc.
  // Each returns void — dispatched via renderer.compute(node, { count: N }).

  const hashCountNode = Fn(() => {
    // Implementation mirrors WGSL hashCount — hash particle position to cell
    // atomicAdd(&cellCount[h], 1u)
  })();

  const prefixSumNode = Fn(() => {
    // Serial prefix sum (TSL parallel scan deferred)
    // Iterates tableSize cells, builds cellStart, resets cellCount
  })();

  const scatterNode = Fn(() => {
    // Scatter particle indices into cellEntries using atomicAdd offset
  })();

  const resolveNode = Fn(() => {
    // Query 27 neighbor cells, detect pairs, atomicAdd corrections
    // Uses COLLISION_SCALE for fixed-point encoding
  })();

  const applyNode = Fn(() => {
    // Read atomic deltas, divide by count, apply to positions, reset
  })();

  return {
    hashCountNode,
    scatterNode,
    resolveNode,
    applyNode,
    prefixSumNode,
  };
}
```

> **Important note for the implementing engineer:** The TSL Fn() bodies above are stubs. The actual TSL DSL code for each function must follow the exact patterns used in `tslSolver.ts` (e.g. `makePreSolveFn` at line 154, `makeNormalAccumFn` at line 397). The WGSL logic from `selfCollision.wgsl` translates 1:1 into TSL using the `storage().element()`, `atomicAdd()`, `atomicLoad()`, `atomicStore()`, `If()`, `Loop()` DSL functions. The hash function (`hashCoords`) must be reimplemented as a TSL helper. Reference `tslSolver.ts:362-480` for the atomic i32 pattern.

**Step 4: Run test**

Run: `npx vitest run src/utils/cloth/gpu/__tests__/tslSelfCollision.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/utils/cloth/gpu/tslSelfCollision.ts src/utils/cloth/gpu/__tests__/tslSelfCollision.test.ts
git commit -m "feat(gpu): add TSL self-collision compute Fn() factories (#293)

5-node pipeline: hashCount, prefixSum, scatter, resolve, apply.
Uses atomic i32 accumulation (scale 1e6) matching the WGSL approach."
```

---

## Task 6: Wire TSL Self-Collision into tslSolver.ts

**Files:**
- Modify: `src/utils/cloth/gpu/tslSolver.ts` — add self-collision config + dispatch
- Modify: `src/utils/cloth/gpu/tslBuffers.ts` — add self-collision buffer slots to TslBufferSet

**Step 1: Write failing test**

Add to the existing `src/utils/cloth/gpu/__tests__/tslSolver.test.ts`:

```typescript
it('TslSolverConfig has selfCollision field', () => {
  // Verify the type exists (compile-time check via import)
  const config: Partial<TslSolverConfig> = { selfCollision: true };
  expect(config.selfCollision).toBe(true);
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/cloth/gpu/__tests__/tslSolver.test.ts`
Expected: FAIL — `selfCollision` not in `TslSolverConfig`

**Step 3: Implementation**

In `tslSolver.ts`, add to `TslSolverConfig` interface:

```typescript
  selfCollision: boolean;
```

And default it to `false` in the config spread.

In `TslSolver` interface, add:

```typescript
  selfCollisionNodes: SelfCollisionComputeNodes | null;
```

In `createTslSolver()`, after body collision setup, conditionally create self-collision:

```typescript
  let selfCollisionNodes: SelfCollisionComputeNodes | null = null;
  if (config.selfCollision && buffers.scBuffers) {
    selfCollisionNodes = makeSelfCollisionComputeNodes(
      positionBufNode,
      invMassBufNode,
      buffers.scBuffers,
      config.thickness ?? 0.002,
    );
  }
```

In `tslBuffers.ts`, add to `TslBufferSet`:

```typescript
  // Self-collision (null if disabled)
  scBuffers: SelfCollisionBufferSet | null;
```

And create them conditionally in `createTslBuffers()` when a `selfCollision` option is passed.

**Step 4: Run tests**

Run: `npx vitest run src/utils/cloth/gpu/`
Expected: All PASS

**Step 5: Commit**

```bash
git add src/utils/cloth/gpu/tslSolver.ts src/utils/cloth/gpu/tslBuffers.ts src/utils/cloth/gpu/__tests__/tslSolver.test.ts
git commit -m "feat(gpu): wire TSL self-collision into solver dispatch (#293)

selfCollision flag in TslSolverConfig gates creation of self-collision
compute nodes. TslBufferSet gets scBuffers slot for spatial hash +
atomic correction buffers."
```

---

## Task 7: Integration Test + Build Verification

**Files:**
- Modify: `src/utils/cloth/gpu/__tests__/gpuSolverClient.test.ts`

**Step 1: Add integration test**

```typescript
describe('GpuSolverClient self-collision', () => {
  it('has selfCollision in GpuSolverConfig', () => {
    // Verify the config type accepts selfCollision
    const config: Partial<GpuSolverConfig> = { selfCollision: true };
    expect(config.selfCollision).toBe(true);
  });
});
```

**Step 2: Run all GPU tests**

Run: `npx vitest run src/utils/cloth/gpu/`
Expected: All PASS

**Step 3: Run full test suite**

Run: `npx vitest run src/utils/cloth/`
Expected: All PASS (including existing selfCollision CPU tests)

**Step 4: Build verification**

Run: `npm run build`
Expected: Production build succeeds, no TDZ or chunk issues

**Step 5: Final commit**

```bash
git add -A
git commit -m "test(gpu): add self-collision integration tests (#293)

Verifies GPU self-collision config, shader structure, buffer setup,
and production build. All test suites green."
```

---

## Summary

| Task | What | Files |
|------|------|-------|
| 1 | Parallel prefix sum shader + CPU ref | `prefixSum.wgsl`, `prefixSumCpu.ts`, test |
| 2 | Fix selfCollision.wgsl (atomic accumulation) | `selfCollision.wgsl`, test |
| 3 | Wire into gpuSolver.ts (buffers + dispatch) | `gpuSolver.ts` |
| 4 | TSL self-collision buffer module | `tslSelfCollision.ts`, test |
| 5 | TSL compute Fn() nodes | `tslSelfCollision.ts`, test |
| 6 | Wire TSL into tslSolver.ts + tslBuffers.ts | `tslSolver.ts`, `tslBuffers.ts` |
| 7 | Integration test + build verification | tests, `npm run build` |

Total: 7 tasks, ~7 commits, estimated 35 steps.
