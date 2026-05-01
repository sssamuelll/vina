# Drift Fase 2 — A3: Cross-boundary error handling Rust↔JS

**Fecha:** 2026-05-01
**Eje:** A3 — error handling cross-boundary (xpbd-wasm Rust crate ↔ TS workers/clients).
**Categoría inventario:** (b) decisión producto/arq.
**Estado:** PROPUESTA. Pattern 2.5 hybrid **extend** (third variant of Pattern 2.5 — distinct from D6 cleanup, D4 lite). Esperando review de Sam.

**Branch:** `drift/a3-cross-boundary-errors`.
**Cross-ref inventario:** `docs/reports/2026-04-28-drift-inventory-fase1.md` → A3.
**Cross-ref D6 (closed):** precedent Pattern 2.5 cleanup.
**Cross-ref D4 (closed):** precedent Pattern 2.5 lite.
**Cross-ref B6-state (closed):** precedent zod boundary parsing pattern (`projectSchema.ts:411` Result shape).
**Cross-ref BUG-15 (closed):** AgenticLoop error event surfacing precedent (TS-side error UI patterns).

---

## Sección 1 — Decide / NO decide

### Decide en este eje

1. **Pattern 2.5 hybrid extend ratificado.** Cross-boundary error handling tiene un **pattern legítimo existente** (defensive Rust + CPU fallback + distributed TS NaN guards) que NO requiere refactor. El drift real es **cobertura con gaps** en surfaces específicos: missing panic_hook preventive, silent fallback bug, WASM→JS NaN boundary guard ausente.
2. **`console_error_panic_hook` adoption** (preventive). Currently 0 panics empíricos en Rust crate, pero el dep es cheap insurance que da useful console error message si future code introduce un panic accidentally.
3. **Surface silent fallback** (`wasmSolverWorker.ts:402-407` "positions will be zero") como UI error via `showErrorToast` o equivalente. Currently solo `console.warn`.
4. **NaN guard at WASM→JS post-step boundary** + telemetry counter. Currently TS-side NaN guards distribuidos (CPU/GPU/collision) pero WASM solver path lacks even telemetry — NaN can propagate from WASM to render silently.
5. **Result-pattern adoption forward-only** para nuevos exports Rust→TS fallibles. Cross-references `projectSchema.ts:411` precedent (B6-state ratified). Convention para new code, NO retroactive migration of zero-copy exports.

### NO decide en este eje

1. **Refactor del defensive Rust pattern.** Crate fue intencionalmente escrito sin panic paths (3 explicit comments: "without panicking"). Ratify as-is.
2. **Refactor del CPU fallback mechanism** (`webgpuDetect.ts`). Auto-decision via detection works. Ratify.
3. **Migración retroactive de zero-copy exports a Result types.** `positions_ptr()`, `velocities_ptr()`, etc. son performance-critical hot path — Result wrapping rompería el pattern. Out-of-scope.
4. **Refactor de TS-side NaN guards** distribuidos en CPU/GPU/collision. Ratify as-is; A3 extiende cobertura al WASM path, no refactorea otros.
5. **selfCollision feature gap en WASM.** Tracked en issue #608 + A7 RFC. Out-of-scope A3 (sería real-fix scope, no error handling extend).
6. **`updateConstraints` not yet supported para WASM solver.** TODO comment en código; out-of-scope A3 (feature gap, no error handling).
7. **Tracing/telemetry infrastructure** beyond WASM→JS boundary. A3 adds NaN counter; broader telemetry (Sentry-like) is separate eje.

### Por qué importa la línea

Sin la ratificación + extend cleanup:
- Future dev adds `unwrap()` en Rust → panic produces `WebAssembly.RuntimeError` sin context (no `console_error_panic_hook`) → debugging duro.
- User encounters `wasmSolverWorker.ts:402-407` failure → frozen cloth sin error visible (silent fallback console.warn-only).
- NaN propagates from WASM positions → render explosion sin telemetry counter — no signal de qué causa el bug.
- Future Rust→TS export fallible written ad-hoc → divergence from `projectSchema.ts` Result pattern precedent.

A3 captura los 4 gaps con surgical fixes que extienden el pattern existente.

---

## Sección 2 — Estado actual

### 2.1 Pre-existing canonical infrastructure (regla 1 v2)

**Defensive Rust crate (intentional, ratified):**
- `crates/xpbd-wasm/src/lib.rs` (824 líneas) escrito sin panic paths.
- 3 comments explicit:
  - Line 807: "(rigid) rather than panicking with index-out-of-bounds".
  - Line 815: "fall back to compliance=0 (rigid) without panicking".
  - Line 819: "No panic = pass; behavior verification below is just a sanity check".
- `Cargo.toml` minimal (solo `wasm-bindgen 0.2`, NO `console_error_panic_hook`).

**CPU fallback (intentional, ratified):**
- `webgpuDetect.ts:5` documenta: "Used to decide between WebGPU solver, **Wasm fallback, or CPU fallback**." Auto-decision via runtime detection.

**TS-side NaN guards (intentional, ratified per subsystem):**
- `longRangeAttachments.ts:153` — skip silently.
- `interfacing.ts:18` — default to 0.
- `triangleCollision.ts:237, 290` — clamping fix ("Prevents NaN cascade").
- `gpuSolverClient.ts:131, 144, 185, 714` — telemetry counting (`inputNaN++`, `nanCount++`).
- `tslSolver.ts:327` — GPU shader guard ("NaN != NaN" trick).

**Result pattern precedent (B6-state ratified):**
- `src/utils/projectSchema.ts:411` — `parseOpenCloProject(input): ProjectParseResult`.
- Discriminated union `{ ok: true | false }`. Never throws. Caller-decides UX.
- Header: "Returns a Result; never throws. Callers decide how to react."

**Conclusión:** múltiples pre-existing patterns legítimos. A3 **extiende cobertura**, no refactorea.

### 2.2 Inventario claims verification (regla 1 v3 + meta-anchor regla 2)

| Claim | Status | Evidence |
|---|---|---|
| **A.** `panic!` Rust sin `console_error_panic_hook` → aborta silenciosamente | **REFUTADA** | `grep "panic!\|.unwrap()\|.expect("` → empty en `crates/xpbd-wasm/src`. 3 comments explicit "without panicking". 0 panic paths empíricos. |
| **B.** try/catch global en worker → `postMessage({type:'error'})` | **CONFIRMED parcial** | 6 try/catch sites (wasmSolverClient + wasmSolverWorker + clothWorker). Error surfacing depende de optional `onError?.()` callback — silent if consumer no lo pasa. |
| **C.** NaN guard en colisión → reset silencioso a `prevPos` (`wasmSolverWorker.ts:166–178`) | **REFUTADA** | Lines 166-178 contain `preCollisionBuf` declaration + `MAX_PARTICLE_VEL` constant. NO silent reset code. Probably refactorizado desde inventory time. |

**2 de 3 claims refuted empíricamente** — confirma meta-anchor regla 2 ("inventario es hipótesis a validar"). Reformulación post-sweep:

> **A3 reformulado:** drift NO es "panic_hook missing porque crate panics". Es:
> - **A1.** `panic_hook` missing como **preventive insurance** (crate today is defensively written, but future code may add unwrap accidentally).
> - **B1.** Silent fallback en `wasmSolverWorker.ts:402-407` ("positions will be zero" warning) — user sees frozen cloth, no UI error.
> - **C1.** NaN propagation from WASM positions → render sin telemetry counter (TS-side NaN guards exist en CPU/GPU/collision, but WASM path lacks).
> - **D1.** Cross-boundary type contracts implícitos (Rust API pointer-based zero-copy, no Result types — fallibility no comunicada en signatures).

### 2.3 Rust crate inventory

**`crates/xpbd-wasm/src/lib.rs` (824 líneas):**

```rust
//! XPBD Cloth Simulation — WebAssembly solver
//! Implements Extended Position Based Dynamics for cloth simulation.

use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct XpbdSolver {
    num_particles: usize,
    positions: Vec<f32>,
    prev_positions: Vec<f32>,
    velocities: Vec<f32>,
    // ... más buffers
}

#[wasm_bindgen]
impl XpbdSolver {
    pub fn new(positions: &[f32], inv_mass: &[f32]) -> XpbdSolver { ... }
    pub fn positions_ptr(&self) -> *const f32 { ... }
    pub fn velocities_ptr(&self) -> *const f32 { ... }
    pub fn num_particles(&self) -> usize { ... }
    // ... más pointers + counts
}
```

**Cargo.toml minimal:**

```toml
[dependencies]
wasm-bindgen = "0.2"

[package.metadata.wasm-pack.profile.release]
wasm-opt = false

[profile.release]
opt-level = 3
lto = true
```

**Pattern: pointer-based zero-copy.** TS reads `Float32Array` views directamente sobre WASM memory.

- **0 `Result<T, E>` exports.**
- **0 panic paths.**
- **0 NaN handling explicit.**
- **0 `console_error_panic_hook`** import.

Constructor `new()` returns `XpbdSolver` directly (no `Result`). Pointers return raw `*const f32` (no fallibility).

### 2.4 TS consumer inventory — 6 try/catch sites + 4 silent fallbacks

#### Try/catch sites

| Site | Purpose |
|---|---|
| `wasmSolverClient.ts:75` | Init / setup |
| `wasmSolverClient.ts:335` | (verify in code — generic error handler) |
| `wasmSolverWorker.ts:383` | WASM module load + init |
| `wasmSolverWorker.ts:700` | Generic worker error handler (catches all) |
| `clothWorker.ts:130, 523` | CPU solver path equivalent |

#### 4 silent fallbacks identified

| # | Site | Behavior | Severity |
|---|---|---|---|
| 1 | `wasmSolverWorker.ts:402-407` | "Could not access `WebAssembly.Memory` — **positions will be zero!**" — `console.warn` only | **HIGH** (user sees frozen cloth) |
| 2 | `wasmSolverWorker.ts` (selfCollision warning) | "selfCollision=true requested but WASM solver has no implementation; **forcing false**" | MEDIUM (tracked: #608, A7 RFC — out-of-scope A3) |
| 3 | `wasmSolverWorker.ts` (updateConstraints) | "**updateConstraints not yet supported for Wasm solver**" — `postMessage('constraintsUpdated')` but no actual update | MEDIUM (TODO comment — out-of-scope A3) |
| 4 | `wasmSolverClient.ts: worker error event` | `console.warn('[WasmSolver] Worker error event:', msg)` + optional `this.onError?.(msg)` | MEDIUM (depends on consumer passing `onError`) |

**A3 scope:** silent fallback #1 (HIGH severity, `wasmSolverWorker.ts:402-407`). Silent fallbacks #2 + #3 son feature gaps tracked elsewhere (#608, A7 RFC). Silent fallback #4 es UX policy on `onError` callback.

### 2.5 NaN guards distribution

**TS-side guards distributed (intentional, ratified):**

| Site | Type | Behavior |
|---|---|---|
| `longRangeAttachments.ts:153` | Skip silently | `if (!isFinite(dist[i])) continue` |
| `interfacing.ts:18` | Default to 0 | `Number.isFinite(x) ? x : 0` |
| `triangleCollision.ts:237, 290` | Clamping fix | "Prevents NaN cascade" — max displacement |
| `gpuSolverClient.ts:131, 144, 185, 714` | Telemetry counting | `inputNaN++`, `zeroRestLen++`, `nanCount++` |
| `tslCollision.ts:50` | Comment | "Prevents NaN cascade" |
| `tslSolver.ts:327` | GPU shader guard | `speed2.equal(speed2)` (NaN ≠ NaN trick) |

**WASM path: 0 explicit NaN handling.** Implicit guard: `MAX_PARTICLE_VEL = 5.0` velocity clamp (`wasmSolverWorker.ts:170-174`) — limits explosion but doesn't catch NaN.

**Gap identificado:** if Rust solver produces NaN positions (e.g., division edge case, accumulated numerical error), positions buffer pasa via zero-copy a TS sin guard. Render layer consumes NaN → cloth explosion sin telemetry signal de WASM origin.

### 2.6 Cross-boundary contract implícito

Rust API es **pointer-based zero-copy** — fallibility NOT communicated en signatures:

| Rust signature | Fallibility status | TS expectation |
|---|---|---|
| `XpbdSolver::new(positions, inv_mass) -> XpbdSolver` | Could panic on invalid args (today: doesn't, defensively written) | TS expects `XpbdSolver` instance |
| `positions_ptr() -> *const f32` | Pointer always valid (lifetime managed by `&self`) | TS reads `Float32Array` view directly |
| `solve_substep(dt: f32, ...)` | Could produce NaN positions on edge cases | TS reads positions, expects valid |

**Drift:** future Rust→TS exports fallibles (e.g., new `validate_pattern(input)` validator) would be written ad-hoc sin convention. **Forward-only convention** ratifies adoption del precedent `projectSchema.ts:411` Result shape para new code.

### 2.7 projectSchema precedent (Result pattern available)

`src/utils/projectSchema.ts:411`:

```ts
export function parseOpenCloProject(input: unknown): ProjectParseResult {
  const result = openCloProjectSchema.safeParse(input);
  if (!result.success) {
    return {
      ok: false,
      error: { code: 'invalid_shape' | 'too_large' | 'invalid_json',
               message, path?, received? },
    };
  }
  return { ok: true, project: parsed, warnings };
}
```

Header: "**Returns a Result; never throws.** Callers decide how to react to `ok: false` (toast, log, quarantine)."

**Pattern aplicable a A3 boundary:**
- ✅ Init + configure (one-shot operations).
- ✅ "Validate input" operations (e.g., new `validate_pattern_geometry(input)`).
- ✅ NaN guard return value (post-step `validate_no_nans() -> Result<(), NaNDetected>`).
- ❌ Hot loop zero-copy reads (positions, velocities) — performance-critical, Result wrapping rompe pattern.

**Convention forward-only:** new fallible exports use Result shape; existing zero-copy pattern preserved as performance critical.

### 2.8 Pattern detected — Pattern 2.5 hybrid EXTEND

**A3 NOT pure ratify, NOT pure refactor — Pattern 2.5 third variant:**

```
Pattern 2.5 hybrid variants:
  - cleanup (D6): remove dead code/artifacts (declared deprecation + unused bridge)
  - lite (D4):    surgical helper para inline drift (dual maintenance N sites)
  - extend (A3):  add coverage to surfaces with gaps (preventive measures + UI surfacing + boundary guards)
```

**A3 extend characteristics:**
- Pattern existing legitimate (defensive Rust + CPU fallback + distributed NaN guards) → **ratify**.
- Cobertura tiene gaps en surfaces específicos (panic_hook missing preventive, silent fallback bug, WASM→JS NaN guard ausente, contracts implícitos) → **extend**.
- NO refactor del pattern, solo additions surgical to gaps.

**Cost-benefit:**
- `console_error_panic_hook`: 1 Cargo dep + 1 init line. Cheap. High debugability if panic ever happens.
- Silent fallback UI surface: replace `console.warn` con `showErrorToast`. Cheap. High UX win.
- NaN boundary guard: post-step check + counter. Moderate. High debugability for cloth explosion bugs.
- Result convention forward-only: 0 code, document policy. Trivial. Sets precedent.

### 2.9 Sweep negativo (qué NO emergió)

- 0 panic paths en Rust crate (refuted inventario claim A).
- 0 NaN guards inline en lines 166-178 (refuted inventario claim C).
- 0 alternative error library en TS (no Result-monad library, no fp-ts, etc.).
- 0 Sentry-like infra para production error reporting (pero ese es scope distinto).

Sin sorpresas mayores. Sweep cerró clean con framing 2.5 extend confirmed.

---

## Sección 3 — Sub-decisiones, opciones y tradeoffs

Cuatro sub-decisiones: 3.1 (`console_error_panic_hook`), 3.2 (silent fallback UI surfacing), 3.3 (NaN boundary guard), 3.4 (Result-pattern forward-only convention).

### 3.1 `console_error_panic_hook` adoption

**Pregunta:** ¿adoptar `console_error_panic_hook` Cargo dep + init para get useful console.error con context si Rust crate panica?

#### Opción 3.1.A — Adopt always (RECOMENDADA)

Add `console_error_panic_hook = "0.1"` a `Cargo.toml`. Init via `set_once()` en constructor o `#[wasm_bindgen(start)]` function. Active en tanto dev como production builds.

```toml
[dependencies]
wasm-bindgen = "0.2"
console_error_panic_hook = "0.1"
```

```rust
// In lib.rs, at module top or constructor:
#[wasm_bindgen]
impl XpbdSolver {
    pub fn new(positions: &[f32], inv_mass: &[f32]) -> XpbdSolver {
        console_error_panic_hook::set_once();
        // ... existing constructor
    }
}
```

- **Pros:**
  - **Cheap insurance:** if future code accidentally introduces panic (e.g., new feature with `unwrap()`), browser console gets useful error con location + stack trace, vs current `WebAssembly.RuntimeError` sin context.
  - **Production debuggability:** crash in production gets actionable error message.
  - **Minimal overhead:** init runs once per solver instance; debugging panics rare in production hot path.
  - **Aligned con Rust WASM best practices** (most production WASM crates adopt `panic_hook`).
- **Cons:**
  - Adds 1 Cargo dep + ~20kB to wasm bundle (panic_hook source code, but tree-shaken if zero panic sites).
  - Currently 0 panic paths empíricamente — preventive measure.
- **Migration:** Cargo.toml + 1 init line + WASM rebuild + sync.

#### Opción 3.1.B — Opt-in dev only (cfg conditional)

```rust
#[cfg(debug_assertions)]
console_error_panic_hook::set_once();
```

- **Pros:** zero production overhead.
- **Cons (primary):** loses production debuggability — exactly when crash debugging is most valuable. Production panic in customer browser → `RuntimeError` sin context, blind debugging.
- **Cons (secondary):** dev-only adoption means panic_hook tested only in dev builds; can have subtle differences (panic format) between dev and prod.
- **Descartar** — production debuggability is the primary value.

#### Opción 3.1.C — Status quo (no adoption)

Mantener Cargo.toml as-is. Rely on defensive coding to prevent panics.

- **Pros:** zero change.
- **Cons (primary):** **fragile assumption.** Future code may add `unwrap()` accidentally; `panic_hook` would be the safety net. Without it, panic produces opaque `WebAssembly.RuntimeError` que oscurece debugging.
- **Cons (secondary):** current `0 panic paths` is empirical observation NOT enforced — no lint rule prevents future `unwrap()` introduction.
- **Descartar** — preventive insurance is cheap, defending status quo is brittle.

#### Recomendación 3.1

**Opción 3.1.A** con confianza alta. Razones:

1. **Cheap insurance:** ~20kB bundle + 1 Cargo dep + 1 init line for high debugability payoff.
2. **Production debuggability** primary value (3.1.B sacrificed it).
3. **Defensive coding is empirical, not enforced** — `panic_hook` is the safety net cuando defense fails.
4. **Rust WASM ecosystem standard** — most production crates adopt `panic_hook`.

**Tradeoff aceptado:** ~20kB bundle increase (negligible vs WASM solver size). 1 dep adicional manageable.

---

### 3.2 Silent fallback UI surfacing

**Pregunta:** silent fallback en `wasmSolverWorker.ts:402-407` ("Could not access `WebAssembly.Memory` — positions will be zero!") solo emit `console.warn`. Usuario sees frozen cloth sin error visible. ¿Surface as UI error?

#### Opción 3.2.A — Surface as UI error via `showErrorToast` + telemetry counter (RECOMENDADA)

Replace `console.warn` con dispatch a error UI:

```ts
// wasmSolverWorker.ts:402-407 reformulado:
} else {
  const errorMsg = 'WASM solver init failed: WebAssembly.Memory not accessible. ' +
                   'Cloth simulation will not run. Try refreshing the page or check browser console for details.';
  console.error('[WasmWorker]', errorMsg, { initResultType: typeof initResult, /* ... */ });
  self.postMessage({ type: 'error', code: 'wasm_memory_unavailable', message: errorMsg });
  // Worker error eventually triggers wasmSolverClient.onError callback OR
  // worker error event handler (wasmSolverClient.ts:75-90).
}
```

Plus telemetry counter:

```ts
// Track frequency of WASM init failures for product telemetry:
let wasmInitFailureCount = 0;
// ... on failure: wasmInitFailureCount++;
```

- **Pros:**
  - **User sees error** instead of frozen cloth. Actionable feedback.
  - **Aligned con BUG-15 precedent** — AgenticLoop loop-level error event surfaced as toast.
  - **`postMessage error`** flows through existing `wasmSolverClient.ts` error handler → optional `onError` callback (consumers should hook it).
  - **Telemetry counter** enables product to track frequency of WASM init failures.
- **Cons:**
  - Couples worker to error message string convention (currently console.warn-only).
  - If `onError` callback not provided by consumer, error still silent (mitigated by also dispatching to `console.error` with full context).

#### Opción 3.2.B — Console.error only (no UI surface)

Replace `console.warn` con `console.error`. No UI dispatch.

- **Pros:** preserves current scope (no UX change).
- **Cons:** **user STILL sees frozen cloth.** Console.error vs console.warn is cosmetic — neither surfaces to user. Doesn't address the actual bug (silent failure).
- **Descartar** — cosmetic-only fix.

#### Opción 3.2.C — Status quo

Keep `console.warn`.

- **Pros:** zero change.
- **Cons:** silent fallback persists. User experiences frozen cloth without explanation.
- **Descartar** — explicit scope of A3 is to extend coverage to silent fallbacks.

#### Recomendación 3.2

**Opción 3.2.A** con confianza alta. Razones:

1. **High UX win:** user sees actionable error vs frozen cloth.
2. **Aligned con BUG-15 + audit philosophy** ("describe lo que pasa, no escondas").
3. **Telemetry counter** enables product to monitor frequency.
4. **Reuses existing infrastructure** (`wasmSolverClient.ts:75` worker error event handler + optional `onError` callback).

---

### 3.3 NaN guard at WASM→JS post-step boundary

**Pregunta:** WASM solver path lacks explicit NaN handling — NaN can propagate from positions buffer to render via zero-copy. ¿Add post-step boundary guard with telemetry counter?

#### Opción 3.3.A — Explicit post-step check + telemetry counter (RECOMENDADA)

Post each WASM step in worker, scan positions for NaN. Increment telemetry counter; reset NaN positions to `prevPos` (consistent con CPU solver pattern).

```ts
// wasmSolverWorker.ts simulationLoop, post-step:
const posView = new Float32Array(wasmExports.memory.buffer,
                                 solver.positions_ptr(), n * 3);
const prevView = new Float32Array(wasmExports.memory.buffer,
                                  solver.prev_positions_ptr(), n * 3);

let nanCount = 0;
for (let i = 0; i < n * 3; i++) {
  if (!Number.isFinite(posView[i])) {
    posView[i] = prevView[i];  // Reset to previous valid position
    nanCount++;
  }
}

if (nanCount > 0) {
  wasmNaNCount += nanCount;
  if (wasmNaNCount === 1 || wasmNaNCount % 100 === 0) {
    console.warn(`[WasmWorker] NaN detected in positions buffer: ${nanCount} this step, ${wasmNaNCount} total`);
  }
}
```

- **Pros:**
  - **Prevents NaN cascade** to render (cloth explosion).
  - **Telemetry signal** for debugging WASM solver edge cases.
  - **Consistent con CPU solver pattern** (existing distributed NaN guards).
  - **Reset to prevPos** preserves continuity (prefer slightly stale position over NaN).
- **Cons (primary):** **per-step overhead** (~3N float comparisons). For N=1000 particles, ~3000 comparisons per substep × 15 substeps × 60fps ≈ 2.7M comparisons/sec. Negligible vs WASM step cost (μs range).
- **Cons (secondary):** spam protection (rate-limited console warn) — careful not to overwhelm console.

#### Opción 3.3.B — Silent clamp (reset to prevPos, no telemetry)

Reset NaN positions silently, no counter, no console.

- **Pros:** zero overhead beyond clamp.
- **Cons (primary):** **loses debugging signal.** If NaN happens, no way to know without instrumentation. Defeats the diagnostic purpose.
- **Descartar** — telemetry counter is the value-add.

#### Opción 3.3.C — Status quo (no boundary guard)

Trust Rust solver to never produce NaN; rely on `MAX_PARTICLE_VEL` velocity clamp.

- **Pros:** zero change.
- **Cons (primary):** velocity clamp doesn't catch all NaN sources (e.g., division edge cases en constraint solving). NaN can still propagate to render in edge cases.
- **Cons (secondary):** TS-side has NaN guards en CPU/GPU/collision; WASM path is **only solver tier without** boundary guard. Inconsistency.
- **Descartar** — gap relative to other solver tiers.

#### Recomendación 3.3

**Opción 3.3.A** con confianza alta. Razones:

1. **Prevents NaN cascade** — primary correctness goal.
2. **Telemetry signal** — enables debugging WASM solver edge cases.
3. **Consistency con CPU/GPU paths** — symmetric NaN guard distribution.
4. **Negligible overhead** — comparison cost dwarfed by WASM step cost.

---

### 3.4 Result-pattern adoption forward-only

**Pregunta:** future Rust→TS exports fallibles should follow what convention? `projectSchema.ts:411` `ProjectParseResult` shape (B6-state ratified) is precedent.

#### Opción 3.4.A — Forward-only convention (RECOMENDADA)

New fallible exports use Result-shape via `JsValue` serialization:

```rust
#[wasm_bindgen]
pub fn validate_pattern_geometry(input: &[f32]) -> JsValue {
    // Returns JS object: { ok: true, ... } or { ok: false, error: { code, message, ... } }
    match validate_internal(input) {
        Ok(result) => serde_wasm_bindgen::to_value(&Ok::<_, ValidationError>(result)).unwrap(),
        Err(e) => serde_wasm_bindgen::to_value(&Err::<ValidationResult, _>(e)).unwrap(),
    }
}
```

TS-side:

```ts
type ValidationResult =
  | { ok: true; data: ValidationData }
  | { ok: false; error: { code: string; message: string; details?: unknown } };

const result: ValidationResult = wasm.validate_pattern_geometry(input);
if (!result.ok) {
  // Caller decides: toast, log, retry...
}
```

- **Pros:**
  - **Aligned con `projectSchema.ts:411` precedent** — ratifies pattern across language boundary.
  - **Never throws across boundary** — TS doesn't need try/catch for fallible exports.
  - **Caller-decides UX** — same pattern as B6-state ratified.
  - **Forward-only:** zero migration cost. Existing zero-copy hot path preserved.
- **Cons:** none material. Convention is policy, not code.
- **Migration:** 0 código + ~20 líneas CLAUDE.md (convention doc).

#### Opción 3.4.B — Status quo (no convention, ad-hoc per export)

No convention. Each future fallible export designed independently.

- **Pros:** flexibility per case.
- **Cons (primary):** **divergence guaranteed.** Without convention, future devs make ad-hoc choices (throw across boundary, return null, return Option, return JsValue with custom shape). Discoverability cost grows linearly with new exports.
- **Cons (secondary):** misses opportunity to ratify `projectSchema.ts` precedent across language boundary.
- **Descartar** — convention is cheap insurance.

#### Opción 3.4.C — Retroactive migration of existing zero-copy exports

Migrate `positions_ptr()`, `velocities_ptr()`, etc. to return Result.

- **Pros:** uniform error handling across all exports.
- **Cons (primary):** **performance-critical hot path.** Zero-copy positions buffer is read 60×15 = 900 times per second in simulation loop. Result wrapping breaks zero-copy semantics — would require allocation per call. Catastrophic perf regression.
- **Descartar** — zero-copy is the design intent of pointer-based exports.

#### Recomendación 3.4

**Opción 3.4.A** con confianza alta. Forward-only convention sets precedent without migration cost. Existing zero-copy preserved as performance-critical hot path.

**Tradeoff aceptado:** convention bound by review — sin lint rule que enforce. Aceptable porque (i) new fallible exports are rare; (ii) review humano con `projectSchema.ts` precedent visible es sufficient.

---

### Tabla resumen Sec 3

| Sub-decisión | Recomendación | Migration cost |
|---|---|---|
| 3.1 `console_error_panic_hook` | **3.1.A** — Adopt always | 1 Cargo dep + 1 init line + WASM rebuild |
| 3.2 Silent fallback UI | **3.2.A** — Surface as UI error + telemetry counter | ~10 líneas TS (replace console.warn) |
| 3.3 NaN boundary guard | **3.3.A** — Post-step check + counter + reset to prevPos | ~15 líneas TS (post-step validation loop) |
| 3.4 Result-pattern convention | **3.4.A** — Forward-only convention | 0 código + ~20 líneas CLAUDE.md |

**Total migration:** Rust changes (Cargo + init + rebuild + sync) + ~25 líneas TS + ~80 líneas docs (JSDoc + CLAUDE.md). **~3-5h Fase 3.**

[Sec 4-9 pendientes — incremental push.]

