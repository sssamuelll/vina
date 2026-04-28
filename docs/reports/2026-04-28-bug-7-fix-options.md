# BUG-7 — Fix options note (pre-fix)

**Issue:** [#610](https://github.com/sssamuelll/openclo/issues/610) — `linkedEditing` middleware breaks single-step undo.
**Eje futuro relacionado:** **B3-state** (Mutaciones / cascada middleware).
**Razón de la nota:** el fix mínimo viable elige entre 3+ arquitecturas que B3-state evaluará. Necesitamos elegir la opción que **menos** cementa.

---

## Diagnóstico exacto

Orden actual de middleware (`src/store/index.ts:75`):

```
confirmation → undoMiddleware → linkedEditingMiddleware → reactiveSolver → gradingStaleness
```

Flujo del bug cuando el usuario edita una pieza linked:

1. `updatePiece(A)` entra al chain.
2. `undoMiddleware` toma snapshot **S1** (estado antes de A) y lo pushea a `past`.
3. `next(action)` propaga; reducer aplica A.
4. `linkedEditingMiddleware` (post-hoc, tras `next`) detecta partner y `dispatch(updatePiece(B))`.
5. La nueva acción re-entra desde el top. `undoMiddleware` toma snapshot **S2** (estado con A aplicado, B no) y lo pushea.
6. Reducer aplica B.

**Resultado:** dos entradas en `past`. El primer Ctrl+Z restaura S2 (deshace solo a B); el segundo Ctrl+Z restaura S1 (deshace A). UX rota.

---

## Estado relevante de la infraestructura existente

`undoMiddleware` ya tiene una **API pública de batch** (`src/store/undoMiddleware.ts:102–113`):

```typescript
batchUndo(dispatch, label, fn)
  → dispatch({ type: 'undo/startBatch', payload: label })
  → fn()
  → dispatch({ type: 'undo/endBatch' })
```

Mientras `batchDepth > 0`, undoMid suprime snapshots por acción y solo guarda **un** snapshot pre-batch como entrada única. La API existe y se usa (`src/store/undoMiddleware.ts:102` + `linkedEditingMiddleware` no la usa hoy).

`linkedEditingMiddleware` ya usa una flag `isSyncing` para prevenir re-entrada en cascada.

---

## Opciones

### Opción 1 — `meta.cascadeOf` flag + undoMid agrupa

Cuando `linkedEditingMiddleware` despacha la sincronización del partner, agrega `meta.cascadeOf: <originator>`. `undoMiddleware` reconoce el flag y skipea el snapshot (o agrupa con el padre).

**Pros:**
- Cambio mínimo en middleware. Reusa el patrón `meta.*` existente.

**Cons:**
- Introduce **convención nueva** (`meta.cascadeOf`) que B3-state probablemente quiera evaluar / deprecar.
- Drift risk: cualquier futuro middleware que cascade tiene que recordar setear el flag.

**Cement risk:** Medio. Establece una convención reversible pero nueva.

---

### Opción 2 — Usar la API `batchUndo` existente, reordenando linkedEditing → antes de undoMid ★ recomendada

Reordenar el chain a:

```
confirmation → linkedEditing → undoMiddleware → reactiveSolver → gradingStaleness
```

Refactorizar `linkedEditingMiddleware` a "around next" pattern:

```typescript
export const linkedEditingMiddleware: Middleware = (store) => (next) => (action) => {
  if (isSyncing) return next(action);
  if (!willCascade(action, store)) return next(action);

  store.dispatch({ type: 'undo/startBatch', payload: getLabel(action) });
  try {
    const result = next(action);          // original aplica DENTRO del batch
    isSyncing = true;
    try {
      // cascade(s) también van DENTRO del batch
      ...syncs(store.dispatch, ...);
    } finally {
      isSyncing = false;
    }
    return result;
  } finally {
    store.dispatch({ type: 'undo/endBatch' });
  }
};
```

`willCascade(action, store)` lee la payload + estado actual para decidir si hay partner antes de aplicar.

**Pros:**
- **Reusa una API que ya existe** y fue diseñada exactamente para "agrupar varias dispatches en una entrada de undo".
- **No introduce convenciones nuevas.** Cero `meta.*` flags adicionales.
- Cement risk **mínimo**: si B3-state luego decide eliminar cascade dispatches, quitar el wrapper `startBatch/endBatch` es trivial; si decide mantenerlas con otra forma, igual trivial.
- Local: cambio acotado a `linkedEditingMiddleware.ts` + 1 línea en `store/index.ts` (orden).

**Cons:**
- Requiere reordenar el chain. Verificar que `reactiveSolver` y `gradingStaleness` no dependen de ver acciones después de undo (no parece, pero hay que confirmar leyendo).
- `willCascade` debe leer la payload pre-`next`. Para `updatePiece(payload)` está OK (payload es la pieza completa); para `addInternalLine`/`updateInternalLine` hay que mirar `state.project.pieces` para saber si la pieza tiene `linkedPieceId` — eso es read del estado actual, no problema.

**Cement risk:** Bajo. Usa API pública del propio módulo.

---

### Opción 3 — Mover el sync al reducer (single reducer + multiple mutations)

Hacer que el reducer de `updatePiece` (y los otros) detecte `linkedPieceId` y aplique la mutación al partner inline, atómicamente. Eliminar `linkedEditingMiddleware` por completo.

**Pros:**
- Sin cascade dispatching. Resuelve el problema de raíz.
- Una entrada de undo por definición.

**Cons:**
- **Major refactor.** Lógica de mirroring (`mirrorOutlineX`, `mirrorInternalsX`, `outlineCenterX`) entra al reducer → reducers dejan de ser puros/simples.
- O alternativamente cada callsite computa el partner update — duplica `linkedEditing` por todo el codebase.
- **Cement risk alto**: esto es exactamente la decisión que B3-state tiene que tomar. Hacerlo ahora pre-empta.

**Cement risk:** Alto. Pre-empta B3-state.

---

### Opción 4 — Ventana temporal en undoMid para agrupar cascades

undoMid agrupa snapshots que llegan dentro de Δms de un originator marcado con `meta.cascadeOf`.

**Pros:** No requiere reorder.
**Cons:** Heurística temporal frágil + introduce `meta.cascadeOf` igual que Opción 1.
**Cement risk:** Medio (mismo flag que Opción 1) + complejidad mayor que Opción 2.

---

## Recomendación

**Opción 2** — reorder + `batchUndo` wrapping.

Razones:
1. **Cement risk más bajo.** Usa la API de batch que ya está diseñada y públicamente expuesta en `undoMiddleware.ts:102–113`.
2. **No introduce convenciones nuevas.** No hay `meta.cascadeOf` que B3-state luego tenga que evaluar/migrar.
3. **Smallest blast radius.** El cambio cabe en `linkedEditingMiddleware.ts` + 1 línea en `store/index.ts`.
4. **Non-blocking para B3-state.** Si B3-state luego decide:
   - "cascades son antipattern, eliminarlas" → quitar el middleware entero, el batch wrapper se va con él.
   - "cascades son legítimas, formalizar" → la solución actual ya es el patrón canónico.
   - "necesitamos otra forma de agrupar" → quitar las dos líneas de `startBatch`/`endBatch`.

---

## Preguntas abiertas para Sam

1. **¿OK con reordenar el chain?** Específicamente mover `linkedEditing` antes de `undoMiddleware`. Mi lectura es que ningún otro middleware depende del orden actual (confirmation está primero por diseño documentado en CLAUDE.md; reactiveSolver/gradingStaleness escuchan acciones de measurements/variables, no piezas linked). Si hay algo que me esté perdiendo, decime.
2. **¿Algún test que cubra el comportamiento actual de undo + linked editing?** Si hay test que asume "2 Ctrl+Z para revertir edición linked", lo voy a romper. Necesito saber si esperabas eso o si es un test que también arreglar.
3. **¿BUG-7 incluye flips (`flipPieceH`/`flipPieceV`) en el alcance?** Esos también están en `SYNCED_ACTIONS` y tienen el mismo bug. Asumo sí, fix los cubre todos por construcción.

---

## Lo que NO voy a hacer en este fix

- **No** introducir `meta.cascadeOf` ni convenciones nuevas de meta flags.
- **No** mover lógica de `linkedEditing` a reducers.
- **No** tocar otros middlewares con cascades (`reactiveSolver` puede tener cascadas — eso es B3-state territory).
- **No** refactorizar la lógica de mirroring / mirror-internals — solo el wrapping con `batchUndo`.
- **No** cambiar la lista de `SYNCED_ACTIONS`. El fix preserva qué acciones se cascadan; solo cambia cómo se agrupan en undo.

---

## Plan de fix (post-aprobación)

1. Reordenar middleware en `src/store/index.ts:75`: `linkedEditing` antes de `undoMiddleware`.
2. Refactorizar `linkedEditingMiddleware` a "around next":
   - Extraer `willCascade(action, state) → { partner, syncFn } | null` que mira payload + estado SIN aplicar la acción.
   - Si va a cascadar: `dispatch(startBatch)`, `next(action)`, sync, `dispatch(endBatch)`.
   - Si no: `next(action)` y listo.
3. Test (si no existe): editar una pieza linked, verificar que `Ctrl+Z` único restaura el estado completo (pieza original + partner). Cubrir los 5 tipos de acción en `SYNCED_ACTIONS`.
4. `npx tsc --noEmit && npm run test && npm run lint` antes de commit.
5. Commit message: `fix: BUG-7 group linkedEditing cascade into single undo entry`.

**Nada de esto se ejecuta hasta que apruebes la nota.**

---

## Adendum — verificaciones pedidas por Sam

### Verificación 1 — Downstream middlewares post-reorder

**reactiveSolverMiddleware:**
- `TRIGGER_ACTIONS` (líneas 70–76): `project/updateMeasurements`, `construction/setVariable`, `parametric/setVariableOverride`, `parametric/setVariableOverrides`, `parametric/activateTemplate`.
- **Ninguna de esas acciones está en `linkedEditing.SYNCED_ACTIONS`** (`updatePiece`, `addInternalLine`, `removeInternalLine`, `updateInternalLine`, `flipPieceH`, `flipPieceV`).
- Conclusión: reactiveSolver es **completamente independiente** de las cascades de linkedEditing. No dispara con ninguna acción que linkedEditing tocara antes ni toca después. ✓

**gradingStalenessMiddleware:**
- `PIECE_MODIFYING_ACTIONS` (líneas 12–21): `updatePiece`, `movePiece`, `rotatePiece`, `removePiece`, `removePieces`, `addInternalLine`, `updateInternalLine`, `removeInternalLine`. Cuatro de esas SÍ están en `linkedEditing.SYNCED_ACTIONS`.
- gradingStaleness lee `state.grading` **después** de `next(action)` y dispatchea `grading/setStale` si la pieza modificada es base.
- Comportamiento bajo el reorder:
  - **Original action:** linkedEditing → undoMid (suprime snapshot, batchDepth>0) → reactiveSolver → gradingStaleness ve la acción original, evalúa, posiblemente dispara setStale. Igual que antes.
  - **Cascade dispatch (partner):** vuelve al top del chain. linkedEditing (isSyncing=true, pasa) → undoMid (suprime, batchDepth>0) → reactiveSolver → gradingStaleness ve el cascade, evalúa, posiblemente dispara setStale. **Igual que antes** — lo veía dos veces (original + cascade) en el orden viejo, lo sigue viendo dos veces en el nuevo.
- gradingStaleness **no depende** de undoMid haber procesado primero (no lee `past`/`future`/historial).
- gradingStaleness **no ve** `undo/startBatch` ni `undo/endBatch`: undoMid intercepta esas y hace `return; // Don't pass through` (`undoMiddleware.ts:243, 267`). Confirmado en código. ✓

**Conclusión Verificación 1:** Ningún middleware downstream depende del orden previo de undoMid ni de ver acciones individuales de forma agrupada. El reorder es seguro.

---

### Verificación 2 — `batchUndo` edge cases

**Caso A — Cero acciones cascade dentro del batch.**

Mi propuesta gatea el wrap por `willCascade(action, store)` antes de abrir batch. Si `willCascade === false`, no se abre batch y undoMid actúa normal (snapshot único como hoy).

Si `willCascade === true` pero por alguna razón `syncFn` no dispatchea (caso teórico — el código actual de `syncUpdatePiece`/`syncAddInternalLine`/`syncUpdateInternalLine` siempre dispatchea cuando se las llama, así que `willCascade` true implica al menos 1 cascade dispatch):
- `dispatch(startBatch)` → `batchDepth=1`, `batchSnapshot = S1` (state pre-original).
- `next(action)` aplica original (snapshot suprimido por `batchDepth > 0`).
- (cero cascades).
- `dispatch(endBatch)` → `batchDepth=0`, **S1 se pushea como una entrada**.

Resultado: una entrada de undo (Ctrl+Z restaura a S1, antes del original). Válido — peor caso es una entrada "redundante" si el original era no-op, pero no corrupción. Confirmado en `undoMiddleware.ts:248–264`.

**Caso B — Acción throwea dentro del batch.**

Mi propuesta usa `try { ... } finally { dispatch(endBatch); }`. Esto garantiza que endBatch se dispatcha incluso si `next(action)` o el sync interno throwea.

- Si `next(action)` throwea: el reducer puede haber mutado parcialmente (improbable con Immer, pero teórico). `finally` ejecuta endBatch → S1 se pushea. La excepción propaga. Ctrl+Z restaura a antes del original — comportamiento correcto.
- Si una cascade dispatch throwea: original ya aplicó, partner aplicó parcialmente o no. `finally` ejecuta endBatch → S1 se pushea. Ctrl+Z restaura a antes del original (deshace ambos parcialmente aplicados) — comportamiento correcto.

**Lo que NO pasa:** No hay rollback automático del estado en sí — undoMid pushea el snapshot pre-batch pero no lo aplica automáticamente. Ese ya era el comportamiento de `batchUndo`; no cambia con este fix.

**Riesgo bajo a flag:** Si endBatch nunca se dispatcha (por algún crash atípico antes del `finally`), `batchDepth` queda > 0 para siempre y undoMid suprime todos los snapshots futuros silenciosamente. El `try/finally` previene esto bajo cualquier control flow normal. Documentado en código existente.

**Confirmación adicional desde tests:** `src/__tests__/store.test.ts` ya tiene 3 tests de batchUndo que pasan:
- `multiple dispatches inside batchUndo create a single undo entry`
- `redo after batched undo restores all changes`
- `nested batches only create one undo entry`

La API está cubierta y funciona como espero.

**Conclusión Verificación 2:** Ambos edge cases están cubiertos por la API existente + el patrón try/finally del fix.

---

### Respuesta a las 3 preguntas abiertas (re-emitidas con info de tests)

**1. Reorder OK?** Las dos verificaciones arriba pasan: ningún downstream middleware depende del orden viejo, y los edge cases de batchUndo están cubiertos. Reorder seguro. ✓

**2. Tests existentes — corrida.** Filtré `vitest run` por `linkedEditingMiddleware.test.ts`, `__tests__/store.test.ts`, `linkedEditing.test.ts`. **48 tests, todos pasan**:

```
✓ src/utils/__tests__/linkedEditing.test.ts  (3 tests, mirror utilities)
✓ src/store/__tests__/linkedEditingMiddleware.test.ts  (4 tests, sync correctness)
  - syncs updatePiece to instance-linked partner
  - syncs updatePiece to symmetry-linked partner
  - does not sync movePiece (positions independent)
  - does not infinite loop
✓ src/__tests__/store.test.ts  (41 tests, incluye undo/redo + batchUndo)
  - undoMiddleware: supports undo/redo for project actions
  - undoMiddleware: clears redo on new action
  - undoMiddleware: undo/redo works for normal pattern editing operations
  - undoMiddleware: preserves NaN through snapshot
  - Undo batch grouping: multiple dispatches inside batchUndo create a single undo entry
  - Undo batch grouping: redo after batched undo restores all changes
  - Undo batch grouping: nested batches only create one undo entry
```

**Ningún test cubre la interacción undo + linkedEditing.** Los tests de linkedEditing no tocan undo; los de undo no usan linkedEditing. **Conclusión: no hay tests que dependan del comportamiento "2 Ctrl+Z" actual.** No hay tests de bug que actualizar — hay tests de bug **faltantes** que voy a agregar como parte del fix (ver paso 3 del plan original): cobertura de "edición de pieza linked + Ctrl+Z único restaura todo".

**3. flipPieceH/flipPieceV en alcance.** Misma causa raíz: `linkedEditingMiddleware.ts:58–60` los maneja con `syncUpdatePiece(store.dispatch, editedPiece, partner)` exactamente igual que `updatePiece`. La cascade es idéntica estructuralmente. **El fix los cubre por construcción**, sin código extra. Va en el mismo commit. ✓

---

### Verificación final: alcance del fix

- **Archivos a tocar:**
  1. `src/store/linkedEditingMiddleware.ts` — refactor a "around next" + extraer `willCascade`.
  2. `src/store/index.ts` línea 75 — mover `linkedEditingMiddleware` antes de `undoMiddleware`.
  3. `src/store/__tests__/linkedEditingMiddleware.test.ts` — agregar tests de undo+cascade (un único Ctrl+Z restaura).

- **Verificación post-fix:** `npx tsc --noEmit && npm run test && npm run lint` debe pasar. Los 48 tests existentes deben seguir verdes; los nuevos cubren el caso reparado.

- **Commit message:** `fix: BUG-7 group linkedEditing cascade into single undo entry (#610)`.

Listo para el verde.
