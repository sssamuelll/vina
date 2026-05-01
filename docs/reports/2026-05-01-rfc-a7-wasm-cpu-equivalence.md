# A7 RFC — WASM vs CPU solver equivalence (per-feature)

**Fecha:** 2026-05-01
**Eje:** A7 (drift-axis category (c) — RFC scope per `2026-04-28-drift-fase2-classification.md`).
**Branch:** `drift/a7-wasm-cpu-equivalence`.
**Status:** RFC en redacción incremental. Sec 1+2 en este commit; Sec 3+ en commits subsiguientes.

**Cross-refs (input docs + adjacent ejes):**
- `docs/reports/2026-04-28-drift-inventory-fase1.md` § A7 — original entry: "drift real con consecuencias funcionales. 6 divergencias documentadas."
- `docs/reports/2026-04-29-drift-inventory-addendum.md` § 7 — confirms BUG-5 absorbed scope: "Antes: 6 divergencias. Ahora: 6 divergencias + decisión 'self-collision en WASM (paridad de feature) ¿o solo CPU?'."
- `docs/reports/2026-05-01-drift-fase2-a3-cross-boundary-errors.md` — A3 closure, Pattern 2.5 extend variant first data point. A7 may leverage A3's `panic_hook`, Result-pattern convention, NaN guards, silent fallback UI surface.
- `docs/reports/2026-05-01-rfc-c1-buffer-lifecycle.md` — C1 closure, Pattern 2.5 extend variant second data point (sub-rule established 2/2). A7 outcome may add third data point or refine variant.
- BUG-1 commit `ed632b9` (#604) — bend rest distances WASM. CLOSED.
- BUG-2 commit (#605) — friction prevPos WASM. CLOSED.
- BUG-3 commit (#606) — seam compliance WASM. CLOSED.
- BUG-5 issue #608 — self-collision **OPEN, absorbed into A7 scope**.

---

## 1. Decide / NO-decide

### 1.1 Lo que A7 decide

A7 RFC decide seis cosas, organizadas como sub-decisiones ortogonales en Sec 3:

1. **Per-feature classification** for the 5 real CPU-only feature gaps (self-collision, LRA, pressure, fold, piece stiffness): per feature, ¿port to WASM, ratify CPU-only-by-design, or defer?

2. **Solver-agnostic interface** (e.g., `ClothSolverInterface`): extract abstraction, status quo (per-call site decision), or hybrid (interface for future, gradual migration).

3. **Feature flag granularity for CPU vs WASM choice**: per-feature flags, monolithic (`useWasmSolver`), or tier-based with explicit per-feature surface. **Bounded to CPU vs WASM binary choice.**

4. **Parity testing strategy**: formal CPU vs WASM output equivalence tests (with epsilon tolerance), bench-based perf assertions, or status quo (integration tests + manual smoke).

5. **Documentation strategy**: JSDoc + CLAUDE.md "CPU vs WASM solver capabilities" tabla + warning surfacing strategy en UI.

6. **Roadmap implications**: if decision selects port for some features — order, dependencies, estimate per feature.

### 1.2 Lo que A7 explícitamente NO decide

- **Tier selection logic across all 4 solvers (CPU/WASM/WebGPU/TSL).** This is **C4 territory** per `drift-inventory-fase1.md` § C4 ("TSL/WebGPU compute coexiste con WASM/CPU activo"). A7 binds only to CPU vs WASM equivalence per-feature. When C4 RFC opens, A7's § 3.3 decision is direct input — but A7 does not pre-empt the broader 4-way tier orchestration question.

- **WebGPU/TSL solver feature parity.** Out of scope absoluto. The WebGPU/TSL solver (`src/utils/cloth/gpu/tslSolver.ts`) has its own feature surface and is feature-flagged off by default. Cross-language parity for the GPU tier is C4 territory.

- **Worker message protocol unification.** Some divergence between CPU worker (`clothWorkerClient.ts`) and WASM worker (`wasmSolverClient.ts` + `wasmSolverWorker.ts`) message shapes exists. **A6 RFC territory** ("Worker message protocol asimétrico"). A7 leaves the per-feature setter shape (e.g., `setLRA`, `setPressures`) to A6 if/when interface unification is decided.

- **Per-feature performance benchmarks.** A7 references existing bench data (CPU LRA via `bench/buildLRAConstraints.bench.ts`) but does NOT mandate WASM-vs-CPU bench infrastructure as part of A7 closure. Bench-as-parity-test is one option in § 3.4; if selected, the implementation lives as A7 follow-up sub-track or a dedicated bench RFC.

- **Self-collision algorithmic choice (SpatialHashGrid vs alternative).** If A7 selects "port self-collision to WASM", the algorithm is the same as CPU (SpatialHashGrid + collision response). Choosing a different algorithm (BVH, signed distance fields) is out of scope — that would be a separate optimization eje, not equivalence.

- **Adaptive substeps as physics decision.** § 2.2 will document the architectural location difference (CPU has it inline; WASM hardcodes substeps=1 in worker call + JS-side outer loop manages the substep cadence). A7 § 3.1 may articulate "make substeps cadence configurable from JS-side for both tiers" as an option, but does NOT decide the physics tradeoff (more substeps = stable + slow vs few substeps = unstable + fast). That is performance/quality tuning, separate from equivalence.

### 1.3 Reopen triggers anticipados (preview, formal en Sec 7)

- If WASM tier becomes default for production users and silent feature absences (LRA, pressure, fold, piece stiffness) generate user-visible bug reports, reopen § 3.1 with port priority shifted.
- If a new physics feature is introduced (e.g., wrinkle constraints, anisotropic damping) that lands in CPU before WASM, reopen § 3.1 to evaluate whether the new feature inherits A7 convention (port or ratify).
- If C4 RFC selects a tier orchestration model that conflicts with A7's § 3.3 decision (e.g., C4 selects "user picks tier explicitly"; A7 selected "tier-based with per-feature surface"), reconcile.
- If parity testing strategy (§ 3.4) is rejected and a port lands without parity verification → bug emerges → reopen § 3.4 with stronger requirement.
- If self-collision specifically becomes a CPU-tier-only deal-breaker (e.g., users abandon WASM because cloth passes through itself), reopen § 3.1.A with timeline forced.

---

## 2. Estado actual

### 2.1 Pre-existing canonical infrastructure check (regla 1 v2)

**0 `ClothSolverInterface`** o abstraction layer between CPU and WASM solver clients. Verificación:

```bash
grep -rn "ClothSolverInterface\|interface ClothSolver\|abstract.*Solver" src/utils/cloth --include="*.ts"
# (no output)
```

**0 per-feature WASM flags** (no `useWasmSelfCollision`, `useWasmLRA`, etc.):

```bash
grep -rn "useWasmSelfCollision\|useWasmLRA\|useWasmPressure" src/
# (no output)
```

**0 parity tests** asserting CPU vs WASM output equivalence.

**Existing bench infrastructure** (CPU-only):
- `bench/buildLRAConstraints.bench.ts` — Dijkstra over cloth mesh, threshold gate enforced. No WASM comparison.
- `bench/matchVertices.bench.ts` — vertex pairing, threshold gate enforced. No WASM comparison.

**Tier selection logic** is implicit in the solver client lifecycle:
- `wasmSolverClient.ts:18` — comment: errors with `code: 'wasm_memory_unavailable'` trigger fallback (per A3 closure).
- `useSimulationLifecycle.ts` — no explicit per-feature tier override; default WASM with CPU fallback.

**Conclusion:** A7 propone canonicals where none pre-exist. No risk of duplicating infrastructure. Ratification path is open (Pattern 2 ratify clean if all features → CPU-only-by-design + docs/UI), real-fix path is open (Pattern 1 if all → port), and Pattern 2.5 extend mixed is the most likely shape per meta-anchor.

### 2.2 Feature parity table (verified empirically)

The following table is the canonical inventory for A7 scope. Each row is a feature in the cloth simulation domain; column status is verified by reading `src/utils/cloth/xpbdSolver.ts` (CPU TS solver, 1783 lines) and `crates/xpbd-wasm/src/lib.rs` (WASM Rust solver, 832 lines).

| # | Feature | CPU (xpbdSolver.ts) | WASM (lib.rs) | Status | Port cost (Rust líneas) |
|---|---|---|---|---|---|
| 1 | Stretch (XPBD constraint) | ✅ `solveStretching` | ✅ `solve_stretch` (`set_stretch_with_types`) | **Parity** (post BUG-1) | n/a |
| 2 | Bend (XPBD constraint) | ✅ `solveBending` | ✅ `solve_bend` (`set_bend_with_types`) | **Parity** (post BUG-1) | n/a |
| 3 | Seams + per-seam compliance | ✅ | ✅ `solve_seams` (`set_seams_with_compliance`) | **Parity** (post BUG-3) | n/a |
| 4 | Wind | ✅ | ✅ `set_wind` | **Parity** | n/a |
| 5 | Pinning | ✅ `pinParticle` | ✅ `set_pins` | **Parity** | n/a |
| 6 | Body friction | ✅ (CPU collision response) | ✅ (post BUG-2 fix) | **Parity** (post BUG-2) | n/a |
| 7 | **Self-collision** | ✅ line 1126 (`SpatialHashGrid` + `solveSelfCollision`) | ⚠️ **scaffolded** (`self_collision: bool` field line 33-34 + `set_adjacency` setter line 205, **NO `solve_self_collision` function**) | **Real gap (BUG-5 absorbed)** | ~200-400 (algorithm port) |
| 8 | **LRA (Long Range Attachments)** | ✅ `longRangeAttachments.ts` (189 líneas, Dijkstra geodesic + soft constraint) | ❌ **NOT in API** | **Real gap (silent)** | ~300-400 (algorithm translation) |
| 9 | **Pressure (per-piece)** | ✅ `setPiecePressures` (lines 974-1026, ~52L) + `applyPressureForces` (lines 1033-1085+, ~50-80L) + `particlePressure: Float32Array` | ❌ **NOT in API** | **Real gap (silent)** | ~120-150 (per-particle math) |
| 10 | **Fold (bending compliance overrides)** | ✅ `setFoldConstraints` (lines 1212-1244, ~33L) + `clearFoldConstraints` (lines 1247-1252, ~6L) | ❌ **NOT in API** | **Real gap (silent)** | ~40-50 (modifies existing bend constraints) |
| 11 | **Piece stiffness (per-piece multipliers)** | ✅ `applyPieceStiffness` (lines 588-628, ~40L) | ❌ **NOT in API** | **Real gap (silent)** | ~30-50 (compliance scaling) |
| 12 | Adaptive substeps | ✅ inline (line 1447, 10-30 substeps based on velocity) | ❌ in Rust core | **Architectural difference** — JS-side worker hardcodes Rust internal substeps=1 (`wasmSolverWorker.ts:169`); JS manages outer substep loop. Adaptive cadence not implemented in WASM tier. | n/a (JS-side decision) |
| 13 | Velocity clamp | ✅ in `postSolve` (`maxVelocity: 5.0` default) | ✅ JS-side wrapper (`wasmSolverWorker.ts:332` clamps post-step) | **Architectural difference** — location only, not gap. Both tiers clamp velocity; CPU does it inline, WASM does it post-step from JS. | n/a (already implemented) |

**Summary:**
- **6 features in parity** (Stretch, Bend, Seams, Wind, Pinning, Body friction).
- **5 real feature gaps** (Self-collision scaffolded; LRA, Pressure, Fold, Piece stiffness silently absent).
- **2 architectural differences** (Adaptive substeps location, Velocity clamp location — both non-gap).

**Inventory honest framing:** the original A7 entry mentioned "6 divergencias". Of those, 2 (BUG-2 friction, BUG-3 seam compliance) are CLOSED via bug fixes pre-A7. Remaining 4 + BUG-5 absorbed = 5 real gaps. Plus the 2 architectural differences are listed for completeness but are not "drift" — they are deliberate architectural choices per current code (with no documented rationale, which § 3.5 will address).

### 2.3 Self-collision specific status (BUG-5 absorbed)

BUG-5 issue #608 status: **OPEN**. Verified via `gh issue view 608`.

**Issue body (verbatim):**

> The Rust solver has a `self_collision` field and a `set_adjacency` method, but the WASM worker **never calls** `set_adjacency` and the `selfCollision` config field defaults to `false` in the worker. The CPU tier supports self-collision via `SpatialHashGrid`. Result: self-collision is dead code in the WASM tier regardless of user configuration.

**Code reality:**

```rust
// crates/xpbd-wasm/src/lib.rs:33-34
struct XpbdSolver {
    // ...
    self_collision: bool,
    // ...
}

// Lines 205-209 — setter exists
pub fn set_adjacency(&mut self, offsets: &[u32], neighbors: &[u32]) {
    self.adjacency_offsets = offsets.to_vec();
    self.adjacency_neighbors = neighbors.to_vec();
}

// Lines 255-266 — configure() accepts the flag
pub fn configure(..., self_collision: bool, ...) {
    self.self_collision = self_collision;
}
```

But there is **no `solve_self_collision` function** in the Rust solver. The flag is read on field access but never acted upon. The `step()` function does NOT branch on `self.self_collision`.

```ts
// src/utils/cloth/wasm/wasmSolverWorker.ts:159-165 — explicit warning
// BUG-5 (#608): self-collision is not implemented in the Rust solver
// Force selfCollision=false regardless of user config; WASM tier silently
// does not support self-collision.
if (currentConfig.selfCollision) {
  console.warn(
    '[WasmWorker] selfCollision=true requested but the WASM solver has no implementation; ' +
    'forcing false. Use the CPU solver tier for self-collision. Tracking: #608, A7 RFC.'
  );
}
```

**Caveat important per Sam directive:** "wire up `set_adjacency`" sería cosmetic — el fix real requiere implementar `solve_self_collision` en Rust (algoritmo SpatialHashGrid + collision response). The CPU implementation (`src/utils/cloth/selfCollision.ts` referenced from `xpbdSolver.ts:14`) is the reference; port to Rust is a translation + spatial-hash data structure design.

**Self-collision sub-decision space hint:** because port cost is non-trivial (~200-400 Rust lines + spatial hash data structure design + parity testing concern), § 3.1 may articulate self-collision specifically with higher granularity than the other 4 features:

- (a) Port complete algorithm to Rust.
- (b) Hybrid: scaffolding + JS-side spatial hash + Rust collision response (incremental).
- (c) Defer entirely to A7' or BUG-5 dedicated work.
- (d) Ratify CPU-only-by-design (close BUG-5 con explicit rationale).

Other 4 features (LRA, pressure, fold, piece stiffness) have shallower sub-decision space — port / ratify CPU-only / defer suffices.

**Sub-RFC trigger NOT detected.** Self-collision is a clear feature port question (algorithm known, reference exists in CPU). It does NOT require its own RFC for architectural design — only port-or-ratify decision. A7 articulates the higher granularity inline in § 3.1.

### 2.4 A3 patterns leveraged (cross-ref established 2026-05-01)

A7 inherits 4 patterns from A3 closure (PR #672 merged 2026-05-01, Pattern 2.5 extend variant first data point):

1. **`console_error_panic_hook`** — adopted in `crates/xpbd-wasm/src/lib.rs` as preventive insurance. If A7 ports new features, any accidental Rust `unwrap()` panics surface to browser console with stack traces. No A7-specific work needed; coverage already in place.

2. **Result-pattern convention forward-only** (per A3 § 3.4) — for new fallible Rust→TS exports. If A7 adds new fallible APIs (e.g., `validate_self_collision_topology(adjacency: &[u32]) -> Result<...>`), follow the discriminated-union shape ratified in A3. Existing zero-copy hot path exports preserved as-is (positions, velocities).

3. **NaN guards en WASM→JS boundary** (per A3 § 3.3) — existing post-step guard with cumulative counter `wasmNaNCount`. Covers any new physics feature automatically; the guard is at the boundary, not per-feature.

4. **Silent fallback UI surface** (per A3 commit 3 — `wasmSolverWorker.ts:402-407` + UI surface) — relevant if A7 keeps any feature CPU-only-by-design. Pattern exists for surfacing `wasm_memory_unavailable`; can extend to surface "feature X not supported in WASM tier, switching to CPU tier" if § 3.5 selects active surfacing.

A7 does NOT re-introduce these patterns; they are cross-referenced and adopted where applicable.

### 2.5 Performance characteristics

**Existing bench data (CPU-only):**

- `bench/buildLRAConstraints.bench.ts` — PR #589 swapped LRA Dijkstra priority queue from array+insertion-sort (O(V²) on dense meshes) to binary min-heap over typed arrays (O((V + E) log V)). Numbers from PR #589 on a dev machine:
  - N=1000 particles: 6.43ms → 2.41ms (2.7×).
  - N=10000: 43.21ms → 13.78ms (3.1×).
  - N=20000: 114.37ms → 14.11ms (8.1×).
- `bench/matchVertices.bench.ts` — vertex pairing, O(|A|·|B|) → O(|A|+|B|) two-pointer walk (PR #591). Legacy ~187ms → new ~0.5ms at N=10000.

**No WASM-vs-CPU comparison benchmarks exist.** All bench files measure CPU TS implementations only. § 3.4 (parity testing strategy) addresses whether to add WASM-vs-CPU benchmarks; the existing infrastructure (`bench/_lib.ts`) supports adding them but is not currently used for cross-tier comparison.

**Implication for port decisions:** a major argument for porting is "WASM is faster than CPU TS for the same algorithm" — but this is **assumption, not data**. For features in parity (Sites 1-6), WASM is presumed faster (WASM solver is the default tier). For features only in CPU (Sites 7-11), porting to WASM is presumed faster; this should be measured if precision is needed for prioritization.

**Tier selection logic (current):**
- Default: WASM solver (fastest tier).
- Fallback to CPU TS if WASM init fails (`wasm_memory_unavailable` per A3).
- WebGPU/TSL solver: opt-in via feature flag (currently off by default; out of A7 scope).

There is no per-feature override (e.g., "use CPU for self-collision, WASM for everything else"). User choice is binary: WASM tier (with silent feature gaps) or CPU tier (full features, slower).

### 2.6 Out-of-scope adjacent (per § 1.2)

For clarity, the following adjacent concerns are explicitly out of A7 scope:

- **C4 (TSL/WebGPU/WASM/CPU 4-way coexistence).** A7 binds CPU vs WASM; C4 binds the broader 4-way tier orchestration. A7's § 3.3 decision is direct input to C4 when C4 RFC opens.
- **A6 (worker message protocol asimétrico).** Per-feature setter shape (e.g., how `setLRA` would look in WASM worker) is A6 territory. A7 may suggest setter shapes inline as part of port migration plans (§ 5) but does not decide the broader interface unification.
- **A2 (cross-boundary serialization `ClothSimConfig`).** Type-level cross-language sync is A2 territory. A7's per-feature port decisions may add new fields to the shared config type; A2 RFC will design the canonical shape.
- **A4 (Geometry/mesh ops Rust↔TS).** Algorithmic ports beyond solver core (e.g., mesh adjacency builder) are A4 territory. A7's self-collision port may need spatial hash data structure; the design choice (separate Rust crate vs inline in xpbd-wasm) is partially A4 territory.

---

---

## 3. Sub-decisiones (parte 1 — § 3.1)

Six sub-decisiones ortogonales. § 3.1 (per-feature classification) es load-bearing — su outcome cascadea sobre 3.2-3.6. Por eso este commit articula 3.1 only; 3.2-3.6 vienen en commit subsiguiente para review granular.

### 3.1 Per-feature classification

Per Sam directive, cada feature articulada con 5 fields:

1. **Current status** (CPU / WASM / architectural diff).
2. **Port cost estimate** (Rust líneas + complexity factor).
3. **Use case** (cuándo se usa el feature; UX impact).
4. **Decision space** ((a) port to WASM / (b) ratify CPU-only-by-design + UI surface / (c) defer to A7' o C4).
5. **Recommendation con calibration honest** (alta / media / baja confianza, A y B alternatives respetadas).

The 5 real feature gaps get the full decision space. The 2 architectural differences (adaptive substeps location, velocity clamp location) get simpler ratify articulation (NOT port questions per § 1.2 + Sam directive).

#### 3.1.1 Self-collision (BUG-5 absorbed) — special sub-granularity (4 sub-options)

**Current status:** CPU has full implementation (`src/utils/cloth/selfCollision.ts` referenced from `xpbdSolver.ts:14`; activation at line 1126). WASM has scaffolding (`self_collision: bool` field + `set_adjacency` setter), **no `solve_self_collision` function**. JS-side worker forces `selfCollision: false` con explicit warning (`wasmSolverWorker.ts:159-165`) cita "BUG-5 (#608), A7 RFC".

**Port cost estimate:** ~200-400 Rust líneas (algorithm: SpatialHashGrid data structure + collision detection + collision response + neighbor skipping via adjacency). Complexity factor: **medium-high** — not just translation, requires data structure design choice (Vec-based hash buckets vs alternative). Reference is the CPU TS implementation; algorithm is well-known.

**Use case:** needed for any cloth that can fold over itself — sleeves, pleats, body-hugging garments, multi-layer drapes. High visual impact when missing: cloth passes through itself, layered garments collapse onto avatar without visual depth, pleats resolve incorrectly. **Production frequency: high** (any non-trivial garment).

**Sub-decision space (4 sub-options per § 2.3):**

##### (a) Port complete algorithm to Rust

**Pros:**
- Closes BUG-5 #608 definitively.
- Default tier (WASM) gains feature parity for high-impact UX feature.
- Existing Rust scaffolding (~30L flag + setter) leveraged, not wasted.
- Algorithm well-known; CPU TS is reference; NaN guards (A3) cover boundary.

**Cons:**
- Highest port cost of the 5 features (~200-400L Rust + spatial hash data structure + tests + integration).
- Spatial hash data structure design adds A4 territory overlap (cross-language data structure parity question).
- Estimated implementation: ~10-15h Fase 3.

**Confidence shift if selected:** A7 closure shape becomes Pattern 1-leaning real-fix for self-collision specifically (other features may stay extend variant).

##### (b) Hybrid: scaffolding + JS-side spatial hash + Rust collision response

**Pros (articulated honest, expected to be rejected):**
- Spatial hash stays in JS (where SpatialHashGrid is already implemented). Rust handles only the collision response math (per-particle constraint solve).
- Avoids cross-language data structure design.
- Incremental — could be a stepping stone to (a) later.

**Cons:**
- **Architectural smell.** Per-step JS↔Rust round-trip for every cloth particle pair: build hash in JS, send candidate pairs to Rust as flat array, Rust solves per-pair, returns position deltas to JS. Cost dominated by serialization, not solve.
- Cache locality lost. The CPU TS implementation iterates the spatial hash + solves collision in the same hot loop, exploiting CPU cache. Splitting forces multiple passes.
- Defeats the WASM speed advantage. The presumed reason to port to WASM is performance; (b) erases that by making serialization the bottleneck.
- Hybrid code is harder to reason about, harder to test, harder to debug.

**Likely outcome:** **Rejected.** Worst-of-both-worlds. Articulated honest because Sam directive: "(b) es probable smell — articulalo honest aunque lo descartes."

##### (c) Defer entirely to A7' o BUG-5 dedicated work

**Pros:**
- Zero A7 implementation cost.
- A7 closes scope-clean, focused on the other 4 feature gaps.

**Cons:**
- BUG-5 #608 stays OPEN indefinitely.
- The "use the CPU tier for self-collision" workaround in `wasmSolverWorker.ts:165` becomes permanent without explicit ratification.
- High-impact UX feature gap silently persists for default tier users.

**Likely outcome:** **Disrecommended** if A7 selects (a) for any other feature — A7 should not be inconsistent (port some, defer self-collision). If A7 selects (b)-CPU-only-by-design across all features, then (c) for self-collision is consistent with that philosophy. Otherwise (c) is uncomfortable scope-clipping.

##### (d) Ratify CPU-only-by-design (close BUG-5 con explicit rationale)

**Pros:**
- Closes BUG-5 #608 (different shape than (a), but closure is closure).
- Forces explicit UX surface: "self-collision requires CPU tier; switching tiers" warning when user enables self-collision config + is on WASM tier.
- Frees A7 from highest-cost port; aligns with B6-state ratify-by-convention precedent.

**Cons:**
- Requires explicit rationale for CPU-only — "spatial hash performance-bounded, WASM port doesn't materially improve perf" is the most defensible argument, but **unverified** (no WASM-vs-CPU bench data, per § 2.5).
- Tier choice forced upon user: enable self-collision → switch to CPU tier (slower). User UX degraded.
- Existing Rust scaffolding becomes dead code; commit removing the dead `set_adjacency` + flag is a follow-up.

**Likely outcome:** Defensible if performance argument is strong (which would require bench data we don't have). Otherwise (a) is preferable.

##### Self-collision sub-recommendation (preview, formal en § 4)

**Lean: (a) Port complete algorithm to Rust.** Confidence: **medium**.

Reasoning:
- Scaffolding ya invertida (~30L) — port leverages existing Rust footprint.
- Algorithm well-known + reference exists in CPU.
- Closes BUG-5 con clear closure.
- (b) hybrid es smell, (c) is uncomfortable scope-clipping if any other feature gets (a), (d) requires unverified perf argument.

**Counter:** if Fase 3 estimate balloons past ~15h or if the spatial hash data structure design opens A4 overlap (cross-language data structure question), revisit (d) with explicit perf bench.

#### 3.1.2 LRA (Long Range Attachments)

**Current status:** CPU has full implementation (`src/utils/cloth/longRangeAttachments.ts` 189 lines — Dijkstra geodesic distance from pinned vertices + soft constraint enforcement). Activation at `xpbdSolver.ts:1133` ("LRA as hard limit after all soft constraints"). WASM **not in API** (no field, no setter, no warning).

**Port cost estimate:** ~300-400 Rust líneas (Dijkstra over typed arrays + binary min-heap priority queue + constraint enforcement). Complexity factor: **medium** — algorithmic translation; CPU TS uses optimized binary heap (per PR #589). Reference exists; deterministic algorithm.

**Use case:** prevents stretchy cloth from looking unrealistic when pinned at multiple points (e.g., a long sleeve hanging from a shoulder pin droops indefinitely without LRA). Quality feature for realism. **Production frequency: medium-high** (any pinned garment with significant span).

**Decision space:**

##### (a) Port to WASM

**Pros:**
- Closes the silent-absence gap — currently WASM users get LRA disabled without knowing.
- Algorithm is self-contained (single file, no cross-cutting state in CPU implementation).
- PR #589 demonstrated the binary-heap design is performant; same shape ports cleanly.

**Cons:**
- 300-400 Rust líneas — second-largest port after self-collision.
- LRA is rebuilt periodically (`rebuildLRA()` line 663) — need to expose a `rebuild_lra` setter from WASM with similar invalidation semantics.
- Dijkstra priority queue ports require typed-array choices in Rust (Vec<u32> + custom heap, or `BinaryHeap<Reverse<...>>`); design choice non-trivial.

##### (b) Ratify CPU-only-by-design + UI surface

**Pros:**
- CPU LRA is already fast (8.1× speedup post-PR #589, ~14ms at N=20000).
- WASM LRA gains may be marginal (15-30% perhaps, not 8×).
- Lower implementation cost: docs + UI surface saying "LRA on WASM tier currently unsupported, switch to CPU tier for LRA-enabled cloth".

**Cons:**
- Quality feature gap persists for default tier.
- Inconsistent with (a)-self-collision (if A7 picks (a) for self-collision, why not LRA?).
- "WASM doesn't help here" requires bench data we don't have.

##### (c) Defer to A7' o C4

Same shape as self-collision (c) — A7 doesn't address LRA, BUG-related issue stays open if filed.

**LRA sub-recommendation (preview):**

**Lean: (a) Port to WASM.** Confidence: **medium-low**.

Reasoning:
- Algorithm well-known + self-contained.
- Closes silent-absence gap (currently users don't know LRA is off).
- Cost moderate (~300-400L) but bounded.

**Counter:** CPU LRA is already fast post-PR-589. If WASM port doesn't deliver materially better perf (requires bench), (b) is preferable on cost-benefit. **Lower confidence than self-collision** because the perf argument matters more here (LRA is rebuilt on dep changes; self-collision runs every step).

#### 3.1.3 Pressure (per-piece)

**Current status:** CPU has full implementation: `setPiecePressures` (lines 974-1026, ~52L) + `applyPressureForces` (lines 1033-1085+, ~50-80L) + `particlePressure: Float32Array` storage + `triNormalSign: Int8Array` for outward normal flipping. Activation at `xpbdSolver.ts:798` ("Apply internal pressure (inflation) forces"). WASM **not in API**.

**Port cost estimate:** ~120-150 Rust líneas (per-piece config + per-particle pressure storage + per-triangle normal sign + force application math). Complexity factor: **low-medium** — math is straightforward (cross product + force distribution to 3 vertices); per-piece bookkeeping uses vertex offsets/counts (already a pattern in WASM solver via `set_pins` indices).

**Use case:** garment inflation effect — puffer jackets, balloon sleeves, lampshade skirts. **Stylistic UX feature**, niche. Production frequency: low-medium (specific garment styles).

**Decision space:**

##### (a) Port to WASM

**Pros:**
- Smallest of the 3 algorithmic ports (~120-150L vs 200-400 for self-collision and 300-400 for LRA).
- Math is parallelizable (per-triangle force distribution is independent across triangles).
- Self-contained — only depends on `pos`, `triIds`, `invMass` (all already in WASM struct).
- Closes silent-absence gap.

**Cons:**
- UX impact bajo (stylistic feature, not quality-critical).
- The per-piece normal-sign computation (`triNormalSign`) adds bookkeeping that's tied to the rest pose (computed once on init); needs careful invalidation if `restPos` changes.

##### (b) Ratify CPU-only-by-design + UI surface

**Pros:**
- Stylistic feature; users on WASM tier likely don't enable pressure.
- Defer cost; revisit if user demand emerges.

**Cons:**
- Inconsistency with other features if A7 picks (a) elsewhere.
- Silent-absence persists.

##### (c) Defer

Same shape as before.

**Pressure sub-recommendation (preview):**

**Lean: (a) Port to WASM.** Confidence: **medium**.

Reasoning:
- Lowest port cost of the 3 algorithmic gaps.
- Math straightforward, parallelizable.
- Closes silent-absence gap.

**Counter:** UX impact bajo (stylistic), so (b) defensible on cost-benefit if Fase 3 budget is tight. But the cost is low enough that (a) likely wins.

#### 3.1.4 Fold (bending compliance overrides)

**Current status:** CPU has `setFoldConstraints` (lines 1212-1244, ~33L) + `clearFoldConstraints` (lines 1247-1252, ~6L). Mechanism: modifies existing bending constraints' rest length + compliance to encode target crease angle. NOT a separate solve step — overlay on existing bend constraints. WASM **not in API**.

**Port cost estimate:** ~40-50 Rust líneas (lookup map for edge → bending constraint index + per-fold rest length / compliance override + reset mechanism via saved originals). Complexity factor: **low** — modifies arrays already present in WASM struct (`bend_rest_angles`, `bend_compliance` after BUG-1 fix).

**Use case:** target dihedral angles for crisp creases (origami-style folds, structured pleats). **Stylistic UX feature**, niche. Production frequency: low (specific pattern designs).

**Decision space:**

##### (a) Port to WASM

**Pros:**
- Smallest port (~40-50L).
- Trivial mechanism (lookup + array modify).
- Closes silent-absence gap.

**Cons:**
- Stylistic feature; UX impact bajo.

##### (b) Ratify CPU-only-by-design + UI surface

**Pros:**
- Stylistic; users likely don't enable on WASM tier.
- Defer cost.

**Cons:**
- Silent-absence persists.

##### (c) Defer

Same shape.

**Fold sub-recommendation (preview):**

**Lean: (b) Ratify CPU-only-by-design + UI surface.** Confidence: **low-medium**.

Reasoning:
- Stylistic feature with low production frequency.
- Cost-benefit weak even at small port size — most users won't notice the absence.
- (b) is consistent with audit philosophy "minimal-fix when feature impact is bounded" (B5-state precedent).

**Counter:** if A7 closes consistently across features (a)-port-all, fold ports cheaply. If cost budget is generous, (a) is fine. **Lowest-impact feature in the inventory.**

#### 3.1.5 Piece stiffness (per-piece compliance multipliers)

**Current status:** CPU has `applyPieceStiffness` (lines 588-628, ~40L). Mechanism: divides stretch and bend compliance for constraints whose vertices belong to a piece by the per-piece multiplier. Called once after init; modifies arrays in place. WASM **not in API**.

**Port cost estimate:** ~30-50 Rust líneas (vertex-to-piece lookup table + per-constraint compliance scaling + max-stiffness selection across vertex pieces). Complexity factor: **low** — trivial array modify.

**Use case:** per-piece variation in fabric stiffness (e.g., interfaced collar vs main body, structured shoulder vs relaxed sleeve). **Common feature** for realistic garment construction. Production frequency: medium-high.

**Decision space:**

##### (a) Port to WASM

**Pros:**
- Smallest port (~30-50L).
- Trivial implementation (modifies existing compliance arrays).
- Closes silent-absence gap for a common production feature.

**Cons:**
- Need to expose `apply_piece_stiffness` setter from WASM and decide on call timing (after init? after each fabric change?).

##### (b) Ratify CPU-only-by-design + UI surface

**Pros:**
- Defer cost.

**Cons:**
- Common production feature; silent-absence has higher UX impact than fold/pressure.

##### (c) Defer

Same shape.

**Piece stiffness sub-recommendation (preview):**

**Lean: (a) Port to WASM.** Confidence: **medium-high**.

Reasoning:
- Smallest port cost in the inventory (~30-50L, lower than even fold).
- Common production feature (interfaced collar, structured shoulder, etc.).
- Trivial implementation; bounded complexity.

**Counter:** if A7 closes (b)-all to maintain pattern uniformity, this gets ratified. But uniformity for its own sake is weak argument here — port cost is small enough that (a) is the cleaner choice.

#### 3.1.6 Adaptive substeps (architectural difference, NOT port question)

**Current status:** CPU has `adaptiveSubsteps: boolean` config + logic at line 1447 (10-30 substeps based on max velocity). WASM Rust core has no adaptive logic; `wasmSolverWorker.ts:169` hardcodes Rust internal substeps to 1, manages outer substep loop in JS side. JS-side currently uses fixed `substeps: 15` (from `wasmSolverWorker.ts:136`).

**Decision space (NOT (a)/(b)/(c) per Sam directive — this is architectural ratify, not port question):**

##### (b)-architectural — Ratify JS-side substep management as canonical for WASM tier

**Pros:**
- JS-side already has the substep loop machinery (fixed at 15).
- Adapting cadence in JS-side is straightforward (compute max velocity post-step, scale next-step's substep count). Adds ~10-15 lines to `wasmSolverWorker.ts:218-310` step loop.
- Avoids touching Rust core for a JS-side decision (substep count is orchestration, not physics).

**Cons:**
- JS-side max velocity computation requires reading positions + previous positions on every step — already done for NaN guard, so essentially free.
- The "fixed 15" hardcoded value loses adaptive benefit (CPU adapts 10-30); if not addressed, this is silent quality regression.

**Recommendation:** **Adopt (b) with explicit follow-up to add JS-side adaptive cadence to `wasmSolverWorker.ts`.** Confidence: **high** (architectural location is clear, work is small and bounded).

The follow-up work (~10-15 lines in `wasmSolverWorker.ts` to compute max velocity post-step + scale next-step substep count) is in scope of A7 Fase 3 if A7 closes consistently. Out of scope for ports of features 1-5; but in scope for "ratify architectural diffs" track.

#### 3.1.7 Velocity clamp (architectural difference, ALREADY parity)

**Current status:** CPU has `maxVelocity: 5.0` clamp in `postSolve` (lines 1373, 1457). WASM Rust core has no `maxVelocity` clamp; JS-side wrapper applies clamping post-step at `wasmSolverWorker.ts:332` ("Clamp velocity magnitude to prevent explosions. The Rust solver's post_solve has no maxVelocity clamp..."). Effectively parity; just architectural location difference.

**Decision space:**

##### (b)-architectural — Ratify current parity

**Pros:**
- Already parity at the user-observable level; both tiers clamp to 5 m/s by default.
- The location difference is documented inline in `wasmSolverWorker.ts:332`.
- Zero work to ratify; just § 3.5 doc of the architectural choice.

**Cons:**
- The architectural choice is undocumented in any RFC or canonical anchor. § 3.5 closes this gap.

**Recommendation:** **Adopt (b)-architectural ratify. Zero implementation cost.** Confidence: **high**.

#### 3.1.8 Per-feature decision summary table

| Feature | Lean | Confidence | Cost (Fase 3) |
|---|---|---|---|
| **Self-collision** | **(a) Port complete** | medium | ~10-15h (200-400L Rust + tests) |
| **LRA** | **(a) Port to WASM** | medium-low | ~8-12h (300-400L Rust + tests) |
| **Pressure** | **(a) Port to WASM** | medium | ~4-6h (120-150L Rust + tests) |
| **Fold** | **(b) Ratify CPU-only + UI surface** | low-medium | ~1-2h (UI surface + docs) |
| **Piece stiffness** | **(a) Port to WASM** | medium-high | ~2-3h (30-50L Rust + tests) |
| **Adaptive substeps** | **(b)-architectural ratify + JS-side adaptive** | high | ~1-2h (10-15 JS líneas + tests) |
| **Velocity clamp** | **(b)-architectural ratify (already parity)** | high | 0h (docs only) |

**Aggregated outcome (preview, formal en § 4):**

- 4 ports (self-collision, LRA, pressure, piece stiffness) — ~24-36h Fase 3 estimate.
- 1 ratify CPU-only (fold) — ~1-2h.
- 2 architectural ratifications (adaptive substeps + velocity clamp) — ~1-2h combined.
- **Total Fase 3 estimate: ~26-40h** if all 4 ports executed.

**Pattern 2.5 extend mixed shape confirmed:** 4 ports + 1 ratify CPU-only + 2 architectural ratifies + 0 deferrals. Mixed per-feature decisions, no uniform port-all or ratify-all.

**Tercer Pattern 2.5 extend data point** (post-A3, post-C1): if A7 closes in this shape, sub-rule established 2/2 → confirmation redundant 3/3. The aggregate cost (~26-40h) is significantly larger than the previous 2 data points (A3 ~5h, C1 ~6h); but the pattern shape is identical (existing legitimate, gaps in coverage, extract canonical / add coverage without restructuring).

**Calibration note:** the recommendation lean is preview, not commit. Fold + LRA are weakest confidence — Sam's verde or override on those specifically would help. § 3.2 (interface) and § 3.4 (parity testing) decisions in the next commit may further inform per-feature decisions if cost shifts dramatically.

---

---

## 3. Sub-decisiones (parte 2 — § 3.2-3.6)

Per-feature classification (§ 3.1) was load-bearing — its outcome (3 ports + 2 ratify-CPU-only + 2 architectural ratifies, post-LRA override per Sam directive) cascades to the remaining sub-decisions. Each sub-decision below assumes the per-feature outcome of § 3.1.

**Note on LRA override (Sam directive post-3a verde):** § 3.1.2 lean was originally (a) port. Sam override to (b) ratify CPU-only + UI surface adopted. Reasoning consolidated in Sec 4 (recomendación consolidada). The remaining sub-decisions in § 3.2-3.6 reflect the post-override aggregate (3 ports + 2 ratify-with-UI + 2 architectural).

### 3.2 Solver-agnostic interface

**Scope clarification:** A7's § 1.2 explicitly defers worker message protocol unification to **A6 territory**. § 3.2 articulates options for A7's Fase 3 plan — does it include interface refactoring, or stay scope-narrow on per-feature equivalence?

#### Option A — Extract `ClothSolverInterface` as part of A7 Fase 3

**Shape:**

```ts
// Hypothetical (NOT proposed for A7 — preview only)
interface ClothSolverInterface {
  init(meshData: ClothMeshData): Promise<void>;
  setStretch(ids: Uint32Array, restLengths: Float32Array): void;
  setBend(ids: Uint32Array, restAngles: Float32Array): void;
  setSeamsWithCompliance(ids: Uint32Array, target: Float32Array, compliance: Float32Array): void;
  setPins(indices: Uint32Array, positions: Float32Array): void;
  setWind(wx: number, wy: number, wz: number): void;
  step(dt: number): void;
  // Tier-specific (optional):
  setSelfCollisionAdjacency?(offsets: Uint32Array, neighbors: Uint32Array): void;
  setPressures?(offsets: PieceOffset[], pressures: number[]): void;
  applyPieceStiffness?(offsets: PieceOffset[], multipliers: number[]): void;
}
```

Both `ClothWorkerClient` (CPU) and `WasmSolverClient` (WASM) implement this interface. Optional methods (?) marked for tier-specific features.

**Pros:**
- Forces consistent API shape across tiers.
- Type system enforces feature parity for non-optional methods.
- Future tiers (WebGPU/TSL) plug in cleanly.

**Cons:**
- **A6 territory.** Interface design is the A6 RFC's responsibility — A7 binding it pre-empts that scope.
- Optional methods (?) make the interface a leaky abstraction; consumers must check capability anyway.
- Refactor cost: existing call sites in 5+ files need migration to interface-typed handles.
- Significant Fase 3 scope addition (~6-10h beyond per-feature ports).

#### Option B — Status quo (per-call site decision, no interface)

**Shape:** current state. Each consumer (`useSimulationLifecycle`, `ClothMesh`, etc.) picks tier explicitly via `WasmSolverClient` or `ClothWorkerClient` and uses tier-specific API.

**Pros:**
- Zero refactor cost.
- Tier-specific behavior stays explicit at call sites.
- A6 RFC keeps full design space open for future interface decisions.

**Cons:**
- Divergence over time as new methods land.
- Consumers duplicate tier-aware logic.
- Adding a new tier would touch many call sites.

#### Option C — Hybrid: minimal interface for shared methods only

**Shape:** extract interface covering ONLY the methods that exist identically in both tiers (Sites 1-6 from § 2.2 — stretch, bend, seams, wind, pins, friction). Tier-specific methods stay on concrete classes.

**Pros:**
- Captures the parity that already exists.
- Bounded scope (~6 methods in interface).
- Doesn't pre-empt A6.

**Cons:**
- Two-tier API surface (interface + concrete) adds complexity.
- The 3 newly-ported features (self-collision, pressure, piece stiffness) become concrete-class methods, not interface methods — the very features A7 ports gain inconsistent typing.

#### Recommendation per § 3.2

**Lean: Option B (status quo, defer abstraction to A6).** Confidence: **high**.

Reasoning:
- A7 scope is per-feature equivalence, not API design.
- A6 RFC owns interface design; pre-empting it generates re-work risk.
- The new ports (self-collision, pressure, piece stiffness) add 3 concrete methods to `WasmSolverClient` that mirror existing CPU client methods. Once both tiers have the methods, A6 can extract the interface cleanly.
- No call site benefits from an interface today; the abstraction is YAGNI under current scope.

**Counter:** if A6 RFC opens before A7 Fase 3 implementation lands, reconcile — A6 may want A7's per-feature ports to land via a new interface from day 1. Cross-ref dependency noted in § 6.

### 3.3 Feature flag granularity for CPU vs WASM choice

**Scope clarification (per Sam directive Q3 verbatim):** § 3.3 is bounded to **CPU vs WASM binary choice** only. Tier selection across all 4 solvers (CPU/WASM/WebGPU/TSL) is **C4 territory**, NOT A7. A7's § 3.3 decision is direct input to C4 when C4 RFC opens.

#### Option A — Per-feature flags

**Shape:**

```ts
{
  useWasmSolver: true,                  // master flag
  useWasmSelfCollision: false,          // per-feature override
  useWasmLRA: false,                    // n/a for ratify CPU-only
  useWasmPressure: true,
  useWasmFold: false,                   // n/a for ratify CPU-only
  useWasmPieceStiffness: true,
}
```

**Pros:**
- Maximum granularity — user can enable WASM tier for solver speed but force CPU for specific features.
- Useful for testing / debugging — toggle a feature off in WASM without switching tier.

**Cons:**
- High flag count, high configuration complexity.
- Most users won't tune at this granularity; flags become noise.
- Flag explosion as new features land.

#### Option B — Monolithic (`useWasmSolver` master flag, current state)

**Shape:** single `useWasmSolver` boolean. Per-feature differences are silent (current state for non-self-collision features) or warned (current state for self-collision).

**Pros:**
- Simplest configuration.
- Current state — zero migration.

**Cons:**
- Silent feature absence for LRA / fold post-A7 (would persist after ratify CPU-only).
- User can't reason about which features are available on the active tier.

#### Option C — Tier-based with capability surface

**Shape:** master `useWasmSolver` flag + WASM tier exposes `capabilities` object indicating which features it supports:

```ts
// WasmSolverClient
get capabilities() {
  return {
    selfCollision: true,    // post-port
    lra: false,             // ratified CPU-only
    pressure: true,         // post-port
    fold: false,            // ratified CPU-only
    pieceStiffness: true,   // post-port
  };
}
```

UI consumers gate feature toggles based on `capabilities`:

```tsx
{!capabilities.lra && (
  <Warning>LRA requires CPU tier. Enable LRA → switch tier or skip on WASM.</Warning>
)}
```

**Pros:**
- Single flag controls tier; capabilities surface communicates feature availability.
- UI gates user actions intelligently — no silent absence.
- Capabilities object can grow without flag explosion.
- Compatible with future tiers — WebGPU/TSL would expose own capabilities.

**Cons:**
- Adds capability checking at consumer sites (UI mostly).
- Slightly more code than Option B.

#### Recommendation per § 3.3

**Lean: Option C (tier-based with capability surface).** Confidence: **medium-high**.

Reasoning:
- Aligns with the per-feature decisions: 2 features stay CPU-only-by-design (LRA, fold), needing UI surface — capabilities object is the natural carrier.
- Simpler than per-feature flags (Option A) — not flag explosion.
- Better UX than monolithic (Option B) — no silent absence post-A7.
- Forward-compatible with C4 RFC's broader tier orchestration.

**Counter:** if C4 RFC selects a fundamentally different orchestration model (e.g., explicit user tier choice with no capability negotiation), § 3.3 may need to align. Cross-ref noted in § 6 + § 7 reopen trigger.

### 3.4 Parity testing strategy

Three options per Sam directive Q2. Each articulated with honest cost.

#### Option A — Formal parity tests (epsilon tolerance)

**Shape:** test infrastructure that runs CPU and WASM solvers on identical input + asserts output equivalence within epsilon. Requires:

- Deterministic seeds (CPU and WASM use same RNG + same initial conditions).
- Fixture corpus (mesh + constraints + step count + expected output trajectory).
- Epsilon thresholds per feature (cloth simulation has accumulated drift; epsilon must account for non-deterministic floating-point ordering).

**Pros:**
- High confidence in port correctness.
- Catches algorithmic divergence (e.g., WASM solver uses subtly different formula → output diverges past epsilon).
- Future-proof — new features ship with parity tests by default.

**Cons:**
- Significant upfront cost (~5-10h infrastructure: seeds, corpus, threshold tuning).
- Floating-point determinism is hard cross-language (Rust f32 vs JS f32 not bit-equivalent in all operations; SIMD differences matter).
- May generate false positives requiring tuning over time.
- Implementation may justify follow-up sub-track post-A7.

#### Option B — Bench-based perf assertions

**Shape:** extends existing `bench/_lib.ts` infrastructure to run WASM-vs-CPU performance comparisons with threshold gates.

**Pros:**
- Catches perf regressions (e.g., new WASM port slower than expected).
- Uses existing bench infrastructure (~2-4h to extend).

**Cons:**
- Doesn't catch correctness divergence (perf same, output different is possible).
- Limited safety net for ports.

#### Option C — Status quo (integration tests + manual smoke)

**Shape:** existing integration tests cover happy paths; manual smoke verification for edge cases per port. No formal parity infrastructure.

**Pros:**
- Zero infra cost.
- Pragmatic for small port count.

**Cons:**
- Accepts risk of subtle divergence going undetected.
- Manual verification per port — burden on each implementer.
- Integration tests cover happy path, not edge case equivalence.

#### Per-port implication of § 3.4 choice

| Port | If A (formal) | If B (bench) | If C (status quo) |
|---|---|---|---|
| Self-collision | Parity test asserts collision response output equivalence | Bench measures collision pair detection rate | Manual smoke: sleeve folding test |
| Pressure | Parity test asserts inflation force per particle | Bench measures force application speed | Manual smoke: puffer jacket inflation test |
| Piece stiffness | Parity test asserts compliance scaling output | Bench measures multiplier application | Manual smoke: interfaced collar stiffness test |

#### Recommendation per § 3.4

**Lean: Option C (status quo, integration tests + manual smoke per port).** Confidence: **medium**.

Reasoning:
- 3 ports is small enough that manual smoke per port is tractable.
- Existing integration tests (Mannequin, GarmentSimulation) cover the happy paths.
- Formal parity infrastructure (Option A) requires ~5-10h before any port lands; cost-benefit weak for 3 ports.
- If Fase 3 decoupling is selected (§ 3.6 Option B per Sam recommendation), each port follow-up issue can include manual smoke checklist.

**Counter:**
- Self-collision is the most complex port; an Option A subset for self-collision specifically might be justified. Sam pre-decision: "probable (c) o hybrid (a-for-self-collision, c-for-others)". Hybrid is defensible.
- If a port lands and a subtle divergence emerges in production, reopen § 3.4 with concrete repro and consider Option A retroactive.

**Hybrid sub-option** (consistent with Sam pre-decision): Option A for self-collision specifically (highest port complexity); Option C for the other 2 ports (pressure, piece stiffness — straightforward math). The infrastructure cost (~5-10h) lands once with self-collision port; subsequent ports can opt in if desired.

**Lean updated:** **Option C primary, with hybrid (A-for-self-collision) optional if Fase 3 budget permits.** Confidence: medium.

### 3.5 Documentation strategy

3-layer ratify-by-default per audit pattern (consistent with C1, B6-state, B3-state, B10-state Par 1, etc.).

#### Layer 1 — JSDoc on new WASM solver methods

For each newly-ported feature, JSDoc on:
- New TS-side wrapper methods on `WasmSolverClient` (e.g., `setSelfCollisionAdjacency`, `setPressures`, `applyPieceStiffness`).
- New worker message types in `wasmSolverClient.ts` ↔ `wasmSolverWorker.ts` protocol.
- Rust-side `pub fn` rustdoc covering parameter contract + algorithmic notes.

JSDoc explains:
- What the method does (mirror of CPU equivalent).
- When to call (init-time vs per-step).
- Capability surface integration (per § 3.3 Option C).

#### Layer 2 — CLAUDE.md "CPU vs WASM solver capabilities" section

New section in CLAUDE.md following the precedent of "Three.js disposable lifecycle (C1 ratified)", "Persistence policy (B6-state ratified)", etc.

Content:
- Cross-ref to A7 RFC.
- Capability table (canonical inventory of which features are on which tier).
- Decision rule for new physics features (default: port if cost ≤ ~6h, ratify CPU-only if cost > ~10h or UX impact bajo).
- Reopen triggers.

#### Layer 3 — UI surface for ratified-CPU-only features

For LRA and fold (ratified CPU-only per § 3.1):
- Capability indicator in render settings panel (or wherever tier choice is exposed).
- Warning when user enables an unsupported feature on WASM tier (e.g., "LRA enabled but active tier is WASM. LRA will not apply. Switch tier or disable LRA.").
- Optional auto-tier-switch with explicit user confirmation.

The exact UI shape is left to the implementer; A7 ratifies that a surface exists, not its visual design.

#### Recommendation per § 3.5

**Lean: 3-layer ratify-by-default (JSDoc + CLAUDE.md + UI surface).** Confidence: **high**.

Reasoning:
- Audit precedent — 22 ratifications use 3-layer doc strategy.
- UI surface (Layer 3) is the new addition specific to A7 — closes the silent-absence gap for the 2 ratify-CPU-only features.
- Layer 3 deferred to follow-up issue if Fase 3 decoupled (§ 3.6 Option B).

### 3.6 Roadmap implications + bundled vs decoupled Fase 3

**Sub-question raised by Sam directive:** does A7 Fase 3 include ports inline, or ratify policy + defer ports to follow-up sub-tracks?

#### Option A — Bundled Fase 3 (single PR)

**Shape:** A7 Fase 3 implements all 3 ports + 2 UI surfaces + 2 architectural ratifies + docs in one PR.

**Pros:**
- A7 ships meaningful WASM extension — 3 features actually ported.
- Single review cycle for the whole policy + implementation.
- No risk of ports stalling in queue post-merge.

**Cons:**
- ~20-30h commit en un solo PR. Long review cycle.
- Risk of regressions across ports (one port introduces issue that other ports inherit).
- Bundling distinct concerns (3 unrelated ports + 2 UI surfaces + docs) in single atomic commit unit.

#### Option B — Decoupled Fase 3 (minimal A7 closure + per-feature follow-up issues)

**Shape:** A7 Fase 3 implements:
- CLAUDE.md "CPU vs WASM solver capabilities" section.
- UI surface for ratified-CPU-only features (LRA + fold).
- Capability surface skeleton (`capabilities: { ... }` on `WasmSolverClient` with all flags initially false except those already in parity).
- Architectural ratifies (adaptive substeps + velocity clamp docs).

Per-feature ports go to follow-up issues (severity:medium):
- `#XXX self-collision port (12-18h)`
- `#YYY pressure port (4-6h)`
- `#ZZZ piece-stiffness port (2-3h)`
- `#WWW LRA UI surface implementation (1-2h, may bundle with fold)`
- `#VVV fold UI surface implementation (1-2h, may bundle with LRA)`

Each port issue closes its capability flag (`capabilities.selfCollision = true` etc.) when the port lands.

**Pros:**
- A7 closes fast (~3-5h Fase 3 minimal). Pace consistent with audit (RFC closes ~7-8h doc + minimal Fase 3).
- Each port is a focused PR with its own review.
- Risk distributed — port issue per feature.
- Pace consistency with audit (similar to B6-state Fase 2 ratify + Fase 3 deferred to follow-ups #654-656).
- Atomicity per feature — each port is a clean atomic commit.

**Cons:**
- Ports may stall in queue post-A7 closure.
- Audit closure shape: policy ratified, features queued — less satisfying than "shipped 3 features".
- Capability flags initially false for unported features → user-visible feature gap until ports land.

#### Per Sam directive recommendation (verbatim)

> Mi recomendación: decouple. Razones:
> 1. Audit philosophy "atomicity por commit": un solo commit bundleando self-collision + pressure + piece stiffness ports bundles distinct concerns.
> 2. Risk management: Rust port issues (borrow checker, WASM memory layout) son discoverable per-feature.
> 3. Pace consistency: A7 (RFC) cierra con ~7-8h doc + 3-5h Fase 3 minimal — consistente con bloque (c) pace.
> 4. Precedent B6-state: similar shape (policy + per-feature follow-ups).

#### Recommendation per § 3.6

**Lean: Option B (decoupled Fase 3) per Sam directive.** Confidence: **high**.

Reasoning (consolidated from Sam directive + audit precedent):
- B6-state precedent: policy ratified + per-feature follow-up issues (#654-656).
- Atomicity per commit / per feature.
- Risk distribution (per-feature port issues discoverable in isolation).
- Audit pace consistency (RFC closes within ~10-13h total Fase 2 + minimal Fase 3).

**Counter (articulated honest):** Option A (bundled) is defensible if the team wants A7 to ship features visibly in main vs queue them in follow-up issues. The ports are independent enough that bundling doesn't cross-contaminate; the ~20-30h aggregate is large but bounded. If Sam's preference reverses to (A), this section adjusts.

### 3.7 Sub-decisions integration preview

Aggregate post-3.1 (LRA override) + 3.2-3.6:

| Sub-decision | Lean | Confidence |
|---|---|---|
| 3.1 Per-feature classification | 3 ports + 2 ratify-CPU-only-with-UI + 2 architectural | varies per feature |
| 3.2 Solver-agnostic interface | (B) status quo, defer to A6 | high |
| 3.3 Feature flag granularity (CPU-vs-WASM) | (C) tier-based with capability surface | medium-high |
| 3.4 Parity testing strategy | (C) status quo, optional hybrid (A-for-self-collision) | medium |
| 3.5 Documentation strategy | 3-layer (JSDoc + CLAUDE.md + UI surface) | high |
| 3.6 Roadmap (bundled vs decoupled) | (B) decoupled per Sam directive | high |

**Aggregate Fase 3 estimate (decoupled, per § 3.6 Option B):**

- A7 closure Fase 3: ~3-5h (CLAUDE.md section + UI surface for LRA + fold + capability skeleton + architectural docs).
- Per-feature ports queued as follow-up issues:
  - Self-collision: ~12-18h (with buffer per Sam directive).
  - Pressure: ~4-6h.
  - Piece stiffness: ~2-3h.
- **Distributed total: ~18-27h ports** + ~3-5h A7 closure = ~21-32h aggregate.

**vs bundled (§ 3.6 Option A):** ~20-30h all-in single PR.

The aggregate is similar; the difference is timing distribution and risk shape.

---

## Sec 4+ pendiente

Sec 4 (recomendación consolidada per-feature + integration con 3.2-3.6 + LRA override consolidation), Sec 5 (Migration plan multi-step — decoupled per § 3.6 Option B with self-collision buffer 12-18h), Sec 6 (Cross-references), Sec 7 (Reopen triggers), Sec 8 (Deuda técnica explícita), Sec 9 (Pregunta a Sam + estado + calibración) — commits subsiguientes.
