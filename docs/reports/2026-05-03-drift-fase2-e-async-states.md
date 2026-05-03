# Drift Fase 2 — E-async-states: B8-state + D2 + D8 fusion sub-track

> **Eje:** E-async-states (último sub-track del audit cumulative — cierra audit completo).
> **Inventory framing:** "B8 + D2 + D8 son el mismo problema visto desde tres ángulos. Sub-track de scope grande con spec previo (probablemente el eje más grande de toda la auditoría)."
> **Reformulación post-sweep (regla 0 + 13):** la realidad post-sweep es **3 ortogonal concerns** con **canonical infrastructure ya establecida** (ErrorBoundary tree, Toast slice, SolverError types, agentError pattern) + **3 bounded D8 gaps** (vs inventory's 5; A3 + BUG-15 cerraron 2 de 5 pre-E-async). Tool surface canonical (Toast helpers, structured `SolverError`) ya en uso amplio: 19 toast callsites + 4 helpers, NO infrautilizado como decía inventario. **9° caso de regla 13 reformulation** del audit.
> **Cross-refs:** A3 (`docs/reports/2026-05-01-drift-fase2-a3-cross-boundary-errors.md`), A6 (`docs/reports/2026-05-01-rfc-a6-worker-protocol.md`), A7 (`docs/reports/2026-05-01-rfc-a7-wasm-cpu-equivalence.md`), C4 (`docs/reports/2026-05-02-drift-fase2-c4-4way-tier-orchestration.md`), A2 (`docs/reports/2026-05-02-drift-fase2-a2-cross-boundary-serialization.md`), BUG-15 (PR #650), #645 (E-async direct input from BUG-15 sweep), #687 (A6 follow-up — error uniform 4 tiers).
> **Inheritance:** E-async hereda `SolverError`/`SolverErrorCode` types (declarados en `solverProtocol.ts:178-197` post-A6) + `panic_hook` + `wasmNaNCount` + `postMessage error` (A3) + `SimulationStatusOverlay` UI surface (A7+C4) + `showErrorToast` (BUG-15 wiring) + `useSimulationLifecycle` hook composition (C4) + `Toast` slice (post-Phase-5 #130) + ErrorBoundary tree (App + Panel + Viewport3D + Simulation).
> **Estado:** Fase 2 doc — pendiente verde de Sam para Stage 2.

---

## Sección 1 — Decide / NO decide

### Decide en este eje

E-async-states decide **ocho cosas** organizadas como sub-decisiones ortogonales en Sec 3 (3 axes B8/D2/D8 + 1 cross-axis + 1 stage 2 structure):

1. **B8-state axis — state location convention** (§ 3.1). ¿Per-feature decision con doc anchor (Redux for persistent / useState for transient / state machine for multi-step), force unified `useAsyncState<T>` hook canonical, force Redux-canonical para todos async ops, o status quo sin doc?
2. **D2 axis — error propagation convention table** (§ 3.2). ¿Anchor 6-variant convention table con when-to-use rules per CLAUDE.md, force `Result<T,E>` everywhere via Pattern 1, force `ToolResult` everywhere, o status quo?
3. **D2 axis — silent variant D audit** (§ 3.3). ¿Ratify storage / parsing / fire-forget cases (8+ identified) como legítimos, surface as telemetry counter pattern (extend A3), o eliminate variant D entirely?
4. **D2 axis — SolverError adoption coordination con #687** (§ 3.4). ¿E-async ratifies pattern + #687 implements (current decoupling), fold #687 into E-async closure (bundled), o defer entirely?
5. **D8 axis — enumerated gap surfacing** (§ 3.5). 3 gaps identified post-A3+BUG-15 closure: CollisionBodyMesh:44 (still `console.warn`), validator diagnostics consumer (state.loadDiagnostics stored, NO consumer), reactiveSolverMiddleware errors[] (internal, not exposed). ¿Pattern 2.5 extend per-gap (Toast/inline UI), generic `<AsyncBoundary>` HOC Pattern 1, o status quo?
6. **D8 axis — state machine pattern emerging** (§ 3.6). 2 sites (`ImportSeamlyModal` + `ExportSkillModal`) usan `type State = 'idle' | 'X' | 'success' | 'error'`. ¿Ratify as emerging convention, extract `useAsyncStateMachine<S>` hook (Pattern 2.5 lite), o status quo?
7. **Cross-axis E — shared error→UI pipeline** (§ 3.7). ¿Status quo (D2 variant determines surface naturally), o auto-route Result→toast pipeline (Pattern 1)?
8. **Stage 2 structure** (§ 3.8). ¿Single F3 unify branch con atomic per-axis commits dentro, 3 separate sub-branches con merge sequencing, o monolithic single commit (anti-pattern)?

### NO decide en este eje

- **`SolverError` adoption en CPU + GPU + Neural tiers** — **`#687` territory** explicit. E-async ratifies pattern + cross-doc; implementation queued. Folding violates audit decoupling philosophy (3.6 pattern from B6-state + A6 + A7).

- **Refactor del defensive Rust pattern** — A3 ratificó (824 líneas, 0 panic paths). Fuera de scope.

- **Refactor del CPU fallback mechanism** (`webgpuDetect`). A3 ratificó.

- **TS-side NaN guards refactor** — A3 ratificó CPU/GPU/collision distribución; ya extendido a WASM via `wasmNaNCount`. Fuera de scope.

- **AgenticLoop 3-surface error inconsistency root cause** (#645). Tracked como input pero NO solved aquí — captured en § 3.2 convention table como deuda explícita post-ratification (legitimate separation of concerns: tool error vs loop error vs catch-at-component, each surface intentional).

- **Validator diagnostics rendering UX shape** (toast vs panel vs inline). § 3.5 articulates that surface IS opened; UX choice (toast vs panel) deferred to product per A7 § 3.5 precedent.

- **Worker pool errors UX shape**. Same — § 3.5 opens surface; UX deferred.

- **PluginManager redundant local + slice error state** (`useState` `installError` + `slice.pluginErrors` dual). Captured como deuda explícita § 8.2; folding into E-async would require Redux migration of useState — out-of-scope (regla 11 — no real fix needed; both surfaces work).

- **CommandBar response state location** (`useState responseText` only, no slice). Captured como deuda § 8.3; out-of-scope.

- **React `Suspense` / `useTransition` adoption** (0 usage today outside R3F internal). Out-of-scope; would be separate eje if pursued.

- **External error/loading library adoption** (`react-error-boundary`, `react-query`, etc. — 0 deps today). Out-of-scope; pure custom implementation ratificado post-sweep.

- **Setter migrations queued post-A6** (`#683-689`). Independent follow-ups; E-async observa pero no fuerza. `#687` explicit coordination per § 3.4.

- **R3F handlers vs raycaster duplication (#707)** — rendering-layer eje, no overlap.

### Por qué importa la línea

E-async-states cierra el último item del audit cumulative (post-C4 closure 2026-05-02 `6238d0b2` — bloque (c) RFCs 6/6 completo). El framing inicial del inventario "scope grande sub-track con spec previo, probablemente el eje más grande" sugiere multi-session work + per-axis canonicales separados. El sweep refresh post-A3 + post-BUG-15 + post-A6 + post-A7 + post-C4 revela:

- **Canonical infrastructure ya establecida**: ErrorBoundary tree (4 boundaries), Toast slice (4 helpers + auto-cleanup + 5-toast limit), `SolverError` types declarados, `inspectorSlice.agentError` pattern + InspectorTab consumer, `useSimulationLifecycle` hook coordinator, `SimulationStatusOverlay` UI surface, state machine pattern emerging (2 sites). NO `useAsync` / `RequestStatus` / `<AsyncBoundary>` HOC infrastructure existe — confirmed inventory framing pero contexto cambió: las pieces faltantes son **bounded coverage gaps**, no architectural void.

- **Inventory counts dramatically off**: D2 variant A 308 (vs ~150), B 189 (vs ~40), C 164 (vs ~30+), F 19 callsites (NOT infrautilizado). 2-5x off. Variant D (silent) 8 confirmed legitimate (storage/parsing/fire-forget per BUG-10).

- **D8 gaps reduced 5 → 3**: A3 cerró gap 2 (`wasmSolverWorker` silent fallback ahora `postMessage error` + telemetry); BUG-15 cerró gap 3 (`useAgenticLoop` error case dispatches `showErrorToast`). Remanentes: CollisionBodyMesh + validator diagnostics + worker pool errors. Bounded scope.

- **3 axes son ortogonales, no 1 problema**: cada axis tiene shape distinto. B8 = location decision (Redux/useState/state machine), legitimate per-feature. D2 = propagation strategy (6 variants), legitimate per use case. D8 = surface coverage (canonical exists + bounded gaps). Cross-axis interactions DO exist (D2 variant choice afecta D8 surface; B8 location afecta D2 propagation) pero son **legitimate architectural couplings**, no drift.

E-async sin reformulación → multi-session sub-track con per-axis sub-RFCs (Pattern 1 leaning), opens cross-eje cascade with #687 forced into bundle, blast radius unbounded. E-async con reformulación (regla 13 + 14) → **Pattern 2.5 hybrid combining lite + extend single closure** + ratify-by-convention dominant for B8 + D2, ~6-8h F2 + ~3-5h F3 actual, mirrors C4 precedent. **Calibration favors Pattern 2.5 hybrid path** (62% rule + Pattern 2.5 hybrid 1° anchor case C4 sustained).

### Por qué este eje está marcado como sub-track de scope grande

El kickoff describió E-async-states como "sub-track de scope grande con spec previo (no es un mini-spec — es probablemente el eje más grande de toda la auditoría)". El framing está documentado en `drift-fase2-classification.md` § Eje compuesto + § 9 plan secuencial.

**Verificación post-sweep:** scope grande NO se materializa porque:
1. **Pre-existing canonical infrastructure exists** for the major surfaces (regla 1 outcome).
2. **A3 + BUG-15 closures already addressed 2 of 5 D8 gaps** (regla 0 outcome).
3. **3 axes are ortogonal** — no shared canonical extraction needed (regla 13 outcome).
4. **62% rule predicts ratify-by-convention dominant** (regla 14 outcome — sustained 8 cases pre-E-async).
5. **#687 already queued** for solver-tier error uniform — overlap absorbed via coordination, not bundling.

Stage 2 commit structure decision (§ 3.8) reflects this: **single F3 unify branch** is sufficient for the bounded scope (~3 surgical UI commits + convention doc + ratification rows). The "sub-track de scope grande" framing was honest at inventory time (3 axes appearing distinct) but post-sweep + post-A3/BUG-15/A6/A7/C4 closures the bounded scope is the real shape.

---

## Sección 2 — Estado actual

### 2.1 Sweep refresh: B8-state axis (where async state lives)

**Inventory text** (`drift-inventory-fase1.md` líneas 223-228):

> **B8-state ★ — Loading / error / empty states (capa de estado)**
> - Variantes:
>   - Estado en Redux (~3 slices: inspector, simulation, animation).
>   - Estado en `useState` local (CopilotPanel, AgenticLoop).
>   - **Sin estado** (~10 features: nesting, grading, BOM extraction, DXF export, mesh import, WASM init, RAG search).

**Verification post-sweep:**

| Inventory claim | Reality | Verdict |
|---|---|---|
| "Estado en Redux ~3 slices: inspector, simulation, animation" | **inspectorSlice has agentError + agentStreaming + diagnostics + unresolvedCount** (full async state pattern, lines 39-43; consumed by InspectorTab:44, 111-115). **simulationSlice has solverTier + bodyCollision** (NOT loading state — tier identity per A6/A7/C4). **animationSlice has 0 async fields** (config-only). | **Partial — 1 of 3 slices has true async error pattern; 2 of 3 misclassified.** |
| "Estado en useState local: CopilotPanel, AgenticLoop" | CopilotPanel has 11 `useState` (D4 ratified post-2.5 lite) + AgenticLoop integration via `useAgenticLoop` hook (post-BUG-15: `useState<boolean>(isRunning)` + `useState<string\|null>(response)`). | **Confirmed.** Post-D4 ratificado. |
| "Sin estado ~10 features" | Verified per-feature: nestingSlice (92L config + result, NO loading/error fields), gradingSlice (128L config + state, NO loading/error fields), bomSlice (BOM extraction state, NO async fields — `extractBOM` runs synchronously per call), DXF export (`dxfTools.ts` copilot tool — returns ToolResult, no slice state), mesh import (CollisionBodyMesh `useState scene/clips` — NO error UI; AvatarModel via R3F `useLoader` Suspense), WASM init (`solverTier` state + `SimulationStatusOverlay` post-A7), RAG search (KnowledgeStore — searches via copilot, ToolResult). | **Confirmed parcial: features lack loading/error fields per slice but most have alternative surfaces (config slices store result, copilot tools wrap async, useState local for transient).** |

**Reformulation per regla 13:** the "3 variants + sin estado 10" framing is **accurate but masks an emergent pattern**. Reality post-sweep:

- **Variant 1: Per-slice async fields** (inspectorSlice agentError/agentStreaming, pluginSlice pluginErrors, projectSlice loadDiagnostics) — **3 slices** (no 3 different — `simulationSlice` is tier identity, not async state; `animationSlice` is pure config).
- **Variant 2: useState local** (CopilotPanel D4 + AgenticLoop + SkillMarketplace + PluginManager + TemplateLibrary + AvatarPanel + CommandBar + ImportDXFDialog + ImportSeamlyModal + ExportSkillModal + ~5 more). **~10+ sites** — not "few" as inventory implied.
- **Variant 3: State machine** (`ImportSeamlyModal` `'idle' | 'parsed' | 'importing' | 'success' | 'error'` + `ExportSkillModal` `'editing' | 'exporting' | 'success' | 'error'`). **2 sites** — emerging convention, NOT in inventory.
- **Variant 4: ErrorBoundary fallback** (component crashes via App + Panel + Viewport3D + Simulation boundaries). **4 boundary types** — NOT in inventory; canonical convention pre-A3.
- **Variant 5: Suspense via R3F useLoader** (AvatarModel for GLTF/OBJ/FBX). **1 site**, library-driven (R3F).
- **Variant 6: Sin estado sentinel** (CollisionBodyMesh just `console.warn`, no UI; reactiveSolverMiddleware internal `errors[]` array). **2 sites bounded**.

**Inventory was directionally correct (multiple variants coexist) but undercount + misclassification + missed emerging conventions.** Pattern detection: per-feature decisions with implicit canonical (Redux for cross-feature persistent, useState local for transient single-feature, state machine for multi-step UX).

### 2.2 Sweep refresh: D2 axis (error propagation)

**Inventory text** (líneas 347-355):

> **D2 ★ — Manejo de errores JS (4+ estrategias conviven)**
> - Variantes:
>   - **A.** `ToolResult { success: false, error }` — ~150 callsites de tools copilot. Correcto.
>   - **B.** `throw new Error` — ~40 callsites.
>   - **C.** `console.error / warn` y continuar — ~30+ callsites.
>   - **D.** Swallow silently `catch { /* ignore */ }` — ~8.
>   - **E.** `return null / return undefined` — ~20.
>   - **F.** Toast custom (`copilotUISlice.showToast`) — mecanismo existe pero **infrautilizado**.

**Verification per regla 0 (counts have drifted significantly):**

| Variant | Inventory claim | Actual count post-sweep | Δ factor | Notes |
|---|---|---|---|---|
| **A. ToolResult** | ~150 callsites | **303 in copilot/ + 5 outside** = 308 total `success:false` literals; 276 `ToolResult` type usages | **2x off** | Canonical for copilot tools per B9-state ratified. `ToolDefinition.execute` returns `Promise<ToolResult>` uniform. 5 outside copilot are intentional Result-shape per B6-state (`avatarLibrary` parse + `pieceBuilderWorker` worker result). |
| **B. throw new Error** | ~40 callsites | **189 callsites** | **4-5x off** | Concentrated en: `actionExecutor.ts` (22), `PluginBridge.ts` (21), `safeEval.ts` (14), `patternOps.ts` (12), `resolver.ts` (10), `pluginManager.ts` (10). Pattern: validation/parsing/sandbox throw expected (caught by AgenticLoop or component-level catch); tools throw rare. |
| **C. console.error/warn** | ~30+ | **164 callsites** | **5x off** | Top: `gpuSolverClient.ts` (11), `projectValidator.ts` (9 — diagnostic logging), `wasmSolverWorker.ts` (9 — post-A3 NaN counter + non-collision branch), `useSimulationLifecycle.ts` (9), `errorRecovery.ts` (7), `ProjectView.tsx` (7), `FileExplorerView.tsx` (7). Pattern: developer telemetry + non-blocking warnings. |
| **D. Silent catch** | ~8 | **8 confirmed legitimate** + ~6 in catch-with-return-null/undefined contexts | **Aligned** | Confirmed legitimate per BUG-10: `storage.ts` (2), `secureStorage.ts` (1 cleanup), `AgentSettings.ts` (2 LS reads), `ProjectMemory.ts` (1), `avatarSlice.ts` (1 IDB fire-forget — comment "errors surfaced via helper's fallback path"), `UnifiedBar.tsx` (2), `useParametricEngine.ts` (2), `pluginLoader.ts` (1), `ollama.ts` (1 LS), `types.ts` (2 LS sync). |
| **E. return null in catch** | ~20 | **~6 in true catch context + ~14 in non-catch return null** | **Closer to ~6** | Many `return null` outside catch are legitimate signals (no result vs error). True catch-returning-null cases concentrated in providers + storage. |
| **F. Toast (showToast)** | "infrautilizado" | **19 callsites + 4 helpers + auto-cleanup + 5-toast limit + NEW_PROJECT reset** | **REFUTED** | `copilotUISlice.showToast` + `showSuccessToast` + `showErrorToast` + `showUndoToast` + `showInfoToast`. Used: App.tsx storage unavailable (1), useAgenticLoop error event post-BUG-15 (1), useCopilotUI tool result toasts (3), wasmSolverClient comments referencing it for consumer hookup (2 cite); plus action-internal usage. **NOT infrautilizado** — heavily wired into copilot pipeline. |

**Reformulation per regla 0:** inventory snapshot was directionally correct (6 strategies coexist) **but counts are 2-5x off**. The shape that emerged post-A3 + post-BUG-15 + post-#700 (C4):

- Variant A (ToolResult) — **canonical for copilot tools** (B9-state ratified, 308 callsites).
- Variant B (throw) — **canonical for parsing + validation + sandbox** (189 callsites; caught by AgenticLoop / boundary / try-around-call).
- Variant C (console) — **canonical for non-blocking developer telemetry** (164 callsites; e.g., `wasmNaNCount` rate-limited per A3, gpu solver diagnostics).
- Variant D (silent catch) — **canonical for storage degradable fallback + cleanup** (8 legitimate; precedent BUG-10 `avatarSlice.persistPoses`).
- Variant E (return null) — **canonical for "absence is not error" signal** (~6 in catch context + many legitimate non-catch).
- Variant F (Toast) — **canonical for user-facing transient notifications** (19 callsites; refuted infrautilizado claim).

**The 6 variants are NOT drift — they are 6 legitimate strategies for 6 distinct propagation needs.** The audit philosophy stance (regla 11): **align with consistency** is the right call here, not real-fix forced uniform. Inventory framing "4+ strategies conviven" was descriptive but misclassified the legitimacy as drift.

### 2.3 Sweep refresh: D8 axis (UI loading/error/empty)

**Inventory text** (líneas 406-413):

> **D8 ★ — Cobertura de loading / error / empty UI**
> - Brechas:
>   - `CollisionBodyMesh.tsx:42–44`: `importMesh` falla con `console.warn`, sin error en panel.
>   - `wasmSolverWorker.ts:324`: si no puede acceder a `WebAssembly.Memory`, continúa con posiciones en cero, sin feedback.
>   - Loading no manejado en `useAgenticLoop` para evento `error` del loop (bug B15).
>   - `validateAndRepairProject` produce diagnósticos al cargar pero ningún componente los muestra.
>   - Worker pool de construcción paramétrica sin UI de estado.

**Verification per regla 0:**

| Gap | Status post-sweep | Closure |
|---|---|---|
| **Gap 1: CollisionBodyMesh:42-44 console.warn** | **STILL OPEN.** Verified line 44: `console.warn('[CollisionBodyMesh] Failed to load:', body.name, err)`. No UI surface. **OPEN gap for E-async.** | Pendiente — § 3.5.1. |
| **Gap 2: wasmSolverWorker:324 silent fallback** | **CLOSED post-A3.** A3 § 5.3 commit refactored to `postMessage({type:'error', code:'wasm_memory_unavailable', message})` + telemetry counter. Verified `wasmSolverWorker.ts:498` has `code: 'wasm_memory_unavailable'`. Silent fallback shape eliminated. | A3 § 3.2.A ratificado (PR #672 merged). |
| **Gap 3: useAgenticLoop error event** | **CLOSED post-BUG-15.** Verified `useAgenticLoop.ts:82-84`: `case 'error': dispatch(showErrorToast(event.error)); setIsRunning(false);`. Plus AgenticLoop emits `{type:'error'}` event (BUG-15 fix in PR #650). | BUG-15 cerrado. Inconsistencia de 3 surfaces tracked separadamente vía #645 (input directo a E-async). |
| **Gap 4: validateAndRepairProject diagnostics** | **PARTIAL OPEN.** State stored: `projectSlice.loadDiagnostics: ValidationDiagnostic[]` (lines 207, 235, 250). NO UI consumer found — `grep loadDiagnostics src/components/` returns 0 hits. Validator runs `console.error/warn` (9 sites) but diagnostics array goes nowhere visible. **OPEN gap.** | Pendiente — § 3.5.2. |
| **Gap 5: Worker pool errors** | **OPEN.** Verified `reactiveSolverMiddleware.ts:478-486`: `state.pool.onError((error, jobId) => { console.error(...); state.metrics.errors.push(error); ... })`. Internal `errors:[]` array (max 10), NOT exposed to Redux state, NOT rendered. **OPEN gap.** | Pendiente — § 3.5.3. |

**3 gaps open** post-A3 + post-BUG-15. Bounded scope. NOT "drift real con brechas críticas" sin contexto — **Pattern 2.5 extend territory** (existing canonical Toast + ErrorBoundary leveraged for surgical UI per gap).

### 2.4 Pre-existing canonical infrastructure check (regla 1)

**Verified via grep + read:**

#### NO `useAsync<T>` / `RequestStatus` / `<AsyncBoundary>` HOC

```bash
grep -rn "AsyncState\|RequestStatus\|useAsync\b\|asyncState\|loadingState\|RequestState" src/
# (no output)
```

**0 hits.** Confirmed inventory framing — no centralized async state hook. This is **legitimate**: per-feature pattern works for the codebase shape (most features use specific surface, not generic `<Boundary fallback={loading}/>` HOC).

#### ErrorBoundary tree CANONICAL (4 boundaries)

- `src/components/ErrorBoundary/AppErrorBoundary.tsx` (68 líneas) — top-level fallback con **emergency auto-save** (`saveToStorage(project)` on crash) + reload button.
- `src/components/ErrorBoundary/PanelErrorBoundary.tsx` (49 líneas) — per-panel boundary con `onReset` callback.
- `src/components/Viewport3D/SimulationErrorBoundary.tsx` (66 líneas) — WebGL/WebGPU/worker crash boundary.
- `src/components/Viewport3D/Viewport3D.tsx:17` exports `Viewport3DErrorBoundary`.

**Used in `Workspace.tsx`** wrapping: Copilot panel (2x), 2D Toolbar, 2D Editor, 3D Toolbar, Bottom Panel. **Consistent canonical adoption.**

**0 `react-error-boundary` library deps.** Pure custom implementation.

#### Toast slice CANONICAL (4 helpers + UI overlay)

- `src/store/copilotUISlice.ts:215-227` — `showToast` reducer (5-toast limit, auto-cleanup via timestamp).
- `src/store/copilotUISlice.ts:392-422` — 4 action creators: `showUndoToast`, `showSuccessToast`, `showErrorToast`, `showInfoToast` (`showInfoToast` is implied — verified line 416 has `showErrorToast`).
- `src/store/copilotUISlice.ts:246-252` — `cleanupExpiredToasts` automatic.
- `src/store/copilotUISlice.ts:352` — NEW_PROJECT extraReducer resets toasts.
- `src/components/CopilotPanel/CopilotToast.tsx` + `CopilotUIOverlay.tsx` — UI rendering at app root level.

**19 callsites** + integration with copilot pipeline (`useCopilotUI.ts:138, 271`, `useAgenticLoop.ts:83`, `App.tsx:21`). Used for: tool results, error notifications, undo prompts, storage-unavailable warning. **NOT infrautilizado** as inventory said — refuted.

#### `SolverError` types DECLARED (post-A6, adoption queued #687)

Verified `src/utils/cloth/solverProtocol.ts:178-200`:

```ts
export type SolverErrorCode =
  | 'wasm_memory_unavailable'
  | 'wasm_init_failed'
  | 'cpu_init_failed'
  | 'gpu_device_lost'
  | 'gpu_adapter_unavailable'
  | 'neural_model_load_failed'
  | 'neural_inference_failed'
  | 'mesh_invalid'
  | 'config_invalid'
  | (string & {}); // forward-compat

export interface SolverError {
  type: 'error';
  code: SolverErrorCode;
  message: string;
  details?: Record<string, unknown>;
}
```

**Currently adopted only on WASM tier** (`wasmSolverWorker.ts:498`). CPU + GPU + Neural use `{ message }` only. Migration to uniform shape across 4 tiers **deferred per A6 § 3.6.C decoupling — `#687` follow-up issue** (severity:medium, ~2-3h).

**E-async coordination decision** (§ 3.4): ratify pattern + cross-doc, NO bundle implementation (preserves 3.6 decoupling pattern from B6-state + A6 + A7).

#### Slice-level error patterns (canonical per slice)

- **`inspectorSlice.ts:39-41`** — `agentError: string | null`, `agentStreaming: boolean`, `diagnostics: Diagnostic[]`. **Consumed by `InspectorTab.tsx:44, 86-87, 111-115`** (renders agent error inline, streaming indicator, diagnostics list). **Pre-existing canonical for per-slice async-derived state.**
- **`pluginSlice.ts:42-44`** — `pluginErrors: Record<string, string>`. Consumed by PluginManager.
- **`projectSlice.ts:207, 235, 250`** — `loadDiagnostics: ValidationDiagnostic[]`, `loadQuarantine: Quarantine`. **Stored but NO UI consumer found** (gap 4).

#### State machine pattern emerging (2 sites)

- **`ImportSeamlyModal.tsx:18-21`** — `type ImportState = 'idle' | 'parsed' | 'importing' | 'success' | 'error'; const [state, setState] = useState<ImportState>('idle');`
- **`ExportSkillModal.tsx:17, 25`** — `type ExportState = 'editing' | 'exporting' | 'success' | 'error'; const [state, setState] = useState<ExportState>('editing');`

**Same shape, parallel implementations.** Could extract `useAsyncStateMachine<S>` (Pattern 2.5 lite) — addressed in § 3.6.

#### Hook composition canonical (post-C4)

- **`useSimulationLifecycle.ts`** + **`useCollisionBodies.ts`** + **`useMeshing.ts`** — C4 ratified. Async state for solver tier lives in hooks + Redux `solverTier` field. Already established.

**Conclusion (regla 1):** pre-existing canonical infrastructure exists for **error UI surface** (ErrorBoundary tree + Toast slice), **error type contracts** (SolverError + ToolResult), **per-slice async-derived state** (inspectorSlice + pluginSlice). Pre-existing canonical **absent** for: generic `useAsync<T>` hook, `<AsyncBoundary>` HOC, central error→UI auto-routing. The absent ones are **legitimate** absences (the codebase is feature-rich, not generic-async-bound).

### 2.5 Inventory claims verification consolidated

| Axis | Inventory framing | Reality | Verdict |
|---|---|---|---|
| **B8 — 3 Redux slices** | inspector + simulation + animation | Only **inspectorSlice** has true async state pattern (agentError/agentStreaming). simulationSlice is tier identity (post-A6/A7/C4). animationSlice is config-only. | **Misclassified** — 1 of 3 slices is async pattern. |
| **B8 — useState local** | "CopilotPanel, AgenticLoop" | **10+ sites**: CopilotPanel + AgenticLoop integration + SkillMarketplace + PluginManager + TemplateLibrary + AvatarPanel + CommandBar + ImportDXFDialog + ImportSeamlyModal + ExportSkillModal + ProjectView + FileExplorerView + ~5 more. | **Undercount.** |
| **B8 — sin estado ~10 features** | nesting, grading, BOM, DXF, mesh import, WASM init, RAG | Verified per-feature: most have alternative surfaces (config slices store result; copilot tools wrap async; useState local for transient). True "sin estado" features bounded to: CollisionBodyMesh load (gap 1) + worker pool errors (gap 5). | **Misclassified** — most "sin estado" are intentional (no UI state needed). |
| **D2 — variant counts** | A:150, B:40, C:30+, D:8, E:20, F:infrautilizado | A:308, B:189, C:164, D:8 ✓, E:~6 catch + ~14 non-catch, F:19 + 4 helpers. | **2-5x off + variant F refuted.** |
| **D8 — 5 gaps** | CollisionBodyMesh + wasmSolverWorker + useAgenticLoop + validator + worker pool | Gap 2 closed by A3, Gap 3 closed by BUG-15. **3 remain.** | **2/5 closed pre-E-async.** |
| **"Probablemente el eje más grande"** | sub-track multi-session | Single F2 doc + ~3 surgical UI commits + convention table — bounded scope post-canonical-infra-discovery. | **Reformulated.** |

### 2.6 Cross-axis interaction analysis (4 features traced end-to-end)

Per kickoff regla "trace 2-3 features end-to-end". Below: 4 features, B8 location → D2 propagation → D8 surface.

#### Feature 1: Mesh import (CollisionBodyMesh)

- **B8**: useState `[scene, setScene]` local (CollisionBodyMesh.tsx:30). No Redux slice for collision body load state.
- **D2**: try/catch around `importMesh().then().catch(err => console.warn('Failed to load:', body.name, err))` (line 41-44). **Variant C (silent telemetry).**
- **D8**: NO UI surface. Component returns `<group ref={groupRef}>` with `scene` null until load completes; if load fails, scene stays null forever, no indicator. **GAP 1 CONFIRMED.**

#### Feature 2: WASM init / cloth simulation (post-A3 + post-C4)

- **B8**: `simulationSlice.solverTier: SolverTier` (Redux). `useSimulationLifecycle` hook owns lifecycle (refs to gpuClient/wasmClient/cpuClient/neuralClient). `useState<boolean>(running)` in lifecycle hook.
- **D2**: post-A3, structured `{type:'error', code:'wasm_memory_unavailable', message}` postMessage from worker (`wasmSolverWorker.ts:498`). Plus `wasmNaNCount` telemetry counter (rate-limited console.warn). **Variant A-extended (structured) + Variant C (telemetry counter).**
- **D8**: post-A3 + BUG-15 — `wasmSolverClient.onError?.(msg)` callback hookable; `useAgenticLoop` dispatches `showErrorToast` for loop errors; **`SimulationStatusOverlay`** (post-A7+C4) shows tier label + capability warnings + tool silent-absence warning. **CLOSED via canonical.**

#### Feature 3: Skill marketplace install (per-feature ad-hoc)

- **B8**: useState `browseLoading` + `browseError` + `installingIds` + `availableSkills` (SkillMarketplace.tsx:24-27). No Redux for browse state (transient). `RegisteredSkill` collections in Skill registry but not Redux.
- **D2**: try/catch + `console.error('Install failed:', err)` + `setBrowseError(msg)`. **Variants C + E mixed (telemetry + state setter).**
- **D8**: inline render: `<div className="skill-marketplace__error">` + `<div className="skill-marketplace__loading">` (lines 160-169). **OK ad-hoc** — works, but no shared pattern.

#### Feature 4: Project load + validator diagnostics

- **B8**: `projectSlice.loadDiagnostics: ValidationDiagnostic[]` (line 207) + `loadQuarantine: Quarantine` (line 209). Stored on `loadProject` reducer (line 250).
- **D2**: validator's 9 `console.error/warn` per diagnostic (`projectValidator.ts:129, 144, 161, 214, 239, 266, 295`). Returns `ValidationResult{project, diagnostics, quarantine}`. **Variant C (console) + persisted state.**
- **D8**: **NO UI consumer**. State stored, never rendered. `Workspace.tsx:188` only `console.warn('Autosave parse warnings')`. **GAP 4 CONFIRMED.**

#### Cross-axis pattern detected

**4 features show 4 different shape combinations**, each legitimate:

| Feature | B8 location | D2 propagation | D8 surface |
|---|---|---|---|
| Mesh import | useState | console.warn | **GAP** |
| WASM init | hook + Redux | structured postMessage + counter | Toast + Overlay |
| Skill marketplace | useState | console + setter | inline ad-hoc |
| Validator | Redux state | console + persisted | **GAP** |

**Cross-axis decisions are legitimate per-feature**, not violations:
- Toast surface OK when error is **transient + user-actionable** (skill install, validator could be).
- Inline state OK when error is **modal-scoped + recoverable** (skill marketplace, plugin manager).
- ErrorBoundary OK when error is **fatal + unrecoverable** (component crashes).
- Hook + Redux OK when state is **cross-feature persistent** (solver tier, agent error).

The drift is NOT in choosing per-feature; the drift is **bounded gaps** where surface is missing entirely (3 gaps). § 3.5 addresses.

### 2.7 Outside obvious dirs sweep (regla 6)

```bash
grep -rln "useTransition\|useDeferredValue\|Suspense\|fallback=" src/
# Returns: GarmentSimulation.tsx, AppShell.tsx, Viewport3D.tsx (all R3F internal Suspense, NOT React 18 patterns).

grep -rn "React\.lazy\|import\(" src/
# 0 React.lazy usage. dynamic imports limited to lazy IDB load (avatarSlice persistPoses).

grep -rn "useAsync\b\|useFetch\b\|useQuery\b" src/
# 0 hits.
```

**Confirmed: codebase has 0 generic async hooks** (`useAsync` / `useFetch` / `useQuery`), 0 React.lazy / Suspense beyond R3F's internal use, 0 external library deps for async UI patterns. This is **legitimate** — per-feature surfaces work; abstraction would be premature for 4-5 distinct shapes.

```bash
grep -rln "react-toastify|react-hot-toast|sonner|notistack|react-error-boundary|react-query|tanstack" package.json
# (no output)
```

**0 toast/error/async library deps.** Pure custom Toast slice + ErrorBoundary tree. Confirmed.

### 2.8 Compile-gate trigger anticipation (regla 3a + 8)

**Risk class:** § 3.1 sub-options proposing `useAsyncState<T>` hook canonical (Option B) WOULD trigger compile-gate via `interface UseAsyncResult<T>` extension across consumers. Anticipated TS2416 errors:

- **Loading shape divergence:** SkillMarketplace `browseLoading: boolean`, TemplateLibrary `loading: string | null`, ImportSeamlyModal state machine `'idle' | 'importing'`, etc. — structurally divergent. Forcing uniform `loading: boolean` requires per-consumer migration; 10+ sites.
- **Error shape divergence:** `error: string | null` (most), `pluginErrors: Record<string, string>` (PluginManager), `agentError: string | null` (inspectorSlice), `state: 'error' \| ...` (state machines). Different cardinalities (single vs map) + nullability conventions.
- **Result data divergence:** each feature has distinct `data` shape (skills, templates, plugins, etc.) — generic `<T>` is achievable but consumer migration cost is breadth-heavy.

**Mitigation:** § 3.1.A (status quo per-feature ratify) + § 3.6.A (state machine pattern ratify as emerging convention) AVOID interface extension entirely. No compile-gate trigger. § 3.6.B (extract `useAsyncStateMachine<S>` Pattern 2.5 lite) is bounded — 2 consumers, structural verification doable in F3.

A6 § 4.5.5 sub-rule "Compile-gate convergence verification" applies forward: anticipate failure class for `useAsyncState<T>` if ever proposed. NOT proposed in recommendation; documented as anti-pattern reason.

### 2.9 Sweep negativo (qué NO emergió)

- **0** alternative async state libraries (no `react-query`, `swr`, `zustand-async`, `xstate`, etc.).
- **0** `<AsyncBoundary>` HOC pattern.
- **0** central error→UI auto-router (no middleware that catches all `{type:'error'}` actions and dispatches toast).
- **0** generic `useAsync<T>` / `useFetch<T>` hooks.
- **0** Suspense usage outside R3F internal.
- **0** React.lazy code-splitting.
- **0** test infrastructure asserting async UI state coverage (no "loading state appears in tests" coverage).

Sweep cerró clean — no surprise pre-existing infrastructure beyond the 6 canonicals already documented (ErrorBoundary tree + Toast slice + SolverError types + per-slice patterns + state machine + hook composition).

### 2.10 Reformulation per regla 13 (9° caso del audit)

Inventory framing: **"B8 + D2 + D8 son el mismo problema visto desde 3 ángulos"** + **"sub-track de scope grande"**.

Reality post-sweep: **3 ortogonal concerns con bounded coverage gaps + canonical infrastructure pre-existente**. Cross-axis interactions DO exist but son **legitimate architectural couplings** (D2 variant choice afecta D8 surface — naturally; B8 location afecta D2 propagation — naturally), no drift.

**Lineage de regla 13 reformulations cumulativas (8 → 9 post-E-async):**

| # | Eje | Inventory framing | Reformulación |
|---|---|---|---|
| 1 | B12-state | "drift cosmético" | `newProjectRegistry` + 27 invariant tests pre-existed |
| 2 | C7 | "drift, custom pan re-implements" | Custom pan = intentional feature (orbit-around-avatar) |
| 3 | B5-state | "drift cosmético, factory vs const" | Factory pattern vestigial; consistency alignment |
| 4 | D1-cosmetic | "drift cosmético, 3 casings" | 3 distinct linguistic roles |
| 5 | D5 | "layering violations" | Feature ownership legitimate |
| 6 | A4 | "Rust↔TS cross-language drift" | TS-internal cross-tier; Rust not consumer-facing |
| 7 | A2 | "config types unify cross-boundary" | Variant A/B ratified as-is + Variant C Pattern 2.5 lite |
| 8 | C4 | "3 solvers + tool duplication" | 4 tiers + tool surface tier-feature by design |
| **9** | **E-async** | **"3 axes son mismo problema, sub-track scope grande"** | **3 ortogonal concerns + canonical infra pre-existente + bounded gaps** |

**62% rule sustained:** of 27 closed ejes pre-E-async, ~16-17 closed as ratify-by-convention dominant. E-async closes consistent with pattern (8 sub-decisions: 5+ ratify, 2-3 Pattern 2.5 extend bounded).

---

## Sección 3 — Sub-decisiones, opciones y tradeoffs

8 sub-decisiones (6 axis + 1 cross-axis + 1 stage-2-structure). Some axes have multiple sub-decisions due to compound nature.

### 3.1 B8-state axis — state location convention

**Pregunta:** ¿per-feature decision con doc anchor, force unified `useAsyncState<T>` hook canonical, force Redux-canonical para todos async ops, o status quo sin doc?

#### Opción 3.1.A — Per-feature ratify with convention table doc (RECOMENDADA)

**Shape:** ratificar el per-feature pattern current (Redux for cross-feature persistent, useState local for transient single-feature, state machine for multi-step modals, hook + Redux for cross-feature lifecycle). Anchor convention table en CLAUDE.md "Async state location patterns (E-async ratified)" + JSDoc cross-doc en 3-5 representative sites.

**Convention table draft:**

| Use case | Pattern | Example | Rationale |
|---|---|---|---|
| Cross-feature persistent error | Redux slice with explicit error field | `inspectorSlice.agentError`, `pluginSlice.pluginErrors` | Selectors enable cross-component rendering + Redux DevTools traceability |
| Single-feature transient error | useState local | SkillMarketplace.browseError, TemplateLibrary.loading | Avoids Redux noise for component-internal state |
| Multi-step UX flow (modal/dialog) | State machine via useState | ImportSeamlyModal.state, ExportSkillModal.state | Discriminated union prevents impossible states (e.g., loading + success simultaneously) |
| Cross-feature async lifecycle | Custom hook + Redux refs | useSimulationLifecycle (C4), useAgenticLoop | Hook composition canonical (C4 1° anchor); Redux for shared identity (solverTier) |
| Component crash boundary | ErrorBoundary tree | App + Panel + Viewport3D + Simulation | Last-resort fallback for unrecoverable crashes |
| Storage degradable fallback | Silent catch + helper fallback | avatarSlice.persistPoses, useParametricEngine LS reads | BUG-10 precedent — fire-forget acceptable when fallback path is documented |

**Pros:**
- **Pre-existing canonical (regla 1):** all 6 patterns already in use; ratification documents the implicit convention.
- **No code change required for ratification axis** (only doc + JSDoc cross-refs).
- **Forward-compat:** new features choose pattern from table per use case.
- **Aligned con audit philosophy** (regla 11 — consistency alignment when smell stable + bounded surface; B5-state precedent).
- **62% rule consistent** — ratify-by-convention dominant.

**Cons:**
- Discipline-bound — convention is doc, not lint-enforced. Future devs may diverge if not visible enough.
- Convention table is judgment-call boundary cases (e.g., "is plugin install transient? cross-feature?" — both interpretations defensible).

**Confidence:** **high**. 6th ratify-by-convention case for an axis where canonical infra is rich.

#### Opción 3.1.B — Force unified `useAsyncState<T>` hook canonical (Pattern 1)

**Shape:** extract `function useAsyncState<T>(): { data: T | null; loading: boolean; error: Error | null; setLoading; setData; setError; reset }` hook. Migrate ~10 useState consumers to hook.

**Pros:**
- Single canonical pattern.
- Compile-time uniformity across consumers.

**Cons (primary):** **Compile-gate trigger anticipated** (per § 2.8) — loading/error/data shapes diverge across consumers (boolean vs string vs Record vs state machine). Forcing uniform requires per-consumer migration with structural reshape.

**Cons (secondary):** **YAGNI for current shape.** Consumers each have specific needs (e.g., SkillMarketplace tracks `installingIds: Set<string>` — multi-id concurrent ops; doesn't fit `useAsyncState<T>` single-data shape). Forcing fit creates abstraction friction.

**Cons (tertiary):** **Cost open-ended** — 10+ consumer migrations + state machine pattern incompatibility (sites 1-2 vs hook). F3 ~8-15h + risk regression.

**Confidence:** **low**. Anti-pattern per audit philosophy (real fix has weak signal — current pattern works; abstraction premature).

#### Opción 3.1.C — Force Redux-canonical for all async ops

**Shape:** migrate all useState `loading/error` to Redux slices. Each feature gets dedicated slice fields.

**Pros:**
- Single source of truth.
- Redux DevTools traceability.

**Cons:**
- **Massive Redux noise** for transient state (modal loading flags don't belong in global state).
- **Performance regression** — every keystroke in modal triggers Redux subscriptions.
- **Cost prohibitive** — 10+ feature migrations + slice expansions + selector additions.

**Confidence:** **very low**. Anti-pattern.

#### Opción 3.1.D — Status quo (no doc anchor)

**Shape:** leave per-feature decisions implicit, no doc.

**Cons:**
- Future devs lack guidance; divergence increases over time.
- Doesn't address the inventory framing "drift real" weight (regla 11 alignment unsatisfied).

**Confidence:** **low**. Misses opportunity to anchor.

#### Recomendación 3.1

**Lean: Opción 3.1.A (per-feature ratify with convention table doc).** Confidence: **high**.

Razones:
- Pre-existing canonical (regla 1) — 6 patterns identified, all in active use.
- Audit philosophy regla 11 — consistency alignment when smell stable + bounded.
- 62% rule sustained — ratify dominant.
- 0 code change for ratification (only doc + JSDoc).
- Convention table forward-compat.

### 3.2 D2 axis — error propagation convention table

**Pregunta:** ¿anchor 6-variant convention table con when-to-use rules, force `Result<T,E>` everywhere via Pattern 1, force `ToolResult` everywhere, o status quo?

#### Opción 3.2.A — Anchor 6-variant convention table en CLAUDE.md (RECOMENDADA)

**Shape:** document the 6 variants with when-to-use rules. Variant counts post-sweep + use-case + canonical examples. Tabla en CLAUDE.md "Error propagation patterns (E-async ratified)".

**Convention table draft:**

| Variant | When to use | Canonical example | Counter-example (don't) |
|---|---|---|---|
| **A. ToolResult** `{success:false, error}` | Copilot tool execution (per B9-state ratified). Recoverable via tool-level retry. | `nestingTools.ts:48 return {success:false, error:'No pieces to nest'}` | Don't use outside copilot tools — `success` field overloads semantics |
| **B. throw new Error** | Parsing/validation/sandbox boundary. Caught by AgenticLoop / component try-around-call / ErrorBoundary. Indicates programmer expectation violation. | `safeEval.ts` (formula parse), `actionExecutor.ts` (action validation), `pluginManager.ts` (plugin constraint) | Don't throw in render path or hot loop — interrupt-control-flow cost + boundary unwinding |
| **C. console.error/warn** | Non-blocking developer telemetry. Rate-limited if frequent. Production logging. | `wasmNaNCount` rate-limited (A3 § 5.4), `gpuSolverClient` diagnostics | Don't use as primary user-facing surface — user can't see console |
| **D. Silent catch** `catch { /* ignore */ }` | Storage degradable + cleanup paths where fallback is documented. BUG-10 precedent. | `avatarSlice.persistPoses` (IDB fire-forget), `secureStorage.ts:105` (sessionStorage cleanup), `storage.ts:114, 131` (LS fallback) | Don't silent-catch logic errors or data validation failures — masks bugs |
| **E. return null/undefined** | "Absence is signal" — operation has no result vs operation failed. Distinct from error. | `getCachedSkill(id)` returns null when not found (vs throwing `NotFound`) | Don't return null when error is the right answer (use throw or Result) |
| **F. showToast** (Variant F1: `showSuccessToast` / F2: `showErrorToast` / F3: `showInfoToast` / F4: `showUndoToast`) | User-facing transient notifications. Auto-dismiss (3-8s). | App.tsx storage unavailable (1), useAgenticLoop loop error (BUG-15), useCopilotUI tool result (3+) | Don't toast for unrecoverable crashes — use ErrorBoundary; don't toast for inline-recoverable errors — use inline UI |

**Cross-cutting rule (regla 11 alignment):** when async op spans **tier boundary** (Rust↔TS, worker↔main, network↔local) → use **structured `SolverError` shape** (extends Variant A — `{type:'error', code, message, details?}`); when async op stays **single-tier** → use Variant per use case from table above.

**Pros:**
- **Pre-existing canonical (regla 1)** — 6 variants all in active use; ratification documents.
- **0 code change** for ratification.
- **Forward-compat** — new error sites pick variant from table.
- **Refutes inventory "infrautilizado"** for variant F — counts (19 callsites + 4 helpers) prove canonical adoption.
- **Coordinates with #687** — explicit hand-off (E-async ratifies pattern; #687 implements adoption to CPU/GPU/Neural tiers).

**Cons:**
- Discipline-bound (no lint enforcement).
- Boundary cases (e.g., when does throw vs Result win?) require judgment.

**Confidence:** **high**. 6 variants verified legitimate per use case.

#### Opción 3.2.B — Force `Result<T,E>` everywhere (Pattern 1)

**Shape:** introduce `type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E }`. Migrate all 189 throw + ~30 console.error sites + 308 ToolResult callsites to uniform Result.

**Pros:**
- Single canonical for errors. Compile-time error handling enforced.

**Cons (primary):** **Massive cost.** ~500+ callsite migrations across 200+ files. F3 estimate: 30-50h.

**Cons (secondary):** **Compile-gate trigger guaranteed** — `ToolResult` already has `success: false` shape (different from `ok: false`); migration would force breaking change to copilot tool registry (B9-state ratified — 308 callsites). Cross-eje cascade.

**Cons (tertiary):** **Variant D (silent storage fallback) doesn't fit Result.** BUG-10 precedent shows silent catch is correct for IDB fire-forget; forcing Result wraps everything in `Result<void, Error>` boilerplate without value.

**Cons (quaternary):** **Throw IS Result.** TypeScript convention is throw for parse/validation; forcing Result wraps native exceptions. Anti-pattern unless full Rust-style error model adopted (not happening).

**Confidence:** **very low**. Anti-pattern per audit philosophy (regla 11 — uniform-for-its-own-sake without observable bug signal).

#### Opción 3.2.C — Force `ToolResult` everywhere

**Shape:** make `ToolResult` the universal error shape outside copilot tools too.

**Cons:**
- `success` field overloads semantics outside tool execution context. Confusing.
- Doesn't fit non-tool sites (e.g., parser returning Result, storage fire-forget, console telemetry).

**Confidence:** **very low**. Wrong abstraction.

#### Opción 3.2.D — Status quo (no convention table)

**Cons:**
- Future devs lack guidance.
- Inventory "drift real" framing not addressed.

**Confidence:** **low**.

#### Recomendación 3.2

**Lean: Opción 3.2.A (anchor 6-variant convention table).** Confidence: **high**.

Razones:
- Pre-existing canonical for all 6 variants.
- 0 code change.
- Refutes inventory "infrautilizado" claim (variant F).
- Coordinates with #687 cleanly.
- Pattern 1 alternatives (3.2.B/C) are anti-patterns per philosophy + cost.

### 3.3 D2 axis — silent variant D audit

**Pregunta:** ¿ratify storage / parsing / fire-forget cases (8 identified) como legítimos, surface as telemetry counter (extend A3 NaN pattern), o eliminate variant D?

**Inventory of 8 confirmed silent-catch sites:**

| Site | Context | Justification | Verdict |
|---|---|---|---|
| `storage.ts:114` | IDB clear failure | Cleanup path; LS fallback documented | **Legitimate** |
| `storage.ts:131` | IDB delete failure | Cleanup path | **Legitimate** |
| `secureStorage.ts:105` | sessionStorage cleanup of stale entry | Already in catch (decryption failed); cleanup is best-effort | **Legitimate** |
| `AgentSettings.tsx:55, 68` | LS read of agent settings | Returns default if absent/corrupt | **Legitimate** |
| `ProjectMemory.ts:166` | LS persistence | Fire-forget; LLM context preserved separately | **Legitimate** |
| `avatarSlice.ts:226` | IDB fire-forget pose persistence | BUG-10 comment: "errors surfaced via helper's existing fallback path" | **Legitimate** (anchored) |
| `UnifiedBar.tsx:37, 105` | LS settings persistence | Fire-forget UI state | **Legitimate** |
| `useParametricEngine.ts:288, 336` | LS reads | Returns default if absent | **Legitimate** |
| `pluginLoader.ts:454-455` | JSON parse of LS-stored manifest | Returns null on parse failure (covered by Variant E) | **Legitimate** |
| `ollama.ts:66` | LS read of Ollama config | Returns default | **Legitimate** |
| `types.ts:181, 211` | LS reads | Returns default | **Legitimate** |

**14 callsites** total identified. All 14 fall into 3 legitimate buckets:
1. **Storage degradable fallback** (10 sites) — LS/IDB read/write where fallback path is documented.
2. **Cleanup best-effort** (3 sites) — cleanup of stale entries; failure non-blocking.
3. **Parse degradable** (1 site) — JSON parse returning null (Variant E overlap).

#### Opción 3.3.A — Ratify all 14 cases as legitimate (RECOMENDADA)

**Shape:** anchor in convention table (§ 3.2.A Variant D row) the 3 legitimate buckets. NO code change. Reference `avatarSlice.persistPoses` BUG-10 comment as canonical example.

**Pros:**
- 14 cases verified legitimate per use case.
- 0 code change.
- BUG-10 precedent already documents reasoning.
- Audit philosophy regla 11 aligned.

**Cons:** discipline-bound — future silent-catches must be reviewed for legitimacy (no lint).

**Confidence:** **high**.

#### Opción 3.3.B — Surface as telemetry counter (extend A3 NaN pattern)

**Shape:** add module-level counters per silent-catch site (e.g., `idbWriteFailures`, `lsReadFailures`) + rate-limited console.warn when threshold crossed.

**Pros:**
- Diagnostic signal for production frequency tracking.

**Cons:**
- Cost vs benefit weak — these silent catches are KNOWN degradable paths; counter adds noise without actionable signal.
- 14 counters proliferation (per-site or aggregate) requires design decision.
- A3 NaN counter is for **unknown failure classes** in hot path; here failures are KNOWN (browser denied LS, etc.).

**Confidence:** **medium-low**. Defensible but cost-benefit weak.

#### Opción 3.3.C — Eliminate variant D entirely

**Shape:** convert all silent catches to explicit error handling (toast, console.error, propagate).

**Cons:**
- `avatarSlice.persistPoses` IDB fire-forget would become awkward (reducer can't await; turning sync setter into async breaks pattern).
- LS reads with default-on-failure semantics would become `try { return JSON.parse(raw) } catch (e) { console.warn(...); return DEFAULT }` — adds noise without value.
- Audit philosophy regla 11 misalignment (smell stable, no observable bug).

**Confidence:** **very low**. Anti-pattern.

#### Recomendación 3.3

**Lean: Opción 3.3.A (ratify all 14 cases).** Confidence: **high**.

Razones:
- All 14 cases verified legitimate per 3 buckets.
- BUG-10 precedent documents reasoning.
- 0 code change.

**Counter:** if future production telemetry signals high frequency of LS failures (suggesting browser quota issues common), reopen 3.3 evaluating Opción B for specific high-frequency sites.

### 3.4 D2 axis — `SolverError` adoption coordination con #687

**Context:** `SolverError` + `SolverErrorCode` types declared in `solverProtocol.ts:178-200` post-A6. Currently adopted only on WASM tier (`wasm_memory_unavailable` post-A3). #687 follow-up issue (severity:medium, ~2-3h) tracks adoption to CPU + GPU + Neural tiers.

**Pregunta:** ¿E-async ratifies pattern + #687 implements (current decoupling), fold #687 into E-async closure (bundled), o defer entirely?

#### Opción 3.4.A — Coordinate (E-async ratifies, #687 implements) (RECOMENDADA)

**Shape:** E-async § 3.2.A convention table includes `SolverError` as **canonical extension of Variant A for cross-tier (Rust↔TS / worker↔main) errors**. Cross-doc anchor in CLAUDE.md. #687 retains independent implementation — fires on schedule per A6 follow-up queue.

**Pros:**
- Preserves 3.6 decoupling pattern (B6-state + A6 + A7 precedent).
- E-async closure clean (Pattern 2.5 hybrid scope bounded).
- #687 has clear acceptance criteria (already in issue body).
- Future tier ports inherit pattern.

**Cons:**
- Adoption depends on #687 actually being worked. Schedule risk.
- E-async ratification is "pattern declared but not fully adopted" until #687 lands.

**Confidence:** **high**. Aligned con audit decoupling philosophy.

#### Opción 3.4.B — Fold #687 into E-async closure (bundled)

**Shape:** Stage 2 includes #687 implementation (CPU + GPU + Neural error shape adoption).

**Pros:**
- Single closure for error pattern + adoption.
- E-async ratification fully effective.

**Cons:**
- **Bundles distinct concerns.** E-async is convention + UI gap closure; #687 is per-tier worker protocol modification (A6 territory).
- **Cost expansion** — F3 from ~3-5h to ~6-8h.
- **Cross-eje boundary blur** — A6 RFC explicitly delegated #687 to per-feature follow-up post-decoupling.
- **Risk concentration** — A6 decoupling philosophy was specifically to distribute risk; folding reverts that.

**Confidence:** **medium-low**. Defensible if Sam prefers visibility of full closure, but counter audit philosophy.

#### Opción 3.4.C — Defer entirely (E-async doesn't reference SolverError)

**Cons:**
- Misses opportunity to anchor SolverError as canonical for cross-tier errors.
- #687 lands without convention reference; future tier additions rederive.

**Confidence:** **low**.

#### Recomendación 3.4

**Lean: Opción 3.4.A (coordinate, decoupling preserved).** Confidence: **high**.

Razones:
- A6 § 3.6.C explicit decoupling decision.
- 3.6 pattern robust (3 data points: B6-state + A6 + A7).
- E-async closure cost bounded.
- #687 has clear acceptance criteria.

### 3.5 D8 axis — enumerated gap surfacing (3 gaps post-A3 + BUG-15)

**Pregunta per gap:** ¿Pattern 2.5 extend (surgical UI addition leveraging canonical Toast/inline), generic `<AsyncBoundary>` HOC Pattern 1, o status quo?

#### 3.5.1 Gap 1: CollisionBodyMesh:44 console.warn

**Current:** `console.warn('[CollisionBodyMesh] Failed to load:', body.name, err)` (line 44). User sees nothing — collision body silently fails to load.

**Use case:** user adds a collision body via mesh upload; if mesh import fails (corrupt file, MeshImportLimitError, network), no UI feedback.

##### Opción 3.5.1.A — Pattern 2.5 extend: dispatch `showErrorToast` (RECOMENDADA)

```ts
// CollisionBodyMesh.tsx:41-44 BEFORE:
}).catch(err => {
  console.warn('[CollisionBodyMesh] Failed to load:', body.name, err);
});

// AFTER:
}).catch(err => {
  console.warn('[CollisionBodyMesh] Failed to load:', body.name, err);
  const msg = err instanceof MeshImportLimitError
    ? `Collision body "${body.name}" exceeds size limit: ${err.message}`
    : `Failed to load collision body "${body.name}": ${err.message ?? 'unknown error'}`;
  dispatch(showErrorToast(msg));
});
```

Plus useDispatch import + remove `console.warn` (or keep as developer telemetry, dispatch as user surface).

**Pros:**
- **Toast canonical** (refuted "infrautilizado" claim — variant F is heavily used).
- **MeshImportLimitError-aware** message (size limit specific).
- **Surgical** — ~5-8 líneas net add.
- **No useState needed** — toast surface is dispatch + auto-dismiss.

**Cons:**
- Couples collision body load to copilotUISlice. Acceptable per D5 ratified ("feature ownership legitimate when same feature" — toast is shared UI).

**Confidence:** **high**. Mirror of canonical pattern (App.tsx storage unavailable, useAgenticLoop loop error).

##### Opción 3.5.1.B — Inline error UI in component

**Shape:** `useState` `[loadError, setLoadError]` + render error indicator if set.

**Cons:** CollisionBodyMesh renders `<group ref>` with mesh — no UX-natural place for inline error indicator. Toast is better fit (transient + non-blocking).

**Confidence:** low.

##### Opción 3.5.1.C — Status quo

**Cons:** gap persists. User sees nothing.

**Confidence:** very low.

**Recomendación 3.5.1: Opción 3.5.1.A.** ~5-8 líneas + JSDoc cross-doc.

#### 3.5.2 Gap 4: Validator diagnostics consumer

**Current:** `projectSlice.loadDiagnostics: ValidationDiagnostic[]` stored on `loadProject` action (line 250). 9 `console.error/warn` per diagnostic in validator. **NO UI consumer found.**

**Use case:** user loads a project file (via File Explorer or Workspace import); validator runs + repairs; diagnostics array goes to state but never rendered. User loses signal that file had issues (e.g., quarantined pieces, repaired seams).

##### Opción 3.5.2.A — Workspace post-load toast aggregator (RECOMENDADA)

```tsx
// In Workspace.tsx or new component LoadDiagnosticsToast
const loadDiagnostics = useSelector((s: RootState) => s.project.loadDiagnostics);

useEffect(() => {
  if (loadDiagnostics.length === 0) return;
  const errors = loadDiagnostics.filter(d => d.severity === 'error').length;
  const warnings = loadDiagnostics.filter(d => d.severity === 'warning').length;
  if (errors > 0) {
    dispatch(showErrorToast(`Project loaded with ${errors} error(s) and ${warnings} warning(s). Open Inspector for details.`));
  } else if (warnings > 0) {
    dispatch(showInfoToast(`Project loaded with ${warnings} warning(s).`));
  }
}, [loadDiagnostics]);
```

Plus optional: link toast to a dedicated diagnostic panel (out-of-scope for E-async — captured § 8 deuda).

**Pros:**
- **Toast aggregation** avoids spamming user with N toasts.
- **Severity-aware** — errors get error toast, warnings get info toast.
- **Surgical** — single useEffect + dispatch.

**Cons:**
- Toast is transient — diagnostic detail not preserved in UI (user must open Inspector — but no panel currently shows them).
- Inspector currently shows runtime diagnostics (D7 ratified ortogonal types) — extending to load diagnostics is separate eje.

**Confidence:** **medium-high**. Surfaces signal; full panel UI deferred.

##### Opción 3.5.2.B — Dedicated diagnostic panel

**Shape:** new `LoadDiagnosticsPanel` component displayed when `loadDiagnostics.length > 0`.

**Cons:** UX shape decision (modal vs sidebar vs inline) — out-of-scope for E-async per § 1.2 (UX choice deferred to product). Captured § 8 deuda.

**Confidence:** medium. Defensible but UX-shape-dependent.

##### Opción 3.5.2.C — Inspector tab integration

**Shape:** extend InspectorTab to also show loadDiagnostics.

**Cons:** D7 ratified `ValidationDiagnostic` (load-time) and `Diagnostic` (runtime) as ortogonal — same panel mixing semantics. Future eje.

**Confidence:** low. Cross-D7 implications.

##### Opción 3.5.2.D — Status quo

**Cons:** gap persists. User loses signal.

**Confidence:** very low.

**Recomendación 3.5.2: Opción 3.5.2.A.** ~10-15 líneas + JSDoc. Full panel UI deferred to follow-up.

#### 3.5.3 Gap 5: Worker pool errors UI surface

**Current:** `reactiveSolverMiddleware.ts:478-486` — `state.pool.onError((error, jobId) => { console.error(...); state.metrics.errors.push(error); ... })`. Internal `metrics.errors[]` array (max 10). NOT exposed to Redux state, NOT rendered.

**Use case:** parametric construction worker pool can fail (worker crashed, formula eval errored); user sees no feedback when piece fails to build.

##### Opción 3.5.3.A — Aggregated toast + Redux exposure (RECOMENDADA)

```ts
// In reactiveSolverMiddleware.ts:481
state.pool.onError((error: string, jobId?: string) => {
  console.error('[ReactiveSolver] Worker error:', error, jobId);
  state.metrics.errors.push(error);
  if (state.metrics.errors.length > 10) state.metrics.errors.shift();

  // NEW: surface to Redux + toast (rate-limited)
  if (storeDispatch) {
    storeDispatch(setLastSolverError({ error, jobId, timestamp: Date.now() }));
    if (shouldEmitToast()) {  // rate limit — 1 toast per 5s
      storeDispatch(showErrorToast(`Construction error: ${error}`));
    }
  }
});
```

Plus: `inspectorSlice` (or new `solverSlice`) gains `lastSolverError: { error, jobId, timestamp } | null` field. InspectorTab or RHS panel renders if present.

**Pros:**
- **Toast canonical** + state preservation (last error visible until next load).
- **Rate-limited** to prevent spam (worker errors can cascade).
- **Redux exposure** enables InspectorTab integration.

**Cons:**
- New slice field requires decision: `inspectorSlice` extension vs new field on existing slice. Captured as § 5 commit decision.
- Rate-limit infrastructure adds ~5 líneas.

**Confidence:** **medium-high**.

##### Opción 3.5.3.B — Rich diagnostic panel

**Cons:** UX shape decision — out-of-scope per § 1.2.

**Confidence:** medium. Deferred.

##### Opción 3.5.3.C — Status quo

**Cons:** gap persists.

**Confidence:** very low.

**Recomendación 3.5.3: Opción 3.5.3.A.** ~15-20 líneas + slice field + rate-limit helper.

#### 3.5 Aggregate

**3 gaps + 3 surgical UI additions + Pattern 2.5 extend canonical reuse.** Total F3 cost: ~30-40 líneas TS + JSDoc + tests. Mirrors A3 § 5.3 surgical addition shape.

**Generic `<AsyncBoundary>` HOC Pattern 1 alternative rejected:** would require refactor of 10+ consumer sites + structural divergence (loading boolean vs string vs state machine). Scope-cost mismatch with bounded 3-gap scope.

**Status quo rejected:** gaps are real (verified per inventory + sweep); ignoring violates regla 11 weight.

### 3.6 D8 axis — state machine pattern emerging (2 sites)

**Context:** `ImportSeamlyModal` + `ExportSkillModal` both use `type State = 'idle' | 'X' | 'success' | 'error'` shape via useState. Same pattern, parallel implementations.

**Pregunta:** ¿ratify as emerging convention, extract `useAsyncStateMachine<S>` hook (Pattern 2.5 lite), o status quo?

#### Opción 3.6.A — Ratify as emerging convention (RECOMENDADA)

**Shape:** anchor state machine pattern in convention table (§ 3.1.A Variant 3 row): "multi-step UX flow → discriminated union via useState." Reference 2 canonical examples. NO code change.

**Pros:**
- **2 sites = emerging pattern**, not yet drift. Ratification documents intentional shape.
- 0 code change.
- Forward-compat — new modals follow pattern.
- Discriminated union prevents impossible states (e.g., loading + success simultaneous).

**Cons:**
- Discipline-bound — future modals may diverge (use multi-useState instead).

**Confidence:** **high**. Per regla 11 — pattern stable, smell absent.

#### Opción 3.6.B — Extract `useAsyncStateMachine<S>` hook (Pattern 2.5 lite)

**Shape:** new `src/hooks/useAsyncStateMachine.ts` with:

```ts
export function useAsyncStateMachine<S extends string>(
  initialState: S,
): {
  state: S;
  setState: (s: S) => void;
  isIn: (s: S | S[]) => boolean;
  reset: () => void;
} {
  const [state, setState] = useState<S>(initialState);
  const isIn = useCallback((s: S | S[]) =>
    Array.isArray(s) ? s.includes(state) : state === s, [state]);
  const reset = useCallback(() => setState(initialState), [initialState]);
  return { state, setState, isIn, reset };
}
```

Migrate ImportSeamlyModal + ExportSkillModal to hook. ~5-10 líneas hook + ~5 líneas per consumer migration.

**Pros:**
- **Captures the emerging pattern** as reusable hook.
- **`isIn` helper** ergonomics for multi-state checks.
- **Pattern 2.5 lite shape** — 5° data point post-C4 (D4 + B10 Par 1 + A2 + C4 + E-async).

**Cons:**
- 2 consumers — N=2 borderline for hook extraction (regla 11 — no real bug, no observable smell).
- Adds abstraction layer for trivial pattern.
- Migration cost low but not zero.

**Confidence:** **medium**. Defensible Pattern 2.5 lite — but borderline whether necessary.

#### Opción 3.6.C — Status quo

**Cons:**
- Pattern not anchored; future modals may diverge.

**Confidence:** low.

#### Recomendación 3.6

**Lean: Opción 3.6.A (ratify as emerging convention).** Confidence: **medium-high**.

Razones:
- 2 sites = emerging, not yet drift requiring extraction.
- Convention table doc (§ 3.1.A) captures pattern.
- Pattern 2.5 lite hook (3.6.B) is defensible if Sam prefers extraction — would add 5° data point.

**Counter-recommendation:** if Sam prefers Pattern 2.5 lite (for forward-compat + ergonomics), 3.6.B works. Decision shifts ~1-2h F3 cost (hook + migrations + test) and adds Pattern 2.5 lite anchoring.

### 3.7 Cross-axis E — shared error→UI pipeline

**Pregunta:** ¿status quo (D2 variant determines surface naturally), o auto-route Result→toast pipeline (Pattern 1)?

#### Opción 3.7.A — Status quo (RECOMENDADA)

**Shape:** D2 variant choice naturally determines D8 surface. Variant F (toast) → toast renders. Variant A (ToolResult) → consumer (CopilotPanel useCopilotUI) decides surface. Variant B (throw) → ErrorBoundary or component try-around. No central router.

**Pros:**
- **Pre-existing canonical** — current pattern works.
- **Per-feature autonomy** — components choose appropriate surface.
- **0 code change.**
- **Aligned con D5 ratified** "feature ownership legitimate."

**Cons:**
- Adding new error source requires explicit surface decision (no automatic routing).

**Confidence:** **high**.

#### Opción 3.7.B — Auto-route Result→toast pipeline (Pattern 1)

**Shape:** middleware that catches all `{type:'error'}` actions or Promise rejections + auto-dispatches toast.

**Cons:**
- **Loses per-feature surface choice.** Some errors should be inline (modal forms), some should be ErrorBoundary (crash), some should be silent (storage degradable). Auto-routing forces toast.
- **Cross-eje cascade** — would touch error handling in every consumer.
- **Anti-pattern per audit philosophy** — abstraction without observable bug signal.

**Confidence:** **very low**. Anti-pattern.

#### Recomendación 3.7

**Lean: Opción 3.7.A (status quo).** Confidence: **high**.

### 3.8 Stage 2 commit structure

**Pregunta:** ¿single F3 unify branch con atomic per-axis commits dentro, 3 separate sub-branches con merge sequencing, o monolithic single commit?

#### Opción 3.8.A — Single F3 unify branch con atomic per-axis commits (RECOMENDADA)

**Shape:** `drift/E-async-states` branch contains:
- Commit 1 — Spec doc (this).
- Commit 2 — D2 convention table CLAUDE.md section.
- Commit 3 — D8 gap 1 (CollisionBodyMesh toast).
- Commit 4 — D8 gap 4 (validator diagnostics aggregator).
- Commit 5 — D8 gap 5 (worker pool errors slice + toast).
- Commit 6 — JSDoc cross-doc + B8 convention table.
- Commit 7 — CLAUDE.md ratification rows + audit-state delta.

**Pros:**
- **Single PR cycle** — reviewer holistic view of full closure.
- **Per-commit atomicity** — each axis cleanly separable.
- **Audit precedent** — A3, A6, A7, A2, C4 all closed via single branch with multiple atomic commits.
- **Cost bounded** — ~3-5h F3 aggregate consistent with Pattern 2.5 hybrid calibration.
- **Easier rollback** — per-commit revert if specific axis controversial.

**Cons:**
- PR slightly larger than per-axis (but bounded by ~50-100L code + ~80L docs).

**Confidence:** **high**.

#### Opción 3.8.B — 3 separate sub-branches con merge sequencing

**Shape:** `drift/E-async-states/b8-convention`, `drift/E-async-states/d2-convention`, `drift/E-async-states/d8-gaps`. Each merges to main independently.

**Pros:**
- Per-axis isolation.

**Cons:**
- **3 PR review cycles** — overhead.
- **Merge sequencing complexity** — D8 gap 4 references D2 convention; ordering matters.
- **Audit closure shape unfamiliar** — no precedent in 27 prior closures.

**Confidence:** **low**.

#### Opción 3.8.C — Monolithic single commit (anti-pattern per regla 9)

**Cons:**
- Regla 9 violated explicit.

**Confidence:** **very low**.

#### Recomendación 3.8

**Lean: Opción 3.8.A (single F3 unify branch).** Confidence: **high**.

Razones:
- Audit precedent (5 prior closures via single branch).
- Per-commit atomicity preserves regla 9.
- Single PR review cost-effective.
- Cost bounded.

### Tabla resumen Sec 3

| Sub-decisión | Pregunta | Recomendación | Pattern | F3 cost | Confidence |
|---|---|---|---|---|---|
| **3.1** B8 location | Per-feature ratify vs hook canonical vs Redux-canonical vs status quo | **3.1.A** Per-feature ratify with convention table | Ratify-by-convention | ~30L docs (CLAUDE.md table + JSDoc) | high |
| **3.2** D2 propagation | 6-variant table vs Result everywhere vs ToolResult everywhere vs status quo | **3.2.A** Anchor 6-variant convention table | Ratify-by-convention | ~50L docs (CLAUDE.md table) | high |
| **3.3** D2 silent variant D | Ratify 14 cases vs telemetry counter vs eliminate | **3.3.A** Ratify all 14 as legitimate | Ratify-by-convention | 0 code (covered by 3.2 table row) | high |
| **3.4** SolverError #687 coordination | Coordinate vs bundle vs defer | **3.4.A** Coordinate (E-async ratifies + #687 implements) | Ratify + decoupling | 0 code (cross-doc only) | high |
| **3.5.1** Gap 1 CollisionBodyMesh | Toast vs inline vs status quo | **3.5.1.A** Pattern 2.5 extend toast | 2.5 extend | ~5-8L | high |
| **3.5.2** Gap 4 validator diagnostics | Aggregator toast vs panel vs inspector vs status quo | **3.5.2.A** Workspace post-load aggregator toast | 2.5 extend | ~10-15L | medium-high |
| **3.5.3** Gap 5 worker pool errors | Aggregated toast + Redux vs panel vs status quo | **3.5.3.A** Aggregated toast + slice field | 2.5 extend | ~15-20L + slice field | medium-high |
| **3.6** D8 state machine pattern | Ratify vs extract hook vs status quo | **3.6.A** Ratify as emerging convention (3.6.B alt if Sam prefers) | Ratify (or 2.5 lite) | 0 code (or +20L hook + migrations) | medium-high |
| **3.7** Cross-axis pipeline | Status quo vs auto-route | **3.7.A** Status quo (per-feature surface choice) | Pattern 2 ratify | 0 code | high |
| **3.8** Stage 2 structure | Single branch vs 3 sub-branches vs monolithic | **3.8.A** Single F3 unify branch | Audit precedent | n/a | high |

**Aggregate F3 (recommended path):** ~30-50L code + ~80L docs = ~3-5h consistent con Pattern 2.5 hybrid (lite + extend) + ratify-by-convention dominant calibration.

---

## Sección 4 — Recomendación consolidada

**Path consolidada (recommended):** **3.1.A + 3.2.A + 3.3.A + 3.4.A + 3.5.1.A + 3.5.2.A + 3.5.3.A + 3.6.A + 3.7.A + 3.8.A.**

E-async-states cierra como **9° caso de regla 13 reformulation** (3 axes son mismo problema → 3 ortogonal concerns + canonical infra pre-existente + bounded gaps) + **Pattern 2.5 hybrid combining 2.5 extend (3 surgical UI gap closures) + ratify-by-convention dominant (5 sub-decisions: 3.1 + 3.2 + 3.3 + 3.4 + 3.7 + 3.6)**. **2° anchor case del Pattern 2.5 hybrid combining variants** (post-C4 1° anchor).

**Pattern detection ratification:**

- **Pattern 2.5 extend** — 6° data point (post-A3 + C1 + A7 + A6 + C4 + **E-async**). Robust 6/6 stable.
- **Pattern 2.5 lite** — 4° data point ratified via convention table (D4 + B10 Par 1 + A2 + C4); E-async would add 5° if Sam selects 3.6.B (hook extraction). **Default**: 4 data points robust.
- **Regla 13 reformulation** — 9° caso (B12 + C7 + B5 + D1-cosmetic + D5 + A4 + A2 + C4 + **E-async**). Sub-pattern dominante en (b) y (c) ejes — **9 of 27 closed = 33%** (1 of 3 ejes get reformulation).
- **62% rule sustained** — ratify-by-convention dominant continues; ~17 of 28 ejes ratify-leaning post-E-async.
- **Hook composition canonical** (1° anchored C4) — preserved; E-async hook composition remains useSimulationLifecycle + useAgenticLoop pattern.
- **Pattern 2.5 hybrid combining lite + extend in single closure** — 2° anchor case (post-C4 1°). Track post-future ejes.

**Audit cumulative state post-E-async:** **28 ejes ratificados, audit cumulative cierra completo.** Pendientes solo follow-up issues independientes (#676-681 A7 ports + #683-689 A6 setters + #687 SolverError adoption + #693-694 + #696-708).

### Cross-eje boundaries (explicit non-overlap)

| Boundary | E-async (this) | Adjacent eje |
|---|---|---|
| Solver tier error contract | Ratify SolverError as canonical Variant A extension | A6 (declared types) + #687 (per-tier adoption) |
| Per-feature physics | NO touch | A7 (#676-681 ports queued) |
| Cross-boundary serialization | NO touch | A2 (`configBridge` helper) |
| Topology / mesh adjacency | NO touch | A4 (CPU vs GPU/WASM extractors) |
| Three.js disposable | NO touch | C1 (`useDisposable` hook) |
| Cross-boundary errors Rust↔TS | Inherit (Rust panic_hook + TS NaN guards + structured postMessage) | A3 (defensive Rust + CPU fallback + NaN guards) |
| 4-way tier orchestration | NO touch | C4 (hook composition + tool dispatch + capability flags) |
| State location B8 | RATIFY 6 patterns (per-feature) | E-async territory |
| Error propagation D2 | RATIFY 6 variants + convention table | E-async territory |
| UI loading/error/empty D8 | EXTEND 3 surgical gap closures + ratify state machine pattern | E-async territory |
| Cross-axis interactions | RATIFY status quo (per-feature surface choice) | E-async territory |
| AgenticLoop 3-surface inconsistency (#645) | NOT solved aquí — captured as deuda § 8.1 (legitimate per-surface roles) | #645 follow-up |

### Risk floor

- **3.1.A + 3.2.A + 3.3.A** — pure docs (CLAUDE.md tables + JSDoc cross-doc). Zero risk.
- **3.4.A** — cross-doc only. Zero risk.
- **3.5.1.A** — ~5-8L `dispatch(showErrorToast(...))` addition to existing catch. Toast canonical pattern. Risk: very low.
- **3.5.2.A** — ~10-15L useEffect + dispatch in Workspace. Selector reads existing state. Risk: very low.
- **3.5.3.A** — ~15-20L + new slice field + rate-limit helper. Slice extension is additive. Risk: low.
- **3.6.A** — ratify (no code) or **3.6.B** — ~20L hook + migrations. Either path low risk.
- **3.7.A + 3.8.A** — no code change.

**Total observable behavior change:**
- +1 toast on collision body load failure.
- +1 toast (aggregated) on project load with diagnostics.
- +1 toast (rate-limited) on worker pool errors + state visibility.
- Convention tables added to CLAUDE.md.

**Risk floor near-zero.**

---

## Sección 5 — Plan de migración Fase 3

### 5.1 Branch + PR

Branch existente: `drift/E-async-states` (creado de `main` `6238d0b2` pre-Fase 2, this commit).

PR: draft post-Fase 2 doc commit; promote to ready-for-review post-Fase 3 closure commits.

### 5.2 Commit 1 — Fase 2 doc (this commit)

Atomic: doc-only, no code.

```bash
git add docs/reports/2026-05-03-drift-fase2-e-async-states.md
git commit -m "$(cat <<'EOF'
docs(e-async): Fase 2 — B8+D2+D8 fusion sub-track

Sweep refresh + classification + sub-decisiones articuladas. Reformulación
per regla 13: 3 axes son ortogonal concerns + canonical infra pre-existente
(ErrorBoundary tree, Toast slice, SolverError types declarados, state
machine pattern emerging) + 3 bounded D8 gaps post-A3 + post-BUG-15.

Recomendación consolidada: 3.1.A B8 per-feature ratify + 3.2.A D2 6-variant
convention table + 3.3.A D2 silent variant ratify (14 legitimate cases) +
3.4.A SolverError coordinate (E-async ratifies + #687 implements) + 3.5.A
3 surgical UI gap closures (Pattern 2.5 extend) + 3.6.A state machine
pattern ratify + 3.7.A cross-axis status quo + 3.8.A single F3 unify branch.

9° caso regla 13 reformulation. Pattern 2.5 hybrid combining 2.5 extend
+ ratify-by-convention dominant. 6° Pattern 2.5 extend data point.
2° anchor case Pattern 2.5 hybrid combining variants single closure.

Pendiente verde de Sam para Stage 2 (single F3 unify branch decision).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

**PAUSA — esperar verde explícito de Sam vía reviewer.**

### 5.3 Commit 2 — D2 6-variant convention table (post-verde)

File: `CLAUDE.md` — new section "Error propagation patterns (E-async ratified)".

Estimated size: ~50-70 líneas (matching precedent of A3 § "Cross-boundary error handling" ~60 líneas + A7 capabilities ~80-120 líneas).

Content:
- 6-variant table (per § 3.2.A draft).
- Cross-cutting rule for cross-tier errors → SolverError extension.
- Cross-ref to E-async RFC + #687 follow-up.
- Reopen triggers (per § 7).

### 5.4 Commit 3 — D8 gap 1: CollisionBodyMesh toast surface

File: `src/components/Viewport3D/CollisionBodyMesh.tsx`.

```tsx
// Add imports:
import { useDispatch } from 'react-redux';
import type { AppDispatch } from '../../store';
import { showErrorToast } from '../../store/copilotUISlice';
import { MeshImportLimitError } from '../../utils/import/meshImporter';

// In component:
const dispatch = useDispatch<AppDispatch>();

// Update catch (line 41-44):
}).catch(err => {
  console.warn('[CollisionBodyMesh] Failed to load:', body.name, err);
  const msg = err instanceof MeshImportLimitError
    ? `Collision body "${body.name}" exceeds size limit: ${err.message}`
    : `Failed to load collision body "${body.name}": ${err instanceof Error ? err.message : 'unknown error'}`;
  dispatch(showErrorToast(msg));
});
```

Plus JSDoc on the catch explaining dual surface (console for dev telemetry + toast for user). Estimated: ~10 líneas net add.

### 5.5 Commit 4 — D8 gap 4: validator diagnostics aggregator

File: `src/components/Workspace/Workspace.tsx` (or new component if Workspace too crowded).

```tsx
// Add imports:
import { useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '../../store';
import { showErrorToast, showInfoToast } from '../../store/copilotUISlice';

// In Workspace component:
const loadDiagnostics = useSelector((s: RootState) => s.project.loadDiagnostics);
const dispatch = useDispatch<AppDispatch>();

useEffect(() => {
  if (loadDiagnostics.length === 0) return;
  const errors = loadDiagnostics.filter(d => d.severity === 'error').length;
  const warnings = loadDiagnostics.filter(d => d.severity === 'warning').length;
  if (errors > 0) {
    dispatch(showErrorToast(
      `Project loaded with ${errors} error(s)${warnings > 0 ? ` and ${warnings} warning(s)` : ''}.`
    ));
  } else if (warnings > 0) {
    dispatch(showInfoToast(`Project loaded with ${warnings} warning(s).`));
  }
}, [loadDiagnostics, dispatch]);
```

Plus JSDoc cross-ref to E-async RFC. `showInfoToast` may need to be added to copilotUISlice exports if not present (verify in F3).

Estimated: ~15-20 líneas net add.

### 5.6 Commit 5 — D8 gap 5: worker pool errors slice field + toast

Files:
- `src/store/inspectorSlice.ts` (or new field on existing slice — verify TS compile during F3).
- `src/store/reactiveSolverMiddleware.ts:481`.

```ts
// Slice addition (inspectorSlice or dedicated solverSlice):
interface InspectorState {
  // ... existing fields
  /** Last solver/worker error from reactive solver pool. */
  lastSolverError: { error: string; jobId?: string; timestamp: number } | null;
}

// reducer:
setLastSolverError(state, action: PayloadAction<{...}>) {
  state.lastSolverError = action.payload;
}

// Middleware (reactiveSolverMiddleware.ts:481):
let lastToastEmitTs = 0;
const TOAST_RATE_LIMIT_MS = 5000;

state.pool.onError((error: string, jobId?: string) => {
  console.error('[ReactiveSolver] Worker error:', error, jobId);
  state.metrics.errors.push(error);
  if (state.metrics.errors.length > 10) state.metrics.errors.shift();
  if (jobId) state.pendingJobs.delete(jobId);

  // NEW: surface to Redux + rate-limited toast
  if (storeDispatch) {
    storeDispatch(setLastSolverError({ error, jobId, timestamp: Date.now() }));
    const now = Date.now();
    if (now - lastToastEmitTs > TOAST_RATE_LIMIT_MS) {
      storeDispatch(showErrorToast(`Construction error: ${error}`));
      lastToastEmitTs = now;
    }
  }
});
```

Optional: render lastSolverError in InspectorTab post-Stage-2 (out-of-scope; UX deferred per § 1.2).

Estimated: ~25-35 líneas (slice field + reducer + middleware update + rate-limit).

### 5.7 Commit 6 — JSDoc cross-doc + B8 convention table

Files:
- `CLAUDE.md` — add section "Async state location patterns (E-async ratified)" with B8 6-pattern table (per § 3.1.A draft).
- `src/components/CopilotPanel/CopilotPanel.tsx` — JSDoc cross-doc to E-async RFC (D4 ratified intersection).
- `src/components/Viewport3D/CollisionBodyMesh.tsx` — JSDoc on catch explaining dual surface convention.
- `src/components/Workspace/Workspace.tsx` — JSDoc on loadDiagnostics aggregator explaining gap 4 closure.
- `src/store/reactiveSolverMiddleware.ts` — JSDoc on `pool.onError` explaining gap 5 closure.
- `src/utils/cloth/solverProtocol.ts` — JSDoc cross-ref E-async + #687 on SolverError type.
- `src/store/copilotUISlice.ts` — JSDoc cross-ref E-async on showToast helpers + table reference.

Estimated: ~80 líneas docs total (CLAUDE.md table + JSDoc additions).

### 5.8 Commit 7 — CLAUDE.md ratification row + audit-state delta

Files:
- `CLAUDE.md` — add row to "Audit Ratifications" table:

| E-async-states | B8 + D2 + D8 fusion: state location 6-pattern convention + error propagation 6-variant convention table + UI surface canonical (ErrorBoundary tree + Toast slice ratified) + 3 surgical D8 gap closures (CollisionBodyMesh + validator diagnostics + worker pool errors) + state machine pattern ratify + SolverError coordinate with #687. **9° caso regla 13 reformulation** (3 axes → 3 ortogonal concerns + bounded gaps). **2° anchor case Pattern 2.5 hybrid combining variants single closure**. | `docs/reports/2026-05-03-drift-fase2-e-async-states.md` |

- `CLAUDE/context/audit-state.md` — closure delta:
  - Move E-async-states from "Pending ejes" to "Closed ejes" (Sub-track section).
  - Update count: 27 → 28 ejes ratificados.
  - Mark audit cumulative as **CLOSED** (E-async was last; only follow-ups remain).
  - Update Pattern 2.5 extend shipping rate (+E-async data point).
  - Update regla 13 reformulation count (9° case).

Estimated: ~30-50 líneas doc updates.

### 5.9 Verify gates

```bash
npx tsc -b --noEmit && npm run test && npm run lint
```

**No WASM rebuild needed** — E-async is TS-tier orchestration, no Rust ABI touched.

**Smoke test críticos:**
1. `npm run dev` + add a corrupt collision body file → verify toast appears with size limit message.
2. Load a project with intentionally invalid pieces → verify aggregated toast appears post-load with severity counts.
3. Trigger a parametric construction worker error (e.g., circular formula reference) → verify rate-limited toast + `lastSolverError` visible in Redux DevTools.
4. Verify NO regressions in copilot tool toast pipeline (existing useCopilotUI behavior).

### 5.10 PR ready-for-review

Post-Commit-7 + verify gates passing → mark PR ready. Reviewer ronda final → merge via standard merge commit.

### 5.11 Follow-up issues (post-merge)

1. **AgenticLoop 3-surface error inconsistency** (#645 already open) — captured as deuda § 8.1; UX redesign decision out-of-scope E-async.
2. **Validator diagnostics dedicated panel** (severity:low) — aggregator toast surfaces signal; full panel UI deferred (UX shape decision).
3. **Worker pool errors dedicated panel** (severity:low) — same as above.
4. **PluginManager redundant local + slice error state** (severity:low) — captured as deuda § 8.2; consolidation via Redux migration of useState.
5. **CommandBar response state location** (severity:very-low) — useState → slice migration if persistence needed.
6. **`useAsyncStateMachine<S>` hook extraction** (severity:very-low) — if 3rd modal site emerges, evaluate Pattern 2.5 lite extraction.
7. **Lint rule for showToast vs console.error consistency** (severity:very-low) — discipline-bound enforcement.

---

## Sección 6 — Cross-references y dependencias

### 6.1 Inputs

- `docs/reports/2026-04-28-drift-inventory-fase1.md` § B8-state (líneas 223-228) + § D2 (líneas 347-355) + § D8 (líneas 406-413) — original inventory framing.
- `docs/reports/2026-04-28-drift-fase2-classification.md` § Eje compuesto E-async-states (líneas 21-36) + § 9 plan secuencial.
- `docs/reports/2026-05-01-drift-fase2-a3-cross-boundary-errors.md` — Pattern 2.5 extend precedent + Result-pattern forward-only convention + structured `SolverError` declaration + NaN counter telemetry pattern.
- `docs/reports/2026-05-01-rfc-a6-worker-protocol.md` — `ClothSolverClient` interface + `SolverError`/`SolverErrorCode` types declared (post-A6) + #687 follow-up queued.
- `docs/reports/2026-05-01-rfc-a7-wasm-cpu-equivalence.md` — `SolverCapabilities` per-tier surface + `SimulationStatusOverlay` UI pattern + 3.6 decoupling pattern.
- `docs/reports/2026-05-02-drift-fase2-c4-4way-tier-orchestration.md` — hook composition canonical (`useSimulationLifecycle` + `useCollisionBodies` + `useMeshing`) + Pattern 2.5 hybrid (lite + extend single closure) 1° anchor case + tool capability flags + UI surface tool silent-absence.
- `docs/reports/2026-05-02-drift-fase2-a2-cross-boundary-serialization.md` — Pattern 2.5 lite helper precedent (`configBridge.ts`).
- `docs/reports/2026-04-30-drift-fase2-b6state-persistencia.md` — IDB canonical via storageSet/storageGet + LS-only inline justification + 3.6 decoupling pattern primer use + BUG-10 silent variant D justification precedent (avatarSlice.persistPoses).
- `docs/reports/2026-05-01-drift-fase2-d4-copilotpanel-composition.md` — D4 ratify with Pattern 2.5 lite (CopilotPanel 11 useState pattern + recordMessage helper).
- BUG-15 closure (PR #650) — AgenticLoop error event surfacing + useAgenticLoop showErrorToast wiring.
- BUG-10 (anchored avatarSlice silent variant D justification).
- Issue #645 — AgenticLoop 3-surface error inconsistency (input directo a E-async, captured § 8.1 as deuda).
- Issue #687 — A6 follow-up: error shape uniform 4 tiers (E-async coordinates per § 3.4.A).
- `CLAUDE/methodology.md` — reglas 0, 1, 2, 3, 6, 8, 9, 11, 13, 14, 16.

### 6.2 Outputs

- `CLAUDE.md` — 2 new sections: "Async state location patterns (E-async ratified)" + "Error propagation patterns (E-async ratified)" + 1 row in "Audit Ratifications" table.
- `CLAUDE/context/audit-state.md` — closure delta + audit cumulative CLOSED + Pattern 2.5 extend +1 data point + regla 13 reformulation +1 case.
- `src/components/Viewport3D/CollisionBodyMesh.tsx` — toast dispatch on import failure (gap 1 closure).
- `src/components/Workspace/Workspace.tsx` — loadDiagnostics aggregator useEffect (gap 4 closure).
- `src/store/inspectorSlice.ts` (or new field on appropriate slice) — `lastSolverError` field + reducer (gap 5 closure).
- `src/store/reactiveSolverMiddleware.ts` — pool.onError dispatches + rate-limited toast (gap 5 closure).
- `src/utils/cloth/solverProtocol.ts` — JSDoc cross-ref E-async + #687 on SolverError.
- `src/store/copilotUISlice.ts` — JSDoc cross-ref E-async on toast helpers.
- ~3-5 additional JSDoc cross-refs in representative B8/D2 example sites.

### 6.3 No-conflicts (out-of-scope verificado)

- **A6 `ClothSolverClient` interface** — NO touch. ✓
- **A7 per-feature ports (#676-681)** — preserved. ✓
- **A2 `configBridge.ts`** — preserved. ✓
- **A4 topology cleavage** — NO touch. ✓
- **C1 disposable lifecycle** — NO touch. ✓
- **A3 cross-boundary error handling** — inherited (panic_hook + NaN guards + structured postMessage + Result-pattern forward-only). E-async extends Variant A convention to include SolverError. ✓
- **C4 hook composition + tool dispatch + capability flags** — preserved; no overlap with E-async B8 hook composition (different domain — E-async is generic state location). ✓
- **D4 CopilotPanel composition** — preserved; D4 ratified `useState` 11-count pattern is consistent with E-async B8 Variant 2 (useState local for transient single-feature). ✓
- **D7 ValidationDiagnostic vs Diagnostic ortogonal** — preserved; E-async surfaces ValidationDiagnostic via toast (not via inspector panel — preserves D7 cleavage). ✓
- **B6-state IDB canonical persistence** — inherited (silent variant D ratification anchors avatarSlice.persistPoses BUG-10 precedent). ✓
- **B9-state ToolResult uniform** — preserved; D2 § 3.2.A Variant A row references B9-state ratification. ✓
- **#645 AgenticLoop 3-surface inconsistency** — NOT solved aquí (legitimate per-surface roles); captured as deuda § 8.1. ✓
- **#687 SolverError adoption** — coordinated per § 3.4.A (decoupling preserved). ✓
- **Setter migrations #683-689** — independent. ✓

### 6.4 Co-existence con #687 (key coordination)

**E-async § 3.4.A explicit coordination:**

- E-async ratifies `SolverError` shape (`{type:'error', code:SolverErrorCode, message, details?}`) as **canonical Variant A extension for cross-tier errors** in CLAUDE.md "Error propagation patterns (E-async ratified)" section.
- #687 follow-up implements adoption to CPU + GPU + Neural tiers (per its acceptance criteria — 4 tier worker error postMessages emit structured shape).
- **No bundling.** A6 § 3.6.C decoupling preserved (3 data points robust: B6-state primer + A6 second + A7 third).
- **Reopen trigger** (§ 7 #4): if #687 implementation reveals additional `SolverErrorCode` codes not in current enum, E-async convention table updates non-breaking via `string & {}` fallback (already declared post-A6).

### 6.5 Follow-up issues queued post-merge

1. **AgenticLoop 3-surface error inconsistency** (#645 already open, severity:medium) — captured as deuda § 8.1.
2. **Validator diagnostics dedicated panel** (new follow-up if needed, severity:low) — aggregator toast suffices for E-async closure; full panel UI deferred.
3. **Worker pool errors dedicated panel** (new follow-up if needed, severity:low) — same as above.
4. **PluginManager redundant local + slice error state** (new follow-up, severity:low) — captured § 8.2.
5. **CommandBar response state location** (new follow-up, severity:very-low) — captured § 8.3.
6. **`useAsyncStateMachine<S>` hook extraction** (new follow-up if 3rd modal site emerges, severity:very-low).
7. **Lint rule for D2 convention enforcement** (new follow-up, severity:very-low) — discipline-bound currently.

### 6.6 Methodology rules applied

- **Regla 0** (Verify before assert): inventory claims verified — D2 counts 2-5x off, F variant refuted "infrautilizado", D8 gaps reduced 5→3.
- **Regla 1** (Pre-existing canonical): ErrorBoundary tree + Toast slice + SolverError types + agentError pattern + state machine pattern all confirmed via grep + read.
- **Regla 2** (Read contents not directories): Workspace.tsx + projectSlice.ts + reactiveSolverMiddleware.ts + 4 ErrorBoundary files + slice files read in full.
- **Regla 3** (Verify divergence): D2 6 variants verified divergent in semantic role (not shape-similar with hidden divergence — divergence is declared and intentional per use case).
- **Regla 6** (Look outside obvious dirs): grep for `useTransition` / `Suspense` / `react-error-boundary` / `useAsync` / `useFetch` confirmed 0 hits beyond R3F internal Suspense.
- **Regla 8** (stop → notify → wait → execute): F2 doc commit + draft PR + pause for verde before F3.
- **Regla 9** (Atomicity by default): unify commits planned atomic per § 5.
- **Regla 11** (Real fix vs consistency alignment): selected mid-path — Pattern 2.5 extend for 3 bounded D8 gaps (real fix UX gaps) + ratify-by-convention for B8/D2 axes (consistency alignment when smell stable).
- **Regla 13** (Inventory misclassification is itself drift): 9° caso — "3 axes son mismo problema" reformulated to "3 ortogonal concerns + canonical infra + bounded gaps".
- **Regla 14** (62% rule): predicted ratify-by-convention dominant; 5 of 8 sub-decisions close as ratify (3.1 + 3.2 + 3.3 + 3.4 + 3.6 + 3.7); 3 close as Pattern 2.5 extend (3.5.1 + 3.5.2 + 3.5.3); 1 stage-2-structure (3.8) is logistical.
- **Regla 16** (Pattern 2.5 hybrid 4 variants): 2° anchor case combining 2.5 extend (3 surgical UI gap closures) + ratify-by-convention dominant in single closure (post-C4 1° anchor).

---

## Sección 7 — Reopen triggers

E-async-states ratificación queda revisable si emerge:

1. **3rd modal site adopts state machine pattern** — verify `useAsyncStateMachine<S>` hook extraction (Pattern 2.5 lite) — reopen § 3.6 evaluating 3.6.B if N=3 sites stable.

2. **#687 SolverError adoption reveals new error codes** — verify convention table forward-compat (`string & {}` fallback). If recurring patterns emerge (e.g., multiple `gpu_*` codes), extend SolverErrorCode enum non-breaking.

3. **Production telemetry signals high frequency of LS failures** — reopen § 3.3 evaluating Opción B (telemetry counter) for specific high-frequency silent-catch sites (e.g., `avatarSlice.persistPoses` if storage quota becomes common).

4. **#645 AgenticLoop 3-surface inconsistency reopens** with concrete UX redesign decision — verify D2 convention table accommodates the redesigned surface choice. May reopen § 3.2.A variant rules if surface roles redefine.

5. **Validator diagnostics dedicated panel implemented** (follow-up #2) — reopen § 3.5.2 evaluating panel as primary surface vs aggregator toast as overflow.

6. **Worker pool dedicated panel implemented** (follow-up #3) — same shape as #5.

7. **`<AsyncBoundary>` HOC introduced for new feature** (e.g., RAG search panel, large async lists) — reopen § 3.5 evaluating if Pattern 2.5 extend per-gap pattern should consolidate into HOC.

8. **React 18 `useTransition` / Suspense adopted** (e.g., for code-splitting via React.lazy) — verify B8 convention table extends to capture new pattern (Variant 7 Suspense). May reopen § 3.1.

9. **External error/loading library adopted** (e.g., `react-query` for RAG) — verify D2 convention compatibility; reopen § 3.2 if library shape conflicts.

10. **Toast volume becomes excessive in production** (e.g., user complaints about toast spam) — reopen § 3.5.3 rate-limit threshold + § 3.5.2 aggregator throttling.

11. **PluginManager dual-state consolidation requested** (follow-up #4) — verify B8 § 3.1.A convention table covers Redux + useState dual pattern (currently captured as deuda § 8.2; if becomes common pattern, ratify as 7° variant).

12. **`SolverError.details` field becomes load-bearing for cross-tier error inspection** — verify schema (currently `Record<string, unknown>` open shape). Reopen if structured details emerge as canonical.

---

## Sección 8 — Deuda técnica explícita post-ratificación

1. **AgenticLoop 3-surface error inconsistency (#645 OPEN)**. Tool error → ProgressMessage update (no toast). Loop exception caught at component → assistant message in chat (no toast). Loop error event post-BUG-15 → toast + state reset. **3 different UX presentations for 3 different error origins.** E-async D2 convention table § 3.2.A treats them as **legitimate per-surface roles** (tool errors are inline-recoverable per-call; component-caught are conversational; loop-level are blocking-toast-worthy). Aceptable porque (i) BUG-15 sweep documented the 3 surfaces as intentional per origin, (ii) UX redesign decision is product-level not architectural, (iii) #645 captures for future consolidation if user feedback signals confusion.

2. **PluginManager redundant local + slice error state**. PluginManager.tsx:32-33 uses local `useState installError` + `useState pluginErrors` while `pluginSlice.pluginErrors: Record<string, string>` exists in Redux (line 42-44). Local state shadows slice state for some operations. Aceptable porque (i) both surfaces work currently, (ii) consolidation via Redux migration of useState requires Plugin manager refactor (out-of-scope E-async), (iii) captured as follow-up #4 if UX inconsistency emerges.

3. **CommandBar response state location**. CommandBar.tsx:75 uses `useState responseText` only (no slice). Response not preserved across panel close/reopen. Per D4 ratify pattern (CopilotPanel similar), this is **intentional transient**. If future requirements need persistence, captured as follow-up #5.

4. **State machine pattern hook extraction deferred**. 2 sites (`ImportSeamlyModal` + `ExportSkillModal`) use parallel state machines. § 3.6.A ratifies as emerging convention; § 3.6.B (hook extraction) deferred until 3rd site emerges. Aceptable per regla 11 — N=2 borderline for extraction; convention table doc captures pattern.

5. **#687 SolverError adoption depends on follow-up schedule**. E-async ratifies pattern but adoption to CPU + GPU + Neural tiers happens post-#687 implementation. Until then, only WASM tier emits structured `SolverError`. Aceptable porque (i) A6 § 3.6.C explicit decoupling, (ii) #687 has clear acceptance criteria + severity:medium, (iii) `string & {}` fallback in `SolverErrorCode` enum prevents downstream blocking.

6. **Validator diagnostics aggregator toast loses detail**. § 3.5.2.A aggregates per-load count + severity into single toast. Individual diagnostic detail (specific code, anchor, message) only reaches `console.error/warn` (developer) + `state.loadDiagnostics` (preserved but not rendered). User can't see which specific pieces had issues without dev tools. Aceptable porque (i) UX shape decision (panel vs inline) is product-level, (ii) follow-up #2 captures full panel implementation, (iii) toast surfaces signal that diagnostics exist.

7. **Worker pool errors aggregator loses detail**. Same shape as #6 — § 3.5.3.A surfaces `lastSolverError` (single field) + rate-limited toast. Multi-error history preserved in `state.metrics.errors[]` (max 10) but not exposed. Aceptable per same reasoning.

8. **Convention tables discipline-bound (no lint enforcement)**. Both B8 § 3.1.A + D2 § 3.2.A convention tables rely on review humano to catch divergence. Lint rules for "useState X with shape Y in feature Z must use convention" are non-trivial to author. Aceptable porque (i) discipline-bound conventions are precedent (B5-state factory pattern, B6-state IDB canonical, etc.), (ii) follow-up #7 captures if lint enforcement becomes warranted.

9. **No global error→UI auto-router**. § 3.7.A status quo per-feature surface choice. New error sources require explicit surface decision per CLAUDE.md table. Aceptable porque (i) per-feature autonomy preserved (D5 ratified pattern), (ii) auto-routing would over-fit to single surface (toast) while different errors warrant different surfaces.

10. **State machine pattern not type-enforced beyond useState `<S>`**. ImportSeamlyModal + ExportSkillModal both use `useState<State>('idle')` with discriminated union `S`. No runtime guard against invalid transitions (e.g., `idle` → `success` skipping `parsed/importing`). Aceptable porque (i) modal flows are linear; invalid transitions would be UI bugs caught immediately, (ii) library-level state machines (xstate, etc.) are out-of-scope for current needs.

---

## Sección 9 — Decisión pendiente y siguiente paso

### 9.1 Pregunta a Sam

¿Aprobás las 8 sub-decisiones (3.1.A + 3.2.A + 3.3.A + 3.4.A + 3.5.A + 3.6.A + 3.7.A + 3.8.A) tal como recomendado en Sec 3 + recomendación consolidada Sec 4?

Si **sí, todo aprobado:**
- Marco PR ready-for-review post-Stage 2 (single F3 unify branch).
- Sec 4-9 quedan como ratificación final.
- Stage 2: 6 commits sobre este branch (D2 convention table + 3 D8 gap closures + JSDoc cross-doc/B8 table + CLAUDE.md ratification row + audit-state delta) + 1-2 follow-up issues opened (#645 cross-ref + new follow-ups si applican).
- Inventory annotation post-merge.
- E-async cerrado como **9° caso regla 13 reformulation** + **6° data point Pattern 2.5 extend** + **2° anchor case Pattern 2.5 hybrid combining variants single closure**.
- **Audit cumulative CLOSED.** 28 ejes ratificados total. Solo follow-ups independientes pendientes.

Si **alguna sub-decisión querés cambiar:**

- **3.1.B (force `useAsyncState<T>` hook):** anti-pattern per § 3.1 cons; reabro Sec 3 si Sam confirms strong preference (cost ~8-15h F3 + compile-gate trigger).
- **3.1.C (force Redux-canonical):** anti-pattern; reabro si Sam confirms.
- **3.2.B (Result everywhere Pattern 1):** anti-pattern (~30-50h F3 + cross-eje cascade); reabro si confirms.
- **3.3.B (telemetry counters per silent-catch):** defensible; cost +3-5h F3 (14 counters + rate-limit infra). Reabro si Sam prefers production telemetry signal.
- **3.4.B (fold #687 into E-async):** defensible pero counter-decoupling philosophy; cost +3-5h F3 (CPU + GPU + Neural tier postMessage refactor). Reabro si Sam confirms.
- **3.5.x.B (panels instead of toasts):** UX shape decision; defer to follow-ups per § 1.2. Reabro si Sam wants panel UI in E-async closure.
- **3.6.B (extract `useAsyncStateMachine<S>` hook):** defensible Pattern 2.5 lite; cost +1-2h F3 (hook + 2 migrations + test). **Adds Pattern 2.5 lite 5° data point.** Reabro if Sam prefers extraction over ratify.
- **3.7.B (auto-route error→toast):** anti-pattern per § 3.7 cons; reabro si confirms.
- **3.8.B (3 separate sub-branches):** unfamiliar shape; cost +2-3 PR review cycles. Reabro si Sam prefers per-axis isolation.

Si **el scope del eje cambia (e.g., reopen "B8/D2/D8 deben unificar via shared `useAsyncState` hook"):**
- STOP. Reabro Sec 1 con nuevo evidence; Pattern 1 path requires explicit cross-eje cascade analysis.

### 9.2 Estado del PR

- Sec 1-9 ✅ ready (este commit).
- Fase 2 doc commit pendiente (este).
- Draft PR pendiente post-commit.
- Pendiente Stage 2 (Fase 3) commits (6: D2 table + 3 gap closures + JSDoc/B8 table + CLAUDE.md ratification row + audit-state delta).

### 9.3 Calibración estimate vs actual

- Estimate F2 doc inicial (kickoff anticipation): **15-25h** (consistente con sub-track de scope grande + 3 axes compuesto).
- **Actual F2 doc: ~6-8h** (sweep refresh + classification + redacción + cross-axis trace).
- **Factor: ~0.3-0.5x** del estimate.
- Causa:
  - **Pre-existing canonical infrastructure rich** (regla 1) — ErrorBoundary + Toast + SolverError + state machine + agentError patterns reduced decision space dramatically.
  - **A3 + BUG-15 closures already addressed 2 of 5 D8 gaps** — bounded scope to 3 surgical additions.
  - **Reformulación regla 13 (9° caso)** — 3 axes ortogonales con bounded gaps replaced "scope grande sub-track" framing.
  - **62% rule predictivo** — sweep confirmed ratify-by-convention dominant pre-redacción.
  - **Pattern 2.5 hybrid 1° anchor case (C4)** gave clear template for combining lite + extend in single closure.
  - **#687 already queued** (decoupling preserved) — coordination, no bundling.
- **Calibración alignment:** E-async sits in **"sub-track con canonical infra rich" 0.3-0.5x calibration regime** — F2 actual ~0.3-0.5x consistent. Below typical Pattern 2.5 hybrid 0.6-0.8x because the **3 axes compuesto framing initially over-estimated decision space**; canonical infra discovery reduced 8 sub-decisions to mostly ratify shapes.
- **Total esperado Fase 3:** ~3-5h con D2 table + 3 surgical UI commits + JSDoc/B8 table + CLAUDE.md/audit-state delta. Consistent con Pattern 2.5 hybrid (lite + extend) + ratify-by-convention dominant calibration.

### 9.4 Pattern 2.5 hybrid combining variants — 2° anchor case

E-async-states confirma **Pattern 2.5 hybrid combining 2.5 extend + ratify-by-convention dominant en single closure** (post-C4 1° anchor case combining 2.5 lite + 2.5 extend). 

| # | Eje | Hybrid combination |
|---|---|---|
| 1° anchor | C4 | Pattern 2.5 lite (`toolDispatch.ts` helper) + Pattern 2.5 extend (capability flags + UI surface) + 4× ratify-by-convention (cascade + WebGPU + 4 tiers + hook composition) |
| **2° anchor** | **E-async** | **Pattern 2.5 extend (3 surgical D8 UI gap closures) + ratify-by-convention dominant (5 sub-decisions: B8 + D2 + silent variant + #687 coord + state machine + cross-axis)** |

**Pattern variant emerging:** Pattern 2.5 hybrid combining variants in single closure is becoming a robust pattern for **bloque (b)/(c) ejes con canonical infra rich + bounded gap scope + ratify-dominant per axis**. Track post-future ejes.

CLAUDE.md sub-rule update post-merge:
- Pattern 2.5 lite shipping rate: D4 + B10 Par 1 + A2 + C4 = 4 data points (E-async would add 5° if Sam selects 3.6.B; default 4).
- Pattern 2.5 extend shipping rate: A3 + C1 + A7 + A6 + C4 + **E-async** = 6 data points (robust 6/6 stable).
- Pattern 2.5 hybrid combining variants single closure: C4 + **E-async** = 2 anchor cases.

### 9.5 Heads up Stage 2

Critical paths:
- **Compile-gate verification** (regla 4 + 8): anticipa zero issues — all changes additive (slice field extension, useEffect addition, dispatch additions, JSDoc). No `implements` extension. Verify with `npx tsc -b --noEmit` IN F3 commit.
- **Smoke test** post-commit-5 (worker pool errors): trigger reactiveSolver pool error (e.g., circular formula reference in piece construction) + verify rate-limited toast + `lastSolverError` Redux DevTools visible.
- **Smoke test** post-commit-3 (CollisionBodyMesh): upload corrupt collision body file + verify toast appears + verify size-limit-aware message for MeshImportLimitError.
- **Smoke test** post-commit-4 (validator): load project with intentionally invalid pieces (pre-existing test fixture if available) + verify aggregated toast appears post-load.
- **No WASM rebuild** — TS-only territory.
- **Risk floor near-zero** — all changes additive; existing surfaces unchanged.

Risk floor:
- D2/B8 convention tables are documentation. Risk: zero.
- 3 surgical UI additions are toast dispatch + slice field. Risk: very low.
- JSDoc cross-doc additions are documentation. Risk: zero.
- CLAUDE.md ratification row + audit-state delta are documentation. Risk: zero.
- **Total observable behavior change:** +3 toast surfaces (CollisionBodyMesh failure, validator post-load, worker pool errors) + 1 new Redux field (`lastSolverError`).

### 9.6 Audit cumulative state post-E-async

**Closed ejes:** **28 total** (27 pre-E-async + E-async).
- **Bloque (a) mecánicos:** 8 ejes (cleanup-shape ratify + surgical mechanical fixes).
- **Bloque (b) decisión:** 12 ejes (Pattern 2.5 hybrid variants + ratify-by-convention).
- **Bloque (c) RFCs:** 6/6 cerrados completo (C1 + A7 + A6 + A4 + A2 + C4).
- **Sub-track compuesto:** **1 (E-async-states — absorbe 3 ejes B8 + D2 + D8)**.
- **Meta-eje:** #691 CLAUDE.md reorg.

**Pending ejes:** **0.** Audit cumulative CLOSED.

**Solo pendientes follow-up issues independientes:**
- A6 setter migrations queued (#683 setWind / #684 setPins / #685 setFabric / #686 gravity / #687 SolverError / #688 init factory / #689 callbacks).
- A7 per-feature ports queued (#676-681).
- C4 follow-ups (#701-707).
- Other clusters (#693-699).
- New follow-ups from E-async (~5: #645 cross-ref + validator panel + worker pool panel + plugin manager dual state + state machine 3rd site).

**Robust patterns post-E-async (≥3 data points):**
- Pattern 2.5 hybrid 4 variants: cleanup (D6) + lite (D4 + B10 Par 1 + A2 + C4 = 4) + extend (A3 + C1 + A7 + A6 + C4 + **E-async** = 6) + extend bounded (A6).
- Pattern 2.5 hybrid combining variants single closure: C4 + **E-async** = 2 anchor cases.
- 3.6 decoupling pattern: B6-state + A7 + A6 + **E-async preserves via #687 coordination** = 4 data points.
- Inventory drift overestimation 62%: dominante (~17 of 28 = 60%) — pattern sustained.
- Regla 13 reformulation (**9° case** post-E-async): B12 + C7 + B5 + D1-cosmetic + D5 + A4 + A2 + C4 + **E-async**.
- Hook composition canonical: 1° anchored case (C4); E-async preserves via useAgenticLoop pattern.

**Audit closure milestone:** E-async-states es el último item del audit cumulative. Post-merge, audit transitions a follow-up tracking mode (no new ejes pending).

---

**FIN DEL DOC.** Esperando verde de Sam para promover PR a ready-for-review + arrancar Stage 2.
