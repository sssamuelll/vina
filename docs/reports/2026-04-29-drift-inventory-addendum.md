# Inventario de drift — Addendum (refresh 2026-04-29)

**Fecha:** 2026-04-29
**Alcance:** delta sobre `2026-04-28-drift-inventory-fase1.md` y `2026-04-28-drift-fase2-classification.md`. **No es re-inventario.** Solo capturo qué cambió en 1 día y 17 commits, y si algún eje requiere reclasificarse.
**Método:** `git log --since=2026-04-27` + lectura focalizada de los archivos tocados; verificación spot-check de los ejes cuya narrativa de Fase 1 podría haber quedado obsoleta.

---

## Resumen ejecutivo del delta

- **3 ejes cerrados / ratificados** (B11-state, B12-state, C7).
- **1 eje con decisión de producto cerrada, implementación pendiente** (C6).
- **7 BUGs fixed** (BUG-1, 2, 3, 5, 7, 9, 11). 8 BUGs siguen abiertos (BUG-4, 6, 8, 10, 12, 13, 14, 15).
- **2 patrones canónicos nuevos emergieron** que no estaban en el inventario original — uno se solidificó como precedente (zod parse en boundary), otro como precedente puntual relevante para un eje futuro (batch-action grouping para cascadas).
- **1 narrativa de eje quedó stale** (D3 — el conteo de zod usage cambió).
- **1 axis nuevo capturado durante Fase 2** que no estaba en el inventario original (`patchMouseButtons` polling — issue #629).
- **20 ejes sin cambio** (ningún commit los tocó).

Nada de esto justifica reabrir Fase 1. La cola del plan secuencial sigue siendo la guía. Solo hay que actualizar los punteros.

---

## 1. Ejes cerrados desde 2026-04-28

| ID | Cierre | Código tocado | Doc |
|---|---|---|---|
| **B11-state** | Fase 3 ejecutada (commit `e5a5867`, "unify: B11-state … XL") | 39 archivos — mayoría callsites de IDs migrados a `newId()`; helpers `uid()/lineId()/cid()` reducidos a wrappers. Excepciones documentadas en CLAUDE.md (`planTypes`, `ollama`, IDs state-encoded). | `drift-fase2-b11state-ids.md` |
| **B12-state** | Ratificado (commit `8c6e95c`) — canónico ya existía antes del inventario (`newProjectRegistry.ts` + `newProjectReset.test.ts`). Inventario lo había mal-clasificado. | 0 archivos. | `drift-fase2-b12state-newproject-reset.md` |
| **C7** | Ratificado (commit `ee2694e`) — el "drift" era feature intencional (custom pan preserva orbit-around-avatar). `patchMouseButtons` polling sí es drift, capturado como issue **#629**. | 0 archivos. | `drift-fase2-c7-camera-controls.md` |

**Verificación spot-check B11-state:** los `Date.now() + Math.random()` que sobreviven en `src/copilot/` (`ollama.ts:177,204`, `planTypes.ts:170,178`) están todos en la lista de excepciones declaradas en CLAUDE.md. Cierre confirmado.

---

## 2. Eje con decisión cerrada, implementación pendiente

### C6 — Unidades

- **Decisión ratificada** (`drift-fase2-c6-units.md`): cm para `BodyMeasurements`, mm para pattern. **Reformulado:** el drift real no es la elección de unidad sino las **conversiones scatter** (`/100`, `*0.01`, etc. distribuidas).
- **Branded types:** sacados del scope de C6, movidos al scope de C5 RFC.
- **Implementación:** centralizar conversiones en `src/utils/units/bodyConversions.ts` (o donde C5 RFC lo coloque). NO migrar storage. NO branded types.
- **Estado:** queued en cola de mecánicos. **C8 sigue bloqueado por C6-impl** según plan original.

> **Acción para Sam:** decidir si C6-impl entra antes o después de B4/B5/D1-cosmetic en la cola. El doc de Fase 2 lo deja pendiente.

---

## 3. Patrones canónicos nuevos emergidos durante el delta

Estos no son "nuevos ejes de drift". Son **patrones que ahora existen en el código** y que cambian el contexto para ejes futuros. **No son canónicos formales** — la ratificación canónica solo ocurre cuando el eje correspondiente llega a Fase 2 y los adopta explícitamente.

> **Distinción importante** (anclada por Sam en review de este addendum): hay que separar dos clases de "precedente". Confundirlas es exactamente la "ratificación por inercia" que rechazamos al reclasificar BUG-5 (donde un fix puntual de WASM self-collision no podía absorber por sí solo la pregunta de feature-paridad — esa pregunta requería A7 RFC).
>
> - **Precedente válido (input directo a Fase 2 cuando llegue):** patrón intencional, con scope claro, decidido por design. Cuando el eje correspondiente abra Fase 2, este precedente es input legítimo — no requiere re-justificación.
> - **Precedente bajo evaluación (candidato a discutir, no a asumir):** patrón que apareció dentro de un fix puntual sin pasar por una decisión de diseño explícita para el eje futuro. Que funcione como precedente es plausible, no automático. Fase 2 del eje correspondiente debe evaluarlo como **una opción**, no asumirlo como canónico.

### Precedente válido — zod parse en trust boundary

**Origen:** commit `c56d999` "harden(projectSchema)…" + cleanup `79d99a7` (#627) que agregó zod en `avatar/avatarLibrary.ts`.

**Pattern establecido:**

```ts
// src/utils/projectSchema.ts (nuevo)
import { z } from 'zod';
const Schema = z.object({...}).loose();  // forward-compat
export function parseProject(raw: unknown): Result<OpenCloProject, ZodError> { ... }
```

Aplicado en 4 entry points: `Workspace.tsx`, `FileExplorerView.tsx`, `ProjectView.tsx`, `projectIO.ts`. Reemplaza casts `as OpenCloProject` por parse con DoS bounds + key allowlist.

**Implicaciones para ejes abiertos:**

- **D3 (forms / inputs / zod):** la narrativa de Fase 1 ("zod presente pero usado solo en 3 schemas de validation.ts del copilot. UI no usa Zod") ya **no es cierta**. Inventario actualizado de zod usage = **7 sitios** (`projectSchema`, `avatarLibrary`, `workflowSlice`, `usageRecordSchema`, `userPreferences`, `validation`, `registry`). El uso es **input parsing en boundary**, no form validation. La pregunta D3 sigue abierta: ¿zod en UI inputs / form validation? Pero el contexto cambió: ahora hay un patrón canónico interno que usar como referencia.
- **A3 (cross-boundary error handling Rust↔JS):** este patrón (validar al cruzar boundary, devolver Result) es el espejo TS-side de lo que A3 tiene que decidir Rust-side. Útil como precedente cuando se redacte la propuesta de A3.
- **B6-state (persistencia):** la pregunta "versionado obligatorio" se respalda en este precedente — `projectSchema` lo logra con `.loose()` para forward-compat sin schema version.
- **Sub-track E-async-states:** cuando llegue, `projectSchema.ts` es un caso real concreto de "carga async con error semántico recuperable" que no hay que diseñar desde cero.

**Por qué válido:** el commit `c56d999` "harden(projectSchema)…" fue una decisión deliberada de hardening con scope explícito (todo cast `as OpenCloProject` reemplazado en boundary). El módulo documenta su contrato (`@module projectSchema`, "boundary", "Forward-compat", "DoS"). No es producto colateral de otro fix — es el patrón mismo siendo establecido. Cuando D3/A3/B6-state/E-async-states abran Fase 2, este precedente entra como input directo.

### Precedente bajo evaluación — batch-action grouping para cascadas (BUG-7 fix)

**Origen:** commit `1069b87` (#610) "fix: BUG-7 group linkedEditing cascade into single undo entry".

**Pattern establecido:**

```ts
// linkedEditingMiddleware.ts:
store.dispatch({ type: 'undo/startBatch', payload: label });
try {
  const result = next(action);
  isSyncing = true;
  try { runCascade(act, store); } finally { isSyncing = false; }
  return result;
} finally {
  store.dispatch({ type: 'undo/endBatch' });
}
```

Cascade dispatches se agrupan vía acciones de start/end batch (consumidas por `undoMiddleware`), **no** vía `meta.cascadeOf` flag.

**Implicaciones para ejes abiertos:**

- **B3-state (mutaciones / cascada middleware):** este es un **precedente concreto** del shape "cascade dispatches legítimos, agrupados por meta-acciones de batch". B3-state Fase 2 ya no parte de cero — parte preguntando "¿extender este patrón como canónico para todas las cascadas? ¿o `meta.cascadeOf` flag?". El doc de classification (b) plantea exactamente esa pregunta; ahora hay un side concreto.
- **B5-state (middleware patterns):** la pregunta "convención de meta flags" gana un dato: el equipo eligió **acciones de control** (`undo/startBatch`) por encima de **meta flags** para este caso. Si esa elección es canónica o ad-hoc, sigue siendo decisión abierta.

**Por qué bajo evaluación:** el shape "batch grouping" emergió **dentro** del fix de BUG-7, cuyo objetivo era resolver el undo-doble-paso del cascade. Que sirva como canónico transversal para B3-state es plausible — pero B3-state Fase 2 tiene 3+ arquitecturas en juego (cascade flag, single-reducer mutación, batch undo) y no se puede asumir que la elegida en BUG-7 sea la correcta para todos los casos de cascada (linkedEditing es una cascada simétrica de 1↔1; otras cascadas en el sistema podrían ser de 1→N o tener semánticas distintas). Cuando B3-state abra Fase 2, este precedente entra como **una opción a evaluar**, junto con las otras dos.

---

## 4. Eje cuya narrativa de Fase 1 quedó stale

### D3 — Forms / inputs / zod

Inventario decía: *"Zod presente (`v4.3.6` en deps) pero usado solo en 3 schemas de validation.ts del copilot. UI no usa Zod."*

**Estado real 2026-04-29:**

- 7 archivos importan zod (no 3).
- Uso por categoría:
  - **Boundary parsing** (carga JSON externo): `projectSchema.ts`, `avatarLibrary.ts`. Patrón nuevo.
  - **Persistencia interna versionada**: `workflowSlice.ts`, `userPreferences.ts`, `usageRecordSchema.ts`. Patrón pre-existente, no contado en inventario.
  - **Tool argument validation** (copilot): `action/tools/validation.ts`, `action/tools/registry.ts`. Patrón pre-existente, sí contado.
- **UI form validation:** sigue ausente. Esto es lo que la pregunta original de D3 apuntaba; sigue abierto.

**Acción:** cuando D3 llegue a Fase 2, partir de este conteo actualizado. La pregunta canónica no cambia (¿zod en UI? ¿`MeasurementInput`?), pero hay más precedente interno del que el inventario reflejaba.

---

## 5. Eje detectado durante Fase 2 que no estaba en Fase 1

### `patchMouseButtons` polling workaround

- **Origen:** detectado durante ratificación de C7. Capturado como **issue #629**, NO incluido en cierre de C7.
- **Sitio:** `src/components/Viewport3D/Viewport3D.tsx:184-201`.
- **Naturaleza:** polling con `setInterval` para sobreescribir mouse buttons de OrbitControls — workaround a la ausencia de API pública de drei para reasignar botones.
- **Eje sugerido para inventario:** **`C7-followup`** o **`C9` (workarounds para limitaciones de drei/three.js)**. Probablemente solo este sitio + el `useLoader('/default-avatar.glb')` dummy de C8 califican como un mismo eje "side-step de API limitada de framework".

**Acción:** dejarlo trackeado en el issue #629 hasta que se decida si forma su propio eje o se absorbe en otro (C8 toca side-stepping similar de `useLoader`).

---

## 6. Bugs cerrados / abiertos (delta)

**Cerrados** (PRs #604, 605, 606, 608, 610, 612, 614 mergeados en `main`):

- BUG-1 — bend rest distances WASM
- BUG-2 — friction prevPos WASM
- BUG-3 — seam compliance WASM
- BUG-5 — reclasificado a feature gap, **absorbido en scope de A7 RFC**
- BUG-7 — linkedEditing+undo cascade (introdujo precedente B arriba)
- BUG-9 — Three.js dispose inline en 5 sitios (input al C1 RFC: `c1-rfc-input-bug9-analysis.md`)
- BUG-11 — webclo→openclo localStorage migration

**Abiertos** (per `drift-fase2-classification.md` plan secuencial paso 6):

- BUG-4 (setConfig WASM solo substeps)
- BUG-6 (cellSize hardcoded WASM)
- BUG-8 (ACTION_LABELS undoMiddleware referencia tipos inexistentes)
- BUG-10 (double-write localStorage+IDB) — **requiere nota previa fix-options** (paso 5b del plan)
- BUG-12 (defaultSeamAllowanceWidth hardcoded duplicado)
- BUG-13 (pluginSlice enabledPlugins[] redundante)
- BUG-14 (protocol.ts código muerto)
- BUG-15 (AgenticLoop error event no manejado)

---

## 7. Reclasificación de scope para ejes abiertos

Donde el delta cambió las opciones disponibles:

| Eje | Cambio | Notas |
|---|---|---|
| **A7** (WASM/CPU equivalence) | Scope creció con BUG-5 absorbido. | Antes: 6 divergencias. Ahora: 6 divergencias + decisión "self-collision en WASM (paridad de feature) ¿o solo CPU?". RFC sigue siendo XL. |
| **C1** (Three.js buffer lifecycle) | RFC tiene input data concreto del fix BUG-9 inline (5 sitios documentados con shapes). | RFC ya no parte de cero. La pregunta "¿extraer `useDisposableGeometry`?" tiene 5 callsites reales como evidencia. |
| **C8** (mesh import bypass) | Sigue bloqueado por C6-impl. Status quo. | — |
| **D3** (forms/zod) | Conteo zod actualizado (7 sitios), patrón "zod en boundary" establecido como precedente. Pregunta core no cambia. | — |
| **A3** (cross-boundary errors Rust↔JS) | Precedente TS-side existe (`projectSchema.ts`). Útil como referencia. | — |
| **B3-state** (cascade middleware) | Precedente concreto del shape "batch-action grouping" en `linkedEditingMiddleware.ts` post-BUG-7. Cambia el side de la decisión Fase 2. | — |
| **B6-state** (persistencia) | `workflowSlice` zod-versioned + `projectSchema` zod-loose son ambos puntos de referencia válidos. | — |

**Ningún eje abierto pasa de (b) a (a) o de (c) a (b).** Las clasificaciones del classification doc siguen vigentes.

---

## 8. Lo que NO cambió

20 ejes sin commits que los toquen desde 2026-04-28: **A1, A2, A4, A5, A6, B1-state, B2-state, B7-state, B9-state, B10-state, C2, C3, C4, C5, D1, D2, D4, D5, D6, D7**.

Para todos: las narrativas y clasificaciones de Fase 1 + classification se mantienen. Cuando llegue su turno, leer ahí.

Sub-track E-async-states (B8-state + D2 + D8): no arrancado. Mismo estado.

---

## 9. Próxima parada del plan secuencial

Plan original (`drift-fase2-classification.md` § Plan secuencial):

```
[5. Fase 2 mecánicos arrancando con B11-state]
    B11-state → B12-state → C7 → B4-state → B5-state
    [C8, D1-cosmetic, D5 después; C8 ya con C6 decidido]
```

**Status:** B11-state ✅, B12-state ✅, C7 ✅. **Próximo: B4-state** (selectors export pattern).

Posible reordenamiento a discutir:
- Insertar **C6-impl** antes de B4/B5 si se quiere desbloquear C8 cuanto antes.
- O respetar el orden de calibración mecánica (B4 → B5 son S y simples) y meter C6-impl después.

> **Decisión para Sam:** ¿próximo eje = B4-state, o C6-impl?

---

## 10. Lo que este addendum NO hace

- No abre Fase 2 de ningún eje.
- No re-inventaria.
- No mergea precedentes en canónicos formales — los flag como input cuando ese eje llegue a Fase 2.
- No toca código.

---

**FIN DEL ADDENDUM.** Esperando decisión sobre próximo eje (B4-state / C6-impl / otro).
