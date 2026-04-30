# Drift Fase 2 — B10-state Par 2: `avatar.measurements` vs `parametric.baseMeasurements` (ratification)

**Fecha:** 2026-04-30
**Eje:** B10-state, Par 2 (sub-eje del eje "fuentes de verdad superpuestas").
**Categoría inventario:** (b) decisión producto/arq.
**Estado:** PROPUESTA. Ratification doc — cierre por **misclassification, no drift**. Cero cambio de código.

**Branch:** `drift/b10-state-par2-measurements-ratification`.
**Cross-ref inventario:** `docs/reports/2026-04-28-drift-inventory-fase1.md` → B10-state.
**Cross-ref clasificación:** `docs/reports/2026-04-28-drift-fase2-classification.md` → eje (b).
**Cross-ref Par 1 (separado):** B10-state Par 1 (`pieces[].fabricId` vs `simulation.pieceFabrics`) en branch dedicada `drift/b10-state-superposed-truth`.

---

## Sección 1 — Decide / NO decide

### Decide en este eje

1. **Clasificación final:** `avatar.measurements` y `parametric.baseMeasurements` **NO son fuentes de verdad superpuestas**. Son campos con rol semántico distinto que coexisten intencionalmente.
2. **Cierre:** ratification (no canonical, no Fase 3 code change).
3. **Anchoring del finding:** anotar la inventory y opcional addendum con la corrección.

### NO decide en este eje

1. **Recomputación vs snapshot de `parametric.baseMeasurements`.** El campo es snapshot al momento de `activateTemplate`; si avatar.measurements cambia después, baseMeasurements queda con el valor del template seleccionado. **Probable comportamiento correcto** (ver Sec 4) pero capturado como deuda técnica para evaluación futura.
2. **Par 1** (`pieces[].fabricId` vs `simulation.pieceFabrics`). Branch separada, scope distinto, decoupled timing.
3. **Refactor del shape de `BodyMeasurements`** o de `useParametricEngine`. Out-of-scope; el comportamiento actual es el ratificado.

### Por qué importa la línea

Sin la ratification explícita, alguien que haga un sweep similar en 6 meses verá los dos campos con "measurements" en el nombre y re-investigará desde cero. Este doc evita ese costo: el patrón ya está investigado, los roles documentados, y los reopen triggers nombrados.

---

## Sección 2 — Estado actual: roles distintos

### 2.1 Origen y motivación

| Campo | Slice | Origen (commit) | Motivación |
|---|---|---|---|
| `avatar.measurements` | `project.avatar` | `3671de9d` "v0.1.0 init" | Body measurements del usuario/cuerpo |
| `parametric.baseMeasurements` | `parametric` | `e476c716` "feat(#19): parametric sliders — Redux state, debounced engine, size-table ranges" | Snapshot del SIZE base del template paramétrico activo |

`avatar.measurements` precedió a `parametric.baseMeasurements` por meses (v0.1.0 → feature parametric posterior). El segundo NO reemplazó al primero — fue introducido para **otro propósito**.

### 2.2 Setter de `parametric.baseMeasurements`

`src/store/parametricSlice.ts:49-68` (action `activateTemplate`):

```ts
activateTemplate(
  state,
  action: PayloadAction<{
    pattern: SeamlyPattern;
    measurements: BodyMeasurements;
    size: StandardSize | null;
    sizeSystem: SizeSystem;
    resolvedVariables: Record<string, number>;
    pieceIds: string[];
  }>,
) {
  const { pattern, measurements, size, sizeSystem, resolvedVariables, pieceIds } = action.payload;
  state.activePattern = pattern;
  state.baseMeasurements = measurements;  // ← single setter
  ...
}
```

**Single dispatcher** del action: `src/hooks/useParametricEngine.ts:323`. El caller computa `measurements` vía `buildMeasurements(newSize, sizeSystem)` (`useParametricEngine.ts:300`) — son **medidas del SIZE seleccionado del catálogo del template**, NO copia de `avatar.measurements`.

Ejemplo concreto: usuario tiene `avatar.measurements.chest = 92` (medida del cuerpo). Activa template con tabla EU/M (88cm chest base). Después de activar:
- `avatar.measurements.chest` = 92 (sin cambio).
- `parametric.baseMeasurements.chest` = 88 (size del template).

**No son duplicados.** Son cosas distintas.

### 2.3 Sync mechanism — fallback explícito (NO sync)

`src/store/reactiveSolverMiddleware.ts:235`:

```ts
const measurements = reduxState.parametric.baseMeasurements || reduxState.project.avatar.measurements;
```

**No es sync; es fallback del template-active vs body.** El reactive solver usa:
- `parametric.baseMeasurements` cuando hay template paramétrico activo (medidas del size base del template).
- `avatar.measurements` cuando no hay template activo (medidas del body).

Esto **ratifica estructuralmente el dual purpose**: los dos campos coexisten porque cada uno es la fuente de verdad para un contexto distinto.

### 2.4 Consumers

- `avatar.measurements`: ~30+ sitios (copilot tools, exports, hooks, components, reactiveSolver fallback).
- `parametric.baseMeasurements`: 4 sitios concentrados (reactiveSolver fallback + `useParametricEngine.ts` 4-5 lecturas para sizing computations del template activo).

### 2.5 Tests asserting

- `src/__tests__/store.test.ts:127,129,135,139` — asserta lectura/escritura de `avatar.measurements`.
- `src/store/__tests__/parametricSlice.test.ts:53` — asserta `baseMeasurements` después de `activateTemplate`.

Tests assert distintas invariantes. **Migración total a un único campo invalida tests reales.**

---

## Sección 3 — Por qué NO es drift

El inventario lo clasificó como "fuente de verdad superpuesta" basándose en la similitud textual de los nombres (`measurements` aparece en ambos). El sweep revela:

- **Origen distinto**, en commits separados con motivación documentada.
- **Roles JSDoc/contextual distintos** (body measurements vs template size snapshot).
- **Setter único** para `parametric.baseMeasurements` (no escritura paralela divergente).
- **Sync explícito como fallback**, no como mirror — `reactiveSolverMiddleware.ts:235` es el ratificación estructural del dual purpose.
- **Tests distintos** que assert invariantes ortogonales.

Esto es **misclassification del inventario**. Patrón observado por cuarta vez en el audit (precedentes: C7 custom pan, B12-state NEW_PROJECT registry, B5-state factory pattern, D1-cosmetic 3 casings).

### 3.1 Cuál sería el shape de drift real (para futuro reopen)

Si emergiera alguno de los siguientes, B10-state Par 2 reabriría:

1. **Escritura paralela divergente**: si un nuevo sitio empezara a escribir `parametric.baseMeasurements` fuera de `activateTemplate` (e.g., directamente desde un componente o tool sin coordinación). Eso indicaría que el campo dejó de ser snapshot single-source y volvió a ser duplicate del usuario.
2. **Lectura cruzada inconsistente**: si un sitio leyera `avatar.measurements` en lugar del fallback `parametric.baseMeasurements || avatar.measurements`, en contexto donde hay template activo. Eso indicaría que el rol semántico se perdió y los dos campos se trataban como intercambiables.
3. **Setter de `avatar.measurements` que también escribe `parametric.baseMeasurements`**: indicaría sync forzado, contradiciendo el rol "snapshot del template".

Ninguno de los tres existe en el codebase actual. El sweep sweep cerró clean.

---

## Sección 4 — Deuda técnica explícita

### 4.1 Recompute vs snapshot

`parametric.baseMeasurements` es **snapshot** al momento de `activateTemplate`. Si después el template del catálogo cambia (e.g., tabla EU se actualiza con nuevas medidas), o si el `sizeSystem` global cambia post-activación, `baseMeasurements` queda con el valor stale del momento de selección.

**Probable comportamiento correcto:**
- Snapshot preserva la "vista del template al momento de selección" — útil para reproducibility.
- Recompute introduciría re-renders cascading cada vez que el catálogo se actualice.

**Pero NO es decisión cementada.** Si emerge un caso real donde el snapshot causa stale (e.g., usuario reporta "cambié el size pero el slider sigue mostrando viejos defaults"), reabrir esta sub-decisión.

**Acción:** documentar como deuda técnica, NO action item inmediato. Reopen trigger nombrado.

### 4.2 No deuda adicional

Sin lint rule, sin migration pendiente, sin refactor diferido. El comportamiento actual queda ratificado as-is.

---

## Sección 5 — Cross-refs y reopen triggers

### 5.1 Inputs

- `docs/reports/2026-04-28-drift-inventory-fase1.md` (entrada B10-state, Par 2 mencionado).
- `docs/reports/2026-04-28-drift-fase2-classification.md` (clasificado como (b)).
- `src/store/parametricSlice.ts:49-68` (single setter).
- `src/store/reactiveSolverMiddleware.ts:235` (fallback structural ratification).
- `src/hooks/useParametricEngine.ts:300-330` (single dispatcher con measurements computadas).

### 5.2 Outputs

- Inventory annotation post-merge: B10-state Par 2 cerrado vía misclassification.
- Par 1 (branch `drift/b10-state-superposed-truth`) decoupled — distinto scope, distinto timing.

### 5.3 Reopen triggers (Sec 3.1 reformulado)

Reabrir B10-state Par 2 si:

1. Aparece escritura paralela divergente de `parametric.baseMeasurements` fuera de `activateTemplate`.
2. Aparece lectura cruzada inconsistente que ignore el fallback `parametric.baseMeasurements || avatar.measurements` cuando hay template activo.
3. Setter de `avatar.measurements` empieza a propagarse a `parametric.baseMeasurements`.
4. Caso real de stale-after-template-update reportado (sub-decisión 4.1 reabre).

---

**FIN DEL DOC.** Cierre por ratification: zero código, zero migration, zero Fase 3.
