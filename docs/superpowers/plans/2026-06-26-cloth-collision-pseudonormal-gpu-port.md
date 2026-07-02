# Cloth–Body Collision Pseudonormals — Plan 2: GPU Port (the visible fix)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the pseudonormal inside/outside sign fix end-to-end to the GPU tier
(what the user sees), so the avatar body stops drawing over the (already-covering)
cloth at concave junctions — removing the "skin patches".

**Architecture:** At the avatar body-rebuild, compute the angle-weighted edge +
vertex pseudonormals (Plan 1's `buildBodyPseudonormals`) and reorder them to BVH
leaf order alongside `triVerts`/`triNormals`. Upload them as two StorageBuffers.
The TSL Pass-2 collision kernel derives `bestSide` from the closest-feature
pseudonormal — a verbatim mirror of the CPU reference committed in Plan 1
(`triangleCollision.ts`, commit `55d882b3`). Plus the seam residual-`restLength`
floor that stops the armscye pull-through.

**Tech Stack:** TypeScript, Three.js TSL/WebGPU (`three/webgpu`), Vitest, Playwright
(@gpu-local). No Rust/WASM in this plan (the WASM parity port + the permanent
coverage metric are Plan 3 — a tracked A7 GPU-ahead divergence in the meantime,
exactly as strain-limiting #gummy STEP 4 was).

**Spec:** `docs/superpowers/specs/2026-06-26-cloth-body-collision-pseudonormal-design.md`
(Phase A). **Depends on Plan 1** (`docs/superpowers/plans/2026-06-26-cloth-collision-pseudonormal-cpu-core.md`,
complete at commit `55d882b3`): `buildBodyPseudonormals` and the CPU
closest-feature sign logic already exist + are unit-tested.

## Global Constraints

- WASM sync rule does NOT apply (no `crates/xpbd-wasm` change in this plan).
- Typecheck `npx tsc -b --noEmit` (build mode). Tests `npm run test`; single file
  `npx vitest run <path>`. Gate before commit: `npx tsc -b --noEmit && npm run test`.
- @gpu-local replay: `npx playwright test --config playwright.webgpu.config.ts webgpu-maria-replay -g "drape M4"` (headed, real GPU; CI never runs it).
- TSL codegen pitfalls: follow the existing patterns in `tslCollision.ts` exactly
  (the `(x as any).greaterThanEqual` casts, `.toVar()`, the atomic-emulation
  storage access). Do NOT introduce new outer-`toVar`/atomic patterns.
- Pass-1 (`findBestNode`) is the ≥30fps hotspot — DO NOT touch it. The change is
  Pass-2 (`applyPushNode`) side derivation only, which is O(1) per particle.
- Composite-key cap (#921 Eje A): unchanged — this plan adds no tris.

## File Structure

- **Modify** `src/utils/cloth/gpu/bvh.ts` — `LinearBVH` gains `edgePseudonormals`
  + `vertexPseudonormals` (each `triCount*9`, leaf-reordered); `buildLinearBVH`
  computes them via `buildBodyPseudonormals` and reorders by `triOrder`.
- **Modify** `src/utils/cloth/gpu/gpuSolverClient.ts:1006-1033` — create + record +
  dispose the 2 new SBAs; pass them to `createTslCollisionBody`.
- **Modify** `src/utils/cloth/gpu/tslCollision.ts:188-223,570-636` — 2 new params +
  2 new `storage()` decls; Pass-2 `bestSide` from the closest-feature pseudonormal.
- **Modify** `src/utils/cloth/seamAssembly.ts` (the `restLength` shrink) + the GPU
  mirror `makeSeamConstraintFn` in `src/utils/cloth/gpu/tslSolver.ts` — residual floor.
- **Modify** `tests/e2e/webgpu-maria-replay.spec.ts` (TEMP, for Task 5 validation
  only — reverted after) + the boundary-contract test for the new SBAs if one exists.

---

### Task 1: `buildLinearBVH` emits leaf-reordered pseudonormals

**Files:**
- Modify: `src/utils/cloth/gpu/bvh.ts` (the `LinearBVH` interface ~34-49; the
  triangle reorder loop ~210-222; the return ~226-233).
- Test: `src/utils/cloth/gpu/__tests__/bvh.test.ts` (add a case; create if absent).

**Interfaces:**
- Consumes: `buildBodyPseudonormals(mesh, eps?)` from `src/utils/cloth/bodyPseudonormals`
  → `{ edge: Float32Array; vertex: Float32Array }`, each `triCount*9`, soup order.
- Produces: `LinearBVH` gains `edgePseudonormals: Float32Array` and
  `vertexPseudonormals: Float32Array`, each `triCount*9`, **reordered to BVH leaf
  order** (same `triOrder` index as `triVerts`/`triNormals`).

- [ ] **Step 1: Write the failing test**

The pseudonormal arrays must be reordered identically to `triVerts`: for leaf-order
slot `i` holding original triangle `triOrder[i]`, `edgePseudonormals[i*9 + k] ===
buildBodyPseudonormals(mesh).edge[triOrder[i]*9 + k]`. Easiest assertion: build a
small 2-tri mesh, call `buildLinearBVH`, and check that each emitted
`edgePseudonormals` triangle slot matches the soup-order builder output for the
triangle whose `triVerts` landed in that slot (identify it by matching the 9 vert
floats).

```ts
// src/utils/cloth/gpu/__tests__/bvh.test.ts (add)
import { it, expect } from 'vitest';
import { buildLinearBVH } from '../bvh';
import { buildBodyPseudonormals } from '../../bodyPseudonormals';

it('emits edge/vertex pseudonormals reordered to match triVerts leaf order', () => {
  const mesh = { // two tris sharing edge B-C (a valley)
    vertices: new Float32Array([1,0,0, 0,0,0, 0,1,0,  0,0,1, 0,0,0, 0,1,0]),
    normals: new Float32Array([0,0,-1,  -1,0,0]),
    triCount: 2,
  };
  const lb = buildLinearBVH(mesh);
  const soup = buildBodyPseudonormals(mesh, 1e-6);
  expect(lb.edgePseudonormals.length).toBe(2 * 9);
  expect(lb.vertexPseudonormals.length).toBe(2 * 9);
  // For each leaf slot, find which original tri its triVerts came from, then the
  // pseudonormals at that slot must equal the soup builder's output for that tri.
  for (let i = 0; i < mesh.triCount; i++) {
    const v0 = lb.triVerts.slice(i * 9, i * 9 + 9);
    let orig = -1;
    for (let t = 0; t < mesh.triCount; t++) {
      const s = mesh.vertices.slice(t * 9, t * 9 + 9);
      if (s.every((x, k) => x === v0[k])) { orig = t; break; }
    }
    expect(orig).toBeGreaterThanOrEqual(0);
    for (let k = 0; k < 9; k++) {
      expect(lb.edgePseudonormals[i * 9 + k]).toBeCloseTo(soup.edge[orig * 9 + k], 6);
      expect(lb.vertexPseudonormals[i * 9 + k]).toBeCloseTo(soup.vertex[orig * 9 + k], 6);
    }
  }
});
```

- [ ] **Step 2: Run — verify it fails** (`edgePseudonormals` undefined).

- [ ] **Step 3: Implement**

Read `bvh.ts`. Add `edgePseudonormals` + `vertexPseudonormals` to the `LinearBVH`
interface. In `buildLinearBVH`, after the existing `triVerts`/`triNormals` reorder
loop (it iterates `triOrder` and copies 9 verts + 3 normals per leaf slot), compute
`const soupPN = buildBodyPseudonormals(mesh, 1e-4);` once, allocate
`outEdgePN`/`outVertexPN` of `mesh.triCount*9`, and inside the SAME reorder loop
copy 9 floats each: `outEdgePN[i*9+j] = soupPN.edge[origTri*9+j]` and likewise for
vertex. Return them in the object. For the empty-mesh early return, add
`edgePseudonormals: new Float32Array(0), vertexPseudonormals: new Float32Array(0)`.

- [ ] **Step 4: Run — verify it passes**, then the gate (`npx tsc -b --noEmit && npm run test`).

- [ ] **Step 5: Commit** (`git add bvh.ts + its test; commit "feat(collision): leaf-reorder body pseudonormals in buildLinearBVH"`).

---

### Task 2: Upload the pseudonormal SBAs + thread them to the kernel factory

**Files:**
- Modify: `src/utils/cloth/gpu/gpuSolverClient.ts:1006-1033` (the 4-SBA create +
  record + the previous-dispose block at 998-1004 + the `removeTslCollisionBody`
  disposal) and the `collisionBodySBAs` typed record.
- Modify: `src/utils/cloth/gpu/tslCollision.ts:188-223` (`createTslCollisionBody`
  signature + the `storage()` decls).

**Interfaces:**
- Consumes: `bvh.edgePseudonormals` / `bvh.vertexPseudonormals` (Task 1).
- Produces: `createTslCollisionBody(..., edgePseudoSBA, vertexPseudoSBA, ...)` — two
  new `StorageBufferAttribute` params after `triNormalsSBA`; inside, two new flat
  float storage nodes `edgePseudoBuf = storage(edgePseudoSBA, 'float', numTris*9)`,
  `vertexPseudoBuf = storage(vertexPseudoSBA, 'float', numTris*9)`, passed into the
  Pass-2 kernel closure (Task 3 reads them).

- [ ] **Step 1: Implement the upload + threading**

In `gpuSolverClient.ts`: `const edgePseudoSBA = createSBA(bvh.edgePseudonormals, 1);
const vertexPseudoSBA = createSBA(bvh.vertexPseudonormals, 1);`. Add both to the
`this.collisionBodySBAs.set(id, {...})` record (extend its type), the previous-body
`disposeStorageBufferAttribute(...)` cleanup (998-1004), and any disposal in
`removeTslCollisionBody`/`disposeTslResources`. Pass both into
`createTslCollisionBody` after `triNormalsSBA`.

In `tslCollision.ts`: add `edgePseudoSBA: StorageBufferAttribute, vertexPseudoSBA:
StorageBufferAttribute` params after `triNormalsSBA`; add the two `storage()` decls
next to `triNormBuf` (223); thread them into the Pass-2 kernel.

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b --noEmit`
Expected: clean. (No new test here — this is wiring with no behavior yet; Task 3
adds the behavior + Task 5 validates @gpu-local. If a boundary-contract test pins
the `collisionBodySBAs` shape or `createTslCollisionBody` arity, update it to expect
the 2 new SBAs and run it.)

- [ ] **Step 3: Run the gate + commit** (`npx tsc -b --noEmit && npm run test`;
  commit "feat(collision): upload + thread body pseudonormal SBAs to the TSL kernel").

---

### Task 3: Pass-2 kernel derives `bestSide` from the closest-feature pseudonormal

**Files:**
- Modify: `src/utils/cloth/gpu/tslCollision.ts:570-636` (Pass-2: the inside branch
  at 578-582 + the edge branches at 620-636).

**Interfaces:**
- Consumes: `edgePseudoBuf`, `vertexPseudoBuf` (Task 2). The contact triangle index
  is the `triIdx` already decoded in Pass-2 from the winning composite key.

**Reference (the spec for this task): the CPU implementation committed in Plan 1**
— `git show 55d882b3 -- src/utils/cloth/triangleCollision.ts`. Mirror its
closest-feature logic VERBATIM into TSL: inside-projection keeps `bestSide = dot`
(unchanged); for the edge branches, replace `bestSide = dEdge·faceNormal` with
`bestSide = dEdge·(closest-feature pseudonormal)`, where the feature is the chosen
edge's pseudonormal unless the clamped `t≈0/1` (endpoint) → that vertex's
pseudonormal. Edge→builder-index mapping is AB→0, BC→1, AC(the C–A edge)→2(CA);
vertex order A(0),B(1),C(2). The push axis (`nnx,nny,nnz`) stays the face normal —
only `bestSide`'s sign source changes.

- [ ] **Step 1: Port the logic into Pass-2**

Read `tslCollision.ts:570-636` and `git show 55d882b3` for the CPU reference. In
each of the three edge branches (620-636), after computing the clamped point/`t`,
read the feature pseudonormal from `edgePseudoBuf`/`vertexPseudoBuf` at
`triIdx*9 + featureIdx*3` and set `bestSide` from the dot of `(p - edgePoint)` with
that pseudonormal instead of the face normal. Use the same `(x as any).method` cast
style and `.toVar()` discipline as the surrounding code. The inside branch (578-582)
is unchanged. The push (644-657) is unchanged (still pushes along `nnx,nny,nnz`).

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b --noEmit`
Expected: clean. (TSL kernels are not unit-testable in isolation here; the proof is
@gpu-local in Task 5, plus the CPU unit test from Plan 1 that already locks the
geometry contract this mirrors.)

- [ ] **Step 3: Run the gate + commit** (`npx tsc -b --noEmit && npm run test`;
  commit "feat(collision): GPU Pass-2 inside/outside sign from closest-feature pseudonormal").

---

### Task 4: Seam residual-`restLength` floor (armscye pull-through)

**Files:**
- Modify: `src/utils/cloth/seamAssembly.ts` (the `restLength *= shrinkFactor` /
  snap-to-0 at ~746-754) and the GPU mirror `makeSeamConstraintFn` in
  `src/utils/cloth/gpu/tslSolver.ts` (the decay-to-0 in the kernel).
- Test: `src/utils/cloth/__tests__/seamAssembly.test.ts` (the floor on the CPU path).

**Interfaces:**
- Produces: the decaying seam `restLength` is clamped to a floor `SEAM_REST_FLOOR_M`
  (start `0.002` m) instead of 0, so paired edges meet at the surface, not an
  interior point. Add the constant to `DEFAULT_SEAM_CONFIG` (or near the shrink) so
  it is tunable.

- [ ] **Step 1: Write the failing test (CPU floor)**

```ts
// assert a seam whose restLength has decayed below the floor is clamped TO the
// floor, not 0. Use the existing solveSeamConstraints/shrink path with enough
// shrink iterations to drive restLength below 0.002, then assert it equals 0.002.
```

(Write the concrete assertion against the real `seamAssembly` shrink API after
reading it — drive `restLength` down and assert `>= SEAM_REST_FLOOR_M`.)

- [ ] **Step 2: Run — verify it fails.**

- [ ] **Step 3: Implement** — clamp the decayed `restLength` to `Math.max(decayed,
  SEAM_REST_FLOOR_M)` in `seamAssembly.ts`; mirror the same floor in the GPU
  `makeSeamConstraintFn` decay (`.max(float(SEAM_REST_FLOOR_M))`).

- [ ] **Step 4: Run the test + gate. Commit** ("fix(seam): residual restLength floor so armscye seams stop pulling cloth through the shoulder").

---

### Task 5: @gpu-local validation (the visible fix)

**Files:**
- Modify (TEMP, revert after): `tests/e2e/webgpu-maria-replay.spec.ts` + a TEMP
  coverage/penetration diagnostic (re-use the pattern from this session's diag work:
  a signed inside-body fraction + body-coverage %, logged at the settled drape).

- [ ] **Step 1: Re-add the TEMP coverage/penetration diagnostic + a screenshot**

Mirror the session's earlier diagnostic: at the settled drape, log the signed
inside-body fraction (use the body normals — now we expect it to DROP vs the 38%
baseline) and capture a body-opaque screenshot to the scratchpad.

- [ ] **Step 2: Run @gpu-local**

Run: `npx playwright test --config playwright.webgpu.config.ts webgpu-maria-replay -g "drape M4"`
Expected: the drape M4 asserts still pass (belowHip<5, minY>0.5, maxY>1.3, nan=0);
the inside-body fraction drops sharply from ~38% (esp. at the shoulders); the
screenshot shows the shoulder/concave skin patches gone.

- [ ] **Step 3: Read the screenshot + the metric.** If patches remain, the residual
  is the FRONT face-poke (expected — that is Phase B, not this plan); record the
  measured residual face-poke for sizing Phase B.

- [ ] **Step 4: Revert the TEMP diagnostic** (`git restore` the e2e spec) and commit
  nothing from this task (it is validation only) — OR, if a permanent assertion is
  warranted, that belongs in Plan 3's coverage-metric task, not here.

---

## Self-Review

**Spec coverage (Plan 2 scope):** A1 GPU sign fix → Tasks 1-3 (build+upload+kernel).
A4 seam floor → Task 4. @gpu-local validation → Task 5. (A5 WASM port + the
first-class permanent coverage metric = Plan 3, a tracked A7 GPU-ahead divergence
in the meantime.)

**Placeholders:** Task 3 references the committed CPU implementation (`55d882b3`) as
the verbatim spec to mirror rather than re-pasting ~40 lines of TSL — a legitimate
"port X→Y" task where X is committed code. Task 4 Step 1 leaves the exact seam-shrink
assertion to be written against the real API (the shrink internals must be read);
the contract (clamp to `SEAM_REST_FLOOR_M=0.002`) is exact. Task 5 is validation
(no production code), so it has no unit test by nature.

**Type consistency:** `edgePseudonormals`/`vertexPseudonormals` (Task 1) flow into
the SBAs (Task 2) into `edgePseudoBuf`/`vertexPseudoBuf` (Task 3). `triCount*9`
layout + edge order AB(0),BC(1),CA(2) + vertex order A,B,C are consistent with Plan
1's builder and the CPU mirror.

**Next (Plan 3):** WASM/Rust port of the same sign fix + seam floor (restore the
parity oracle), and promote the coverage/occlusion metric to a first-class assertion
in the verify loop. Then the Phase-A whole-feature review.
