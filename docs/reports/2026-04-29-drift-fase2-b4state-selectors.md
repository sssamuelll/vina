# Fase 2 — B4-state: Selectors / derivaciones

**Fecha:** 2026-04-29
**Eje:** B4-state (selectors export pattern y memoización).
**Categoría:** (a) mecánico, S.
**Scope de este cierre:** bomSlice. Cobertura general de los otros 17 slices con selectors potenciales se difiere como pregunta abierta dentro de este mismo eje (no eje nuevo, no nomenclatura B4b).
**Pre-requisito:** ninguno.

---

## 1. Hallazgo previo al canónico — pre-existing infrastructure

`src/store/selectors.ts` **ya existe desde 2026-03-05** (commit `4b79689` "perf: optimize 2D editor for high-frequency interactions"), 2 meses antes del inventario Fase 1. El inventario lo missed: dijo "0 usos de `createSelector` (reselect)" cuando hay 7 selectores memoizados.

Contenido actual de `selectors.ts`:

```ts
import { createSelector } from '@reduxjs/toolkit';  // RTK re-exporta reselect
export const selectProject = (s: RootState) => s.project;        // root: PLAIN
export const selectPieces  = createSelector(selectProject, p => p.pieces);  // derivation: MEMO
// ... (project + editor + tools, total 7 memos + 3 plain roots)
```

Implicación: el patrón "**plain roots, memoized derivations**" ya existe en el codebase. No hay que decidir si introducir reselect — está adoptado, solo no extendido a bomSlice.

**Crítico — qué NO concluye este hallazgo:** que `selectors.ts` sea canónico transversal. Su origen (commit de optimización del editor 2D) lo plantea como "infra utilitaria de un dominio", no como decisión de arquitectura. Tratarlo como canónico transversal sin Fase 2 deliberada sería ratificación-por-inercia. Lo usamos como **input de patrón de estilo** para alinear bomSlice, sin pre-decidir si todos los demás slices deben migrar.

---

## 2. Drift real verificado

`bomSlice.ts:117–164` — 6 selectors plain (no memoizados, signatures `(state, ...args)`):

| Selector | Signature | Returns | Risk | Consumers |
|---|---|---|---|---|
| `selectBOMEntries` | `(state)` | `BOMEntry[]` (root) | bajo (referencia estable Immer) | 4 (3 tools + BOMTab) |
| `selectBOMByCategory` | `(state, category)` | fresh `BOMEntry[]` (.filter) | latente (sin callers) | **0** |
| `selectTotalCost` | `(state)` | `number` (.reduce) | nulo (primitivo) | 1 tool |
| `selectTotalCostByColorway` | `(state, colorwayId)` | `number` | nulo (primitivo) | 1 tool |
| `selectBOMIsStale` | `(state)` | `boolean` | nulo (primitivo) | 1 component |
| **`selectBOMForColorway`** | `(state, colorwayId)` | fresh `BOMEntryResolved[]` (.map) | **alto, confirmado** | 1 component (`BOMTab.tsx:91` dentro de `useSelector`) |

**Riesgo concreto del inventario confirmado:** `selectBOMForColorway` produce un array fresco por call (`.map`). Está consumido vía `useSelector(s => activeColorwayId ? selectBOMForColorway(s, activeColorwayId) : null)` en `BOMTab.tsx:91`. Cualquier dispatch global que re-render BOMTab fuerza recomputación de un array nuevo, useSelector compara `===`, falla, re-render aunque el contenido sea idéntico.

`shallowEqual` no se usa en ningún callsite de la app (workaround manual ausente).

**Drift de estilo (no de comportamiento):** la convención visible en `selectors.ts` (root plain + derivations memoized) está rota en bomSlice. No es un bug; es inconsistencia.

---

## 3. Canónico propuesto

### 3.1. Patrón de memoización por selector (basado en sweep de consumers)

**Para `selectBOMForColorway`** — único con riesgo concreto, único caller:

Patrón: **`createSelector` con arg como input selector. Cache size 1 (default).** Razón:

- 1 consumer (`BOMTab.tsx`).
- Único colorway activo a la vez (state local `activeColorwayId`).
- Cache size 1 cubre el caso: cuando entries y colorwayId no cambian → cache hit → mismo array → no re-render.
- Cuando colorwayId cambia (usuario cambia colorway activo) o entries cambia (BOM extracción) → cache miss → recompute. Correcto.

```ts
export const selectBOMForColorway = createSelector(
  [(state: RootState) => state.bom.entries, (_state: RootState, colorwayId: string) => colorwayId],
  (entries, colorwayId): BOMEntryResolved[] =>
    entries.map(entry => {
      const override = entry.colorwayOverrides[colorwayId];
      const resolvedName = override?.name ?? entry.name;
      const resolvedUnitCost = override?.unitCost ?? entry.unitCost;
      return { ...entry, resolvedName, resolvedUnitCost, totalCost: entry.quantity * resolvedUnitCost };
    }),
);
```

**Patrones descartados explícitamente:**

- **Factory por componente** (`makeSelectBOMForColorway() => createSelector(...)`): innecesario con 1 consumer. Útil cuando varios componentes muestran colorways distintos simultáneos. No es nuestro caso.
- **`weakMapMemoize` / `argsMemoize`**: cache multi-arg. Útil cuando hay llamadas frecuentes con args distintos. No aplica con 1 caller secuencial.

**Para los otros 5:** alinear con el patrón de `selectors.ts` (plain roots + memoized derivations) por consistencia, aunque el riesgo funcional sea bajo o nulo.

| Selector | Cambio | Razón |
|---|---|---|
| `selectBOMEntries` | **plain** (sin cambio) | root selector — devuelve `state.bom.entries` directo. Mismo shape que `selectProject` en `selectors.ts`. |
| `selectBOMByCategory` | `createSelector` con Pattern A | array fresco; aunque hoy 0 callers, si se usa en el futuro el riesgo está mitigado por construcción. |
| `selectTotalCost` | `createSelector` zero-arg | primitivo; memo por consistencia, costo trivial. |
| `selectTotalCostByColorway` | `createSelector` con Pattern A | primitivo; memo por consistencia. |
| `selectBOMIsStale` | `createSelector` zero-arg | primitivo; memo por consistencia. |

### 3.2. Ubicación: mantener en `bomSlice.ts`, NO mover a `selectors.ts`

**Recomendación:** mantener los 6 selectors exportados desde `bomSlice.ts` (ubicación actual).

**Razones (alineadas con la inclinación de Sam expresada en review previo):**

1. **`selectors.ts` actualmente NO es canónico transversal — es infra de optimización del editor 2D.** Mover bomSlice ahí lo legitimizaría como "central" sin haber pasado por la decisión deferida (cobertura general).
2. **Slice-local exported es patrón válido en Redux Toolkit** y común en codebases grandes. No es drift inherentemente.
3. **Menor riesgo de merge conflict** y menor blast radius — `selectors.ts` es importado por componentes del editor; bomSlice solo por BOMTab y bomTools.
4. **La pregunta "¿centralizar todos los selectors o no?"** es exactamente la pregunta deferida (sección 6). Pre-resolverla acá la cierra por defecto sin discusión.

Tradeoff aceptado: hay 2 ubicaciones de selectors después de este cierre. Es **consciente y deliberado**, no drift. Cuando llegue la pregunta diferida, puede consolidarse o ratificarse la dualidad con razón.

---

## 4. Archivos a tocar

| Archivo | Cambio | Líneas aprox |
|---|---|---|
| `src/store/bomSlice.ts` | refactor 5 de 6 selectors a `createSelector`; selectBOMEntries queda plain | ~50 líneas modificadas |
| `src/store/__tests__/bomSlice.test.ts` | sin cambios (tests usan `toEqual`, no `toBe`; signatures `(state, ...args)` preservadas por `createSelector`) | 0 |
| `src/components/BottomPanel/BOMTab.tsx` | sin cambios (consume signatures preservadas) | 0 |
| `src/copilot/action/tools/definitions/bomTools.ts` | sin cambios (idem) | 0 |
| `src/store/selectors.ts` | **NO tocar** (no centralizamos) | 0 |

**Total: 1 archivo modificado.** Tamaño confirmado **S**.

---

## 5. Tamaño confirmado: S

1 archivo modificado, ~50 líneas, sin migraciones de consumers, sin cambios de tests. Cierre en un solo commit.

---

## 6. Open question deferred (vive bajo B4-state, no es eje nuevo)

**La pregunta:** ¿el patrón de `selectors.ts` (plain roots + memoized derivations, ubicación central) debe extenderse a los **17 slices restantes** del codebase? ¿O se acepta dualidad permanente (slice-local cuando el dominio es acotado, central cuando se comparte)?

**Por qué no se cierra ahora:**

- `selectors.ts` fue introducido para optimizar el editor 2D, no como decisión transversal. Adoptarlo como canónico de los 17 slices sin Fase 2 deliberada = ratificación-por-inercia.
- Los 17 slices tienen patrones de consumo muy distintos (algunos zero-arg, otros parametrizados, algunos solo internos). Una decisión transversal requiere ver el shape de uso de cada uno.
- El riesgo concreto que motivó B4-state (`selectBOMForColorway` sin memo) se cierra sin esta decisión.

**Cuándo se cierra:**

- Cuando arranque otro eje que toque selectors en serio (probables candidatos: B2-state — entity collection shape, o B10-state — fuente de verdad superpuesta), esta pregunta entra como input.
- O proactivamente, si alguien la abre después de que B5-state, D1-cosmetic, D5 cierren los mecánicos restantes y haya capacidad para una Fase 2 (b).

**Hallazgo lateral a anotar para esa Fase 2 futura:** `selectBOMByCategory` tiene **0 consumers en src/**. Posible dead code o staged for future. Decidir entonces eliminar, mover a `__deprecated__`, o documentar. **NO eliminar en este cierre** — el scope de B4-state-bomSlice es alineamiento de patrón, no cleanup de dead code (cleanup va en su propio fix por separado).

---

## 7. Riesgo de cambio de comportamiento

**Cero a nivel de API y contrato:**

- Signatures preservadas: `selectXXX(state)` y `selectXXX(state, arg)` siguen funcionando idénticamente.
- Returns preservados: mismos tipos, mismos valores.
- Tests pasan sin modificar (verificado: usan `toEqual`, no asertan referencias).

**Cambio observable: performance (positivo).**

- Mismo input → mismo output reference (memo). useSelector deja de re-renderizar BOMTab cuando recibe entries/colorwayId iguales.
- Diferentes inputs → recompute (igual que antes, pero ahora con cache awareness).

**Edge case a vigilar (riesgo bajo):** si algún caller mutara el array retornado, esa mutación persistiría a través de calls cacheados. **Verificación:** ningún caller actual muta — `BOMTab` lo pasa a `displayEntries.map(...)` (no muta), `useMemo`, `.filter`. Tools lo leen sin mutar. **No mitigation needed.**

**No hay cambio de comportamiento en cascada de eventos / undo / persistencia.** bomSlice.actions y reducers no se tocan.

---

## 8. Anti-patrones evitados explícitamente

- **NO** centralizar a `selectors.ts` (sería pre-resolver la pregunta deferida).
- **NO** extender el patrón a otros slices "ya que estamos" (scope creep).
- **NO** eliminar `selectBOMByCategory` (cleanup ≠ alineamiento de patrón).
- **NO** introducir `weakMapMemoize` / factories sin necesidad (over-engineering vs sweep).
- **NO** abrir issue B4b o sub-eje (per refinamiento de Sam: el eje cubre todo el territorio que abrió, incluso lo deferido vive bajo B4-state).

---

**FIN FASE 2 B4-state.** Esperando aprobación del canónico antes de Fase 3 (1 commit, `unify: B4-state — memoize bomSlice selectors via createSelector (S)`).
