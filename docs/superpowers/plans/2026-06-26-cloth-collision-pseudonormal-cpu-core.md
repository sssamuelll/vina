# Cloth–Body Collision Pseudonormals — Plan 1: De-risk + CPU Geometry Core

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and unit-test the angle-weighted pseudonormal geometry that gives a
correct inside/outside sign at concave body junctions, and wire it into the CPU
collision reference (`triangleCollision.ts`) — proving the fix in isolation before
any GPU/WASM port.

**Architecture:** A new pure builder welds the body's triangle-soup collision mesh
into an indexed manifold and computes, per triangle, the angle-weighted
pseudonormal of each edge and each vertex (Baerentzen–Aanaes 2005). The CPU
closest-point/side test then derives `side` from the pseudonormal of the *closest
feature* (face → face normal, edge → edge pseudonormal, vertex → vertex
pseudonormal) instead of always the face normal. This is pure CPU geometry,
unit-testable on synthetic concave fixtures.

**Tech Stack:** TypeScript, Vitest. No GPU/WASM in this plan.

**Spec:** `docs/superpowers/specs/2026-06-26-cloth-body-collision-pseudonormal-design.md`
(Phase A). This plan is Phase-A Sub-plan 1 of 2; Sub-plan 2 (GPU/WASM ports + seam
floor + coverage metric + @gpu-local validation) follows once this core is green.

## Global Constraints

- Typecheck command is `npx tsc -b --noEmit` (build mode), NOT bare `tsc`.
- Unit tests: `npm run test`. Single file: `npx vitest run <path>`.
- IDs via `newId()` from `src/utils/ids.ts` where applicable (not needed here).
- The body collision mesh is **triangle soup**: `CollisionMeshData.vertices` is the
  expanded 9-floats-per-triangle format (3 unique verts/tri, no sharing);
  `CollisionMeshData.normals` is 3 floats/tri (one face normal). See
  `src/utils/cloth/gpu/bvh.ts`.
- The fix must NOT change behavior for the face-interior (inside-projection) case —
  there the face normal already IS the correct pseudonormal.
- Run the gate before each commit: `npx tsc -b --noEmit && npm run test`.

---

## File Structure

- **Create** `src/utils/cloth/bodyPseudonormals.ts` — pure builder: weld soup →
  manifold, build edge/vertex adjacency, compute angle-weighted edge + vertex
  pseudonormals, emit them in the soup's per-triangle ordering for O(1) lookup by
  the collision test. One responsibility: turn a `CollisionMeshData` into
  per-triangle pseudonormal data.
- **Create** `src/utils/cloth/__tests__/bodyPseudonormals.test.ts` — unit tests
  (weld correctness, manifold edge sharing, angle-weighted values, the concave-wedge
  sign).
- **Create** `scripts/weldability-spike.mjs` — Task 1 measurement (welds the real
  María avatar collision mesh and reports manifoldness). Throwaway-ish but kept for
  re-running on new avatars.
- **Modify** `src/utils/cloth/triangleCollision.ts` — the closest-point/side
  function (lines ~12–93) to accept optional per-triangle pseudonormals and use the
  closest-feature pseudonormal for `side`.
- **Modify/Create** `src/utils/cloth/__tests__/triangleCollision.test.ts` — add the
  concave-wedge case that the face-normal path misclassifies and the pseudonormal
  path fixes.

---

### Task 1: Weldability spike (de-risk gate)

The spec makes this the gate: a human body mesh is often non-manifold at the
armpit/armscye, where pseudonormals would be garbage exactly where we need them.
Measure the REAL avatar mesh before investing in the pipeline.

**Files:**
- Create: `scripts/weldability-spike.mjs`

**Interfaces:**
- Consumes: the same avatar GLB the sim loads (the default avatar URL used by
  `extractAvatarCollisionMesh`). Reuse `extractAvatarCollisionMesh` from
  `src/utils/cloth/avatarCollisionMesh.ts` if it runs under Node; otherwise load the
  GLB via `three`'s `GLTFLoader` in Node and extract the same way.
- Produces: a console report. No code other tasks consume — this task's deliverable
  is the DECISION it informs (does the body weld clean at armpit/armscye? what
  fallback does Task 2/3 need?).

- [ ] **Step 1: Write the spike script**

The script welds vertices within an epsilon, then counts non-manifold edges (edges
shared by ≠ 2 triangles) and reports where they cluster (by y-height band, to
locate armpit/armscye ≈ y 1.3–1.5, crotch ≈ y 0.8).

```js
// scripts/weldability-spike.mjs
// Run: node scripts/weldability-spike.mjs
// Loads the avatar collision mesh (triangle soup), welds it, and reports
// manifoldness — especially at the armpit/armscye (y≈1.3–1.5) where the
// pseudonormal sign fix is load-bearing.
import { weldAndCountManifold } from '../src/utils/cloth/bodyPseudonormals.ts';
// ^ implemented in Task 2; until then, inline the weld+count here for the spike.

// TODO(implementer): load the same avatar collision mesh the sim uses.
// Easiest: import a saved fixture of the María avatar's CollisionMeshData, or
// run extractAvatarCollisionMesh under a jsdom/three Node harness. Produce
// `mesh = { vertices: Float32Array(triCount*9), normals: Float32Array(triCount*3), triCount }`.

const report = weldAndCountManifold(mesh, 1e-4);
console.log('[weldability]', JSON.stringify(report, null, 2));
```

- [ ] **Step 2: Run it and record the result**

Run: `node scripts/weldability-spike.mjs`
Expected: a report like
`{ welded: N, nonManifoldEdges: M, boundaryEdges: B, byBand: { "1.3-1.5": ... } }`.

**Decision recorded in the task ledger / Plan 2:** if `nonManifoldEdges` at the
armpit/armscye band is ~0 → the clean-weld path is sufficient (Task 3 falls back to
the face normal only for the rare boundary edge). If it is significant → Task 3's
fallback must be the generalized-winding-number inside test for those verts; note
the count so Plan 2 sizes it.

- [ ] **Step 3: Commit**

```bash
git add scripts/weldability-spike.mjs
git commit -m "spike(collision): measure avatar mesh weldability at armpit/armscye"
```

> Note: this task depends on `weldAndCountManifold` from Task 2. Implement Task 2
> first if running strictly TDD, then return here; or inline the weld+count in the
> script and refactor into the module in Task 2. Either order is fine — the spike's
> value is the MEASUREMENT.

---

### Task 2: Weld + adjacency + angle-weighted pseudonormal builder

**Files:**
- Create: `src/utils/cloth/bodyPseudonormals.ts`
- Test: `src/utils/cloth/__tests__/bodyPseudonormals.test.ts`

**Interfaces:**
- Consumes: `CollisionMeshData` (`{ vertices: Float32Array /*triCount*9*/, normals:
  Float32Array /*triCount*3*/, triCount: number }`) from `src/utils/cloth/collisionMesh`.
- Produces:
  - `weldAndCountManifold(mesh, eps): { welded: number; tris: number; nonManifoldEdges: number; boundaryEdges: number; byBand: Record<string, number> }`
  - `buildBodyPseudonormals(mesh, eps?): BodyPseudonormals` where
    `BodyPseudonormals = { edge: Float32Array /*triCount*9 — per tri, 3 edges × xyz, edge order AB,BC,CA*/; vertex: Float32Array /*triCount*9 — per tri, 3 verts × xyz, vertex order A,B,C*/ }`.
  - Both pseudonormal arrays are UNIT vectors, in the SAME per-triangle ordering as
    `mesh.vertices` (so a collision test that already has the triangle index `t` reads
    `edge[t*9 + edgeIdx*3 + c]` / `vertex[t*9 + vertIdx*3 + c]`).

- [ ] **Step 1: Write the failing test (weld shares an edge)**

```ts
// src/utils/cloth/__tests__/bodyPseudonormals.test.ts
import { describe, it, expect } from 'vitest';
import { weldAndCountManifold, buildBodyPseudonormals } from '../bodyPseudonormals';

// Two triangles sharing edge B–C, forming a 90° concave valley (a "V" pointing
// up): tri0 in the +x plane, tri1 in the +z plane, hinge along the y axis.
// soup layout: 9 floats/tri (A,B,C), 3 floats/tri face normal.
function makeConcaveValley() {
  // tri0: A0(1,0,0) B(0,0,0) C(0,1,0), face normal +z-ish (outward of the +x wall)
  // tri1: A1(0,0,1) B(0,0,0) C(0,1,0), face normal +x-ish (outward of the +z wall)
  // Shared edge B(0,0,0)–C(0,1,0). The interior wedge (between the walls) is the
  // region x>0,z>0; a point there is "outside" both walls but a single face normal
  // of either wall misclassifies it.
  const vertices = new Float32Array([
    1, 0, 0,  0, 0, 0,  0, 1, 0, // tri0 A0,B,C
    0, 0, 1,  0, 0, 0,  0, 1, 0, // tri1 A1,B,C
  ]);
  // Outward normals (point away from the wedge interior x>0,z>0):
  // tri0 (the +x wall) faces -z... choose consistent outward = (0,0,-1)? See note.
  const normals = new Float32Array([0, 0, -1,  -1, 0, 0]);
  return { vertices, normals, triCount: 2 };
}

it('welds the shared edge B–C into a manifold (1 non-boundary edge shared by 2 tris)', () => {
  const r = weldAndCountManifold(makeConcaveValley(), 1e-6);
  expect(r.welded).toBe(4); // 6 soup verts → 4 unique (B and C shared)
  expect(r.nonManifoldEdges).toBe(0);
  expect(r.boundaryEdges).toBe(4); // the 4 outer edges (each in 1 tri); B–C is shared
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `npx vitest run src/utils/cloth/__tests__/bodyPseudonormals.test.ts`
Expected: FAIL (`weldAndCountManifold is not a function` / module not found).

- [ ] **Step 3: Implement the weld + manifold count**

```ts
// src/utils/cloth/bodyPseudonormals.ts
import type { CollisionMeshData } from './collisionMesh';

export interface BodyPseudonormals {
  /** triCount*9 — per tri: 3 edge pseudonormals (AB, BC, CA) × xyz, unit. */
  edge: Float32Array;
  /** triCount*9 — per tri: 3 vertex pseudonormals (A, B, C) × xyz, unit. */
  vertex: Float32Array;
}

/** Quantize a vertex to an integer grid key for welding within `eps`. */
function vkey(x: number, y: number, z: number, eps: number): string {
  const q = 1 / eps;
  return `${Math.round(x * q)},${Math.round(y * q)},${Math.round(z * q)}`;
}

/** Weld soup verts; return per-soup-vert the welded index + the welded positions. */
function weld(mesh: CollisionMeshData, eps: number) {
  const v = mesh.vertices;
  const map = new Map<string, number>();
  const weldedOf = new Int32Array(mesh.triCount * 3); // soup vert i -> welded id
  const pos: number[] = [];
  for (let i = 0; i < mesh.triCount * 3; i++) {
    const x = v[i * 3], y = v[i * 3 + 1], z = v[i * 3 + 2];
    const k = vkey(x, y, z, eps);
    let id = map.get(k);
    if (id === undefined) { id = pos.length / 3; map.set(k, id); pos.push(x, y, z); }
    weldedOf[i] = id;
  }
  return { weldedOf, positions: new Float32Array(pos), weldedCount: pos.length / 3 };
}

export function weldAndCountManifold(mesh: CollisionMeshData, eps: number) {
  const { weldedOf, weldedCount } = weld(mesh, eps);
  // Count edge usage by welded-vertex pair (unordered).
  const use = new Map<string, number>();
  const band = new Map<string, number>();
  const ek = (a: number, b: number) => (a < b ? `${a}_${b}` : `${b}_${a}`);
  for (let t = 0; t < mesh.triCount; t++) {
    const a = weldedOf[t * 3], b = weldedOf[t * 3 + 1], c = weldedOf[t * 3 + 2];
    for (const [p, q] of [[a, b], [b, c], [c, a]] as const) {
      const k = ek(p, q);
      use.set(k, (use.get(k) ?? 0) + 1);
    }
  }
  let nonManifoldEdges = 0, boundaryEdges = 0;
  for (const n of use.values()) {
    if (n === 1) boundaryEdges++;
    else if (n > 2) nonManifoldEdges++;
  }
  // y-band histogram of non-manifold edges for armpit/armscye locating — fill on
  // demand from the welded positions; omitted here for brevity in the count path.
  void band;
  return { welded: weldedCount, tris: mesh.triCount, nonManifoldEdges, boundaryEdges, byBand: {} as Record<string, number> };
}
```

- [ ] **Step 4: Run — verify it passes**

Run: `npx vitest run src/utils/cloth/__tests__/bodyPseudonormals.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing test (angle-weighted pseudonormals)**

```ts
it('edge pseudonormal of the shared edge = normalized sum of the two face normals', () => {
  const mesh = makeConcaveValley(); // face normals (0,0,-1) and (-1,0,0)
  const pn = buildBodyPseudonormals(mesh, 1e-6);
  // tri0 edge BC is edge index 1 (AB=0, BC=1, CA=2). Its pseudonormal = normalize(
  // n0 + n1) = normalize((0,0,-1)+(-1,0,0)) = (-1,0,-1)/√2.
  const e = pn.edge; const base = 0 * 9 + 1 * 3;
  const inv = 1 / Math.SQRT2;
  expect(e[base]).toBeCloseTo(-inv, 5);
  expect(e[base + 1]).toBeCloseTo(0, 5);
  expect(e[base + 2]).toBeCloseTo(-inv, 5);
});
```

- [ ] **Step 6: Run — verify it fails** (`buildBodyPseudonormals is not a function`).

- [ ] **Step 7: Implement `buildBodyPseudonormals`**

```ts
// append to src/utils/cloth/bodyPseudonormals.ts
function norm3(x: number, y: number, z: number): [number, number, number] {
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
}

/** Interior angle of triangle t at its local vertex `lv` (0=A,1=B,2=C). */
function vertexAngle(v: Float32Array, t: number, lv: number): number {
  const o = t * 9;
  const P = (k: number): [number, number, number] => [v[o + k * 3], v[o + k * 3 + 1], v[o + k * 3 + 2]];
  const a = P(lv), b = P((lv + 1) % 3), c = P((lv + 2) % 3);
  const u = norm3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const w = norm3(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
  const d = Math.max(-1, Math.min(1, u[0] * w[0] + u[1] * w[1] + u[2] * w[2]));
  return Math.acos(d);
}

export function buildBodyPseudonormals(mesh: CollisionMeshData, eps = 1e-4): BodyPseudonormals {
  const { weldedOf } = weld(mesh, eps);
  const N = mesh.triCount;
  const fn = mesh.normals; // 3 floats/tri (unit face normals)

  // Accumulate angle-weighted face normals per welded vertex, and summed face
  // normals per welded edge.
  const vAcc = new Map<number, [number, number, number]>();
  const eAcc = new Map<string, [number, number, number]>();
  const ek = (a: number, b: number) => (a < b ? `${a}_${b}` : `${b}_${a}`);
  for (let t = 0; t < N; t++) {
    const nx = fn[t * 3], ny = fn[t * 3 + 1], nz = fn[t * 3 + 2];
    const w = [weldedOf[t * 3], weldedOf[t * 3 + 1], weldedOf[t * 3 + 2]];
    for (let lv = 0; lv < 3; lv++) {
      const ang = vertexAngle(mesh.vertices, t, lv);
      const id = w[lv];
      const acc = vAcc.get(id) ?? [0, 0, 0];
      acc[0] += nx * ang; acc[1] += ny * ang; acc[2] += nz * ang;
      vAcc.set(id, acc);
    }
    for (const [p, q] of [[w[0], w[1]], [w[1], w[2]], [w[2], w[0]]] as const) {
      const k = ek(p, q);
      const acc = eAcc.get(k) ?? [0, 0, 0];
      acc[0] += nx; acc[1] += ny; acc[2] += nz;
      eAcc.set(k, acc);
    }
  }

  const edge = new Float32Array(N * 9);
  const vertex = new Float32Array(N * 9);
  for (let t = 0; t < N; t++) {
    const w = [weldedOf[t * 3], weldedOf[t * 3 + 1], weldedOf[t * 3 + 2]];
    // edges in order AB(0), BC(1), CA(2)
    const epairs = [[w[0], w[1]], [w[1], w[2]], [w[2], w[0]]] as const;
    for (let e = 0; e < 3; e++) {
      const acc = eAcc.get(ek(epairs[e][0], epairs[e][1]))!;
      const [x, y, z] = norm3(acc[0], acc[1], acc[2]);
      edge[t * 9 + e * 3] = x; edge[t * 9 + e * 3 + 1] = y; edge[t * 9 + e * 3 + 2] = z;
    }
    // vertices in order A(0), B(1), C(2)
    for (let lv = 0; lv < 3; lv++) {
      const acc = vAcc.get(w[lv])!;
      const [x, y, z] = norm3(acc[0], acc[1], acc[2]);
      vertex[t * 9 + lv * 3] = x; vertex[t * 9 + lv * 3 + 1] = y; vertex[t * 9 + lv * 3 + 2] = z;
    }
  }
  return { edge, vertex };
}
```

- [ ] **Step 8: Run — verify both tests pass**

Run: `npx vitest run src/utils/cloth/__tests__/bodyPseudonormals.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 9: Commit**

```bash
git add src/utils/cloth/bodyPseudonormals.ts src/utils/cloth/__tests__/bodyPseudonormals.test.ts
git commit -m "feat(collision): angle-weighted body pseudonormal builder (Baerentzen-Aanaes)"
```

---

### Task 3: Use the closest-feature pseudonormal in the CPU collision side test

**Files:**
- Modify: `src/utils/cloth/triangleCollision.ts` (the closest-point/side function,
  currently returning `{ dist, side, nx, ny, nz }`; inside case `side = dot` at
  line ~55, edge case `side = (p-cp)·faceNormal` at line ~91).
- Test: `src/utils/cloth/__tests__/triangleCollision.test.ts`

**Interfaces:**
- Consumes: `buildBodyPseudonormals` output (Task 2). The collision caller already
  iterates candidate triangles by index `t`; thread the per-triangle pseudonormals
  in so the side test can pick the closest-feature pseudonormal.
- Produces: the same `{ dist, side, ... }` shape, but `side` now uses the
  closest-feature pseudonormal. The PUSH direction stays the face normal (the spec
  changes only the inside/outside SIGN, not the push axis — pushing along the face
  normal is unchanged behavior, and the sign decides whether to push).

- [ ] **Step 1: Write the failing test (concave wedge sign)**

Place a point in the concave wedge interior (x>0, z>0) that is genuinely OUTSIDE
both walls. The old face-normal edge-side misclassifies it as inside for one wall
(`side<0`); the pseudonormal (edge BC = normalize(n0+n1)) classifies it correctly.

```ts
// src/utils/cloth/__tests__/triangleCollision.test.ts (add)
import { describe, it, expect } from 'vitest';
import { closestPointAndSide } from '../triangleCollision'; // exact exported name TBD-by-reading
import { buildBodyPseudonormals } from '../bodyPseudonormals';

it('concave wedge: pseudonormal gives the correct outside sign where the face normal lies', () => {
  // same valley as Task 2; point at (0.5, 0.5, 0.5): nearest feature is the shared
  // edge B(0,0,0)-C(0,1,0); it is OUTSIDE the body (the wedge opens toward +x,+z).
  const mesh = { /* makeConcaveValley() — copy the fixture */ } as any;
  const pn = buildBodyPseudonormals(mesh, 1e-6);
  // Old behavior (face normal of tri0 = (0,0,-1)): (p - cpOnBC)·(0,0,-1) = -0.5 → side<0 → WRONG (judged inside).
  // New behavior (edge pseudonormal (-1,0,-1)/√2): (p-cp)·pn ≈ +... → side>0 → correct (outside).
  const r = closestPointAndSide(/* px,py,pz */ 0.5, 0.5, 0.5, /* tri0 verts + */ mesh, /* t */ 0, pn);
  expect(r.side).toBeGreaterThan(0); // correctly OUTSIDE
});
```

- [ ] **Step 2: Run — verify it fails** (current signature has no pseudonormal arg / side<0).

- [ ] **Step 3: Read the exact current signature + edit the side derivation**

Read `src/utils/cloth/triangleCollision.ts` lines 12–93. The function returns
`{ dist, side, nx, ny, nz }`. Add two optional params: the per-triangle
pseudonormals and the triangle index `t`. When present:
- inside case (u,v inside): keep `side = dot` (face normal IS the pseudonormal there).
- edge case: after picking the closest edge AB/BC/CA, set `side = (p - cp) ·
  edgePseudonormal[that edge]` instead of `(p - cp) · faceNormal`. Determine
  whether the clamped point is at an endpoint (t≈0 or t≈1) → use the VERTEX
  pseudonormal of that endpoint; else the EDGE pseudonormal. Edge index mapping:
  AB→0, plus map the closest-edge branch (AB/AC/BC in the current code) to the
  builder's edge order (AB=0, BC=1, CA=2). Keep `nx,ny,nz` = face normal (push axis
  unchanged). When the pseudonormals are absent (legacy callers / non-avatar
  bodies), fall back to the current face-normal behavior — so this is additive.

(Complete the edit against the exact lines; the logic above is the contract. Note
the current code's third edge is "AC" not "CA" — preserve its closest-point math,
only swap which normal feeds `side`.)

- [ ] **Step 4: Run — verify the concave test passes AND existing tests still pass**

Run: `npx vitest run src/utils/cloth/__tests__/triangleCollision.test.ts`
Expected: PASS, including all pre-existing triangleCollision tests (the face-normal
fallback preserves them; only the avatar path with pseudonormals changes).

- [ ] **Step 5: Run the full gate**

Run: `npx tsc -b --noEmit && npm run test`
Expected: clean typecheck, all tests green.

- [ ] **Step 6: Commit**

```bash
git add src/utils/cloth/triangleCollision.ts src/utils/cloth/__tests__/triangleCollision.test.ts
git commit -m "feat(collision): derive inside/outside sign from closest-feature pseudonormal (CPU)"
```

---

## Self-Review

**Spec coverage (Plan 1 scope):** A3 weldability spike → Task 1. A2 weld +
adjacency + angle-weighted pseudonormals → Task 2. A1 sign fix (CPU reference) →
Task 3. (A1 GPU `tslCollision.ts`, A4 seam floor, A5 WASM + parity, the coverage
metric, and @gpu-local validation are **Plan 2**, explicitly out of this plan.)

**Placeholders:** Task 1's script has one `TODO(implementer)` for the avatar-mesh
load harness — this is genuinely environment-dependent (jsdom/three under Node)
and is the implementer's call; the measurement contract is fully specified. Task 3
Step 3 specifies the contract + the exact lines to edit rather than re-pasting the
whole 80-line function; the implementer reads the exact code (called out by line).

**Type consistency:** `BodyPseudonormals { edge, vertex }` is produced in Task 2
and consumed in Task 3. Edge order (AB,BC,CA) and vertex order (A,B,C) are fixed in
Task 2 and referenced in Task 3. `weldAndCountManifold` / `buildBodyPseudonormals`
names match between the spike, the builder, and the collision test.

**Next:** after this core is green, write Plan 2 (GPU port of the same
closest-feature-pseudonormal logic into `tslCollision.ts:579-635`, upload the
pseudonormal StorageBuffers reordered to BVH leaf order at body-rebuild, the WASM
Rust mirror + parity-oracle, the seam residual-restLength floor across
`seamAssembly.ts` + `tslSolver.ts`, the first-class coverage/occlusion metric, and
@gpu-local validation + residual face-poke measurement).
