# Drift Fase 2 — D4: CopilotPanel composition (11 useState)

**Fecha:** 2026-05-01
**Eje:** D4 — CopilotPanel.tsx composition (11 useState, dual representation messages/memoryRef).
**Categoría inventario:** (b) decisión producto/arq.
**Estado:** PROPUESTA. Pattern 2.5 hybrid lite — minimal cleanup + ratify + product defer. Esperando review de Sam.

**Branch:** `drift/d4-copilotpanel-composition`.
**Cross-ref inventario:** `docs/reports/2026-04-28-drift-inventory-fase1.md` → D4.
**Cross-ref D6 (closed):** precedent del shape Pattern 2.5 hybrid (declared deprecation + unused bridge).
**Cross-ref D1-real (closed):** precedent del shape "dual representation con bridge module concentrated".
**Cross-ref D3 (closed):** precedent del shape "YAGNI for 1 consumer abstraction" (MeasurementInput status quo).

---

## Sección 1 — Decide / NO decide

### Decide en este eje

1. **Pattern 2.5 hybrid lite ratificado.** CopilotPanel composition NO es Pattern 1 real refactor (sub-components ya extracted, persistence ya existe), NO es Pattern 2 ratify clean (dual maintenance es real coupling worth surgical fix). Es **hybrid lite:** minimal cleanup del drift real + ratify del resto + product defer del UX question.
2. **`recordMessage` minimal helper.** Captura el dual-maintenance drift (2 sites donde `setMessages + memoryRef.addMessage` viven paired) sin scope creep de useCopilotChat full hook.
3. **Document dual representation explicit.** `messages` useState (UI display, transient) + `memoryRef.current` ProjectMemory (LLM context, persistent) son representations intencionales por lifecycle. JSDoc + CLAUDE.md section.
4. **UI re-hydration on mount: defer to product.** Current behavior (UI fresh on mount, ProjectMemory preserves context) NO está documented como intentional para el caso panel-close (solo project-switch tiene comment). Decisión es UX/product, NO technical — D4 abre follow-up issue, no decide unilateralmente.

### NO decide en este eje

1. **Full `useCopilotChat` hook extraction.** Descartado por análisis Sec 3.1 (1 consumer + scope creep + net displacement sin simplification + D1-real precedent NO aplica con N=1).
2. **`useCopilotSettings` / `useCopilotInput` / `useCopilotPanelLayout` hooks.** Out-of-scope. Settings hydration son 2 useEffect lines simples; UI state son scoped a CopilotPanel only. Extract overhead > benefit con 1 consumer.
3. **Refactor del `messages` UI to derive from `memoryRef`** (single source of truth). Out-of-scope; UX change requires product decision.
4. **Mover `messages` o `memoryRef` data a Redux.** Out-of-scope. Current architecture works (sub-components consume props, no cross-component access needed).
5. **Refactor de `ProjectMemory` class.** Out-of-scope. Persistence layer funciona; D4 no toca.
6. **Sub-component extraction adicional.** 10 sub-components ya extracted; el remaining CopilotPanel.tsx (368 líneas) es coordination layer, no UI code.
7. **`isOpen`/`isFullscreen`/`expandedTools` UI state.** Mantener as useState; no Redux migration justificada.

### Por qué importa la línea

Sin la ratification + minimal cleanup, alguien que vea 11 useState + dual `setMessages + memoryRef.addMessage` calls puede:
- (a) Asumir mega-component bug y propose extracción agresiva (over-engineering YAGNI for N=1).
- (b) Asumir "missing persistence" bug y proponer Redux migration (persistence ya existe via ProjectMemory).
- (c) Olvidar `memoryRef.addMessage` en un nuevo message handler — desync UI/context (real risk).

D4 captura exactly (c) con surgical helper, ratifica (a) status quo, refuta (b) con evidence.

---

## Sección 2 — Estado actual

### 2.1 Pre-existing canonical infrastructure (regla 1 v2)

**Sub-component extraction ALREADY done.** `src/components/CopilotPanel/` directory:

| Tipo | Archivos |
|---|---|
| Main component | `CopilotPanel.tsx` (368 líneas, coordination layer) |
| UI sub-components (10) | `CopilotHeader`, `CopilotInput`, `CopilotMessages`, `CopilotEmptyState`, `CopilotConfirmDialog`, `CopilotToast`, `CopilotPlanView`, `CopilotActionLog`, `CopilotSidePanel`, `CopilotUIOverlay` |
| Hooks already extracted (2) | `useCopilotKeyboardShortcuts.ts` (Escape key), `useCopilotUI.ts` (action feedback) |
| Sub-folder | `ProgressMessage/` |

**Nota crítica:** los 2 hooks existing NO extractan chat state — son concerns separados (keyboard shortcuts + action feedback para copilot agent actions). Coordination state (messages, run, settings) sigue inline en CopilotPanel.tsx.

**Persistence layer ALREADY exists:** `ProjectMemory` class (`src/copilot/memory/ProjectMemory.ts:29-...`):
- `_load()` automatic en constructor.
- `addMessage()` + `.save()` para persistence.
- `localStorage` (`openclo_memory_<projectId>`).
- MAX_MESSAGES = 50 (rolling window).
- Module header: "Class-based API for **session-level message history + decisions**. Stored in localStorage for synchronous access from CopilotPanel."

**Conclusión:** sub-components done + persistence done. D4 no produce architecture refactor — produce surgical cleanup + documentation + product defer.

### 2.2 11 useState classified por concern

| useState | Línea | Bucket | Persistence |
|---|---|---|---|
| `isOpen` | 76 | UI state | None (transient) |
| `showSettings` | 77 | UI state | None (transient) |
| `isFullscreen` | 78 | UI state | None (transient) |
| `messages` | 79 | **Session/display** | None — **dual con `memoryRef`** (see Sec 2.4) |
| `input` | 80 | Input | None (transient) |
| `isLoading` | 81 | Run state | None (transient) |
| `agentConfig` | 82 | Settings | **IDB persistent** via `loadAgentConfig()` async |
| `providerConfig` | 83 | Settings | **IDB persistent** via `loadProviderConfig()` async (sync fallback) |
| `isMobile` | 89 | UI state | None (recomputed on resize) |
| `expandedTools` | 90 | UI state | None (transient) |
| `sessionCostLabel` | 91 | Run state | None (recomputed) |

**Buckets:**
- **5 UI state** (isOpen, showSettings, isFullscreen, isMobile, expandedTools): coordinated panel layout state.
- **2 Settings state** (agentConfig, providerConfig): IDB-persistent, hydrated async on mount.
- **2 Run state** (isLoading, sessionCostLabel): transient run progress.
- **1 Session/display state** (messages): UI rendering, **dual-maintained con `memoryRef`**.
- **1 Input state** (input): text input.

### 2.3 Dual representation `messages` + `memoryRef`

**Crítico:** `messages` useState es **dual** con `memoryRef.current` (ProjectMemory):

| Layer | Field | What | Persistence |
|---|---|---|---|
| UI | `messages: DisplayMessage[]` (line 79) | UI rendering with toolCalls metadata | Transient (cleared on unmount) |
| Persistent | `memoryRef.current.messages: CopilotMessage[]` (line 94, 152) | LLM context + decisions | localStorage (`openclo_memory_<projectId>`) |

**Bridge: inline en handlers (no concentrated module).** Dual-paired sites (verified read):

| # | Sitio | Pattern |
|---|---|---|
| 1 | Lines 173-174 (user message) | `setMessages([...prev, userMsg]); memoryRef.current.addMessage({role:'user', ...})` |
| 2 | Lines 193 + 200-206 (assistant message + cost tracking) | `setMessages([...prev, assistantMsg]); ... memoryRef.current.addMessage({role:'assistant', ...}); memoryRef.current.save()` |

**Total: 2 dual-paired sites.** Other `setMessages` calls son UI-only intentional:
- Line 210 (cost warning) — UI hint, NOT context.
- Line 215-224 (error message) — UI hint, NOT context.
- Line 252 (`handleClearConversation`) — clears UI; `handleClearMemory` separately clears memory.
- Line 155 (project switch) — clears UI; `useEffect` recreates `memoryRef` for new project.

**Re-hydration on mount: NO.** Lines 79-94: `messages` initialized to `[]`, no `useEffect(() => loadFromMemory())`. UI starts fresh visually each session, while `memoryRef._load()` loads context for LLM.

**Comment line 154:** "Clear UI messages when switching projects to prevent cross-project context leak." Aplica a `[project.id]` dependency — project switch. **NO comment ni evidence** del intent para panel close/reopen behavior.

### 2.4 Drift real identificado

**Drift surgical:** los 2 dual-paired sites son risk for desync:
- Si un dev futuro agrega un nuevo message handler (e.g., system message, tool result message), debe acordarse de hacer **AMBOS** updates.
- Convention sin enforcement: no helper, no JSDoc, no lint rule.
- Smell: pattern repetido inline 2× en single file.

**Drift NO observado:**
- ❌ Sub-component mixing: 10 sub-components ya extracted.
- ❌ Missing persistence: ProjectMemory clase active y .save() called.
- ❌ Mega-component (>500 líneas con UI mixed): 368 líneas de coordination layer.
- ❌ State management chaos: 11 useState classified en 5 buckets coherentes.

### 2.5 Existing hooks NO extractan chat state

**`useCopilotKeyboardShortcuts.ts`** — handles Escape key to dismiss confirmation/toast. Module header: "Copilot-specific keyboard shortcuts. Handles Escape to dismiss confirmation dialogs and toasts. Undo/redo is handled by the global ShortcutRegistry."

**`useCopilotUI.ts`** — copilot UI feedback for agent actions (highlights, toasts, action confirmations). Module header: "Hook for integrating copilot actions with UI feedback."

**Ninguno extracta chat state.** Son separate concerns (keyboard input handling + agent action feedback). Coordination state (`messages`, `isLoading`, `agentConfig`, etc.) sigue inline en CopilotPanel.tsx.

### 2.6 Pattern detectado — Pattern 2.5 hybrid lite

```
                  CopilotPanel/
                  ├─ Sub-components (10) ✅ ya extracted
                  ├─ Hooks separate concerns (2) ✅ ya extracted
                  └─ CopilotPanel.tsx (368 lines, coordination)
                          │
                          ├─ 11 useState (5 buckets coherent)
                          │
                          └─ messages ←──── dual ──── memoryRef.current
                              (UI display)            (LLM context, persistent)
                              transient                via ProjectMemory class
                                    │
                                    └─ 2 dual-paired sites in handlers
                                       (drift surgical: helper recordMessage
                                        captures pattern, ratify rest)
```

**This is Pattern 2.5 hybrid LITE** — not full hybrid (D6 was unused-bridge cleanup; D4 is dual-maintenance surgical helper):
- Ratify architecture (sub-components done, persistence done, dual representation intentional).
- Surgical cleanup of drift real (`recordMessage` helper for 2 dual-paired sites).
- Defer product/UX question (re-hydration on mount).

### 2.7 Trigger anticipado check

- **Sub-components mixing:** 0 — already extracted.
- **State management chaos:** 0 — 11 useState classified coherent.
- **History persistence missing:** 0 — ProjectMemory class active.
- **Existing hooks extract chat state:** 0 — son separate concerns.

Sin sorpresas que cambien framing.

---

## Sección 3 — Sub-decisiones, opciones y tradeoffs

Tres sub-decisiones: 3.1 (extraction scope), 3.2 (dual representation documentation), 3.3 (UI re-hydration policy).

### 3.1 Extraction scope (drift cleanup)

**Pregunta:** ¿extract full `useCopilotChat` hook, status quo + document, o minimal `recordMessage` helper?

#### Opción 3.1.A — Full `useCopilotChat` hook extraction (DESCARTADA)

Extract hook que wraps messages + memoryRef + agenticHook + handleProviderSend + abortController + costManagerRef + sessionCostLabel coordination. CopilotPanel reduces from 368 → ~280 lines.

- **Pros:** concentration of coordination logic, testability via isolated hook.
- **Cons (primary):** **1 consumer (CopilotPanel)** — mismo YAGNI threshold que aplicamos en D3 para `MeasurementInput` status quo. D1-real precedent NO aplica: `dartEntity.ts` tiene 8+ consumers (slashAndSpread, dartTools, patternOps, etc.); `useCopilotChat` tendría 1.
- **Cons (secondary):** **net displacement, no simplification.** ~88 líneas mueven de CopilotPanel a useCopilotChat. File count crece, line count igual o crece (boilerplate hook signature + return shape).
- **Cons (tertiary):** testability argument is weak — podés testear CopilotPanel directamente con hooks mockeados (`useAgenticLoop` ya es hook, `ProjectMemory` ya es class injectable). Extraction no improves testability proportionally al cost.
- **Cons (quaternary):** scope creep — agenticHook coordination + handleProviderSend + abortController son distinct concerns que se acumulan en single hook for organization sake.
- **Descartar:** YAGNI for N=1 consumer + over-engineering vs surgical fix.

#### Opción 3.1.B — Status quo + document only

Ratify dual maintenance pattern as-is, document inline en CopilotPanel.tsx + CLAUDE.md. No code change.

- **Pros:** minimal change.
- **Cons (primary):** **drift surgical persists.** Future dev adding new message handler may forget `memoryRef.addMessage` — desync UI/context. Documentation alone doesn't enforce.
- **Cons (secondary):** the 2 dual-paired sites are smell that has trivial fix (helper).
- **Descartar:** drift real merece surgical fix vs document-only.

#### Opción 3.1.D — Minimal helper `recordMessage` (RECOMENDADA)

Surgical fix al drift real:

```ts
// Inside CopilotPanel (or as small helper module if reuse emerges):
const recordMessage = useCallback((msg: CopilotMessage) => {
  setMessages(prev => [...prev, toDisplay(msg)]);
  memoryRef.current.addMessage(msg);
}, []);

// 2 callsites that previously did setMessages + memoryRef.addMessage paired:
recordMessage({ role: 'user', content: text, timestamp: Date.now() });
recordMessage({ role: 'assistant', content, timestamp: Date.now(),
                toolsCalled: agenticHook.toolCalls.map(tc => tc.name) });
```

- **Pros:**
  - **Captura el drift REAL** (dual maintenance cross-call sync risk) sin scope creep.
  - **Surgical:** 1 helper de ~5 líneas, 2 callsites updated. Reduce ~5-8 líneas net (each pair colapsa).
  - **No scope creep** — agenticHook/handleProviderSend/abortController/costManagerRef quedan como están.
  - **Aligned con D3/MeasurementInput precedent** (YAGNI for 1 consumer abstraction).
  - **Aligned con meta-anchor calibration** (~0.5x estimate, no over-engineering).
  - Future-proof: si emerge segundo consumer del coordination logic, full hook extraction se puede hacer entonces con evidence real.
- **Cons:** menos "elegante" que un hook completo; si segundo consumer emerge en el futuro, la extraction futura no se ahorra (pero el helper sirve as starting point).
- **Migration:** 1 helper (`useCallback`) + 2 callsite updates = ~5-8 líneas net.

#### Recomendación 3.1

**Opción 3.1.D** con confianza alta. Razones:

1. **Captura drift REAL** (2 dual-paired sites surgical risk).
2. **YAGNI compliance** for N=1 consumer (D3/MeasurementInput precedent).
3. **No scope creep** vs full hook (3.1.A descartado).
4. **Net cleanup** (~5-8 líneas reducidas, no displaced).
5. **Aligned con meta-anchor pattern** "calibrar 0.5x del nominal" — small surgical fixes preferred over architectural rewrites.

**Tradeoff aceptado:** menos modularity formal que useCopilotChat hook, pero adequate para current scale (1 consumer). Si emerge segundo consumer del coordination logic, reabrir 3.1 con evidence real (Pattern 1 real refactor justified entonces).

---

### 3.2 Dual representation documentation

**Pregunta:** ¿cómo documentar `messages` UI + `memoryRef` persistent dual representation?

#### Opción 3.2.A — JSDoc + CLAUDE.md section (RECOMENDADA)

Combina:

1. **JSDoc en `messages` useState** explicit (líneas 79):

   ```tsx
   /**
    * UI display messages (DisplayMessage[]). Transient — cleared on
    * unmount and project switch. For persistent LLM context, use
    * `memoryRef.current` (ProjectMemory class). Dual maintenance via
    * `recordMessage` helper.
    *
    * Cross-ref: D4 ratification doc, CLAUDE.md "CopilotPanel composition".
    */
   const [messages, setMessages] = useState<DisplayMessage[]>([]);
   ```

2. **JSDoc en `memoryRef`** (líneas 94, 152):

   ```tsx
   /**
    * Persistent LLM context via ProjectMemory class (localStorage,
    * MAX_MESSAGES=50 rolling window). Auto-loaded on construct.
    * Dual-maintained con `messages` useState via `recordMessage` helper.
    */
   const memoryRef = useRef(new ProjectMemory(project.id));
   ```

3. **Sección CLAUDE.md "CopilotPanel composition (D4 ratified)"** con diagrama 11 useState classification + dual representation explanation + recordMessage helper usage + reopen triggers.

##### Pros (3.2.A)

- Discoverability multi-nivel: JSDoc inline + CLAUDE.md como índice.
- Dual representation pattern documentado explícitamente (similar a D1-real Pattern 2 ratify).
- `recordMessage` helper visible en sites donde se usa (JSDoc cross-ref).

##### Cons

- Triple-write si decision cambia (JSDoc × 2 + CLAUDE.md). Mitigado: dual representation es estable post-ratification.

#### Opción 3.2.B — Solo CLAUDE.md, sin JSDoc

- **Pros:** un solo lugar para mantener.
- **Cons:** un dev editando CopilotPanel.tsx no ve la convention sin abrir CLAUDE.md. Discoverability initial inadecuada.
- **Descartar.**

#### Recomendación 3.2

**Opción 3.2.A** standard.

---

### 3.3 UI re-hydration policy on mount

**Pregunta:** cuando CopilotPanel re-mounts (e.g., panel close + reopen), `messages` useState starts empty `[]` mientras `memoryRef.current.messages` tiene history persisted. ¿Document esto como design choice, refactor para re-hydratar, o defer to product?

#### Opción 3.3.A — Document as intentional design choice

Asumir current behavior (UI fresh on mount) es by design — preserves visual freshness, avoids clutter.

- **Pros:** no UX change, consistent con line 154 comment intent.
- **Cons (primary):** **el comment de línea 154 aplica a project switch, NO a panel close.** No hay evidence en codebase que el behavior para panel close fue decided intentionally. Documentar como "by design" sin product confirmation **ratifica un design choice que no fue decidido.**
- **Cons (secondary):** D4 doc se vuelve product decision document, lo cual está fuera de scope técnico.
- **Aceptable pero presumes intent uncertain.**

#### Opción 3.3.B — Re-hydrate `messages` from `memoryRef.current.messages` on mount

```tsx
useEffect(() => {
  const loaded = memoryRef.current.messages.map(toDisplay);
  setMessages(loaded);
}, []);
```

- **Pros:** UI shows persisted history, consistent con LLM context.
- **Cons (primary):** **UX change** — current users see fresh UI on panel reopen. Cambiar a "history persists in UI" es product decision.
- **Cons (secondary):** D4 (technical eje) NO debería decidir UX changes unilateralmente.
- **Aceptable como propuesta pero requiere product approval.**

#### Opción 3.3.C — Defer to product (RECOMENDADA)

D4 NO ratifica un design choice que no fue decided. Document **current behavior** sin claim que es intentional. Open follow-up issue para product review.

Action items:
1. Document current behavior en CLAUDE.md con caveat: "**Status:** current behavior (UI fresh on mount) is **not documented as intentional** for panel-close case. Comment at `CopilotPanel.tsx:154` applies to project switch only. UX decision pending — see issue #XXX."
2. Open follow-up issue: `[product/audit-followup] CopilotPanel: should re-mount show LLM context history?`. Severity:medium o low según product call. Body describes current state + ProjectMemory persistence + UX options (A/B above) + invitation a product review.
3. D4 doc reopen trigger nombrado: "Cuando product decida re-hydration policy, reabrir 3.3 con decisión + JSDoc/code change correspondiente."

##### Pros (3.3.C)

- **Honest scope:** D4 es technical eje, no product. UX questions defer apropiadamente.
- **No premature ratification** of un design choice unverified.
- **Reopen trigger nombrado** — futuro product decision queda anchored.
- **Documentation accurate:** describe current behavior + uncertainty + path to resolution.

##### Cons

- Adds 1 follow-up issue (vs 0 con 3.3.A).

#### Recomendación 3.3

**Opción 3.3.C** con confianza alta. Razones:

1. **Scope honesty:** D4 es technical eje. UX/product questions go to product.
2. **Sweep evidence:** comment línea 154 NO cubre panel-close case; ratificar como "by design" sería claim sin evidence.
3. **Aligned con audit philosophy:** "describir lo que es, no asumir lo que debería ser." Document current state + open path to clarify.

---

### Tabla resumen Sec 3

| Sub-decisión | Recomendación | Migration cost |
|---|---|---|
| 3.1 Extraction scope | **3.1.D** — `recordMessage` minimal helper | ~5-8 líneas net (helper + 2 callsite updates) |
| 3.2 Dual representation docs | **3.2.A** — JSDoc + CLAUDE.md | ~10 líneas JSDoc + ~50 líneas CLAUDE.md |
| 3.3 UI re-hydration policy | **3.3.C** — Defer to product | ~10 líneas CLAUDE.md (caveat) + 1 follow-up issue |

**Total migration:** ~5-8 líneas code + ~70 líneas docs + 1 follow-up issue. Zero behavior change runtime.

---

## Sección 4 — Recomendación consolidada

Si Sam aprueba 3.1.D + 3.2.A + 3.3.C, los cambios resultantes son:

| # | Cambio | Archivo | Tipo |
|---|---|---|---|
| 1 | `recordMessage` helper (`useCallback`) + 2 callsite updates | `src/components/CopilotPanel/CopilotPanel.tsx` | code (~5-8 líneas net) |
| 2 | JSDoc en `messages` useState + `memoryRef` useRef | `CopilotPanel.tsx:79, 94` | docs (~10 líneas) |
| 3 | Section CLAUDE.md "CopilotPanel composition (D4 ratified)" | `CLAUDE.md` | docs (~50 líneas) |
| 4 | Follow-up issue: `[product/audit-followup] CopilotPanel UI re-hydration` | GitHub issue | issue (severity:medium o low según product) |

---

## Sección 5 — Plan de migración Fase 3

### 5.1 Commit 1 — `recordMessage` helper + callsite migration

Atomic commit en `CopilotPanel.tsx`:

- Add `toDisplay(msg)` helper para convert `CopilotMessage` → `DisplayMessage`.
- Add `recordMessage(msg)` `useCallback` que dispatcha both `setMessages` + `memoryRef.addMessage`.
- Update 2 callsites:
  - Line 173-174 → `recordMessage({ role: 'user', content: text, timestamp: Date.now() })`.
  - Line 193 + 200-205 → `recordMessage({ role: 'assistant', content, timestamp: Date.now(), toolsCalled: agenticHook.toolCalls.map(tc => tc.name) })`.

Verify: type check + tests pass + manual smoke (send a message, verify UI updates AND ProjectMemory has it).

Net delta: ~-5 líneas (helper + 2 collapsed call sites).

### 5.2 Commit 2 — JSDoc en `messages` + `memoryRef`

Atomic commit. JSDoc explicit en `messages` useState + `memoryRef` useRef per Sec 3.2.A. ~10 líneas docs.

### 5.3 Commit 3 — CLAUDE.md anchoring

Section "CopilotPanel composition (D4 ratified)" agregada a CLAUDE.md. ~50 líneas.

Contenido:
- 11 useState classification (5 buckets).
- Dual representation `messages` + `memoryRef` con bridge via `recordMessage` helper.
- Sub-component extraction inventory (already done, ratified).
- Hooks ratificados (useCopilotKeyboardShortcuts + useCopilotUI separate concerns).
- UI re-hydration current behavior + caveat (defer to product).
- Reopen triggers (5 nombrados en Sec 7).

### 5.4 Follow-up issue — UI re-hydration product question

Title: `[product/audit-followup] CopilotPanel: should re-mount show LLM context history?`

Body:
- Current behavior: `messages` useState empty on mount; `memoryRef.current` (ProjectMemory) loads persisted history but UI doesn't re-hydrate.
- Question: should panel close + reopen restore visible message history?
- Options: (A) keep current (UI fresh, LLM context preserved separately), (B) re-hydrate UI from memory (UI shows persisted history).
- Decision: pending product review.
- D4 reopen trigger: when product decides, reabrir 3.3.

Severity:medium (UX-affecting, not blocking) o low según product call.

---

## Sección 6 — Cross-refs y dependencias

### 6.1 Inputs

- `docs/reports/2026-04-28-drift-inventory-fase1.md` § D4.
- D6 ratification (PR #668 merged) — precedent shape Pattern 2.5 hybrid (declared deprecation + unused bridge cleanup).
- D1-real ratification (PR #667 merged) — precedent shape "dual representation con bridge" (pero bridge concentrated module, vs D4 inline helper).
- D3 ratification (PR #669 merged) — precedent del shape YAGNI for 1 consumer (`MeasurementInput` status quo).
- Meta-anchor "Inventory drift overestimation pattern" + "Pattern 2.5 hybrid" sub-rule (CLAUDE.md).
- `src/components/CopilotPanel/CopilotPanel.tsx` (368 líneas, 11 useState).
- `src/copilot/memory/ProjectMemory.ts` (persistence layer).

### 6.2 Outputs

- **Si aprobado:** Fase 3 (3 commits + 1 follow-up issue).
- **D4 cerrado:** Pattern 2.5 hybrid lite ratificación.
- **Décima tercera ratify-by-convention del audit con Pattern 2.5 sub-variant** (C7, B12, B5, D1-cosmetic, B6 partial, B10-Par2, B2, D7, D5, D1-real, D6, D3 → D4). Pattern 2.5 hybrid ahora con 2 ejemplos (D6 + D4).

### 6.3 No-conflicts (out-of-scope verificado)

- **Sub-components** sin cambio.
- **Existing hooks** (`useCopilotKeyboardShortcuts`, `useCopilotUI`) sin cambio.
- **`ProjectMemory` class** sin cambio.
- **Settings hydration logic** sin cambio.
- **Sub-component extraction** ya done; D4 no extends.

---

## Sección 7 — Reopen triggers

D4 ratificación queda revisable si emerge:

1. **Segundo consumer del coordination logic.** E.g., un nuevo panel CopilotMobilePanel.tsx que necesita la misma `messages + memoryRef + agenticHook + handleProviderSend` coordination. Reabrir 3.1 evaluando full `useCopilotChat` hook extraction with N=2 evidence.
2. **`recordMessage` helper crece** a >10 líneas (e.g., adding rate limiting, retry logic, message deduplication). Reabrir 3.1 evaluando si full hook extraction ahora justifies.
3. **Product decision sobre UI re-hydration** (issue #XXX resolved). Reabrir 3.3 con decision + code change (JSDoc + posible re-hydration code).
4. **Third dual-paired site emerges** (e.g., system message persistence + UI display). Verifies pattern más robusto vs surgical 2-site fix; reabrir 3.1 evaluando hook extraction.
5. **`messages` useState diverges semantically from `memoryRef` data** (e.g., UI displays graphics/charts not in CopilotMessage shape, or memory stores decisions not as messages). Reabrir 3.2 evaluando whether dual representation needs new bridge module pattern (similar a `dartEntity.ts`).

---

## Sección 8 — Deuda técnica explícita post-ratificación

1. **`recordMessage` is inline helper, not module export.** If second consumer emerges, must extract to shared module. Aceptable porque (i) 1 consumer; (ii) reopen trigger nombrado.

2. **`memoryRef.current.save()` call pattern manual.** `recordMessage` helper podría auto-save (currently `save()` called explicitly post `addMessage`). **Decision:** keep manual `.save()` para preserve existing batch behavior (save once after assistant message + cost tracking, not after each user message). Mention para clarity; no scope D4.

3. **UI re-hydration policy unresolved** — follow-up issue tracks. D4 doc explicit caveat.

4. **Existing hooks** (`useCopilotKeyboardShortcuts`, `useCopilotUI`) podrían beneficiarse de cross-ref desde CopilotPanel.tsx JSDoc para discoverability. Out-of-scope D4.

5. **Sub-component coupling via props vs Redux:** CopilotPanel passes messages/isLoading/etc. as props to sub-components. Si emergen multiple consumers de copilot state cross-component, considerar Redux migration. Out-of-scope D4 (1 consumer suffices).

---

## Sección 9 — Decisión pendiente y siguiente paso

### 9.1 Pregunta a Sam

¿Aprobás las 3 sub-decisiones tal como recomendado en Sec 3 (3.1.D + 3.2.A + 3.3.C)?

Si **sí, todo aprobado:**
- Marco PR ready-for-review.
- Sec 4-9 quedan como ratificación final.
- Fase 3 (3 commits + 1 follow-up issue) sobre este branch.
- Inventory annotation post-merge.
- Pattern 2.5 hybrid sub-rule update post-merge (commit aparte) — variant "lite" ahora con 2 ejemplos (D6 cleanup, D4 lite).

Si **alguna sub-decisión querés cambiar:**
- Indicame cuál (3.1, 3.2, 3.3) y qué opción preferís.
- En particular, si preferís 3.1.A full hook extraction (sobre mi pushback), articulalo y re-edito Sec 4 con reasoning explícito.

Si **el scope del eje cambia:**
- STOP. Reabro Sec 1.

### 9.2 Estado del PR

- Sec 1-9 ✅ ready (con 2 refinamientos de Sam incorporated: 3.1.D minimal helper + 3.3.C defer to product).
- PR draft pending creation.
- Pendiente Fase 3 commits.

### 9.3 Calibración estimate vs actual

- Estimate (post-refinamiento de Sam): ~4-5h Fase 2 doc + ~2-3h Fase 3.
- Actual Fase 2: ~3h (factor ~0.6-0.75x).
- **Causa:** scope minimal helper redujo doc significantly vs full hook extraction (3.1.A draft hubiera sido +150 líneas). Refinamiento de Sam validó scope correcto.
- **Total esperado Fase 3:** ~2h (3 commits atómicos + 1 issue).

---

**FIN DEL DOC.** Esperando verde de Sam para promover PR a ready-for-review + arrancar Fase 3.
