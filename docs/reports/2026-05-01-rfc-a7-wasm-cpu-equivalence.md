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

## Sec 3+ pendiente

Sec 3 (6 sub-decisiones articuladas con per-feature analysis y tradeoffs explícitos), Sec 4 (recomendación consolidada per-feature), Sec 5 (Migration plan multi-step), Sec 6 (Cross-references), Sec 7 (Reopen triggers), Sec 8 (Deuda técnica explícita), Sec 9 (Pregunta a Sam + estado + calibración) — commits subsiguientes.
