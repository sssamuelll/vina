# Drift Fase 2 — B10-state Par 1: `pieces[].fabricId` vs `simulation.pieceFabrics` (hybrid scope)

**Fecha:** 2026-04-30
**Eje:** B10-state, Par 1 (sub-eje del eje "fuentes de verdad superpuestas").
**Categoría inventario:** (b) decisión producto/arq.
**Estado:** PROPUESTA. Hybrid scope — UI ratification + copilot migration. Esperando review de Sam.

**Branch:** `drift/b10-state-superposed-truth`.
**Cross-ref Par 2 (closed):** `docs/reports/2026-04-30-drift-fase2-b10state-par2-measurements-ratification.md` (PR #660 merged) — precedent del shape ratification + reopen triggers.
**Cross-ref clasificación:** `docs/reports/2026-04-28-drift-fase2-classification.md` → eje (b).
**Cross-ref inventario:** `docs/reports/2026-04-28-drift-inventory-fase1.md` → B10-state.

---

## Sección 1 — Decide / NO decide

### Decide en este eje

1. **Hybrid scope ratificado.** El sweep revela que el inventario lo malclasificó como "kill the legacy"; la realidad es:
   - **UI surfaces** (`MaterialTab.tsx`, `SimulationView.tsx`): transient sim-only by design. **Ratify** con JSDoc + section CLAUDE.md.
   - **Copilot tools** (`fabricTools.applyFabricToPiece` rollback, `actionExecutor.set_fabric` legacy): transient writes que **violan user intent silently**. **Migrate** a persistent.
2. **Action canonical para copilot persistent writes:** `project/setPieceFabric` single-field action (Opción β). Naming alineado con `setFabricCode` existente (precedente simétrico).
3. **JSDoc explícito en `simulation.setFabric`** documentando transient nature + cross-ref a `setPieceFabric` para persistent writes.
4. **Sección CLAUDE.md "Fabric assignment patterns"** documentando el contrato: `project.fabricId` = source-of-truth, `sim.pieceFabrics` = transient cache, `useColorwaySync` = sync project→sim.

### NO decide en este eje

1. **Schema migration de pieces persistidas.** `project.fabricId` ya existe en el shape de `PatternPiece`; sin cambio de storage format. Pieces persistidos pre-migration siguen funcionando.
2. **Behavior de `useColorwaySync`.** El sync hook queda igual (project + colorway → sim). Migration solo cambia el target de copilot writes; el sync sigue cubriendo el flow.
3. **Rendering pipeline.** Sin cambio. Lectura de `sim.pieceFabrics` sigue siendo la fuente para sim runtime; solo cambia la fuente de la escritura inicial (de `setFabric` directo a `setPieceFabric` + sync hook propaga).
4. **`pieces[].fabricCode`.** Distinct semantic role (production code SELF/LINING para BOM/DXF), out-of-scope. Ratificado en doc previo.
5. **`updatePiece`-shape rollback** (full snapshot). Descartado en favor de Opción β; ver Sec 3.1.
6. **MaterialTab.tsx / SimulationView.tsx UI behavior.** No se migra; el comportamiento transient es feature.

### Por qué importa la línea

Sin la distinción explícita, alguien futuro puede asumir que B10-state ratifica "todo escribe a project" o "todo escribe a sim". El intent real es: **persistent writes van a project, transient previews van a sim, sync hook resuelve la propagación**. Documentar la línea evita que un nuevo dev mezcle los patrones por accidente.

---

## Sección 2 — Estado actual

### 2.1 Roles legítimos (ratification estructural)

| Field | Slice | Origen | Rol semántico |
|---|---|---|---|
| `pieces[].fabricId` | `project` | `3671de9d` v0.1.0 | **Source-of-truth.** Persistent fabric assignment del piece. Persiste con el project. |
| `simulation.pieceFabrics: Record<pieceId, fabricId>` | `simulation` | `2228e622` XPBD/agent | **Transient cache.** Override-able por colorway, preview-friendly, no persistido. |
| `pieces[].fabricCode` | `project` | (related but out-of-scope) | Production code (SELF/LINING) para BOM/DXF. NO drift. |

**Sync mechanism:** `src/hooks/useColorwaySync.ts:22-46`.

```ts
// Direction: project.fabricId + colorway → sim.pieceFabrics (uni-direccional)
// - Cuando colorway activa: override sim con resolved fabric.
// - Cuando colorway off + sim diverged: restaura sim a piece.fabricId.
```

`useColorwaySync.ts:16-20` documenta el ref pattern para evitar feedback loops:

```ts
// Read pieceFabrics via ref to avoid re-triggering the effect when we dispatch
// setFabric (which updates pieceFabrics). Without this, the effect would run twice
// on every colorway switch: once to apply overrides, once to confirm they're set.
```

**Conclusión estructural:** los dos campos NO son fuentes superpuestas — son **source-of-truth + cache-with-override** con sync uni-direccional. El drift es **inconsistent UI write surface**, no superposición de fuente.

### 2.2 Drift map — 7 write surfaces clasificadas

| Surface | Dispatch | Slice escrito | Intent observado | Acción B10-state |
|---|---|---|---|---|
| `PieceProperties.tsx:96` | `updatePiece({...piece, fabricId, updatedAt})` | project | **persistent** (panel persistent properties con `updatedAt` timestamp) | sin cambio |
| `MaterialTab.tsx:82` | `setFabric({pieceId, fabricId})` | sim | **transient** (top-of-file comment "intentional for quick previews", co-located con tint/opacity/UV/textures) | **ratify** + JSDoc en `setFabric` |
| `SimulationView.tsx:257` | `setFabric({pieceId, fabricId})` | sim | **transient** (sidebar SIMULATION view, sibling de Per-Piece Freeze) | **ratify** + JSDoc en `setFabric` |
| `useColorwaySync.ts:40,42` | `setFabric({pieceId, fabricId})` | sim | **derived sync** (project + colorway → sim) | sin cambio (es el sync mismo) |
| `groupTools.ts:126` + `setGroupFabric` | `setGroupFabric({groupId, fabricId})` | project | **persistent** (group operation, batch) | sin cambio |
| `fabricTools.ts:245,263` (`applyFabricToPiece`) | `setFabric({pieceId, fabricId})` + rollback al setFabric prev | sim | **AMBIGUOUS** — user intent "apply fabric X to piece Y" es persistent; rollback shape sugiere experiment. | **migrate** a `setPieceFabric` |
| `actionExecutor.ts:850,854` (`set_fabric` legacy) | `setFabric` (single + 'all' loop) | sim | **AMBIGUOUS** — same pattern, no rollback | **migrate** a `setPieceFabric` |

### 2.3 Tests — slice-agnostic, migration safe

#### `fabricTools.test.ts` (4 tests para `assignFabric`)

Pattern de asserts (líneas 40-42, 60-61, 77-78, 98-107):

```ts
expect(result.success).toBe(true);                    // visible behavior
expect(mockDispatch).toHaveBeenCalled();              // dispatch happened (ANY action)
expect(result.rollback).toBeInstanceOf(Function);     // rollback exists
result.rollback!();
expect(mockDispatch).toHaveBeenCalled();              // dispatch in rollback
```

**Tests son agnostic to slice.** No assert `state.simulation.pieceFabrics[X] === fabricId` ni equivalente para project. **Migration safe.**

Único cambio en tests: `mockState` (líneas 4-20) actualmente expone `pieceFabrics` en `simulation`. Post-migration el `prevFabricId` se lee de `state.project.pieces.find(p=>p.id===pieceId).fabricId`. mockState necesita exponer `fabricId` en piece object. Cambio trivial ~5 líneas.

#### `toolsE2E.test.ts:290,297` — false positives

Los hits son `getFabricDetails` y `compareFabrics` (read-only tools, no escriben state). 0 asserts E2E sobre target slice de fabric write.

#### `simulationSlice.test.ts:47` — assert `setFabric`

`expect((s = reducer(initial(), setFabric({...}))).pieceFabrics[...])` asserta el reducer de simulation. **Sin cambio** post-migration — `setFabric` sigue existiendo como sim-transient action.

### 2.4 Pre-existing canonical infrastructure (regla 1)

- **`setFabricCode` precedent (projectSlice.ts:1216):** action `project/setFabricCode({pieceId, fabricCode})` ya existe para escribir `pieces[].fabricCode` single-field. **Naming + shape simétrico** con la propuesta `setPieceFabric` de Opción β. No es coincidencia: el codebase ya tiene precedente del shape "single-field setter por field production-relevant".
- **`updatePiece` action:** existe pero requiere full piece object. No es alternativa preferida (ver Sec 3.1).

---

## Sección 3 — Sub-decisiones, opciones y tradeoffs

### 3.1 Action target slice canonical para copilot persistent writes

**Pregunta:** ¿qué action despacha el copilot cuando el user dice "apply fabric X to piece Y"?

#### Opción α — `updatePiece` con full snapshot rollback

```ts
const prevPieceSnapshot = { ...piece };
dispatch(updatePiece({ ...piece, fabricId, updatedAt: Date.now() }));
return {
  ...
  rollback: () => dispatch(updatePiece(prevPieceSnapshot)),
};
```

- **Pros:** usa infraestructura existente (`updatePiece` ya define shape para piece updates), no agrega reducers nuevos.
- **Cons (primary — concurrency-safety):** rollback NO es concurrency-safe. Si entre apply y rollback el usuario edita otras propiedades del piece (outline, name, fabricCode, side, etc.), el rollback sobreescribe esas ediciones con el snapshot apply-time. **El usuario pierde trabajo silently.**
- **Cons (secondary):** rollback shape requiere capturar full piece object (más memory, más fragil si shape de piece cambia).
- **Migration:** 3 callsites con rollback shape change.
- **Cost:** ~3-4h.

#### Opción β — Nueva action `project/setPieceFabric` single-field (RECOMENDADA)

```ts
// Nuevo reducer en projectSlice (~5 líneas)
setPieceFabric(state, action: PayloadAction<{ pieceId: string; fabricId: string | undefined }>) {
  const piece = state.pieces.find(p => p.id === action.payload.pieceId);
  if (piece) {
    piece.fabricId = action.payload.fabricId;
    piece.updatedAt = Date.now();
  }
}

// Callsite (fabricTools.applyFabricToPiece):
const prevFabricId = piece.fabricId;
dispatch(setPieceFabric({ pieceId, fabricId }));
return {
  ...
  rollback: () => dispatch(setPieceFabric({ pieceId, fabricId: prevFabricId })),
};
```

- **Pros (primary — concurrency-safety):** rollback es **concurrency-safe**. Single-field swap preserva ediciones intermedias del usuario. Si entre apply y rollback el user edita outline/name/etc., el rollback solo revierte fabricId; resto se preserva.
- **Pros (secondary):**
  - Naming alineado con `setFabricCode` existente — precedente simétrico (un setter por field production-relevant).
  - Shape minimal del rollback: 2 strings vs full piece object.
  - Action name comunica intent persistent vs el genérico `setFabric` (que queda transient).
- **Cons:** agrega 1 reducer nuevo a `projectSlice` (~5 líneas).
- **Migration:** 1 reducer + 3 callsites + ~5 líneas mockState update + 1 entry en `ACTION_LABELS` undoMiddleware.
- **Cost:** ~2-3h.

#### Opción γ — Overload `setFabric` con flag `{ persistent: boolean }`

```ts
dispatch(setFabric({ pieceId, fabricId, persistent: true }));
```

- **Pros:** ninguno material.
- **Cons:** flag-based dispatch es anti-pattern Redux. Action shape variable según flag (rompe type narrowing, hace tests más confusos, no comunica intent en action type name). **Convención Redux:** actions de shape fija, naming descriptivo del intent. Flag-based polymorphism es smell que se evita por convención.
- **Descartar.**

#### Recomendación 3.1

**Opción β** con confianza alta.

Razones (en orden de importancia):

1. **Concurrency-safe rollback (primary):** preserva ediciones intermedias del usuario. α viola esto silently — el usuario que pide "rollback last action" después de seguir editando pierde trabajo.
2. **Naming alineado con `setFabricCode` existente:** precedente simétrico ya en projectSlice (un setter por field "production-relevant").
3. **Shape minimal del rollback:** 2 strings vs full piece object. Más estable si shape de piece cambia.
4. **Cost mínimo:** 1 reducer + 3 callsites + ~5 líneas test + 1 ACTION_LABELS entry.

**Tradeoff aceptado:** 1 reducer adicional en projectSlice. Cost trivial vs los 4 pros.

---

### 3.2 UI surfaces ratification (MaterialTab + SimulationView)

**Pregunta:** ¿migramos `MaterialTab` y `SimulationView` a `setPieceFabric` también, o ratificamos su comportamiento transient?

#### Opción A — Ratify transient + JSDoc + section CLAUDE.md (RECOMENDADA)

- `setFabric` action (simulationSlice) recibe JSDoc explícito:

```ts
/**
 * Set the fabric for a specific pattern piece in the SIMULATION runtime cache.
 *
 * **Transient by design.** Writes ONLY to sim.pieceFabrics. Used for:
 * - MaterialTab (preview material panel) — quick previews, sibling de tint/opacity/UV.
 * - SimulationView sidebar — simulation tweaks, sibling de Per-Piece Freeze.
 * - useColorwaySync — sync project.fabricId + colorway override → sim.pieceFabrics.
 *
 * **Do NOT use for persistent piece fabric assignment.** Use `project/setPieceFabric`
 * for persistent writes (e.g., copilot tools, programmatic apply). Persistent writes
 * propagate to sim via useColorwaySync.
 */
setFabric(state, action: PayloadAction<{ pieceId: string; fabricId: string }>) {
  state.pieceFabrics[action.payload.pieceId] = action.payload.fabricId;
}
```

- Comment inline en `useColorwaySync.ts` clarificando direction.
- Section CLAUDE.md "Fabric assignment patterns" documentando contrato.

**Pros:** preserva intent UI documentado (MaterialTab top comment "intentional for quick previews"); 0 cambio de comportamiento; discoverability futura sin re-investigación.

**Cons:** ninguno material.

#### Opción B — Migrate UI surfaces a `setPieceFabric` también (DESCARTAR)

Cambiar `MaterialTab.tsx:82` y `SimulationView.tsx:257` para escribir a `project.fabricId`.

- **Cons (primary):** rompe intent documentado. MaterialTab top comment dice "intentional for quick previews". Migrar persiste cada cambio inmediato — el panel deja de ser preview, se vuelve commit. UX cambia silently.
- **Cons (secondary):** los siblings (tint, opacity, UV, emission, textures) siguen siendo transient. Migrar solo fabric crea inconsistencia dentro del propio MaterialTab.
- **Descartar.**

#### Opción C — Dual sink documented (DESCARTAR)

Cada surface declara qué slice escribe sin canonical claro.

- **Cons:** vuelve al problema original — discoverability mala, drift por convención.
- **Descartar.**

#### Recomendación 3.2

**Opción A.** Ratify with documentation.

---

### 3.3 Sync mechanism documentation

**Pregunta:** ¿cómo documentamos el sync uni-direccional `project + colorway → sim` para que un futuro dev no asuma sync bidireccional o sync ausente?

#### Opción A — Inline comments + section CLAUDE.md (RECOMENDADA)

- Comment header en `useColorwaySync.ts:8`:

```ts
/**
 * Syncs project.fabricId + active colorway → simulation.pieceFabrics.
 *
 * Uni-directional: project is source-of-truth, sim is derived cache.
 * Writes to sim that bypass this sync (e.g., MaterialTab preview) are
 * intentional transient overrides; they are restored to project.fabricId
 * when active colorway clears (line 41-42).
 *
 * Not run on every dispatch — useEffect with deps array keyed on
 * activeColorwayId, colorways, pieces, defaultFabricId.
 */
export function useColorwaySync(): void {
```

- Section CLAUDE.md "Fabric assignment patterns": resumen del contrato + diagram-style ASCII del flow + cross-ref a useColorwaySync.

**Pros:** discoverability concentrada cerca del código (header) + índice CLAUDE.md (overview). 0 cambio runtime.

**Cons:** mantenibilidad triple-write si la convención cambia (CLAUDE.md + header + JSDoc). Aceptable para B10-state porque la convención está estable post-ratification.

#### Recomendación 3.3

**Opción A.**

---

### Tabla resumen Sec 3

| Sub-decisión | Recomendación | Migration cost |
|---|---|---|
| 3.1 Action target slice (copilot) | **3.1.β** — `project/setPieceFabric` single-field | 1 reducer + 3 callsites + ~5 líneas test + 1 ACTION_LABEL |
| 3.2 UI surfaces (MaterialTab, SimulationView) | **3.2.A** — ratify transient + JSDoc + CLAUDE.md | 0 código, ~50 líneas docs |
| 3.3 Sync documentation | **3.3.A** — inline comments + CLAUDE.md section | 0 código, ~30 líneas docs |

**Total migration:** 1 reducer + 3 callsites + ~5 líneas test + ~80 líneas docs. Zero behavior change para UI surfaces.

---

## Sección 4 — Recomendación consolidada

Si Sam aprueba 3.1.β + 3.2.A + 3.3.A, los 6 cambios resultantes son:

| # | Cambio | Archivo | Tipo |
|---|---|---|---|
| 1 | Nuevo reducer `setPieceFabric` | `src/store/projectSlice.ts` | reducer (5 líneas) |
| 2 | Migrate `applyFabricToPiece` execute + rollback | `src/copilot/action/tools/definitions/fabricTools.ts:239-269` | dispatch target change |
| 3 | Migrate `set_fabric` legacy action handler | `src/copilot/actions/actionExecutor.ts:847-855` | dispatch target change |
| 4 | Update `mockState` shape para fabricTools tests | `src/copilot/action/tools/definitions/__tests__/fabricTools.test.ts:4-20` | mock update (~5 líneas) |
| 5 | JSDoc en `setFabric` (transient + cross-ref) + comment header en `useColorwaySync` | `src/store/simulationSlice.ts:254`, `src/hooks/useColorwaySync.ts:8` | docs |
| 6 | Section CLAUDE.md "Fabric assignment patterns" | `CLAUDE.md` | docs (~80 líneas) |

**Bonus:** entrada en `undoMiddleware.ts ACTION_LABELS` para `'project/setPieceFabric': 'Change Fabric'` (~1 línea).

---

## Sección 5 — Plan de migración Fase 3

**Nota:** Fase 3 es trabajo separado, no parte de este PR. Lista qué tendría que pasar para implementar el canónico una vez ratificado.

### 5.1 Commit 1 — Reducer + test mock

- Agregar `setPieceFabric` reducer en `src/store/projectSlice.ts`.
- Exportar action.
- Agregar entry en `undoMiddleware.ts ACTION_LABELS`: `'project/setPieceFabric': 'Change Fabric'`.
- Update `mockState` en `fabricTools.test.ts` para exponer `fabricId` en piece objects.

Atomic commit. Tests deben quedar verdes (los existentes son slice-agnostic).

### 5.2 Commit 2 — Migrate copilot callsites

- `fabricTools.ts:239-269`: cambiar snapshot a `prevFabricId = piece.fabricId`, dispatch a `setPieceFabric`, rollback a `setPieceFabric`.
- `actionExecutor.ts:847-855`: cambiar `setFabric` a `setPieceFabric` en single + loop branches.

Atomic commit. Tests verdes.

### 5.3 Commit 3 — Documentation anchoring

- JSDoc en `simulation.setFabric` action (transient + cross-ref a `setPieceFabric`).
- Comment header en `useColorwaySync.ts` (sync direction + intent).
- Section CLAUDE.md "Fabric assignment patterns" (resumen del contrato + 3-surface table + cross-ref a archivos).

Atomic commit (docs-only).

### 5.4 Verificación post-Fase 3

- Tests verdes (`npm run test`, `npm run test:e2e` si toca).
- Manual smoke: cambiar fabric en `PieceProperties` → persiste post-reload. Cambiar fabric en `MaterialTab` → no persiste post-reload (transient). Activar colorway → fabric override aplicado vía `useColorwaySync`. Desactivar colorway → fabric vuelve a `project.fabricId` (vía sync hook).

---

## Sección 6 — Cross-refs y dependencias

### 6.1 Inputs

- `docs/reports/2026-04-30-drift-fase2-b10state-par2-measurements-ratification.md` (PR #660 merged) — precedent del shape ratification + reopen triggers.
- `docs/reports/2026-04-28-drift-inventory-fase1.md` § B10-state.
- `docs/reports/2026-04-28-drift-fase2-classification.md` (eje (b)).
- `src/types/types.ts:54-56` (PatternPiece type fields with JSDoc).
- `src/store/simulationSlice.ts:254-257` (setFabric reducer).
- `src/store/projectSlice.ts:1216` (setFabricCode precedent for naming).
- `src/hooks/useColorwaySync.ts` (sync mechanism).
- B5-state ratificación previa — meta flags convention que ratifica `setFabricCode` shape como precedente.

### 6.2 Outputs

- **Si aprobado:** Fase 3 commits sobre este branch + section CLAUDE.md + inventory annotation post-merge.
- **B10-state cerrado:** ambos pares (Par 1 + Par 2) cerrados. El eje compuesto B10-state queda completo.
- **No outputs hacia E-async-states ni otros (b) pendientes** — scope contenido.

### 6.3 No-conflicts (out-of-scope verificado)

- **`updatePiece` action** sigue existiendo y se usa en otros contextos (PieceProperties.tsx, group operations). Sin cambio.
- **`setFabric` action en simulationSlice** sigue existiendo para UI transient + sync hook. Solo gana JSDoc.
- **Persistencia (B6-state ratified)** no afectada — `pieces[].fabricId` ya es persisted via canonical IDB path.
- **Cascade middleware (B3-state ratified)** no afectada — `setPieceFabric` no es cascade trigger; flow es lineal.

---

## Sección 7 — Reopen triggers

B10-state Par 1 ratificación queda revisable si emerge:

1. **Caso real donde rollback de full piece snapshot es necesario.** Si emerge un escenario donde el copilot apply requiere capturar más fields que solo `fabricId` (e.g., "apply fabric X + automatic outline cleanup"), reabrir 3.1 evaluando si Opción α o un híbrido es más correcto.
2. **UI surfaces nuevas que escriben fabric.** Si surge un componente nuevo que necesita escribir fabric, el doc declara: persistent → `setPieceFabric`, transient → `setFabric`. Si la convención no cubre el caso (e.g., write batched + rollback), reabrir 3.2.
3. **Sync hook bypass pattern emerge.** Si un nuevo flow requiere bypass de `useColorwaySync` (e.g., direct sim write que NO debe ser overridden por colorway), reabrir 3.3 + sync mechanism.
4. **`setFabric` (transient) callsites crecen >5.** El shape "transient sim cache write" es válido pero si emerge inflación de callsites más allá de los actuales (~5), evaluar si todos siguen siendo legítimos transient o algunos confundieron persistencia.
5. **Lint rule custom** que enforce target slice por categoría de surface emerge como necesidad real (e.g., copilot tools que olvidan migrar). Reopen 3.1 evaluando enforcement automático.

---

## Sección 8 — Deuda técnica explícita post-ratificación

1. **`setFabric` transient action sigue siendo público.** Cualquier caller fuera de los 3 surfaces ratificados (MaterialTab, SimulationView, useColorwaySync) puede llamarlo y crear drift nuevo. Mitigación: JSDoc explícito documenta intent. Sin lint rule (deuda → posible follow-up issue).
2. **Rollback de `applyFabricToPiece` con `tint`:** el rollback actual restaura tint también (`prevTint ?? '#ffffff'`). Post-migration sigue igual — tint queda en sim transient porque NO existe equivalente persistent (`pieces[].tint` no existe). Esto es asimetría: fabric persiste, tint transient. Aceptable porque tint es property de render preview, no de garment specification. Si emerge necesidad de "persistent tint" reabrir.
3. **No hay tests E2E que asserten "fabric persiste post-reload" para applyFabricToPiece.** Migration safe sin esos tests pero tests de integración que cubran el flow user→tool→reload→render serían útiles. **Out-of-scope** de B10-state; deuda para test suite expansion.
4. **`updatePiece` para fabric assignment desde UI** (`PieceProperties.tsx:96`) sigue siendo full-piece dispatch. Por consistency con `setPieceFabric` sería más limpio que el panel UI también use `setPieceFabric`. Pero el panel ya escribe múltiples fields (no solo fabric), así que `updatePiece` es coherente para ese surface. Aceptable.

---

## Sección 9 — Decisión pendiente y siguiente paso

### 9.1 Pregunta a Sam

¿Aprobás las 3 sub-decisiones tal como recomendado en Sec 3 (3.1.β + 3.2.A + 3.3.A)?

Si **sí, todo aprobado:**
- Marco PR ready-for-review.
- Sec 4-9 quedan como ratificación final.
- Fase 3 (3 commits: reducer+test → callsites → docs) sobre este mismo branch.
- Inventory annotation post-merge.

Si **alguna sub-decisión querés cambiar:**
- Indicame cuál (3.1, 3.2, 3.3) y qué opción preferís (α/A/B/C).
- Re-edito Sec 4 (recomendación consolidada) con el cambio.
- Re-pusheo.

Si **el scope del eje cambia** (e.g., Sam decide que UI surfaces también migran):
- STOP. Reabro Sec 1 con el scope ampliado.
- Re-evalúo el inventory y opciones.

### 9.2 Estado del PR

- Sec 1-9 ✅ ready.
- PR pending creation (este commit + open PR).
- Pendiente Fase 3 commits (reducer + callsites + docs).

### 9.3 Calibración estimate vs actual

- Estimate Sec 1-9 (Fase 2 doc): ~5-7h. Actual: ~3h. Factor ~0.4-0.6x.
- Causa: investigación adicional (Q3 + caveat tactical) ya cerró la decisión Opción β; la redacción fue mecánica con scope claro.
- **Total esperado Fase 3 (no en este PR):** ~2-3h.

---

**FIN DEL DOC.** Esperando verde de Sam para promover PR a ready-for-review.
