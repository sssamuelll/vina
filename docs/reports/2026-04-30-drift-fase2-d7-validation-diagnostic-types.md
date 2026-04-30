# Drift Fase 2 — D7: `ValidationDiagnostic` vs `Diagnostic`

**Fecha:** 2026-04-30
**Eje:** D7 — `ValidationDiagnostic` (`src/utils/projectValidator.ts`) vs `Diagnostic` (`src/diagnostics/types.ts`).
**Categoría inventario:** (b) decisión producto/arq.
**Estado:** PROPUESTA. Ratify separados con JSDoc cross-ref + CLAUDE.md section. Cero refactor. Esperando review de Sam.

**Branch:** `drift/d7-validation-diagnostic-types`.
**Cross-ref inventario:** `docs/reports/2026-04-28-drift-inventory-fase1.md` → D7.
**Cross-ref clasificación:** `docs/reports/2026-04-28-drift-fase2-classification.md` → eje (b).
**Cross-ref D1-cosmetic (closed):** precedent del shape "tipos shape-similar pero roles distintos = ratify, no drift".

---

## Sección 1 — Decide / NO decide

### Decide en este eje

1. **Clasificación final:** `ValidationDiagnostic` y `Diagnostic` **NO son drift estructural**. Son types ortogonales para lifecycles distintos (boundary parsing vs runtime inspection).
2. **Cierre:** ratify separados con JSDoc cross-ref.
3. **Documentation:** sección CLAUDE.md "Diagnostic types" + JSDoc en cada type explicitando lifecycle + cross-ref al otro.
4. **No-adapter por default:** los 2 lifecycles no se cruzan en el codebase actual. Adapter pattern es YAGNI.

### NO decide en este eje

1. **Unificación de los 2 types** (discriminated union o base type común). Descartado por análisis Sec 3.1.
2. **Adapter helper para cross-type rendering.** Out-of-scope; reabrir si emerge use case real (Sec 7 trigger).
3. **`ValidationCode` enum export pattern.** Currently named export desde projectValidator.ts. Trivial — out-of-scope; ver Sec 8.
4. **`AgentAnalysis` / `AgentSuggestion` types** (vinculados a Diagnostic en agentAnalyzer). Son output del analysis post-diagnostic, no Diagnostic-like. Out-of-scope.
5. **Refactor de los emitters/consumers** de cada type. Lifecycle actual es correcto.
6. **Migration de severity sets** (3 vs 4 valores). Las diferencias son intencionales — `'critical'` aplica solo al inspector context.

### Por qué importa la línea

Sin la ratification explícita, alguien que haga sweep similar en 6 meses verá los 2 types con `severity` + `message` shared y re-investigará desde cero. Este doc evita ese costo: el patrón ya está investigado, los roles documentados, los reopen triggers nombrados.

---

## Sección 2 — Estado actual

### 2.1 Pre-existing canonical infrastructure (regla 1 v2)

- **No existe BaseDiagnostic ni unified type** en el codebase. Los 2 types son completamente independientes.
- **No hay adapter helper** ni callsite cross-type que sugiera necesidad de mapping.
- **D1-cosmetic precedent (closed):** ratificó el shape "shape-similar pero roles distintos = no drift, ratify". D7 sigue el mismo patrón.

**Conclusión:** convention está implícita en la separación actual. D7 produce ratification doc + anchoring (no canonical pre-existente para "diagnostic types policy").

### 2.2 Shapes verificados (refresh 2026-04-30)

#### `ValidationDiagnostic` (`src/utils/projectValidator.ts:32-39`)

```ts
export interface ValidationDiagnostic {
  severity: 'error' | 'warning' | 'info';   // 3 valores
  code: ValidationCode;                       // enum strict
  message: string;
  pieceId?: string;
  seamId?: string;
  field?: string;
}
```

`ValidationCode` (líneas 16-30): enum union de ~9 codes específicos del project loader (`'OUTLINE_NO_M' | 'PIECE_INVALID' | 'SEAM_PIECE_MISSING' | 'SEAMGROUP_ORPHANED' | 'FABRIC_ID_UNKNOWN' | 'POM_ORPHANED_PIECE' | 'ELASTIC_DANGLING_EDGE' | 'PLEAT_DANGLING_EDGE' | 'AUTO_SEAMS_DETECTED'`).

#### `Diagnostic` (`src/diagnostics/types.ts:101-108`)

```ts
export type DiagnosticSeverity = 'info' | 'warning' | 'critical' | 'error';  // 4 valores

export interface Diagnostic {
  severity: DiagnosticSeverity;
  category: string;        // free-form
  message: string;
  detail?: string;          // free-form
}
```

### 2.3 Diferencias estructurales (4 ejes)

| Eje | ValidationDiagnostic | Diagnostic |
|---|---|---|
| **Severity set** | 3 (`error / warning / info`) | 4 (incluye `critical`) |
| **Type field** | `code: ValidationCode` enum strict (~9 codes) | `category: string` free-form |
| **Anchors** | Específicos por entidad (`pieceId`, `seamId`, `field`) | Genérico `detail: string` free-form |
| **Lifecycle** | Boundary parsing (`loadProject`) | Runtime user inspection (right-click → Inspect) |

### 2.4 Consumers

#### ValidationDiagnostic (~9 emit sites + 1 store field)

- **Emisor único:** `src/utils/projectValidator.ts` — emit sites en líneas 109, 124, 141, 195, 221, 246, 276+ (cada site = 1 validation rule específica del loader).
- **Persisted state:** `src/store/projectSlice.ts:207, 235` → `loadDiagnostics: ValidationDiagnostic[]` field en `ProjectState`. Persiste con el project.

**Lifecycle:** emitido durante `loadProject` action → entries inválidos quarantined → diagnostics queda en project state como histórico de issues post-load. UI (e.g., load report panel) puede mostrar lista al usuario.

#### Diagnostic (~5 callsites + 1 store field)

- **Emisor único:** `src/diagnostics/ruleEngine.ts:24, 239, 283, 405-406` — `evaluateRules(data: InspectionData): Diagnostic[]` ejecuta 13 deterministic rules.
- **Consumidor (suggestions):** `src/diagnostics/agentAnalyzer.ts:5, 71` — `generateSuggestions(data, diagnostics)` produce `AgentSuggestion[]` basadas en diagnostics.
- **Transient state:** `src/store/inspectorSlice.ts:34, 87` → `diagnostics: Diagnostic[]` field. Solo current inspection (cleared al cambiar target).

**Lifecycle:** emitido durante user-triggered inspector run (right-click piece → "Inspect") → ruleEngine evaluates → diagnostics fed to agentAnalyzer → render en InspectorTab.

### 2.5 Pattern semántico observado

Los 2 types son **ortogonales con overlap superficial**:

- **Lifecycle ortogonal:** load-time boundary validation vs runtime user inspection. Two different concerns.
- **Anchor model ortogonal:** ValidationDiagnostic fixed entity anchors (loadProject sabe qué entity inválida); Diagnostic generic detail string (inspector context puede ser piece/seam/global).
- **Type field ortogonal:** strict enum codes para machine-readable error matching post-load vs free-form category para human-readable inspector grouping.
- **Severity overlap parcial:** 3/4 valores compartidos. ValidationDiagnostic NO usa `critical` porque load-time issues son recoverable (quarantine).

**Conclusión estructural:** los 2 types son **intencionalmente distintos** para problemas distintos. NO es drift.

### 2.6 Sweep negativo (qué NO emergió)

- **Tercer Diagnostic-like type:** verificado, no existe.
- **Cross-type callsites:** no hay consumer que mezcle los 2 types.
- **Shared utilities** que requieran tipo común: ninguna.
- **PRs recientes** que sugieran unificación: ninguno (git log de ambos archivos confirmado).

---

## Sección 3 — Sub-decisiones, opciones y tradeoffs

Tres sub-decisiones: 3.1 (unify vs ratify separados, central), 3.2 (adapter pattern), 3.3 (documentation strategy).

### 3.1 Unify vs ratify separados

**Pregunta:** ¿unificar los 2 types via base type común o discriminated union, o ratify separados con docs?

#### Opción 3.1.A — Ratify separados (RECOMENDADA)

Mantener los 2 types completamente independientes. Documentar via JSDoc + CLAUDE.md section.

- **Pros:** lifecycle ortogonal preservado; diferencias intencionales respetadas (severity sets, anchor models, type field semantics); zero refactor.
- **Cons:** discoverability de "cuándo usar cada uno" requiere docs explícitas (Sec 3.3 lo cubre).
- **Migration:** 0 código + JSDoc + CLAUDE.md.

#### Opción 3.1.B — `BaseDiagnostic` + extension

Introducir base type común con shared fields (`severity`, `message`):

```ts
interface BaseDiagnostic {
  severity: 'info' | 'warning' | 'error';  // ¿qué severity set usar como base?
  message: string;
}

interface ValidationDiagnostic extends BaseDiagnostic {
  code: ValidationCode;
  pieceId?: string;
  seamId?: string;
  field?: string;
}

interface Diagnostic extends BaseDiagnostic {
  severity: DiagnosticSeverity;  // override para incluir 'critical'
  category: string;
  detail?: string;
}

```

- **Pros:** shared fields visibles en type system; futuras additions pueden agregarse al base.
- **Cons (primary):** N=2 no justifica abstract base. Forzar herencia donde la composition no la pide es over-engineering. Si emerge tercer type con shared fields reales, B se reabre con evidence concreta.
- **Cons (secondary):** la severity set difference fuerza override en `Diagnostic` (loses type narrowing del base). Refactor minor pero riesgo de cementar shared fields que no apliquen a un futuro tercer type.
- **Descartar** (no por mal, por prematuro — N=2 + diferencias significativas en el field "shared" más obvio = base inestable).

#### Opción 3.1.C — Discriminated union

```ts
type AnyDiagnostic =
  | { kind: 'load'; severity: 'info' | 'warning' | 'error'; code: ValidationCode; message: string; pieceId?: string; ... }
  | { kind: 'inspector'; severity: DiagnosticSeverity; category: string; message: string; detail?: string };
```

- **Pros:** shared utilities pueden tipar contra `AnyDiagnostic` con type narrowing por `kind`.
- **Cons (primary):** los 2 types tienen consumers completamente separados. **No hay shared utilities reales que se beneficien.** El sweep no encontró utilities cross-type que necesiten tipo unión.
- **Cons (secondary):** refactor moderate (todos los consumers de cada type ven el discriminator); gain: zero salvo theoretical.
- **Descartar.**

#### Recomendación 3.1

**Opción 3.1.A** con confianza alta. Razones:

1. **Lifecycle ortogonal real:** los 2 types nunca se cruzan en runtime — N=2 con 0 cross-type usage.
2. **Diferencias estructurales intencionales:** severity sets (3 vs 4), type fields (strict enum vs free-form), anchor models (entity-specific vs free detail) — todas justificadas por el lifecycle de cada uno.
3. **Base type común se justifica solo si N>=3** types compartirían fields estables. Con N=2 + diferencias en el campo "shared" más obvio (severity), el base sería inestable.
4. **Adapter pattern (3.2)** confirma no cross-type need — no hay shared utilities que requieran unión.

**Tradeoff aceptado:** discoverability depende de docs (3.3). Sin lint/type enforcement de "qué type usar cuándo".

---

### 3.2 Adapter pattern (cross-type mapping)

**Pregunta:** ¿introducir adapter helper preventivo para mapear `ValidationDiagnostic` ↔ `Diagnostic`?

#### Opción 3.2.A — Sin adapter (RECOMENDADA)

Ratify lifecycles separados. Si emerge necesidad cross-type futura, el adapter se escribe en ese momento — el shape del adapter depende del use case específico.

- **Pros:** YAGNI compliance; los 2 lifecycles realmente no se cruzan en codebase actual; preserva la separación intencional.
- **Cons:** si emerge necesidad cross-type futura, hay que escribir el adapter on-demand. Pero NO es trabajo perdido — el adapter depende del use case (qué fields preservar, cómo mapear severity 'critical' downward, etc.) que no conocemos sin caso real.
- **Migration:** 0.

#### Opción 3.2.B — Adapter preventivo

Helper exportado, e.g., `validationToInspector(d: ValidationDiagnostic): Diagnostic`.

- **Pros:** disponible si emerge cross-type need.
- **Cons (primary):** YAGNI violation. El shape del adapter depende del use case. Posibles cases:
  - "Mostrar ValidationDiagnostic en InspectorTab post-load" — el mapping define `category` desde `code`, `detail` desde `pieceId`+`field`.
  - "Exportar inspector Diagnostic como part del project save" — mapping define `code` desde `category` (¿free-form a strict enum? requiere lookup table).
  - "Render unified panel mixing both" — un wrapper component, no necesariamente un adapter de types.
  Cada case requiere shape distinto. Diseñarlo sin caso real lleva a abstraction wrong-fit.
- **Cons (secondary):** un helper exportado sin consumers es smell que invita re-discovery + tests + maintenance overhead.
- **Descartar.**

#### Recomendación 3.2

**Opción 3.2.A** con confianza alta.

**Reopen trigger nombrado:** "Si un site necesita renderizar ValidationDiagnostic en InspectorTab (o vice versa), reabrir 3.2 con el caso concreto. El adapter shape se diseña post-hoc con conocimiento del use case real."

---

### 3.3 Documentation strategy

**Pregunta:** ¿cómo documentar la decisión + lifecycle de cada type para que un futuro dev no re-investigue?

#### Opción 3.3.A — JSDoc en cada type + CLAUDE.md section (RECOMENDADA)

Combina:

1. **JSDoc en `ValidationDiagnostic`** explicitando lifecycle + cross-ref a `Diagnostic`:

   ```ts
   /**
    * Boundary parsing diagnostic emitted during loadProject validation.
    *
    * Persisted in projectState.loadDiagnostics. For runtime user inspection
    * (right-click → Inspect), use Diagnostic from src/diagnostics/types.ts.
    *
    * Cross-ref: D7 ratification doc, CLAUDE.md "Diagnostic types".
    */
   export interface ValidationDiagnostic { ... }
   ```

2. **JSDoc en `Diagnostic`** mirror-image:

   ```ts
   /**
    * Runtime user inspection diagnostic emitted by ruleEngine during
    * user-triggered inspection (right-click → Inspect).
    *
    * Transient in inspectorState. For load-time validation, use
    * ValidationDiagnostic from src/utils/projectValidator.ts.
    *
    * Cross-ref: D7 ratification doc, CLAUDE.md "Diagnostic types".
    */
   export interface Diagnostic { ... }
   ```

3. **CLAUDE.md sección "Diagnostic types (D7 ratified)"** con:
   - Descripción de los 2 types con lifecycle.
   - Cuándo usar cada uno (decision rule).
   - Cross-ref a archivos.
   - Decisión de no unificar (cross-ref a D7 doc).

##### Pros

- Discoverability multi-nivel: JSDoc cerca del código (para edits), CLAUDE.md como índice (para onboarding).
- Zero código modification — solo doc anchors.

##### Cons

- Triple-write si la decisión cambia (JSDoc × 2 + CLAUDE.md). Mitigado: la decisión es estable post-D7 (lifecycle ortogonal real).

#### Opción 3.3.B — Solo JSDoc, sin CLAUDE.md

Solo doc-comments en los types. CLAUDE.md no tiene sección dedicada.

- **Pros:** single source of truth.
- **Cons:** discoverability initial requiere conocer los archivos. Nuevo dev haciendo onboarding puede no saber dónde buscar.
- **Descartar** (CLAUDE.md como índice tiene return on investment alto vs cost de ~30 líneas).

#### Opción 3.3.C — Solo CLAUDE.md, sin JSDoc

Solo sección CLAUDE.md, sin comentarios en los types.

- **Pros:** un solo lugar para mantener.
- **Cons:** un dev editando los types no ve la convention sin abrir CLAUDE.md.
- **Descartar.**

#### Recomendación 3.3

**Opción 3.3.A** — JSDoc autoritativo + CLAUDE.md índice.

---

### Tabla resumen Sec 3

| Sub-decisión | Recomendación | Migration cost |
|---|---|---|
| 3.1 Unify vs ratify | **3.1.A** — Ratify separados | 0 código |
| 3.2 Adapter pattern | **3.2.A** — Sin adapter | 0 código + reopen trigger nombrado |
| 3.3 Documentation | **3.3.A** — JSDoc × 2 + CLAUDE.md section | 0 código + ~30 líneas docs (CLAUDE.md) + ~12 líneas JSDoc |

**Total migration:** 0 código + ~42 líneas docs + 0 follow-up issue. **Zero behavior change.** D7 cementa convention via documentation only.

---

## Sección 4 — Recomendación consolidada

Si Sam aprueba 3.1.A + 3.2.A + 3.3.A, los 3 cambios resultantes son:

| # | Cambio | Archivo | Tipo |
|---|---|---|---|
| 1 | JSDoc en `ValidationDiagnostic` (lifecycle + cross-ref) | `src/utils/projectValidator.ts:32` | docs (~6 líneas) |
| 2 | JSDoc en `Diagnostic` (lifecycle + cross-ref) | `src/diagnostics/types.ts:103` | docs (~6 líneas) |
| 3 | Section CLAUDE.md "Diagnostic types (D7 ratified)" | `CLAUDE.md` | docs (~30 líneas) |

Sin issue follow-up. El reopen trigger de 3.2 está documentado in-place; no requiere tracking issue separado.

---

## Sección 5 — Plan de migración Fase 3

**Nota:** Fase 3 mínima. Los pasos:

### 5.1 Commit 1 — JSDoc en los 2 types

Atomic commit tocando 2 archivos:

- `src/utils/projectValidator.ts` — JSDoc en `ValidationDiagnostic` (líneas ~32).
- `src/diagnostics/types.ts` — JSDoc en `Diagnostic` (líneas ~101).

Tests existentes deben quedar verdes (zero behavior change). ~12 líneas docs total.

### 5.2 Commit 2 — CLAUDE.md anchoring

Sección "Diagnostic types (D7 ratified)" agregada a CLAUDE.md. ~30 líneas.

Contenido:
- 2 types descritos con lifecycle.
- Decision rule (cuándo usar cada uno).
- Cross-ref a archivos + a este doc.
- Reopen triggers (3.2 trigger nombrado: cross-type rendering need).

### 5.3 No otros commits ni follow-up issues

D7 cierra completo con los 2 commits. No lint rule, no migration de consumers, no adapter helper.

---

## Sección 6 — Cross-refs y dependencias

### 6.1 Inputs

- `docs/reports/2026-04-28-drift-inventory-fase1.md` § D7.
- `docs/reports/2026-04-28-drift-fase2-classification.md` (eje (b)).
- D1-cosmetic ratificación (closed) — precedent del shape "shape-similar pero roles distintos".
- B10-state Par 2 ratificación (PR #660 merged) — precedent del shape "misclassification ratify".
- `src/utils/projectValidator.ts:32-39` (ValidationDiagnostic).
- `src/diagnostics/types.ts:101-108` (Diagnostic).
- `src/store/projectSlice.ts:207, 235` (loadDiagnostics state).
- `src/store/inspectorSlice.ts:34, 87` (inspector diagnostics state).

### 6.2 Outputs

- **Si aprobado:** Fase 3 (~42 líneas docs + 0 código).
- **D7 cerrado:** ratification con docs anchoring. Ningún follow-up issue.
- **No outputs hacia ejes futuros** salvo precedent meta — D7 es séptima ratify-by-convention del audit (después de C7, B12, B5, D1-cosmetic, B6 partial, B10-Par2, B2 → ahora D7).

### 6.3 No-conflicts (out-of-scope verificado)

- **AgentAnalysis / AgentSuggestion** types (consumidos por agentAnalyzer.ts) — sin overlap estructural con Diagnostic; son output del analysis. Sin conflict.
- **InspectionData** type — input al evaluateRules, distinto de Diagnostic output. Sin conflict.
- **CLAUDE.md "Diagnostic Inspector"** sección existente describe el subsystem; D7 agrega sub-section o sección hermana sobre los types specifically.

---

## Sección 7 — Reopen triggers

D7 ratificación queda revisable si emerge:

1. **Tercer Diagnostic-like type emerges** con shared fields reales con uno de los 2 actuales. Reabrir 3.1 evaluando si BaseDiagnostic ahora se justifica con N=3.
2. **Caso real cross-type rendering:** un site necesita mostrar ValidationDiagnostic en InspectorTab, o exportar inspector Diagnostic como part del project save, o un panel unificado. Reabrir 3.2 con el caso concreto + diseñar adapter shape post-hoc.
3. **Shared utility cross-type emerges** (e.g., un formatter común, un severity ranker, un grouping helper que necesita tipar contra union de los 2 types). Reabrir 3.1 evaluando discriminated union.
4. **Severity sets convergen** (e.g., loader empieza a emit `'critical'` o inspector descarta `'critical'`). Reabrir 3.1 con base type común ahora viable.
5. **Type fields convergen** (e.g., `category` de Diagnostic se vuelve enum strict, o `code` de ValidationDiagnostic se vuelve free-form). Reabrir 3.1.
6. **Doc rot:** si CLAUDE.md "Diagnostic types" o JSDoc cross-refs quedan stale post-edit, treat como signal para revisitar la decisión más allá de cosmetic update.

---

## Sección 8 — Deuda técnica explícita post-ratificación

1. **`ValidationCode` enum no exportado fuera de `projectValidator.ts`.** Currently used solo por `ValidationDiagnostic`. Si un consumer futuro necesita match codes (e.g., UI que filtra por error type), se exporta el enum o se introduce un helper. **NO scope de D7**; oportunidad cosmética para próximo eje que toque esa área. No se abre follow-up issue — la deuda es trivial y el costo de tracking es mayor que el de fixearlo on-demand.

2. **Documentation triple-write riesgo.** JSDoc × 2 + CLAUDE.md sección. Si la decisión cambia (e.g., reopen trigger fires), 3 lugares a sincronizar. Mitigado por estabilidad esperada — lifecycle ortogonal es fundamental, no cosmético.

3. **Severity sets divergencia documentada pero sin enforcement.** Documentamos que ValidationDiagnostic NO usa `'critical'` por design; pero no hay lint rule que lo enforce. Si un emit site futuro accidentalmente usa `'critical'` en ValidationDiagnostic, type system no lo previene (TypeScript permite el subset implícito porque `'critical'` no está en el union). Verified: `severity: 'error' | 'warning' | 'info'` excluye `'critical'` en type-time. **No es deuda real** — type system YA lo previene; mention solo para completitud.

4. **No adapter pattern documentation site.** Si emerge cross-type need (reopen trigger 7.2), el adapter se diseña en ese momento. Aceptable.

---

## Sección 9 — Decisión pendiente y siguiente paso

### 9.1 Pregunta a Sam

¿Aprobás las 3 sub-decisiones tal como recomendado en Sec 3 (3.1.A + 3.2.A + 3.3.A)?

Si **sí, todo aprobado:**
- Marco PR ready-for-review.
- Sec 4-9 quedan como ratificación final.
- Fase 3 (2 commits: JSDoc + CLAUDE.md) sobre este branch.
- Inventory annotation post-merge.
- Sin follow-up issue.

Si **alguna sub-decisión querés cambiar:**
- Indicame cuál (3.1, 3.2, 3.3) y qué opción preferís.

Si **el scope del eje cambia:**
- STOP. Reabro Sec 1.

### 9.2 Estado del PR

- Sec 1-9 ✅ ready.
- PR draft pending creation.
- Pendiente Fase 3 commits.

### 9.3 Calibración estimate vs actual

- Estimate Fase 2 doc: ~3-4h. Actual: ~2.5h.
- **Factor ~0.6-0.8x del estimate.** Causa: scope chico (3 sub-decisiones, ratification) + investigación adicional previa cerró space de decisión + 0 sorpresas.
- **Total esperado Fase 3 (no en este PR):** ~30min para JSDoc + CLAUDE.md.

---

**FIN DEL DOC.** Esperando verde de Sam para promover PR a ready-for-review + arrancar Fase 3.
