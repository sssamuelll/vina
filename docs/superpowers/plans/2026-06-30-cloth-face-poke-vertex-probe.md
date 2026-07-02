# Cloth Face-Poke — v1 Vertex Probe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a body-vertex-vs-cloth-face collision pass (the "face-poke" fix) on the GPU tier as a ship-quality probe, so a convex body bump stops showing through the flat cloth faces on María's front drape — then gate default-on behind one @gpu-local measurement.

**Architecture:** A face-aware collision correction in the engine's particle-owner shape: dispatch over particles; each particle gathers its incident cloth faces (a static CSR list built once), reads those faces' corners from an immutable per-frame snapshot, queries the EXISTING static body-triangle BVH for nearby body vertices, and pushes ONLY ITSELF out along the outward cloth-face normal so the face tents over the bump. The geometry is written + unit-tested as a pure CPU function FIRST (which is also the permanent CI correctness oracle), then ported verbatim into a TSL compute kernel run once per frame. Body-EDGE detection (Möller–Trumbore) is explicitly OUT of v1 — it is a measured escalation (see "Deferred").

**Tech Stack:** TypeScript, Three.js TSL/WebGPU (`three/webgpu`), Vitest, Playwright (@gpu-local).

**Spec:** `docs/superpowers/specs/2026-06-30-cloth-face-poke-collision-design.md` (Phase B, roster-revised). Read it before starting.

## Global Constraints

- Typecheck command is `npx tsc -b --noEmit` (build mode), NOT bare `tsc`. Tests: `npm run test`; single file `npx vitest run <path>`. Gate before every commit: `npx tsc -b --noEmit && npm run test`.
- **No `crates/xpbd-wasm` change in this plan** — v1 is GPU-only; the WASM sync rule does NOT apply. The CPU math (Task 2) is the CI oracle + the GPU reference; it is NOT wired into the CPU/WASM solver in v1 (that is the deferred parity port).
- **Determinism rule (BLOCKER B1):** the face pass MUST read cloth-face corner positions from an IMMUTABLE snapshot, never from the live `posBuf` it is writing. A gather over mutable co-owned state re-opens the #921 non-determinism axis.
- **Capability is a FLAT field (spec correction):** `SolverCapabilities` has no `collision` sub-object (`solverCapabilities.ts:23-111` is flat flags + a `tools` object). Add `facePoke: boolean` as a top-level sibling of `selfCollision`/`bodyCollision`. Every field except `frameDriven` is required (C4 #701) → all 4 tier constants must declare it.
- **Push axis = outward cloth-face normal** (NOT the body pseudonormal). The pseudonormal is used ONLY to disambiguate the face normal's outward sign. Distribute the correction by the constraint gradient `α_i / Σα_j²`, not raw barycentrics, clamped to `MAX_PUSH_DIST = 0.05`.
- **Cadence = once per frame** in the brush/normals slot (`GarmentSimulation.tsx:551-558`), after the substep loop — NOT inside `substepNodes`.
- TSL idiom (mirror existing kernels exactly): `(Fn as any)(() => { ... })()`, `instanceIndex`, `.toVar('name')`, `.assign()`, `.addAssign()`, `If(cond, () => {}).Else(() => {})`, `(x as any).method` casts. Do not invent new patterns.

---

## File Structure

- **Create** `src/utils/cloth/clothVertexFaces.ts` — pure builder: invert cloth triangle indices → per-vertex incident-face CSR. (Task 1)
- **Create** `src/utils/cloth/__tests__/clothVertexFaces.test.ts` — builder unit tests. (Task 1)
- **Create** `src/utils/cloth/facePokeCorrection.ts` — pure CPU geometry: body-vertex-vs-cloth-face penetration → per-corner correction. The reference + CI oracle. (Task 2)
- **Create** `src/utils/cloth/__tests__/facePokeCorrection.test.ts` — cube-poke oracle + control. (Task 2)
- **Modify** `src/utils/cloth/solverCapabilities.ts` — add `facePoke` to the interface + 4 tier constants. (Task 3)
- **Modify** `src/components/Viewport3D/SimulationStatusOverlay.tsx` — surface "face-poke off" when the active tier lacks it. (Task 3)
- **Modify** `src/utils/cloth/gpu/tslBuffers.ts` — `incidentFaceOffsetsSBA` + `incidentFaceListSBA` + `facePokeSnapshotSBA` in the buffer set. (Task 4)
- **Modify** `src/utils/cloth/gpu/gpuSolverClient.ts` — create/track/dispose the new SBAs; expose the face-poke compute nodes. (Task 4, 5)
- **Modify** `src/utils/cloth/gpu/tslCollision.ts` (or a new `gpu/tslFacePoke.ts`) — the face-poke snapshot + correction kernels. (Task 5)
- **Modify** `src/components/Viewport3D/GarmentSimulation.tsx` — dispatch the face-poke nodes once per frame, gated by capability. (Task 5)
- **Modify (TEMP, revert)** `tests/e2e/webgpu-maria-replay.spec.ts` — the measurement diagnostic. (Task 6)

---

### Task 1: `clothVertexFaces` incident-face CSR builder

**Files:**
- Create: `src/utils/cloth/clothVertexFaces.ts`
- Test: `src/utils/cloth/__tests__/clothVertexFaces.test.ts`

**Interfaces:**
- Consumes: cloth triangle indices `triangleIds: Uint32Array` (length `numTriangles*3`, the same buffer GPU `normalAccum` reads as `triangleIdsSBA`) + `numParticles: number`.
- Produces: `buildClothVertexFaces(triangleIds, numParticles) => { offsets: Uint32Array /* numParticles+1 */, faces: Uint32Array /* numTriangles*3 */ }`. For particle `p`, its incident triangle indices are `faces[offsets[p] .. offsets[p+1]]`. CSR (sorted-by-vertex) layout, GPU-uploadable.

- [ ] **Step 1: Write the failing test**

```ts
// src/utils/cloth/__tests__/clothVertexFaces.test.ts
import { describe, it, expect } from 'vitest';
import { buildClothVertexFaces } from '../clothVertexFaces';

describe('buildClothVertexFaces', () => {
  it('CSR: a shared vertex lists both incident triangles', () => {
    // two tris sharing edge (1,2): tri0=(0,1,2), tri1=(1,3,2)
    const triangleIds = new Uint32Array([0, 1, 2, 1, 3, 2]);
    const { offsets, faces } = buildClothVertexFaces(triangleIds, 4);
    expect(offsets.length).toBe(5); // numParticles+1
    const facesOf = (p: number) => Array.from(faces.slice(offsets[p], offsets[p + 1])).sort();
    expect(facesOf(0)).toEqual([0]);       // vertex 0 in tri0 only
    expect(facesOf(1)).toEqual([0, 1]);    // vertex 1 shared
    expect(facesOf(2)).toEqual([0, 1]);    // vertex 2 shared
    expect(facesOf(3)).toEqual([1]);       // vertex 3 in tri1 only
    expect(faces.length).toBe(6);          // numTriangles*3 total incidences
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `npx vitest run src/utils/cloth/__tests__/clothVertexFaces.test.ts`
Expected: FAIL (`buildClothVertexFaces is not a function`).

- [ ] **Step 3: Implement**

```ts
// src/utils/cloth/clothVertexFaces.ts
/** Per-vertex incident-face list in CSR form, built once from static cloth topology. */
export interface ClothVertexFaces {
  /** numParticles+1; particle p's faces are faces[offsets[p]..offsets[p+1]]. */
  offsets: Uint32Array;
  /** numTriangles*3 triangle indices, grouped by vertex. */
  faces: Uint32Array;
}

export function buildClothVertexFaces(
  triangleIds: Uint32Array,
  numParticles: number,
): ClothVertexFaces {
  const numTris = triangleIds.length / 3;
  // Pass 1: count incidences per vertex.
  const counts = new Uint32Array(numParticles);
  for (let i = 0; i < triangleIds.length; i++) counts[triangleIds[i]]++;
  // Prefix sum → offsets.
  const offsets = new Uint32Array(numParticles + 1);
  for (let p = 0; p < numParticles; p++) offsets[p + 1] = offsets[p] + counts[p];
  // Pass 2: scatter triangle indices into faces using a moving cursor.
  const faces = new Uint32Array(numTris * 3);
  const cursor = offsets.slice(0, numParticles); // copy; cursor[p] is next write slot for vertex p
  for (let t = 0; t < numTris; t++) {
    for (let k = 0; k < 3; k++) {
      const v = triangleIds[t * 3 + k];
      faces[cursor[v]++] = t;
    }
  }
  return { offsets, faces };
}
```

- [ ] **Step 4: Run — verify it passes**, then the gate (`npx tsc -b --noEmit && npm run test`).

- [ ] **Step 5: Commit**

```bash
git add src/utils/cloth/clothVertexFaces.ts src/utils/cloth/__tests__/clothVertexFaces.test.ts
git commit -m "feat(collision): cloth vertex→incident-face CSR builder (face-poke v1)"
```

---

### Task 2: Face-poke correction math (pure CPU — the reference + CI oracle)

**Files:**
- Create: `src/utils/cloth/facePokeCorrection.ts`
- Test: `src/utils/cloth/__tests__/facePokeCorrection.test.ts`

**Interfaces:**
- Consumes: a cloth face's 3 corner positions (from the snapshot), the body collision mesh (`CollisionMeshData` — `{ vertices: Float32Array /*triCount*9*/, normals, triCount }`), the body angle-weighted pseudonormals (`BodyPseudonormals` from `bodyPseudonormals.ts`, `{ vertex, edge }`, each `triCount*9`), and a margin.
- Produces: `facePokeCorrection(ax,ay,az, bx,by,bz, cx,cy,cz, bodyVerts, bodyVertPseudo, margin) => { dA:[3], dB:[3], dC:[3] }` — the position correction for each of the 3 face corners, accumulated over every penetrating body vertex. Zero vector when nothing pokes. This exact math is what the GPU kernel (Task 5) mirrors.

**Algorithm (v1 = body-vertex vs cloth-face):**
1. Face plane: `n = normalize((B−A) × (C−A))`.
2. Outward sign: flip `n` if `n · pseudo < 0`, where `pseudo` is the body vertex's vertex-pseudonormal (so `n` points away from the body).
3. For each candidate body vertex `P`: project onto the face plane, compute barycentrics `(α,β,γ)`. If all ≥ 0 (inside triangle) AND `signed = (P−A)·n_outward < margin` (penetrating side):
   - depth `d = margin − signed` (>0)
   - `s = α² + β² + γ²`
   - add `(α/s)·d·n_outward` to `dA`, `(β/s)·d·n_outward` to `dB`, `(γ/s)·d·n_outward` to `dC`.
4. Return accumulated `dA, dB, dC`. (Moving the corners by these clears the contact point by exactly `d` along `n_outward`; raw barycentrics would only clear `s·d`.)

- [ ] **Step 1: Write the failing test (cube-poke oracle + control)**

```ts
// src/utils/cloth/__tests__/facePokeCorrection.test.ts
import { describe, it, expect } from 'vitest';
import { facePokeCorrection } from '../facePokeCorrection';
import type { CollisionMeshData } from '../collisionMesh';
import { buildBodyPseudonormals } from '../bodyPseudonormals';

// One body vertex poking up (+y) through a flat cloth quad lying in the y=0.1 plane,
// cloth normal +y. We test ONE cloth triangle whose 3 corners are all OUTSIDE
// (above) the body vertex but whose interior is pierced.
function bodyVertexBump(): CollisionMeshData {
  // A tiny body "tent" whose apex vertex is at (0,0.2,0): 4 tris around the apex.
  // For the test we only need the apex vertex's position + a +y-ish pseudonormal,
  // so a single upward-facing tri with the apex as a corner suffices.
  const vertices = new Float32Array([
    0, 0.2, 0,  1, 0, 1,  -1, 0, 1, // tri with apex (0,0.2,0)
  ]);
  const normals = new Float32Array([0, 1, 0]);
  return { vertices, normals, triCount: 1 };
}

it('cube-poke: all 3 corners of a pierced cloth face lift +n; control face untouched', () => {
  const body = bodyVertexBump();
  const pn = buildBodyPseudonormals(body, 1e-6);
  // cloth triangle in the y=0.1 plane, corners around the apex's xz=(0,0), all outside (y=0.1 > nothing; apex y=0.2 is ABOVE the face → poking through from below is the mirror; use margin so apex at 0.2 vs face 0.1 with outward +y → signed = (0.2-0.1) = +0.1, inside band):
  const A = [-1, 0.1, -1], B = [1, 0.1, -1], C = [0, 0.1, 1];
  const margin = 0.15;
  const r = facePokeCorrection(
    A[0],A[1],A[2], B[0],B[1],B[2], C[0],C[1],C[2],
    body.vertices, pn.vertex, margin,
  );
  // apex projects inside the triangle and is within margin on the +y (outward) side → push all corners +y.
  expect(r.dA[1]).toBeGreaterThan(0);
  expect(r.dB[1]).toBeGreaterThan(0);
  expect(r.dC[1]).toBeGreaterThan(0);

  // CONTROL: a cloth face far away (xz offset by +10) — apex does not project inside → zero.
  const r2 = facePokeCorrection(
    9,0.1,9, 11,0.1,9, 10,0.1,11,
    body.vertices, pn.vertex, margin,
  );
  expect(r2.dA[0]).toBe(0); expect(r2.dA[1]).toBe(0); expect(r2.dA[2]).toBe(0);
});

it('a body vertex safely behind the face yields ZERO correction (sign discriminator)', () => {
  const body = bodyVertexBump();
  const pn = buildBodyPseudonormals(body, 1e-6);
  // Face well OUTWARD of the apex: face at y=0.5, apex at y=0.2 → apex sits 0.3
  // behind the outward (+y) face, > margin → must NOT be pushed. A wrong
  // `depth = margin - signed` would push it (harder the deeper it sits) and fail here.
  const A = [-1, 0.5, -1], B = [1, 0.5, -1], C = [0, 0.5, 1];
  const margin = 0.15;
  const r = facePokeCorrection(A[0],A[1],A[2], B[0],B[1],B[2], C[0],C[1],C[2], body.vertices, pn.vertex, margin);
  expect(r.dA[1]).toBe(0); expect(r.dB[1]).toBe(0); expect(r.dC[1]).toBe(0);
});
```

- [ ] **Step 2: Run — verify it fails** (`facePokeCorrection is not a function`).

- [ ] **Step 3: Implement**

```ts
// src/utils/cloth/facePokeCorrection.ts
import type { BodyPseudonormals } from './bodyPseudonormals';

export interface FacePokeResult {
  dA: [number, number, number];
  dB: [number, number, number];
  dC: [number, number, number];
}

/**
 * v1 face-poke correction: body VERTICES vs a single cloth face.
 * Pure geometry — the GPU kernel (TSL) mirrors this exactly. Body EDGES are
 * out of v1 (measured escalation).
 *
 * @param bodyVerts CollisionMeshData.vertices (triCount*9; we treat the 3 verts/tri as candidate body points)
 * @param bodyVertPseudo BodyPseudonormals.vertex (triCount*9; vertex-pseudonormal per body vert, same layout)
 */
export function facePokeCorrection(
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number,
  bodyVerts: Float32Array,
  bodyVertPseudo: Float32Array,
  margin: number,
): FacePokeResult {
  // Face plane normal n = (B-A) x (C-A), normalized.
  const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
  const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
  let nx = e1y * e2z - e1z * e2y;
  let ny = e1z * e2x - e1x * e2z;
  let nz = e1x * e2y - e1y * e2x;
  const nl = Math.hypot(nx, ny, nz) || 1;
  nx /= nl; ny /= nl; nz /= nl;

  const dA: [number, number, number] = [0, 0, 0];
  const dB: [number, number, number] = [0, 0, 0];
  const dC: [number, number, number] = [0, 0, 0];

  // Precompute for barycentric (cached dot products of edge vectors).
  const d00 = e1x * e1x + e1y * e1y + e1z * e1z;
  const d01 = e1x * e2x + e1y * e2y + e1z * e2z;
  const d11 = e2x * e2x + e2y * e2y + e2z * e2z;
  const denom = d00 * d11 - d01 * d01;
  if (denom === 0) return { dA, dB, dC };

  const nVerts = bodyVerts.length / 3;
  for (let v = 0; v < nVerts; v++) {
    const px = bodyVerts[v * 3], py = bodyVerts[v * 3 + 1], pz = bodyVerts[v * 3 + 2];
    // Outward orientation via this body vertex's pseudonormal.
    const pnx = bodyVertPseudo[v * 3], pny = bodyVertPseudo[v * 3 + 1], pnz = bodyVertPseudo[v * 3 + 2];
    let ox = nx, oy = ny, oz = nz;
    if (ox * pnx + oy * pny + oz * pnz < 0) { ox = -ox; oy = -oy; oz = -oz; }
    // Signed distance of P from the face plane, along outward normal.
    const signed = (px - ax) * ox + (py - ay) * oy + (pz - az) * oz;
    if (signed <= -margin) continue; // body vertex safely >= margin behind the face → no violation
    // Barycentric of P projected onto the triangle.
    const wx = px - ax, wy = py - ay, wz = pz - az;
    const d20 = wx * e1x + wy * e1y + wz * e1z;
    const d21 = wx * e2x + wy * e2y + wz * e2z;
    const beta = (d11 * d20 - d01 * d21) / denom;
    const gamma = (d00 * d21 - d01 * d20) / denom;
    const alpha = 1 - beta - gamma;
    if (alpha < 0 || beta < 0 || gamma < 0) continue; // projects outside the triangle
    const depth = signed + margin; // > 0 — push the face out until the body vert sits margin behind it
    const s = alpha * alpha + beta * beta + gamma * gamma;
    if (s === 0) continue;
    const ka = (alpha / s) * depth, kb = (beta / s) * depth, kg = (gamma / s) * depth;
    dA[0] += ka * ox; dA[1] += ka * oy; dA[2] += ka * oz;
    dB[0] += kb * ox; dB[1] += kb * oy; dB[2] += kb * oz;
    dC[0] += kg * ox; dC[1] += kg * oy; dC[2] += kg * oz;
  }
  return { dA, dB, dC };
}
```

- [ ] **Step 4: Run — verify it passes**, then the gate.

- [ ] **Step 5: Commit**

```bash
git add src/utils/cloth/facePokeCorrection.ts src/utils/cloth/__tests__/facePokeCorrection.test.ts
git commit -m "feat(collision): face-poke correction math + cube-poke oracle (CPU reference, face-poke v1)"
```

---

### Task 3: `facePoke` capability flag + status overlay

**Files:**
- Modify: `src/utils/cloth/solverCapabilities.ts` (interface ~:23-111; constants CPU ~:117, WASM ~:141, GPU ~:181, NEURAL ~:281)
- Modify: `src/components/Viewport3D/SimulationStatusOverlay.tsx` (~:87-91, mirror the "No body collision" surface)
- Test: `src/utils/cloth/__tests__/solverCapabilities.test.ts` (if present; else add a minimal one)

**Interfaces:**
- Produces: `SolverCapabilities.facePoke: boolean` (required, flat field). GPU constant = `true`; CPU/WASM/NEURAL = `false` (GPU-only v1).

- [ ] **Step 1: Add the field to the interface**

In `solverCapabilities.ts`, add to the interface next to `bodyCollision`:
```ts
  /** Body-vertex-vs-cloth-face correction (face-poke). GPU-only in v1; see
   *  docs/superpowers/specs/2026-06-30-cloth-face-poke-collision-design.md. */
  facePoke: boolean;
```

- [ ] **Step 2: Set it in all 4 tier constants**

`GPU_CAPABILITIES`: `facePoke: true`. `CPU_CAPABILITIES`, `WASM_CAPABILITIES`, `NEURAL_CAPABILITIES`: `facePoke: false`. (Required field → tsc fails if any is omitted; that compile error IS the test that no tier silently skips it.)

- [ ] **Step 3: Surface "face-poke off" in the overlay**

In `SimulationStatusOverlay.tsx`, mirror the existing `!bodyCollision` block (~:87-91): when the active tier has `bodyCollision` but NOT `facePoke`, render a small note ("Body detail may show through cloth — face-poke unavailable on this tier"). This is the device-loss quality signal (GPU→WASM cascade silently loses face-poke).

- [ ] **Step 4: Run the gate**

Run: `npx tsc -b --noEmit && npm run test`
Expected: clean (the required field forces all 4 constants; any existing capabilities test still passes).

- [ ] **Step 5: Commit**

```bash
git add src/utils/cloth/solverCapabilities.ts src/components/Viewport3D/SimulationStatusOverlay.tsx
git commit -m "feat(collision): facePoke capability flag (GPU-only v1) + overlay downgrade signal"
```

---

### Task 4: GPU buffer plumbing — incident-face CSR + snapshot SBAs

**Files:**
- Modify: `src/utils/cloth/gpu/tslBuffers.ts` (the buffer-set type + `createTslBuffers`; `createSBA` is at `:292`)
- Modify: `src/utils/cloth/gpu/gpuSolverClient.ts` (create/track/dispose; SBA creation ~:1011-1017; disposal sites ~:1002-1007, ~:1171-1176, ~:1188-1193)

**Interfaces:**
- Consumes: `buildClothVertexFaces` (Task 1); the cloth `triangleIds` already uploaded as `triangleIdsSBA`; `numParticles`, `numTriangles`.
- Produces: three new SBAs available to the kernel (Task 5):
  - `incidentFaceOffsetsSBA` (uint, `numParticles+1`) ← `offsets`
  - `incidentFaceListSBA` (uint, `numTriangles*3`) ← `faces`
  - `facePokeSnapshotSBA` (vec3-as-float, `numParticles*3` or a `'vec3'` storage of `N`) — scratch for the per-frame immutable read source.

- [ ] **Step 1: Add the three SBAs to the buffer set + create them**

In `tslBuffers.ts`, add `incidentFaceOffsetsSBA`, `incidentFaceListSBA`, `facePokeSnapshotSBA` to the buffer-set type and create them in `createTslBuffers` (build the CSR via `buildClothVertexFaces(triangleIds, numParticles)`; `facePokeSnapshotSBA = createSBA(new Float32Array(numParticles*3), 3)`). Use the same `createSBA(array, itemSize)` idiom as the existing buffers.

- [ ] **Step 2: Track + dispose in gpuSolverClient.ts**

Add the three SBAs to whatever owns per-solver buffers (they are cloth-topology + per-particle, so they live with the buffer set, not `collisionBodySBAs`); ensure they are disposed in the solver's dispose path alongside the other per-particle SBAs. (The 3 collision-body disposal sites at ~:1002-1007 / ~:1171-1176 / ~:1188-1193 are for BODY buffers; these new ones are CLOTH buffers — dispose them where the buffer set is disposed.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc -b --noEmit`
Expected: clean. (No behavior yet; Task 5 consumes these. If a boundary-contract test pins the buffer-set shape, update it to expect the 3 new SBAs and run it.)

- [ ] **Step 4: Run the gate + commit**

```bash
git add src/utils/cloth/gpu/tslBuffers.ts src/utils/cloth/gpu/gpuSolverClient.ts
git commit -m "feat(collision): allocate incident-face CSR + face-poke snapshot SBAs (face-poke v1)"
```

---

### Task 5: GPU face-poke kernel + once-per-frame dispatch

**Files:**
- Modify (or create `gpu/tslFacePoke.ts`): `src/utils/cloth/gpu/tslCollision.ts` — two kernels: a snapshot copy and the correction kernel.
- Modify: `src/utils/cloth/gpu/gpuSolverClient.ts` — build + expose the two compute nodes on the solver object.
- Modify: `src/components/Viewport3D/GarmentSimulation.tsx` — dispatch them once per frame in the brush/normals block (~:551-558), gated by the `facePoke` capability.

**Interfaces:**
- Consumes: `posBuf`, `prevPosBuf` (vec3 storage of N); `facePokeSnapshotBuf` (vec3, N); `incidentFaceOffsetsBuf` (uint, N+1); `incidentFaceListBuf` (uint, numTriangles*3); `triIdsBuf` (uint, numTriangles*3 — cloth topology, as `normalAccum` uses); the body BVH buffers + `triVertBuf`/`vertexPseudoBuf` already threaded into `createTslCollisionBody`; `uMargin`, `MAX_PUSH_DIST`.
- Produces: `solver.facePokeNodes = { snapshot: ComputeNode, correct: ComputeNode }`, dispatched `compute(fn, numParticles, [64])` each.

**Reference (the verbatim spec for the kernel math): Task 2's committed `facePokeCorrection`** — port it into TSL using the idioms from `makeSeamConstraintFn` (`tslSolver.ts:486-532`) and the BVH traversal from `findBestNode` (`tslCollision.ts:284-507`).

- [ ] **Step 1: Snapshot kernel (immutable read source — the B1 fix)**

Mirror `makeSnapshotPreCollisionFn` (`tslSolver.ts:540-545`): a kernel copying `posBuf.element(i)` → `facePokeSnapshotBuf.element(i)`, dispatched over `numParticles`. This runs FIRST each frame so the correction kernel reads frozen corner positions, never live `posBuf`.

- [ ] **Step 2: Correction kernel — port `facePokeCorrection` to TSL**

`(Fn as any)(() => { ... })()` over `instanceIndex` (the particle `i`):
- Read `i`'s own snapshot pos; init a `corr = vec3(0).toVar()`.
- Loop `i`'s incident faces: `start = incidentFaceOffsetsBuf.element(i)`, `end = incidentFaceOffsetsBuf.element(i+1)`; for each slot read `t = incidentFaceListBuf.element(slot)`, then the face's 3 cloth-vertex indices from `triIdsBuf.element(t*3 + {0,1,2})`, then their positions from `facePokeSnapshotBuf` (NOT `posBuf`).
- Build the face AABB; traverse the body BVH (mirror `findBestNode`'s stackless skip-pointer loop, `tslCollision.ts:329-334` for the AABB-overlap descent) to enumerate candidate body triangles; for each, take its 3 body verts (`triVertBuf`) + vertex-pseudonormals (`vertexPseudoBuf`, layout `t_body*9 + vert*3`) and run the Task-2 math: outward-orient `n_face` by the pseudonormal, barycentric-project the body vert, and if penetrating accumulate THIS particle's share `(α_self / Σα²)·depth·n_outward` into `corr` (where `α_self` is the barycentric weight of whichever corner is `i`).
- Clamp `|corr|` to `MAX_PUSH_DIST` (`(corr as any)...min(...)`, mirror the push clamp at `tslCollision.ts:730-742`).
- **Write (velocity-neutral baseline):** `posBuf.element(i).addAssign(corr)` AND `prevPosBuf.element(i).addAssign(corr)` — moving both leaves velocity `pos−prevPos` unchanged, so the tent holds without injecting speed. (Refinement, only if Task 6 shows the tent collapsing under inward velocity: instead damp the inward-normal component by adding `corr` to `pos` and `corr + max(0,−(vel·n))·n` to `prevPos`. Decide from the measurement.)

- [ ] **Step 3: Build + expose the nodes in gpuSolverClient.ts**

Construct both compute nodes (`compute(snapshotFn, numParticles, [64])`, `compute(correctFn, numParticles, [64])`) where the other solver nodes are built, and expose them as `facePokeNodes` on the returned solver object.

- [ ] **Step 4: Dispatch once per frame, gated by capability**

In `GarmentSimulation.tsx`, in the brush/normals block (~:551-558, AFTER the `for (let s...) renderer.compute(substepNodes)` loop), add — only when the active tier's `facePoke` capability is true:
```ts
renderer.compute(solver.facePokeNodes.snapshot);
renderer.compute(solver.facePokeNodes.correct);
```
Place it BEFORE `solver.normalZero/normalAccum/normalNormalize` so the recomputed cloth normals reflect the tented geometry.

- [ ] **Step 5: Typecheck + gate**

Run: `npx tsc -b --noEmit && npm run test`
Expected: clean (TSL kernels aren't unit-tested here; the CPU oracle from Task 2 locks the math contract this mirrors; @gpu-local proves the integration in Task 6).

- [ ] **Step 6: Commit**

```bash
git add src/utils/cloth/gpu/tslCollision.ts src/utils/cloth/gpu/gpuSolverClient.ts src/components/Viewport3D/GarmentSimulation.tsx
git commit -m "feat(collision): GPU face-poke pass — snapshot + per-particle correction, once/frame (face-poke v1)"
```

---

### Task 6: @gpu-local measurement gate (the ruling-(c) decision)

**Files:**
- Modify (TEMP, revert after): `tests/e2e/webgpu-maria-replay.spec.ts`

This task is **validation, maintainer-run** (real GPU; CI never runs it). It produces the DECISION, not code.

- [ ] **Step 1: Add a TEMP face-poke diagnostic**

At the settled drape (the M4 checkpoint), log (a) frame time / fps with the face-poke pass on vs off (toggle the capability), and (b) a face-poke residual at the nipple/ab regions (the front signed-inside-body / overdraw fraction, reuse the Phase-A diagnostic pattern) + a body-opaque screenshot to the scratchpad.

- [ ] **Step 2: Run @gpu-local**

Run: `npx playwright test --config playwright.webgpu.config.ts webgpu-maria-replay -g "drape M4"`

- [ ] **Step 3: Apply the decision table (spec §7)**

| fps | nipple | Outcome |
|---|---|---|
| ≥30 (device margin) | closed | **PROMOTE**: face-poke default-on for the GPU tier; record the number in the ledger; edge test never built. |
| ≥30 | survives | The bug is the **edge regime** → open the deferred edge escalation (below), budgeted against the measured residual, with an optimization pass before default-on. |
| <30 | — | Escalate to **architecture** (quality-tier gating / cost optimization) before any default-on; do NOT ship default-on. |

Also record: breathing/shimmer (→ pick the velocity refinement in Task 5 Step 2), and whether a tether fight appears at nipple/ab radii (spec §A6).

- [ ] **Step 4: Revert the TEMP diagnostic** (`git restore tests/e2e/webgpu-maria-replay.spec.ts`). If "PROMOTE", make the GPU `facePoke` flag default-on the only production change; commit that.

---

## Deferred (conditional — only if Task 6 shows the nipple survives vertex-only)

**Body-edge Möller–Trumbore escalation.** Add body-edge-vs-cloth-face detection (segment-triangle, reimplemented from `nakjun/IntersectionShader.ts`, learn-only) to the correction math (Task 2 CPU first, then the Task 5 kernel), driven by the body BVH (never all-pairs), gated behind an optimization pass (it is the heaviest leaf). This is a SEPARATE plan, written only on a measured trigger — do not build speculatively. Rationale: the poke geometry (spec §1) makes the edge regime real, but the measurement decides whether v1 vertex-only already closes María's bump.

**WASM/CPU parity port + boundary oracle in the WASM CI.** Tracked A7 GPU-ahead divergence (like strain-limit/tether). Separate follow-up; the Task-2 CPU math is already the reference.

---

## Self-Review

**Spec coverage:** §A2 gather-from-snapshot → Task 5 Step 1-2 (B1). §A3 vertex-only v1 → Tasks 2,5; edge deferred → "Deferred". §A4 outward-n_face + α/Σα² + MAX_PUSH → Task 2 + Task 5 Step 2. §A5 once-per-frame slot + velocity → Task 5 Step 4 + Step 2. §A6 tether = measurement → Task 6 Step 3. §A7 capability flag (flat, 4 tiers) + downgrade signal + CPU-mirror oracle → Task 3 + Task 2. §6 clothVertexFaces via inversion → Task 1 + Task 4. §7 measurement gate + decision table → Task 6.

**Placeholder scan:** CPU code (Tasks 1-3) is complete + runnable. GPU kernels (Task 5) follow the house "port the committed CPU reference into TSL via the named idiom + mirror the named traversal" pattern (same as the reviewed-clean Phase-A GPU plan) — the algorithm is fully specified by Task 2's committed code; the TSL is transcription against cited line ranges. No "TBD/handle edge cases".

**Type consistency:** `buildClothVertexFaces → {offsets, faces}` (Task 1) feeds Task 4's SBAs and Task 5's `incidentFaceOffsetsBuf`/`incidentFaceListBuf`. `facePokeCorrection(...)` per-corner `{dA,dB,dC}` (Task 2) = the per-particle `corr` accumulation in Task 5. `SolverCapabilities.facePoke` (Task 3) gates Task 5 Step 4. `MAX_PUSH_DIST`, `triIdsBuf`, `vertexPseudoBuf`, snapshot idiom all referenced at their verified locations.

---

## Execution Handoff

Recommended: **subagent-driven-development** — fresh implementer per task, two-stage review, with the **de-risk order from spec §8** (budget/fps gate is risk #1; the measurement Task 6 is what unblocks default-on). Tasks 1-3 are CPU/mechanical (cheap model); Tasks 4-5 are GPU integration (standard model); Task 6 is maintainer-run.
