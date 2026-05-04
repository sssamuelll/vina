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

---

## 7. Phase 2 + 3 update (2026-05-04 — post-execution)

Reviewer Phase 1 signoff received with all 8 sub-decisions ratified and 4 open questions answered. Phase 2 was executed in three commits on `feat/733-gpu-body-collision`:

| Commit | SHA | Status |
|---|---|---|
| `feat(gpu): add bodyCollision capability flag (#733)` | `c91ba524` | ✅ landed (CPU/WASM `true` declarative, GPU `false` until kernel fix, Neural `false` permanent) |
| `fix(gpu): TSL body collision penetration detection (#733)` | `dbae5404` | ⚠️ **algorithm correct, runtime e2e failing — see § 7.3** |
| `feat(gpu): flip GPU bodyCollision to true (#733)` | not committed | held — depends on e2e |
| `test(gpu): TSL collision kernel tests (#733)` | not committed | held — depends on e2e |

### 7.1 What works (verified)

- **Capability flag intro lands cleanly.** All 4819 unit tests pass; lint clean; tsc clean. Pre-commit gates pass.
- **Kernel structure compiles and dispatches.** Verified via Playwright e2e: WebGPU canvas active (`data-engine="three.js r183 webgpu"`), TSL solver initialized (`[GpuSolverClient] TSL solver initialized: { particles: 17963, stretchColors: 50, … }`), collision body registered (`TSL collision body '__avatar__': { bvhNodes: 11955, triangles: 18220, margin: 0.005, friction: 0.3 }`).
- **Kernel runs per substep.** Diagnostic test: adding an unconditional `posBuf.element(i).y.addAssign(float(0.0001))` inside the kernel's `If(w.greaterThan(0))` lifts cloth from y=0 to y=[0.87, 1.52] — kernel is dispatched, writes propagate to position buffer, readback is current.
- **`found` mechanism works for ~32% of particles.** Diagnostic test: `If(found.equal(int(1)), () => addAssign(0.001))` results in distribution `{below 0.1m: 12289, 0.5–1.0m: 1936, 1.0–1.5m: 3203}`. The 32% lifted are particles whose AABB ± margin overlapped a body BVH leaf — found-tracking propagates from deeply-nested If into outer-scope toVar correctly.
- **Hardcoded normal works.** Diagnostic test: hardcoding `bestNx.assign(float(0)); bestNy.assign(float(1)); bestNz.assign(float(0))` (normal = +Y) lifts 60% to body level. So when bestN is non-zero in the apply phase, the push direction + magnitude logic operates as designed.

### 7.2 What didn't work (the new finding)

**Storage-read normal values do not propagate from a deeply-nested `If` into outer-scope toVar variables.** The CPU reference algorithm requires: for each candidate triangle, read its normal (`triNormBuf.element(triIdx*3 + {0,1,2})`), and if that triangle becomes the new closest, capture its normal into `bestNx/Ny/Nz` for use in the apply phase.

The TSL pattern:
```ts
// Outer scope
const bestNx = float(0).toVar('bestNx');

// Deep nested If (BVH Loop → leaf If → triangle Loop → update-best If)
const nnx = triNormBuf.element(tnBase);  // storage read
If(triValid.equal(int(1)).and(triDist.lessThan(bestDist)), () => {
  bestNx.assign(nnx);  // ← assignment doesn't take effect
});

// Apply phase
posBuf.element(i).x.addAssign(bestNx.mul(pushDist));  // ← bestNx reads as 0
```

Verified by inverse: `bestNx.assign(float(0))` + `bestNy.assign(float(1))` (compile-time literals) **does** propagate. So the bug is specific to the case "outer-toVar.assign(storage-read)" inside a deeply-nested If, OR "outer-toVar.assign(loop-local-var-derived-from-storage-read)".

**Workaround attempted (failed)**: store the best triangle *index* (`bestTriIdx = uint(0).toVar('bestTriIdx')`), then re-read the normal at apply time using the stored index. This produced the same e2e symptom (cloth at floor). Suggests the propagation issue is **not specific to storage reads on the RHS** — it may extend to loop-derived expressions involving other storage reads (`triIdx` is computed from `triStart = bvhBuf.element(...)` plus the loop counter `ti`).

**Phase 3 e2e bbox**: cloth y=[0, 0.007] vs WASM tier baseline y=[0.66, 1.28]. WASM-on-floor is the same failure mode as the original #733 issue body.

### 7.3 What I did NOT verify

- Whether the dispatched GPU kernel actually computes `triValid` and `triDist` correctly per-triangle (no GPU debug surface available; only outputs are positions).
- Whether the issue is specifically `bestNx.assign(loopLocalVar)` propagation, or whether the loop-local computations themselves are evaluating to zero. I did not isolate this further.
- Whether porting CPU's `solveTriangleCollision` semantically vs reproducing it via per-triangle expressions is the right structure for TSL — the existing `tslSelfCollision.ts` uses a 5-pass atomic-accumulation approach, which sidesteps the toVar-from-storage-read issue entirely.

### 7.4 Recommendation

The kernel's algorithmic fix (D2 + D3 from the original design) **is correct** by inspection vs the CPU reference. But the TSL execution model has a subtlety that prevents the straightforward port from running as designed. Two paths forward:

**A. Investigate the toVar/storage-read interaction in TSL.** Possible follow-up:
- Test minimum repro: outer-toVar `bestNx`, single-Loop with single-triangle `nnx = ...storage`, verify if `bestNx.assign(nnx)` propagates.
- Inspect the generated WGSL via Three.js debug hooks (`renderer.compile()` returns shader source).
- Cross-check with `tslSelfCollision.ts` — does it have outer-toVars assigned from storage reads?

**B. Restructure the kernel to avoid outer-scope toVar tracking entirely.** Option B.1: apply push per-triangle inside the inner Loop (no best-tracking; multiple pushes accumulate). Option B.2: 2-pass kernel (pass 1: per-particle find best, write to a per-particle scratch buffer; pass 2: apply push using scratch buffer). Option B.3: emulate `tslSelfCollision.ts`'s 5-pass atomic approach (counting-sort hash + atomic accumulation), which inverts the storage-read issue (storage reads only feed atomicAdd, not toVar assignment).

The reviewer's Q3 answer ("construction-only + e2e, no webgpu-headless runtime tests") is correct in retrospect — the issue surfaced is precisely the kind that unit tests can't catch without GPU runtime. Investing in webgpu-headless infra (deferred to #742) would significantly accelerate diagnosis of issues like this one.

### 7.5 State at pause

- Branch `feat/733-gpu-body-collision` HEAD: `dbae5404` (commits 1 + 2).
- Capability flag at `false` (correct — kernel doesn't pass e2e).
- Kernel algorithm correct on paper, runtime not yet draping cloth on torso.
- All my Phase 3 debug edits reverted; tslCollision.ts is back to commit 2 state.
- Gates: tsc clean, 4819 unit tests pass, lint clean, pre-commit OK.

**Awaiting reviewer guidance.** Recommend: (1) approve a follow-up Phase 2.5 to investigate Path A (TSL toVar/storage-read minimum repro + WGSL inspection); (2) if Path A reveals a fundamental TSL limitation, switch to Path B (kernel restructure). Either path keeps the design doc's D1–D8 ratifications intact.

---

## 8. Phase 2.5 + 2.6 update (2026-05-04 — second attempt, time-boxed)

Reviewer approved Path A reconnaissance with 4h time-box → fall to B.2 if inconclusive. Outcome: **both Path A and B.2 came up empty within the time-box.** All Phase 2.5/2.6 working-tree edits reverted; branch HEAD stays at `951cd4ac` (Phase 2 + 3 doc commit).

### 8.1 Path A — TSL execution-model reconnaissance (~1h actual)

- **Archeology**: tslSelfCollision.ts origin commit (`75e6f44a`) message says: *"5-node pipeline ... Uses atomic i32 accumulation (scale 1e6) matching the WGSL approach."* The atomic design was chosen to match the existing WGSL self-collision implementation, not because of an explicit `toVar` failure observation. tslGrab.ts uses storage-buffer writes inside `If`/`Loop` (e.g. `grabMaskBufNode.element(i).assign(mask)`), confirming **storage-buffer writes from inside nested Ifs DO propagate**. tslBrush, tslWind similar. **No precedent for outer-scope toVar tracking with storage-read RHS** in the existing codebase.
- **WGSL inspection attempt**: inspecting WGSL via `device.createShaderModule` interception requires patching `navigator.gpu.requestAdapter` BEFORE the page-load module graph executes. Playwright MCP doesn't expose `addInitScript`, and post-load patches missed the GPU device construction window. Did not achieve readable WGSL.
- **Result**: Path A inconclusive within ~1h. Fell to Path B.2 per the time-box rule.

### 8.2 Path B.2 — 2-pass kernel via scratch storage buffers (~2h actual)

Implemented per the reviewer's plan: split `createTslCollisionBody` into `findBestNode` + `applyPushNode`, with 6 per-particle scratch SBAs (`bestDistSBA`, `bestSideSBA`, `bestNxSBA`, `bestNySBA`, `bestNzSBA`, `foundSBA`). Pass 1 walks BVH+triangles, writes best to scratch. Pass 2 reads scratch, applies push.

Updated `gpuSolverClient.setTslCollisionBody`, `tslSolver` collision-body interface (`findBestNode` + `applyPushNode` instead of single `collisionNode`), `GarmentSimulation.useFrame` substep dispatch (compute both nodes). Updated `tslSolver.test.ts` mock helper (`makeMockBody`) to match new shape. **162 GPU unit tests pass; tsc + lint clean.**

**Phase 3 e2e**: cloth at floor (y=[0, 0.007]) — same failure mode as the single-pass kernel. Console showed **197 WebGPU validation warnings**: `[Invalid ComputePipeline (unlabeled)] is invalid due to a previous error.` repeated each substep dispatch.

The "previous error" (root WGSL compile error from `device.createShaderModule`) was **not surfaced through the captured console**. The `device.uncapturederror` listener at `gpuSolverClient.ts:80` should log via `console.error`, but Playwright captured zero error-level messages. Either the listener isn't firing, the error level was downgraded somewhere, or the validation error happens before the listener attaches. Additional Vite restart + foundSBA (Int32Array → Float32Array) variant test produced the same 196-warning pattern, suggesting the issue is structural to my B.2 kernel, not the foundBuf type.

I did not isolate the root cause. Possible structural issues with the B.2 kernel:

- **Read-then-write to same storage slot in same dispatch**: `If(triValid.equal(int(1)).and(triDist.lessThan(bestDistBuf.element(i))))` reads `bestDistBuf[i]`, then conditionally writes `bestDistBuf[i].assign(triDist)`. WGSL allows this in a single thread, but TSL may emit binding declarations that conflict (e.g. `var<storage>` instead of `var<storage, read_write>`).
- **6 scratch SBAs registered in one Fn**: each adds a binding. Compute pipelines have a max binding count per group (typically 8 or 16). Plus the existing position/prevPos/invMass/bvh/triVerts/triNormals (6 inputs) = 12 storage bindings. Could exceed group 0's binding count and need group 1 — possibly not auto-handled by TSL.
- **uMargin appears in multiple Fns**: I created two `Fn`s in the same factory; both reference the same `uniform(margin)` node. Whether TSL deduplicates correctly across separate `Fn` instances is unverified.

### 8.3 Recommendation (revised)

Both paths exhausted within budget without producing a working kernel. The design doc's D1–D8 ratifications remain valid; the implementation needs a different angle.

Three viable next directions, in order of preference:

1. **Path B.3 — atomic emulation per `tslSelfCollision.ts`**. Mirror the proven 5-pass shape (hashCount → prefixSum → scatter → resolve → apply) but for body-collision instead of self-collision. The `resolve` pass uses `atomicAdd` to per-particle delta buffers (no outer-toVar tracking; no read-then-write conflict; binding count bounded by atomicAdd-bundled scratch). Higher complexity than B.2 but proven precedent in this codebase. **Estimate: 1–2 days.**

2. **WebGPU debugging infrastructure as prerequisite**. Cannot be productive without surfacing actual WGSL compile errors. Two concrete options: (a) add `addInitScript` capability to the Playwright MCP plugin so we can patch `device.createShaderModule` pre-init, (b) wrap `gpuSolverClient`'s WebGPU device construction in a debug helper that captures every shader module's `code` field and exposes it via `window.__OPENCLO_SHADERS__` for inspection. Either pre-Phase-2.7 investment, or rolled into #742 (cross-tier parity test infra, originally scoped post-#733).

3. **Punt and force WASM-only for now**. Keep `GPU_CAPABILITIES.bodyCollision: false` indefinitely. WebGPU primary path stays gated on this fix. WASM cluster (#605, #606, etc.) becomes the production tier for the foreseeable future. Honest acknowledgment of current TSL kernel difficulty.

### 8.4 Calibration anchor

The reviewer's Q3 answer ("construction-only + e2e, no webgpu-headless runtime tests") was correct in retrospect — webgpu-headless runtime would surface the exact WGSL compile error rather than the cascade of "previous error" warnings. **The diagnosis cost of GPU code without proper debugging tools is ~10× the development cost.** Captured for #742 follow-up urgency upgrade.

Per Sam's earlier note: *"TSL execution-model limitations need anchored documentation."* This document is the anchor — future contributors hitting the toVar/storage-read issue should find this section and skip the diagnostic work.

### 8.5 State at second pause

- Branch `feat/733-gpu-body-collision` HEAD: `951cd4ac` (commits 1 + 2 + Phase 2+3 doc).
- Working tree clean (Phase 2.5/2.6 attempts reverted).
- Capability flag stays `false`.
- Gates: tsc clean, 4819 unit tests pass, lint clean.
- Time spent on this branch: ~7h end-to-end.

**Awaiting reviewer guidance** on next direction (B.3 / debug-infra-first / punt) before further work on this branch.
