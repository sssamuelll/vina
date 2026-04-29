# Fase 2 — B5-state: Middleware patterns (factory vs const)

**Fecha:** 2026-04-29
**Eje:** B5-state.
**Categoría:** **(b) decisión arquitectónica** — reclasificado desde (a) mecánico tras read-only investigation. Ver "Reclasificación" abajo.
**Output esperado:** opciones + tradeoffs + recomendación con confianza + preguntas. **NO canónico propuesto** (eso es decisión de Sam).

---

## 1. Reclasificación: (a) → (b)

El inventario clasificó B5-state como (a) mecánico, S, "drift cosmético, alinear a uno solo". La investigación read-only encontró que **la justificación natural del factory pattern (encapsulación de state via closure) está ausente en las 5 implementaciones actuales**.

| Middleware | Patrón export | State a module-level | Encapsulación factory? |
|---|---|---|---|
| `gradingStalenessMiddleware` | `const` | 0 (sólo Set constante) | N/A — verdaderamente stateless |
| `linkedEditingMiddleware` | `const` | 1 (`let isSyncing`) | — |
| `undoMiddleware` | `const` | 3+ (`_snapshotSave/Restore`, `undoState`, `_revision`, `_listeners`) | — |
| `confirmationMiddleware` | factory | 1 (`let persistTimer`) | **NO** — `persistTimer` está fuera del closure (línea 85 vs factory en 106) |
| `reactiveSolverMiddleware` | factory | 1 (`const state: MiddlewareState`) | **NO** — `state` está fuera del closure (línea 112 vs factory en 571) |

**Smoking gun:** `reactiveSolverMiddleware.test.ts:128`:

```ts
beforeEach(() => {
  vi.useFakeTimers();
  shutdownSolver(); // Reset module-level state between tests
  store = createTestStore();
});
```

El comentario inline **es el codebase mismo confesando** que la factory no encapsula state — si lo hiciera, llamar `createReactiveSolverMiddleware()` en cada test crearía un closure fresco con state fresco automáticamente, y `shutdownSolver()` sería innecesario.

**Implicación:** "drift cosmético" presupone que los dos patrones son funcionalmente equivalentes. La realidad es que la factory wrapper es vestigial — no aporta el beneficio que típicamente justifica el patrón. Decidir entre los dos NO es alineamiento de estilo; es decisión arquitectónica sobre si eliminar la pretensión, mantenerla con razón documentada, o convertirla en factory real.

---

## 2. Tres opciones evaluadas

### Opción 1 — Unificar a `const` (eliminar factory wrapper)

**Cambio:** todas las middleware pasan a `export const xxxMiddleware: Middleware = (store) => ...`. State queda module-level uniforme.

**Archivos tocados (blast radius S):**

- `src/store/confirmationMiddleware.ts` — eliminar factory wrapper (línea 106), exportar como const.
- `src/store/reactiveSolverMiddleware.ts` — eliminar factory wrapper (línea 571), exportar como const.
- `src/store/index.ts:75` — cambiar `createConfirmationMiddleware(), createReactiveSolverMiddleware()` por `confirmationMiddleware, reactiveSolverMiddleware`.
- `src/store/__tests__/confirmationMiddleware.test.ts:34` — actualizar import + concat.
- `src/store/__tests__/reactiveSolverMiddleware.test.ts:115` — idem.
- **Total: 5 archivos, ~10-15 líneas modificadas.**

**Tradeoffs:**

- ✅ Cierra la inconsistencia visual (5 middleware con shape uniforme).
- ✅ Elimina pretensión de encapsulación que no existe.
- ✅ Cambio mecánico, riesgo de regresión cero.
- ⚠️ **Deuda técnica explícita: no resuelve el code smell de `shutdownSolver()` workaround**. El comentario "Reset module-level state between tests" sigue ahí, pero ahora sin la factory que daba la falsa impresión de poder evitarlo. Se formaliza el smell como pattern.
- ⚠️ Cierra la puerta al refactor real (Opción 2) sin haberlo decidido — quedaría como deuda histórica.

**Comportamiento idéntico antes/después:** sí, garantizado. Ningún caller, ninguna API, ningún test cambia funcionalmente.

**Tamaño:** S.

---

### Opción 2 — Unificar a factory CON state en closure (encapsulación real)

**Cambio:** las 4 middleware con state lo mueven adentro del closure de su factory. `gradingStalenessMiddleware` queda const (es stateless).

**Archivos tocados (blast radius L):**

- 4 archivos de middleware reescritos parcialmente: `confirmationMiddleware.ts`, `reactiveSolverMiddleware.ts`, `linkedEditingMiddleware.ts`, `undoMiddleware.ts`.
- `gradingStalenessMiddleware.ts` queda igual (stateless ya).
- `src/store/index.ts:75` — cambiar a `createXxx()` para los 4.
- 3 archivos de tests modificados: `confirmationMiddleware.test.ts`, `linkedEditingMiddleware.test.ts`, `reactiveSolverMiddleware.test.ts`. **Eliminación de `shutdownSolver()` calls** (ya no necesarios — cada llamada al factory crea state fresco).
- **Consumers de exports module-level rompen:** ver tabla abajo. Estos consumers necesitan rewiring porque las funciones que hoy son `export function getSolverMetrics()` (que leen módulo-level `state`) tendrían que (a) volver a estar adentro del closure y devolverse en un objeto `{ middleware, getMetrics, getState, ... }`, o (b) recibir una ref/handle a la instancia activa del closure.

| Archivo consumer | Lo que importa | Fix necesario |
|---|---|---|
| `src/components/Viewport3D/GarmentSimulation.tsx:32, 519` | `registerSimulationCallbacks` de undoMiddleware | Recibir ref del closure activo o pasar dispatcher |
| `src/hooks/useSolverStatus.ts:14-17` | `subscribeToComputingState`, `getIsComputing`, `getSolverMetrics`, `getSolverState` | Idem |
| `src/hooks/usePredictiveWarmup.ts:13` | `warmupSolver` | Idem |
| `src/components/UndoHistoryPanel*` (no enumerados) | `canUndo`, `canRedo`, `getHistory`, `subscribeHistory`, `getHistoryRevision`, `jumpToIndex`, `batchUndo`, etc. (10+ funciones de undoMiddleware) | Idem — y son MUCHOS callsites |

**Estimado total de archivos tocados: ~10–15** (4 middleware + index + 3 tests + 3-7 consumers de hooks/components).

**Sub-decisión arquitectónica que aparece en Opción 2:** ¿cómo se exponen las APIs públicas que hoy son module-level functions?

- **2.a** — el factory devuelve `{ middleware, api }` y `store/index.ts` re-exporta `api` como singleton. Consumers importan de `store/index` en vez de del middleware directamente. Cambio uniforme pero impacta capas de imports.
- **2.b** — se mantiene un módulo separado (ej. `store/undoApi.ts`) que contiene la API pública con state interno, y el middleware solo lo lee. Separa responsabilidades pero introduce arquitectura nueva.
- **2.c** — singleton + factory que solo se llama una vez en `index.ts`, las API functions siguen module-level pero comparten state con la única instancia de la factory. **Esto es lo que tenemos hoy disfrazado de factory.**

**Tradeoffs:**

- ✅ Resuelve el code smell de `shutdownSolver()`. Tests obtienen isolation por construcción.
- ✅ Test isolation correcta sin workarounds.
- ✅ Patrón coherente con cómo factories DEBERÍAN funcionar.
- ⚠️ **Blast radius L** (~10-15 archivos, varios consumers de hooks/components).
- ⚠️ **Sub-decisión 2.a/2.b/2.c sin resolver** — Opción 2 abre un sub-RFC que actualmente no existe.
- ⚠️ Riesgo de cambio de comportamiento NO trivial: re-arquitecturar undoMiddleware con su API pública es no-mecánico y potencialmente rompe undo/history flows si no se hace bien.
- ⚠️ Costo aproximado: 1-2 sesiones de trabajo, no S.

**Comportamiento idéntico antes/después:** intencionalmente NO en tests (`shutdownSolver()` desaparece — comportamiento del test cambia, comportamiento de prod sí preservado). En prod sí preservado **si el rewiring de consumers se hace correcto**.

**Tamaño:** L (potencialmente XL si se subdivide en 2.a/2.b/2.c como sub-RFC).

---

### Opción 3 — Mezcla documentada (factory cuando hay state, const cuando stateless)

**Cambio:** se aplica la regla "factory si hay mutable state, const si stateless".

**Aplicación de la regla a los 5 middleware:**

| Middleware | State | Patrón actual | Patrón bajo Opción 3 | Cambio? |
|---|---|---|---|---|
| `gradingStalenessMiddleware` | 0 mutable | const | **const** | No |
| `linkedEditingMiddleware` | `let isSyncing` | const | **factory** | **Sí — convertir a factory** |
| `undoMiddleware` | 3+ pieces | const | **factory** | **Sí — convertir a factory (con todo el blast radius de Opción 2 sobre undoMiddleware)** |
| `confirmationMiddleware` | `let persistTimer` | factory | **factory** | No (status quo) |
| `reactiveSolverMiddleware` | full state | factory | **factory** | No (status quo) |

**Crítico:** Opción 3 NO es solo "documentar lo existente". Aplicar la regla limpiamente requiere convertir 2 middleware (linkedEditing y undo) de const a factory.

**Aquí Opción 3 se bifurca:**

- **3.a** — Aplicar la regla "como debería ser": las 4 con state pasan a factory CON state en closure. **Esto es prácticamente Opción 2.** Si solo se mueve el wrapper sin mover state al closure, el factory sigue siendo vestigial — solo más distribuido.
- **3.b** — Aceptar la inconsistencia con razón documentada: linkedEditing y undo quedan como const "by historical reasons", confirmationMiddleware y reactiveSolverMiddleware quedan factory "for stylistic signaling" aunque no encapsulen. Es Opción 1 maquillada con documentación.

**3.b es el path más cobarde:** documenta el smell como "by design" sin arreglarlo. Difícil de defender — el smell sigue ahí, ahora con un comment ratificándolo.

**3.a es Opción 2 con menos middleware tocados** (gradingStaleness queda fuera). Sigue siendo L.

**Tamaño:** L (3.a) o S (3.b con docs).

---

## 3. Drift adyacente que el inventario marcó pero que NO se cierra acá

El inventario flageó "**convención de meta flags inconsistente**" como parte de B5-state. Read-only confirmó:

- Solo `confirmationMiddleware` usa meta flags (`skipConfirmation`, `fromToolMemory`).
- Tipo inline en el archivo (líneas 67-68), no central.
- Solo 1 middleware afectado, 2 flags.

**Decisión:** **NO cerrar acá**. Razones:

- Centralizar tipo para 2 flags de 1 middleware = over-engineering.
- La convención más amplia de "control actions vs meta flags para coordinar middleware" es **B3-state**, no B5-state. Mezclar ejes es exactamente lo que rechazamos en C7 (donde se separó `patchMouseButtons` polling como issue propio en lugar de absorberlo).

**Anotación cross-eje** (no propuesta canónica acá): el fix de BUG-7 (commit `1069b87`) en `linkedEditingMiddleware` introdujo un patrón de "control actions" (`undo/startBatch`/`undo/endBatch`) en lugar de meta flags. Es un precedente bajo evaluación (per addendum 2026-04-29) que **B3-state** debe considerar cuando llegue su Fase 2.

---

## 4. Mi recomendación

**Confianza: media.** Esto es decisión de filosofía del audit, no técnica pura. Tengo opinión clara pero el peso real depende de criterios que vos tenés mejor que yo (tiempo, prioridad, costo de carga cognitiva con 18 ejes pendientes).

**Recomiendo Opción 1 (unificar a const).** Razones específicas:

1. **El audit ya tiene momentum mecánico calibrado.** B11-state, B12-state, C7, B4-state cerraron en cadena. Meter L (Opción 2) o L+RFC (Opción 3.a) acá rompe la cadencia de cierres pequeños del plan secuencial. Hay mucho drift mecánico real esperando (B5, C8, D1-cosmetic, D5, los del bloque (b)) que se beneficia de seguir cerrando S.

2. **El smell de `shutdownSolver()` es real pero está contenido y documentado.** El comentario lo señala. Vive solo en tests. No produce bugs en prod observados. Es deuda visible, no crítica.

3. **La pretensión de la factory wrapper hoy es activamente confusa** — alguien leyendo el código asume encapsulación que no existe. Eliminarla (Opción 1) reduce ambigüedad incluso si no resuelve el problema subyacente. "Honest pattern" > "aspirational pattern".

4. **Opción 2 tiene blast radius L con sub-RFC sin resolver (2.a/2.b/2.c).** Eso es trabajo de RFC, no de unificación. Si vamos por Opción 2, el output de Fase 2 dejaría de ser canónico-y-migrar y pasaría a ser RFC propio — eso es categoría (c), no (b). **Promover B5-state de (b) a (c) es defendible si la prioridad es arreglar el smell, pero genera un eje pendiente más con costo no trivial.**

5. **Opción 3 con regla aplicada bien (3.a) es Opción 2 con un middleware menos. Misma magnitud, mismo sub-RFC abierto, mismo blast radius.** Opción 3.b es Opción 1 con docs decorativas que no agregan información — el código formalizado dice más que un comment "by design".

**Lo que la recomendación pierde:** B5-state cierra **sin resolver el smell**. La pretensión vestigial se elimina pero el problema arquitectónico (state module-level que requiere workaround en tests) permanece. Si Sam decide que arreglar smells reales del audit > velocidad mecánica, Opción 2 es la respuesta correcta y mi confianza media tira para Opción 2.

---

## 5. Preguntas para Sam

### Pregunta 1 (más importante — afecta los próximos 18 ejes)

**¿La filosofía del audit prioriza "consistencia del pattern" o "arreglar el problema real"?**

Esta no es pregunta de B5-state aislada. Aplica a varios ejes (b) que vienen — ej. C5 coord systems, B6-state persistencia, A3 cross-boundary errors. Si la prioridad es consistencia → Opción 1 acá; en otros ejes → cierre por uniformidad. Si la prioridad es arreglar smells → Opción 2 acá; en otros ejes → tolerar más sub-RFCs y blast radii L.

No respondo esto en este doc. Lo dejo abierto para vos.

### Pregunta 2 (decisión inmediata)

**¿Opción 1, 2, o 3?** Si Opción 2, ¿abrimos sub-RFC para 2.a/2.b/2.c o aceptás 2.c (singleton + factory que se llama una vez) como pre-decidido? 2.c es lo que tenemos hoy; ratificarla es Opción 1 con factory wrapper preservada — esencialmente Opción 3.b.

### Pregunta 3 (alcance del unify si elegís Opción 1)

¿El unify de Opción 1 también elimina la EXPORT por separado de la factory function? Hoy `confirmationMiddleware.ts` exporta `createConfirmationMiddleware`. Si no es consumido en producción (solo en tests + index.ts), debería removerse en favor de un `export const confirmationMiddleware: Middleware = ...` único. Verifiqué: NINGÚN consumer en producción importa el factory function por nombre — solo `store/index.ts` y los tests. Removible sin breaking change.

---

## 6. Resumen ejecutivo

- **Reclasificación:** (a) mecánico → **(b) decisión arquitectónica**.
- **Tres opciones evaluadas con blast radius concreto.**
- **Recomendación:** Opción 1 con confianza media; Opción 2 si la filosofía del audit prioriza arreglar smells sobre velocidad mecánica.
- **Pregunta abierta más importante** (afecta 18 ejes): consistencia vs problema real.
- **Drift adyacente de meta flags:** no se cierra acá; observación cross-eje a B3-state.
- **Tamaño según opción:** S (Opción 1 o 3.b), L (Opción 2 o 3.a, posiblemente con sub-RFC propio).

---

**FIN FASE 2 B5-state.** Awaiting Sam's decision on Pregunta 1 (philosophy) y Pregunta 2 (option 1/2/3) antes de Fase 3.
