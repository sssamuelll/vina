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

---

## 4. Recomendación consolidada

### 4.1 Per-feature consolidated decisions (final tabla)

Final per-feature decisions post-§ 3.1 + LRA override per Sam directive:

| Feature | Final lean | Confidence | Cost (Fase 3 follow-up) |
|---|---|---|---|
| **Self-collision** | **(a) Port complete to Rust** | medium | ~12-18h (con buffer per Sam Q4) |
| **LRA** | **(b) Ratify CPU-only + UI surface** ← Sam override from (a) | medium | ~1-2h UI surface |
| **Pressure** | **(a) Port to WASM** | medium | ~4-6h |
| **Fold** | **(b) Ratify CPU-only + UI surface** | low-medium | ~1-2h UI surface |
| **Piece stiffness** | **(a) Port to WASM** | medium-high | ~2-3h |
| **Adaptive substeps** | **(b)-architectural ratify + JS-side adaptive cadence** | high | ~1-2h |
| **Velocity clamp** | **(b)-architectural ratify (already parity)** | high | 0h (docs only) |

**Aggregate post-LRA-override:**
- 3 ports (self-collision, pressure, piece stiffness): ~18-27h.
- 2 ratify-CPU-only-with-UI-surface (LRA, fold): ~2-4h combined.
- 2 architectural ratifies (adaptive substeps + JS-side adaptive, velocity clamp parity): ~1-2h combined.
- **Total Fase 3 distributed: ~21-33h aggregate.**
- **A7 closure Fase 3 proper: ~3-5h** (per § 3.6 Option B decoupled).

### 4.2 Sub-decisions integration

The 6 sub-decisiones cascadan coherentemente sobre 3.1:

```
§ 3.1 (per-feature) → 3 ports + 2 ratify-CPU-only + 2 architectural
        ↓
§ 3.2 (interface)  → status quo + defer to A6
        │           Reasoning: new ports add concrete methods to
        │                      WasmSolverClient mirroring CPU client;
        │                      A6 extracts cleanly post-A7.
        ↓
§ 3.3 (flag granularity) → tier-based with capability surface
        │           Reasoning: 2 ratify-CPU-only features need UI
        │                      surface; capabilities object natural
        │                      carrier; forward-compatible with C4.
        ↓
§ 3.4 (parity testing)   → status quo + optional (A) for self-collision
        │           Reasoning: 3 ports tractable manually; formal
        │                      parity infra cost-benefit weak; self-
        │                      collision complexity may justify (A)
        │                      hybrid for that one port.
        ↓
§ 3.5 (documentation)    → 3-layer (JSDoc + CLAUDE.md + UI surface)
        │           Reasoning: audit precedent (22 ratifications);
        │                      UI surface specific to A7 closes
        │                      silent-absence gap for ratify-CPU-only.
        ↓
§ 3.6 (roadmap F3)       → decoupled per Sam directive (B6-state precedent)
                    Reasoning: atomicity per commit + risk distribution
                               + pace consistency + B6-state precedent.
```

**Cross-eje boundaries enforced:**
- § 3.2 defers interface design → **A6 territory** (worker message protocol asimétrico).
- § 3.3 bounded a CPU-vs-WASM only → tier selection 4-way is **C4 territory**.
- § 3.4 hybrid (A-for-self-collision) ratifies that formal parity infra lands ONCE with the highest-complexity port; subsequent ports opt in.

### 4.3 LRA override consolidation (Sam directive verbatim)

§ 3.1.2 original lean was (a) port to WASM with confidence medium-low. Sam directive override to (b) ratify CPU-only + UI surface. Reasoning verbatim from Sam directive 2026-05-01:

> Tus razones para (b):
> - CPU LRA ya 8.1× fast post-PR-589.
> - 0 WASM-vs-CPU bench data — port duplicates optimized algorithm sin clear performance unlock.
> - Port cost ~8-12h es el segundo más grande del list, detrás de self-collision.
>
> Razones adicionales para (b):
> - UX surface cleaner que silent absence: "LRA requires CPU tier" warning cuando user enable LRA con WASM tier active.
> - C4 territory hereda input limpio cuando handle tier selection 4-way.
> - Cost reduction: ~18-28h aggregate vs ~26-40h.
>
> Implementación de UI surface para LRA ratify:
> - LRA enable toggle warning si WASM tier active.
> - Auto-switch to CPU tier (transparent) si feature gates tier.
> - O explicit user choice "use CPU tier for LRA" vs "skip LRA on WASM".
>
> NO es C4 (tier selection 4-way) — es feature-gates-tier (binary WASM has it / WASM doesn't) que A7 puede decide solo.

**Override accepted.** Final lean for LRA: **(b) ratify CPU-only + UI surface.**

The original lean (a) was medium-low confidence — the lowest of the inventory — driven by the cost-benefit ratio (~8-12h port for marginal perf gain over already-fast CPU LRA). Sam's override pushes the calibration honest into the decision, replacing silent absence with explicit UX surface.

**Aggregate cost reduction confirmed:** ~18-27h ports vs ~26-36h pre-override. ~30% reduction.

### 4.4 Confidence calibration overall

Per-feature confidence distribution post-override:

| Confidence | Count | Features |
|---|---|---|
| **High** | 2 | Adaptive substeps, Velocity clamp |
| **Medium-high** | 1 | Piece stiffness |
| **Medium** | 3 | Self-collision, LRA, Pressure |
| **Low-medium** | 1 | Fold |

**Overall A7 confidence: medium-high.** No feature is at "low confidence" — every decision has explicit reasoning + counter-arguments respected.

Per-sub-decision confidence:

| Sub-decision | Confidence |
|---|---|
| 3.1 (per-feature) | varies (high to low-medium per feature) |
| 3.2 (interface) | high |
| 3.3 (flag granularity) | medium-high |
| 3.4 (parity testing) | medium |
| 3.5 (docs) | high |
| 3.6 (roadmap decoupled) | high |

**Counter respected:** if Fase 3 budget is generous and the team prefers bundled (Option A) for visibility of A7 closure shipping features, override is defensible. If LRA override should reverse to (a) port post-bench-data, reopen § 3.1.2.

### 4.5 What changes for callers

Per-feature implication for downstream consumers:

#### Self-collision (post-port follow-up)
- `WasmSolverClient` gains `setSelfCollisionAdjacency(offsets, neighbors)` method.
- `wasmSolverWorker.ts:159-165` warning removed; `selfCollision: true` flag becomes effective.
- BUG-5 #608 closes via the port follow-up issue.
- `capabilities.selfCollision = true` post-port.

#### LRA (ratify CPU-only + UI surface)
- `WasmSolverClient` does NOT gain `setLRA` method.
- `capabilities.lra = false` permanently for WASM tier.
- UI surface: warning when LRA enabled + WASM active. Optional auto-tier-switch.

#### Pressure (post-port follow-up)
- `WasmSolverClient` gains `setPiecePressures(offsets, pressures)` method.
- `capabilities.pressure = true` post-port.

#### Fold (ratify CPU-only + UI surface)
- `WasmSolverClient` does NOT gain `setFoldConstraints` method.
- `capabilities.fold = false` permanently for WASM tier.
- UI surface: warning when fold enabled + WASM active.

#### Piece stiffness (post-port follow-up)
- `WasmSolverClient` gains `applyPieceStiffness(offsets, multipliers)` method.
- `capabilities.pieceStiffness = true` post-port.

#### Adaptive substeps (architectural ratify + JS-side adaptive)
- `wasmSolverWorker.ts` gains JS-side adaptive cadence logic (~10-15 lines): post-step max velocity computation + scale next-step substep count (10-30 range matching CPU).
- No Rust-side change.
- WASM tier matches CPU adaptive substep behavior.

#### Velocity clamp (architectural ratify, already parity)
- No code changes.
- JSDoc + CLAUDE.md anchors the architectural location difference.

### 4.6 Decision rationale summary

A7 RFC ratifies a **mixed per-feature equivalence policy** for the WASM cloth solver:

1. **Port high-impact UX features** where cost is bounded and impact is clear (self-collision, pressure, piece stiffness).
2. **Ratify CPU-only-by-design + UI surface** for features where port cost-benefit is weak (LRA — already optimized in CPU; fold — stylistic UX bajo).
3. **Architectural ratifies** for features where the divergence is location, not behavior (adaptive substeps, velocity clamp).
4. **Decoupled Fase 3** ratifies policy in A7 closure; ports queued as per-feature follow-up issues for incremental delivery + risk distribution.
5. **No interface refactoring** in A7 — A6 RFC owns that decision.
6. **Capability surface** as the canonical UX mechanism for tier-aware features; forward-compatible with C4.

**Pattern 2.5 extend mixed shape confirmed** as audit hypothesis. **Tercer data point** post-A3, post-C1: sub-rule established 2/2 → confirmation redundante 3/3 if A7 closes in this shape. § 9.4 expands.

---

## 5. Migration plan multi-step (decoupled per § 3.6 Option B)

### 5.1 Branch + PR

This RFC's branch (`drift/a7-wasm-cpu-equivalence`) lands the **A7 closure proper** (policy ratification + UI surface + capability skeleton + architectural docs). Per-feature ports go to **separate branches** as follow-up issues land.

### 5.2 A7 closure Fase 3 commit sequence (atomic per audit rules)

**Commit 1 — CLAUDE.md "WASM vs CPU solver capabilities (A7 ratified)" section.**

Files:
- `CLAUDE.md` — new section.

Estimated size: ~80-120 líneas (matching precedent of "Three.js disposable lifecycle (C1 ratified)" ~75 líneas + "Persistence policy (B6-state ratified)" ~60 líneas).

Content:
- Cross-ref to A7 RFC.
- Canonical capability table (per-feature CPU vs WASM status).
- Decision rule for new physics features (default: port if cost ≤ ~6h, ratify CPU-only if cost > ~10h or UX impact bajo).
- Reopen triggers (per § 7).
- Cross-ref to A6, C4 explicit handoffs.

**Commit 2 — UI surface for ratified-CPU-only features (LRA + fold).**

Files (estimated, may evolve during implementation):
- `src/components/Viewport3D/RenderSettingsPanel.tsx` (or wherever LRA/fold toggles live).
- New UI component for capability warning (e.g., `src/components/Viewport3D/TierCapabilityWarning.tsx`).

Estimated size: ~50-100 líneas TS.

Content:
- Warning when user enables LRA + active tier is WASM (or fold + WASM).
- Two UX options for resolution (decision deferred to implementer — both are valid):
  - (a) Modal asking "Switch to CPU tier?" with explicit confirmation.
  - (b) Inline indicator + manual tier-switch button.

**Commit 3 — Capability surface skeleton.**

Files:
- `src/utils/cloth/wasm/wasmSolverClient.ts` — add `capabilities` getter.
- `src/utils/cloth/clothWorkerClient.ts` — add `capabilities` getter (CPU has all features → all true).

Estimated size: ~40-80 líneas TS.

Content:
```ts
// WasmSolverClient.ts (added):
get capabilities(): SolverCapabilities {
  return {
    selfCollision: false,    // updated to true post-port
    lra: false,              // permanently false (ratified CPU-only)
    pressure: false,         // updated to true post-port
    fold: false,             // permanently false (ratified CPU-only)
    pieceStiffness: false,   // updated to true post-port
  };
}

// ClothWorkerClient.ts (added):
get capabilities(): SolverCapabilities {
  return {
    selfCollision: true,
    lra: true,
    pressure: true,
    fold: true,
    pieceStiffness: true,
  };
}
```

`SolverCapabilities` type definition lives in a shared module (e.g., `src/utils/cloth/types.ts` or new `solverCapabilities.ts`).

**Commit 4 — Architectural docs (JSDoc on existing methods).**

Files:
- `src/utils/cloth/xpbdSolver.ts` — JSDoc on `adaptiveSubsteps` config + `maxVelocity` clamp explaining tier-architectural decision.
- `src/utils/cloth/wasm/wasmSolverWorker.ts` — JSDoc on substep loop + velocity clamp explaining JS-side equivalent.
- `crates/xpbd-wasm/src/lib.rs` — rustdoc on `step()` explaining hardcoded internal substeps=1 + rationale.

Estimated size: ~30-50 líneas docs (no code changes, only doc strings).

**Total A7 closure Fase 3: ~3-5h.**

### 5.3 Per-feature follow-up issues (ports queued)

Per § 3.6 Option B (decoupled), each port lands as separate PR after A7 merge. Issues opened with severity labels mirror cluster precedent.

#### #XXX Self-collision port (severity:medium)

**Body template:**

```
## Context

A7 RFC closure (PR #675, merged 2026-05-XX) ratified Opción (a) Port complete algorithm to Rust for self-collision (per § 3.1.1).

Cross-ref:
- docs/reports/2026-05-01-rfc-a7-wasm-cpu-equivalence.md § 3.1.1
- BUG-5 #608 (closes when this lands)

## Scope

Port `solveSelfCollision` (CPU TS implementation in `src/utils/cloth/selfCollision.ts`) to Rust crate `crates/xpbd-wasm/src/lib.rs`.

Algorithm: SpatialHashGrid (build per-step) + collision detection per particle pair + collision response (position correction with thickness margin) + neighbor skipping via adjacency.

## Estimated effort

12-18h with buffer (per Sam directive Q4).

Breakdown estimate:
- SpatialHashGrid Rust impl: ~80-120L (~3-4h con tests).
- Triangle collision Rust impl: ~80-150L (~3-5h).
- Adjacency consumer en solver: ~20-50L (~1-2h).
- Worker hookup + set_adjacency call: ~10-20L (~30min).
- Parity testing (optional § 3.4 hybrid (A) for self-collision) + integration: ~30-50L (~2-3h).

Buffer: +3-5h if Rust borrow checker or WASM memory layout issues emerge.

## Acceptance criteria

- [ ] `solve_self_collision` function implemented in Rust crate.
- [ ] `set_adjacency` setter wired up from `wasmSolverWorker.ts`.
- [ ] `selfCollision: true` config flag becomes effective on WASM tier.
- [ ] Existing CPU self-collision tests pass for both tiers (manual smoke or formal parity per § 3.4 decision).
- [ ] `wasmSolverWorker.ts:159-165` warning removed.
- [ ] `WasmSolverClient.capabilities.selfCollision = true`.
- [ ] BUG-5 #608 closes.

## Acceptance gates

- `npx tsc -b --noEmit && npm run test && npm run lint` clean.
- WASM rebuild verified (`pkg/xpbd_wasm.js + .wasm` synced to `public/wasm/`).
- Manual smoke test: cloth folding test passes.
```

#### #YYY Pressure port (severity:medium)

Similar shape, lighter scope (~4-6h). Body cites § 3.1.3.

#### #ZZZ Piece-stiffness port (severity:low)

Cheap port (~2-3h). Body cites § 3.1.5.

#### #WWW LRA UI surface implementation (severity:low)

If commit 2 (Fase 3 closure) doesn't fully implement, follow-up issue. Body cites § 3.1.2 + § 3.3.

#### #VVV Fold UI surface implementation (severity:low)

Same shape as LRA UI. May bundle with LRA in single PR.

#### #UUU Capability surface full implementation (severity:medium)

If commit 3 skeleton is partial, follow-up for full implementation. May depend on C4 framing.

### 5.4 Verification

**A7 closure (commits 1-4):**
- `npx tsc -b --noEmit` clean per commit.
- `npm run test` clean per commit (no functional changes; docs + UI + skeleton only).
- `npm run lint` clean per commit.

**Per-feature ports (separate branches/PRs):**
- Same gates as A7 closure plus WASM rebuild verification.
- Manual smoke test per feature (§ 3.4 status quo).
- Optional formal parity test for self-collision specifically (§ 3.4 hybrid (A)).

### 5.5 Rollback plan

Each A7 closure commit (1-4) is mechanically reversible. Per-feature port commits (in follow-up branches) are independent — rollback of one port doesn't affect others.

---

## 6. Cross-references

### 6.1 Input docs cited in this RFC

- `docs/reports/2026-04-28-drift-inventory-fase1.md` § A7 — original entry (6 divergencias).
- `docs/reports/2026-04-29-drift-inventory-addendum.md` § 7 — confirms BUG-5 absorbed, scope context.
- `docs/reports/2026-04-28-drift-fase2-classification.md` — places A7 in (c) RFC bucket.

### 6.2 Adjacent eje precedents

- **A3 closure (PR #672, merged 2026-05-01)** — Pattern 2.5 extend variant first data point. A7 leverages 4 patterns:
  - `console_error_panic_hook` adopted (preventive insurance).
  - Result-pattern convention forward-only (for new fallible exports).
  - NaN guards en WASM→JS boundary (covers new physics features).
  - Silent fallback UI surface pattern (extends to capability surface in A7).
- **C1 closure (PR #673, merged 2026-05-01)** — Pattern 2.5 extend variant second data point. Sub-rule established 2/2. A7 may add 3rd data point.
- **B6-state ratification** — precedent for "policy ratified + per-feature follow-ups" (cited in § 3.6 Option B reasoning).
- **D7 ratification** — precedent for "ortogonal lifecycles → ratify separados" (LRA + fold ratify CPU-only follows similar shape).

### 6.3 Cross-eje boundaries (explicit handoffs)

- **A6 RFC** (worker message protocol asimétrico) — A7's § 3.2 defers interface design here. A7's per-feature port methods (setSelfCollisionAdjacency, setPiecePressures, applyPieceStiffness) become candidate methods for A6's interface extraction.
- **C4 RFC** (TSL/WebGPU/WASM/CPU coexistence) — A7's § 3.3 capability surface is direct input. C4 may extend tier-based capabilities to all 4 tiers.
- **A2 RFC** (cross-boundary serialization `ClothSimConfig`) — A7's port follow-ups may add new fields to shared config (e.g., `pressureEnabled`, `pieceStiffnessMultipliers`). A2 designs canonical shape.
- **A4 RFC** (Geometry/mesh ops Rust↔TS) — A7's self-collision port may need spatial hash data structure. Design choice (separate Rust crate vs inline in xpbd-wasm) is partially A4 territory.

### 6.4 BUG-5 #608 closure path

BUG-5 #608 is **OPEN** at A7 closure time. A7 ratifies the **port path** for self-collision (§ 3.1.1 Option (a)). Issue closes when the self-collision port follow-up issue lands (#XXX).

A7 closure does NOT close BUG-5; the port implementation does. A7 establishes the canonical resolution path and queues the implementation work.

### 6.5 Methodology rules applied

- **Regla 1 v2** (read contents) — applied to xpbdSolver.ts and lib.rs to verify per-feature implementation status.
- **Regla 1 v3** (verify divergence + look outside obvious directory) — confirmed bench/ has CPU-only data + 0 WASM-vs-CPU comparison.
- **Inventory drift overestimation pattern** (meta-anchor) — original A7 inventory said "6 divergencias"; refined to 5 real gaps + 2 architectural diffs (2 of original 6 were closed by bug fixes pre-A7).
- **Pattern 2.5 hybrid variants extend** — A7 fits the variant: pattern existing legitimate (CPU+WASM coexistence), gaps en cobertura (5 features), extraction de canonical (capability surface + UI) without restructuring.
- **Process discipline (stop → notify → wait → execute)** — applied at sweep extension + Sec 3a/3b split + LRA override.

---

## 7. Reopen triggers

A7 reopens if any of:

### Per-feature triggers

1. **Self-collision port stalls** — if the follow-up issue stays open >3 months without progress, reevaluate (a) Port vs (d) Ratify CPU-only.
2. **LRA UX impact reported** — if users on WASM tier hit confusion from LRA absence, evaluate override back to (a) port.
3. **Pressure port reveals subtle divergence** — if integration tests catch CPU vs WASM output mismatch post-port, reopen § 3.4 with (A) formal parity tests.
4. **Fold UX impact reported** — same as LRA. Currently low priority (UX impact bajo by audit hypothesis).
5. **Piece stiffness port simpler than estimated** — if cost <2h, document calibration learning.
6. **Adaptive substeps JS-side adaptive logic generates regressions** — reopen § 3.1.6 to evaluate Rust-side port.

### Per-sub-decision triggers

7. **A6 RFC opens** — reconcile § 3.2 (interface deferral) with A6's design. If A6 wants A7's per-feature ports to land via interface from day 1, sequence A6 first.
8. **C4 RFC opens** — reconcile § 3.3 (capability surface) with C4's tier orchestration. If C4 selects different model, adapt § 3.3.
9. **Formal parity testing infrastructure built (per § 3.4 (A) hybrid)** — document the infrastructure as canonical follow-up.
10. **Capability surface generates false positives or missed cases** — reopen § 3.3.

### Methodology triggers

11. **Pattern 2.5 extend variant fourth data point** (post-A3, C1, A7) — if shape consistent, sub-rule promoted to "robust pattern" in CLAUDE.md (per Sam directive).
12. **A7 Fase 3 decoupled (B) shows ports stalling** — reopen § 3.6 to evaluate bundled (A) for remaining ports.

---

## 8. Deuda técnica explícita post-unify

### 8.1 Self-collision Rust scaffolding incomplete (until port follow-up lands)

`crates/xpbd-wasm/src/lib.rs:33-34` defines `self_collision: bool` field + lines 205-209 define `set_adjacency` setter, but no `solve_self_collision` function. Until the port follow-up issue lands, this scaffolding is **dead code**. Acceptable as deuda técnica because:
- Removing scaffolding now would require re-adding it post-port (negative work).
- Scaffolding serves as a marker for the planned port path.

**When to address:** when self-collision port follow-up lands (closes BUG-5 #608).

### 8.2 LRA + fold permanent silent absence on WASM tier (pre-UI-surface)

Until A7 closure commit 2 (UI surface) lands, LRA and fold remain silently absent on WASM tier. `wasmSolverWorker.ts:159-165` warning exists for self-collision only — LRA and fold have no warning today.

**When to address:** A7 closure commit 2 (Fase 3 minimal). Mitigation built into A7 closure scope.

### 8.3 Capability surface skeleton ≠ full implementation

A7 closure commit 3 lands a **skeleton** capability surface (`get capabilities()` returning hardcoded values per current state). Full implementation (e.g., dynamic capability negotiation, capability-aware tier auto-switch logic) deferred to follow-up issue per § 3.6.

**When to address:** capability surface full implementation issue (severity:medium, body cites § 3.3 + C4 framing).

### 8.4 Site 7 (`ClothMesh.tsx:391`) ref-store anti-pattern (cross-eje deuda from C1)

C1 RFC § 8.1 documented the `geometryRef.current = geo` inside useMemo anti-pattern in `ClothMesh.tsx:391` as deferred deuda técnica (orthogonal to C1 scope). A7 does NOT address this; it remains deferred.

**When to address:** if Site 7 generates a real bug (race condition between useMemo and per-frame mutation), reopen via C1 § 7 reopen trigger #4.

### 8.5 No WASM-vs-CPU bench data exists

Per § 2.5, all bench files measure CPU TS implementations only. A7 ratifies decisions without WASM-vs-CPU performance data:
- Self-collision port presumed faster on WASM (unverified).
- LRA ratify CPU-only presumes WASM port wouldn't deliver materially better perf (unverified, but defensible given CPU is already 8.1× post-PR-589).

**When to address:** if any port's perf gain is suspected insufficient post-implementation, add WASM-vs-CPU benchmark to existing `bench/_lib.ts` infrastructure as opportunistic follow-up.

### 8.6 Lint rule for new physics features following A7 convention

Custom eslint rule that warns when a new method is added to `xpbdSolver.ts` that:
- Doesn't have a parallel method in `lib.rs` (port path), OR
- Doesn't have a `capabilities.X = false` declaration (ratify CPU-only path).

Bundles with existing lint-rule cluster (#659 @cascade, #662 fabric write, #664 selectXById, #674 useDisposable). Follow-up issue at A7 merge.

**When to address:** post-merge cleanup commit (similar to C1 #674 lint rule follow-up).

---

## 9. Pregunta a Sam + estado + calibración

### 9.1 Pregunta para verde de Fase 3

**¿Verde para A7 closure Fase 3 (4 commits decoupled per § 3.6 Option B)?**

Posibles respuestas:
- **A (verde directo):** procedo con commits 1-4 (CLAUDE.md section + UI surface + capability skeleton + architectural docs). Per-feature ports queue como follow-up issues (severity:medium per § 5.3 templates).
- **B (override LRA):** revierto LRA override post-Sec-4 articulation y procedo con (a) port para LRA. Sec 5 ajusta scope (LRA port follow-up issue añade ~8-12h, total aggregate ~26-39h).
- **C (override fold):** Sec 4 ajusta a (a) port para fold uniformity. Sec 5 ajusta (LRA UI surface deferred / fold port queued).
- **D (override Fase 3 to bundled):** A7 Fase 3 bundles all ports + UI + docs en single PR (~20-30h). Sec 5 reescribe.
- **E (más discusión):** specific Sec 4 aspect needs refinement.

### 9.2 Estado del eje

- **Sec 1+2+3a+3b+4-9:** complete.
- **Doc total:** ~1300-1400 líneas (within Sam estimate 1000-1600, mid-range due to per-feature articulation × 7 features × per-option detail).
- **Branch:** `drift/a7-wasm-cpu-equivalence`.
- **PR:** #675 (currently draft; ready-for-review post-this-commit-merge).
- **Awaiting:** Sam verde para A7 Fase 3 minimal (3-5h).

### 9.3 Calibración estimate vs actual

**Sam pre-redacción estimate:** ~7-8h Fase 2 (per-sweep). Probably the most complex RFC of bloque (c).

**Actual Fase 2 (this RFC):**
- Sweep extension: ~1h (feature parity table empirical verification + BUG-5 issue check + bench review + canonical infrastructure search).
- Sec 1-2: ~1h (scope + inventory + landscape + table).
- Sec 3a (per-feature classification): ~2h (7 features × 5 fields each + 4 self-collision sub-options).
- Sec 3b (5 sub-decisiones): ~2h.
- Sec 4-9: ~2h.
- **Total Fase 2: ~8h.** Mid-range of estimate. Factor ~1.0x of nominal.

**Estimated A7 closure Fase 3 (decoupled per § 3.6):**
- Commit 1 (CLAUDE.md): ~1h.
- Commit 2 (UI surface LRA + fold): ~1.5h.
- Commit 3 (capability skeleton): ~1h.
- Commit 4 (architectural docs): ~0.5h.
- **Total A7 closure: ~3-5h.** Mid-range of decoupled estimate.

**Per-feature port follow-ups (queued):**
- Self-collision: ~12-18h (with buffer per Sam Q4).
- Pressure: ~4-6h.
- Piece stiffness: ~2-3h.
- LRA + fold UI surface: ~1-2h (may bundle with closure commit 2).
- **Total distributed ports: ~18-27h.**

**Aggregate (closure + ports):** ~21-32h.

### 9.4 Pattern 2.5 extend variant data point analysis (3rd)

A7 reifies the same shape as A3 (cross-boundary error handling) and C1 (Three.js buffer lifecycle) for the **third time**:

- **Pattern existing legitimate** (CPU+WASM coexistence with feature parity post-bugs).
- **Gaps en cobertura específica** (5 features, 2 architectural diffs).
- **Resolution:** extract canonical (capability surface + UI surface for UX-aware ratification) + add coverage to gaps (per-feature ports queued) + ratify pattern + lint rule follow-up.

**Sub-rule status post-A7 closure:** **confirmation redundante 3/3.**

Per Sam directive previo (post-C1):
> Si emerge tercer data point con same shape: confirmation redundante. Si emerge un caso que NO encaja: sub-rule se refina con variant nueva.

A7 fits the same shape → no refinement needed. Sub-rule remains **established** (was 2/2 post-C1).

**Optional promotion** (per Sam directive 2026-05-01 post-Sec-3b):
> Update meta-anchor Pattern 2.5 extend variant — tercer data point logged (A3 + C1 + A7). Si shape consistent, sub-rule "established 2/2" → confirmation redundante 3/3 → maybe promote to "robust pattern" en CLAUDE.md.

If A7 closes in this shape, post-merge cleanup commit may promote the sub-rule from "established 2/2" → "robust pattern with 3 data points (A3 + C1 + A7)" en CLAUDE.md Pattern 2.5 hybrid variants section.

### 9.5 Calibración honest vs prior calibration

A7 estimate factor was 1.0x (~8h actual vs ~7-8h estimate) — first time the audit hits ~1x factor. Causes:

1. **Most complex RFC of bloque (c)** — per-feature analysis × 7 features inherently multiplies vs single-feature C1 or A3.
2. **2 commits split (Sec 3a/3b)** — Sam's split directive added review checkpoint overhead (~30min extra) but reduced risk of contamination cascade.
3. **LRA override mid-flight** — Sam directive post-3a verde added ~30min consolidation work in Sec 4.

These are not "audit slowed down" — they're calibration confirming that complex RFCs land at ~1x, while simpler ratifications land at ~0.5-0.7x. Audit pace is healthy.

### 9.6 Audit cumulative state

- **22 ejes cerrados** (7 mecánicos + 13 (b) decisión + 2 (c) RFCs — A7 será el segundo (c) post-cierre).
- **Sub-rule Pattern 2.5 extend variant established → robust pattern (post-A7)**.
- **Pace estimate calibration:** factor 0.5-1.0x del nominal según complejidad. Promedio 0.65x.

---

**FIN DEL RFC A7 (Fase 2).** Awaiting Sam verde para A7 closure Fase 3 minimal (4 commits decoupled).
