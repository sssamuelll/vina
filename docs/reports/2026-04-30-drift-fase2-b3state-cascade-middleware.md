# Drift Fase 2 — B3-state: Cascade middleware patterns

**Fecha:** 2026-04-30
**Eje:** B3-state — Mutaciones / cascada middleware.
**Categoría inventario:** (b) requiere decisión de producto/arquitectura.
**Estado:** PROPUESTA. Fase 2 doc presenta opciones + tradeoffs + recomendación. Ningún canónico está aprobado. Esperando review de Sam.

**Branch:** `drift/b3-state-cascade-middleware`.
**Cross-ref clasificación:** `docs/reports/2026-04-28-drift-fase2-classification.md` (eje (b), pregunta canonical: "¿Cascade dispatches son legítimos? Si sí, ¿cómo se relacionan con undo (BUG-7 fix)? ¿Convención `meta.cascadeOf`?").
**Cross-ref addendum:** `docs/reports/2026-04-29-drift-inventory-addendum.md` § 3 (precedente bajo evaluación: batch-action grouping para cascadas — BUG-7).
**Cross-ref BUG-7 nota:** la nota fix-options de BUG-7 introdujo el patrón batch-action grouping; B3-state evalúa si extenderlo como canónico.
**Cross-ref B12-state ratificación:** `NEW_PROJECT` extraReducer es out-of-scope (single action multi-handled, ya canonical via `newProjectRegistry.ts`).
**Cross-ref E-async-states:** sub-track aún no arrancado; B3-state NO decide error handling para cascade async.

---

## Sección 1 — Decide / NO decide

### Decide en este eje

1. **Cuándo cascade middleware es legítima vs anti-pattern.** Definición operacional: bajo qué condiciones un middleware tiene derecho a dispatchar acciones secundarias en respuesta a una acción primaria, vs. cuándo el comportamiento debe vivir en el reducer, en un thunk explícito, o en el call-site.
2. **Canonical pattern para cascade legítima.** Entre las primitives en uso (re-entrance guard module-level booleano, `meta.*` flag, control actions tipo `undo/startBatch`/`endBatch`, generation counter, idempotent-no-guard, cross-slice extraReducer): cuál es el patrón a usar para nuevas cascadas, y cómo se mapean las 5 cascadas existentes a esos patrones.
3. **Convención de naming/marker para cascade middleware.** Si una cascade se identifica vía `meta.cascadeOf`, vía control action explícita, o vía comentario/lint rule. Discoverability concreto: cómo un nuevo dev sabe que un middleware cascadea sin leer el código entero.
4. **Undo grouping policy para cascades.** Cuándo una cascade debe agruparse en single undo entry (BUG-7 ya resolvió linkedEditing) vs. cuándo NO (gradingStaleness `setStale` no agrupa). Criterio reproducible.
5. **Cascade depth limit / anti-loop protection.** Si las cascades pueden cascadear (depth > 1) o si la convención cap es 1. Mecanismo de detección si el cap se viola.

### NO decide en este eje

1. **Orchestration sequential awaits (AgenticLoop pattern).** Caller dispatch → await tool execution → caller dispatch siguiente. Diferente shape de cascade middleware (sequential, observable, no auto-trigger desde middleware). Pertenece a E-async-states sub-track cuando arranque. **Cross-ref:** `src/copilot/reasoning/bridge/AgenticLoop.ts`.
2. **Error handling de cascade async chains** (Phase 2 reactiveSolver debounced + worker pool). Las async chains son cascade real, pero cómo se propagan errores y loading states entre fases del chain es scope de E-async-states. B3-state decide cascade detection/marker/undo policy; B3-state NO decide cómo el error de Phase 2 worker se reporta al usuario.
3. **`NEW_PROJECT` extraReducer pattern.** Single action handled por N reducers. NI cascade middleware NI orchestration. Ya ratificado por B12-state como canonical (`newProjectRegistry.ts` + invariant test). Out-of-scope.
4. **Undo internals (cómo `undoMiddleware` decide qué snapshotear).** BUG-7 fix-options ya ratificó el shape (start/endBatch + batchDepth counter). B3-state ratifica el uso del shape para cascades pero no re-litiga el shape interno del undoMiddleware.
5. **Refactor del `confirmationMiddleware`** (3 sub-cascadas internas) más allá de aplicar el canonical de B3-state. La estructura "intercept-defer + tool-memory mirror + tool-memory auto-apply" es producto de la tarea original (Click'n'Go #268) y mezcla cascade con state-mirror; un refactor profundo es scope de un eje diferente si emerge.

### Por qué importa la línea

Sin la distinción cascade vs orchestration explícita, alguien que lee la ratificación de B3-state puede asumir que aplica a todo dispatch-secundario en el codebase (incluyendo orchestration de copilot). Esa asunción rompe E-async-states cuando llegue: una cascade middleware decide undo policy uniformemente, una orchestration sequential decide error policy por fase. B3-state decide la primera; E-async-states la segunda. La línea debe vivir en este doc, no implícita.

---

## Sección 2 — Estado actual

### 2.1 Pre-existing canonical infrastructure (regla 1 — chequeo previo)

Antes de proponer canonical, verifico si el codebase ya tiene infraestructura formalizada que resuelva el eje. Resultado del sweep:

- **No hay registry de cascades.** No existe `cascadeRegistry.ts`, `middlewareManifest.ts` o similar.
- **No hay invariant test que enumere las cascades del sistema.** Cada middleware es testeado en isolación (`linkedEditing`, `gradingStaleness`, etc.) pero no hay enumeración cross-middleware.
- **No hay lint rule que enforce convención de cascade marker.** `meta.skipConfirmation` y `meta.fromToolMemory` son convenciones ad-hoc, sin lint o type-level enforcement.
- **No hay comentario inline tipo `// canonical: cascade pattern`** en ningún middleware.

**Hay 1 precedente fresco con scope claro** (BUG-7, commit `1069b87`, PR #610): `linkedEditingMiddleware` adoptó `undo/startBatch`/`endBatch` para agrupar cascade en single undo entry. El addendum (`drift-inventory-addendum-2026-04-29.md` § 3) lo clasificó como **"precedente bajo evaluación"** — patrón emergido dentro de un fix puntual, no producto de una decisión de diseño explícita para todas las cascades.

**Conclusión:** no hay canonical pre-existente. B3-state Fase 2 produce canonical (no ratification).

### 2.2 Inventario de cascades verificadas

Sweep (2026-04-30) sobre `src/store/**`, `src/copilot/**`, llamadas a `store.dispatch`/`api.dispatch`/`listenerApi.dispatch`, uso de `meta.*` flags, consumers de `undo/startBatch`/`endBatch`, `createListenerMiddleware` (RTK listener — empty, no usado).

**5 middlewares activos**, registrados en `src/store/index.ts:75` en orden:

```
confirmation → linkedEditing → undo → reactiveSolver → gradingStaleness
```

#### Cascade #1 — `linkedEditingMiddleware` (sym 1↔1)

| Campo | Valor |
|---|---|
| Archivo | `src/store/linkedEditingMiddleware.ts` |
| Shape | Simétrica 1↔1 (mirror/instance — partner piece se sincroniza con source) |
| Triggers | 5 actions: `project/updatePiece`, `project/addInternalLine`, `project/updateInternalLine`, `project/flipPieceH`, `project/flipPieceV` (filtradas por `willCascade()` — partner debe tener `linkedPieceId` + `linkMode`) |
| Cascade dispatches | 4 sync helpers: `syncUpdatePiece`, `syncAddInternalLine`, `syncUpdateInternalLine`, + `syncUpdatePiece` para flips. Todos dispatchan al partner. |
| Re-entrance guard | `let isSyncing = false` (module-level boolean). Set true antes de `runCascade`, false en `finally`. |
| Undo grouping | **Sí** — `undo/startBatch`/`undo/endBatch` (precedente fresco BUG-7). |
| Why | Mantener pieces vinculadas (mirror axis-X o instance) en sync. |
| Cap depth | 1 (re-entrance guard previene cascada-de-cascada). |

#### Cascade #2 — `gradingStalenessMiddleware` (obs 1→1 asymmetric, idempotent)

| Campo | Valor |
|---|---|
| Archivo | `src/store/gradingStalenessMiddleware.ts` |
| Shape | Observación asimétrica — piece-modifying action → `grading/setStale` si grading existe Y piece editada es base (no generated variant). |
| Triggers | 8 actions: `project/updatePiece`, `movePiece`, `rotatePiece`, `removePiece`, `removePieces`, `addInternalLine`, `updateInternalLine`, `removeInternalLine`. |
| Cascade dispatches | 1: `grading/setStale` con `payload: true`. |
| Re-entrance guard | **Ninguno** — `setStale` es idempotente; el middleware además tiene early-return si `grading.stale === true` o si `Object.keys(generatedPieces).length === 0`. |
| Undo grouping | **No** — `grading/setStale` es metadata observacional, no parte del undo step del usuario. |
| Why | Marcar grading como stale automáticamente cuando base piece se modifica (Issue #258). |
| Cap depth | 0 (cascada no dispara nuevos triggers — `setStale` no está en `PIECE_MODIFYING_ACTIONS`). |

#### Cascade #3 — `confirmationMiddleware` (3 sub-cascadas en un mismo middleware)

| Campo | Valor |
|---|---|
| Archivo | `src/store/confirmationMiddleware.ts` |
| Shape (a) | **Intercept-defer + replay**: bloquea destructive action, dispatcha `showConfirmation` UI; usuario confirma → `CopilotUIOverlay.tsx:68` re-dispatcha la action original con `meta.skipConfirmation: true`. |
| Shape (b) | **Tool-memory mirror** (obs 1→1): `tools/setToolOption` (sin `meta.fromToolMemory`) → `updateToolMemory` dispatch. |
| Shape (c) | **Tool-memory auto-apply** (1→N fan-out): `tools/setActiveTool2D` o `tools/setActiveTool3D` → para cada saved option, dispatch `tools/setToolOption` con `meta.fromToolMemory: true`. |
| Triggers (a) | 4 destructive actions: `project/removePiece`, `project/removePieces`, `project/removeSeam`, `construction/removePoint`. |
| Triggers (b) | `tools/setToolOption`. |
| Triggers (c) | `tools/setActiveTool2D`, `tools/setActiveTool3D`. |
| Re-entrance guard | (a) `meta.skipConfirmation` flag (caller responsibility en replay). (b) skip si `meta.fromToolMemory` ya marcado. (c) marca todos los re-dispatches con `meta.fromToolMemory: true` para que (b) no los re-mirror. |
| Undo grouping | (a) None — el replay vuelve por confirmation y entra como single action. (b)(c) None. |
| Why | (a) Click'n'Go #268: gating de destructive actions con override per-operation. (b)(c) Persistencia de tool options entre tool switches. |
| Cap depth | 1 (los replays con `meta.skipConfirmation` no re-bloquean; `meta.fromToolMemory` previene mirror loop). |

#### Cascade #4 — `reactiveSolverMiddleware` (chain orchestration multi-stage)

| Campo | Valor |
|---|---|
| Archivo | `src/store/reactiveSolverMiddleware.ts` |
| Shape (a) | **Observación 1→1**: `construction/removePoint` → recompute unresolvedCount → dispatch `setUnresolvedCount`. |
| Shape (b) | **Chain multi-stage**: TRIGGER action → Phase 1 sync (`resolvePointsSync` → dispatch `resolveAll` + `setUnresolvedCount`) → Phase 2 async debounced (`buildPiecesAsync` → dispatch `upsertPieceOutline` + `mapPieceIdentity`). |
| Triggers (a) | `construction/removePoint`. |
| Triggers (b) | 5 actions: `project/updateMeasurements`, `construction/setVariable`, `parametric/setVariableOverride`, `parametric/setVariableOverrides`, `parametric/activateTemplate`. |
| Cascade dispatches | (a) 1: `setUnresolvedCount`. (b) Phase 1: `resolveAll`, `setUnresolvedCount`. Phase 2: `upsertPieceOutline`, `mapPieceIdentity` por piece. |
| Re-entrance guard | `state.generationId` counter (cada trigger incrementa; Phase 2 verifica que su generation aún sea current; el pool cancela work stale). Adaptive debounce 50–400ms. |
| Undo grouping | **No** — solver-generated state changes no son user-undoable; son producto reactivo del trigger original. El trigger sí es undoable (parametric actions están en `ACTION_LABELS` o triggean snapshot). |
| Why | Recomputación reactiva de pattern pieces cuando cambian measurements o variables. |
| Cap depth | El Phase 2 `upsertPieceOutline` no triggea otros triggers (no está en TRIGGER_ACTIONS), pero sí pasa por undo y reactiveSolver de nuevo (no-op porque no es trigger). Effective depth: 1. |

#### Cascade #5 — `undoMiddleware` (self-dispatch + control consumer)

| Campo | Valor |
|---|---|
| Archivo | `src/store/undoMiddleware.ts` |
| Shape | **Self-dispatch** desde public API (`jumpToIndex(N, store)` → loop dispatch `editor/undo` N veces). + **Consumer de control actions** (`undo/startBatch`/`endBatch` desde linkedEditing y `batchUndo()` helper público). |
| Triggers | (self) `editor/undo`, `editor/redo`. (control) `undo/startBatch`, `undo/endBatch`. |
| Cascade dispatches | (self) `project/restoreState`. (control) ninguno — modifica state interno (`batchDepth`, `batchSnapshot`). |
| Re-entrance guard | `batchDepth` counter (suprime snapshots dentro de batch). |
| Undo grouping | **Es el mecanismo mismo** — undoMiddleware implementa el grouping para los demás. |
| Why | History panel + undo/redo + batch grouping API. |
| Cap depth | n/a — el self-dispatch es idempotente (cada `editor/undo` consume del stack). |

### 2.3 Inventario de primitives en uso (6 distintos)

Cada cascade arriba usa una combinación de las siguientes primitives:

| # | Primitive | Sites únicos | Notas |
|---|---|---|---|
| P1 | Module-level boolean re-entrance guard | `linkedEditing isSyncing` | 1 site único |
| P2 | Generation counter | `reactiveSolver state.generationId` | 1 site único |
| P3 | Idempotent observational dispatch (sin guard) | `gradingStaleness`, `confirmation tool-memory mirror` | 2 sites |
| P4 | `meta.*` flag para skip/replay | `meta.skipConfirmation` (7 callers externos), `meta.fromToolMemory` (1 internal cascade fan-out) | 2 flags activos en todo el store |
| P5 | Control actions para batch grouping | `undo/startBatch`/`endBatch` consumido por `undoMiddleware`; producido por `linkedEditingMiddleware` (1 site internal) + `batchUndo()` helper público (5 callers) | Helper en `undoMiddleware.ts:102` |
| P6 | Cross-slice extraReducer (single action, N reducers) | `NEW_PROJECT` — 17 slices listen via `builder.addCase(NEW_PROJECT, ...)` | **OUT OF SCOPE** (B12-state ya canonical) |

### 2.4 Callsites externos por primitive

#### P4 — `meta.skipConfirmation` (7 callers externos)

```
src/copilot/action/tools/definitions/patternOpsTools.ts:133  — removePiece (auto-merge cleanup)
src/copilot/action/tools/definitions/patternOpsTools.ts:401  — removePiece (split cleanup)
src/copilot/action/tools/definitions/patternOpsTools.ts:745  — rollback de createPiece (removePiece)
src/components/PatternEditor/useMergeTool.ts:135             — removeSeam (merge result)
src/components/PatternEditor/useMergeTool.ts:139             — removePiece (merge source)
src/components/PatternEditor/useMergeTool.ts:140             — removePiece (merge target)
src/components/CopilotPanel/CopilotUIOverlay.tsx:68          — REPLAY después de user confirm
src/components/PatternEditor/useScissorsTool.ts:153          — removePiece (cut original)
```

Plus comment-only mention en `useScissorsTool.ts:152` (`// Use meta.skipConfirmation to bypass confirmationMiddleware`) — única documentación inline del flag en todo el codebase.

#### P5 — `batchUndo()` helper público (5 callers)

```
src/copilot/action/tools/definitions/trimTools.ts:421  — 'Distribute trims along edge'
src/copilot/action/tools/definitions/trimTools.ts:474  — 'Mirror trims to symmetric piece'
src/components/PatternEditor/useTrimTool.ts:153        — 'Distribute trims' / 'Place trim'
src/components/BottomPanel/GradingTab.tsx:174          — 'Grade pattern'
src/components/BottomPanel/GradingTab.tsx:238          — 'Clear grading'
```

Plus el uso interno en `linkedEditingMiddleware.ts:85,98` que dispatcha las control actions directamente sin ir por `batchUndo()` (porque dispatchea desde adentro del middleware, no desde call-site).

### 2.5 Drift map — preguntas abiertas por cascade

Por cada cascade, las sub-decisiones que aplican:

| Cascade | 3.1 Marker | 3.2 Cascade-vs-orch | 3.3 Undo grouping | 3.4 Depth limit | 3.5 Discoverability |
|---|---|---|---|---|---|
| #1 linkedEditing | usa P5 control actions + P1 isSyncing | cascade clara | sí, agrupado (BUG-7) | cap 1 (isSyncing) | comment en `:84` documenta el batch reasoning |
| #2 gradingStaleness | sin marker, idempotent | cascade observacional | no agrupa (metadata) | cap 0 (action no en triggers) | header del archivo lo documenta |
| #3 confirmation (a) replay | usa P4 meta.skipConfirmation | cascade intercept-defer-replay | n/a (replay es single action) | cap 1 (replays no re-bloquean) | comment en `useScissorsTool.ts:152` único |
| #3 confirmation (b)(c) tool-memory | usa P4 meta.fromToolMemory | cascade observ + fan-out | no agrupa (state mirror) | cap 1 (flag previene loop) | header del archivo lo documenta |
| #4 reactiveSolver (a) removePoint | sin marker | cascade observacional | no agrupa | cap 0 | mencionado en CLAUDE.md "Reactive Solver Middleware" |
| #4 reactiveSolver (b) chain | usa P2 generationId | cascade chain async | no agrupa (solver state, no user action) | cap 1 (Phase 2 outputs no son triggers) | mencionado en CLAUDE.md "Reactive Solver Middleware" |
| #5 undoMiddleware self | n/a (self-dispatch desde public API) | cascade controlada | n/a (es el mecanismo) | n/a | header del archivo lo documenta |

**Heterogeneidad observable:** las 5 cascades usan 6 primitives distintos en 4 combinaciones diferentes. No hay convención unificada. Esa heterogeneidad es exactamente el drift que B3-state debe resolver — pero la pregunta NO es "una sola convención para todas" (las cascadas son shape-distintas) sino "una taxonomía operacional que mapee cada shape a una primitive específica + una convención de discoverability uniforme".

### 2.6 Lo que el sweep descartó

- **RTK `createListenerMiddleware`/`startListening`/`addListener`**: empty. No usado en el codebase. Saga-like patterns de RTK descartados.
- **Otros `store.dispatch` fuera de los 5 middlewares**: 3 hits — `App.tsx:21` (top-level showToast init, no cascade), `PluginHost.ts:89` (JSDoc comment, no callsite), `CopilotUIOverlay.tsx:68` (replay ya inventariado). No hay cascade middleware oculto.
- **Bridge orchestration** (`src/copilot/reasoning/bridge/AgenticLoop.ts`, `src/copilot/planner/`): sequential awaits, NO cascade. Out-of-scope per Sec 1.
- **`NEW_PROJECT` extraReducer pattern**: single action multi-handled (17 slices). NO middleware cascade. Already canonical (B12-state).

---

[Sec 3-9 pendientes — incremental push.]
