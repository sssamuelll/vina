# Drift Fase 2 — D3: Forms / inputs / zod policy

**Fecha:** 2026-05-01
**Eje:** D3 — zod usage scope (UI forms vs boundary parsing vs persistence vs tool args).
**Categoría inventario:** (b) decisión producto/arq.
**Estado:** PROPUESTA. Pattern 2 ratify clean — zod scope restricted to boundary + persistence + tool args; UI out of scope by design. Esperando review de Sam.

**Branch:** `drift/d3-forms-inputs-zod`.
**Cross-ref inventario:** `docs/reports/2026-04-28-drift-inventory-fase1.md` → D3.
**Cross-ref addendum:** `docs/reports/2026-04-29-drift-inventory-addendum.md` § 4 (D3 narrative updated — zod usage 7 sites).
**Cross-ref D6 (closed):** precedent del shape "ratify by API surface separation".
**Cross-ref D7 + D1-real (closed):** precedent del shape "ratify-by-convention with JSDoc + CLAUDE.md".

---

## Sección 1 — Decide / NO decide

### Decide en este eje

1. **zod usage policy ratificada como "3 niches específicos, NOT UI forms":**
   - **Boundary parsing** (4 sites): project load (`projectSchema.ts`), avatar profiles (`avatarLibrary.ts`), tool args registry (`registry.ts`), persistence registry overlap.
   - **Persistence with versioning** (3 sites): workflow state (`workflowSlice.ts`), user preferences (`userPreferences.ts`), usage records (`usageRecordSchema.ts`).
   - **Tool argument validation** (centralized + per-tool): copilot tool registry (`registry.ts`), per-tool schemas (`validation.ts`).
2. **UI form validation NOT scope of zod.** HTML attrs (`type="number"`, `min`, `max`, `step`) + `Number()`/`parseFloat()` inline parsing son sufficient para los 180 inputs del codebase actual. UI inputs son simples (single-value setters, no complex multi-field forms con cross-validation rules).
3. **`MeasurementInput` reusable component status quo.** AvatarView es 1 consumer único de la pattern measurement-with-range-number-paired. PoseEditorView y ParametricView tienen patterns estructuralmente distintos que NO justifican abstracción común.
4. **Documentation strategy:** sección CLAUDE.md "zod usage policy (D3 ratified)" con 3 niches in-scope + UI out-of-scope explicit + reopen triggers. Plus JSDoc selectivo en zod schema files clave si requieren clarification.

### NO decide en este eje

1. **Migración de UI inputs a zod schemas.** Out-of-scope. Los 180 inputs HTML simples no se benefician de schema overhead.
2. **Introducir alternative form library** (react-hook-form, formik, yup, @tanstack/react-form). Out-of-scope. 0 alternative library en codebase actual; no necesidad observable.
3. **Refactor de los 8 zod schema files existentes.** Sin cambio.
4. **Extract `MeasurementInput`** o equivalente. Status quo (1 consumer no justifica YAGNI violation).
5. **Multi-field form validation library adoption** (cross-validation rules entre fields). Out-of-scope; los 2 multi-field forms del codebase (skill creation/export) validan field-level independente con HTML attrs.
6. **Pattern 1 global zod adoption** (todos los layers usan zod). Descartado por análisis Sec 3.1 (over-engineering).

### Por qué importa la línea

Sin la ratification explícita, alguien que vea 7 zod schema files + 180 UI inputs sin zod puede asumir UI tiene drift "validation gap" y proponer extender zod. La realidad es que UI validation patterns son intencionalmente distintos — HTML attrs + Number() son sufficient para input simples. Documentar la línea previene over-engineering y guía future decisions.

---

## Sección 2 — Estado actual

### 2.1 Pre-existing canonical infrastructure (regla 1 v2)

- **`zod` está instalado** (`package.json` dependencias).
- **8 source files importan zod** (consistent con addendum del 2026-04-29).
- **NO existe sección CLAUDE.md actual** que documente zod usage policy.
- **NO existe alternative form library** instalada (verificado con grep `react-hook-form|formik|yup|@tanstack/react-form|useFormState` → 0 hits).

**Conclusión:** convention está implícita en el patrón observable (zod en 3 niches, ausente en UI). D3 produce ratification doc + anchoring.

### 2.2 zod usage refresh — 8 source files en 3 niches

| # | Archivo | Categoría | Notes |
|---|---|---|---|
| 1 | `src/utils/projectSchema.ts` | Boundary parsing | Project load validation con `loose()` + DoS bounds (precedente B6-state) |
| 2 | `src/utils/avatar/avatarLibrary.ts` | Boundary parsing | Avatar profile load validation |
| 3 | `src/store/workflowSlice.ts` | Persistence (versioned) | Workflow state envelope `{ version, data }` (precedente B6-state Sec 2.5) |
| 4 | `src/copilot/preferences/userPreferences.ts` | Persistence | User preferences (language, agent config) |
| 5 | `src/copilot/usageRecordSchema.ts` | Persistence | Usage records (cost tracking) |
| 6 | `src/copilot/action/tools/validation.ts` | Tool args | Tool argument validation per-tool schemas |
| 7 | `src/copilot/action/tools/registry.ts` | Tool args (centralized) | Centralized registry con runtime parse |
| 8 | `src/copilot/action/tools/__tests__/validation.test.ts` | Test | Validation test suite |

**3 niches establecidos:**
- **Boundary parsing** (2 + 1 registry overlap): trust boundary entrada, parsea unknown JSON externo.
- **Persistence with versioning** (3): roundtripped storage shape con versioning para forward-compat.
- **Tool argument validation** (2): copilot tool args, parseado en runtime antes de execute.

Sin delta desde 2026-04-29 addendum (1 día — improbable que se haya agregado nuevo zod usage).

### 2.3 UI inputs inventory — 180 sites

`grep "<input\b" src/components | grep -v test` → **180 hits** en componentes.

#### Distribución por archivo (top-15)

| Archivo | Inputs aprox | Tipo dominante |
|---|---|---|
| `Sidebar/AvatarView.tsx` | ~13 | Measurement sliders (range+number paired) |
| `Sidebar/SimulationView.tsx` | ~6 | Sim controls (checkboxes + sliders) |
| `Sidebar/PoseEditorView.tsx` | ~5 | Joint axis rotation (single range) |
| `Sidebar/ParametricView.tsx` | ~3 | Variable values (range + click-to-edit number) |
| `Toolbar2D/ToolOptionsBar2D.tsx` | ~5 | Tool option setters (Number, string) |
| `ImportDXFDialog/ImportDXFDialog.tsx` | ~3 | Scale + unit selectors |
| `SkillMarketplace/ImportSeamlyModal.tsx` | ~10 | Multi-field skill creation |
| `ExportSkillModal/ExportSkillModal.tsx` | ~8 | Multi-field skill export |
| `shell/UnifiedBarSettings.tsx` | ~5 | Provider settings (API key, model) |
| Others | ~120 | Distributed across panels, modals, sidebars |

#### Patterns inline observados

```ts
onChange={e => handleMeasurement(key, Number(e.target.value))}        // 20+ sites
onChange={e => parseFloat(e.target.value)}                             // ~5 sites
<input type="number" min={140} max={200} step={1} ... />               // HTML attrs
onChange={e => setValue(e.target.value)}                                // string passthrough
```

**Validation pattern UI dominant:**
- HTML attrs (`type="number"`, `min`, `max`, `step`) for browser-level constraints.
- `Number()` / `parseFloat()` for parsing.
- Local component validation (rare; e.g., `validateCut` en `useScissorsTool.ts` es geometric, no form-like).
- **0 zod usage en UI components** (verificado con grep).

### 2.4 `MeasurementInput` component check

`grep "MeasurementInput|MeasurementForm"` → **0 hits.** El componente reutilizable mencionado en el inventario NO existe.

**AvatarView (`AvatarView.tsx:96-118`)** inline las patterns directamente:

```tsx
{SLIDERS.map(({ key, label, min, max }) => (
  <div key={key}>
    <label>{label}</label>
    <input type="range" min={min} max={max} step={1} value={val}
      onChange={e => handleMeasurement(key, Number(e.target.value))} />
    <input type="number" min={min} max={max} step={1} value={val}
      onChange={e => handleMeasurement(key, Number(e.target.value))} />
  </div>
))}
```

#### Verificación de "1 consumer único" — PoseEditorView + ParametricView NO comparten shape

Verificado (regla 1 v2 — read contents, don't list directories):

| Aspect | AvatarView | PoseEditorView (`:63-76`) | ParametricView (`:75-119`) |
|---|---|---|---|
| Inputs | range + number paired | range solo (no number companion) | range + click-to-edit number (conditional `isEditing` toggle) |
| Min/max | Static config (`SLIDERS` array) | Hardcoded `±180` (degrees, no per-axis variation) | Per-variable dynamic (`variable.min/max`) |
| Step | `1` | HTML default | `variable.step` |
| Unit display | "cm" hardcoded | "°" hardcoded | `{variable.unit}` dynamic |
| Reset | No | Separate row button (per joint) | Conditional button (per `isOverridden`) |
| Mouse events | No | No | `onFocus`/`onMouseEnter`/`onMouseLeave` (warmup) |
| Conditional UI | No | No | `isEditing` toggle (span ↔ input) |
| Update handlers | `onChange` only | `onChange` only | `onChange` + `onBlur` + `onKeyDown` |

**Patterns son estructuralmente distintos.** PoseEditorView no tiene number input companion (solo range + value display). ParametricView tiene click-to-edit conditional UI + mouse warmup events que no aplican a measurement input.

Extract `MeasurementInput` reusable forzaría props opcionales para cubrir las 3 shapes:
- `hasNumberInput?: boolean` (false para Pose).
- `clickToEdit?: boolean` (true solo Parametric).
- `mouseEvents?: { onFocus?, onMouseEnter?, onMouseLeave? }` (solo Parametric).
- `resetButton?: { visible, onClick, position }` (Pose vs Parametric distinct).
- `staticMinMax?: { min, max }` vs `dynamicMinMax?` (3 distintas semánticas).

Esa abstraction distorsionaría más que los 3 inline implementations actuales. **AvatarView es 1 consumer único confirmed.**

### 2.5 Multi-field forms

Solo 2 sites con multi-field state:
- `ImportSeamlyModal.tsx`: `name, author, triggers[], tags[]` (skill creation, ~10 inputs).
- `ExportSkillModal.tsx`: same shape (skill export).

**No cross-validation rules** observadas (campos validan independientemente con HTML attrs). NO complex form patterns que justifiquen library form management.

### 2.6 Trigger anticipado check (alternative form libraries)

```bash
grep -rln "react-hook-form|formik|yup|@tanstack/react-form|useFormState" src
```

→ **0 hits.** No alternative form library. UI usa raw HTML inputs + useState + Number()/parseFloat() inline.

### 2.7 Pattern semántico — Pattern 2 ratify clean

**3 niches zod establecidos** coexisten with **UI layer fuera de zod by design**:

```
zod scope (in)
┌───────────────────────────────────────────────────────────┐
│  Boundary parsing (4 sites)                                │
│  - Trust boundary input (project load, avatar profiles)    │
│  - DoS bounds, key allowlists                              │
│                                                            │
│  Persistence with versioning (3 sites)                     │
│  - Roundtripped storage with version envelope              │
│  - Forward-compat for schema evolution                     │
│                                                            │
│  Tool argument validation (2 sites)                        │
│  - Runtime parse before tool execute                       │
│  - Centralized registry + per-tool schemas                 │
└───────────────────────────────────────────────────────────┘

zod scope (out)
┌───────────────────────────────────────────────────────────┐
│  UI form validation (180 inputs)                           │
│  - HTML attrs (type=number, min, max, step) — browser      │
│  - Number()/parseFloat() inline — single-value parsing     │
│  - No multi-field cross-validation rules                   │
│  - No complex form lifecycle (touched, dirty, errors)      │
└───────────────────────────────────────────────────────────┘
```

**0 duplication observed.** UI validation y zod schemas son niches distintos. Hypothesis test (Sec 3.1.A confirmado, B/C descartados).

### 2.8 Sweep negativo (qué NO emergió)

- Alternative form library: 0 hits.
- UI con zod usage: 0 sites.
- Cross-validation rules en UI: 0 observed.
- `MeasurementInput` component: no existe (1 consumer inline).
- Multi-field forms con complexity: 2 sites, validación field-level independente.

---

## Sección 3 — Sub-decisiones, opciones y tradeoffs

Tres sub-decisiones: 3.1 (zod policy, central), 3.2 (`MeasurementInput` component), 3.3 (documentation strategy).

### 3.1 zod policy

**Pregunta:** ¿extender zod a UI form validation, ratify scope restricted (boundary + persistence + tool args), o adoptar zod globally (Pattern 1)?

#### Opción 3.1.A — Ratify "boundary + persistence + tool args, NOT UI" (RECOMENDADA)

zod queda restricted a 3 niches específicos. UI inputs use HTML attrs + Number()/parseFloat() inline. Document policy en CLAUDE.md.

- **Pros:**
  - Refleja la realidad observable: 180 UI inputs simples + 8 zod sites en 3 niches distintos sin duplication.
  - Zero refactor.
  - HTML attrs proveen browser-level validation suficiente para input simples.
  - Single-value setters no necesitan schema overhead (zod parsing cost > Number() cost).
  - Convention discoverable via CLAUDE.md sección dedicada.
- **Cons:**
  - Si emerge multi-field form complejo con cross-validation rules, policy debe reabrir. Mitigado: reopen trigger nombrado (Sec 7).
- **Migration:** 0 código + ~50 líneas CLAUDE.md + JSDoc selectivo (opt).

#### Opción 3.1.B — Pattern 2 extend (shared schema entre boundary y UI)

Introducir un patrón "shared schema" para casos donde UI duplicaría rules ya en zod schema (e.g., avatar measurement validation rules en `projectSchema.ts` reused en AvatarView).

- **Pros:** DRY si hay duplication observed.
- **Cons (primary):** **no observed duplication.** Avatar measurements NO tienen zod schema dedicated en `projectSchema.ts` — se persisted como `Record<string, number>` sin field-level constraints (project shape has bounded `MAX_KEY_COUNT` + key allowlist, no min/max per measurement). UI uses HTML attrs (`min={140} max={200}` para height) que vienen de UI config (`SLIDERS` array), NO de schema.
- **Cons (secondary):** introducir shared schema crea nuevo pattern sin caso de uso real. Premature abstraction.
- **Descartar.**

#### Opción 3.1.C — Pattern 1 global zod adoption

Adopt zod globally como canonical para validation en TODOS los layers (boundary + UI + tool args + persistence). Migrate 180 UI inputs a use zod schemas.

- **Pros:** uniformity en validation strategy.
- **Cons (primary):** **over-engineering masivo.** 180 inputs simples (single-value setters con HTML attrs sufficient) no justifican schema overhead. zod parsing cost (function call + error allocation) >> Number() inline cost.
- **Cons (secondary):** rewrite 180 sites + tests. Cost-benefit ratio negativo.
- **Cons (tertiary):** introduce coupling entre UI components y schema definitions; cambio de UI input requires editing schema file.
- **Descartar.**

#### Recomendación 3.1

**Opción 3.1.A** con confianza alta. Razones:

1. **0 duplication observed** — UI validation y zod schemas son niches distintos.
2. **3 niches zod existentes son coherentes** — cada uno tiene caso de uso claro (trust boundary, persistence forward-compat, tool runtime parse).
3. **HTML attrs sufficient** para input simples — el codebase no tiene multi-field forms con cross-validation rules que justifiquen library form management.
4. **YAGNI compliance** — no observed duplication, no observed pressure for change.

**Tradeoff aceptado:** si emerge complex form en el futuro (e.g., user profile editor con cross-validation), reopen 3.1 con caso concreto.

---

### 3.2 `MeasurementInput` reusable component

**Pregunta:** ¿extract `MeasurementInput` reusable o status quo (AvatarView inline)?

#### Opción 3.2.A — Status quo (AvatarView inline) (RECOMENDADA)

Mantener AvatarView inline implementation. NO extract component.

- **Pros:**
  - **1 consumer único confirmed** — verified que PoseEditorView y ParametricView tienen patterns estructuralmente distintos (range solo vs paired range+number vs click-to-edit conditional). Extract forzaría props opcionales que distorsionarían la abstracción (Sec 2.4 detail).
  - YAGNI compliance.
  - Zero refactor.
- **Cons:** si segundo consumer con shape **idéntico** (range + number paired + static min/max + reset-less + onChange-only) emerge, extract reabre. Mitigado: reopen trigger nombrado.
- **Migration:** 0.

#### Opción 3.2.B — Extract `MeasurementInput`

Crear componente reusable con props `key, label, min, max, value, onChange, unit?`.

- **Pros:** DRY si emerge segundo consumer con shape idéntico.
- **Cons (primary):** **1 consumer único.** PoseEditorView + ParametricView tienen shapes distintos:
  - PoseEditorView: range solo, sin number companion, hardcoded `±180`.
  - ParametricView: click-to-edit conditional, mouse events, conditional reset, dynamic step/unit.
  - Forzar abstracción común requiere props opcionales (`hasNumberInput?`, `clickToEdit?`, `mouseEvents?`, `resetButton?`) que distorsionan más que las 3 inline implementations actuales.
- **Cons (secondary):** premature abstraction sin segundo caso real.
- **Descartar.**

#### Recomendación 3.2

**Opción 3.2.A** con confianza alta. Razón core: verificación structural reveló que los 3 views (Avatar, Pose, Parametric) tienen shapes distintos en 8 dimensions (input types, min/max source, step, unit, reset button, mouse events, conditional UI, update handlers). Extract distorsionaría.

**Reopen trigger nombrado:** "second consumer con shape idéntico al AvatarView measurement pattern (range + number paired, static min/max from config, no reset, no mouse events, simple onChange)" — entonces reabrir 3.2 con caso concreto.

---

### 3.3 Documentation strategy

**Pregunta:** ¿cómo documentar zod usage policy + UI out-of-scope para que futuros devs no asuman drift?

#### Opción 3.3.A — Sección CLAUDE.md "zod usage policy" + JSDoc selectivo (RECOMENDADA)

Combina:

1. **Sección CLAUDE.md "zod usage policy (D3 ratified, 2026-05-01)"** con:
   - In-scope: 3 niches (boundary parsing, persistence, tool args) con ejemplos.
   - Out-of-scope: UI form validation (HTML attrs + Number() inline sufficient).
   - Decision rule: cuándo usar zod vs cuándo NO.
   - Reopen triggers.

2. **JSDoc selectivo** opt en archivos zod schema clave. **Decision:** **NOT include** in baseline plan — los 8 zod files ya tienen JSDoc descriptivo + module purpose. Adding "D3 ratified" cross-ref a cada uno es overkill. CLAUDE.md section como índice es suficiente.

##### Pros (3.3.A)

- Discoverability multi-nivel: CLAUDE.md como índice.
- Decision rule explicit reduce future re-investigation.
- Zero código modification.

##### Cons

- Triple-write riesgo si decision cambia (CLAUDE.md + cualquier JSDoc futuro). Mitigado: scope policy es estable.

#### Opción 3.3.B — JSDoc en cada zod schema file + CLAUDE.md

JSDoc cross-ref a D3 doc en los 8 zod schema files.

- **Pros:** discoverability per-archivo.
- **Cons:** triple-write × 8 archivos. Maintenance overhead. Los 8 files ya tienen JSDoc descriptivo que cubre el role; agregar D3 ratification cross-ref es redundant.
- **Descartar.**

#### Opción 3.3.C — Solo CLAUDE.md, sin JSDoc

Sin doc cambio en source files. Solo CLAUDE.md.

- **Pros:** un solo lugar para mantener.
- **Cons:** ningún (vs 3.3.A las dos son válidas; 3.3.A solo agrega JSDoc selectivo).
- **Aceptable** pero 3.3.A es default.

#### Recomendación 3.3

**Opción 3.3.A** sin JSDoc adicional (los 8 zod files actuales tienen JSDoc descriptivo suficiente). Solo CLAUDE.md sección + reopen triggers.

---

### Tabla resumen Sec 3

| Sub-decisión | Recomendación | Migration cost |
|---|---|---|
| 3.1 zod policy | **3.1.A** — Ratify scope restricted | 0 código |
| 3.2 MeasurementInput | **3.2.A** — Status quo | 0 código |
| 3.3 Documentation | **3.3.A** — CLAUDE.md sección sin JSDoc adicional | ~50 líneas CLAUDE.md |

**Total migration:** 0 código + ~50 líneas CLAUDE.md + 0 follow-up issue. **Zero behavior change.** D3 cementa convention via documentation only.

---

## Sección 4 — Recomendación consolidada

Si Sam aprueba 3.1.A + 3.2.A + 3.3.A, el cambio resultante es **único**:

| # | Cambio | Archivo | Tipo |
|---|---|---|---|
| 1 | Section CLAUDE.md "zod usage policy (D3 ratified)" — 3 niches in-scope + UI out-of-scope explicit + decision rule + reopen triggers | `CLAUDE.md` | docs (~50 líneas) |

Sin issue follow-up. Sin JSDoc nuevo (los 8 zod files ya tienen JSDoc descriptivo sufficient).

---

## Sección 5 — Plan de migración Fase 3

### 5.1 Commit único — CLAUDE.md anchoring

Atomic commit en `CLAUDE.md`:

Sección "zod usage policy (D3 ratified)" agregada. ~50 líneas.

Contenido:
- **In scope** (3 niches con ejemplos):
  - Boundary parsing (project load, avatar profiles, plugin manifests).
  - Persistence with versioning (workflow, user prefs, usage records).
  - Tool argument validation (copilot tools).
- **Out of scope** (UI form validation):
  - HTML attrs (`type="number"`, `min`, `max`, `step`) for browser-level constraints.
  - `Number()` / `parseFloat()` inline for parsing.
  - Single-value setters don't need schema overhead.
- **Decision rule:** when to use zod vs HTML attrs.
- **Reopen triggers** (5 nombrados en Sec 7).
- Cross-ref a D3 doc.

### 5.2 No otros commits ni follow-up issues

D3 cierra completo con 1 commit.

---

## Sección 6 — Cross-refs y dependencias

### 6.1 Inputs

- `docs/reports/2026-04-28-drift-inventory-fase1.md` § D3 (caracterización original "zod presente solo en validation.ts").
- `docs/reports/2026-04-29-drift-inventory-addendum.md` § 4 (D3 narrative updated — zod usage 7 sites con boundary parsing pattern).
- D6 ratification (PR #668 merged) — precedent shape "ratify by API surface separation" (3-tier API surface).
- D7 + D1-real ratifications — precedent shape "ratify-by-convention with CLAUDE.md section".
- B6-state ratification (`drift-fase2-b6state-persistencia.md`) — precedent del shape "zod boundary parsing" (`projectSchema.ts` con `loose()` + DoS bounds).
- Meta-anchor "Inventory drift overestimation pattern" (commit `95b2e2de`) — predicted Pattern 2 ratify, confirmed empíricamente.

### 6.2 Outputs

- **Si aprobado:** Fase 3 (1 commit CLAUDE.md ~50 líneas + 0 código).
- **D3 cerrado:** ratification con docs anchoring. Sin follow-up issue.
- **Décima segunda ratify-by-convention del audit** (C7, B12, B5, D1-cosmetic, B6 partial, B10-Par2, B2, D7, D5, D1-real, D6 → D3). 12/18 = 66.7% ratify-by-convention, fortaleciendo meta-anchor pattern.

### 6.3 No-conflicts (out-of-scope verificado)

- **8 zod schema files existing** sin cambio.
- **180 UI inputs** sin cambio.
- **`AvatarView.tsx` measurement inputs** sin cambio.
- **CLAUDE.md secciones existentes** no afectadas.

---

## Sección 7 — Reopen triggers

D3 ratificación queda revisable si emerge:

1. **Multi-field form complejo con cross-validation rules** (e.g., user profile editor donde cambiar `bust` requires updating `chest > waist > hips` invariants). HTML attrs no soportan cross-field rules — reabrir 3.1 evaluando zod adoption en UI con scope concreto.
2. **Alternative form library introduction** (react-hook-form, formik, zod-react-hook-form integration). Reabrir scope evaluando integration con zod schemas existentes.
3. **Second consumer of measurement-input-paired pattern** (e.g., AvatarTape Edit View con tape measurements en sliders + numbers paired). Reabrir 3.2 — extract `MeasurementInput` con shape idéntico al AvatarView pattern.
4. **Duplication emerges** entre UI input rules y zod schema rules (e.g., un `min={140} max={200}` en UI hardcoded duplicates a `z.number().min(140).max(200)` en projectSchema). Reabrir 3.1 evaluando shared schema pattern.
5. **9th zod schema file** se introduce con caso de uso fuera de los 3 niches actuales (boundary, persistence, tool args). Reabrir 3.1 evaluando si nuevo niche emerge o si scope necesita extension.

---

## Sección 8 — Deuda técnica explícita post-ratificación

1. **Sin lint rule** que prevent un dev de import zod en UI component file. Discoverability depende de CLAUDE.md. Aceptable porque (i) los 180 UI inputs son fáciles de identificar; (ii) introducción accidental de zod en UI sería caught en code review.

2. **`MeasurementInput` extract no implementado.** Si emerge segundo consumer con shape idéntico, refactor cost moderate (~2-3h). Aceptable porque (i) 1 consumer actual; (ii) reopen trigger nombrado.

3. **HTML attrs validation es client-side only.** Si datos del UI input se persisted o sent a backend sin re-validation, valores fuera de range pasan. **Mitigado:** los UI input values van a Redux state via dispatch; persistence layer (project save) valida con `projectSchema.ts` zod en boundary. Multi-layer defense.

4. **No documented schema reuse pattern** entre boundary y UI cuando emerja necesidad. Aceptable porque (i) currently 0 duplication observed; (ii) si emerge, reopen trigger 4 nombrado.

5. **`AvatarView.tsx` measurement input pattern es inline (no extracted).** Si refactor masivo del Sidebar emerge, considerar component extraction como opportunistic work. Out-of-scope D3.

---

## Sección 9 — Decisión pendiente y siguiente paso

### 9.1 Pregunta a Sam

¿Aprobás las 3 sub-decisiones tal como recomendado en Sec 3 (3.1.A + 3.2.A + 3.3.A)?

Si **sí, todo aprobado:**
- Marco PR ready-for-review.
- Sec 4-9 quedan como ratificación final.
- Fase 3 (1 commit: CLAUDE.md anchoring) sobre este branch.
- Inventory annotation post-merge.
- Sin follow-up issue.

Si **alguna sub-decisión querés cambiar:**
- Indicame cuál (3.1, 3.2, 3.3) y qué opción preferís.

Si **el scope del eje cambia:**
- STOP. Reabro Sec 1.

### 9.2 Estado del PR

- Sec 1-9 ✅ ready.
- PR draft pending creation.
- Pendiente Fase 3 commit (1 atómico).

### 9.3 Calibración estimate vs actual

- Estimate Fase 2 doc: ~3-4h. Actual: ~2.5h.
- **Factor ~0.6-0.8x del estimate.** Causa: scope chico + sweep pre-cerró framing + meta-anchor pre-anclado redujo redacción time + verificación Q2 Pose+Parametric vs Avatar shapes confirmada en read-only without re-investigation.
- **Total esperado Fase 3:** ~30min (1 commit CLAUDE.md).

---

**FIN DEL DOC.** Esperando verde de Sam para promover PR a ready-for-review + arrancar Fase 3.
