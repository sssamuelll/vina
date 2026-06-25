# Cloth Body-Tether (Max-Distance) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the GPU cloth cling to the body (UE-style) via a per-vertex max-distance tether to a static closest-point anchor, with the cling radius assigned automatically by garment region.

**Architecture:** A new GPU-solver constraint pass `bodyTether`, structurally identical to the STEP 4 strain-limiting pass (`tslSolver.ts`): a per-vertex compute node, race-free (each cloth particle is independent — no shared particles, no coloring, no atomics). Two new per-particle buffers: a vec3 target (closest point on the body, captured once in init) and a float radius (by region). The kernel projects any vertex farther than its radius back onto the radius sphere around its target. Static target (Approach A); dynamic (#887) and painting UI are out of scope.

**Tech Stack:** TypeScript, Three.js TSL (WebGPU compute), `StorageBufferAttribute`, `three-mesh-bvh` (already used by `tslCollision`), Vitest.

## Global Constraints

- **WASM sync:** N/A — this is GPU-only (TSL). No Rust/WASM change, no `wasm-pack` rebuild.
- **Typecheck command:** `npx tsc -b --noEmit` (build mode), NOT bare `tsc --noEmit`.
- **No `--no-verify`.** Pre-commit hook runs `tsc -b` + lint-staged (eslint `--max-warnings=0`).
- **Parity:** GPU-ahead vs WASM/CPU (no tether there). Documented A7 divergence; WASM back-port is a queued follow-up, NOT in this plan.
- **Pattern to mirror:** the strain-limiting pass (commit `8acdb194`) — `makeStrainLimitFn` in `tslSolver.ts`, its `strainLimitColors` build, the `TslSolver` interface field, the substep dispatch in `GarmentSimulation.tsx`, and the structure test in `tslSolver.test.ts`. The tether is the same shape with a per-vertex (not per-edge) kernel.
- **Region radii (initial tuning values):** `front-torso`/`back-torso` 0.025 m · `collar` 0.02 m · `sleeve` 0.05 m · `skirt`/lower 0.12 m · default 0.06 m.

---

### Task 1: Region → radius helper (pure function)

**Files:**
- Create: `src/utils/cloth/gpu/tetherRadii.ts`
- Test: `src/utils/cloth/gpu/__tests__/tetherRadii.test.ts`

**Interfaces:**
- Produces: `regionRadius(region: string): number` and `buildTetherRadii(pieceRegions: Array<{ region: string; vertexCount: number }>): Float32Array` — concatenates each piece's radius across its vertices, in piece order (the same order `createTslBuffers` merges pieces).

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { regionRadius, buildTetherRadii } from '../tetherRadii';

describe('regionRadius', () => {
  it('clings the torso/collar, loosens the skirt', () => {
    expect(regionRadius('front-torso')).toBeLessThan(regionRadius('sleeve'));
    expect(regionRadius('sleeve')).toBeLessThan(regionRadius('skirt'));
    expect(regionRadius('collar')).toBeLessThanOrEqual(regionRadius('front-torso'));
  });
  it('falls back to a moderate radius for unknown regions', () => {
    expect(regionRadius('weird-piece')).toBeGreaterThan(0);
  });
});

describe('buildTetherRadii', () => {
  it('expands per-piece region to a per-vertex radius array in piece order', () => {
    const radii = buildTetherRadii([
      { region: 'front-torso', vertexCount: 2 },
      { region: 'skirt', vertexCount: 3 },
    ]);
    expect(radii).toHaveLength(5);
    expect(radii[0]).toBe(regionRadius('front-torso'));
    expect(radii[2]).toBe(regionRadius('skirt'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/cloth/gpu/__tests__/tetherRadii.test.ts`
Expected: FAIL — module `../tetherRadii` not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/utils/cloth/gpu/tetherRadii.ts
/**
 * Per-region max-distance tether radius (m). Small = clings, large = hangs loose.
 * #gummy frente#2 body-tether (2026-06-25 spec). Tuning values; adjust @gpu-local.
 */
const REGION_RADIUS: Record<string, number> = {
  'front-torso': 0.025,
  'back-torso': 0.025,
  collar: 0.02,
  sleeve: 0.05,
  'front-skirt': 0.12,
  'back-skirt': 0.12,
};
const DEFAULT_RADIUS = 0.06;

export function regionRadius(region: string): number {
  return REGION_RADIUS[region] ?? DEFAULT_RADIUS;
}

export function buildTetherRadii(
  pieceRegions: Array<{ region: string; vertexCount: number }>,
): Float32Array {
  const total = pieceRegions.reduce((s, p) => s + p.vertexCount, 0);
  const out = new Float32Array(total);
  let off = 0;
  for (const p of pieceRegions) {
    out.fill(regionRadius(p.region), off, off + p.vertexCount);
    off += p.vertexCount;
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/cloth/gpu/__tests__/tetherRadii.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/utils/cloth/gpu/tetherRadii.ts src/utils/cloth/gpu/__tests__/tetherRadii.test.ts
git commit -m "feat(tether): region->radius helper for body-tether max-distance"
```

---

### Task 2: Tether buffers in the buffer set

**Files:**
- Modify: `src/utils/cloth/gpu/tslBuffers.ts` (TslBufferSet interface ~58; `createTslBuffers` signature ~131 + body + return ~241; dispose list ~326)
- Test: `src/utils/cloth/gpu/__tests__/tslBuffers.test.ts` (or `gpuBuffers.test.ts` — whichever holds the existing `createTslBuffers` tests; confirm by `grep -rn createTslBuffers src/utils/cloth/gpu/__tests__`)

**Interfaces:**
- Consumes: `buildTetherRadii` (Task 1).
- Produces: `TslBufferSet` gains `tetherTargetSBA: StorageBufferAttribute` (vec3, seeded to positions) and `tetherMaxDistSBA: StorageBufferAttribute` (float). `createTslBuffers` gains an optional 6th param `tetherRadii?: Float32Array` (length N); when absent, defaults to `DEFAULT_RADIUS` everywhere.

- [ ] **Step 1: Read to confirm the exact `TslBufferSet` shape and dispose pattern**

Run: `sed -n '58,110p;235,265p;320,335p' src/utils/cloth/gpu/tslBuffers.ts` (or Read those ranges). Confirm where SBAs are declared in the interface, returned, and pushed into the dispose `sbas` array.

- [ ] **Step 2: Write the failing test**

```typescript
// in the createTslBuffers describe block
it('allocates tether target (vec3, seeded to positions) and maxDist (float) buffers', () => {
  const mesh = makeMockClothMesh({ numParticles: 4 }); // existing helper in this test file
  const radii = new Float32Array([0.02, 0.02, 0.12, 0.12]);
  const set = createTslBuffers(mesh, mockColoredStretch(), mockBend(), null, undefined, radii);
  expect(set.tetherTargetSBA.itemSize).toBe(3);
  expect(set.tetherTargetSBA.array).toHaveLength(4 * 3);
  expect(set.tetherMaxDistSBA.itemSize).toBe(1);
  expect(Array.from(set.tetherMaxDistSBA.array)).toEqual([0.02, 0.02, 0.12, 0.12]);
});
```

(Match the mock-helper names already used in this test file; if they differ, use the file's helpers.)

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/utils/cloth/gpu/__tests__/tslBuffers.test.ts -t "tether target"`
Expected: FAIL — `tetherTargetSBA` undefined / arity error on `createTslBuffers`.

- [ ] **Step 4: Implement**

In `TslBufferSet` interface add:
```typescript
  tetherTargetSBA: StorageBufferAttribute;
  tetherMaxDistSBA: StorageBufferAttribute;
```
In `createTslBuffers` signature add the 6th param:
```typescript
  tetherRadii?: Float32Array,
```
In the body, after the core particle buffers (~line 157):
```typescript
  // Body-tether (frente#2): target seeded to positions (filled in init via
  // captureTetherTargets); maxDist per-vertex from region radii.
  const tetherTargetSBA = new StorageBufferAttribute(new Float32Array(mesh.positions), 3);
  const tetherMaxDistSBA = new StorageBufferAttribute(
    tetherRadii && tetherRadii.length === N ? new Float32Array(tetherRadii) : new Float32Array(N).fill(0.06),
    1,
  );
```
Add both to the return object (~line 241) and to the dispose `sbas` push list (~line 326).

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/utils/cloth/gpu/__tests__/tslBuffers.test.ts`
Expected: PASS (existing + new).

- [ ] **Step 6: Commit**

```bash
git add src/utils/cloth/gpu/tslBuffers.ts src/utils/cloth/gpu/__tests__/tslBuffers.test.ts
git commit -m "feat(tether): allocate target+maxDist tether buffers in the buffer set"
```

---

### Task 3: Tether kernel + solver node

**Files:**
- Modify: `src/utils/cloth/gpu/tslSolver.ts` (add `makeTetherFn` near `makeStrainLimitFn`; build `tether` node after `strainLimitColors`; add `tether: ComputeNode | null` to `TslSolver` interface; add to the return)
- Test: `src/utils/cloth/gpu/__tests__/tslSolver.test.ts`

**Interfaces:**
- Consumes: `TslBufferSet.tetherTargetSBA`, `.tetherMaxDistSBA` (Task 2), `posBuf`, `invMassBuf` (already wrapped in `createTslSolver`).
- Produces: `TslSolver.tether: ComputeNode | null` (non-null when N > 0).

- [ ] **Step 1: Write the failing test** (mirror the strain-limit structure test)

```typescript
it('returns a body-tether compute node (#frente2)', () => {
  const buffers = makeMockBufferSet({ numStretchColors: 3 });
  const solver = createTslSolver(buffers, { ...defaultConfig });
  expect(solver.tether).not.toBeNull();
  expect(solver.tether).toHaveProperty('__tslCompute', true);
});
```

(Confirm `makeMockBufferSet` returns `tetherTargetSBA`/`tetherMaxDistSBA` — add them to that mock helper if missing, seeded like the other per-particle SBAs.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/cloth/gpu/__tests__/tslSolver.test.ts -t "body-tether"`
Expected: FAIL — `solver.tether` undefined.

- [ ] **Step 3: Implement the kernel** (after `makeStrainLimitFn`):

```typescript
/**
 * Body-tether kernel (frente#2). Max-distance cling: if a cloth vertex is farther
 * than its per-vertex radius from its static body target, project it back onto the
 * radius sphere. One-sided (target is fixed; only the vertex moves), respects invMass.
 * Race-free: each particle is independent (no shared particles).
 */
function makeTetherFn(
  posBuf: TslNode,
  invMassBuf: TslNode,
  targetBuf: TslNode,
  maxDistBuf: TslNode,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (Fn as any)(() => {
    const i = instanceIndex;
    const w = invMassBuf.element(i);
    If(w.greaterThan(float(0.0)), () => {
      const d = posBuf.element(i).sub(targetBuf.element(i));
      const dist = d.length();
      const maxD = maxDistBuf.element(i);
      If(dist.greaterThan(maxD), () => {
        // project onto the radius sphere around the target
        posBuf.element(i).assign(targetBuf.element(i).add(d.mul(maxD.div(dist.max(float(1e-7))))));
      });
    });
  })();
}
```

Build the node (after the `strainLimitColors` block):
```typescript
const tetherTargetBuf = storage(buffers.tetherTargetSBA, 'vec3', N);
const tetherMaxDistBuf = storage(buffers.tetherMaxDistSBA, 'float', N);
const tether = compute(makeTetherFn(posBuf, invMassBuf, tetherTargetBuf, tetherMaxDistBuf), N, [64]);
```

Add `tether: ComputeNode | null;` to the `TslSolver` interface (near `strainLimitColors`), and `tether,` to the return object.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/cloth/gpu/__tests__/tslSolver.test.ts`
Expected: PASS (existing + new).

- [ ] **Step 5: Commit**

```bash
git add src/utils/cloth/gpu/tslSolver.ts src/utils/cloth/gpu/__tests__/tslSolver.test.ts
git commit -m "feat(tether): max-distance tether kernel + solver node"
```

---

### Task 4: Capture targets from the body BVH in init

**Files:**
- Modify: `src/utils/cloth/gpu/gpuSolverClient.ts` (add `captureTetherTargets(...)`; call it at the end of `setTslCollisionBody` for the `__avatar__` body)
- Test: `src/utils/cloth/gpu/__tests__/gpuSolverClient.test.ts`

**Interfaces:**
- Consumes: the body BVH (`buildLinearBVH`, already built in `setTslCollisionBody`) + the cloth positions (`tetherTargetSBA.array`, seeded to initial positions in Task 2).
- Produces: `captureTetherTargets()` overwrites `tetherTargetSBA.array` in place with the closest point on the body for each cloth vertex, then flags it `needsUpdate`.

- [ ] **Step 1: Read to confirm the closest-point primitive**

Run: `grep -n "closestPointOnTriangle\|pointToTriangle\|closestPoint" src/utils/cloth/*.ts src/utils/cloth/gpu/*.ts`. Reuse the existing CPU closest-point-on-triangle (the mirror of `tslCollision`'s narrow phase, e.g. in `triangleCollision.ts`). If only a GPU version exists, lift the barycentric/edge-clamp math into a small CPU helper `closestPointOnTriMesh(p, triVerts, bvh)`.

- [ ] **Step 2: Write the failing test**

```typescript
it('captureTetherTargets writes the closest body point per cloth vertex', async () => {
  const device = new FakeGPUDevice();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = new GpuSolverClient(device as any);
  // a single cloth particle at (0, 2, 0); a body triangle in the z=0 plane around origin
  await client.initMultiPieceTsl([makeQuadPieceAt(0, 2, 0)]);
  client.setTslCollisionBody('__avatar__', makeFlatTriMeshAtOrigin(), 0.4, 0.008);
  client.captureTetherTargets();
  const t = client.getTetherTargets(); // test accessor returning tetherTargetSBA.array
  // closest point of (0,2,0) to a triangle in the z=0 plane is its xy projection
  expect(t[1]).toBeCloseTo(0, 2); // y target pulled to the body plane
});
```

(Use the test file's existing mesh mock helpers; add the minimal ones named here if absent. Add a thin `getTetherTargets()` test accessor on the client.)

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/utils/cloth/gpu/__tests__/gpuSolverClient.test.ts -t "captureTetherTargets"`
Expected: FAIL — method undefined.

- [ ] **Step 4: Implement** `captureTetherTargets()` on `GpuSolverClient`: iterate cloth particles (from `tetherTargetSBA.array`, currently = initial positions), for each query the cached body BVH for the closest point, write it back into `tetherTargetSBA.array`, set `tetherTargetSBA.needsUpdate = true`. Call it at the end of `setTslCollisionBody` when `id === '__avatar__'` and a TSL solver is active. Keep the BVH reference captured in `setTslCollisionBody` so the method can re-query it.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/utils/cloth/gpu/__tests__/gpuSolverClient.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/utils/cloth/gpu/gpuSolverClient.ts src/utils/cloth/gpu/__tests__/gpuSolverClient.test.ts
git commit -m "feat(tether): capture per-vertex body targets from the BVH in init"
```

---

### Task 5: Wire dispatch + radii into the live pipeline

**Files:**
- Modify: `src/components/Viewport3D/GarmentSimulation.tsx` (push `solver.tether` in `substepNodes`, after self-collision/strain-limit, before groundClamp — same insertion point as the strain-limit push ~line 484)
- Modify: `src/utils/cloth/gpu/gpuSolverClient.ts` (`initMultiPieceTsl`: build `tetherRadii` via `buildTetherRadii` from the piece regions + pass to `createTslBuffers`)
- Modify: `src/components/Viewport3D/useSimulationLifecycle.ts` (no new call needed if `captureTetherTargets` is folded into `setTslCollisionBody`; confirm the avatar collision load path triggers it)
- Test: covered by Task 3 structure test + the @gpu-local probe in Task 6 (integration; no new unit test — this is wiring)

**Interfaces:**
- Consumes: `buildTetherRadii` (Task 1), `solver.tether` (Task 3), `captureTetherTargets` (Task 4).

- [ ] **Step 1: Push the tether node in the substep order**

In `GarmentSimulation.tsx`, immediately after the `substepNodes.push(...solver.strainLimitColors)` line:
```typescript
      // Body-tether (frente#2): max-distance cling, after strain-limit, before
      // groundClamp/snapshot — same energy-consistent slot as strain-limiting.
      if (solver.tether) substepNodes.push(solver.tether);
```

- [ ] **Step 2: Build + pass tetherRadii in initMultiPieceTsl**

In `gpuSolverClient.ts` `initMultiPieceTsl`, before `createTslBuffers`, build the per-vertex radii from the placed pieces' regions and vertex counts (the same piece order the merge uses):
```typescript
import { buildTetherRadii } from './tetherRadii';
// ...
const tetherRadii = buildTetherRadii(
  placedMeshes.map((p) => ({ region: p.region ?? 'unknown', vertexCount: p.vertices.length / 3 })),
);
```
Pass `tetherRadii` as the 6th arg to `createTslBuffers`. (Confirm the placed-piece object exposes `region` + `vertices`; if the region lives elsewhere, thread it through — read the `initMultiPieceTsl` piece type first.)

- [ ] **Step 3: Typecheck + lint + full suite**

Run: `npx tsc -b --noEmit && npx vitest run && npx eslint src/utils/cloth/gpu/tslSolver.ts src/utils/cloth/gpu/gpuSolverClient.ts src/components/Viewport3D/GarmentSimulation.tsx src/utils/cloth/gpu/tetherRadii.ts`
Expected: tsc 0, all tests pass, lint clean.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(tether): wire body-tether dispatch + per-region radii into the GPU pipeline"
```

---

### Task 6: @gpu-local verification + radius tuning

**Files:**
- Modify: `tests/e2e/webgpu-maria-replay.spec.ts` (extend the DIAG probe with a mean cloth-to-body-target distance metric)

- [ ] **Step 1: Add a cling metric to the DIAG probe**

In the `[diag-gummy]` loop, additionally read the mean distance of each cloth vertex to its tether target (expose `__OPENCLO_TETHER_MEAN_DIST__` from the solver, or approximate via the published cloth mesh vs. the body — simplest: log `belowHip`/`minY`/`maxY` as today and add a `clingPct` = fraction of vertices within 2× their radius once the global is published). Log it.

- [ ] **Step 2: Run tether-off vs tether-on**

Run (tether on, default): `npx playwright test --config playwright.webgpu.config.ts webgpu-maria-replay -g "DIAG"`
Then temporarily set all radii huge (effectively off) and re-run. Compare: tether-on should pull mean cloth-to-body distance DOWN and hold `belowHip` ~0, `nan=0`, sleeve stable.

- [ ] **Step 3: Tune the region radii**

Adjust `REGION_RADIUS` in `tetherRadii.ts` until the drape looks clung-but-natural in the headed window (torso clings, skirt/sleeves hang). Too small → second-skin/rigid; too large → no cling. Re-run after each change.

- [ ] **Step 4: Commit the tuned values + metric**

```bash
git add tests/e2e/webgpu-maria-replay.spec.ts src/utils/cloth/gpu/tetherRadii.ts
git commit -m "test(tether): @gpu-local cling metric + tuned region radii"
```

---

## Self-Review

**Spec coverage:** target buffer (Task 2+4) ✓ · maxDist by region (Task 1+2+5) ✓ · kernel/projection (Task 3) ✓ · substep integration (Task 5) ✓ · init capture + rebuild path (Task 4) ✓ · testing unit+@gpu-local (Task 3+6) ✓ · parity/GPU-only (Global Constraints) ✓. Follow-ups (dynamic #887, painting UI) correctly excluded.

**Open risks carried from the spec into execution:**
- **Target recapture on avatar rebuild** — Task 4 folds capture into `setTslCollisionBody`, which the debounced collision rebuild already calls, so a measurement/pose change re-captures targets. Confirm during Task 5 Step 3.
- **Init capture cost** — ~29k closest-point queries once. CPU should be fine; profile in Task 6 if init stalls.
- **Region exposure on placed pieces** — Task 5 Step 2 reads the piece type to confirm `region` is available; if not, thread it from the placement classifier (`garmentPlacement.ts`).
- **Compose with the wrap** — Task 6 visual check confirms wrap (start pose) + tether (hold near body) don't fight.
