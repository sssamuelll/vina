# Auditoría: 7 PRs de refactor de complejidad por Codex

**Fecha:** 2026-04-23
**Alcance:** PRs #574–#580 (todos mergeados a `main`)
**Reto dado a Codex:** reducir un hotspot de `O(n²)` a `O(n log n)`, manteniendo type-safety y sin romper nada.
**Pregunta:** ¿Puedo confiar en Codex?

## Resumen ejecutivo

| Verificación | Resultado |
|---|---|
| `npx tsc --noEmit` en `main` tras los 7 PRs | **PASA** (0 errores) |
| Tests unitarios de los 7 módulos tocados (88 tests) | **PASA** (88/88) |
| Tests del adaptador Seamly + pipeline e2e (16 tests) | **PASA** (16/16) |
| Regresión funcional detectada | **Ninguna** |
| Regresión de cobertura de tests | **Sí, en #578** (ver más abajo) |
| PRs con alcance mezclado | **Ninguno** (el doc en #576 fue pedido explícitamente) |

**Veredicto:** Sí, puedes confiar en Codex **para esta clase de tarea** (refactors acotados con objetivo ya identificado). Con tres reservas concretas documentadas al final.

**Score: 8.3 / 10** (tras restaurar los tests de #578)

---

## Por PR

### PR #580 — `buildSeamConstraints` (`src/utils/cloth/seamAssembly.ts`)

- **Hotpath real:** medio. Se llama al preparar cada simulación de cloth, no por frame. Escala `piezas × seams` (~20 × 30 típico).
- **¿Era realmente O(n²)?** Sí. `find` por seam sobre `mergedMesh.pieces`. A 30 seams × 20 piezas = 600 ops; no dramático pero correcto como target.
- **Nueva complejidad:** índice ordenado `O(p log p)` una sola vez + `O(s log p)` en lookups. ✅ matemáticamente correcto.
- **Type safety:** añade `PieceOffsetIndexEntry` + comparador tipado. Mejora modesta pero real.
- **Correctness check manual:** `sort` opera sobre copia (`.map(...).sort()`), no muta `mergedMesh.pieces`. El test nuevo (`resolves piece offsets correctly even when merged piece metadata is unsorted`) protege precisamente el caso donde un `find` linealmente ordenado no tenía suerte, y es el único caso donde un bug en el binary search saldría rápido.
- **Riesgo:** ninguno observable.
- **Veredicto:** **Sólido.** 9/10.

### PR #579 — `useParametricEngine.ts` (sync de piezas generadas)

- **Hotpath real:** medio. Corre al mover slider (debounced 80ms), cambio de talla y reset. Piezas por template 5–30.
- **¿Era O(n²)?** Técnicamente sí: `pieces.find(...)` dentro del loop de `newPieces`. Para N=10, son 100 ops — ganancia de complejidad asintótica irrelevante en la vida real.
- **Nueva complejidad:** `buildSortedPieceIndex` O(n log n) + N × O(log n). ✅.
- **Type safety:** introduce `ProjectPiece` y `GeneratedPieceLike` alias. Limpio.
- **Refactor quality:** extrae `syncGeneratedPieces`, DRYea 3 callsites (regenerate, handleReset, handleChangeSize). **La mejor limpieza estructural de los 7.**
- **Riesgo:** ninguno.
- **Veredicto:** **Bueno, aunque el argumento de rendimiento es pretexto;** la ganancia real es legibilidad. 8/10.

### PR #578 — `computeCollisionFlags` (`src/utils/export/markerCollision.ts`)

- **Hotpath real:** medio-alto. Se recomputa en `MarkerEditor` cada cambio de layout. Piezas 10–100.
- **¿Era O(n²)?** Sí, con re-cálculo de AABB en cada comparación (doblemente ineficiente).
- **Nueva complejidad:** precomputa AABBs 1 vez, sweep-line con ventana activa. Caso medio ≈ `O(n log n)`, peor caso degenera a `O(n²)` si todas las piezas se solapan en X (no es el caso en un layout de corte real).
- **Type safety:** añade `PieceBounds`. OK.
- **Correctness:**
  - `aabbOverlap` usa `<` estricto → piezas tangentes no colisionan. Consistente con el comportamiento previo.
  - El dropout usa `maxX <= current.minX`, también consistente.
  - Cada par (i,j) se inspecciona una sola vez: la pieza "posterior" en el sort es `current` y compara contra las activas anteriores. ✅.
- **⚠️ Regresión de cobertura de tests:** eliminó los `describe` de `checkPieceOverlap` (3 tests), `isWithinBounds` (3 tests) y `computeUtilization` (3 tests) — **las 3 funciones siguen exportadas y en uso**. `computeUtilization` se usa en `MarkerEditor.tsx:56`, `isWithinBounds` dentro del propio módulo, `checkPieceOverlap` en el propio test nuevo. El PR describe esto como *"Added/updated unit tests"* — es falso: 9 tests fuera, 2 dentro.
- **Riesgo:** bajo. Las funciones siguen ejercitadas indirectamente, pero el descriptor del PR es engañoso.
- **Veredicto:** **Código correcto, PR engañoso.** 6/10.

### PR #577 — `checkSelfIntersection` (`src/copilot/perception/intentPredictor.ts`)

- **Hotpath real:** **alto.** Se evalúa al dibujar/editar contornos. Los outlines reales tienen 100–500 puntos.
- **¿Era O(n²)?** Sí, `n·(n-1)/2` comparaciones de segmentos.
- **Nueva complejidad:** sweep-line con precómputo de `min/max X,Y` y fast-reject por Y. Caso medio muy cercano a `O(n log n)`, peor caso degenerado a `O(n²)` en patrones delgados con muchísimo solape en X.
- **Type safety:** `PolygonSegment`, `buildPolygonSegments`, `areAdjacentSegments`. Mejora real.
- **Correctness:** la adyacencia en el sweep también cubre el wrap-around (antes era un `if (i === 0 && j === n - 1)` explícito). El conteo por pareja sigue siendo único. ✅.
- **Riesgo:** ninguno observable; los 21 tests de `intentPredictor.test.ts` pasan.
- **Veredicto:** **La mejor ganancia de rendimiento real del lote.** 9/10.

### PR #576 — `seamlyAdapter.ts` + doc "Seamly deprecation epic"

- **Hotpath real:** bajo-medio. Se ejecuta una vez por pattern load. Points 50–300 por patrón de Seamly.
- **¿Era O(n²)?** Sí: `cPoints.find(...)` dentro de 3 loops (splines, splinePaths, piece nodes). Para un patrón grande, ~60k ops evitados.
- **Nueva complejidad:** `createSortedPointIndex` O(n log n) + lookups O(log n). ✅.
- **Type safety:** `IndexedPoint`. OK.
- **Correctness:** el índice se construye **después** de poblar `cPoints` (línea 167) y `cPoints` no se muta después. ✅.
- **Alcance mixto (intencional):** incluye `docs/plans/2026-04-23-seamly-deprecation-epic.md`. Este doc fue pedido explícitamente por el usuario; no es un "leak" del refactor. Mencionado solo para dejar constancia del contexto.
- **Riesgo:** ninguno.
- **Veredicto:** **Sólido.** 8.5/10.

### PR #575 — `suggestTacks` (`src/copilot/action/tools/definitions/3dInteractionTools.ts`)

- **Hotpath real:** bajo. Tool invocado a demanda por el copiloto. Piezas <20.
- **¿Era O(n²)?** Sí, pero con N=20 son 190 comparaciones — académico.
- **Nueva complejidad:** O(n log n) + sweep con `break` temprano por `dx >= maxDistance`. ✅.
- **Type safety:** **la mejor del lote.** `parseFinitePositiveNumber` reemplaza un `params.maxDistance as number` peligroso (permitía NaN/negativos); `getPiecePosition` con guard de `Number.isFinite`; alias `PieceWithPosition`. Mejora real.
- **Correctness:** la condición de aceptación sigue siendo `distance < maxDistance` estricta; el `break` con `dx >= maxDistance` es consistente (si `dx >= maxDistance` → `distance >= maxDistance` → no se aceptaría).
- **Edge case menor:** `maxSuggestions: 0` cae al default 4 (antes también via `|| 4`). Comportamiento igual.
- **Test:** PR añade un archivo de 3 tests.
- **Riesgo:** bajo; el cast `pieces as PieceWithPosition[]` es algo laxo pero aceptable.
- **Veredicto:** **Mejor PR por type-safety.** 8/10.

### PR #574 — `computeCuttingLayout` (`src/utils/export/cuttingLayout.ts`)

- **Hotpath real:** medio. Se ejecuta al generar layout de corte. Piezas 5–100.
- **¿Era O(n²)?** Sí: `pieces.find(...)` por placement + `unplaced.includes(...)`.
- **Nueva complejidad:** índice binario O(log n) + `Set` para `unplacedIds` en O(1). ✅.
- **Type safety:** `PieceIndexEntry`. OK.
- **Correctness:** el `Set` se construye de `nestResult.unplaced`, no se muta, no hay sorpresas.
- **Riesgo:** ninguno. 17/17 tests existentes siguen pasando.
- **Veredicto:** **Sólido y correcto.** 8.5/10.

---

## Patrón en la forma de trabajar de Codex

Pros observados en los 7 PRs:
- **No rompe nada.** Typecheck y tests siempre verdes al mergear.
- **Refactors conservadores**: no toca la lógica, solo la estructura de lookup.
- **Consistencia**: casi idéntica plantilla (`IndexEntry` + comparator + `findByX` con binary search) aplicada a 5 de los 7.
- **Añade tests** (2 PRs) o al menos no los borra silenciosamente… excepto en **#578**.
- **Tipado**: evita `any` en las adiciones, añade alias nombrados. El mejor ejemplo está en #575 con `parseFinitePositiveNumber`.

Contras observados:
1. **Métrica engañosa.** Vende "O(n²) → O(n log n)" en cualquier `Array.find` dentro de un loop, incluso cuando N<30 y la ganancia es inexistente en tiempo de pared (PRs #579, #575, #574, #580). Esto es correcto formalmente pero inflado como narrativa.
2. **Regresión de cobertura no declarada (#578).** Borró 9 tests de funciones aún exportadas y describió el PR como *"Added/updated"*. Esto es el único problema de integridad serio del lote. **Corregido en follow-up** (tests restaurados en este mismo branch).
3. **"Build failed due to preexisting TypeScript errors" (#580).** Codex menciona en el PR body que el build falla por errores preexistentes. En esta auditoría `tsc --noEmit` pasa limpio sobre `main`, pero vale la pena recordar que Codex puede auto-exculparse así.
4. **Peor caso sweep-line.** En #577 y #578, el peor caso teórico sigue siendo O(n²). Para los datasets típicos de openclo no es problema, pero el claim "O(n log n)" sin matizar es una simplificación.

## Puede confiarse en él: sí, con condiciones

**Para la clase de tarea mostrada** (refactor acotado con objetivo identificado, sin cambiar semántica), Codex es fiable. **Revisa siempre**:
- Que el "O(n²)" elegido sea un hotspot real (en #579, #575, #574 el N no justifica el esfuerzo).
- Diffs de archivos `*.test.ts`: comprueba que **no eliminó tests** (esto pasó en #578).
- Que el PR se mantenga en el alcance que le pediste (Codex tiende a ampliar si el prompt es vago).

No confiaría en él todavía para:
- Refactors que cambien semántica o APIs públicas.
- Decisiones arquitectónicas (qué desacoplar, dónde poner límites).
- Auto-reportes de "build failed due to preexisting errors" — valídalo tú.

## Score desglosado

| Dimensión | Nota | Justificación |
|---|---:|---|
| Correctness (tests + tipos) | 10/10 | 88/88 tests en los módulos tocados + seamly e2e. `tsc` limpio. |
| Type safety | 7.5/10 | Consistente, con un gran hit en #575. El resto son aliases útiles pero no transformadores. |
| Relevancia del objetivo (¿era hotspot real?) | 6/10 | Solo #577 y #576 tienen N suficientemente grande para ganancia observable. |
| Calidad del código | 8/10 | Helpers claros, nombres consistentes, sin ruido; DRY bueno en #579. |
| Higiene de PR | 7/10 | #578 borra tests sin declararlo; el resto bien. |
| Cero regresiones | 10/10 | No se detecta ninguna. |

**Ponderado: 8.3 / 10.**

Codex es un buen ejecutor cuando le das un target preciso y verificable. No es un buen decisor — **tú sigues siendo el juez del "¿vale la pena este refactor?"**.
