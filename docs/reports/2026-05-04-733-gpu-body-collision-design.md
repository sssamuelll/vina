# #733 — GPU TSL Body Collision: Design Doc (Phase 1)

**Date**: 2026-05-04
**Branch**: `feat/733-gpu-body-collision` (off `e65e0253`, post-#732 merge)
**Issue**: #733 — WebGPU GPU tier: body collision data not wired (cloth falls through avatar)
**Phase**: 1 — Reconnaissance + design
**Author**: developer agent (Claude Opus 4.7)

---

## TL;DR — Re-scoping the issue

The issue body and kickoff brief frame #733 as **"GPU tier never receives body collision data"** and anticipate **a new TSL collision kernel + spatial hash adaptation + API plumbing (1–2 weeks)**.

The Phase 1 audit reveals a different reality:

| Component | Anticipated state | Actual state |
|---|---|---|
| TSL collision kernel | Missing | **Exists** (`tslCollision.ts`, BVH-based, ~280 LOC) |
| API setter on `GpuSolverClient` | Missing | **Exists** (`setCollisionMesh` → `setTslCollisionBody`, lines 619–711) |
| Wire-up in `useSimulationLifecycle` | Not called for GPU | **Called** (`loadCollision(gpuClient, …)` at line 376) |
| Substep dispatch | Missing | **Dispatches** (`GarmentSimulation.tsx:426–428` iterates `solver.collisionBodies`) |
| `bodyCollision` capability flag | Add to enum | **Field doesn't exist on the `SolverCapabilities` interface yet** |

**The pipeline is wired end-to-end. The bug is in the kernel logic — specifically two semantic gaps versus the CPU reference (`triangleCollision.ts`):**

1. **Margin-gated triangle iteration.** `tslCollision.ts:176` only enters the projection/barycentric block IF `absDot < uMargin` (default 5 mm). For particles deeper than `margin` from any single triangle plane (e.g., particle inside a 10 cm-thick torso, ~5 cm from the chest face plane), zero triangles qualify and `collided` stays `0`. CPU reference iterates *all* nearby triangles unconditionally, tracks `bestSide` (signed distance) independently, and pushes whenever `bestSide < 0 || minDist < margin`.
2. **No edge/vertex projection fallback.** `tslCollision.ts:202–219` only updates `bestDist` when the particle's plane projection lies *inside* the triangle (barycentric `u≥0 && v≥0 && u+v≤1`). CPU's `pointToTriangleDist` has an explicit fallback for outside-projection cases (lines 58–92): closest-point on each of the three edges with parameter clamp `[0,1]`. Without this, particles near triangle edges or vertices are missed.

The "cloth falls to floor" e2e symptom is consistent with the deep-penetration miss: as a cloth particle passes through the avatar's torso during gravity integration, no triangle within 5 mm of its plane is ever found, and gravity continues unopposed all the way to `groundY = 0`.

**Revised scope estimate**: ~3–5 days (kernel patch + capability flag + tests + e2e), not 1–2 weeks.

---

## 1. Audit findings

### 1.1 The full pipeline (verified)

```
GarmentSimulation.useFrame
  └─ for s in [0..substeps):
       preSolve → wind → stretchColors → bend → seam
       └─ for body in solver.collisionBodies:    [GarmentSimulation.tsx:426-428]
            renderer.compute(body.collisionNode)  [tslCollision.ts:269]
       groundClamp → grab → postSolve

GpuSolverClient.setCollisionMesh(mesh)            [gpuSolverClient.ts:623]
  └─ setTslCollisionBody('__avatar__', mesh)      [line 662]
       ├─ buildLinearBVH(mesh)                    [bvh.ts:56]
       ├─ create SBAs (bvhNodes, triVerts, triNormals)
       ├─ createTslCollisionBody(...) → TslCollisionBody  [tslCollision.ts:71]
       └─ tslSolver.setCollisionBody(body)        [tslSolver.ts:624]

useSimulationLifecycle.startSim
  └─ await gpuClient.initMultiPieceTsl(...)
  └─ await loadCollision(gpuClient, avatarUrl, h, bodies, …)  [line 376]
       └─ extractAvatarCollisionMesh → client.setCollisionMesh
```

### 1.2 The bug (`tslCollision.ts:175–220`)

```ts
// Current (margin-gated)
If(absDot.lessThan(uMargin), () => {                    // ← only enters if within 5mm
  // project + barycentric
  If(insideTriangle, () => {
    If(absDot.lessThan(bestDist), () => {                // ← tracks closest within margin
      bestDist.assign(absDot);
      bestSide.assign(dot);
      collided.assign(int(1));
    });
  });
});
```

CPU reference (`triangleCollision.ts:265–306`):

```ts
// Iterate ALL nearby triangles (from spatial hash)
let minDist = Infinity, bestSide = 1;
for (const triIdx of nearby) {
  const r = pointToTriangleDist(...);    // edge/vertex projection inside
  if (r.dist < minDist) { minDist = r.dist; bestSide = r.side; ... }
}
// Push if PENETRATING (bestSide < 0) OR within margin (minDist < margin)
if (bestSide < 0 || minDist < margin) {
  const pushDist = bestSide < 0
    ? margin + minDist                   // deep penetration: push out by depth+margin
    : margin - minDist;                  // close: push to margin distance
  ...
}
```

The TSL kernel cannot recover from `absDot >= margin` because it never projects/computes for those cases. The push branch (`tslCollision.ts:230–265`) is then never taken.

### 1.3 BVH AABB test correctness

The leaf AABB test (lines 132–138) `(particle ± margin) overlap leaf AABB` is **not** the bug — it correctly accepts any leaf whose AABB overlaps the particle ± margin AABB, including the case where the particle is *inside* the leaf AABB (which always passes). The issue is exclusively at the per-triangle stage.

### 1.4 Capability surface gap

`SolverCapabilities` interface (`solverCapabilities.ts:23–72`) has fields for `selfCollision`, `lra`, `pressure`, `fold`, `pieceStiffness`, `frameDriven`, `tools` — but **no `bodyCollision`**. Body collision is currently treated as universal (CPU + WASM + GPU all have body collision plumbing without a capability gate). Adding `bodyCollision: boolean` is appropriate to declare the feature as ratified per-tier and to set a precedent before similar gaps emerge for other "assumed universal" features.

### 1.5 Other tiers — body collision as canonical

| Tier | Body collision impl | Capability today |
|---|---|---|
| CPU TS (`clothWorker.ts:388`) | `solver.setCollisionMesh(mesh)` → JS spatial hash + push | implicit `true` |
| WASM Rust (`wasmSolverWorker.ts:36`, `285–289`, `624–671`) | JS-side `TriangleSpatialHash` + `solveTriangleCollision` (CPU↔WASM share `triangleCollision.ts` per A4 § 2.4) | implicit `true` |
| GPU TSL (`tslCollision.ts`, `gpuSolverClient.ts:623`) | BVH + per-particle linear scan + per-triangle plane test (BUGGY — see 1.2) | implicit `true`, kernel broken |
| GPU WGSL (legacy non-TSL path, `gpuSolverClient.ts:629`) | Falls through to `solver.setCollisionMesh` (WGSL kernel) | unused (TSL is canonical post-A6) |
| Neural | None (architectural exclusion per C4 RFC § 2.3) | implicit `false` |

A4 § 2.4 ratifies `TriangleSpatialHash` as the **shared CPU+WASM** convention. A4 is scoped to Rust↔TS; **GPU is free to use a different acceleration structure** (BVH is a defensible GPU-tier choice).

---

## 2. Sub-decisions

Following the audit ratification methodology: each sub-decision has options, tradeoffs, and a recommendation.

### D1. Algorithm — patch BVH kernel vs port `TriangleSpatialHash` to GPU

| Option | Pros | Cons | Effort |
|---|---|---|---|
| **A. Patch existing BVH kernel** (recommended) | Smallest change. BVH is GPU-native (cache-friendly traversal, no atomics for hash build). Existing `tslCollision.ts` + `bvh.ts` are correct; only the per-triangle stage needs fixing. Per-body BVH built once on CPU, uploaded; rebuilt only on body mesh change. | Algorithm divergence from CPU/WASM (can't share `solveTriangleCollision` test fixtures bit-exactly). Test parity must be **functional** (silhouette match within tolerance), not bit-exact. | ~2–3 days |
| B. TSL `TriangleSpatialHash` port | Bit-exact parity with CPU/WASM (testable per #608 precedent). Simpler kernel logic. | Requires GPU-side counting-sort (3 passes: hashCount + prefixSum + scatter) per body init — significant new TSL code. Each kinematic body gets its own hash table. Doesn't compose well with multi-body case (5+ collision bodies = 5+ hash tables). Atomics on hashCount have known #554 typing friction. | ~5–7 days |

**Recommendation: A (patch BVH).** Justification:
- A4 § 2.4 scope is Rust↔TS, not GPU. GPU is free to diverge.
- BVH is already built, uploaded, and traversed correctly. Only the per-triangle math is wrong.
- Multi-body case (avatar torso + arms + legs as separate bodies, or avatar + custom collision props) scales cleanly with BVH (one BVH per body, dispatched in a loop).
- Can be ratified as the **GPU-tier body collision convention** in the same RFC, parallel to A4's CPU+WASM `TriangleSpatialHash` ratification.

### D2. Detection logic — match CPU's `bestSide < 0 || minDist < margin` semantics

**Recommendation: yes.**

Current TSL: only pushes if `absDot < margin`.
Target TSL: track `bestDist` and `bestSide` for *all* iterated triangles in candidate leaves, then push if `bestSide < 0 || bestDist < margin`. Matches CPU `triangleCollision.ts:299`.

**Loop restructure**:
```ts
// New — track best regardless of margin
const bestDist = float(1e10).toVar('bestDist');
const bestSide = float(1).toVar('bestSide');
const bestNx = float(0).toVar('bestNx');
// ... bestNy, bestNz ...

Loop(numNodes, ({ i: nodeIdx }) => {
  // ... AABB test (unchanged) ...
  Loop(triCount, ({ i: ti }) => {
    // Compute point-to-triangle distance (with edge/vertex fallback per D3)
    // Update bestDist/bestSide if closer
    If(triDist.lessThan(bestDist), () => {
      bestDist.assign(triDist);
      bestSide.assign(triSignedDist);
      // ... copy normal ...
    });
  });
});

// Push decision (matches CPU)
If(bestSide.lessThan(float(0)).or(bestDist.lessThan(uMargin)), () => {
  // pushDist = bestSide < 0 ? margin + bestDist : margin - bestDist
  const pushDist = ...
  // Apply push + friction
});
```

Note: TSL doesn't have ternary `?:`; use `If/Else` or arithmetic equivalent (`max(0, sign(-bestSide))*…`).

### D3. Edge/vertex projection fallback — match CPU `pointToTriangleDist:58–92`

**Recommendation: yes, port.**

CPU's `pointToTriangleDist` returns `{dist, side, nx, ny, nz}` for *every* point-triangle query, including when the projection lies outside the triangle. The fallback computes the closest point on each of the three edges (parameter clamp `t ∈ [0,1]`), tracks the minimum, and returns the `dist` to that closest edge point + `edgeSide = (p-cp)·n` for the side determination.

**TSL port complexity**: ~50 LOC in TSL Fn. The math is straightforward (no atomics). Each edge projection is a 3-vector dot+scale; pick min via `If(dsq < minDsq, …)`.

Without this fallback, particles brushing a triangle edge fall through (the projection misses inside the triangle, current TSL kernel bails, no push).

### D4. Capability flag — add `bodyCollision: boolean` to `SolverCapabilities`

**Recommendation: yes, add.**

```ts
export interface SolverCapabilities {
  selfCollision: boolean;
  bodyCollision: boolean;  // NEW
  lra: boolean;
  pressure: boolean;
  fold: boolean;
  pieceStiffness: boolean;
  frameDriven?: boolean;
  tools?: { steamBrush: boolean; meshGrab: boolean };
}
```

Per-tier values:
- `CPU_CAPABILITIES.bodyCollision: true` (always was, just declared).
- `WASM_CAPABILITIES.bodyCollision: true` (always was, just declared).
- `GPU_CAPABILITIES.bodyCollision: false → true` post-fix.
- `NEURAL_CAPABILITIES.bodyCollision: false` (architectural exclusion).

JSDoc cites #733 and verified-in-three@0.183.2 per the #554 convention.

### D5. API surface — keep `setCollisionMesh` setter pattern

**Recommendation: keep existing.**

The current `gpuClient.setCollisionMesh(mesh)` + `gpuClient.updateCollisionBody(data)` setter shape is symmetric with `wasmClient.setCollisionMesh` and `cpuClient.setCollisionMesh`. Bundling collision data into `initMultiPieceTsl` would diverge from the CPU/WASM convention without benefit (collision can change post-init when avatar pose updates, so a setter is required regardless).

The existing `loadCollision(client, …)` helper in `useSimulationLifecycle.ts:174–244` already abstracts the per-tier symmetry. No API changes needed.

### D6. BVH per body vs shared

**Recommendation: keep per-body.**

Each `TslCollisionBody` registers a separate BVH (built from that body's collision mesh). The dispatch loop (`GarmentSimulation.tsx:426–428`) iterates over all registered bodies. This matches CPU's per-body iteration in `wasmSolverWorker.ts:285–289` (loop over `for (const body of currentCollisionBodies)`).

Multi-body composition is already supported. No change.

### D7. NaN guards + max push clamp

**Recommendation: keep current `MAX_PUSH_DIST = 0.05`** (matches CPU `triangleCollision.ts:252`).

Both kernels clamp single-correction displacement to 5 cm to prevent NaN cascade from extreme penetrations. The current TSL kernel applies this clamp at line 235 (`pushDist.min(MAX_PUSH_DIST)`). After D2 restructure, the same clamp applies in the new push branch.

### D8. Friction

**Recommendation: keep current implementation** (lines 244–262). Position-based friction subtracts the tangential displacement scaled by friction coefficient. Matches CPU `triangleCollision.ts:312–322`.

After D2 restructure, the friction block moves into the new "push if penetrating or close" branch (no behavioral change).

---

## 3. Risk surface

1. **TSL Loop with mutable state vs WGSL atomics.** The fix uses TSL `toVar()` mutable variables (no atomics needed — each particle's loop is independent). Verify generated WGSL declares these as scalar `var<function>` (per-thread), not `var<storage>` (shared across threads). `tslSelfCollision.ts` precedent uses `toVar()` for scalar state inside a thread; should compile identically here. **Risk: low.**
2. **Edge/vertex projection precision.** TSL `float` is f32; CPU `Math` is f64. CPU and TSL kernels can diverge by ~1e-7 on edge cases. Bit-exact parity is **not** a target (different tiers, different acceleration structures). Functional parity (silhouette match within ~5 cm) is the e2e test target. **Risk: low.**
3. **Multi-body BVH aggregate cost.** Avatar today has 1 collision mesh (`__avatar__`) + N custom collision bodies. With N=5+ bodies, the dispatch is 5+ separate compute passes per substep. At 18k particles × 10 substeps × 60 fps, that's 5400 dispatches/sec. Current TSL self-collision works at this scale; body collision is simpler (no atomics). **Risk: low**, monitor in Phase 3 perf check.
4. **TSL `If/Else` chain depth.** The push computation has an `If(bestSide < 0)` branch. TSL nested `If/Else` compiles to WGSL `if/else if`. Modern GPU drivers handle ~10 levels fine. The proposed kernel uses ~4 levels max. **Risk: very low.**
5. **`@types/three` TSL surface stability.** Per #554 precedent, several TSL methods need `as any` casts (e.g., `(u as any).greaterThanEqual`). The current kernel already uses these casts; no new cast surface introduced. **Risk: none.**
6. **BVH leaf AABB tightness post-fix.** With margin-only filter removed, the per-leaf inner loop iterates all triangles in any AABB-overlapping leaf. Current `maxLeafSize = 4` (`bvh.ts:101`) keeps this small. Pre-fix particles near surface only iterated ~1 leaf; post-fix particles inside body might iterate ~2–4 leaves with ~16 triangles total. **Negligible cost increase. Risk: very low.**
7. **Capability flag rollout coordination.** Adding `bodyCollision` to `SolverCapabilities` is a non-breaking additive change. All tier capability constants need the flag set (CPU/WASM/GPU `true`, Neural `false`). Test fixtures using `Object.freeze`d constants need updating. **Risk: low**, mechanical change.

---

## 4. Phase 2 implementation plan

### 4.1 Commits (proposed order)

| # | Commit | Files | Notes |
|---|---|---|---|
| 1 | `feat(gpu): add bodyCollision capability flag (#733)` | `solverCapabilities.ts`, capability frozen-shape tests in `__tests__/solverCapabilities.test.ts` (if exists) | CPU/WASM `true` declarative-only; GPU `false` until kernel fix; Neural `false` permanent. |
| 2 | `fix(gpu): TSL body collision penetration detection (#733)` | `tslCollision.ts` | D2 + D3 refactor: track best regardless of margin, port edge/vertex projection. |
| 3 | `feat(gpu): flip GPU bodyCollision capability to true (#733)` | `solverCapabilities.ts` | Post-fix flip. |
| 4 | `test(gpu): TSL collision kernel deep-penetration + edge cases (#733)` | `src/utils/cloth/gpu/__tests__/tslCollision.test.ts` (new) | Cover deep penetration (5 cm into body), edge projection, vertex projection, NaN clamp, friction. |

### 4.2 New tests

- `tslCollision.test.ts` — TSL Fn construction sanity (verify Fn returns ComputeNode without throwing); buffer shape validation. Cannot easily test runtime kernel output without a WebGPU device in unit tests; runtime verification deferred to Phase 3 e2e.
- Capability frozen-shape test: extend existing if present to assert `bodyCollision` field exists.

### 4.3 Phase 3 e2e plan

1. `npm run dev` + `localStorage['openclo-use-webgpu'] = 'true'` + reload.
2. Click Dress → T-Shirt template. Wait for placement + sim.
3. Visual verify: cloth drapes on torso (NOT y≈0). Bbox y range realistic (~0.5–1.5 m for T-pose torso).
4. Compare with WASM tier (`solverTier: 'wasm'` via Redux dev tools): silhouettes match within ~5 cm bulk position tolerance.
5. Console: 0 WGSL/WebGPU errors. `[GpuSolverClient] TSL collision body '__avatar__': { bvhNodes, triangles, margin, friction }` logs at startup.
6. Perf check: ≥30 fps on typical 5-piece garment (18k particles + 2k-tri avatar mesh).

### 4.4 Out-of-scope (notify Sam, defer to follow-up issues)

- **GPU self-collision wire-up** (`GPU_CAPABILITIES.selfCollision: false` despite scaffolded kernels per `solverCapabilities.ts:115–125`). Same shape as #733 (kernel exists, dispatch missing) but separate concern. Should get its own follow-up issue if not already tracked.
- **`TriangleSpatialHash` GPU port** (not chosen here; kept as future option if BVH proves insufficient at scale).
- **A4 ratification extension to GPU**: A4 is scoped Rust↔TS; an "A4-bis" or new eje could ratify GPU's BVH choice as the canonical GPU body collision acceleration structure. Could be folded into this RFC's closure or deferred to a separate eje. **Recommend folding into #733 RFC closure** if Sam approves — the GPU-tier convention is a natural sub-decision of this work.

---

## 5. References

- `src/utils/cloth/triangleCollision.ts` — CPU/WASM body collision impl (reference algorithm)
- `src/utils/cloth/gpu/tslCollision.ts` — current TSL kernel (the bug)
- `src/utils/cloth/gpu/bvh.ts` — BVH linearizer (correct, no changes needed)
- `src/utils/cloth/gpu/gpuSolverClient.ts:619–711` — `setCollisionMesh` + `setTslCollisionBody` API
- `src/utils/cloth/gpu/tslSolver.ts:622–635, 745–747` — `collisionBodies` + setters
- `src/components/Viewport3D/GarmentSimulation.tsx:426–428` — substep dispatch (correct)
- `src/components/Viewport3D/useSimulationLifecycle.ts:174–244, 376` — `loadCollision` helper + GPU client wire-up
- `src/utils/cloth/solverCapabilities.ts:115–125` — `GPU_CAPABILITIES` (where `bodyCollision` will land)
- `src/utils/cloth/solverProtocol.ts:107–162` — `ClothSolverClient` interface (no changes needed)
- A4 RFC — `docs/reports/2026-05-02-drift-fase2-a4-cross-language-geometry-mesh.md` § 2.4 (TriangleSpatialHash CPU+WASM convention)
- A6 RFC — `docs/reports/2026-05-01-rfc-a6-worker-protocol.md` § 3.1 (per-tier setter divergence ratified)
- A7 RFC — `docs/reports/2026-05-01-rfc-a7-wasm-cpu-equivalence.md` § 3.6 (capability flag rollout pattern)
- C4 RFC — `docs/reports/2026-05-02-drift-fase2-c4-4way-tier-orchestration.md` § 3.1.A (capability flag precedent for `tools`)
- #554 — atomicAdd workaround pattern (`b2c63c8e`)
- #608 — WASM self-collision port (cross-tier port precedent)
- #732 — seamPairs conversion helper (`a4169572`, recent precedent for GPU-tier wiring)

---

## 6. Open questions for reviewer

1. **Ratify GPU BVH as the canonical GPU body collision acceleration structure?** Either (a) fold into #733 RFC closure as a GPU-tier sub-decision, or (b) defer to a separate "A4-bis" eje. Recommend (a) for closure efficiency.
2. **Capability flag default at landing.** D4 proposes `GPU_CAPABILITIES.bodyCollision: false` until commit 3 (post-fix flip). Alternative: ship the flag and the fix together (single commit). Either pattern works; the staged approach allows reviewer signoff between flag introduction and feature flip, mirroring #554.
3. **Test depth for the kernel patch.** Unit tests can validate the TSL `Fn()` constructs without runtime errors (similar to existing `tslSelfCollision.test.ts` patterns). Full kernel correctness requires GPU runtime — covered by Phase 3 e2e. OK to ship Phase 2 with construction-only unit tests + e2e dependency? Or invest in a `webgpu-headless` runtime test path?
4. **Edge/vertex projection — port full CPU `pointToTriangleDist` math** or **simplified version** that skips the vertex-only fallback (lines 87–88 of triangleCollision.ts handle the BC edge as the third candidate)? CPU fallback handles all 3 edges; recommend porting the full 3-edge fallback for behavioral parity.

---

**Phase 1 complete. Awaiting reviewer signoff before Phase 2 implementation.**
