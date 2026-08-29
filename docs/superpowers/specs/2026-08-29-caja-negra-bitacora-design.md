# Caja negra: la bitácora — diseño

**Fecha:** 2026-08-29 · **Estado:** v2 tras revisión adversarial (Serrano, Halberg, Vex Rune) — pendiente de aprobación de Samuel
**Pedido de Samuel:** *"vamos a arreglar esos detalles de la telemetría, es muy importante que seas completamente consciente de todo lo que pasa dentro de vina"*.
**Base:** rama `feat/medidas-escritas` (PR #1089), porque los ganchos a instrumentar viven ahí. Mergear en orden #1088 → #1089 → este.

## 1. El problema, medido

El bundle de diagnóstico (`src/utils/export/diagnosticExporter.ts`) hoy lleva: `project`, `avatar`, `simulation`, dos campos de `inspector`, la cascada del solver (ring de 200 + config aplicada + manifiesto + foto de la tela), el historial causal del undo (50 mutaciones de proyecto, IDB), 50 errores, 200 ejecuciones de tools del copiloto y los records verbosos gateados.

Lo que pasa dentro de Vina y **no deja rastro**:

| Qué ocurre | Dónde vive | Rastro hoy |
|---|---|---|
| Gestos 2D: press, release, doble clic, teclas consumidas, enganche (snap), resolución de pieza anfitriona, zona muerta, botón derecho soltado, cancelaciones | refs de `usePolyPenTool`, `usePenTool`, `useRectangleTool`, `useEdgeGesture`, router `useEditorInteractions` | **ninguno** hasta que algo despacha. Los tres defectos del 29-08 (zona muerta tras Enter, release derecho creando rectángulo / confirmando nodo) eran de orden de eventos: invisibles |
| Acciones Redux que no mutan el proyecto: `editor/setActiveTool`, selección, zoom/pan, `tools/setToolOption`, **toasts que María leyó**, confirmaciones, docks, workflow | `store` | el timeline del undo solo registra mutaciones del proyecto |
| Atajos de teclado disparados | `ShortcutProvider` | ninguno |
| Menú contextual: abierto, suprimido por un gesto vivo, fila ejecutada | `PatternEditor.handleContextMenu`, `ContextMenu` | ninguno |
| `console.warn` / `console.error` de los `catch` (55 archivos, p. ej. `[PatternEditor] unfoldPiece failed`) | consola | ninguno (el `errorTracker` solo ve `window.onerror`, rechazos y boundaries) |
| Tareas largas del hilo principal | navegador | ninguno |
| Entorno: navegador, DPR, viewport, WebGPU disponible, memoria del heap, build servido | navegador | ninguno |
| Sesión: carga, pestaña oculta/visible, foco, resize | navegador | ninguno |
| Fallos de parseo de storage | `storageTelemetry` (ring de 50 que **ya existe**) | no entra al bundle |
| Señales de la capa de storage: `idb-unavailable`, `ls-fallback-write`, `ls-quota-exhausted` | `setStorageTelemetryHook` en `src/utils/storage.ts` — **sigue siendo un stub no-op** | ninguno |
| Autoguardado: ok / fallo / duración | `projectAutosave` (`.catch(() => {})`) | ninguno |
| Estado de los 20 slices fuera de los cuatro exportados (`editor`: herramienta activa, zoom, unidades, snap; `tools`: opciones de la barra; `dock`, `inputScheme`, `copilotUI`…) y los 7 campos de `inspector` que el bundle no recoge | `store` | no entran al bundle |
| Lo que pasó **antes de un crash o de una recarga** | memoria | el slot LS guarda un solo error; el contexto muere con la pestaña |

## 2. Decisión: una bitácora, muchas sondas

Un solo ring en memoria, siempre encendido, sin flag, sin storage salvo el rescate de § 5: `src/utils/telemetry/journal.ts` (ring, resumidor) y `src/utils/telemetry/journalProbes.ts` (`initJournal()`: sondas del navegador). Forma general de los rings existentes (`push` + cap), como `solverRuntimeTracker.ts` y `errorTracker.ts`; el mecanismo de fusión es propio (§ 2.1) y no el `coalesceSolverEvent` in-place del solver.

Las sondas son llamadas de una línea en las **puertas**: el router de eventos 2D ve todos los mousedown/up/keydown de todas las herramientas; el middleware ve todas las acciones; `ShortcutProvider` ve todos los atajos. **Un gancho solo registra sus salidas mudas**: toda salida que despacha ya la grabó el middleware.

Rechazado: un ring por sonda. Rechazado: registrar `mousemove` (lo que importa del movimiento —`drag`— se resume en el release).

### 2.1 Forma

```ts
export type JournalKind =
  | 'gesture' | 'action' | 'shortcut' | 'ui' | 'console'
  | 'perf' | 'session' | 'storage' | 'error' | 'solver';

export interface JournalEvent {
  /** `Date.now()` — misma base que los rings existentes. */
  t: number;
  kind: JournalKind;
  name: string;
  /** Escalares, o el resultado de `resumir` (ya pasó por JSON). Nunca referencias vivas. */
  data?: Record<string, unknown>;
  /** Presente solo si ≥ 2 eventos se fundieron en este. */
  n?: number;
  /** `t` del último fundido. */
  tLast?: number;
}

export const JOURNAL_MAX = 1000;
export const JOURNAL_TAIL = 150;

export function pushJournal(kind: JournalKind, name: string, data?: Record<string, unknown>): void;
export function getJournal(): { events: readonly JournalEvent[]; dropped: number };
export function resumir(payload: unknown): unknown;
export function clearJournal(): void;   // tests
```

**Fusión (Halberg 1, 2, 13).** No es "consecutiva": el código real dispara ráfagas heterogéneas (`setZoom2D`/`setPan2D` alternados por frame en `useEditorInteractions.ts:474-495`; `setJointRotation`/`mirrorJoint` por `pointermove` sin rAF en `usePoseDrag.ts:80-83`). La regla es **por clave**: el ring guarda un `Map<clave, JournalEvent>` con el último evento de cada clave; si llega otro de la misma clave y `t − último.tLast ≤ 1000 ms`, se funde en ese evento esté donde esté en el ring (`n++`, `tLast = t`, `data` = la más nueva). Al expulsar un evento del ring se borra su entrada del mapa.

- Clave = `kind/name`, salvo `console` y `error`, donde se añaden los primeros 40 caracteres del mensaje (para no fundir avisos distintos de una misma ráfaga).
- Kinds que se funden: todos **salvo** `gesture`, `shortcut`, `ui` y `storage` — un gesto o un atajo repetido es información, no ruido.
- Consecuencia declarada: dentro de una ráfaga se pierde el `data` de los eventos intermedios (`selectPiece A` y `selectPiece B` en un segundo → una entrada, `n: 2`, `data` de B). Lo que se conserva siempre es el conteo y el rango `t…tLast`.
- Un pan de 10 s es **una** entrada con `n ≈ 600`. Un posado con espejo de 30 s son dos entradas.

**Excluida:** `simulation/setFrameTime` (un `if` en el middleware; su valor ya está en el slice). No hay "lista": la fusión por clave es la defensa; una acción de alta frecuencia desconocida se ve en el bundle como `n` alto, no como ring vacío.

**Teclas repetidas:** el router no registra `keydown` con `e.repeat` (sostener una flecha 10 s eran 300 entradas); las acciones que produce se funden solas.

**Cap:** 1000 eventos; al entrar el 1001 sale el más viejo y `dropped++`. Memoria acotada ≈ 200 KB en el peor caso. Costo por evento: un objeto, un `push`, un `Map.get`.

**Frontera de sesión (Serrano 7):** la bitácora es de la **pestaña**, no del proyecto: no se reinicia al cargar otro proyecto. `action/project/loadProject` es la frontera visible, y una reproducción real suele ser "cargué X y luego hice Y".

### 2.2 `resumir(payload)` (Vex 1 + Halberg 8)

Un `replacer` de `JSON.stringify`, no un mini-serializador:

```ts
JSON.parse(JSON.stringify(payload, (_, v) =>
  Array.isArray(v) && v.length > 8 ? { len: v.length }
  : typeof v === 'string' && v.length > 80 ? v.slice(0, 80)
  : v));
```

`JSON.stringify` ya omite funciones, `undefined` y símbolos; el resultado es JSON por construcción (sin ciclos posibles en `data`). Un techo: si la cadena intermedia supera 600 caracteres, `data.payload = { truncated: true, chars, keys }` (`project/loadProject`, `project/restoreState` en cada undo). `project/addInternalLine` deja `{ pieceId, line: { id, type, path: { len: 4 } } }` — suficiente para saber **en qué pieza cayó la línea**. Si `stringify` lanza (ciclo en un payload, `BigInt`), `data.payload = { unserializable: message }`.

## 3. Sondas

### 3.1 Acciones — `src/store/journalMiddleware.ts`

Primero en la cadena (`concat(journalMiddleware, confirmationMiddleware, …)`) para ver también lo que la confirmación bloquea; al confirmarse, la re-emisión llega con `meta.skipConfirmation` y se ve como segunda entrada. Registra `action/<type>` con `data = { payload: resumir(payload), meta: resumir(meta) }` (`meta` completo por el mismo camino; sin lista de banderas que mantener). Header `@cascade` obligatorio (B3-state): *shape: observer; dispatches: none; side effect: append al ring; cap-depth: n/a*. Como el middleware se conecta al construir el store, ve las acciones de hidratación (`rehydrateWorkflow`, `rehydrateDocks`) que corren al importar el módulo, antes de `initJournal()`.

`copilotUI` no guarda mensajes del copiloto (solo toasts y `pendingConfirmation`): el texto de un toast **sí entra** — es lo que María leyó en pantalla.

### 3.2 Gestos 2D — router `useEditorInteractions.ts`

Una sonda por puerta, antes de enrutar a la herramienta:

| Puerta | Evento | `data` |
|---|---|---|
| `handleMouseDown` (:542) | `gesture/down` | `tool, button, x, y` (mundo, 1 decimal), `target` (`data-*` del `e.target`: pieza/vértice/tramo/interna, o el tag), `shift, ctrl, alt`. Guarda `clientX/Y` en un ref del router (Serrano 9) |
| `handleMouseUp` (:874) | `gesture/up` | `tool, button, x, y, drag` (`isDrag` contra el press guardado), `synthetic: true` si llegó sin evento (mouseleave) |
| `handleDoubleClick` (:524) | `gesture/dblclick` | `tool` |
| `handlePointerCancel` (:981) | `gesture/cancel` | `tool` |
| CF-1 `onKeyCapture` (:392-446) | `gesture/key` | `tool, key, ctrl, shift, alt, consumedBy: 'internalShape' \| 'pen' \| 'rectangle' \| null` (los únicos ganchos cuyo `handleKeyDown` devuelve `boolean`; los demás se ven por lo que despachan). No registra targets editables ni `e.repeat`. **La tecla entra ANTES de sus consecuencias** (la acción que despache el gancho) y `consumedBy` se completa al volver: por eso `pushJournal` devuelve el evento |

Y en **`Viewport3D.tsx`**, dentro de los `onPointerDown` / `onPointerUp` que **ya existen** en el contenedor (:751, :770): `gesture/down` y `gesture/up` con `surface: '3d'`, `button`. Sin `addEventListener`, sin efecto, sin doble montaje (Halberg 9).

### 3.3 Salidas mudas de los ganchos

| Gancho | Evento | `data` |
|---|---|---|
| `usePolyPenTool` | `gesture/internalShape:press` | `snap: 'firstNode' \| 'vertex' \| 'internalEnd' \| 'outline' \| null`, `hostId` (`null` = sin anfitriona: el press no arma), `deadZone`, `nodes` |
| | `gesture/internalShape:release` | `outcome: 'node' \| 'ignored'` (`ignored` = botón ≠ 0 o sin press), `nodes`. El cierre es el `project/addInternalLine` que sigue |
| | `gesture/internalShape:nextPoint` | `op: 'place' \| 'close'`, `length?`, `angle?` — Enter y Escape nacen en el input, invisibles para el router |
| `usePenTool` | `gesture/pen:press` / `pen:release` / `pen:nextPoint` | mismo catálogo (`press` con `closeArmed`) |
| `useRectangleTool` | `gesture/rectangle:release` | `outcome: 'ignoredButton' \| 'tooSmall'`, `width, height`. Clic y arrastre son el `project/addPiece` (más dos `setToolOption` en el arrastre) |
| `useEdgeGesture` | `gesture/edge:press` / `gesture/edge:miss` | `pieceId, edgeIndex, t` / (nada). El commit lo despacha cada herramienta |

Lo que **no** se registra porque ya es una acción: `complete` (→ `addInternalLine` / `addPiece` / toast "La pieza ya no existe"), `cancel` (Escape es `gesture/key`; cambio de herramienta es `editor/setActiveTool`), `locked` (→ toast "Pieza bloqueada"), `edge:commit`.

### 3.4 Atajos — `ShortcutProvider.tsx:66-73`

Tras `matchEvent`: `shortcut/<actionId>` con `{ key, ctrl, shift, alt, handled }`. `handled: false` cuando hay match sin handler registrado — hoy eso es silencio.

### 3.5 Superficies — `ui`

- `PatternEditor.handleContextMenu`: `ui/contextmenu` con `{ tool, opened }`. `opened: false` solo ocurre por un gesto vivo de la herramienta activa (costura, piquete, margen, línea interna, rectángulo, pluma — las seis ramas existen en la rama B); `tool` ya dice cuál.
- `ContextMenu` fila ejecutada: `ui/menu:action` con `{ id }` — 4 de 44 filas son callbacks puros sin dispatch.

### 3.6 Navegador — `initJournal()` en `journalProbes.ts`, llamado desde `bootstrap.tsx` **antes** de `initErrorTracker()`

Idempotente con guardia `_initialized`, como `initErrorTracker` (Serrano 5).

- `session/load` sin `data` (el `href` y el `build` van en `environment`). Marca el arranque de las sondas del navegador, **no** el primer evento: las acciones de hidratación del store lo preceden (Halberg 7).
- `visibilitychange` → `session/visibility { state }`; `focus`/`blur` → `session/focus|blur`; `resize` → `session/resize { w, h }`.
- `console.warn` y `console.error` envueltos. **Contrato (Halberg 3, 4; Serrano 12):** primero se llama al original con los args intactos; después, dentro de un `try/catch`, se formatea y se registra. Formato por argumento: `Error` → `name: message` + primera línea del stack; string → tal cual; objeto → `JSON.stringify` dentro del `try` con techo 200, y si lanza, `String(arg)`; el resto `String(arg)`. Mensaje total ≤ 300. Guardia de reentrada: si el envoltorio se llama mientras registra, solo corre el original. `journal.ts` y `journalProbes.ts` **nunca** llaman a `console`.
- `PerformanceObserver` `longtask` → `perf/longtask { ms, name }`, guardado con `supportedEntryTypes`; ausente (jsdom, Safari) → nada. Sin `event`/`slowInput`: un input lento es una tarea larga con el `gesture/down` anterior al lado.
- `setStorageTelemetryHook` → `storage/<kind>` con los escalares del evento (`idb-unavailable`, `ls-fallback-write`, `ls-quota-exhausted`): el stub deja de ser stub.
- Rescate de crash (§ 5).

### 3.7 Espejos — dueño y dirección de import (Serrano 11)

| Espejo | Dónde | Evento |
|---|---|---|
| `pushSolverEvent` (`solverRuntimeTracker.ts`) — **solo al crear fila nueva**; `coalesceSolverEvent` in-place no espeja (Serrano 1) | el tracker importa `journal` | `solver/<kind> { generation }` |
| `pushError` (`errorTracker.ts`) — la rehidratación del error persistido en `initErrorTracker` hace `errors.push` directo y **no** espeja (Serrano 8) | `errorTracker` importa `journal` | `error/error { source, message }` (≤ 200; `source` puede ser `undefined`) |
| `initProjectPersistence` (`projectAutosave.ts`): `saveToStorage(...).then(ok, fail)` con `performance.now()` alrededor — el único cambio de control de flujo de esta spec (Serrano 3) | `projectAutosave` importa `journal` | `storage/autosave { ok, ms, error? }` |

`journal.ts` importa solo `safeStorage`; `journalProbes.ts` importa `journal`, `safeStorage` y `storage` (para el hook). Ninguno importa Redux, React ni componentes. Sin ciclos.

## 4. El bundle

`DiagnosticBundle` gana:

```ts
journal: { events: JournalEvent[]; dropped: number };
environment: {
  userAgent, dpr, viewport: { w, h }, hardwareConcurrency, jsHeapUsedMB?,
  webgpu: boolean, href, build, flags: Record<string, string>
};
slices: Record<typeof EXPORTED_SLICES[number], unknown>;
storage: StorageParseFailureSnapshot;
```

- `inspector` pasa a ser el **slice completo** (superset del `Pick` actual; el e2e `diagnostico-3d` sigue leyendo los dos campos de siempre).
- `EXPORTED_SLICES` es una lista explícita con los 20 slices restantes (`editor`, `tools`, `dock`, `inputScheme`, `layout`, `workflow`, `renderSettings`, `camera`, `copilotUI`, `collisionBody`, `plugins`, `blueprints`, `marker`, `nesting`, `grading`, `bom`, `parametric`, `construction`, `animation`, `avatarTape`). Un test compara `[...4 de arriba, ...EXPORTED_SLICES]` con `Object.keys(store.getState())`: un slice nuevo rompe el test y obliga a decidir (Serrano 4). Sin saneos: `collisionBody.bodies` son ocho escalares y una URL por cuerpo, y `editor.clipboard` pesa lo que unas pocas piezas (Vex 5, 6).
- **Guardia por slice (Halberg 6, 14):** cada slice y el propio `journal` pasan por `JSON.parse(JSON.stringify(x))` dentro de un `try/catch`; si falla, ese campo sale como `{ unserializable: message }` y el resto del bundle se exporta. Así un veneno en un slice nombra al culpable en vez de dejar mudo el botón de rescate. El reintento sin foto de la tela no cambia.
- `build` = `src` del `<script>` `assets/index-*.js` (producción); en el dev server de Vite es `undefined` y el e2e **no lo aserta** (Vex).
- `flags` = todas las claves de `localStorage` que empiezan por `vina-` y cuyo valor mide ≤ 32 caracteres (banderas como `vina-use-webgpu`, `vina-debug-bridge`, el tether; nunca blobs).
- `getEnvironment` de navegador va entero en un solo `try/catch` que devuelve `{}` si algo lanza.
- `buildDiagnosticBundle(state: RootState, exportedAt?, sources?)`: el tipo se ensancha de `Pick<…>` a `RootState`; los tres call sites ya pasan `store.getState()` completo (Halberg 5).

## 5. Lo que pasó antes de un crash o una recarga (Serrano 2, Vex 2)

No se engancha a `pushError`: en `pagehide` y en `visibilitychange → hidden`, `initJournal` escribe `vina-last-journal` = `JSON.stringify(events.slice(-JOURNAL_TAIL))` dentro de un `try/catch` (LS-only, justificación inline: es síncrono y la página se está yendo; IDB no llega). Cubre boundaries, `window.onerror`, rechazos, recargas de la usuaria y cierres de pestaña; no cubre que el navegador mate la pestaña (OOM) sin avisar. Peor caso honesto: 150 × ~650 B ≈ **100 KB** (Halberg 8); la cuota de LS es 5 MB.

Al arrancar, `initJournal` lee la clave, la borra, y **antepone** (`unshift`) esos eventos al ring: con `Date.now()` como base, la sesión anterior queda en orden natural antes de las acciones de hidratación y del `session/load` de esta. Igual que `initErrorTracker` funde el error persistido (Vex 2). Los 150 cupos que ocupan salen del cap de 1000.

## 6. Costo y seguridad

- Sin red, sin cuenta, sin sink remoto (restricción global de la caja negra).
- Sin prompts: `copilotUI` no los guarda; los records verbosos siguen gateados.
- Sin geometría en los eventos: ids, contadores y un punto redondeado; los arrays > 8 se colapsan a `{ len }`.
- Sin ciclos posibles: `resumir` produce JSON; las demás sondas pasan escalares (regla en el tipo de `data` y en el comentario); y a la salida cada slice y el journal llevan su guardia.
- Cada sonda es O(1). `try/catch` solo en las sondas del navegador y en las guardias de salida.
- `journal.ts` nunca registra desde un Worker (memoria de módulo distinta: sería un ring fantasma). No aplica hoy: los eventos del solver llegan por `onmessage` en el hilo principal.
- Observado, fuera de alcance: `ShortcutProvider.tsx:56-63` no chequea `isContentEditable` como sí hace `isEditableTarget`; un atajo disparado desde un campo rico quedará registrado tal cual ocurrió.

## 7. Tests

Aserciones dentro de los casos que ya existen cuando el caso existe; archivos nuevos solo para lo nuevo (Vex 6).

Nuevos:

- `src/utils/telemetry/__tests__/journal.test.ts`: cap y `dropped`; fusión por clave **no consecutiva** (`setZoom2D`/`setPan2D` alternados → dos entradas con `n`); la ventana de 1000 ms corta la fusión; `gesture` nunca se funde; clave de `console` con prefijo del mensaje; al expulsar un evento fundible su clave desaparece; `resumir` (replacer, techo 600, `unserializable`).
- `src/utils/telemetry/__tests__/journalProbes.test.ts` (jsdom): `initJournal` idempotente; `console.warn` llama al original **primero** y registra `Error` como `name: message`; un argumento circular no lanza; reentrada no recursa; `visibilitychange → hidden` deja `session/visibility` **y** escribe la cola en LS; al iniciar, la cola persistida se antepone y la clave se borra; el hook de storage llega como `storage/<kind>`; sin `PerformanceObserver` (jsdom) todo lo anterior pasa.
- `src/store/__tests__/journalMiddleware.test.ts`: `action/<type>` con `payload` resumido y `meta`; una acción bloqueada por la confirmación queda registrada (posición en la cadena); `setFrameTime` no entra.
- `src/shortcuts/__tests__/ShortcutProvider.journal.test.tsx`: `handled` true y false.
- `tests/e2e/helpers/diagnostico.ts`: `exportBundle(page)` movido desde `diagnostico-3d.spec.ts` (Vex).

Existentes que ganan aserciones: `useEditorInteractions.teclado.test.tsx` (`consumedBy`; target editable no registra; `e.repeat` no registra), `useEditorInteractions.grammar.test.tsx` (`down`/`up` con `drag`), `usePolyPenTool.test.tsx` (press con `snap`+`hostId`; `release ignored` en el caso del botón derecho; `deadZone`; `nextPoint place`), `usePenTool.test.ts`, `useRectangleTool` (`ignoredButton`, `tooSmall`), `useEdgeGesture.test.tsx` (`press`, `miss`), `ContextMenu.curation.test.tsx` (`menu:action`), `errorTracker.test.ts` (la rehidratación no espeja; `pushError` sí), `solverRuntimeTracker` (fila nueva espeja; `coalesceSolverEvent` no), `projectAutosave.test.ts` (`autosave ok` y fallo), `diagnosticExporter.test.ts` (`journal`, `environment`, `slices`, `storage`, `inspector` completo; guardia por slice nombra al culpable; el trinquete de `EXPORTED_SLICES` contra `store.getState()`).

E2E (`tests/e2e/caja-negra-bitacora.spec.ts`): tecla `g` → clic en un vértice de una pieza → clic libre → Enter → clic derecho en el lienzo → Escape → *Archivo ▸ Exportar diagnóstico*. Sobre el JSON: `shortcut/tool.internalShape`, `gesture/down {tool:'internalShape'}`, `gesture/internalShape:press {snap:'vertex', hostId}`, `gesture/key {key:'Enter', consumedBy:'internalShape'}`, `action/project/addInternalLine` con `payload.pieceId` igual al `hostId`, `ui/contextmenu {opened:true}`, `session/load`, `slices.editor.activeTool`, `environment.viewport.w > 0`, `journal.dropped === 0`. Es la prueba de la puerta, no del cuarto.

## 8. Fuera de alcance

- Replay de la bitácora (#1087 sigue siendo el issue del replay).
- Visor dentro de la app; sink remoto; redacción.
- Stream de `mousemove`/hover; Event Timing (`slowInput`).
- `window.__VINA_JOURNAL__` (sin lector hoy; el e2e lee el JSON descargado).
- El chequeo de `isContentEditable` en `ShortcutProvider` (§ 6).
- Migrar los rings viejos.

## 9. Decisiones para Samuel

1. **Cap 1000 y cola de rescate 150** (≈ 200 KB en memoria, ≤ 100 KB en LS en el peor caso). Recomiendo así.
2. **El texto de los toasts entra a la bitácora.** Es lo que ella leyó; no hay prompts ahí. Recomiendo sí.
3. **Fusión por clave dentro de 1 s para acciones, consola, perf, sesión, error y solver** — pierde el `data` intermedio de una ráfaga pero jamás vacía el ring. Recomiendo sí; la alternativa (lista de ruido) es reactiva y ya nace incompleta.
4. **La bitácora es de la pestaña**, no del proyecto: no se reinicia al cargar otro proyecto. Recomiendo así.
5. **Rescate en `pagehide`/pestaña oculta** (cubre recargas y `window.onerror`, no OOM). Recomiendo así.
6. **Apilado sobre #1089.** Los ganchos a instrumentar viven ahí; mergear en orden A → B → este.

## 10. Registro de la revisión adversarial (29-08)

| Hallazgo | Fuente | Severidad | Qué cambió en v2 |
|---|---|---|---|
| Fusión consecutiva no aguanta `setZoom2D`/`setPan2D` alternados por frame ni `setJointRotation`/`mirrorJoint` a 120-240 Hz: ring vacío en 9 s | Halberg 1, 2, 13 | alta | Fusión **por clave** con `Map` (§ 2.1); `e.repeat` fuera |
| Envoltorio de consola sin contrato de serialización: `Error` → `{}`; objeto circular lanza en el camino de crash; recursión posible | Halberg 3, 4; Serrano 12 | alta | Contrato explícito: original primero, formato por argumento, `try/catch`, guardia de reentrada, `journal` nunca llama a `console` (§ 3.6) |
| Espejo del solver desde `coalesceSolverEvent` inundaría con NaN sostenido | Serrano 1 | alta | Solo `pushSolverEvent` al crear fila; `solver` fundible (§ 3.7) |
| Rescate de crash solo desde los boundaries; `window.onerror`, rechazos y recargas quedaban fuera | Serrano 2; Vex 2 | alta | Escritura en `pagehide`/`hidden`, sin enganchar `pushError`; se antepone al arrancar (§ 5) |
| `projectAutosave.save` no es instrumentable sin cambiar el control de flujo | Serrano 3 | alta | Declarado como el único cambio de flujo (`then(ok, fail)`) (§ 3.7) |
| `slices` sin lista ni techo; `inspector` ambiguo | Serrano 4 | alta | `EXPORTED_SLICES` explícita + trinquete contra `store.getState()`; `inspector` completo (§ 4) |
| `initJournal` sin idempotencia | Serrano 5 | alta | Guardia como `initErrorTracker` (§ 3.6) |
| Reintento de exportación repite el mismo fallo si el veneno vive en `slices`; el botón queda mudo sin decir por qué | Halberg 6, 14 | media | Guardia por slice y por journal que nombra al culpable (§ 4) |
| `moved`/`drag` en `gesture/up` sin fuente genérica | Serrano 9 | media | El router guarda el press en un ref y usa `isDrag` (§ 3.2) |
| Error persistido re-fechado al rehidratar | Serrano 8 | media | La rehidratación hace `errors.push` directo; `Date.now()` como base y sesión anterior antepuesta (§ 3.7, § 5) |
| `session/load` no es el primer evento | Halberg 7 | baja-media | Declarado: marca las sondas del navegador; el middleware ve la hidratación (§ 3.6) |
| Sonda 3D con listeners nativos: doble montaje en StrictMode sin cleanup | Halberg 9; Vex 23 | media | Va dentro de `onPointerDown`/`onPointerUp` existentes (§ 3.2) |
| `resumir` de seis reglas | Vex 1 | CERTAIN | Replacer + techo 600 + `unserializable` (§ 2.2) |
| `complete`, `cancel`, `locked`, `edge:commit`, `suppressedBy`, `nextPoint open`, outcomes de rectángulo que despachan: ya son acciones | Vex 8-14 | CERTAIN/PROBABLE | Principio "solo salidas mudas" (§ 2, § 3.3, § 3.5) |
| `consumedBy` con cuatro valores inasertables | Vex | — | Enum honesto de tres (§ 3.2) |
| `previousSession` separado, `journalTail`, `__VINA_JOURNAL__`, sink duplicado de storage, saneos de `collisionBody`/`clipboard`, `pagehide`/`online` como eventos, `slowInput`, `visibility`/`platform`/`language`/`screen`/`deviceMemory` en `environment`, `meta` a tres banderas, 13 `try/catch`, lista de ruido | Vex 2-7, 15-22, 24-26 | CERTAIN/PROBABLE | Cortados (§ 2.1, § 3.6, § 4, § 8) |
| Aserción e2e sobre `environment.build` fallaría siempre en Vite dev | Vex | CERTAIN | Quitada; `exportBundle` a `tests/e2e/helpers/` (§ 4, § 7) |
| `setStorageTelemetryHook` sigue siendo stub: el hueco más barato | Vex (observado) | — | Sonda en `initJournal` (§ 3.6) |
| Cifra de 25 KB era de caso típico | Halberg 8 | baja | 100 KB de peor caso (§ 5) |
| `DiagnosticState` es `Pick`, no `RootState` | Halberg 5 | baja | Ensanchado (§ 4) |
| `suppressedBy` para `rectangle`/`pen` sin rama | Serrano 6 | — | Artefacto: leyó la rama A; las ramas existen en B. El campo se cortó igual |
| Cita de `solverRuntimeTracker` como "mismo algoritmo" | Serrano 13 | baja | Reformulada (§ 2) |

## 11. Lo que el e2e de la puerta encontró al implementar (29-08)

- **Escape no cerraba el menú contextual 2D en navegador real.** Un `Escape` de teclado (`isTrusted`) golpea primero el atajo global `selection.deselect` en `document`; su dispatch re-renderiza `PatternEditor` de forma síncrona, y como `onClose` era una flecha inline, el efecto de `ContextMenu` quitaba y volvía a registrar su listener de `keydown` **en medio del mismo dispatch** — el DOM no invoca listeners quitados ni añadidos durante el dispatch. Un `keydown` sintético (jsdom, `dispatchEvent`) no pasa por ese camino: por eso todos los tests unitarios lo daban por bueno. Arreglado con `onClose` por ref en `ContextMenu`, `ContextMenu3D` y `ContextPanel` (mismo mecanismo); el camino de la tecla real queda fijado por `tests/e2e/caja-negra-bitacora.spec.ts`. En la bitácora ese bug se lee como `ui/contextmenu {opened:true}` → `shortcut/selection.deselect {handled:true}` → y el menú sigue: exactamente la clase de bug de orden de eventos que motivó este trabajo.
- **En vista dividida el panel 2D mide ≈ 638 px** (1280×720): un clic derecho a x=600 del patrón cae en el visor 3D, cuyo menú también usa `.context-menu`. Los e2e que abren el menú 2D deben apuntar dentro del `svg` (el helper `toScreen` no lo garantiza).
