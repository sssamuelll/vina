# Bitácora de la caja negra — plan de implementación

> **Para agentes ejecutores:** SUB-SKILL OBLIGATORIA: `superpowers:subagent-driven-development` o `superpowers:executing-plans`. Las casillas (`- [ ]`) son el registro de avance.

**Objetivo:** que el bundle de diagnóstico lleve una línea de tiempo única de todo lo que pasa dentro de Vina —gestos 2D, acciones, atajos, menús, consola, sesión, storage, errores, solver— más el entorno y todos los slices.

**Arquitectura:** un ring en memoria (`journal.ts`) con fusión por clave; sondas de una línea en las puertas (middleware, router 2D, `ShortcutProvider`, menú, `initJournal`); salidas mudas en cuatro ganchos; exportación con guardia por slice.

**Stack:** TypeScript, React 19, Redux Toolkit 2, Vitest (jsdom por pragma), Playwright.

**Spec:** `docs/superpowers/specs/2026-08-29-caja-negra-bitacora-design.md` (v2). El plan argumenta desde la spec; leer § 2.1, § 3 y § 4 antes de cada tarea.

## Restricciones globales

- Rama `feat/caja-negra-bitacora` (apilada sobre `feat/medidas-escritas`). Solo Claude; nada de codex.
- `journal.ts` y `journalProbes.ts` **nunca** llaman a `console`, no importan Redux ni React.
- `data` de un evento: escalares o el resultado de `resumir`. Nunca referencias vivas (piezas, nodos DOM, `Object3D`).
- Los ganchos registran **solo salidas mudas**; lo que despacha ya lo grabó el middleware.
- Sin UI nueva. Sin `window.__VINA_JOURNAL__`.
- Typecheck `npx tsc -b --noEmit`. Tests rojo → verde. Nunca `--no-verify`. Gate final: `npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui`.
- **Los subagentes no commitean**: dejan el árbol listo y el orquestador commitea por tarea (el hook de pre-commit typechequea todo el proyecto y otra tarea puede estar a medias).

## Mapa de archivos

| Archivo | Responsabilidad | Tarea | Dueño |
|---|---|---|---|
| `src/utils/telemetry/journal.ts` (+ test) | ring, fusión por clave, `resumir`, cola de rescate | 1 | orquestador |
| `src/store/journalMiddleware.ts` (+ test), `src/store/index.ts` | sonda de acciones, primera en la cadena | 2 | orquestador |
| `src/utils/telemetry/journalProbes.ts` (+ test), `src/bootstrap.tsx`, `src/utils/errorTracker.ts`, `src/utils/cloth/solverRuntimeTracker.ts`, `src/store/projectAutosave.ts` (+ tests existentes) | sondas del navegador, espejos | 3 | subagente A |
| `src/utils/telemetry/environment.ts`, `src/utils/export/diagnosticExporter.ts` (+ test), `tests/e2e/helpers/diagnostico.ts`, `tests/e2e/diagnostico-3d.spec.ts` | bundle: `journal`, `environment`, `slices`, `storage`, `inspector` completo, guardia por slice, trinquete | 4 | subagente B |
| `src/components/PatternEditor/useEditorInteractions.ts` (+ tests teclado/grammar) | sondas del router | 5 | orquestador |
| `usePolyPenTool.ts`, `usePenTool.ts`, `useRectangleTool.ts`, `useEdgeGesture.ts` (+ tests) | salidas mudas | 6 | orquestador |
| `src/shortcuts/ShortcutProvider.tsx` (+ test), `ContextMenu.tsx`, `PatternEditor.tsx`, `Viewport3D.tsx` | atajos, menú, 3D | 7 | orquestador |
| `tests/e2e/caja-negra-bitacora.spec.ts`, `CHANGELOG.md` | prueba de la puerta, changelog | 8 | orquestador |

---

## Tarea 1 — `journal.ts`: el contrato

**Crea:** `src/utils/telemetry/journal.ts`, `src/utils/telemetry/__tests__/journal.test.ts`.

**Produce (todas las demás tareas consumen esto tal cual):**

```ts
export type JournalKind =
  | 'gesture' | 'action' | 'shortcut' | 'ui' | 'console'
  | 'perf' | 'session' | 'storage' | 'error' | 'solver';
export interface JournalEvent {
  t: number; kind: JournalKind; name: string;
  data?: Record<string, unknown>; n?: number; tLast?: number;
}
export const JOURNAL_MAX = 1000;
export const JOURNAL_TAIL = 150;
export const JOURNAL_COALESCE_MS = 1000;
export const JOURNAL_TAIL_KEY = 'vina-last-journal';
export const RESUMIR_MAX_CHARS = 600;
export function pushJournal(kind: JournalKind, name: string, data?: Record<string, unknown>): void;
export function getJournal(): { events: readonly JournalEvent[]; dropped: number };
export function resumir(payload: unknown): unknown;
export function persistJournalTail(): void;      // LS-only, try/catch; la llama initJournal en pagehide/hidden
export function restoreJournalTail(): number;    // lee, borra la clave, antepone; devuelve cuántos
export function clearJournal(): void;            // tests
```

Reglas (spec § 2.1, § 2.2): fusión por clave (`kind/name`, más 40 chars de `data.message` para `console` y `error`) dentro de `JOURNAL_COALESCE_MS` medidos desde `tLast ?? t`, para todos los kinds salvo `gesture`, `shortcut`, `ui`, `storage`; al expulsar un evento se borra su clave del mapa. `resumir` = replacer (arrays > 8 → `{ len }`, strings > 80 recortados), techo `RESUMIR_MAX_CHARS` → `{ truncated, chars, keys }`, `stringify` lanzando → `{ unserializable }`.

- [x] Test en rojo: `npx vitest run src/utils/telemetry/__tests__/journal.test.ts`
- [x] Implementar y ver verde.

## Tarea 2 — `journalMiddleware.ts`

**Crea:** `src/store/journalMiddleware.ts`, `src/store/__tests__/journalMiddleware.test.ts`. **Modifica:** `src/store/index.ts:81` (`concat(journalMiddleware, confirmationMiddleware, …)`).

Header `@cascade` (B3-state) con *shape: observer; dispatches: none; side effect: append al ring; guard: `simulation/setFrameTime` fuera; cap-depth: n/a*. `pushJournal('action', action.type, { payload: resumir(payload), meta: resumir(meta) })` omitiendo las claves `undefined`.

Tests: tipo + payload resumido + meta; `setFrameTime` no entra; una acción bloqueada por `confirmationMiddleware` (usar `configureStore` con `[journalMiddleware, confirmationMiddleware]` y una acción destructiva sin `meta.skipConfirmation`) queda registrada.

- [x] Rojo → verde.

## Tarea 3 — sondas del navegador y espejos (subagente A)

**Crea:** `src/utils/telemetry/journalProbes.ts`, `src/utils/telemetry/__tests__/journalProbes.test.ts`.
**Modifica:** `src/bootstrap.tsx` (importar y llamar `initJournal()` **antes** de `initErrorTracker()`), `src/utils/errorTracker.ts`, `src/utils/cloth/solverRuntimeTracker.ts`, `src/store/projectAutosave.ts` y sus tests existentes (`src/utils/__tests__/errorTracker.test.ts`, el test del tracker del solver, `src/store/__tests__/projectAutosave.test.ts`).

**Produce:** `export function initJournal(): void` (idempotente con `_initialized`). Dentro, en este orden: `restoreJournalTail()`; `pushJournal('session', 'load')`; listeners `visibilitychange` (→ `session/visibility { state }` y, si `hidden`, `persistJournalTail()`), `pagehide` (→ `persistJournalTail()`), `focus`/`blur` (→ `session/focus|blur`), `resize` (→ `session/resize { w, h }`); envoltorio de `console.warn`/`console.error` con el contrato de spec § 3.6 (original primero con los args intactos; luego `try { pushJournal('console', level, { message }) } catch {}`; guardia de reentrada con una bandera de módulo; formato por argumento: `Error` → `name: message` + primera línea del stack, string tal cual, objeto → `JSON.stringify` con techo 200 y `String(arg)` si lanza, resto `String(arg)`; total ≤ 300); `PerformanceObserver` de `longtask` solo si `typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes?.includes('longtask')` → `perf/longtask { ms: Math.round(duration), name }`; `setStorageTelemetryHook(ev => pushJournal('storage', ev.type, { key: ev.key, store: 'store' in ev ? ev.store : undefined }))`.

Espejos:
- `solverRuntimeTracker.pushSolverEvent` → `pushJournal('solver', kind, { generation })` **solo** en la rama que crea fila nueva; `coalesceSolverEvent` no espeja.
- `errorTracker.pushError` → `pushJournal('error', 'error', { source: entry.source, message: entry.message.slice(0, 200) })`; en `initErrorTracker` la rehidratación pasa a `errors.push(persisted)` directo (sin espejo).
- `projectAutosave`: `const t0 = performance.now(); void saveToStorage(...).then(() => pushJournal('storage','autosave',{ ok: true, ms: Math.round(performance.now() - t0) }), (e) => pushJournal('storage','autosave',{ ok: false, ms: …, error: e instanceof Error ? e.message : String(e) }))`.

Tests (jsdom, `vi.resetModules` entre casos como hace `errorTracker.test.ts`): idempotencia (dos llamadas, un solo listener: `visibilitychange` produce un evento); `console.warn` llama al original primero (spy en el original antes de `initJournal`) y registra `Error` como `TypeError: boom`; un objeto circular no lanza y deja mensaje; reentrada: un `console.warn` disparado desde dentro de `pushJournal` (mockear `pushJournal` para que llame a `console.warn`) no recursa; `visibilitychange → hidden` deja `session/visibility` y escribe `vina-last-journal`; al iniciar con `vina-last-journal` presente, los eventos se anteponen y la clave desaparece; el hook de storage llega como `storage/idb-unavailable` (llamar `emitStorageEvent` vía `setStorageTelemetryHook` — o disparar `storageSet` con IDB roto si es más simple); sin `PerformanceObserver` nada lanza.

- [x] Rojo → verde en los cuatro archivos de test. **No commitear.**

## Tarea 4 — bundle (subagente B)

**Crea:** `src/utils/telemetry/environment.ts`, `tests/e2e/helpers/diagnostico.ts`.
**Modifica:** `src/utils/export/diagnosticExporter.ts`, `src/utils/export/__tests__/diagnosticExporter.test.ts`, `tests/e2e/diagnostico-3d.spec.ts` (importar `exportBundle` del helper).

**Produce:**

```ts
// environment.ts
export interface Environment {
  userAgent?: string; dpr?: number; viewport?: { w: number; h: number };
  hardwareConcurrency?: number; jsHeapUsedMB?: number; webgpu?: boolean;
  href?: string; build?: string; flags?: Record<string, string>;
}
export function getEnvironment(): Environment; // un solo try/catch → {} si algo lanza
```

`build` = `src` del primer `<script>` cuyo `src` incluya `assets/index-`; `flags` = claves de `localStorage` que empiezan por `vina-` con valor de ≤ 32 caracteres (usar `safeStorageLength`/`safeKey`/`safeGetItem` de `safeStorage.ts`); `jsHeapUsedMB` desde `(performance as { memory?: { usedJSHeapSize: number } }).memory` redondeado; `webgpu` = `'gpu' in navigator`.

En el exporter: `DiagnosticState` → `RootState`; `inspector: RootState['inspector']` completo; `export const EXPORTED_SLICES = ['editor','tools','dock','inputScheme','layout','workflow','renderSettings','camera','copilotUI','collisionBody','plugins','blueprints','marker','nesting','grading','bom','parametric','construction','animation','avatarTape'] as const`; `DiagnosticSources` gana `getJournal`, `getEnvironment`, `getStorageSnapshot` (= `getStorageParseFailureSnapshot`); el bundle gana `journal`, `environment`, `slices`, `storage`. Guardia: `function safeJson(value: unknown): unknown { try { return JSON.parse(JSON.stringify(value)); } catch (e) { return { unserializable: e instanceof Error ? e.message : String(e) }; } }` aplicada a cada slice y a `journal`. El reintento sin foto no cambia.

Tests: el bundle lleva `journal`, `environment`, `slices` con las 20 claves, `storage`, `inspector` completo; un slice con ciclo sale como `{ unserializable }` y el resto se exporta; trinquete `expect([...4, ...EXPORTED_SLICES].sort()).toEqual(Object.keys(store.getState()).sort())` importando `store` de `src/store` (jsdom); las fuentes inyectadas no tocan el navegador (`getEnvironment` mockeada). E2E helper: mover `exportBundle` de `tests/e2e/diagnostico-3d.spec.ts:64-77` a `tests/e2e/helpers/diagnostico.ts` exportado, y que el spec lo importe.

- [x] Rojo → verde. `npx playwright test tests/e2e/diagnostico-3d.spec.ts` sigue verde (servidor caliente en :5174). **No commitear.**

## Tarea 5 — router 2D

**Modifica:** `src/components/PatternEditor/useEditorInteractions.ts` (`handleMouseDown` :542, `handleMouseUp` :874, `handleDoubleClick` :524, `handlePointerCancel` :981, `onKeyCapture` :392-446) y `__tests__/useEditorInteractions.teclado.test.tsx`, `useEditorInteractions.grammar.test.tsx`.

`describeTarget(el)`: `data-anchor-role` si existe; si no, `'piece'` si tiene `data-piece-id` (o un ancestro `closest('[data-piece-id]')`); si no, `tagName` en minúsculas. `pressRef` con `clientX/Y` en el down; `drag: isDrag(dx, dy)` en el up. `onKeyCapture`: tras el early-return de target editable y **antes** de rutear, si `e.repeat` → nada; se registra `gesture/key` con `consumedBy` según qué gancho devolvió `true` (`'internalShape' | 'pen' | 'rectangle' | null`).

- [x] Rojo → verde.

## Tarea 6 — salidas mudas de los ganchos

**Modifica:** `usePolyPenTool.ts` (press: `snap`, `hostId`, `deadZone`, `nodes`; release: `outcome: 'node' | 'ignored'`; `placePolar`/`closeNextPoint`: `nextPoint { op, length?, angle? }`), `usePenTool.ts` (`pen:press { closeArmed }`, `pen:release`, `pen:nextPoint`), `useRectangleTool.ts` (`rectangle:release { outcome: 'ignoredButton' | 'tooSmall', width, height }`), `useEdgeGesture.ts` (`edge:press { pieceId, edgeIndex, t }` / `edge:miss`), y sus tests.

- [x] Rojo → verde.

## Tarea 7 — atajos, menú, 3D

**Modifica:** `src/shortcuts/ShortcutProvider.tsx:66-73` (`shortcut/<actionId> { key, ctrl, shift, alt, handled }`), `ContextMenu.tsx:166` (`ui/menu:action { id }`), `PatternEditor.tsx:400-424` (`ui/contextmenu { tool, opened }` en cada salida temprana y al abrir), `Viewport3D.tsx:751,770` (`gesture/down|up { surface: '3d', button }`). **Crea:** `src/shortcuts/__tests__/ShortcutProvider.journal.test.tsx`. Aserción nueva en `ContextMenu.curation.test.tsx`.

- [x] Rojo → verde.

## Tarea 8 — e2e, changelog, gates, PR

`tests/e2e/caja-negra-bitacora.spec.ts` según spec § 7 (usa `exportBundle` del helper y los helpers de `linea-interna-gramatica.spec.ts`). `CHANGELOG.md`: entrada *Added*. Gate completo + e2e nuevos y `diagnostico-3d`. PR con base `feat/medidas-escritas`.

- [x] Todo verde; PR abierto.
