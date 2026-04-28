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

**FIN. Esperando aprobación final del canónico para arrancar Fase 3 migración.**
