# OpenClo Eje P4 — Drape Determinism Design

**Date:** 2026-07-01
**Status:** Draft (brainstorming) — ready for review before implementation plan
**North star:** the drape must be *trustworthy* — same pattern, same device, same settled pose every time. Determinism is the QA/feel substrate under the "Unreal" trust surface, NOT (on today's architecture) a grading-moat precondition. See the honesty note below.
**Suggested home:** `docs/reports/2026-07-01-drape-determinism-p4-fixes.md` (or `docs/plans/`) — **NOT `docs/superpowers/specs/`.** Per Plumb sizing this eje is an edit+refactor bundle (gate spike S, bend coloring M, self-collision XS, tether doc-only) with ~2 real decisions and a ~120–180-line ceiling — a fixes RFC, not a net-new-feature design spec. `specs/` would over-file it.

**Outcome (2026-07-02, @gpu-local): P4 race-determinism CLOSED.** P4-0 (gate) + P4-1 (bend graph-coloring, `b4b82572`) + P4-2 (self-collision keep-smallest admission, `6ceae493`) shipped + GPU-verified. Every data race the audit found (bend, self-collision, contact/A1) is eliminated → the per-frame solver is deterministic (bit-exact clusters prove it). **Bit-exact is NOT reached:** a 10-run gate clustered into 2 macro-basins ~320-345mm apart (7/3 split) + fine 15-42mm sub-structure, both valid drapes (different whole-garment wrinkle states). Root cause is the caveat below (§ "What deterministic means"): inherent WGSL run-to-run float non-determinism (no race left) tipping a metastable drape; the settle-tether freezes whichever basin the 2.5s transient landed in. That ~320mm is a **drape-stability** problem (multiple valid settled states), attacked by P1 dihedral (flexural rigidity) + tether timing — NOT by more determinism work. See P4-2 spec § 11.

## Goal

Make the GPU drape **run-to-run reproducible on a fixed device** and give us a **measurement that fails when it is not**, so the drape E2E stops being un-assertable at the settled checkpoint and the settle-tether can only ever capture a pose that is stable. Kill the two confirmed structural races (bend, self-collision slot truncation); leave CPU/WASM alone (already deterministic); do not chase cross-tier bit-identity (out of scope, not the goal).

## Honesty note — the moat-precondition framing is overstated

The junta ruling framed P4 determinism as "the moat precondition." Verified against the code, that framing does not hold on the current architecture and this spec corrects it. Both adversarial reviews independently confirmed this note is factually correct against ground truth (no premise collapse):

- **Grading is provably pure-2D and never consumes the drape.** Every grade entry point — `gradePoints` / `gradePiece` / `gradePieceByRules` / `gradePieceToSize` (`src/utils/grading/gradingEngine.ts`), `gradeAllSizes` (`src/utils/grading/gradeAllSizes.ts`), `batchGrade` (`src/utils/grading/batchGrader.ts`) — takes `PatternPiece.outline`/`internals` (`PathCommand[]`) + a `Record<string,number>` of measurements. No position buffer, no mesh, no sim state. `src/store/gradingSlice.ts` stores only config + `pieceId` strings + staleness. Wiring (`GradingTab.tsx:200`, `copilot/.../gradingTools.ts:126`) feeds them `project.pieces` 2D outlines.
- **The 3D drape output is disjoint from grading.** `readPositionsToCPU()` (`src/utils/cloth/gpu/gpuSolverClient.ts:854`) and `__OPENCLO_CLOTH_MESH__` flow to the live viewport mesh (`GarmentSimulation.tsx:607`) and to export/fit-maps — and **never** re-enter any grade function.

Therefore a non-deterministic drape **cannot** corrupt or bias a graded size run. Grading a size produces byte-identical 2D geometry regardless of how the cloth settled. **P4 protects three real things, none of which is the moat:**

1. **Reproducible visual fit-preview / QA screenshots** (feel, trust surface).
2. **A stable pass/fail signal for the drape E2E itself** — today the 10s checkpoint in `tests/e2e/webgpu-maria-replay.spec.ts` is *deliberately un-assertable* (spec header lines 16-19, 239-257: bistable "held" belowHip~7% ↔ total collapse belowHip 100% on byte-identical code). P4 is what lets a settled checkpoint become an assertion.
3. **Tether-capture safety** — the settle-tether (`613fd730`) captures a reference pose from a *live run* at the 2.5s settle window (`TETHER_SETTLE_FRAMES = 150`, `GarmentSimulation.tsx:69`/`:592`). If that run is stochastic, the tether captures a stochastic target. This is the one place non-determinism leaks forward, and it is a *feel/QA* leak, not a grading leak (§ Tether).

**If** a future direction routes drape/fit results back into grade rules (drape-informed ease, fit correction — per MEMORY `m2-product-direction`, not today), determinism becomes load-bearing for the moat. It is not today. P4 ships as reproducibility + test-credibility + tether-safety, and we say so.

## What "deterministic" means here — bit-exact on a fixed device (corrected)

The original draft defined the target as "< ~1mm/vertex tolerance." **That is wrong, and the concurrency analysis says why** (Critique 1, accepted):

- After the bend fix (graph-coloring, § P4-1) and with self-collision either off or slot-deterministic (§ P4-2), **no cross-workgroup floating-point reduction survives anywhere in the GPU pipeline.** Within a color, each vertex is written by exactly one constraint (single-writer). Every other cross-thread accumulation is either integer fixed-point `atomicAdd` (commutative → order-independent) or `atomicMin` on an integer composite key (min is min → order-independent). Float non-associativity therefore does **not** apply to the settled result.
- Consequence: on a **fixed device + driver**, a race-free pipeline is **bit-exact run-to-run.** The gate must assert **bit-exact (`memcmp` of the position `Float32Array`)**, with L∞ / L2 in mm reported only as a **diagnostic magnitude**, not as the pass threshold.
- A 1mm tolerance is not "conservative" — it is a **hole**: the bend lost-updates are sub-mm at the 2.5s checkpoint but amplify to the documented 10s bistable collapse, so a 1mm/2.5s gate can pass while the drape is still non-deterministic. Bit-exact closes that hole and is strictly the stronger detector: any surviving lost update makes the run non-bit-exact.

This **also answers Critique 2's "threshold is guessed"** — the threshold is not guessed, it is *derived* (target = 0 ULP = bit-exact), which is only legitimate because the fix removes all float reduction. It is **NOT** cross-tier bit-identity: CPU (f64-intermediate) vs WASM (f32-intermediate) vs GPU (WGSL) diverge by design; only the integer spatial-hash kernel is bit-pinned CPU↔WASM (`selfCollision.ts:105` vs `lib.rs:1271`, #720 fixture). That divergence is ratified (A7/A2/C4) and out of P4 scope.

**Honest caveat / fallback:** WGSL does not *spec-guarantee* run-to-run float determinism even absent data races; in practice a fixed device+driver is stable when the op graph and order are identical. If the target device exhibits benign non-race float jitter, the gate falls back to a **tight ULP / sub-micron** tolerance — but it starts at bit-exact, and any bit-exact failure post-fix is treated as an unaudited race until proven benign. `// ponytail: assert bit-exact; only loosen to a tight ULP band if the device proves benign-jittery, and log why.`

**Removed:** the "same seed input" phrasing from the draft (Critique 2 #8, accepted). There is **no RNG in any solver** — zero `Math.random` / `rand` / clocks in the solve. Non-determinism is purely GPU scheduling of racy writes. "Seed" implied a control knob that does not exist; the input that must be held fixed is *device + driver + pattern + placed pose*, not a seed.

## Problem / Confirmed non-determinism sources

### GPU tier (TSL/WebGPU — the default the user sees) — TWO races

1. **BEND constraints — the standout structural race (live every substep).**
   - `tslSolver.ts:887` dispatches bend as a **single non-colored Jacobi pass**: `compute(fn, buffers.numBendConstraints, [64])`, using the shared `makeDistanceConstraintFn` (kernel call passes stride `4`, offsets `2,3` — `:881-887`).
   - That kernel does **non-atomic** `posBuf.element(id0).addAssign(...)` / `posBuf.element(id1).addAssign(...)` at `tslSolver.ts:399` and `:402` on a plain `vec3` storage buffer.
   - Bend constraints connect opposite hinge verts (stride-4 ids, offsets 2,3, built flat with no coloring in `tslBuffers.ts:206-227`), and one cloth vertex is the opposite vert of many hinges → constraints **share** id0/id1. Concurrent non-atomic read-modify-write to the same location across workgroups is a **WGSL data race** → lost updates, scheduling-dependent, not guaranteed reproducible. Dispatched every substep (`GarmentSimulation.tsx:489`).
   - This is the asymmetry: **stretch** (`tslSolver.ts:838-850`, one dispatch/color) and **seam** (`:895-907`) were explicitly graph-colored to kill exactly this race. Bend was not. The race is **live from step 0**, so divergence accrues from the first substep — the 2.5s checkpoint is not "known deterministic," it is precisely what the gate must *prove* reproducible (Critique 2 #4, accepted; language corrected throughout).

2. **SELF-COLLISION slot truncation — conditional race (only when `config.selfCollision` enabled, `tslSolver.ts:959`).**
   - Scatter claims a bucket slot via `atomicAdd(cellCount[h], 1)` (`tslSelfCollision.ts:287`) and writes the particle only if `slot < CELL_CAPACITY` (=8, `:100`) at `:288-294`.
   - When >8 particles hash to one thickness-sized cell, **which 8 win** depends on atomicAdd arrival order (scheduling). The surviving candidate set — and thus the detected pair set the resolve pass reads (`:358-365`, `i<j` guard `:368`) — varies run-to-run. Deterministic at ≤8/cell; scheduling-dependent once a cell overflows (high local density / clumping).
   - Note: the resolve-pass **accumulation** is fine — the i32 fixed-point `atomicAdd` (`:412-415`, `:423-426`) is integer-commutative, order-independent by construction. The race is purely the *slot admission*, not the sum.

**What is already deterministic on GPU (do not touch):**
- **Body-collision contact selection** — A1 composite-key `atomicMin` (`tslCollision.ts:430` inside-projection, `:486` edge-fallback; decode `:532`). Confirmed present, cherry-picked in `89c319f0` (ancestor of HEAD). The racy split the memory described is **gone**. Composite key = `(distQ << TRI_BITS) | triIdx` (constants `:147-151`, overflow guard `:159-161`). **This is a verify-only line item, not a fix** (Critique 3): 0 lines, confirm it stayed in the tree.
- Stretch (colored), seam (colored), strain-limit (reuses stretch coloring `:854-863`), preSolve/groundClamp/tether/snapshot/postSolve (per-particle, own-slot writes only). Normal-accum `atomicAdd` (`:746-760`) is integer-commutative AND render-only (never feeds physics).

### CPU tier (`xpbdSolver.ts`) — already deterministic, no P4 work

All hot-path loops iterate typed arrays in sequential index order: `solveStretching` (`:1226`), `solveBending` (`:1312`), `solveSeamConstraints` (`seamAssembly.ts:757`), elastic (`:1160`), postSolve (`:1440`), adaptive-substep scan (`:1507`). Spatial hash is counting-sort (scatter preserves index order, `selfCollision.ts:151`) + fixed 3³ sweep (`:172-183`). The A1-style tie-break `if (result.dist < minDist)` at `triangleCollision.ts:344` is strict-`<` **without** quantization but is deterministic run-to-run because candidate order over the *static* body mesh is fixed (buckets filled once in tri-id order `:237-262`, swept fixed `:280-293`). No `Math.random`/`Date.now`/`performance.now` in the solve. **The strict-`<`-without-quantization is a cross-tier parity note, not a run-to-run bug — out of P4 scope.**

### WASM tier (`crates/xpbd-wasm/src/lib.rs`) — already deterministic, no P4 work

The Rust std-HashMap random-seed hazard **does not apply**: zero `HashMap`/`HashSet`/`BTreeMap`/`std::collections` in the crate (grep-verified). Adjacency = `Vec`-backed CSR (`CSRAdjacency`, `:1124`); spatial hash = counting-sort over `Vec<i32>` (`:1298`, scatter `:1337`, sweep `:1356-1367`). No `rayon`/`par_iter`/`thread`/`rand`/`Instant`/`SystemTime`. All hot loops sequential 0..n (`step:443`, `solve_bend:593`, `solve_self_collision:766`). All f32.

## The GATE (the deliverable — makes P4 verifiable @gpu-local)

**Reuse the existing harness; do not build a new one.** The pieces exist: `readPositionsToCPU()` (`gpuSolverClient.ts:854`) already returns a flat `Float32Array(numParticles*3)`, and Playwright `--repeat-each` is already the maintainer's N-run mechanism (spec §8, `.tmp/gpu-maria-wrap-replay.log`).

**Checkpoint = the 2.5s M4 settle window — and it is the tether capture window (confirmed).** 150 frames ≈ 2.5s is where seams have closed, the garment is on the body, AND where `recaptureTetherTargetsFromGpu` fires (`GarmentSimulation.tsx:69` `TETHER_SETTLE_FRAMES = 150`, dispatched `:592`). This directly answers Critique 2 #3 ("tether capture window never specified"): **the gate checkpoint and the tether capture window are the same 2.5s frame**, so gating reproducibility here *does* prove the tether captures a reproducible pose. NOT the 10s window, which the header documents as bistable.

**Gate design (lazy path):**

1. **Capture** — in `tests/e2e/webgpu-maria-replay.spec.ts`, at the 2.5s M4 checkpoint, dump the position `Float32Array` to a per-run artifact: `testInfo.outputPath(\`pos-${testInfo.repeatEachIndex}.bin\`)`. Source the array from `__OPENCLO_CLOTH_MESH__.geometry.attributes.position` (what `readDrape()` already reads) or `readPositionsToCPU()`. ~15 lines.
2. **Diff — offline node step ONLY.** A tiny node script reads `pos-0.bin` … `pos-N.bin` after all repeats complete and computes, per run vs run 0: **bit-exact `memcmp`** (the pass/fail) plus **max-per-vertex L∞** and **L2/particle** in mm (diagnostic magnitude). ~35 lines.
   - **The draft's "second test that runs after the repeats" option is struck** (Critique 1, accepted): `--repeat-each` re-runs the *whole* spec each iteration; no single test invocation ever sees all N artifacts, so an in-suite comparator cannot sequence them. Only an **offline** step that runs after the Playwright process exits can read `pos-0..N.bin` together.
3. **Threshold — bit-exact `memcmp`.** PASS = all runs byte-identical to run 0 at the checkpoint. The mm figures are printed for triage only (how far the pre-fix race pushes vertices). See "What deterministic means" for the fallback-to-tight-ULP escape hatch if the device proves benign-jittery.
4. **Sample size — N≥5, cold + warm.** Bit-exact makes a *single* divergence a fail, which raises sensitivity, but scheduling races can hold across a few warm runs then diverge (Critique 2 #9, accepted). Start at `--repeat-each=5` and include at least one cold-start (fresh page/context) run; bump N if the race is intermittent. `// ponytail: N=5 is a floor, not a proof; raise it if the diff is flaky rather than green.`
5. **Wire** — a `@gpu-local` maintainer command: `npm run test:e2e:gpu -- webgpu-maria-replay -g "determinism" --repeat-each=5` then the offline diff. **Explicitly acknowledged: no GPU in CI → this gate never runs automatically → it is a manual maintainer check and regressions can merge** (Critique 1, accepted). Same limitation as every other `@gpu-local` test; documented, not hidden. If drape-determinism regressions become a real problem, the follow-up is a lightweight GPU runner, not more code here.

**Scope limit stated honestly:** the gate proves reproducibility on **one device+driver** (per-device is the definition). WebGPU is the default tier (#897) → users span many drivers; green on María's GPU proves nothing on another (Critique 2 #10, accepted as a scope note, not a blocker — cross-driver determinism is neither achievable nor in scope; the value is regression-catching on the maintainer's reference device).

**Reproducible ≠ correct — kept separate (Critique 2 #6, accepted).** The bit-exact diff owns **reproducibility** only. The existing M4 asserts (`belowHipPct<5`, `minY>0.5`, `maxY>1.3`, sleeve `meanY<1.476`, `nan===0`) own **correctness**. A reproducibly-*wrong* pose passes the diff and fails M4 — by design. Neither signal substitutes for the other.

**Skipped:** an in-process N-run harness (re-import + re-sim in one test, single-command gating) — heavy and slow. Artifact-dump + offline diff reuses `--repeat-each` for free. `// ponytail: artifact-dump + offline diff; add in-process harness only when single-command gating is worth the re-sim cost.`

## Fix — phased

### P4-0 — Gate first (the spike that proves the problem) — S/edit

Land the capture + offline bit-exact diff **before any fix**. It must be run on today's tree first. Two things P4-0 must establish empirically (both are currently *hypotheses*, not facts — Critique 2 #2, accepted):

- **(a) Does today's tree fail bit-exact at 2.5s?** The draft asserted "FAILS today" as fact; it is a hypothesis until measured. The bend race is live from step 0 and lost updates are non-recoverable, so bit-exact is *very likely* to fail today even if the mm magnitude is sub-mm — which is exactly why bit-exact (not 1mm) is the right assertion. But we confirm, not assume. If it already passes bit-exact on the target device (bend race benign on that driver), P4-1 drops in priority and we re-scope. **Measure before cutting.**
- **(b) Is `config.selfCollision` even active at the 2.5s checkpoint on the default María drape?** (Critique 2 #5, accepted.) If self-collision is off at the checkpoint, a green gate says **nothing** about the P4-2 race — the gate cannot observe a disabled pass. P4-0 must report this. If it is off, P4-2 stays deferred *and unmeasured*, and any P4-2 work needs a dedicated self-collision-on gate run to have a signal at all.

### P4-1 — Bend graph-coloring (the primary fix) — M/refactor

Make bend deterministic the **same way stretch and seam already are** — coloring is the pattern the codebase already chose for this exact race. **But the builder does NOT generalize unchanged** (Critique 1 + Critique 2 #7, accepted — verified against `gpuBuffers.ts:467`):

- `colorConstraints` (`gpuBuffers.ts:467`) is **hardcoded stride-2**: it reads endpoints at `ids[i*2]` / `ids[i*2+1]` (`:480`, `:496`, `:519`, `:536`). Bend ids are **stride-4 with the shared verts at offsets 2,3** (`tslBuffers.ts:206-227`; kernel touches only 2,3). Calling `colorConstraints` on the raw bend array would color the **wrong vertices** (offsets 0,1) and produce a coloring that does not protect the actual `addAssign` targets.
- **The real, small fix:** pre-extract the bend `(c,d)` pairs (offsets 2,3) into a **stride-2 scratch array**, run `colorConstraints` on that, and dispatch the bend kernel per color over stride-2 groups. The kernel only ever touches offsets 2,3, so 0,1 are droppable for coloring purposes. `// ponytail: extract (c,d)→stride-2, color, dispatch — do NOT rewrite colorConstraints to be stride-generic for one caller.`
- Replace the single `compute(fn, buffers.numBendConstraints, [64])` at `tslSolver.ts:887` with one dispatch per color (loop, like `:838-850`). Within a color no two constraints share a vertex → the non-atomic `addAssign` at `:399`/`:402` is race-free, no kernel-body change needed.
- **8-buffer wall: PASS** (Critique 1, confirmed). Colored bend binds pos/invMass/ids/rest/compliance = 5 storage + uniforms. Coloring adds dispatches, not buffers. No wall risk.
- Cost: bend becomes K dispatches instead of 1 (K = chromatic number, small — same K-order as stretch). Watch the ≥30fps floor; bend is not the fps hotspot (Pass-1 BVH is, per pseudonormal spec), so K extra dispatches × 15 substeps of command encoding should be affordable (stretch already pays this). K is unmeasured — measure at @gpu-local.
- Size (Critique 3): ~70–90 lines across ~4 files, 3 callsites (`tslSolver.ts:887` dispatch→loop; `tslBuffers.ts:206-227` build→per-color slices; add a `colorConstraints` call in `gpuSolverClient.ts:~496` against the extracted stride-2 bend array). **1 real decision:** where the `(c,d)` extraction + coloring lives (buffer-build vs client init).

### P4-2 — Self-collision slot determinism (conditional, deferred) — XS/edit

Only matters when `config.selfCollision` is on AND cells overflow (>8 particles/cell) AND P4-0 shows self-collision is active at the checkpoint (else no signal). **The draft's option (a) "port counting-sort" is struck as perf-infeasible** (Critique 1, accepted, verified against `tslSelfCollision.ts:98`):

- A deterministic bounded admission (lowest-index-wins) requires a per-cell rank scan = a serial prefix-sum. `tslSelfCollision.ts:98` documents that exact prefix-sum was **180–900ms/frame** and was **rejected for the 30fps floor (#897 H-BP1)**. Counting-sort on GPU is the same prefix-sum. It is not a viable P4 path.
- **The only cheap deterministic option is (b): raise `CELL_CAPACITY`** (`:100`, currently 8) so that at María density every particle in a cell fits and truncation never fires (all-fit = no admission decision = deterministic). This is a one-constant change with a known ceiling: memory grows linearly with capacity, and a pathological density above the new ceiling re-introduces the race. `// ponytail: raise CELL_CAPACITY so all-fit at María density; ceiling = memory. No counting-sort — the prefix-sum is the 180–900ms/frame path #897 already rejected.`

**Defer P4-2 unless P4-0 shows self-collision-on runs diverge at the checkpoint.** If self-collision is off at 2.5s (likely on the default drape), do nothing (YAGNI).

### P4-3 — Cross-tier lockstep (bounded — coloring only, NOT numeric identity)

- CPU and WASM bend are **already deterministic** (sequential index-order loops, `xpbdSolver.ts:1312` / `lib.rs:593`) — **no change**.
- P4-1 changes only GPU *dispatch grouping*, not the constraint math, so it does **not** alter the GPU's numeric result versus its own race-free behavior beyond removing lost updates. It does **not** need a matching CPU/WASM edit and does **not** touch the #720 hash pin or the #746/#748 parity oracle.
- **Cross-tier bit-identity remains explicitly out of scope** (ratified A7/A2/C4). The only cross-tier obligation: the WASM parity oracle (#746/#748) and CI `rust` job stay green — they will, because no WASM code changes. P4-2(b) is a GPU-only constant; it does not touch WASM.

## Tether — the one forward-leak, and the requirement

The settle-tether (`613fd730`, arrested #902 GPU drape instability) captures a reference pose from a **live GPU run** at 2.5s (`TETHER_SETTLE_FRAMES = 150`, `GarmentSimulation.tsx:69`; fired `:592`) and holds it (anti-slide). Because that run is stochastic today (bend race, § GPU), **the tether captures from a stochastic run** — the exact concern in the junta ruling: "the settle-tether must not feed grading because it captures from a stochastic run."

**Two things this spec commits to:**

1. **The tether must never feed grading.** This is already true by architecture (§ Honesty note: grading is pure-2D, drape output never re-enters grade functions) and must **stay** true. P4 adds no path from tether/drape → grade. If any future work proposes routing drape/fit back into grade rules, it is blocked until (a) determinism is gated green AND (b) an explicit review re-opens the moat-precondition question. Record this as a standing constraint, not code (XS, doc-only — Critique 3).
2. **P4-1 makes the tether's capture reproducible — and the gate proves it at the exact capture frame.** Once bend is colored, the 2.5s settled pose the tether captures is bit-exact run-to-run on the fixed device. Because the gate checkpoint *is* the tether capture frame (confirmed above), the bit-exact assertion *directly* certifies "the tether captures the same pose every run." The tether stops being "capture whatever this scheduling produced" and becomes "capture the (now reproducible) settled pose." This is the *feel/QA* payoff — with **zero** implication for grading, which never sees it either way.

**Non-goal:** re-pose tether refresh (per MEMORY `gpu-drape-longhorizon-instability`: "tether no refresca en re-pose") is a separate follow-up, not P4.

## Testing / Success criteria

- **@gpu-local determinism gate (the deliverable):** `pos-*.bin` **bit-exact** (`memcmp`) across N≥5 `--repeat-each` runs (incl. one cold start) at the 2.5s M4 / tether-capture checkpoint; mm L∞/L2 reported as diagnostic. Expected to FAIL on today's tree (bend race — *to be confirmed by P4-0*, not asserted), PASS after P4-1.
- **@gpu-local drape correctness unchanged (separate signal):** the existing M4 asserts still hold (`belowHipPct<5`, `minY>0.5`, `maxY>1.3`, sleeve `meanY<1.476`, `nan===0`); ≥30 fps held after bend goes K-dispatch. Correctness ≠ reproducibility — both must be green.
- **WASM parity oracle green** (#746/#748) + CI `rust` job green (no WASM change, but verify).
- **Unit test (GPU-free):** a coloring-correctness check on the **extracted stride-2 bend pairs** — assert no two constraints in the same color share a vertex (the invariant that makes the non-atomic `addAssign` safe). One runnable assert, no GPU needed. `// ponytail: this is the ONE check the bend fix must leave behind — coloring correctness is the whole safety argument.`
- **Follow-up (not P4 gate):** re-attempt the 10s shape assertion once P4-1 lands and the gate confirms 2.5s bit-exactness — see if the bistable collapse was bend-driven.

## Out of scope (P4)

- Cross-tier bit-identity (ratified divergent — A7/A2/C4; only the integer hash kernel is pinned, #720).
- CPU / WASM determinism work (already deterministic — verified).
- The CPU `triangleCollision.ts:344` strict-`<`-without-quantization (cross-tier parity note, not run-to-run).
- Tether re-pose refresh (`gpu-drape-longhorizon-instability` follow-up).
- Any drape→grading routing (blocked by standing constraint above).
- The 10s bistable-collapse *shape* assertion (follow-up after the 2.5s gate is green).
- Counting-sort / prefix-sum admission for GPU self-collision (perf-infeasible, #897 H-BP1 — `tslSelfCollision.ts:98`).
- A generic stride-agnostic `colorConstraints` refactor (only one new caller; extract stride-2 instead).
- Cross-driver / cross-device determinism (per-device is the definition; not achievable).

## Rejected feedback (and why)

- **Critique 2's endorsement that "bit-exact is correctly disclaimed" (loose tolerance is fine).** Rejected. It conflicts with Critique 1's concurrency proof, which is correct against the code: after graph-coloring there is no surviving cross-workgroup float reduction (single-writer per color; all else integer-commutative or integer `atomicMin`), so bit-exact is *achievable* on a fixed device and is strictly the stronger detector. A 1mm tolerance is a hole (sub-mm bend lost-updates amplify to the 10s collapse). This spec sides with Critique 1: assert bit-exact, keep mm as diagnostic, with an explicit tight-ULP fallback only if the device proves benign-jittery.
- **Critique 3's "relocate out of `specs/`" — accepted, not rejected** (noted here for completeness): the suggested filename is moved to `docs/reports/` per the sizing argument.

---

Files this spec anchors on (all absolute):
- `D:\Desktop\projects\openclo\src\utils\cloth\gpu\tslSolver.ts` (bend dispatch `:887` w/ stride 4 offsets 2,3 `:881-887`, `addAssign` `:399`/`:402`, stretch coloring `:838-850`, seam coloring `:895-907`, tether kernel `:865-869`)
- `D:\Desktop\projects\openclo\src\utils\cloth\gpu\gpuBuffers.ts` (`colorConstraints` `:467`, hardcoded stride-2 `ids[i*2]` `:480`/`:496`/`:519`/`:536` — does NOT generalize to bend as-is)
- `D:\Desktop\projects\openclo\src\utils\cloth\gpu\tslCollision.ts` (A1 composite-key atomicMin `:430`/`:486` — already deterministic, verify-only)
- `D:\Desktop\projects\openclo\src\utils\cloth\gpu\tslSelfCollision.ts` (slot truncation `:287-294`, `CELL_CAPACITY` `:100`, prefix-sum-rejected note `:98`)
- `D:\Desktop\projects\openclo\src\utils\cloth\gpu\tslBuffers.ts` (bend id layout `:206-227`)
- `D:\Desktop\projects\openclo\src\utils\cloth\gpu\gpuSolverClient.ts` (`readPositionsToCPU` `:854`, `recaptureTetherTargetsFromGpu` `:1186`)
- `D:\Desktop\projects\openclo\src\components\Viewport3D\GarmentSimulation.tsx` (substep dispatch `:489`, tether settle-capture `TETHER_SETTLE_FRAMES=150` `:69`, fired `:592`, readback `:607`)
- `D:\Desktop\projects\openclo\tests\e2e\webgpu-maria-replay.spec.ts` (the gate host)
- `D:\Desktop\projects\openclo\src\utils\grading\gradingEngine.ts` / `gradeAllSizes.ts` / `batchGrader.ts` (pure-2D grade path — proves the honesty note)
