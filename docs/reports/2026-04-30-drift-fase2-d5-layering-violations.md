# Drift Fase 2 — D5: Layering violations / cross-layer imports

**Fecha:** 2026-04-30
**Eje:** D5 — components/ → copilot/ cross-layer imports.
**Categoría inventario:** (b) decisión producto/arq.
**Estado:** PROPUESTA. Ratify "feature ownership" reading (no formal layers). Cero refactor de código. Esperando review de Sam.

**Branch:** `drift/d5-layering-violations`.
**Cross-ref inventario:** `docs/reports/2026-04-28-drift-inventory-fase1.md` → D5.
**Cross-ref clasificación:** `docs/reports/2026-04-28-drift-fase2-classification.md` → eje (b).
**Cross-ref D1-cosmetic Apéndice B:** sub-sweep contextual con conteo subset (9 archivos). Ver Sec 2.6 nota metodológica.
**Cross-ref D7 (closed):** precedent del shape "ratify by lifecycle ortogonal + JSDoc cross-ref".

---

## Sección 1 — Decide / NO decide

### Decide en este eje

1. **Layer policy del codebase:** ratify "feature ownership" reading. El codebase NO tiene formal layered architecture; organiza código por **feature ownership** (cada feature es responsable de su UI, lógica, types, etc., aunque vivan en directories distintos por convención React).
2. **24 archivos cross-layer son legítimos** bajo feature ownership reading. Todos pertenecen a features que tienen ownership compartido entre `components/` (UI) y `copilot/` (logic) — Copilot panel, skill marketplace, plugin manager, setup wizard, cross-feature integrations.
3. **`core/` mention en CLAUDE.md es doc-drift.** Remove para evitar confusión sobre layer infrastructure que nunca existió.
4. **Documentation policy:** sección CLAUDE.md "Layer policy" + JSDoc selectivo en archivos cross-layer claves explicando feature ownership.

### NO decide en este eje

1. **Migración de los 24 archivos cross-layer.** Out-of-scope; ratificación de status quo.
2. **Introducir formal layer infrastructure** (eslint boundaries plugin, no-restricted-paths rules, context provider boundaries, hooks bridge). Eso requiere sub-RFC dedicado con scope arquitectónico — fuera de D5.
3. **Reorganización de directorios** (e.g., mover CopilotPanel/* a copilot/ui/). Out-of-scope; los 24 archivos quedan donde están.
4. **`core/` directory creation.** No se introduce; el mention en CLAUDE.md se remueve sin reemplazo.
5. **Refactor del subsystem copilot.** D5 ratifica el shape actual; cualquier refactor del subsystem es scope distinto.
6. **Lint rule custom para layer enforcement** (e.g., warn si un component editor 2D/3D aleatorio importa `copilot/action/*`). Aceptable como follow-up issue futuro si emerge drift real, pero NO en D5.

### Por qué importa la línea

Sin la ratification explícita, alguien que mire `components/CopilotPanel/CopilotPanel.tsx` con ~14 imports desde `copilot/` puede asumir que el codebase tiene layer violations rampantes. La realidad es que esos imports son legítimos por feature ownership. Documentar la convention previene re-investigation y evita imposición prematura de formal layers.

---

## Sección 2 — Estado actual

### 2.1 Pre-existing canonical infrastructure (regla 1 v2)

- **No existe formal layer infrastructure:**
  - `eslint.config.js` (33 líneas, verificado): sin `boundaries` plugin, sin `no-restricted-paths`, sin `no-restricted-imports`. Ningún rule de layer enforcement.
  - `src/core/` directory: **absent**. CLAUDE.md mention es doc-drift puro (directorio nunca existió en historial).
  - No hay `boundaries.json`, `dependency-cruiser.json`, ni equivalente para enforce structure.
- **No hay convention documentada explícitamente.** CLAUDE.md "Key Directories" enumera dirs sin reglas de qué puede importar qué.

**Conclusión:** convention está implícita (feature ownership). D5 produce ratification doc + anchoring (no canonical pre-existente).

### 2.2 Inventario refresh — 24 archivos cross-layer

`grep "from ['\"].*copilot" src/components | grep -v test` → **24 archivos únicos, 67 import lines**.

Clasificación por feature ownership:

#### Categoría 1 — Copilot Panel UI (10 archivos)

UI mismo del subsystem copilot. Vive en `components/` por convención React (componentes reutilizables van en `components/`), pero feature ownership = copilot.

| # | Archivo | Imports principales desde copilot/ |
|---|---|---|
| 1 | `CopilotPanel/CopilotPanel.tsx` | ~14: providers (anthropic, openai, deepseek, ollama, claudeBridge), tools registry, memory, hooks, meta-tools, costManager, errorRecovery, AgentSettings, types |
| 2 | `CopilotPanel/CopilotActionLog.tsx` | store/copilotUISlice (technically store/, included for completeness) |
| 3 | `CopilotPanel/CopilotConfirmDialog.tsx` | store/copilotUISlice |
| 4 | `CopilotPanel/CopilotEmptyState.tsx` | `errorRecovery.getOfflineActions` |
| 5 | `CopilotPanel/CopilotInput.tsx` | `perception/languageDetection`, `AgentSettings` |
| 6 | `CopilotPanel/CopilotPlanView.tsx` | `planner/planTypes` types + helpers |
| 7 | `CopilotPanel/CopilotToast.tsx` | store/copilotUISlice |
| 8 | `CopilotPanel/CopilotUIOverlay.tsx` | `actions/actionExecutor`, `actions/actionTypes` |
| 9 | `CopilotPanel/ProgressMessage/ProgressMessage.tsx` | `hooks/useAgenticLoop` types |
| 10 | `CopilotPanel/useCopilotKeyboardShortcuts.ts` + `useCopilotUI.ts` | `actions/actionTypes`, store/copilotUISlice |

#### Categoría 2 — Copilot-adjacent UI (3 archivos)

Otras surfaces UI del copilot que viven fuera de `CopilotPanel/`.

| # | Archivo | Imports principales desde copilot/ |
|---|---|---|
| 11 | `CommandBar/CommandBar.tsx` | useAgenticLoop + 6 providers + tools registry + meta-tools + types (~10 imports — mismo pattern que CopilotPanel) |
| 12 | `shell/UnifiedBarChat.tsx` | useAgenticLoop + 6 providers + tools registry + meta-tools + types (~10 imports) |
| 13 | `shell/UnifiedBarSettings.tsx` | `providers/types` |

#### Categoría 3 — Skill marketplace UI (5 archivos)

Sub-feature del copilot (skills system). UI vive en `components/SkillMarketplace/` y `components/ExportSkillModal/`.

| # | Archivo | Imports principales |
|---|---|---|
| 14 | `SkillMarketplace/SkillMarketplace.tsx` | `action/skills/skillRegistry`, `action/skills/marketplace`, `action/skills/communityFormat`, `action/skills/registryTypes` |
| 15 | `SkillMarketplace/SkillCard.tsx` | `action/skills/communityFormat` types |
| 16 | `SkillMarketplace/SkillCardInstalled.tsx` | `action/skills/registryTypes`, `action/skills/coreSkills` |
| 17 | `SkillMarketplace/ImportSeamlyModal.tsx` | `action/skills/seamlyToSkill`, `action/skills/skillRegistry` |
| 18 | `ExportSkillModal/ExportSkillModal.tsx` | `action/skills/SkillBuilder`, `action/skills/skillRegistry` |

#### Categoría 4 — Plugin manager UI (1 archivo)

Sub-feature plugins. UI vive en `components/PluginManager/`.

| # | Archivo | Imports principales |
|---|---|---|
| 19 | `PluginManager/PluginManager.tsx` | `plugins/types`, `plugins/pluginManager` |

#### Categoría 5 — Setup/config UI (1 archivo)

Provider configuration UI (copilot-adjacent).

| # | Archivo | Imports principales |
|---|---|---|
| 20 | `SetupWizard/SetupWizard.tsx` | `providers/types` |

#### Categoría 6 — Cross-feature integrations (3 archivos)

UI no-copilot que invoca lógica copilot en flow específico documentado.

| # | Archivo | Imports principales | Justification |
|---|---|---|---|
| 21 | `BottomPanel/BottomPanel.tsx` | `reasoning/proactiveAnalysis.runProactiveAnalysis` | BottomPanel hosts CopilotTab + invokes proactive analysis on tab activation. UI shell explícitamente integra copilot output. |
| 22 | `TemplateLibrary/TemplateLibrary.tsx` | `intelligence/garmentAnalyzer.analyzeGarment` | Template library invokes garment analysis to suggest matching templates — explicit cross-feature integration. |
| 23 | `Workspace/Workspace.tsx` | `keyboardShortcuts.createCopilotKeyHandler` | Workspace shell root creates global key handler that includes copilot shortcuts. Explicit shell-feature integration. |

**Total: 24 archivos clasificados, 100% legítimos bajo feature ownership reading.**

### 2.3 Pattern semántico observado

Tres tipos de imports legítimos:

1. **Feature-internal UI** (Categorías 1-2, 13 archivos): la UI del feature copilot vive en `components/` por convención React. El feature "owns" both directories — el split components/copilot es organizacional, no architectural.

2. **Sub-feature UI** (Categorías 3-5, 7 archivos): skills, plugins, setup-wizard son sub-features del subsystem copilot. Same ownership pattern.

3. **Cross-feature integration explícita** (Categoría 6, 3 archivos): UI no-copilot integra output copilot via función específica documentada. Entry points concretos (proactive analysis, garment analyzer, key handler factory).

**No hay cuarto tipo "random violation"** observado en el sweep — todos los 24 archivos encajan en uno de los 3 patterns legítimos.

### 2.4 Eslint config (verificado 2026-04-30)

`eslint.config.js` (33 líneas):

```js
export default tseslint.config(
  { ignores: ['dist'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
)
```

**Sin** `boundaries`, `no-restricted-paths`, `no-restricted-imports`, `import/no-restricted-paths`. **0 layer enforcement.**

### 2.5 `core/` directory status

**Absent.** `ls src/core` retorna error. CLAUDE.md menciona `core/` en sección "Key Directories":

```
src/
├── components/           # React UI components
│   ├── CopilotPanel/    # AI assistant chat interface
│   ...
├── core/                # Semantic garment engine
│   ├── geometry/        # Constraint-based geometry
│   └── pattern/         # Pattern piece operations
```

**Doc-drift puro:** el directorio nunca existió en el historial reciente del repo (`git log -- src/core` retorna empty). Geometry y pattern operations viven en `src/utils/geometry/` y `src/utils/pattern/`.

### 2.6 Nota metodológica — divergencia con Apéndice B (D1-cosmetic)

El Apéndice B de D1-cosmetic (cierre 2026-04-29) reportó **9 archivos cross-layer**. El sweep refresh de D5 muestra **24 archivos** (+167%).

La divergencia se explica porque el Apéndice B fue **sub-sweep contextual** durante investigación de D1-cosmetic (foco en grainLine casing), no full cross-layer scan. El conteo de 9 era subset (probablemente excluyó CopilotPanel/* assumiendo feature ownership implícitamente). El sweep de D5 es el **autoritativo full scan** del eje.

**No invalida D1-cosmetic.** El Apéndice B sirvió su propósito en context (sub-investigación de un eje distinto). La nota aplica a una regla metodológica general: **sub-sweeps son contextuales, no autoritativos para el eje correspondiente.**

D1-cosmetic queda cerrado correctamente con su shape ratificado. La regla metodológica se ancla en CLAUDE.md post-D5 cierre (atomicity).

### 2.7 Recent commits status

`git log --since=2026-04-29 -- 'src/components' 'src/copilot'` (15 commits revisados):

- B10-state Par 1 fabric migrations (5eef53fa, f9b5c9f5).
- BUG-10 IDB persistence migrations (8 commits).
- BUG-13 enabledPlugins drop, BUG-15 error event, B6-state notes, C5 #642 close.

**Ninguno introdujo formal layer infrastructure** ni movió archivos entre layers. Pattern actual estable.

---

## Sección 3 — Sub-decisiones, opciones y tradeoffs

Tres sub-decisiones: 3.1 (layer policy, central), 3.2 (`core/` mention en CLAUDE.md), 3.3 (discoverability strategy).

### 3.1 Layer policy

**Pregunta:** ¿el codebase debe tener formal layered architecture, restricción parcial, o ratify "feature ownership" reading actual?

#### Opción 3.1.A — Ratify "feature ownership" reading (RECOMENDADA)

CLAUDE.md documenta explícitamente que el codebase organiza código por **feature ownership**, no por capas formales. Los 24 archivos cross-layer son legítimos: cada feature (copilot, skills, plugins) tiene ownership compartido entre `components/` (UI) y `copilot/` (logic). El split es organizacional (convención React), no architectural.

- **Pros:**
  - Refleja la realidad observable: 24/24 archivos pasan el test de feature ownership.
  - Zero refactor.
  - Convention discoverable via CLAUDE.md sección dedicada.
  - Preserva flexibilidad: nuevos features pueden organizarse por la misma convención sin imposición de boundaries.
- **Cons:**
  - Sin lint enforcement, un dev futuro podría introducir un import "random violation" (e.g., un editor 2D component importando `copilot/action/skills/skillRegistry` sin justification de feature ownership). Mitigado: si emerge tal caso, reabrir 3.1 con el caso concreto.
- **Migration:** 0 código + sección CLAUDE.md "Layer policy".

#### Opción 3.1.B — Definir convención formal layered

Establecer regla "components/ NO importa copilot/ directamente" + introducir interfaces/hooks bridge para invocar lógica copilot desde components/.

Implica:

1. Diseño arquitectónico de la bridge layer (context provider? hooks abstractos? interface type?).
2. Refactor de los 24 archivos para consumir la bridge.
3. Agregar eslint plugin `boundaries` o `no-restricted-paths` para enforce.

- **Pros:** "clean architecture" formal con enforcement.
- **Cons (primary):** **rewrite 24 archivos** — costo masivo. Y la decisión arquitectónica de bridge shape (context vs hooks vs interface) merece **sub-RFC dedicado**. Eso es scope architectural sub-RFC, no eje (b) ratification.
- **Cons (secondary):** El "clean architecture" formal en codebase de single-team productivity puede ser over-engineering. Los 24 archivos son features-owned, no random violations — la "clean separation" no resuelve un problema real, solo añade abstraction overhead.
- **Cons (tertiary):** rebuild de tests E2E para los 24 archivos (cada UI surface necesita re-verificarse post-bridge).
- **Migration cost:** ~2-3 semanas si se hace serio. Open-ended scope.
- **Descartar.**

#### Opción 3.1.C — Restricción parcial

E.g., "components/ puede importar `copilot/types/*` y `copilot/hooks/*` pero NO `copilot/action/skills/*` ni `copilot/intelligence/*`".

- **Pros:** middle ground — preserva integration points "thin" mientras restringe deep imports.
- **Cons (primary):** la decisión de QUÉ subset restringir es precisamente la decisión arquitectónica que B implica. Sin diseño explicit del bridge, la línea es arbitraria.
- **Cons (secondary):** hereda costos de B (eslint rule + refactor) sin beneficio claro. Los 24 archivos actuales tienen mix — algunos importan types-only (ProgressMessage, SkillCard), otros importan ejecutables (CopilotPanel ~14 imports of providers/tools/hooks). Restringir parcialmente significa migrar el subset "deep" de los 24 — no simplifica significativamente vs B.
- **Cons (tertiary):** convention rot — sin diseño claro, devs futuros van a debatir si un nuevo import cae en "permitido" vs "restringido".
- **Migration:** ~1 semana, subset incierto.
- **Descartar** — no simplifica, solo difiere la decisión arquitectónica.

#### Recomendación 3.1

**Opción 3.1.A** con confianza alta. Razones:

1. **24/24 archivos pasan feature ownership test** — no hay random violations que justifiquen imposición.
2. **Cost de B es masivo + open-ended scope** (sub-RFC bridge design); cost de C es subset costoso sin clear gain.
3. **Codebase actual funciona** sin formal layers — imposición retroactiva es premature optimization arquitectónica.
4. **CLAUDE.md mention de `core/`** (Sec 3.2) sugiere que en algún momento se consideró layered architecture, pero el directorio nunca se creó. El no-creation es evidence empírica de que el equipo eligió feature ownership.

**Tradeoff aceptado:** sin lint enforcement, drift futuro depende de review humano. Si emerge un caso real de "random violation" (un dev sin context importa copilot deep desde un component sin relación), reabrir 3.1.

---

### 3.2 `core/` mention en CLAUDE.md

**Pregunta:** la sección "Key Directories" de CLAUDE.md menciona `src/core/` que no existe. ¿remover o documentar como future work?

#### Opción 3.2.A — Remove `core/` mention completely (RECOMENDADA)

Editar CLAUDE.md "Key Directories" para eliminar las líneas `core/` + sub-tree (`geometry/`, `pattern/`).

- **Pros:** elimina confusión inmediata. Doc refleja la realidad. Onboarding limpio.
- **Cons:** ninguno material — la mention es puramente doc-drift sin intent histórico recuperable.
- **Migration:** ~3-5 líneas en CLAUDE.md.

#### Opción 3.2.B — Document `core/` como "future work intent"

Mantener mention pero anotar: "Reserved for future semantic garment engine; currently empty. Code lives in `src/utils/geometry/` and `src/utils/pattern/`."

- **Pros:** preserva intent histórico (si hubo intent).
- **Cons (primary):** cementa intent que **no tiene timeline ni roadmap concreto**. Future work doc-debt persistente.
- **Cons (secondary):** invita a un dev futuro a "implementar" `core/` sin contexto, lo cual generaría refactor masivo sin justification.
- **Descartar.**

#### Recomendación 3.2

**Opción 3.2.A.** Remove sin reemplazo. La doc-drift no merece preservación.

---

### 3.3 Discoverability strategy

**Pregunta:** ¿cómo evitar que un dev futuro re-investigue "¿es esto un layering violation?" cuando vea CopilotPanel.tsx con ~14 imports desde copilot/?

#### Opción 3.3.A — Sección CLAUDE.md "Layer policy" + JSDoc selectivo (RECOMENDADA)

Combina:

1. **Sección CLAUDE.md "Layer policy (D5 ratified)"** — convención feature ownership documentada + 24-archivos snapshot + decision rule + reopen triggers. ~40 líneas.
2. **JSDoc selectivo en archivos cross-layer claves:**
   - `CopilotPanel.tsx` (top-of-file) — ~3 líneas explicando feature ownership y cross-ref a CLAUDE.md.
   - `BottomPanel.tsx` (top-of-file) — ~3 líneas para el caso cross-feature integration.
   - `Workspace.tsx` (top-of-file) — ~3 líneas.
   - Total ~9 líneas JSDoc total en 3 archivos representativos (no los 24 — solo los más visibles para onboarding).

##### Pros

- Discoverability multi-nivel: CLAUDE.md como índice, JSDoc en sites más visitados.
- Zero código modification — solo doc.
- JSDoc selectivo (3 archivos clave) evita maintenance overhead vs cubrir los 24.

##### Cons

- Triple-write riesgo si la convention cambia: CLAUDE.md + 3 JSDocs. Mitigado: convention es estable (feature ownership es la realidad observable).

#### Opción 3.3.B — Solo CLAUDE.md sección, sin JSDoc

Solo doc en CLAUDE.md. Archivos individuales sin comentarios.

- **Pros:** un solo lugar para mantener.
- **Cons:** un dev abriendo CopilotPanel.tsx con 14 imports puede no saber que hay convention documentada en CLAUDE.md — discoverability initial inadecuada.
- **Descartar.**

#### Recomendación 3.3

**Opción 3.3.A.** CLAUDE.md autoritativo + JSDoc selectivo en 3 archivos clave (CopilotPanel, BottomPanel, Workspace).

---

### Tabla resumen Sec 3

| Sub-decisión | Recomendación | Migration cost |
|---|---|---|
| 3.1 Layer policy | **3.1.A** — Ratify feature ownership reading | 0 código |
| 3.2 `core/` mention | **3.2.A** — Remove sin reemplazo | -3-5 líneas CLAUDE.md |
| 3.3 Discoverability | **3.3.A** — CLAUDE.md section + JSDoc selectivo | +40 líneas CLAUDE.md + ~9 líneas JSDoc |

**Total migration:** 0 código + ~50 líneas docs net (40 nuevas - 5 removidas + 9 JSDoc = +44 líneas). Zero behavior change.

---

## Sección 4 — Recomendación consolidada

Si Sam aprueba 3.1.A + 3.2.A + 3.3.A, los cambios resultantes son:

| # | Cambio | Archivo | Tipo |
|---|---|---|---|
| 1 | Section CLAUDE.md "Layer policy (D5 ratified)" — feature ownership convention + 24-archivos snapshot + decision rule + reopen triggers | `CLAUDE.md` | docs (~40 líneas net) |
| 2 | Remove `core/` lines de "Key Directories" en CLAUDE.md | `CLAUDE.md` | docs (-3-5 líneas) |
| 3 | JSDoc en `CopilotPanel.tsx` (feature ownership note) | `src/components/CopilotPanel/CopilotPanel.tsx` | docs (~3 líneas) |
| 4 | JSDoc en `BottomPanel.tsx` (cross-feature integration note) | `src/components/BottomPanel/BottomPanel.tsx` | docs (~3 líneas) |
| 5 | JSDoc en `Workspace.tsx` (shell integration note) | `src/components/Workspace/Workspace.tsx` | docs (~3 líneas) |

Sin issue follow-up (lint rule custom para layer enforcement queda como reopen trigger condicional, no action item inmediato).

---

## Sección 5 — Plan de migración Fase 3

### 5.1 Commit 1 — CLAUDE.md anchoring

Atomic commit en `CLAUDE.md`:

1. Remove `core/` y `core/geometry/`, `core/pattern/` lines de "Key Directories".
2. Agregar nueva sección "Layer policy (D5 ratified)" con:
   - Convención feature ownership.
   - 24-archivos snapshot (resumido por categoría, no full table — la table está en el doc D5).
   - Decision rule: "cuándo importar cross-layer es legítimo".
   - Reopen triggers.
   - Cross-ref al doc D5.

Total ~37-40 líneas net.

### 5.2 Commit 2 — JSDoc en 3 archivos clave

Atomic commit tocando 3 archivos:

- `CopilotPanel.tsx` (top-of-file): `@module CopilotPanel — Feature-owned UI for the copilot subsystem. Per D5 ratification (CLAUDE.md "Layer policy"), components/* may import from copilot/* when feature ownership applies.`
- `BottomPanel.tsx` (top-of-file): nota similar para cross-feature integration.
- `Workspace.tsx` (top-of-file): nota similar para shell integration.

Total ~9 líneas JSDoc.

### 5.3 No otros commits ni follow-up issues

D5 cierra completo con los 2 commits. No lint rule custom (queda como reopen trigger condicional).

---

## Sección 6 — Cross-refs y dependencias

### 6.1 Inputs

- `docs/reports/2026-04-28-drift-inventory-fase1.md` § D5.
- `docs/reports/2026-04-28-drift-fase2-classification.md` (eje (b)).
- D1-cosmetic Apéndice B (closed) — sub-sweep contextual con conteo subset (9 archivos). Nota metodológica § 2.6.
- D7 ratificación (PR #665 merged) — precedent del shape "ratify by lifecycle ortogonal + JSDoc cross-ref + CLAUDE.md section".
- B2-state (PR #663 merged) — precedent del shape "ratify status quo + criterion forward-only".
- `eslint.config.js` (33 líneas) — verificado sin layer enforcement.
- `git log -- src/core` — verificado empty (directorio nunca existió).

### 6.2 Outputs

- **Si aprobado:** Fase 3 (~50 líneas docs net + 0 código).
- **D5 cerrado:** ratification con docs anchoring. Sin follow-up issue.
- **Mini-lesson para CLAUDE.md** sobre "sub-sweeps son contextuales" — ancla post-D5 cierre.

### 6.3 No-conflicts (out-of-scope verificado)

- **Subsystem copilot** sigue funcionando como hoy. Sin refactor.
- **CLAUDE.md secciones existentes** (Persistence, Cascade, Action meta flags, Fabric assignment, Entity collections, Diagnostic types) no afectadas. "Layer policy" es nueva sección, no edita las anteriores.
- **B-state ratifications previas** no afectadas.

---

## Sección 7 — Reopen triggers

D5 ratificación queda revisable si emerge:

1. **Random violation observada:** un dev introduce un import desde un editor 2D/3D component aleatorio (ej. `PatternEditor/SomeComponent.tsx` importando `copilot/action/skills/skillRegistry` sin justification de feature ownership). Eso indicaría que la convention sin enforcement es insuficiente — reabrir 3.1 evaluando lint rule.
2. **Subsystem copilot refactor mayor** que reorganice imports — podría invalidar las categorías 1-6 de Sec 2.2. Reabrir con nuevo sweep.
3. **Sub-RFC para formal layer architecture emerge** (independiente de D5) — ese sub-RFC sustituye D5 ratification.
4. **CLAUDE.md "Layer policy" anchoring se vuelve stale** post-edits (e.g., archivos cross-layer crecen a >40 sin updates). Reabrir 3.3 para hardening del documentation pattern.
5. **Eslint plugin `boundaries` se introduce por otra razón** (e.g., para WASM↔JS layer enforcement) — reabrir 3.1 evaluando si layer enforcement TS-side aplica también.

---

## Sección 8 — Deuda técnica explícita post-ratificación

1. **Sin lint rule de layer enforcement.** Convention vive en CLAUDE.md + 3 JSDocs. Drift futuro depende de review humano. Mitigado por feature ownership argument estable; reopen trigger 7.1 nombrado.

2. **JSDoc selectivo (3 archivos vs 24).** Los otros 21 archivos cross-layer NO reciben JSDoc explícito. Discoverability multi-archivo depende de CLAUDE.md como índice. Aceptable porque los 3 elegidos (CopilotPanel, BottomPanel, Workspace) son los más visibles para onboarding; los otros 21 siguen patterns derivables (CopilotPanel siblings reusen el mismo pattern, SkillMarketplace siblings reusen el mismo pattern, etc.).

3. **Mini-lesson sobre sub-sweeps contextuales** queda pendiente de anchor en CLAUDE.md (post-D5 cierre, atomicity). Sin anchor, otra sesión podría asumir que un sub-sweep antiguo es autoritativo y replicate el undercount issue. Mitigado: la regla es trivial y se ancla en commit aparte.

4. **`core/` mention removal** no archiva intent histórico (si alguna vez hubo). Si en el futuro un equipo decide implementar formal `core/` directory, esa decisión es scope nuevo — no se preserva como "future work" en CLAUDE.md.

5. **24 archivos snapshot en CLAUDE.md** queda fixed at 2026-04-30. Si crece a 30, 40+, anchoring puede stale — pero el reopen trigger 7.4 nombra esto. La snapshot es ilustrativa, no autoritativa.

---

## Sección 9 — Decisión pendiente y siguiente paso

### 9.1 Pregunta a Sam

¿Aprobás las 3 sub-decisiones tal como recomendado en Sec 3 (3.1.A + 3.2.A + 3.3.A)?

Si **sí, todo aprobado:**
- Marco PR ready-for-review.
- Sec 4-9 quedan como ratificación final.
- Fase 3 (2 commits: CLAUDE.md anchoring + JSDoc selectivo) sobre este branch.
- Inventory annotation post-merge.
- Mini-lesson sobre sub-sweeps contextuales en commit aparte post-D5 cierre.
- Sin follow-up issue.

Si **alguna sub-decisión querés cambiar:**
- Indicame cuál (3.1, 3.2, 3.3) y qué opción preferís.

Si **el scope del eje cambia:**
- STOP. Reabro Sec 1 con el scope ampliado.

### 9.2 Estado del PR

- Sec 1-9 ✅ ready.
- PR draft pending creation.
- Pendiente Fase 3 commits.

### 9.3 Calibración estimate vs actual

- Estimate (post sweep refresh): ~3-4h Fase 2 doc, ~380-480 líneas.
- Actual: ~3h, ~520 líneas (+8% vs upper bound estimate).
- **Factor ~0.6-0.8x del estimate.** Causa: sweep refresh con tabla detallada de 24 archivos absorbió la mayor parte del tiempo (vs estimate inicial que asumía reuso 80% del Apéndice B).
- **Total esperado Fase 3:** ~30min para CLAUDE.md anchoring + JSDoc selectivo.

---

**FIN DEL DOC.** Esperando verde de Sam para promover PR a ready-for-review + arrancar Fase 3.
