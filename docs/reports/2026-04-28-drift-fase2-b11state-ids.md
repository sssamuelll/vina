# Fase 2 — B11-state: ID generation (canonical proposal)

**Status:** propuesta canónica + archivos a tocar + tamaño. **NO implementación.** Sam aprueba antes de migrar.

**Eje:** B11-state — ID generation (`drift-inventory-fase1.md` axis B11-state, classification `(a)` mecánico).

**Inventario inicial decía S; investigación muestra M. Honest scope flag al final.**

---

## 1. Investigación — estado actual completo

### 5 implementaciones distintas de `uid`

| # | Archivo:línea | Signature | Output shape |
|---|---|---|---|
| 1 | `src/utils/pathHelpers.ts:3` | `export const uid = ()` | `piece-${Date.now()}-${random_4_chars}` |
| 2 | `src/utils/pathHelpers.ts:4` | `export const lineId = ()` | `int-${Date.now()}-${random_2_chars}` |
| 3 | `src/utils/patternOps.ts:24` | `function uid(prefix)` | `${prefix}-${Date.now()}-${++_counter}` (counter local al módulo) |
| 4 | `src/copilot/action/tools/definitions/patternOpsTools.ts:14` | `function uid(prefix)` | `${prefix}-${Date.now()}-${random_6_chars}` |
| 5 | `src/utils/seamly2d/seamlyAdapter.ts:95` | `function uid(prefix)` | `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}` (counter local) |

### Callsite counts (raw grep, may include false positives ±10%)

- `crypto.randomUUID()` en uso: **16 sites** (already canonical-conformant — pluginsBridge, PluginContext, artworkTools, AgenticRecorder, bomSlice, copilotUISlice, linkedEditingMiddleware, etc.).
- `uid(...)` o `uid()` en uso: **39 sites** (mostly in `src/copilot/action/tools/definitions/*.ts` and `src/copilot/actions/actionExecutor.ts`).
- `lineId()` en uso: ~6 sites (in patternOps and tool definitions).
- Inline `Date.now()`-based ID patterns: **~12 additional sites** scattered:
  - `src/copilot/providers/ollama.ts:175, 200` — `ollama-${Date.now()}-${random}`
  - `src/copilot/action/tools/definitions/uiBridgeTools.ts:53, 84` — `ann_${Date.now()}_${text}`, `piece_${Date.now()}`
  - `src/copilot/action/tools/definitions/simulationTools.ts:227` — `copilot-${Date.now()}`
  - `src/copilot/action/tools/definitions/seamTools.ts:141` — `seam-${Date.now()}-${random}`
  - `src/copilot/action/tools/definitions/patternOpsTools.ts:143, 409, 477` — `cut-seam-${Date.now()}`, `offset-${piece.id}-${Date.now()}`
  - `src/store/editorSlice.ts:225` — `piece-${Date.now()}-${random}` (clone)
  - `src/store/projectSlice.ts:512, 978, 1013` — clone IDs with same shape
  - `src/store/simulationSlice.ts:322` — `pin_${Date.now()}_${vertexIndex}`
  - `src/store/copilotUISlice.ts:150` — `${prefix}-${Date.now()}-${nextId++}` (yet another counter)
  - `src/store/constructionSlice.ts:39` — same shape as `seamlyAdapter.uid` (5)

### Two ID-generation classes surfaced during investigation

**Class A — opaque entity identity.** Used to identify a domain object (piece, seam, trim, line, layer, etc.). Format doesn't matter for correctness; only uniqueness matters. **39 + ~12 sites in this class.**

**Class B — composite identity encoding state.** ID intentionally encodes state for debugging or implicit referencing:
- `pin_${Date.now()}_${vertexIndex}` — vertex index baked into ID.
- `ann_${Date.now()}_${params.text}` — annotation text baked into ID (collision-prone — two annotations with same text minute).
- `offset-${piece.id}-${Date.now()}` — parent piece reference baked in.

Class B sites are NOT part of B11-state's drift fix per se — they are state-encoding decisions that belong to a separate review (probably B10-state, source-of-truth overlap). Replacing them with pure UUIDs would lose information that consumers may rely on.

---

## 2. Propuesta canónica

### Canonical for Class A (opaque entity IDs)

```typescript
// src/utils/ids.ts (new file)
/**
 * Canonical ID generator for opaque entity identifiers.
 *
 * Returns a v4 UUID. Use this for any new entity that needs a unique
 * identifier where the format is not significant for correctness or
 * external interoperability.
 *
 * For IDs that intentionally encode state (e.g., pin IDs that include
 * the vertex index they pin), do NOT use this — those are a separate
 * concern (see B10-state source-of-truth review).
 */
export function newId(): string {
  return crypto.randomUUID();
}
```

### Migration shape for the 5 helper functions

Each of the 5 `uid`/`lineId` implementations becomes a thin wrapper around `newId()`. Callers don't change (they keep calling `uid()` or `lineId()`); they just get UUIDs instead of timestamp-prefixed strings. Behavior change is observable only in the format of generated IDs (was `piece-1737...`, becomes `550e8400-e29b-41d4-a716-...`).

```typescript
// src/utils/pathHelpers.ts (refactor)
import { newId } from './ids';
export const uid = (): string => newId();
export const lineId = (): string => newId();
// PathCommand helpers below remain unchanged.
```

```typescript
// src/utils/patternOps.ts (refactor — drop the local counter, drop prefix)
import { newId } from './ids';
function uid(_prefix?: string): string { return newId(); }
// Note: callers pass a prefix that we now ignore. The old format
// "${prefix}-${Date.now()}-${counter}" is replaced with pure UUID.
// Caller code does not need to change.
```

Same shape for `patternOpsTools.ts:14` and `seamlyAdapter.ts:95`.

### Migration shape for inline `Date.now()` patterns

Each inline pattern becomes a `newId()` call:

```typescript
// Before
clone.id = `piece-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
// After
clone.id = newId();
```

Class B sites (composite IDs encoding state) are explicitly **left alone** with a comment marking them out of scope.

---

## 3. What changes observably

### Format change

Old IDs looked like `piece-1714322400000-abcd`. New IDs look like `550e8400-e29b-41d4-a716-446655440000`. **No code parses IDs by prefix to extract type** — verified by grep for `id.startsWith(`, `split('-')`, `match(/piece-/)` patterns. Confirmed safe.

### Collision risk

`crypto.randomUUID()` v4: ~5×10^36 possible values. Practical collision = 0 even with batch operations.

`Date.now()-${random_4_chars}` v4: collisions possible if two ops happen in same ms with random collision. Documented in BUG-11-state inventory entry.

### Persistence

Existing `.openclo` saved projects have IDs in old format. These don't need migration — IDs are opaque strings, both formats work as identifiers. New entities created post-canonical use UUID format. Mixed-format IDs in the same project are observable but functional.

### Tests

Project tests use IDs returned from generators (not hardcoded specific IDs). Verified by grep for hardcoded `piece-` or `seam-` patterns in test files. Some test files DO hardcode IDs (e.g., `linkedEditingMiddleware.test.ts` uses `'a'` and `'b'` as piece IDs in `addPiece(makePiece('a', 'Left'))`). Those still work — the canonical doesn't restrict hardcoded test IDs, it just changes what generators return.

---

## 4. Files to touch

### Helper refactoring (5 files)

1. `src/utils/ids.ts` — **new file**, exports `newId()`.
2. `src/utils/pathHelpers.ts` — `uid` and `lineId` → wrappers around `newId()`.
3. `src/utils/patternOps.ts` — local `uid(prefix)` → wrapper, remove counter.
4. `src/copilot/action/tools/definitions/patternOpsTools.ts` — local `uid(prefix)` → wrapper.
5. `src/utils/seamly2d/seamlyAdapter.ts` — local `uid(prefix)` → wrapper, remove counter.

### Inline pattern replacement (~12 sites in ~6 files)

6. `src/copilot/providers/ollama.ts` — 2 sites.
7. `src/copilot/action/tools/definitions/uiBridgeTools.ts` — 2 sites (1 of them Class B, leave alone with comment).
8. `src/copilot/action/tools/definitions/simulationTools.ts` — 1 site.
9. `src/copilot/action/tools/definitions/seamTools.ts` — 1 site.
10. `src/copilot/action/tools/definitions/patternOpsTools.ts` — 3 sites.
11. `src/store/editorSlice.ts` — 1 site (clone).
12. `src/store/projectSlice.ts` — 3 sites (all clone-related, same shape).
13. `src/store/simulationSlice.ts` — 1 site (Class B, leave alone with comment).
14. `src/store/copilotUISlice.ts` — 1 site (consider: it has its own counter `nextId++` for fast generation; UUID may be acceptable since collision risk is what motivated the counter).
15. `src/store/constructionSlice.ts` — 1 site (uses internal counter — same call as `seamlyAdapter.uid` shape; consider: counter may be load-bearing for ordering, audit before replacement).

### Documentation

16. `CLAUDE.md` — add a short paragraph under "Common Tasks" or "Architecture Notes" documenting the canonical ID generator.

### Test files — review only

Verify tests still pass after refactor. No test changes expected unless tests assert specific ID shapes (none found in grep).

---

## 5. Honest scope flag — S vs M

The drift inventory's classification doc marked B11-state as **size S**. The investigation reveals:

- **5 helper implementations** to refactor (S each, but 5 of them).
- **~50 callsites** total to verify post-refactor.
- **~12 inline patterns** to replace site-by-site (at least 4 are Class B and stay).
- **1 new file** + **1 doc update**.

This is **closer to M than S.** The inventory underestimated scope by counting only the store/ slice (which had the visible 3 ID patterns) without grepping the full project.

### Options for handling the calibration

**Option I — Treat as a single M and proceed.** One commit, all 5 helpers + all inline patterns + new file + CLAUDE.md doc. Verify with full suite + lint + typecheck.

**Option II — Split into 2 sequential S commits.**
- B11-state-helpers: just the 5 helper refactors + new `ids.ts` + CLAUDE.md doc. Leaves inline patterns untouched.
- B11-state-inline: replace inline `Date.now()` patterns site-by-site. Lands as a separate small commit.

**Option III — Limit canonical scope to helpers only.** Refactor the 5 `uid` implementations as wrappers. Leave inline patterns to be addressed when those sites are touched for other reasons. Records the canonical without forcing migration of every existing pattern.

### My recommendation

**Option II.** Two sequential commits, each S-sized, mechanical. The first establishes the canonical and refactors helpers; the second is straightforward find-and-replace for inline patterns with auditable scope. Confidence high.

Option I is also acceptable but 30+ files in one commit raises code-review difficulty. Option III is the lazy path — establishes canonical without enforcing it; high collision risk on any new inline `Date.now()` pattern that someone adds in the future.

---

## 6. Verification gate per commit (per Sam's rules)

For each commit:

```bash
npx tsc -b --noEmit                # the correct command per CLAUDE.md
npm run test                       # full vitest suite
npm run lint                       # eslint --max-warnings=0
```

Expected: clean tsc/lint OR `npm run test` failures matching only the 4 known seamly2d/cdtMesher flakes (#620, #621, #622, #628 in epic #623). Any new failures = stop and surface.

Pre-commit hook will fail until #627 is resolved. That blocks each B11-state commit unless I bypass with `--no-verify` (per the same authorization pattern as docs commits) or fix #627 first.

---

## 7. Questions for Sam

1. **Option I / II / III** for handling the calibration?
2. **`--no-verify` authorization** — same pattern as docs commits? Or wait for #627 to be fixed first?
3. **Class B IDs** — confirm we leave `pin_${vertexIndex}`, `ann_${text}`, `offset-${parent}` untouched? My read is yes (different concern, B10-state territory).
4. **Counter-based IDs in `copilotUISlice.ts:150` and `constructionSlice.ts:39`** — both use local module counters. Replacing with UUID preserves uniqueness but loses ordering-by-counter. Verify counter ordering isn't load-bearing somewhere downstream?

---

## 8. What does NOT follow from this doc

- No code touched yet.
- No new issues opened.
- No commit attempted yet.

---

## 9. Investigación post-respuesta de Sam — load-bearing analysis (2026-04-28)

Sam decidió **Option I (single commit M)** y pidió investigar Q4 antes de incluir los 2 counter-based IDs en el scope. La investigación expandió el alcance: además de los 2 counter-based IDs, el codebase tiene **5 sitios que sortean entidades por ID** y deben verificarse contra UUID-migration safety.

### Q4 — Counter-based IDs en `copilotUISlice.ts:150` y `constructionSlice.ts:39`

**`copilotUISlice.generateId(prefix)` — counter NOT load-bearing.**

Consumidores investigados:
- 4 callsites internos: `addHighlight`, `showToast`, `logAction`, `showConfirmation`. Todos populán entidades con un `timestamp: number` explícito (`copilotUISlice.ts:170, 216, 260, 312`).
- Tests (`copilotUISlice.test.ts`) acceden por `[0]` (array insertion order, no por ID-derived order) o por filtros (`.filter(h => h.id === ...)`).
- Cero `.sort()` operations sobre highlights/toasts/logs/confirms en cualquier archivo.
- Cero consumers que asuman incrementalidad del counter.
- **Veredicto:** counter purely para colisión-avoidance same-ms. Migrar a UUID es safe.

**`constructionSlice.cid(prefix)` — counter NOT load-bearing.**

Consumidores investigados:
- 4 callsites internos: points (pt), lines (ln), curves (cv), construction-points (cp).
- Cero `.sort()` operations sobre `points`/`lines`/`curves` arrays en `src/store` ni `src/utils/construction`.
- Pieces con orden están en arrays de `CPiece` (`points: CPoint[]`); insertion order = construction execution order. ID format no afecta.
- Cross-references entre points (e.g., `definition.basePoint === id`) son equality checks — funcionan con cualquier string format.
- **Veredicto:** counter purely para colisión-avoidance same-ms. Migrar a UUID es safe.

### Hallazgo expandido — 5 sort-by-ID sites operando sobre entidades del audit

| Sitio | Función | Propósito | UUID-safe? |
|---|---|---|---|
| `src/utils/cloth/seamAssembly.ts:381` | `comparePieceId(a.id, b.id)` → `localeCompare` | Sort para binary search en `findPieceOffsetById` | **Yes** — sort estable sobre cualquier string format |
| `src/utils/export/cuttingLayout.ts:185` | `compareById(a.id, b.id)` → `localeCompare` | Sort para binary search en `findPieceById` | **Yes** — same shape |
| `src/utils/nesting/nestingEngine.ts:279` | `getPriority(a.id) - getPriority(b.id)` | `getPriority` lookup en `placementRules[pieceId]` map; ID es key, no se parsea | **Yes** — ID es key plano de map |
| `src/utils/seamly2d/seamlyAdapter.ts:48` | `a.id.localeCompare(b.id)` | Sort para binary search en `findPointById` (sobre CPoint, no pieces) | **Yes** — same shape |
| `src/hooks/useParametricEngine.ts:99` | `a.id.localeCompare(b.id)` | Sort para binary search en `findPieceById` (parametric overrides) | **Yes** — same shape |

**Pattern:** todos los sort-by-ID sites existen para *enable binary search lookups* (O(log n) en lugar de O(n) `.find()`). Ninguno depende de ordering chronological. Cualquier sort estable sobre strings funciona. UUID-format IDs sortean determinísticamente vía `localeCompare` igual que los formatos actuales.

**Verificación adicional:** ningún codepath parsea IDs por prefix (`id.startsWith('piece-')`, `id.split('-')`, etc.). Verificado por grep exhaustivo.

### Resultado consolidado

**Todos los counter-based, `Date.now()`-based, y format-prefixed IDs migran safe a UUID.** Ninguna excepción out-of-scope detectada. La migración preserva:

- Equality lookups (cualquier string funciona).
- Sort-by-ID + binary search (UUIDs sortean estable lex).
- Cross-references por ID en construction graph (equality).
- Display order en arrays Redux (insertion order, no ID-derived).
- Timestamps explícitos para chronological ordering (existen como campos separados).

**Cambia observable:** el formato visible de los IDs en Redux DevTools, logs, archivos `.openclo`. No hay efecto funcional.

### Sin issue de follow-up por counters

Sam's directive was: si counter es load-bearing, sacar del scope + abrir issue de follow-up. Investigación dice: **NO es load-bearing**, así que ambos counters entran al scope normal de B11-state. Sin follow-up issue requerida.

### Scope final consolidado

- 5 helper refactors (4 internos + 1 export) → wrappers around `newId()`.
- ~12 inline patterns Class A → `newId()`.
- 4 Class B sites (composite IDs encoding state) → preservados con comentario explicativo.
- 2 counter-based helpers (copilotUISlice, constructionSlice) → migrar a UUID, dropping counters.
- 1 nuevo `src/utils/ids.ts`.
- 1 update `CLAUDE.md`.

Total ~15-18 archivos tocados. **Confirmado M, pero todo mecánico find-and-replace sin decisiones por sitio.** Single commit per Option I.

---

---

## 10. Re-investigación post-Fase-3-stop (2026-04-28)

Sam aprobó Fase 3 single commit M. Mid-fix encontré que mi investigación original subestimó scope. Stoppé, reseté working tree, y ejecuté re-investigación con metodología expandida que el propio Sam pidió que documente.

### Metodología expandida (anotar en CLAUDE.md o aquí)

Mi grep original buscaba `function uid|export function uid|const uid =` — específico al nombre `uid`. Eso fue el bug metodológico. Para futuros ejes que spanean naming conventions, el grep correcto es sobre el **primitive subyacente**, no el canonical name:

```bash
# Method 1 — Date.now() en template literals (cualquier ID timestamp-based)
grep -rn "\`[^\`]*\${Date\.now()" src --include="*.ts" --include="*.tsx" | grep -v test

# Method 2 — Counter increments at module level (cualquier ID counter-based)
grep -rn "^let [a-zA-Z_][a-zA-Z_0-9]* = 0" src --include="*.ts" --include="*.tsx" | grep -v test

# Method 3 — Tests asserting prefix format (detecta load-bearing por test)
grep -rn "toMatch.*\^[a-z][a-z_-]*-" src --include="*.test.*"

# Method 4 — Existing canonical callsites (verify completeness)
grep -rn "crypto\.randomUUID()" src --include="*.ts" --include="*.tsx"
```

**Anotación clave:** axis counts en el inventario inicial son **lower bounds**, no upper bounds. Esperar 1.5–3x del estimate cuando el axis spanea naming conventions.

### Findings completos — 17 helpers, no 5

| # | File:Line | Helper | Class | Razón |
|---|---|---|---|---|
| 1 | `pathHelpers.ts:3` | `uid()` | **B** | `pieceBuilder.test.ts:63` asserts `^piece-/` |
| 2 | `pathHelpers.ts:4` | `lineId()` | A | No tests find consumers |
| 3 | `patternOps.ts:24` | `uid(prefix)` | A | No prefix-asserting tests |
| 4 | `patternOpsTools.ts:14` | `uid(prefix)` | A | No prefix-asserting tests |
| 5 | `seamlyAdapter.ts:96` | `uid(prefix)` | A | No prefix-asserting tests |
| 6 | `copilotUISlice.ts:150` | `generateId(prefix)` | A | Verified non-load-bearing earlier |
| 7 | `constructionSlice.ts:37-39` | `cid(prefix)` | A | Verified non-load-bearing earlier |
| 8 | `planTypes.ts:170` | `genPlanId()` | **B** | `planTypes.test.ts:24-25` asserts `^plan-\d+-\d+$` |
| 9 | `planTypes.ts:178` | `genStepId()` | **B** | `planTypes.test.ts:35-36` asserts `^step-\d+-\d+$` |
| 10 | `preferenceLearner.ts:109` | `genOverrideId()` | A | No tests |
| 11 | `suggestionEngine.ts:350` | `genSuggestionId()` | A | No tests |
| 12 | `designLog.ts:67` | `genEntryId()` | A | No tests |
| 13 | `GradingTab.tsx:50` | `generateId()` (local) | A | No tests |
| 14 | `dartEntity.ts:13` | `dartId()` | A | No prefix-parse consumers; tests use hardcoded fixtures (not asserting helper output) |
| 15 | `grainLine.ts:10` | `glId()` | A | Same as dartId |
| 16 | `bomExtractor.ts:130-132` | `nextId(prefix)` + reset | **B** | `_idCounter = 0` reset implies deterministic re-extraction is the contract |
| 17 | `exportAAMA.ts:22` | `nextHandle()` | **B** | DXF AAMA/ASTM format: entity handles must be valid hex strings. UUID violates spec. |

**Class A helpers: 12. Class B helpers: 5** (preservados, comentario referenciando B10-state).

### Findings completos — 60 inline sites, ~33 entity-IDs

Los 60 sites de `Date.now()` en template literals se dividen:

**Filenames (NOT IDs, OUT OF SCOPE):** 4 sites
- `Viewport3D.tsx:349, 409` (download filenames).
- `ExportDialog.tsx:73, 116` (export filenames).

**Display names (NOT IDs, OUT OF SCOPE):** 3 sites
- `useRectangleTool.ts:84` `Rect ${...}` (piece name).
- `usePenTool.ts:131, 193` `Piece ${...}` (piece names).

**Class B inline (state-encoding):** 5 sites
- `uiBridgeTools.ts:53` — `ann_${Date.now()}_${params.text}` (text encoded).
- `simulationSlice.ts:322` — `pin_${Date.now()}_${vertexIndex}` (vertex idx encoded).
- `patternOpsTools.ts:477` — `offset-${piece.id}-${Date.now()}` (parent piece id).
- `projectSlice.ts:1013` — `${piece.id}-clone-${Date.now()}` (parent piece id).
- `autoSew/index.ts:165` — `auto-seam-${Date.now()}-${idx}` (rank index — Class B by precaution).

**Class B by test (NEW finding — load-bearing per test format assertion):** 2 sites
- `ollama.ts:175` — `ollama-${Date.now()}-${random}` — `ollama.test.ts:128` asserts `^ollama-/`.
- `ollama.ts:200` — same.

**Class A inline (migrate to `newId()`):** ~30 sites
- `uiBridgeTools.ts:84`, `simulationTools.ts:227`, `seamTools.ts:141`.
- `patternOpsTools.ts:143, 409`.
- `editorSlice.ts:225`.
- `projectSlice.ts:512, 978, 1146`.
- `useGrainlineTool.ts:23`, `useMeasureTool.ts:298`, `useSegmentSewingTool.ts:335`, `useTopstitchTool.ts:138`, `useNotchTool.ts:86`, `useScissorsTool.ts:166`, `useLineTool.ts:54`.
- `PatternEditor.tsx:142, 160, 202, 482`.
- `UnifiedBarChat.tsx:118, 128, 134`.
- `SnapshotBar.tsx:36`.
- `TemplateLibrary.tsx:120`.
- `useAvatarTape.ts:88`.
- `Sew3DTool.tsx:221`.
- `CollisionBodyPanel.tsx:37`.
- `PatternExplorerView.tsx:75`.
- `FileExplorerView.tsx:125`.
- `TrackList.tsx:54`.
- `ProjectView.tsx:198, 253`.

### Tests asserting ID format — 4 critical

| Test | Assertion | Implications |
|---|---|---|
| `planTypes.test.ts:24-36` | `^plan-\d+-\d+$`, `^step-\d+-\d+$` | genPlanId/genStepId are Class B by test |
| `copilotIntegration.test.ts:212` | `^plan-/` | Confirms plan format is contract |
| `ollama.test.ts:128` | `^ollama-/` | ollama inline IDs are Class B by test |
| `pieceBuilder.test.ts:63` | `^piece-/` | pathHelpers.uid is Class B by test |

**4 tests would need updating** if these were migrated. Per Sam's directive, format-asserting tests = "tests del comportamiento, no del bug". Cannot migrate silently.

### Final consolidated scope

**Class A — migrate to `newId()`:**
- 12 Class A helpers (refactor to wrappers).
- ~30 Class A inline sites.
- 1 new file `src/utils/ids.ts`.
- 1 CLAUDE.md update.
- ~25-30 files touched.

**Class B — preserve with comment + B10-state flag:**
- 5 Class B helpers (planTypes×2 + bomExtractor + exportAAMA + pathHelpers.uid).
- 5 inline composite-encoding (uiBridgeTools, simulationSlice, patternOpsTools, projectSlice, autoSew).
- 2 inline Class-B-by-test (ollama×2).

**Out of scope of B11-state entirely:**
- 4 filenames (not entity IDs).
- 3 display names (not entity IDs).

### Open question for Sam — pathHelpers.uid

`pathHelpers.uid()` is the single most-called ID generator in the project (39+ callsites in copilot/ + utils). Test `pieceBuilder.test.ts:63` asserts `^piece-/`. Two interpretations:

1. **The test is verifying behavior**: someone wanted IDs to start with `piece-` for filtering/debugging. → Class B, do not migrate. → 39+ Class A inline sites that consume uid() also stay timestamp-based, since uid() doesn't migrate.

2. **The test is a remnant of bug-coverage**: `^piece-/` is what the helper happens to produce, the test was written to lock the current shape, but no production code depends on the prefix. → Class A, migrate. → Test gets updated to assert UUID shape.

**Cannot decide alone.** Per your directive, test asserting format = stop and ask. Either:
- Sam decides interpretation (1) or (2).
- Sam clarifies whether prefix-by-debug-readability is load-bearing in this codebase (matches the rationale he applied to the planner/suggestions counter helpers).

**My inclination:** interpretation (2) — test was written to lock the shape but no production code parses the prefix. The 39+ callsites of `uid()` use it as opaque identifier. The benefit of canonicalizing is real; the cost (update one test) is small.

### Open question for Sam — planner/suggestions/perception helpers

`genPlanId`, `genStepId` have explicit format-asserting tests. `genOverrideId`, `genSuggestionId`, `genEntryId` have NO tests but are debug-readable in similar subsystems (planner, suggestions, perception). Sam earlier flagged: "debug-readability puede ser load-bearing en sí misma. Si alguien filtra logs por prefix `plan-` para ver solo IDs de plan, eso es consumer del formato."

Consistent treatment options:
- **All 5 stay Class B** (preserve shape, debug-readability is contract). Conservative.
- **Only the 2 with explicit tests stay Class B** (genPlanId/genStepId), the other 3 migrate. Less conservative.
- **All 5 migrate** with explicit log-format check (test that no log line patterns parse `plan-` prefix). Most aggressive.

**Cannot decide alone.** Sam's earlier directive: "verificá específicamente: (a) hay logs/observability que parsea esos prefijos, (b) hay tests que assertan formato, (c) Redux DevTools workflow asume legibilidad humana."
- (a) Did not find any log-parsing of prefixes — but did NOT do exhaustive grep on log/console patterns.
- (b) For genPlanId/genStepId yes (planTypes.test.ts). For others no.
- (c) Cannot programmatically verify — depends on dev habits.

### Updated size estimate

- ~25-30 files touched.
- ~12 Class A helpers refactored.
- ~30 Class A inline sites migrated.
- ~10 Class B sites preserved with comments.
- 4 Class B-by-test sites preserved (or migrated with test updates if Sam clears).
- 1 new file + 1 CLAUDE.md update.
- **L→XL.** Single commit XL is feasible per Sam's earlier rejection of fragmentation.

### Decisions needed from Sam before re-arrancar Fase 3

1. **`pathHelpers.uid` interpretation** (1) or (2)?
2. **planner/suggestions/perception helpers** — all 5 Class B? Only 2? All 5 migrate with test updates?
3. **Confirm `auto-seam-${idx}`** as Class B (idx encodes rank position)?
4. **Confirm size XL** (~25-30 files) for single commit?

### What I will NOT do without Sam's verde

- Touch any code.
- Open follow-up issues for the discovered scope expansion (those would compete with the unified migration if some Class B helpers turn out to need their own treatment).
- Pre-empt the 4 decisions above.

---

**FIN re-investigación. Esperando respuestas para arrancar Fase 3 con scope confirmado.**
