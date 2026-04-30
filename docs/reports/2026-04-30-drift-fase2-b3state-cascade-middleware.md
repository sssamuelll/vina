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

## Sección 3 — Sub-decisiones, opciones y tradeoffs

Cinco sub-decisiones independientes (3.1–3.5). Cada una presenta las opciones realistas, sus tradeoffs, y mi recomendación con justificación. Sam decide eje por eje.

### 3.1 — Cascade detection / marker

**Pregunta:** ¿cómo se identifica que un middleware (o un dispatch específico) es producto de una cascade, no del call-site original? Sin un marker uniforme, el debugging de cascade-induced bugs es invisible (qué dispatchó qué) y la convención queda implícita.

#### Opción 3.1.A — `meta.cascadeOf` flag obligatorio en todo dispatch cascadeado

Cada dispatch que un middleware emita en respuesta a otra acción lleva `meta: { cascadeOf: '<sourceActionType>' }`.

```ts
store.dispatch({
  ...updatePiece(partner),
  meta: { cascadeOf: 'project/updatePiece' },
});
```

- **Pros:** discoverable en Redux DevTools (cada cascade dispatch muestra su origen). Habilita lint rule (todo dispatch desde middleware debe tener `meta.cascadeOf` o estar en allowlist). Marca cascade-vs-orchestration explícitamente: si llamás desde call-site no hay `cascadeOf`; si llamás desde middleware sí.
- **Cons:** ruido en payloads (todos los dispatches engordan). El reducer no necesita el flag (lo ignora) → es type-level overhead. Migration cost: 5 cascadas × N dispatches = ~10-15 sites a tocar. Doesn't address el caso #5 (`undoMiddleware` self-dispatch desde public API — ¿es cascade?).
- **Migration:** mecánica, ~10-15 dispatches a anotar + lint rule.

#### Opción 3.1.B — Comentario header obligatorio + lint rule de naming, sin flag runtime

Cada middleware con cascade lleva un header doc-comment estructurado:

```ts
/**
 * @cascade
 * shape: sym 1↔1 (mirror/instance)
 * triggers: project/updatePiece, project/addInternalLine, ...
 * dispatches: project/updatePiece (partner), project/addInternalLine (partner), ...
 * guard: module-level boolean isSyncing
 * undo: batch grouped via undo/startBatch/endBatch
 */
export const linkedEditingMiddleware: Middleware = ...
```

Lint rule custom (eslint plugin) verifica que todo middleware en `src/store/*Middleware.ts` cuyo body contenga `dispatch(` lleve `@cascade` header con campos required.

- **Pros:** zero runtime overhead. Discoverability concentrada en el archivo, no scattered en cada dispatch. Lint rule enforce coverage — nuevo middleware con cascade obliga el header. Inventario auto-actualizable: grep `@cascade` enumera todas las cascades.
- **Cons:** doesn't help debugging en runtime (DevTools no muestra "cascadeOf"). Lint rule custom es código a mantener. Las 3 sub-cascadas de `confirmationMiddleware` requieren múltiples `@cascade` blocks o sintaxis para sub-cases.
- **Migration:** mecánica, ~5 archivos a anotar + 1 lint rule.

#### Opción 3.1.C — Type-level marker via TypeScript template type, no convention en source

Definir `CascadeAction<T> = PayloadAction<T> & { meta: { cascadeOf: string } }` en `src/store/types.ts`, y forzar que dispatches desde middleware usen ese tipo via type narrowing.

- **Pros:** type-safe, no comentarios para mantener. El compilador previene cascade-sin-marker.
- **Cons:** complexity — RTK actions tienen `meta` opcional; forzar el tipo requiere wrapper helpers o utility types invasivos. Migration cost alto: cada dispatch en middleware debe re-tiparse. Doesn't actually prevent runtime cascade-sin-marker (un cast `as` lo bypassa). El value cost-vs-benefit es bajo.
- **Migration:** invasiva, ~10-15 dispatches a tipar + utility types.

#### Opción 3.1.D — No marker uniforme; documentar en CLAUDE.md la heterogeneidad observable

Aceptar que las 5 cascadas usan primitives distintas y documentar en CLAUDE.md la taxonomía (qué primitive usar para qué shape). Cada middleware mantiene su comment header informal actual; nada se enforca runtime ni lint.

- **Pros:** zero migration cost. Refleja la realidad: las cascadas tienen shape distinto (`isSyncing` boolean vs `generationId` counter vs idempotent), forzar un marker uniforme oculta esa diferencia legítima.
- **Cons:** discoverability sigue mala. Nuevo dev no sabe cuáles middlewares cascadean sin leer el código. Lint no enforce. El drift que motivó B3-state (heterogeneidad sin convención) queda intacto, solo documentado.
- **Migration:** zero código, ~50 líneas a CLAUDE.md.

#### Recomendación 3.1

**Opción 3.1.B (header `@cascade` + lint rule)**, con el detalle de que el lint rule sea **inicialmente warning-only** (`severity: warn`, no `error`) durante 1 mes para detectar false positives, y que las 3 sub-cascadas de `confirmationMiddleware` usen 3 `@cascade` headers separados (uno por sub-cascade) en vez de uno consolidado.

**Justificación:**
- 3.1.A (`meta.cascadeOf`) introduce overhead runtime sin payoff debugging suficiente — el caso de uso real es "¿qué middleware dispatchó esto?", y eso ya se ve en Redux DevTools traceable via stack trace si se habilita.
- 3.1.C (type-level) es invasivo y bypassable; cost-benefit malo.
- 3.1.D (no convention) deja el drift intacto; no resuelve B3-state.
- 3.1.B concentra la documentación en el archivo (alta cohesion), enforca via lint (no convention rot), no toca runtime, y migration es trivial.

**Tradeoff aceptado:** runtime debugging sigue dependiendo de Redux DevTools + stack traces, no de un flag inspectable en el action object. Para los 5 casos actuales esto es suficiente; si emerge un sexto caso donde el debugging requiere flag runtime, reabrimos 3.1 con el dato concreto.

---

### 3.2 — Cascade vs orchestration distinction (definición operacional)

**Pregunta:** ¿cómo se distingue una cascade middleware (action A → middleware → action B) de orchestration sequential (caller dispatch A → await → caller dispatch B)? La línea importa porque:
- Cascade middleware decide undo policy uniforme (en el middleware).
- Orchestration sequential decide error handling y loading state por fase (en el caller, scope de E-async-states).

Sin línea explícita, B3-state ratifica el primero pero alguien puede aplicarlo al segundo y romper E-async-states.

#### Opción 3.2.A — Definición operacional inline en CLAUDE.md + sección dedicada en cada `@cascade` header

Definir en CLAUDE.md (sección "Cascade vs orchestration"):

> **Cascade middleware:** un middleware en `src/store/*Middleware.ts` intercepta una action y emite uno o más dispatches secundarios sin que el call-site original sepa o controle. El call-site dispatchó 1 action; el sistema termina con N+1 actions.
>
> **Orchestration:** un caller (component, hook, thunk, tool implementation) dispatchea action A explícitamente, espera un resultado/state-change, dispatchea action B explícitamente. El caller controla la secuencia. Cada dispatch corresponde 1:1 a una intención del caller.
>
> **Test operacional:** ¿el call-site sabe que B se va a dispatchar como consecuencia de A?
> - Sí + dispatchea B explícitamente → orchestration.
> - No → cascade middleware.

Cada `@cascade` header de Sec 3.1 declara explícitamente que es cascade (no orchestration); la documentation cement la línea.

- **Pros:** definición reproducible por test. Aplica retroactivamente a cualquier middleware existente o futuro. Cementa la línea para E-async-states cuando llegue.
- **Cons:** la prueba operacional puede ser ambigua en casos border (e.g., `useTrimTool.ts:153` llama `batchUndo(dispatch, label, () => dispatch(...))` — ¿es orchestration porque el caller dispatchea explícitamente, o cascade porque `batchUndo` envuelve los dispatches con control actions?). Necesita un caso ejemplo con resolución.
- **Migration:** zero código, ~100 líneas a CLAUDE.md + 1 párrafo por `@cascade` header.

#### Opción 3.2.B — No definición; resolver caso por caso

Aceptar que cascade vs orchestration es a veces ambiguo y decidir caso por caso cuando un eje futuro lo requiera.

- **Pros:** no compromete preemptivamente.
- **Cons:** vuelve a la ambigüedad que motivó la pregunta. E-async-states cuando llegue tiene que re-litigar la línea — pierde el trabajo de inventario que B3-state ya hizo.
- **Migration:** zero, pero deuda futura garantizada.

#### Recomendación 3.2

**Opción 3.2.A** con resolución explícita del caso `batchUndo()`:

> **Caso `batchUndo()`:** el helper expone control actions del undoMiddleware al call-site. El call-site dispatchea acciones explícitamente (orchestration), pero el wrapping con `undo/startBatch`/`endBatch` es delegación al middleware (cascade-adjacent). **Clasificación:** orchestration con cascade-adjacent batching. El caller controla qué se dispatcha; el middleware controla cómo se agrupa en undo. No es "cascade middleware pura" porque el middleware no genera actions nuevas, solo controla snapshotting.

**Justificación:** la opción B garantiza re-trabajo. La opción A con caso resuelto cementa la línea sin ambigüedad para los 5 casos actuales y para cualquier caso futuro que emerja.

---

### 3.3 — Undo grouping policy para cascades

**Pregunta:** cuándo una cascade debe agrupar todos sus dispatches en single undo entry (BUG-7 ratificó esto para linkedEditing) vs. cuándo NO debe agrupar.

Estado actual:
- linkedEditing: agrupa (BUG-7).
- gradingStaleness: no agrupa.
- confirmation (a) replay: n/a (replay es single action).
- confirmation (b)(c) tool-memory: no agrupa.
- reactiveSolver: no agrupa (solver state, no user action).
- undoMiddleware: es el mecanismo.

#### Opción 3.3.A — Criterio operacional: agrupa si y solo si la cascade modifica el estado user-undoable (`project.*`)

```
agrupa = cascade modifica project state Y los dispatches representan UN paso de usuario semántico
no agrupa = cascade modifica metadata/derived state Y los dispatches son consecuencia automática
```

Aplicación a las 5 cascadas:

| Cascade | Modifica project? | Paso usuario único? | Decisión |
|---|---|---|---|
| linkedEditing | Sí (partner piece) | Sí (1 edit del usuario → 2 actualizaciones lógicamente atómicas) | **agrupa** ✓ (BUG-7) |
| gradingStaleness | No (`grading.stale` es metadata) | n/a | **no agrupa** ✓ |
| confirmation (a) replay | n/a (single action) | n/a | **n/a** ✓ |
| confirmation (b)(c) tool-memory | No (`workflow.toolMemory`) | n/a | **no agrupa** ✓ |
| reactiveSolver | Sí (project pieces vía `upsertPieceOutline`) | No (solver state derivado, no acción del usuario) | **no agrupa** ✓ |

Todas las 5 cascadas tienen decisión consistente con el criterio. Documentar en CLAUDE.md y en el `@cascade` header.

- **Pros:** criterio operacional único, reproducible. Las 5 cascadas actuales lo pasan sin re-decidir. Aplica a cascadas futuras.
- **Cons:** "paso de usuario semántico" es subjetivo en bordes (e.g., si una cascade futura modifica `project.*` automáticamente como respuesta a un timer, ¿agrupa con la action anterior o no agrupa? El criterio no responde). Marcar como deuda explícita.
- **Migration:** zero código, las 5 ya cumplen.

#### Opción 3.3.B — Decision per-cascade en cada `@cascade` header, sin criterio uniforme

Cada cascade declara su decisión en su header con justificación; no hay regla global.

- **Pros:** flexible. No fuerza criterio sobre casos border.
- **Cons:** convention rot — alguien agrega cascade nueva y "decide" sin un criterio comparable. Esto es exactamente el drift original.
- **Migration:** zero.

#### Recomendación 3.3

**Opción 3.3.A** con la deuda explícita de "casos border (e.g., timer-driven cascade que modifica project) requieren reabrir la regla". Las 5 cascadas existentes pasan; el criterio funciona para los 5 casos reales que tenemos.

---

### 3.4 — Cascade depth limit / anti-loop protection

**Pregunta:** ¿pueden las cascadas cascadear (depth > 1)? Si A trigger middleware M1 que dispatcha B, y B trigger middleware M2 que dispatcha C — ¿es válido?

Estado actual: **ninguna cascade actual tiene depth > 1**. Todas tienen guard que previene re-entrance (boolean, generation counter, idempotent action no en triggers, meta flag preventing re-mirror).

#### Opción 3.4.A — Cap formal: cascade depth = 1 (un nivel)

CLAUDE.md establece: "Una cascade middleware no puede dispatchar una action que sea trigger de otra cascade middleware. Si emerge esa necesidad, el patrón correcto es orchestration explícita (caller controla la secuencia)."

Detección: todas las 5 cascadas actuales tienen guard que cumplen esto. Si una cascade futura viola el cap, se detecta en review (lint rule futura puede estática-analizar trigger sets — no scope ahora).

- **Pros:** simple, defendible. Previene cascade-of-cascade que es notoriamente difícil de debuggear (action chains imprevisibles). Forzar orchestration cuando hay dependency entre cascades concentra la complejidad en el call-site, no scattered en middlewares.
- **Cons:** restrictivo si emerge un caso real donde cascade-of-cascade es genuino. La detección estática es pendiente (no scope ahora).
- **Migration:** zero — todas las 5 ya cumplen.

#### Opción 3.4.B — No cap formal; aceptar depth > 1 si la cascade tiene generation counter o idempotent guard

Permitir cascade-of-cascade si el middleware tiene mecanismo de prevenir loops.

- **Pros:** flexible.
- **Cons:** abre la puerta a cascade chains imprevisibles. El debugging de "qué dispatchó qué" se vuelve recursivo. Convention rot garantizado.
- **Migration:** zero.

#### Recomendación 3.4

**Opción 3.4.A.** Las 5 cascadas actuales cumplen sin esfuerzo. Cualquier caso futuro de cascade-of-cascade es smell que merece revisión, no convention default.

**Tradeoff aceptado:** si emerge un caso genuino de cascade-of-cascade, se reabre 3.4 con el caso concreto. Por ahora cap = 1.

---

### 3.5 — Documentation / discoverability convention

**Pregunta:** ¿cómo descubre un nuevo dev que un middleware cascadea, sin leer el código entero? Estado actual: discoverability es heterogénea — `linkedEditing` tiene comment inline (`:84`), `gradingStaleness` y `confirmation` tienen header del archivo, `reactiveSolver` está en CLAUDE.md, `undoMiddleware` tiene header. `meta.skipConfirmation` se documenta en exactamente 1 comment (`useScissorsTool.ts:152`).

#### Opción 3.5.A — `@cascade` header obligatorio (de 3.1.B) + entrada en CLAUDE.md por cada cascade + `meta.*` flags documentados centralmente

Combina:
1. `@cascade` header en cada middleware con cascade (de 3.1.B).
2. CLAUDE.md sección "Cascade middleware patterns" lista las 5 cascadas con resumen.
3. CLAUDE.md sección "Action meta flags" documenta `meta.skipConfirmation` y `meta.fromToolMemory` con propósito + callsites pattern.

- **Pros:** discoverability multi-nivel. Un nuevo dev puede leer CLAUDE.md (overview), o `grep '@cascade'` (enumeración), o leer header del archivo (detalle). El comment inline aislado de `useScissorsTool.ts:152` se promueve a documentation central.
- **Cons:** triple write — CLAUDE.md + header + lint. Mantenibilidad: si una cascade cambia, hay 2 lugares a actualizar.
- **Migration:** ~5 headers + ~80 líneas a CLAUDE.md.

#### Opción 3.5.B — `@cascade` header solo, sin CLAUDE.md sección

Header en archivo es la única documentation. CLAUDE.md no tiene sección dedicada.

- **Pros:** single source of truth (el archivo).
- **Cons:** discoverability requiere conocer la convention `@cascade` o saber qué archivos buscar. Nuevo dev puede missear todo el subsystem.
- **Migration:** ~5 headers.

#### Opción 3.5.C — Solo CLAUDE.md, sin header lint-enforced

CLAUDE.md tiene la lista; los archivos individuales tienen comentarios informales como hoy.

- **Pros:** un solo lugar para mantener.
- **Cons:** lint no enforce; nuevo middleware con cascade puede no entrar a CLAUDE.md por descuido. Convention rot.
- **Migration:** ~80 líneas a CLAUDE.md.

#### Recomendación 3.5

**Opción 3.5.A** con la salvedad de que CLAUDE.md sección sea **resumen** (1-2 líneas por cascade + cross-ref al archivo), no duplicación del header. La autoridad sigue siendo el header `@cascade`; CLAUDE.md es índice.

**Justificación:**
- 3.5.B falla en discoverability inicial (nuevo dev no sabe que existe la convention).
- 3.5.C falla en enforce (convention rot al primer middleware nuevo).
- 3.5.A da multi-nivel con redundancia mínima (CLAUDE.md = índice, header = autoridad).

**Mantenibilidad:** la duplicación CLAUDE.md ↔ header es 1-2 líneas resumen, no contenido pleno. Cambio profundo en cascade actualiza header (autoritativo) y opcional resumen en CLAUDE.md.

---

### Tabla resumen Sec 3

| Sub-decisión | Recomendación | Migration cost |
|---|---|---|
| 3.1 Marker | **3.1.B** — `@cascade` header + lint rule warning-only | ~5 headers + 1 lint rule |
| 3.2 Cascade vs orchestration | **3.2.A** — definición operacional en CLAUDE.md + caso `batchUndo()` resuelto | ~100 líneas CLAUDE.md |
| 3.3 Undo grouping | **3.3.A** — criterio: agrupa si modifica project Y es paso usuario único | zero (5/5 ya cumplen) |
| 3.4 Depth limit | **3.4.A** — cap formal = 1, reabrir si emerge caso real | zero (5/5 ya cumplen) |
| 3.5 Discoverability | **3.5.A** — `@cascade` header + CLAUDE.md sección resumen + meta flags doc | ~5 headers + ~80 líneas CLAUDE.md |

**Total migration:** 5 headers + 1 lint rule + ~180 líneas a CLAUDE.md + 0 cambio runtime + 0 cambio en cascadas existentes (5/5 ya cumplen los criterios). Las 5 cascadas se preservan textualmente; B3-state cementa la convención sin tocar código de comportamiento.

[Sec 4-9 pendientes — incremental push.]

