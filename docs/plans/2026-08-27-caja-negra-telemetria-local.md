# Caja negra local de Vina — plan de implementación v2

## Historial

- v1 fue rechazado porque el gate, el bundle, los boundaries, la persistencia y la lectura del undo no cerraban el circuito de reproducción.
- v2 incorpora la revisión adversarial del 27-08-2026 sin reabrir sus decisiones de fondo.
- v2 cierra B1, B2, B3, A2, A3, M1, M2 y M3: separa los dos recorders, estrecha el objetivo a patrón 2D, abre la exportación desde los fallbacks, serializa las escrituras, conserva append-only y distingue cancelación y tiers.

> **Para agentes ejecutores:** SUB-SKILL OBLIGATORIA: usar `superpowers:subagent-driven-development` (recomendado) o `superpowers:executing-plans` para ejecutar este plan paso a paso. Las casillas (`- [ ]`) son el registro de avance.

**Objetivo de v1:** reproducir bugs del **patrón 2D** —coser caminando, margen de costura, líneas internas y piezas giradas— con estado local y cadena causal suficientes para convertir cada reproducción en un test de regresión.

**Arquitectura:** hay dos canales deliberadamente separados. `DebugStore` conserva prompts, reasoning y mensajes completos solo cuando `isDebugEnabled()` está encendido; un ring mínimo de 200 ejecuciones de tools permanece siempre encendido, únicamente en memoria. El bundle exporta estado Redux plano, errores, historial causal y ambos canales según su gate; el timeline diagnóstico es un ring append-only independiente de los stacks mutables de undo.

**Stack:** TypeScript, React 19, Redux Toolkit, Vitest, Testing Library, IndexedDB mediante `storageGet`/`storageSet` y descarga local mediante `Blob`.

**Especificaciones:** `C:/Users/simon/AppData/Local/Temp/claude/D--Desktop-projects-vina/a5b468bb-ac1f-4155-a4ca-9ae81c0742b5/scratchpad/contrato-plan.md` y su enmienda vinculante `C:/Users/simon/AppData/Local/Temp/claude/D--Desktop-projects-vina/a5b468bb-ac1f-4155-a4ca-9ae81c0742b5/scratchpad/contrato-enmienda.md`.

## Alcance reproducible de v1

- El bundle reproduce el patrón 2D porque lleva completos `state.project`, `state.avatar` y `state.simulation`, más el historial causal y los errores relevantes del inspector.
- Lleva `solver.activeTier` y `solver.lastSelectedTier` como hechos distintos. `state.simulation.solverTier` puede conservar el último tier elegido cuando ya no hay cliente montado y no se presenta como tier activo.
- Quedan fuera los buffers vivos del solver, las velocidades, los snapshots físicos reales y el contenido detrás de URLs `blob:`.
- Consecuencia explícita: **un bug de drapeado 3D no se reproduce desde este bundle**.
- Disparador de reapertura: el primer reporte de María que sea de drapeado y no se pueda reproducir con el estado, los errores y la configuración incluidos en v1.

## Restricciones globales

- La caja negra es local. No se crea endpoint, servidor, cuenta, sesión, sink remoto ni dependencia.
- `isDebugEnabled()` gatea solo el recorder verboso: prompts, reasoning, mensajes completos y records de `DebugStore`. Sigue apagado por defecto.
- El ring mínimo de tools no consulta el gate, no importa `DebugStore`, no escribe localStorage ni IDB y conserva como máximo 200 entradas.
- El bundle no lleva `version`, `traceId`, redacción, sanitización ni modos de consentimiento.
- No se crea base ni object store. El timeline usa `settings / undo-history-events` en la IDB canónica.
- No se persisten `undoState.past` ni `undoState.future`: contienen clones completos del proyecto y siguen siendo volátiles.
- El único `storageSet` nuevo queda en el escritor de timeline y lleva inmediatamente encima `// shape: HistoryTimelineEvent[] v1 — opt-in envelope: no`.
- El último error de boundary usa una excepción LS-only, síncrona y justificada inline: React no puede esperar IDB antes de que la usuaria recargue.
- Antes de los cambios visuales de los pasos 2 y 3, releer e invocar `.claude/skills/contrato-de-interfaz/SKILL.md`. Se reutilizan menú y fallbacks existentes; no se crea una superficie flotante.
- `undoMiddleware` conserva y actualiza su header `@cascade`; la persistencia no despacha acciones secundarias y la profundidad sigue siendo menor o igual a 1.
- No se agregan IDs de correlación. Si una necesidad nueva exige un ID, se usa `newId()` de `src/utils/ids.ts`.
- Typecheck: `npx tsc -b --noEmit`, nunca `tsc --noEmit` sin modo build.
- Antes de cada commit: test enfocado en rojo y después en verde. Gate: `npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui`.
- Nunca usar `--no-verify`. Nunca editar `scripts/ui-contract-baseline.json` para ocultar un contador nuevo.
- Los rangos de línea de este plan se verificaron contra el repo el 27-08-2026; si un paso anterior desplaza líneas, el ejecutor localiza el símbolo nombrado antes de aplicar el diff.

## Mapa de archivos

| Archivo | Responsabilidad después del plan | Pasos |
|---|---|---|
| `src/copilot/debug/debugAPI.ts` | Autoridad de la clave que habilita únicamente el recorder verboso | 0 |
| `src/copilot/debug/createDebugBridge.ts` | Gate del recorder verboso y resultado agregado de una corrida | 0, 1 |
| `src/copilot/debug/toolExecutionTracker.ts` | Ring mínimo, siempre encendido, de 200 ejecuciones | 1 |
| `src/copilot/reasoning/bridge/AgenticLoop.ts` | Clasificación complete/error/cancelled y escritura del ring mínimo | 1 |
| `src/copilot/hooks/useAgenticLoop.ts` | Estado terminal neutral para `tool:cancelled` | 1 |
| `src/utils/cloth/solverRuntimeTracker.ts` | Tier realmente activo, separado del último seleccionado | 2 |
| `src/components/Viewport3D/useSimulationLifecycle.ts` | Marca el tier activo solo tras init exitoso y lo limpia al desmontar | 2 |
| `src/utils/export/diagnosticExporter.ts` | Construcción pura del bundle y descarga JSON | 2 |
| `src/components/shell/LogoMenu.tsx` | Puerta visible `Archivo ▸ Exportar diagnóstico` | 2 |
| `src/utils/errorTracker.ts` | Ring de errores y último error de boundary recuperable tras reload | 3 |
| `src/components/ErrorBoundary/AppErrorBoundary.tsx` | Captura fatal y botón de exportación dentro del fallback | 3 |
| `src/components/ErrorBoundary/PanelErrorBoundary.tsx` | Captura de panel y botón de exportación dentro del fallback | 3 |
| `src/components/Viewport3D/SimulationErrorBoundary.tsx` | Captura del boundary interno de simulación | 3 |
| `src/components/Viewport3D/Viewport3D.tsx` | Captura del boundary exterior del visor | 3 |
| `src/store/historyTimeline.ts` | Ring causal append-only, hidratación y escritor único | 4, 5 |
| `src/store/undoMiddleware.ts` | Produce eventos causales sin rehidratar snapshots y atribuye procedencia | 4, 5 |
| `src/store/index.ts` | Arranca la hidratación del timeline | 4 |
| `src/copilot/action/tools/registry.ts` | Delimita cada dispatch originado por un tool | 5 |

---

## Paso 0 — Gatear solo el recorder verboso

### 1. Qué cambia

- Modificar `src/copilot/debug/debugAPI.ts:1-26` completo: exportar una constante única para `vina-debug-bridge` y justificar inline las dos escrituras LS-only.
- Modificar `src/copilot/debug/createDebugBridge.ts:11-37`: leer la clave con `safeGetItem` y conservar el retorno temprano sin `AgenticRecorder`, `AgenticConsoleLogger` ni `DebugStore`.
- Crear `src/copilot/debug/__tests__/createDebugBridge.test.ts`.
- Este paso no gatea ni crea el ring mínimo; el ring siempre encendido se incorpora en el paso 1 dentro de `AgenticLoop`, fuera de `createDebugBridge`.

**Interfaces:**

- Consume `safeGetItem(key: string): string | null` de `src/utils/safeStorage.ts:67-77`.
- Produce `DEBUG_BRIDGE_STORAGE_KEY = 'vina-debug-bridge'` e `isDebugEnabled(): boolean`.
- Solo el string exacto `'true'` enciende el recorder. Clave ausente, `'false'`, `'1'` o cualquier otro valor lo mantienen apagado.
- `DebugAPI.enable()` y `disable()` conservan la clave que hoy escriben en `src/copilot/debug/debugAPI.ts:23-24`.

### 2. Diff esbozado

Reemplazar `src/copilot/debug/debugAPI.ts:1-26`, incluida la llave final:

```ts
import type { DebugStore } from './DebugStore';
import { safeSetItem } from '../../utils/safeStorage';

export const DEBUG_BRIDGE_STORAGE_KEY = 'vina-debug-bridge';

export interface DebugAPI {
  getRecords: () => ReturnType<DebugStore['getAll']>;
  getFailures: () => ReturnType<DebugStore['getFailures']>;
  getRecord: (id: string) => ReturnType<DebugStore['getById']>;
  getRecent: (limit?: number) => ReturnType<DebugStore['getRecent']>;
  exportJSON: () => ReturnType<DebugStore['exportAsJSON']>;
  clear: () => void;
  enable: () => void;
  disable: () => void;
}

export function createDebugAPI(store: DebugStore): DebugAPI {
  return {
    getRecords: () => store.getAll(),
    getFailures: () => store.getFailures(),
    getRecord: (id) => store.getById(id),
    getRecent: (limit = 10) => store.getRecent(limit),
    exportJSON: () => store.exportAsJSON(),
    clear: () => store.clear(),
    // LS-only: flag síncrono y mínimo leído antes de construir el recorder verboso.
    enable: () => safeSetItem(DEBUG_BRIDGE_STORAGE_KEY, 'true'),
    // LS-only: flag síncrono y mínimo leído antes de construir el recorder verboso.
    disable: () => safeSetItem(DEBUG_BRIDGE_STORAGE_KEY, 'false'),
  };
}
```

En `src/copilot/debug/createDebugBridge.ts:11-37`:

```ts
import { safeGetItem } from '../../utils/safeStorage';
import {
  createDebugAPI,
  DEBUG_BRIDGE_STORAGE_KEY,
} from './debugAPI';

export function isDebugEnabled(): boolean {
  return safeGetItem(DEBUG_BRIDGE_STORAGE_KEY) === 'true';
}

export function createDebugAgenticLoop(
  options: AgenticLoopOptions,
): DebugAgenticLoopResult {
  if (!isDebugEnabled()) {
    return { loop: new AgenticLoop(options), store: null };
  }
  // El cuerpo verboso actual continúa sin cambios desde aquí.
}
```

No borrar `vina-debug-records`. Apagar el recorder detiene escrituras futuras, pero no destruye evidencia existente; el paso 2 decide si la incluye usando el mismo gate.

### 3. Test primero

Crear `src/copilot/debug/__tests__/createDebugBridge.test.ts` con un mock de constructor:

```ts
/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgenticLoopOptions } from '../../reasoning/bridge/AgenticLoop';

const { debugStoreConstructorMock } = vi.hoisted(() => ({
  debugStoreConstructorMock: vi.fn(),
}));

vi.mock('../DebugStore', () => ({
  DebugStore: class {
    constructor() { debugStoreConstructorMock(); }
  },
}));

import { createDebugAgenticLoop, isDebugEnabled } from '../createDebugBridge';
import { DEBUG_BRIDGE_STORAGE_KEY } from '../debugAPI';

const options = {
  send: vi.fn(),
  metaTools: [],
  actionToolDefs: [],
  getState: vi.fn(),
  dispatch: vi.fn(),
} as unknown as AgenticLoopOptions;

describe('gate del recorder verboso', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('queda apagado por defecto y no construye DebugStore', () => {
    expect(isDebugEnabled()).toBe(false);
    expect(createDebugAgenticLoop(options).store).toBeNull();
    expect(debugStoreConstructorMock).not.toHaveBeenCalled();
  });

  it('solo se enciende con el string exacto true', () => {
    localStorage.setItem(DEBUG_BRIDGE_STORAGE_KEY, '1');
    expect(isDebugEnabled()).toBe(false);
    localStorage.setItem(DEBUG_BRIDGE_STORAGE_KEY, 'true');
    expect(isDebugEnabled()).toBe(true);
    expect(createDebugAgenticLoop(options).store).not.toBeNull();
    expect(debugStoreConstructorMock).toHaveBeenCalledTimes(1);
  });
});
```

- [x] Ejecutar en rojo: `npx vitest run src/copilot/debug/__tests__/createDebugBridge.test.ts`.
- [x] Confirmar que el caso por defecto recibe `true` antes del cambio.
- [x] Aplicar el diff de producción.
- [x] Ejecutar de nuevo y confirmar `2 passed`.

### 4. Verificación

```bash
npx vitest run src/copilot/debug/__tests__/createDebugBridge.test.ts
npx tsc -b --noEmit
```

Debe verse el recorder apagado sin clave, encendido solo con `'true'` y cero construcciones de `DebugStore` en la rama apagada.

Gate antes del commit:

```bash
npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui
```

### 5. Riesgo y rollback

- Riesgo: una persona que dependía de `window.__vina_debug` siempre presente dejará de verla al recargar sin flag.
- Mitigación comprobable: ejecutar `localStorage.setItem('vina-debug-bridge', 'true')` y recargar.
- Rollback: revertir este commit restaura `return true`. No hay migración y no se borran records previos.

### 6. Tamaño

- Estimación: 8-12 líneas de producción modificadas y 45-65 líneas de prueba.
- Mergeable solo: sí; no depende de los pasos 1-5.

- [x] Commit:

```bash
git add src/copilot/debug/debugAPI.ts src/copilot/debug/createDebugBridge.ts src/copilot/debug/__tests__/createDebugBridge.test.ts
git commit -m "fix(debug): apaga el recorder verboso por defecto"
```

---

## Paso 1 — Clasificar resultados y añadir el ring mínimo siempre encendido

### 1. Qué cambia

- Crear `src/copilot/debug/toolExecutionTracker.ts` y `src/copilot/debug/__tests__/toolExecutionTracker.test.ts`: ring en memoria de 200 elementos, sin imports de storage.
- Modificar la unión `AgenticEvent` y `ToolCallRecord` en `src/copilot/reasoning/bridge/AgenticLoop.ts:31-74`.
- Modificar los tres caminos especiales de `presentToUser` en `src/copilot/reasoning/bridge/AgenticLoop.ts:184-251,304-370` y el camino genérico en `src/copilot/reasoning/bridge/AgenticLoop.ts:409-467` para que **cada** tool intentada deje un record mínimo.
- Modificar `src/copilot/debug/createDebugBridge.ts:97-156`: registrar `tool:cancelled` en el record verboso, pero agregar como fallo de corrida solo `tool:error`.
- Modificar `src/copilot/hooks/useAgenticLoop.ts:16-68,104-133` y sus tests para que una cancelación salga del estado `running` sin pintarse como éxito ni error.
- Ampliar `src/copilot/reasoning/bridge/__tests__/AgenticLoop.test.ts:79-172,208-316` y el test del bridge del paso 0.

**Censo vinculante de la revisión:**

- 242 tools registradas: 232 action tools y 10 meta-tools.
- 293 retornos explícitos con `success:false`: 291 traen `error`.
- Las 2 excepciones legítimas están en `src/copilot/action/tools/definitions/memoryTools.ts:139` y `src/copilot/action/tools/definitions/memoryTools.ts:240`: traen `message`, no `error`, porque la usuaria canceló.

**Interfaces:**

- `ToolExecutionRecord = { toolName, args, success, error, timestamp, durationMs }`.
- `success` es `true | false | null`: `null` significa cancelación neutral. `error` es `string | null`.
- Cap exacto: 200; al entrar el elemento 201 se expulsa el más antiguo.
- Resultado con `success !== false`: `tool:complete`.
- `success === false` y `error` string no vacío: `tool:error`.
- `success === false`, sin `error` y con `message` string no vacío: `tool:cancelled`.
- `success === false` sin `error` ni `message` útil: `tool:error` con `Tool "<name>" returned success:false`.
- Parse error y throw siguen siendo error. Arrays, `null`, `{ok:false}`, `{success:0}` y `{success:'false'}` siguen siendo complete.
- Una cancelación no cambia `AgenticRecord.success` a falso.

### 2. Diff esbozado

Crear `src/copilot/debug/toolExecutionTracker.ts`:

```ts
export interface ToolExecutionRecord {
  toolName: string;
  args: Record<string, unknown>;
  success: boolean | null;
  error: string | null;
  timestamp: number;
  durationMs: number;
}

const MAX_TOOL_EXECUTIONS = 200;
const records: ToolExecutionRecord[] = [];

export function pushToolExecution(record: ToolExecutionRecord): void {
  records.push(record);
  if (records.length > MAX_TOOL_EXECUTIONS) records.shift();
}

export function getToolExecutions(): readonly ToolExecutionRecord[] {
  return records;
}

export function clearToolExecutions(): void {
  records.length = 0;
}
```

Extender `AgenticEvent` en `src/copilot/reasoning/bridge/AgenticLoop.ts:31-39`:

```ts
export type AgenticEvent =
  | { type: 'tool:start'; name: string; args: Record<string, unknown> }
  | { type: 'tool:complete'; name: string; result: unknown }
  | { type: 'tool:cancelled'; name: string; message: string }
  | { type: 'tool:error'; name: string; error: string }
  | { type: 'text:delta'; content: string }
  | { type: 'complete'; content: string }
  | { type: 'error'; error: string };
```

Añadir junto a `ToolCallRecord`:

```ts
type ToolOutcome =
  | { kind: 'complete' }
  | { kind: 'cancelled'; message: string }
  | { kind: 'error'; error: string };

function classifyReturnedToolResult(name: string, result: unknown): ToolOutcome {
  if (typeof result !== 'object' || result === null || Array.isArray(result)) {
    return { kind: 'complete' };
  }
  const value = result as { success?: unknown; error?: unknown; message?: unknown };
  if (value.success !== false) return { kind: 'complete' };
  if (typeof value.error === 'string' && value.error.trim()) {
    return { kind: 'error', error: value.error };
  }
  if (typeof value.message === 'string' && value.message.trim()) {
    return { kind: 'cancelled', message: value.message };
  }
  return { kind: 'error', error: 'Tool "' + name + '" returned success:false' };
}

function toRingRecord(
  toolName: string,
  args: Record<string, unknown>,
  outcome: ToolOutcome,
  timestamp: number,
  durationMs: number,
): ToolExecutionRecord {
  return {
    toolName,
    args,
    success: outcome.kind === 'complete' ? true : outcome.kind === 'error' ? false : null,
    error: outcome.kind === 'error' ? outcome.error : null,
    timestamp,
    durationMs,
  };
}
```

En el camino genérico `src/copilot/reasoning/bridge/AgenticLoop.ts:409-467`, conservar `result`/`lastToolCalls` y sustituir la bifurcación final:

```ts
const timestamp = Date.now();
const start = performance.now();
let forcedError: string | undefined;
// parse/execute/catch actuales; parse y catch asignan forcedError
const durationMs = performance.now() - start;
const outcome: ToolOutcome = forcedError
  ? { kind: 'error', error: forcedError }
  : classifyReturnedToolResult(toolCall.name, result);

this.lastToolCalls.push({
  name: toolCall.name,
  arguments: args,
  result,
  duration: durationMs,
  isMetaTool,
});
pushToolExecution(toRingRecord(
  toolCall.name,
  args,
  outcome,
  timestamp,
  durationMs,
));

if (outcome.kind === 'error') {
  onEvent({ type: 'tool:error', name: toolCall.name, error: outcome.error });
} else if (outcome.kind === 'cancelled') {
  onEvent({ type: 'tool:cancelled', name: toolCall.name, message: outcome.message });
} else {
  onEvent({ type: 'tool:complete', name: toolCall.name, result });
}
```

Los dos rechazos y la salida exitosa de `presentToUser` deben llamar el mismo `pushToolExecution(toRingRecord(...))` antes de emitir su evento. Los rechazos usan `success:false` y el `errorMsg` existente; la salida aceptada usa `success:true`, `error:null`, args parseados y duración `0`. La salida aceptada también añade su `ToolCallRecord` a `lastToolCalls` antes de `tool:complete`, igual que ya hacen los rechazos, para que el recorder verboso no reutilice por error el tool anterior. Esto cubre los caminos que no llegan al loop genérico.

En `src/copilot/debug/createDebugBridge.ts:97-156`:

```ts
let firstToolError: string | undefined;

const wrappedOnEvent = (event: AgenticEvent) => {
  if (event.type === 'tool:error') firstToolError ??= event.error;

  if (
    event.type === 'tool:complete'
    || event.type === 'tool:cancelled'
    || event.type === 'tool:error'
  ) {
    const allCalls = loop.getLastToolCalls();
    const lastCall = allCalls[allCalls.length - 1];
    if (lastCall) {
      const error = event.type === 'tool:error' ? event.error : undefined;
      recorder.recordTurnToolResult(
        lastCall.name,
        lastCall.arguments,
        lastCall.result,
        lastCall.duration,
        lastCall.isMetaTool,
        error,
      );
      logger.logToolResult(
        lastCall.name,
        lastCall.isMetaTool,
        lastCall.result,
        lastCall.duration,
        error,
      );
    }
  }
  onEvent(event);
};

const record = recorder.finalize(
  result,
  firstToolError === undefined,
  firstToolError,
);
```

En `src/copilot/hooks/useAgenticLoop.ts:16-68`:

```ts
export interface ToolCallProgress {
  name: string;
  status: 'running' | 'done' | 'cancelled' | 'error';
  result?: unknown;
  error?: string;
  reason?: string;
}

// Dentro de reduceToolCalls:
case 'tool:cancelled':
  return settleLatestRunning(prev, event.name, {
    status: 'cancelled',
  });
```

Extraer la búsqueda repetida del último tool homónimo que siga `running` a `settleLatestRunning` y usarla también para complete/error. En `handleEvent`, incluir `case 'tool:cancelled'` junto a los otros dos estados terminales. La UI existente ya muestra un punto neutral para cualquier status distinto de `done`/`error`; no añadir copy ni color.

### 3. Test primero

En `src/copilot/debug/__tests__/toolExecutionTracker.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearToolExecutions,
  getToolExecutions,
  pushToolExecution,
} from '../toolExecutionTracker';

describe('toolExecutionTracker', () => {
  beforeEach(clearToolExecutions);

  it('mantiene solo las 200 entradas más recientes', () => {
    for (let i = 0; i < 201; i += 1) {
      pushToolExecution({
        toolName: 'tool-' + i,
        args: { i },
        success: true,
        error: null,
        timestamp: i,
        durationMs: i,
      });
    }
    expect(getToolExecutions()).toHaveLength(200);
    expect(getToolExecutions()[0].toolName).toBe('tool-1');
  });
});
```

En `src/copilot/reasoning/bridge/__tests__/AgenticLoop.test.ts` añadir:

```ts
it('separa fallo retornado, cancelación y shape ajeno', async () => {
  // Tres corridas con registry.execute retornando cada resultado.
  // 1) { success:false, error:'Piece not found' }
  expect(errorEvents).toContainEqual({
    type: 'tool:error',
    name: 'modifyEdge',
    error: 'Piece not found',
  });
  expect(getToolExecutions().at(-1)).toMatchObject({
    toolName: 'modifyEdge',
    success: false,
    error: 'Piece not found',
  });

  // 2) shape real de memoryTools.ts, líneas 139 y 240
  expect(cancelEvents).toContainEqual({
    type: 'tool:cancelled',
    name: 'clearProjectMemory',
    message: 'Cancelled — memory was not cleared.',
  });
  expect(cancelEvents.some((event) =>
    event.type === 'tool:complete' || event.type === 'tool:error'
  )).toBe(false);
  expect(getToolExecutions().at(-1)).toMatchObject({
    success: null,
    error: null,
  });

  // 3) { ok:false } no pertenece al contrato success:false.
  expect(foreignEvents).toContainEqual(expect.objectContaining({
    type: 'tool:complete',
    name: 'readLegacy',
  }));
});
```

Añadir un caso de `presentToUser` aceptado y dos rechazados que compruebe una entrada del ring por cada emisión terminal. En `src/copilot/debug/__tests__/createDebugBridge.test.ts` comprobar que fallo retornado finaliza la corrida con `success:false` y que la cancelación mantiene `success:true`. En `src/copilot/hooks/__tests__/useAgenticLoop.test.ts`:

```ts
expect(reduceToolCalls(
  [{ name: 'clearProjectMemory', status: 'running' }],
  {
    type: 'tool:cancelled',
    name: 'clearProjectMemory',
    message: 'Cancelled — memory was not cleared.',
  },
)).toEqual([{ name: 'clearProjectMemory', status: 'cancelled' }]);
```

- [x] Ejecutar los cuatro archivos en rojo.
- [x] Confirmar hoy: `success:false` retornado emite complete; no existe cancelled ni el ring.
- [x] Implementar clasificador, ring, consumo UI y agregación del recorder.
- [x] Ejecutar de nuevo y confirmar todos los casos en verde.

### 4. Verificación

```bash
npx vitest run src/copilot/debug/__tests__/toolExecutionTracker.test.ts src/copilot/reasoning/bridge/__tests__/AgenticLoop.test.ts src/copilot/debug/__tests__/createDebugBridge.test.ts src/copilot/hooks/__tests__/useAgenticLoop.test.ts
```

Debe verse:

- fallo retornado → `tool:error`, ring `success:false` y corrida verbosa fallida;
- cancelación → `tool:cancelled`, ring `success:null` y corrida no fallida;
- shape ajeno → `tool:complete`;
- `presentToUser` también entra al ring;
- 201 inserciones dejan exactamente 200 records.

Gate antes del commit:

```bash
npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui
```

### 5. Riesgo y rollback

- Riesgo: un resultado `success:false` sin `error` pero con `message` se toma como cancelación. El censo fija que hoy solo existen los dos casos legítimos de `memoryTools`; cualquier nuevo caso obliga a decidir su semántica en test.
- Riesgo: olvidar los caminos especiales de `presentToUser` violaría “cada tool”; los tres tests de esos caminos cierran esa fuga.
- Riesgo de memoria acotado: los args pueden ser grandes, pero nunca se persisten y el cap es 200.
- Rollback: revertir este commit elimina el ring y `tool:cancelled`. No hay storage que migrar.

### 6. Tamaño

- Estimación: 85-120 líneas de producción y 130-180 líneas de prueba.
- Mergeable solo: sí después del paso 0; el ring no depende del exporter.

- [x] Commit:

```bash
git add src/copilot/debug/toolExecutionTracker.ts src/copilot/debug/__tests__/toolExecutionTracker.test.ts src/copilot/reasoning/bridge/AgenticLoop.ts src/copilot/reasoning/bridge/__tests__/AgenticLoop.test.ts src/copilot/debug/createDebugBridge.ts src/copilot/debug/__tests__/createDebugBridge.test.ts src/copilot/hooks/useAgenticLoop.ts src/copilot/hooks/__tests__/useAgenticLoop.test.ts
git commit -m "fix(copilot): distingue fallos y cancelaciones en el ring local"
```

---

## Paso 2 — Exportar un bundle honesto del patrón 2D

### 1. Qué cambia

- Antes de escribir UI, invocar `contrato-de-interfaz` y releer `.claude/skills/contrato-de-interfaz/SKILL.md:29-41,139-172`.
- Crear `src/utils/cloth/solverRuntimeTracker.ts`: autoridad en memoria del tier realmente activo.
- Modificar `src/components/Viewport3D/useSimulationLifecycle.ts:522-621,624-740,744-789`: marcar active solo después de init/collision/start exitosos y limpiarlo al reiniciar o desmontar.
- Ampliar `src/components/Viewport3D/__tests__/useSimulationLifecycle.seamInit.test.tsx:198-213,286-373,406-440` con el contrato active frente a last-selected.
- Crear `src/utils/export/diagnosticExporter.ts` y `src/utils/export/__tests__/diagnosticExporter.test.ts`. La descarga reutiliza `downloadBlob` de `src/utils/export/turntableRenderer.ts:109-116`.
- Modificar `src/components/shell/LogoMenu.tsx:16-24,41-64` y `src/components/shell/__tests__/LogoMenu.test.tsx:14-44,91-128`.
- No modificar CSS en el menú: `LogoMenu` ya proporciona material, hover, foco y emplazamiento.

**Shape raíz exacto de `DiagnosticBundle`:**

- `exportedAt`;
- `project`, `avatar` y `simulation`: los tres slices Redux completos;
- `solver: { activeTier, lastSelectedTier, config }`, donde `config` es el slice `simulation`;
- `inspector: { lastSolverError, seamResolutionErrors }`, definidos en `src/store/inspectorSlice.ts:37-102`;
- `history` desde `getHistory()` (hoy `src/store/undoMiddleware.ts:95-101`; el paso 4 añade `timeline`);
- `errors` desde `getTrackedErrors()` (`src/utils/errorTracker.ts:21-24`);
- `toolExecutions` desde el ring mínimo del paso 1, siempre;
- `agentDebugRecords` desde `DebugStore.getAll()` (`src/copilot/debug/DebugStore.ts:40-43`) solo si `isDebugEnabled()` es verdadero.

**Interfaces:**

- `buildDiagnosticBundle(state, exportedAt?, sources?): DiagnosticBundle` es pura al recibir `sources`.
- `downloadDiagnosticBundle(state): void` descarga `vina-diagnostico-<ISO-seguro>.json` con JSON indentado a dos espacios.
- `solver.activeTier` viene de `getActiveSolverTier()`, no de Redux.
- `solver.lastSelectedTier` copia `state.simulation.solverTier`. El slice lo declara hoy en `src/store/simulationSlice.ts:81-145` y lo actualiza en `src/store/simulationSlice.ts:338-341`.
- Gate apagado: `agentDebugRecords: []` y `getDebugRecords` ni siquiera se invoca.
- No hay contenido binario. Una URL `blob:` puede aparecer como string dentro de un slice, pero su payload no entra al JSON.

### 2. Diff esbozado

Crear `src/utils/cloth/solverRuntimeTracker.ts`:

```ts
import type { SolverTier } from '../../store/simulationSlice';

let activeTier: SolverTier = 'none';

export function setActiveSolverTier(
  tier: Exclude<SolverTier, 'none'>,
): void {
  activeTier = tier;
}

export function clearActiveSolverTier(): void {
  activeTier = 'none';
}

export function getActiveSolverTier(): SolverTier {
  return activeTier;
}
```

En el efecto de cascade de `useSimulationLifecycle`:

```ts
clearActiveSolverTier();

// WebGPU: después de init + loadCollision y antes del return.
if (cancelled) return;
simReadyRef.current = true;
setActiveSolverTier('webgpu');
return;

// WASM: después de start y antes del return.
if (!cancelled) {
  wasmClient.start();
  setActiveSolverTier('wasm');
}
return;

// CPU: después de start y antes del return.
if (!cancelled) {
  client.start();
  setActiveSolverTier('cpu-worker');
}
return;

// Neural: solo después de init y start.
await neuralClient.initMultiPiece(placedMeshes);
if (!cancelled) {
  neuralClient.start();
  setActiveSolverTier('neural-drape');
}

// Tanto el cleanup running como el branch idle limpian runtime.
clearActiveSolverTier();
```

No mover los `dispatch(setSolverTier(...))` actuales: representan el último tier elegido/intencionado y son precisamente la fuente de `lastSelectedTier`. El tracker nuevo representa otra cosa y solo cambia tras éxito.

Crear `src/utils/export/diagnosticExporter.ts`:

```ts
import type { RootState } from '../../store';
import { DebugStore } from '../../copilot/debug/DebugStore';
import { isDebugEnabled } from '../../copilot/debug/createDebugBridge';
import { getToolExecutions } from '../../copilot/debug/toolExecutionTracker';
import { getHistory } from '../../store/undoMiddleware';
import { getActiveSolverTier } from '../cloth/solverRuntimeTracker';
import { getTrackedErrors } from '../errorTracker';
import { downloadBlob } from './turntableRenderer';

type DiagnosticState = Pick<
  RootState,
  'project' | 'avatar' | 'simulation' | 'inspector'
>;

export interface DiagnosticSources {
  getHistory: typeof getHistory;
  getTrackedErrors: typeof getTrackedErrors;
  getToolExecutions: typeof getToolExecutions;
  getActiveSolverTier: typeof getActiveSolverTier;
  isDebugEnabled: typeof isDebugEnabled;
  getDebugRecords: () => ReturnType<DebugStore['getAll']>;
}

export interface DiagnosticBundle {
  exportedAt: string;
  project: RootState['project'];
  avatar: RootState['avatar'];
  simulation: RootState['simulation'];
  solver: {
    activeTier: ReturnType<typeof getActiveSolverTier>;
    lastSelectedTier: RootState['simulation']['solverTier'];
    config: RootState['simulation'];
  };
  inspector: Pick<
    RootState['inspector'],
    'lastSolverError' | 'seamResolutionErrors'
  >;
  history: ReturnType<typeof getHistory>;
  errors: ReturnType<typeof getTrackedErrors>;
  toolExecutions: ReturnType<typeof getToolExecutions>;
  agentDebugRecords: ReturnType<DebugStore['getAll']>;
}

const browserSources: DiagnosticSources = {
  getHistory,
  getTrackedErrors,
  getToolExecutions,
  getActiveSolverTier,
  isDebugEnabled,
  getDebugRecords: () => new DebugStore().getAll(),
};

export function buildDiagnosticBundle(
  state: DiagnosticState,
  exportedAt = new Date().toISOString(),
  sources: DiagnosticSources = browserSources,
): DiagnosticBundle {
  const debugEnabled = sources.isDebugEnabled();
  return {
    exportedAt,
    project: state.project,
    avatar: state.avatar,
    simulation: state.simulation,
    solver: {
      activeTier: sources.getActiveSolverTier(),
      lastSelectedTier: state.simulation.solverTier,
      config: state.simulation,
    },
    inspector: {
      lastSolverError: state.inspector.lastSolverError,
      seamResolutionErrors: state.inspector.seamResolutionErrors,
    },
    history: sources.getHistory(),
    errors: sources.getTrackedErrors(),
    toolExecutions: sources.getToolExecutions(),
    agentDebugRecords: debugEnabled ? sources.getDebugRecords() : [],
  };
}

export function downloadDiagnosticBundle(state: DiagnosticState): void {
  const bundle = buildDiagnosticBundle(state);
  const safeTimestamp = bundle.exportedAt.replace(/[:.]/g, '-');
  downloadBlob(
    new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' }),
    'vina-diagnostico-' + safeTimestamp + '.json',
  );
}
```

En `FILE_MENU`, después de `src/components/shell/LogoMenu.tsx:63`:

```ts
{ separator: true, label: '' },
{
  label: 'Exportar diagnóstico',
  action: (dispatch) => {
    try {
      downloadDiagnosticBundle(store.getState());
    } catch {
      dispatch(showErrorToast(
        'No pude exportar el diagnóstico: el navegador no creó el archivo. Inténtalo de nuevo.',
      ));
    }
  },
},
```

Importar `showErrorToast` junto al toast existente y `downloadDiagnosticBundle` junto a los exportadores. No añadir la función solo a la paleta: `Archivo` es la puerta visible.

### 3. Test primero

Crear `src/utils/export/__tests__/diagnosticExporter.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { RootState } from '../../../store';
import {
  buildDiagnosticBundle,
  type DiagnosticSources,
} from '../diagnosticExporter';

const state = {
  project: { id: 'project-1', pieces: [{ id: 'piece-1' }] },
  avatar: { selectedProfileId: 'maria' },
  simulation: { solverTier: 'webgpu', simulationState: 'running' },
  inspector: {
    lastSolverError: { error: 'worker failed', timestamp: 20 },
    seamResolutionErrors: [{
      seamId: 'seam-1',
      reason: 'empty-match',
      message: 'No cosió',
      timestamp: 21,
    }],
  },
} as unknown as Pick<
  RootState,
  'project' | 'avatar' | 'simulation' | 'inspector'
>;

function sources(debugEnabled: boolean): DiagnosticSources {
  return {
    getHistory: vi.fn(() => ({ past: [], future: [], timeline: [] })),
    getTrackedErrors: vi.fn(() => [{ message: 'boom', timestamp: 30 }]),
    getToolExecutions: vi.fn(() => [{
      toolName: 'sewWalking',
      args: { pieceId: 'piece-1' },
      success: false,
      error: 'mismatch',
      timestamp: 10,
      durationMs: 4,
    }]),
    getActiveSolverTier: vi.fn(() => 'none'),
    isDebugEnabled: vi.fn(() => debugEnabled),
    getDebugRecords: vi.fn(() => [{ id: 'verbose-1' }]),
  } as unknown as DiagnosticSources;
}

it('exporta slices, inspector y active/last-selected por separado', () => {
  const off = sources(false);
  const bundle = buildDiagnosticBundle(
    state,
    '2026-08-27T10:11:12.000Z',
    off,
  );

  expect(bundle).toMatchObject({
    project: state.project,
    avatar: state.avatar,
    simulation: state.simulation,
    solver: {
      activeTier: 'none',
      lastSelectedTier: 'webgpu',
      config: state.simulation,
    },
    inspector: state.inspector,
    toolExecutions: [expect.objectContaining({ toolName: 'sewWalking' })],
    agentDebugRecords: [],
  });
  expect(off.getDebugRecords).not.toHaveBeenCalled();
  expect(bundle).not.toHaveProperty('version');
  expect(bundle).not.toHaveProperty('traceId');
});

it('incluye records verbosos únicamente con el gate encendido', () => {
  const on = sources(true);
  expect(buildDiagnosticBundle(state, undefined, on).agentDebugRecords)
    .toEqual([{ id: 'verbose-1' }]);
  expect(on.getDebugRecords).toHaveBeenCalledTimes(1);
});
```

En el test de lifecycle, conservar el helper actual para no romper sus callers y añadir uno que exponga el handle:

```tsx
function renderLifecycleWithHandle(
  store: ReturnType<typeof makeStore>,
  seams: SeamInitData[],
) {
  const placedMeshes = [makePlacedMesh('a'), makePlacedMesh('b')];
  const stretchingIdsRef = { current: null as Int32Array | null };
  const hook = renderHook(
    () => useSimulationLifecycle({
      placedMeshes,
      seamInitData: seams,
      elastics: [],
      fabricId: 'cotton-poplin',
      stretchingIdsRef,
    }),
    { wrapper: wrapperFor(store) },
  );
  return { placedMeshes, ...hook };
}

function renderLifecycle(
  store: ReturnType<typeof makeStore>,
  seams: SeamInitData[],
) {
  return renderLifecycleWithHandle(store, seams).placedMeshes;
}
```

Después añadir:

```ts
it('limpia activeTier al desmontar sin falsificar lastSelectedTier', async () => {
  wasmMocks.isWasmSolverAvailable.mockResolvedValue(true);
  wasmMocks.initMultiPiece.mockResolvedValue(undefined);
  const store = makeStore();
  store.dispatch(startSimulation());
  const { unmount } = renderLifecycle(store, seamInitData);

  await waitFor(() => expect(getActiveSolverTier()).toBe('wasm'));
  expect(store.getState().simulation.solverTier).toBe('wasm');

  unmount();

  expect(getActiveSolverTier()).toBe('none');
  expect(store.getState().simulation.solverTier).toBe('wasm');
});
```

En `LogoMenu.test.tsx`, mockear el exporter y comprobar:

```ts
fireEvent.click(screen.getByRole('button', { name: /vina/i }));
fireEvent.mouseEnter(screen.getByText('Archivo'));
fireEvent.click(screen.getByText('Exportar diagnóstico'));
expect(downloadDiagnosticBundleMock).toHaveBeenCalledTimes(1);
```

- [x] Invocar `contrato-de-interfaz` antes de tocar UI.
- [x] Ejecutar los tres archivos en rojo: exporter/tracker no existen y el menú no contiene la puerta.
- [x] Crear tracker/exporter y conectar lifecycle/menú.
- [x] Ejecutar de nuevo en verde.

### 4. Verificación

```bash
npx vitest run src/utils/export/__tests__/diagnosticExporter.test.ts src/components/Viewport3D/__tests__/useSimulationLifecycle.seamInit.test.tsx src/components/shell/__tests__/LogoMenu.test.tsx
node scripts/ui-contract-lint.mjs
```

Debe verse el bundle exacto, `activeTier:none` frente a `lastSelectedTier:webgpu/wasm` tras desmontaje, cero lectura de `DebugStore` con gate off y una sola descarga desde `Archivo`.

Smoke manual:

1. Ejecutar `npm run dev`.
2. Hacer una acción de patrón y abrir `Archivo ▸ Exportar diagnóstico`.
3. Confirmar `project.pieces`, `avatar`, `simulation`, `inspector.lastSolverError`, `inspector.seamResolutionErrors` y `toolExecutions`.
4. Salir de la vista que monta el solver y comprobar que `solver.activeTier` es `none` aunque `solver.lastSelectedTier` conserve el último tier.
5. Con el gate apagado, comprobar `agentDebugRecords: []`; encenderlo, ejecutar una corrida y comprobar records verbosos.

Gate antes del commit:

```bash
npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui
```

### 5. Riesgo y rollback

- Riesgo aceptado: el JSON puede contener patrón, avatar y, con gate explícito, prompts/reasoning sin redacción. La descarga no se envía sola.
- Riesgo de tier: marcar active antes de que init termine repetiría M3. Los callsites se colocan después del éxito y el test desmonta el hook.
- Riesgo de fidelidad: `simulation` no contiene buffers ni velocidades. Por eso el plan no promete drapeado 3D.
- Rollback: retirar la entrada del menú, el exporter y el tracker; limpiar sus callsites del lifecycle. No hay datos persistidos.

### 6. Tamaño

- Estimación: 100-140 líneas de producción y 120-170 líneas de prueba.
- Mergeable solo: sí sobre los pasos 0 y 1; todavía funciona antes de que los pasos 3-5 enriquezcan errores/timeline.

- [x] Commit:

```bash
git add src/utils/cloth/solverRuntimeTracker.ts src/components/Viewport3D/useSimulationLifecycle.ts src/components/Viewport3D/__tests__/useSimulationLifecycle.seamInit.test.tsx src/utils/export/diagnosticExporter.ts src/utils/export/__tests__/diagnosticExporter.test.ts src/components/shell/LogoMenu.tsx src/components/shell/__tests__/LogoMenu.test.tsx
git commit -m "feat(diagnostics): exporta la caja negra del patrón 2D"
```

---

## Paso 3 — Capturar y exportar desde los fallbacks

### 1. Qué cambia

- Antes de escribir los botones, volver a invocar `contrato-de-interfaz`.
- Modificar `src/utils/errorTracker.ts:10-39,45-67`: hacer pública la inserción, recuperar el último error de boundary y persistirlo de forma síncrona cuando el caller lo pida.
- Modificar `src/components/ErrorBoundary/AppErrorBoundary.tsx:1-68`: persistir antes del auto-save y montar `Exportar diagnóstico` antes de `Recargar la aplicación`.
- Modificar `src/components/ErrorBoundary/PanelErrorBoundary.tsx:1-48`: incluir `panelName`, persistir y montar `Exportar diagnóstico` antes de `Reiniciar el panel`.
- Modificar `src/components/Viewport3D/SimulationErrorBoundary.tsx:8-29` y `src/components/Viewport3D/Viewport3D.tsx:1-91`: reportar sus catches; añadir `componentDidCatch` al boundary exterior exportado en `src/components/Viewport3D/Viewport3D.tsx:157`.
- Modificar `src/components/ErrorBoundary/ErrorBoundary.css:1-112` solo para agrupar acciones con `var(--sp-2)` y añadir `:focus-visible` a las clases ya existentes.
- Crear `src/utils/__tests__/errorTracker.test.ts` y `src/components/ErrorBoundary/__tests__/errorTrackerBoundaries.test.tsx`.

**Interfaces:**

- Ring en memoria: 50 `TrackedError`, como hoy.
- Clave LS-only: `vina-last-boundary-error`; guarda solo el último error de boundary.
- `pushError(entry, { persistForReload?: boolean }): void` inserta primero en memoria y, si se pide, llama `safeSetItem` en el mismo stack síncrono.
- `initErrorTracker()` carga el error persistido una sola vez antes de instalar listeners. `clearTrackedErrors()` limpia memoria y esa clave.
- Los cuatro boundaries pasan `persistForReload:true`. Así un error fatal sobrevive a reload; el más reciente reemplaza al anterior.
- Fuentes exactas: `AppErrorBoundary`, `PanelErrorBoundary:<panelName>`, `SimulationErrorBoundary` y `Viewport3DErrorBoundary`.
- El botón usa `store.getState()` directamente y no depende de `AppShell`, Redux context, menú ni toast host.

### 2. Diff esbozado

En `src/utils/errorTracker.ts`:

```ts
import { safeGetItem, safeRemoveItem, safeSetItem } from './safeStorage';

export const LAST_BOUNDARY_ERROR_KEY = 'vina-last-boundary-error';

export function pushError(
  entry: TrackedError,
  options: { persistForReload?: boolean } = {},
): void {
  errors.push(entry);
  if (errors.length > MAX_ERRORS) errors.shift();
  if (options.persistForReload) {
    // LS-only: React componentDidCatch debe sobrevivir un reload y no puede esperar IDB.
    safeSetItem(LAST_BOUNDARY_ERROR_KEY, JSON.stringify(entry));
  }
}

function readPersistedBoundaryError(): TrackedError | null {
  try {
    const raw = safeGetItem(LAST_BOUNDARY_ERROR_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<TrackedError>;
    return typeof value.message === 'string' && typeof value.timestamp === 'number'
      ? value as TrackedError
      : null;
  } catch {
    return null;
  }
}

export function clearTrackedErrors(): void {
  errors.length = 0;
  // LS-only: borra la misma ranura síncrona de crash; no existe copia IDB paralela.
  safeRemoveItem(LAST_BOUNDARY_ERROR_KEY);
}

export function initErrorTracker(): void {
  if (_initialized || typeof window === 'undefined') return;
  _initialized = true;
  const persisted = readPersistedBoundaryError();
  if (persisted) pushError(persisted);
  // listeners actuales continúan debajo.
}
```

En cada `componentDidCatch` construir:

```ts
const entry = {
  message: error.message,
  source,
  timestamp: Date.now(),
  stack: [error.stack, info.componentStack]
    .filter(Boolean)
    .join('\n') || undefined,
};
pushError(entry, { persistForReload: true });
```

En `AppErrorBoundary.componentDidCatch`, la llamada anterior va antes de `saveToStorage`. En `PanelErrorBoundary`, `source` es `'PanelErrorBoundary:' + this.props.panelName`. Los console actuales se conservan.

Añadir a ambos states `exportFailed: boolean` y este handler propio:

```ts
handleExportDiagnostic = () => {
  try {
    downloadDiagnosticBundle(store.getState());
    this.setState({ exportFailed: false });
  } catch {
    this.setState({ exportFailed: true });
  }
};
```

En el fallback de app, antes de recargar:

```tsx
<div className="error-boundary-actions">
  <button className="app-error-reload" onClick={this.handleExportDiagnostic}>
    Exportar diagnóstico
  </button>
  <button className="app-error-reload" onClick={this.handleReload}>
    Recargar la aplicación
  </button>
</div>
{this.state.exportFailed && (
  <div className="app-error-save-status app-error-save-fail" role="alert">
    No pude crear el archivo de diagnóstico. Inténtalo de nuevo antes de recargar.
  </div>
)}
```

En el fallback de panel se usa el mismo orden, `panel-error-reset` y `Reiniciar el panel`. En CSS:

```css
.error-boundary-actions {
  display: flex;
  gap: var(--sp-2);
}

.panel-error-reset:focus-visible,
.app-error-reload:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
```

### 3. Test primero

En `src/utils/__tests__/errorTracker.test.ts`:

```ts
/** @vitest-environment jsdom */
import { beforeEach, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
});

it('persiste el boundary síncronamente y lo recupera al iniciar', async () => {
  const firstLoad = await import('../errorTracker');
  const entry = {
    message: 'fatal',
    source: 'AppErrorBoundary',
    timestamp: 10,
  };
  firstLoad.pushError(entry, { persistForReload: true });
  expect(JSON.parse(
    localStorage.getItem(firstLoad.LAST_BOUNDARY_ERROR_KEY)!,
  )).toEqual(entry);

  vi.resetModules();
  const afterReload = await import('../errorTracker');
  afterReload.initErrorTracker();
  expect(afterReload.getTrackedErrors()).toContainEqual(entry);
});
```

En `errorTrackerBoundaries.test.tsx`:

```tsx
const {
  downloadDiagnosticBundleMock,
  pushErrorMock,
  saveToStorageMock,
} = vi.hoisted(() => ({
  downloadDiagnosticBundleMock: vi.fn(),
  pushErrorMock: vi.fn(),
  saveToStorageMock: vi.fn(() => new Promise<void>(() => {})),
}));

function Bomb(): never {
  throw new Error('renderer exploded');
}

it('persiste antes del autosave y los fallbacks exportan sin AppShell', () => {
  const boundary = new AppErrorBoundary({ children: null });
  boundary.componentDidCatch(
    new Error('renderer exploded'),
    { componentStack: '\n at Probe' } as React.ErrorInfo,
  );
  expect(pushErrorMock.mock.invocationCallOrder[0])
    .toBeLessThan(saveToStorageMock.mock.invocationCallOrder[0]);

  render(<AppErrorBoundary><Bomb /></AppErrorBoundary>);
  fireEvent.click(screen.getByRole('button', { name: 'Exportar diagnóstico' }));
  expect(downloadDiagnosticBundleMock).toHaveBeenCalledWith(store.getState());
});
```

Añadir el equivalente de `PanelErrorBoundary` y un caso directo que llama los cuatro `componentDidCatch` y espera las cuatro fuentes exactas. Mockear `downloadDiagnosticBundle` para que lance y comprobar el `role="alert"`; el botón debe seguir montado.

- [x] Ejecutar en rojo: hoy `pushError` no es pública, no hay persistencia ni botones.
- [x] Implementar tracker, cuatro catches, fallbacks y foco.
- [x] Ejecutar de nuevo en verde.

### 4. Verificación

```bash
npx vitest run src/utils/__tests__/errorTracker.test.ts src/components/ErrorBoundary/__tests__/errorTrackerBoundaries.test.tsx src/utils/export/__tests__/diagnosticExporter.test.ts
node scripts/ui-contract-lint.mjs
```

Debe verse:

- cuatro fuentes distinguibles;
- LS escrita síncronamente antes del auto-save;
- error recuperado tras reset de módulos;
- exportación desde los fallbacks de app y panel;
- mensaje inline si la descarga falla;
- contrato visual en código 0.

Smoke manual: provocar un boundary de panel, exportar desde su fallback; provocar el boundary raíz, exportar antes de recargar; recargar y volver a exportar para confirmar que el error fatal persistido sigue en `errors`.

Gate antes del commit:

```bash
npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui
```

### 5. Riesgo y rollback

- Riesgo de cuota acotado: solo se conserva un `TrackedError`, no un ring persistido. Si LS falla, `safeSetItem` degrada a memoria y el botón inmediato todavía puede exportarlo.
- Riesgo de duplicado: tras reload, el error persistido entra una vez en el ring nuevo. No se borra automáticamente porque otro reload antes de exportar volvería a perderlo.
- Riesgo de acceso resuelto: los botones viven dentro de los fallbacks que sustituyen el árbol, no dentro de `LogoMenu`.
- Rollback: retirar botones/callsites y la ranura LS. `clearTrackedErrors()` permite limpiar el valor; no hay migración IDB.

### 6. Tamaño

- Estimación: 85-120 líneas de producción/CSS y 100-150 líneas de prueba.
- Mergeable solo: sí sobre el paso 2, porque los botones consumen el exporter ya creado.

- [x] Commit:

```bash
git add src/utils/errorTracker.ts src/utils/__tests__/errorTracker.test.ts src/components/ErrorBoundary/AppErrorBoundary.tsx src/components/ErrorBoundary/PanelErrorBoundary.tsx src/components/ErrorBoundary/ErrorBoundary.css src/components/Viewport3D/SimulationErrorBoundary.tsx src/components/Viewport3D/Viewport3D.tsx src/components/ErrorBoundary/__tests__/errorTrackerBoundaries.test.tsx
git commit -m "fix(errors): exporta desde los fallbacks y conserva el crash"
```

---

## Paso 4 — Persistir un timeline append-only con un solo escritor

### 1. Qué cambia

- Crear `src/store/historyTimeline.ts`: ring lógico append-only de 50 eventos, hidratación, debounce, flush y escritor serializado/coalescido.
- Crear `src/store/__tests__/historyTimeline.persistence.test.ts`.
- Modificar tipos/API de `src/store/undoMiddleware.ts:32-39,55-101` para exponer el timeline sin confundirlo con `pastEntries`/`futureEntries`.
- Modificar los dos sitios de creación de entradas en `src/store/undoMiddleware.ts:206-225,432-447`: guardar una copia inmutable en el timeline, nunca el mismo objeto del stack vivo.
- Modificar el reset en `src/store/undoMiddleware.ts:458-465` y el header `@cascade` en `src/store/undoMiddleware.ts:318-329`.
- Modificar `src/store/index.ts:28,34-85` para iniciar hidratación después de crear el store y antes de las demás hidrataciones.
- Reutilizar el patrón de debounce/`visibilitychange` de `src/store/projectAutosave.ts:89-116`, pero agregar la serialización que ese writer no necesita.

**Interfaces:**

- `getHistory(): { past, future, timeline }`. `past`/`future` siguen indexando únicamente snapshots vivos.
- `HistoryTimelineEvent` en este paso tiene `kind:'historyEntry'`, `label`, `actionType` y `timestamp`.
- “Append-only” significa: dentro de la ventana retenida nunca se hace pop ni se muta un evento; solo se agrega al final y se expulsa el más antiguo al superar 50.
- `pastEntries` y `futureEntries` conservan su push/pop actual en `src/store/undoMiddleware.ts:333-368`. No se hidratan.
- `initHistoryTimelinePersistence(): Promise<void>` es idempotente.
- Clave canónica: `settings / undo-history-events` mediante `storageGet`/`storageSet` de `src/utils/storage.ts:152-180`.
- Debounce: 250 ms. Múltiples cambios durante la ventana producen un solo snapshot pendiente.
- Existe una sola promesa escritora. Si llegan eventos durante una escritura, reemplazan el pending snapshot y se escriben después de la escritura activa, nunca en paralelo.
- `flushHistoryTimeline()` cancela el timer y drena el último snapshot. `visibilitychange → hidden` lo invoca.
- Un reset durante hidratación incrementa la generación, descarta la lectura vieja y agenda el timeline vacío.

### 2. Diff esbozado

Crear `src/store/historyTimeline.ts`:

```ts
import { storageGet, storageSet } from '../utils/storage';

export const HISTORY_TIMELINE_MAX = 50;
export const HISTORY_WRITE_DEBOUNCE_MS = 250;
const HISTORY_STORAGE_KEY = 'undo-history-events';

export interface HistoryActionEvent {
  kind: 'historyEntry';
  label: string;
  actionType: string;
  timestamp: number;
}

export type HistoryTimelineEvent = HistoryActionEvent;

let timeline: HistoryTimelineEvent[] = [];
let hydrated = false;
let dirty = false;
let generation = 0;
let hydrationPromise: Promise<void> | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let pendingSnapshot: HistoryTimelineEvent[] | null = null;
let writerPromise: Promise<void> | null = null;
let visibilityInstalled = false;
let flushRequestedBeforeHydration = false;

function snapshot(): HistoryTimelineEvent[] {
  return timeline.map((event) => ({ ...event }));
}

async function drainWrites(): Promise<void> {
  while (pendingSnapshot) {
    const nextSnapshot = pendingSnapshot;
    pendingSnapshot = null;
    try {
      // shape: HistoryTimelineEvent[] v1 — opt-in envelope: no
      await storageSet('settings', HISTORY_STORAGE_KEY, nextSnapshot);
    } catch {
      // Degradación silenciosa ratificada: la sesión conserva el ring en memoria.
    }
  }
}

function startWriter(): Promise<void> {
  if (!writerPromise) {
    writerPromise = drainWrites().finally(() => {
      writerPromise = null;
      if (pendingSnapshot) void startWriter();
    });
  }
  return writerPromise;
}

function queueLatestSnapshot(): Promise<void> {
  pendingSnapshot = snapshot();
  return startWriter();
}

function schedulePersist(): void {
  dirty = true;
  if (!hydrated) return;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    if (!dirty) return;
    dirty = false;
    void queueLatestSnapshot();
  }, HISTORY_WRITE_DEBOUNCE_MS);
}

export function appendHistoryTimelineEvent(
  event: HistoryTimelineEvent,
): void {
  timeline.push({ ...event });
  if (timeline.length > HISTORY_TIMELINE_MAX) timeline.shift();
  schedulePersist();
}

export function getHistoryTimeline(): readonly HistoryTimelineEvent[] {
  return timeline;
}

export function resetHistoryTimeline(): void {
  generation += 1;
  timeline = [];
  schedulePersist();
}

export function flushHistoryTimeline(): Promise<void> {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (!hydrated) {
    flushRequestedBeforeHydration = true;
    return writerPromise ?? Promise.resolve();
  }
  if (dirty) {
    dirty = false;
    return queueLatestSnapshot();
  }
  return writerPromise ?? Promise.resolve();
}
```

Completar el mismo archivo con hidratación y listener:

```ts
async function hydrate(): Promise<void> {
  const requestedGeneration = generation;
  let stored: HistoryTimelineEvent[] | undefined;
  try {
    stored = await storageGet<HistoryTimelineEvent[]>(
      'settings',
      HISTORY_STORAGE_KEY,
    );
  } catch {
    stored = undefined;
  }

  if (requestedGeneration === generation && Array.isArray(stored)) {
    timeline = [...stored.map((event) => ({ ...event })), ...timeline]
      .slice(-HISTORY_TIMELINE_MAX);
  }

  hydrated = true;
  if (flushRequestedBeforeHydration) {
    flushRequestedBeforeHydration = false;
    dirty = false;
    await queueLatestSnapshot();
  } else if (dirty || requestedGeneration !== generation) {
    schedulePersist();
  }
}

function installVisibilityFlush(): void {
  if (visibilityInstalled || typeof document === 'undefined') return;
  visibilityInstalled = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      void flushHistoryTimeline();
    }
  });
}

export function initHistoryTimelinePersistence(): Promise<void> {
  installVisibilityFlush();
  hydrationPromise ??= hydrate();
  return hydrationPromise;
}
```

En `undoMiddleware`, importar las cuatro APIs del módulo. Sustituir `getHistory`:

```ts
export function getHistory(): {
  past: HistoryEntry[];
  future: HistoryEntry[];
  timeline: HistoryTimelineEvent[];
} {
  return {
    past: [...undoState.pastEntries],
    future: [...undoState.futureEntries],
    timeline: [...getHistoryTimeline()],
  };
}
```

Añadir un único helper de creación:

```ts
function rememberHistoryEntry(entry: HistoryEntry): void {
  undoState.pastEntries.push(entry);
  appendHistoryTimelineEvent({
    kind: 'historyEntry',
    label: entry.label,
    actionType: entry.actionType,
    timestamp: entry.timestamp,
  });
}
```

Usarlo tanto en `finalizeExplicitBatch` como en el branch normal. La copia del timeline es un objeto distinto: un pop de `pastEntries` o el enriquecimiento mutable del paso 5 no puede reescribir el pasado diagnóstico.

En reset:

```ts
undoState.past.length = 0;
undoState.future.length = 0;
undoState.pastEntries.length = 0;
undoState.futureEntries.length = 0;
resetHistoryTimeline();
resetExplicitBatchState();
bumpRevision();
```

Actualizar `@cascade` con:

```ts
 * side effect: append/reset del timeline; el writer IDB debounced no despacha
```

En `src/store/index.ts`:

```ts
import {
  initHistoryTimelinePersistence,
} from './historyTimeline';

// Después de configureStore y antes de loadWorkflow:
void initHistoryTimelinePersistence();
```

### 3. Test primero

Crear `src/store/__tests__/historyTimeline.persistence.test.ts` con módulos reseteados por caso y storage mockeado:

```ts
const { storageGetMock, storageSetMock } = vi.hoisted(() => ({
  storageGetMock: vi.fn(),
  storageSetMock: vi.fn(),
}));

vi.mock('../../utils/storage', () => ({
  storageGet: storageGetMock,
  storageSet: storageSetMock,
}));

const eventAt = (timestamp: number): HistoryTimelineEvent => ({
  kind: 'historyEntry',
  label: 'Edit Piece',
  actionType: 'project/updatePiece',
  timestamp,
});

it('debouncea, serializa y coalesce al snapshot más reciente', async () => {
  let resolveFirst!: () => void;
  let concurrent = 0;
  let maxConcurrent = 0;
  storageGetMock.mockResolvedValue([]);
  storageSetMock
    .mockImplementationOnce(async () => {
      concurrent += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise<void>((resolve) => { resolveFirst = resolve; });
      concurrent -= 1;
    })
    .mockImplementation(async () => {
      concurrent += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      concurrent -= 1;
    });

  await initHistoryTimelinePersistence();
  appendHistoryTimelineEvent(eventAt(1));
  appendHistoryTimelineEvent(eventAt(2));
  await vi.advanceTimersByTimeAsync(HISTORY_WRITE_DEBOUNCE_MS);
  expect(storageSetMock).toHaveBeenCalledTimes(1);

  appendHistoryTimelineEvent(eventAt(3));
  appendHistoryTimelineEvent(eventAt(4));
  await vi.advanceTimersByTimeAsync(HISTORY_WRITE_DEBOUNCE_MS);
  expect(storageSetMock).toHaveBeenCalledTimes(1);

  resolveFirst();
  await flushHistoryTimeline();

  expect(storageSetMock).toHaveBeenCalledTimes(2);
  expect(storageSetMock.mock.calls[1][2]).toHaveLength(4);
  expect(maxConcurrent).toBe(1);
});
```

Añadir estos contratos concretos:

```ts
it('visibilitychange hidden hace flush sin esperar 250 ms', async () => {
  await initHistoryTimelinePersistence();
  appendHistoryTimelineEvent(eventAt(1));
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: 'hidden',
  });
  document.dispatchEvent(new Event('visibilitychange'));
  await Promise.resolve();
  expect(storageSetMock).toHaveBeenCalledTimes(1);
});

it('fusiona lectura tardía sin fabricar undo', async () => {
  // storageGet queda pendiente; el middleware crea una entrada de sesión.
  // Resolver con un evento persistido produce timeline [stored, session].
  expect(getHistory().timeline.map((event) => event.timestamp)).toEqual([1, 2]);
  expect(getHistory().past).toHaveLength(1);
  expect(canUndo()).toBe(true);
  store.dispatch({ type: 'editor/undo' });
  expect(canUndo()).toBe(false);
  expect(getHistory().timeline).toHaveLength(2);
});

it('un reset durante la lectura descarta el proyecto anterior', async () => {
  const hydration = initHistoryTimelinePersistence();
  resetHistoryTimeline();
  resolveRead([eventAt(1)]);
  await hydration;
  await flushHistoryTimeline();
  expect(getHistoryTimeline()).toEqual([]);
  expect(storageSetMock).toHaveBeenLastCalledWith(
    'settings',
    'undo-history-events',
    [],
  );
});
```

- [x] Ejecutar en rojo: el módulo y `timeline` no existen.
- [x] Implementar primero el writer y demostrar debounce/serialización.
- [x] Integrar luego `undoMiddleware` e hidratación.
- [x] Ejecutar en verde y comprobar que ningún test rehidrata `past`/`future`.

### 4. Verificación

```bash
npx vitest run src/store/__tests__/historyTimeline.persistence.test.ts src/store/__tests__/undoMiddleware.batchOwnership.test.ts src/__tests__/store.test.ts
```

Debe verse:

- una escritura para múltiples eventos dentro de 250 ms;
- máximo de una escritura concurrente;
- una segunda escritura con el snapshot más reciente, no una por dispatch;
- flush al ocultar;
- lectura tardía fusionada sin snapshots falsos;
- reset durante lectura persistido como `[]`.

Gate antes del commit:

```bash
npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui
```

### 5. Riesgo y rollback

- Riesgo evitado: persistir o hidratar `pastEntries` haría que `canUndo`/`jumpToIndex` afirmaran capacidad sin clones. El timeline usa copias separadas.
- Riesgo evitado: dos `storageSet` fire-and-forget pueden terminar fuera de orden. El drain serializado impide que un snapshot viejo gane al nuevo.
- Riesgo: el navegador puede terminar el proceso antes de que IDB complete el flush. `visibilitychange` reduce la ventana; no se promete durabilidad síncrona de IDB.
- Fallo IDB/LS: la sesión conserva el ring en memoria y puede exportarlo antes de recargar.
- Rollback: quitar init/integración detiene nuevas escrituras. La clave queda inerte; no hacer limpieza destructiva durante rollback.

### 6. Tamaño

- Estimación: 130-180 líneas de producción y 140-200 líneas de prueba.
- Mergeable solo: sí; el paso 2 recoge `timeline` automáticamente por `getHistory()`.

- [x] Commit:

```bash
git add src/store/historyTimeline.ts src/store/undoMiddleware.ts src/store/index.ts src/store/__tests__/historyTimeline.persistence.test.ts
git commit -m "feat(history): persiste un timeline causal serializado"
```

---

## Paso 5 — Añadir la señal neutral `rapidUndoAfterAgent`

### 1. Qué cambia

- El paso **sobrevive en v1** porque agrega un evento nuevo; no muta timestamps ni abandona append-only.
- Modificar `HistoryEntry` en `src/store/undoMiddleware.ts:32-39` para guardar procedencia del tool y el instante de su última mutación agrupada.
- Modificar batch explícito y batching automático en `src/store/undoMiddleware.ts:196-225,411-447` para no mezclar agente/María.
- Modificar el branch de undo en `src/store/undoMiddleware.ts:333-352`: después del pop real de `pastEntries`, añadir un evento `rapidUndoAfterAgent` si cumple la ventana.
- Extender la unión de `src/store/historyTimeline.ts` con el evento nuevo.
- Modificar `src/copilot/action/tools/registry.ts:11-14,291-312` para envolver cada dispatch, no el await completo del tool.
- Crear `src/store/__tests__/undoMiddleware.agentFeedback.test.ts`.

**Semántica — no negociable:**

- `rapidUndoAfterAgent` **no significa fallo del agente**. También puede ser exploración, preferencia o cambio de opinión.
- Es una señal para revisión manual; no incrementa un contador de fallos, no cambia `AgenticRecord.success` y no alimenta `tool:error`.
- Un undo no crea entrada en `pastEntries`: hace pop y mueve la entrada a `futureEntries` en `src/store/undoMiddleware.ts:342-343`. El detector corre sobre esa entrada movida.
- `AGENT_UNDO_WINDOW_MS = 10_000`, inclusivo. 10.000 ms genera señal; 10.001 ms no.
- El evento original `historyEntry` nunca se modifica. El evento adicional lleva los datos necesarios para revisión.
- Un undo despachado por un tool no representa reacción humana y no genera la señal.

**Interfaces:**

- `HistoryEntry.agent?: { toolName: string; lastMutationAt: number }`.
- `withAgentHistorySource<T>(toolName, dispatch): T` restaura contexto en `finally`.
- `RapidUndoAfterAgentEvent = { kind, timestamp, toolName, actionType, actionTimestamp, lastMutationAt, latencyMs }`.
- No se añade `traceId` ni `meta.*` Redux. La procedencia vive solo durante la llamada síncrona a dispatch.

### 2. Diff esbozado

En `undoMiddleware`:

```ts
export const AGENT_UNDO_WINDOW_MS = 10_000;

export interface HistoryEntry {
  label: string;
  actionType: string;
  timestamp: number;
  agent?: {
    toolName: string;
    lastMutationAt: number;
  };
}

let activeAgentToolName: string | null = null;

export function withAgentHistorySource<T>(
  toolName: string,
  dispatch: () => T,
): T {
  const previous = activeAgentToolName;
  activeAgentToolName = toolName;
  try {
    return dispatch();
  } finally {
    activeAgentToolName = previous;
  }
}

function makeHistoryEntry(
  label: string,
  actionType: string,
  timestamp: number,
  agentToolName = activeAgentToolName,
): HistoryEntry {
  return {
    label,
    actionType,
    timestamp,
    ...(agentToolName
      ? { agent: { toolName: agentToolName, lastMutationAt: timestamp } }
      : {}),
  };
}
```

Añadir `batchAgentToolName` y `batchLastMutationAt` a `UndoState`. La primera mutación de un batch captura el tool; cada mutación actualiza lastMutation. `finalizeExplicitBatch` copia ambos valores antes de `resetExplicitBatchState()` y crea una sola entrada con esa procedencia.

Hacer source-aware el batching automático:

```ts
const now = Date.now();
const previousEntry = undoState.pastEntries.at(-1);
const previousSource = previousEntry?.agent?.toolName ?? null;
const isSameSource = previousSource === activeAgentToolName;
const isSameAction =
  actionType === undoState.batchingAction
  && isSameSource;
const isRecent =
  (now - undoState.lastSnapshotTime) < UNDO_BATCH_MS;

if (!(isSameAction && isRecent)) {
  const currentProject = (store.getState() as RootState).project;
  const snapshot = safeClone(currentProject);
  if (!snapshot) return next(action);
  undoState.past.push(snapshot);
  rememberHistoryEntry(makeHistoryEntry(
    getActionLabel(actionType),
    actionType,
    now,
  ));
  if (undoState.past.length > MAX_HISTORY) {
    undoState.past.shift();
    undoState.pastEntries.shift();
  }
} else if (previousEntry?.agent) {
  // Solo se muta el índice vivo del stack; el evento timeline es otra copia.
  previousEntry.agent.lastMutationAt = now;
}
```

Extender `historyTimeline.ts`:

```ts
export interface RapidUndoAfterAgentEvent {
  kind: 'rapidUndoAfterAgent';
  timestamp: number;
  toolName: string;
  actionType: string;
  actionTimestamp: number;
  lastMutationAt: number;
  latencyMs: number;
}

export type HistoryTimelineEvent =
  | HistoryActionEvent
  | RapidUndoAfterAgentEvent;
```

Extender también `HistoryActionEvent` y `rememberHistoryEntry` para conservar la fuente sin compartir el objeto mutable del stack:

```ts
export interface HistoryActionEvent {
  kind: 'historyEntry';
  label: string;
  actionType: string;
  timestamp: number;
  agent?: { toolName: string };
}

appendHistoryTimelineEvent({
  kind: 'historyEntry',
  label: entry.label,
  actionType: entry.actionType,
  timestamp: entry.timestamp,
  ...(entry.agent
    ? { agent: { toolName: entry.agent.toolName } }
    : {}),
});
```

En el branch `editor/undo`, respetando el pop existente:

```ts
const undoRequestedByAgent = activeAgentToolName !== null;
const entry = undoState.pastEntries.pop();
if (entry) {
  undoState.futureEntries.push(entry);
  const undoneAt = Date.now();
  const lastMutationAt = entry.agent?.lastMutationAt ?? entry.timestamp;
  const latencyMs = undoneAt - lastMutationAt;

  if (
    !undoRequestedByAgent
    && entry.agent
    && latencyMs >= 0
    && latencyMs <= AGENT_UNDO_WINDOW_MS
  ) {
    appendHistoryTimelineEvent({
      kind: 'rapidUndoAfterAgent',
      timestamp: undoneAt,
      toolName: entry.agent.toolName,
      actionType: entry.actionType,
      actionTimestamp: entry.timestamp,
      lastMutationAt,
      latencyMs,
    });
  }
}
```

No llamar `storageSet` aquí: `appendHistoryTimelineEvent` alimenta el único writer debounced del paso 4.

En `registry.execute`:

```ts
import { withAgentHistorySource } from '../../../store/undoMiddleware';

const dispatchAsAgent = ((action: Parameters<AppDispatch>[0]) =>
  withAgentHistorySource(name, () => this.dispatch!(action))
) as AppDispatch;

return tool.execute(validatedParams, dispatchAsAgent, this.getState);
```

El wrapper se crea después de resolver el tool, validar contexto y Zod. Rodea cada dispatch individual; no rodea `await tool.execute(...)`. Una edición de María mientras un tool espera no hereda procedencia.

### 3. Test primero

Crear `src/store/__tests__/undoMiddleware.agentFeedback.test.ts` con fake timers y un registry real sobre store de prueba. Casos mínimos:

```ts
it('añade un evento neutral a 10.000 ms sin mutar historyEntry', async () => {
  vi.setSystemTime(1_000);
  await registry.execute('modifyEdge', {});
  const before = structuredClone(getHistory().timeline.at(-1));

  vi.setSystemTime(11_000);
  store.dispatch({ type: 'editor/undo' });

  expect(getHistory().timeline.at(-1)).toEqual({
    kind: 'rapidUndoAfterAgent',
    timestamp: 11_000,
    toolName: 'modifyEdge',
    actionType: 'project/updatePiece',
    actionTimestamp: 1_000,
    lastMutationAt: 1_000,
    latencyMs: 10_000,
  });
  expect(getHistory().timeline.at(-2)).toEqual(before);
});

it('no añade señal a 10.001 ms', async () => {
  vi.setSystemTime(1_000);
  await registry.execute('modifyEdge', {});
  vi.setSystemTime(11_001);
  store.dispatch({ type: 'editor/undo' });
  expect(getHistory().timeline.some(
    (event) => event.kind === 'rapidUndoAfterAgent'
  )).toBe(false);
});
```

Añadir cuatro contratos:

1. Acción de María después de la acción del agente: el undo mueve la de María y no genera señal para el agente.
2. Tool que despacha modificación y `editor/undo`: no genera señal humana.
3. Tool lento en espera mientras María edita: las dos entradas tienen procedencia distinta.
4. Dos dispatches del mismo tool en menos de 500 ms: un solo undo step, `lastMutationAt` del segundo y latencia calculada desde el final; el evento `historyEntry` original sigue intacto.

Comprobar además que el evento nuevo se persiste mediante el writer del paso 4 y aparece en `buildDiagnosticBundle(...).history.timeline`.

- [x] Ejecutar en rojo: no existen procedencia, evento ni constante.
- [x] Implementar procedencia/batching y dejar los tests de señal todavía rojos.
- [x] Añadir el evento append-only en undo.
- [x] Ejecutar los seis casos en verde.

### 4. Verificación

```bash
npx vitest run src/store/__tests__/undoMiddleware.agentFeedback.test.ts src/store/__tests__/historyTimeline.persistence.test.ts src/store/__tests__/undoMiddleware.batchOwnership.test.ts src/copilot/reasoning/bridge/__tests__/AgenticLoop.test.ts src/utils/export/__tests__/diagnosticExporter.test.ts
```

Debe verse:

- señal a 10.000 ms y ninguna a 10.001 ms;
- evento original idéntico antes/después del undo;
- ningún falso positivo para acción posterior de María;
- ningún falso feedback cuando el agente despacha undo;
- cero fuga de procedencia durante await;
- una sola entrada para batch y latencia desde la última mutación;
- `rapidUndoAfterAgent` dentro del bundle, nunca como `tool:error` ni fallo de corrida.

Smoke manual: pedir una mutación 2D, deshacerla antes de 10 s, exportar y buscar `history.timeline[*].kind === 'rapidUndoAfterAgent'`. El texto y la UI no deben llamarla “fallo”.

Gate antes del commit:

```bash
npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui
```

### 5. Riesgo y rollback

- Riesgo semántico: un undo rápido también captura exploración, preferencia o cambio de opinión. Por diseño solo sirve para revisión manual.
- Riesgo de atribución: solo cubre dispatches hechos mediante el argumento que `ToolRegistry` entrega al tool. Un tool futuro que evade esa interfaz queda sin atribuir, no mal atribuido.
- Riesgo de batching: sin `isSameSource`, María y el agente podrían compartir una entrada en 500 ms. Los tests de concurrencia lo impiden.
- Rollback: revertir procedencia/evento restaura batching por tipo+tiempo. Los eventos ya persistidos siguen siendo JSON aditivo e inerte.

### 6. Tamaño

- Estimación: 75-110 líneas de producción y 150-210 líneas de prueba.
- Mergeable solo: sí sobre el paso 4; no requiere cambios adicionales al exporter.

- [x] Commit:

```bash
git add src/store/historyTimeline.ts src/store/undoMiddleware.ts src/copilot/action/tools/registry.ts src/store/__tests__/undoMiddleware.agentFeedback.test.ts
git commit -m "feat(history): registra la señal neutral de undo rápido"
```

---

## Orden y dependencias

1. **Paso 0:** apaga la fuente verbosa de presión sobre localStorage.
2. **Paso 1:** corrige complete/error/cancelled y crea el ring mínimo siempre encendido. Depende del paso 0 solo para las aserciones del recorder verboso.
3. **Paso 2:** construye el bundle y la puerta; depende de 0 y 1 para aplicar correctamente ambos canales.
4. **Paso 3:** depende del exporter del paso 2 porque sus fallbacks montan su propia puerta.
5. **Paso 4:** es independiente de UI/errores, pero se ejecuta después para enriquecer `history` sin cambiar el exporter.
6. **Paso 5:** depende del timeline del paso 4 y conserva append-only mediante un evento adicional.

Cada paso termina compilable, probado y revertible con un commit propio. No juntar pasos: el rollback perdería la frontera entre cuota, semántica, acceso, persistencia y feedback.

## Fuera de alcance

- **Drapeado 3D:** buffers vivos, velocidades, snapshots físicos reales y contenido detrás de `blob:` no entran. Reabrir con el primer reporte de drapeado de María que este bundle no reproduzca. **Reabierto el 2026-08-28** por decisión de Samuel, antes del disparador: ver `docs/plans/2026-08-28-caja-negra-telemetria-3d.md`.
- **Envelope y `traceId`:** reabrir cuando existan sesiones o loops concurrentes que el orden temporal no pueda desentrelazar.
- **Sanitización/redacción:** reabrir cuando el bundle salga de la máquina de María hacia un tercero o una política de datos lo exija.
- **Consentimiento `off/local/soporte/mejoras` y sink remoto:** reabrir únicamente al diseñar una transferencia remota.
- **`telemetry.emit()` central y barrido de `console.*`:** reabrir cuando un bundle real no permita reproducir un fallo concreto; documentar primero el dato ausente.
- **Nueva IDB, object store o persistencia de clones de undo:** reabrir solo si un caso medido exige snapshots físicos y la cuota demuestra que caben.
- **Corpus de entrenamiento:** no se construye; cada reproducción se convierte en test. Reabrir con volumen y objetivo evaluable que superen la suite.
- **Bug preexistente de hidratación:** `src/store/projectAutosave.ts:53-55` despacha `project/restoreProject`, pero `src/store/undoMiddleware.ts:401-402` solo excluye `restoreState`/`loadProject` y puede fabricar historia/canUndo al arrancar; va como issue aparte.
