# Caja negra 3D — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que el bundle de `Archivo ▸ Exportar diagnóstico` cuente qué motor de simulación corrió, por qué la cascada descartó los demás, qué error hubo, qué config recibió el solver y dónde estaba cada vértice de la tela — también cuando se exporta desde una pantalla de error.

**Architecture:** se amplía `src/utils/cloth/solverRuntimeTracker.ts` (módulo sin React ni Redux, ya leído por el exporter) con un ring de eventos de 200 entradas con generación por corrida de la cascada, la config aplicada por tier y una referencia retenida a la geometría renderizada con su manifiesto por pieza. Los clientes de solver de main thread escriben directo en el tracker; el worker WASM cruza por un `postMessage({type:'diagnostic'})`. El exporter (`src/utils/export/diagnosticExporter.ts`) lee todo por fuentes inyectables. Sin UI nueva, sin cadenas nuevas, sin persistencia nueva salvo la ranura LS que ya existe para el último error de boundary.

**Tech Stack:** TypeScript, React 19, Redux Toolkit, Three.js, Vitest + Testing Library (jsdom), Web Workers.

**Spec:** `docs/plans/2026-08-28-caja-negra-telemetria-3d.md` (propuesta v2 tras revisión adversarial — leerla entera antes de ejecutar; § 1 tiene el censo, § 10 el registro de la revisión).

## Global Constraints

- Local: sin endpoint, sin sink, sin cuenta, sin dependencia nueva.
- El ring: en memoria, cap **200**, sin gate, sin `DebugStore`, sin localStorage ni IDB; log de sesión, no se limpia por proyecto.
- Sin IDs de correlación (`generation` es un contador de módulo); sin envelope; sin sanitización.
- `src/utils/cloth/solverRuntimeTracker.ts` **no importa React ni Redux** (solo tipos: `SolverTier` de `../../store/simulationSlice` como hoy, `BufferGeometry` de `three` como tipo).
- Los workers (`wasmSolverWorker.ts`, `clothWorker.ts`) **no importan el tracker**.
- Ninguna cadena visible al usuario cambia. Si una tarea lo necesitara, invocar `contrato-de-interfaz` antes.
- Los `console.*` existentes se quedan; el ring se añade al lado.
- Typecheck: `npx tsc -b --noEmit` (nunca `tsc --noEmit` a secas).
- Gate antes de cada commit: `npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui`. Nunca `--no-verify`. Nunca editar `scripts/ui-contract-baseline.json` a mano.
- Las suites de contrato de Epic-746 (`wasm/__tests__/wasmSolverClient.test.ts`, `gpu/__tests__/gpuSolverClient.test.ts`, `__tests__/clothWorkerClient.test.ts`) no cambian firmas pineadas; solo ganan casos.
- Los rangos `archivo:línea` son del 28-08-2026 sobre `main` tras mergear #1083, #1085 y #1084; localizar el símbolo antes de aplicar.
- Rama de trabajo: `feat/caja-negra-3d` sobre `main`.

---

## Mapa de archivos

| Archivo | Responsabilidad tras el plan | Tareas |
|---|---|---|
| `src/utils/cloth/solverRuntimeTracker.ts` | Tier activo (hoy) + ring de eventos con generación + config aplicada + geometría retenida con manifiesto | 1, 5, 6 |
| `src/utils/cloth/__tests__/solverRuntimeTracker.test.ts` | Contrato del ring, la coalescencia y el registro de geometría | 1, 4, 5 |
| `src/components/Viewport3D/useSimulationLifecycle.ts` | Cascada contada, carrera entre generaciones cerrada, config aplicada registrada | 1, 5 |
| `src/components/Viewport3D/__tests__/useSimulationLifecycle.seamInit.test.tsx` | Casos nuevos: eventos de cascada, carrera, config aplicada | 1, 5 |
| `src/components/Viewport3D/GarmentSimulation.tsx` | Pérdida del device al ring + LS; manifiesto en el mismo loop que la geometría; registro en el tracker | 2, 5 |
| `src/components/Viewport3D/Viewport3D.tsx` | Pérdida del device en idle al ring | 2 |
| `src/utils/errorTracker.ts` / `src/utils/__tests__/errorTracker.test.ts` | Sin cambios de código; test nuevo del `source` de device lost | 2 |
| `src/utils/cloth/wasm/wasmSolverClient.ts` | `error` → ring con `code`; `diagnostic` → ring coalescido | 3, 4 |
| `src/utils/cloth/wasm/__tests__/wasmSolverClient.test.ts` | Casos nuevos | 3, 4 |
| `src/utils/cloth/wasm/wasmSolverWorker.ts` | `postMessage` de diagnósticos (NaN, CSR, warm-start) | 4 |
| `src/utils/cloth/clothWorkerClient.ts` / `__tests__/clothWorkerClient.test.ts` | `error` → ring | 3 |
| `src/utils/cloth/gpu/gpuSolverClient.ts` / `gpu/__tests__/gpuSolverClient.test.ts` | NaN de entrada, NaN en loop, parada por NaN y colisión degradada → ring | 3 |
| `src/utils/cloth/neural/neuralDrapeClient.ts` | Fallback analítico → ring | 3 |
| `src/utils/cloth/simulationInitClient.ts` | Pieza sin mallar → ring | 3 |
| `src/utils/export/diagnosticExporter.ts` / `__tests__/diagnosticExporter.test.ts` | `solver.events`, `solver.appliedConfig`, `solver.meshManifest`, `solver.clothSnapshot`; borra `solver.config`; `try/catch` con reintento | 1, 5, 6 |

---

### Tarea 1: Ring de eventos con generación, cascada contada y carrera cerrada

**Files:**
- Modify: `src/utils/cloth/solverRuntimeTracker.ts` (entero; hoy 17 líneas)
- Create: `src/utils/cloth/__tests__/solverRuntimeTracker.test.ts`
- Modify: `src/components/Viewport3D/useSimulationLifecycle.ts:449-460` (inicio del efecto), `:498-532` (elección GPU), `:624-628` (catch GPU), `:677-685` (WASM no disponible y catch WASM), `:726-728` (catch CPU), `:733-740` (Neural no cose), `:754` (`startSim().catch`)
- Modify: `src/components/Viewport3D/__tests__/useSimulationLifecycle.seamInit.test.tsx` (mock de `GpuSolverClient` con registro de instancias; tres casos nuevos)
- Modify: `src/utils/export/diagnosticExporter.ts`, `src/utils/export/__tests__/diagnosticExporter.test.ts`

**Interfaces:**
- Produces (tracker):
  ```ts
  export type SolverEventKind =
    | 'cascade:start' | 'tier:skipped' | 'tier:selected' | 'tier:failed'
    | 'tier:runtime-error' | 'tier:diagnostic' | 'device:lost'
    | 'nan:detected' | 'nan:solver-stopped' | 'collision:degraded'
    | 'meshing:piece-failed' | 'start:failed';
  export interface SolverEvent { kind: SolverEventKind; timestamp: number; generation: number; data: Record<string, unknown>; }
  export const SOLVER_EVENTS_MAX = 200;
  export function beginCascade(): number;                 // incrementa y devuelve la generación
  export function currentCascadeGeneration(): number;
  export function pushSolverEvent(kind: SolverEventKind, data?: Record<string, unknown>, generation?: number): void;
  export function getSolverEvents(): readonly SolverEvent[];
  export function clearSolverEvents(): void;              // solo tests
  ```
  El `tier` va dentro de `data.tier` (string de `SolverTier`).
- Produces (exporter): `DiagnosticBundle.solver.events: readonly SolverEvent[]`; `DiagnosticSources.getSolverEvents: typeof getSolverEvents`.

- [ ] **Paso 1: test del tracker en rojo**

Crear `src/utils/cloth/__tests__/solverRuntimeTracker.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import {
  beginCascade,
  clearSolverEvents,
  currentCascadeGeneration,
  getSolverEvents,
  pushSolverEvent,
  SOLVER_EVENTS_MAX,
} from '../solverRuntimeTracker';

describe('solverRuntimeTracker — ring de eventos', () => {
  beforeEach(clearSolverEvents);

  it('beginCascade incrementa la generación y los eventos la llevan por defecto', () => {
    const g1 = beginCascade();
    pushSolverEvent('cascade:start');
    const g2 = beginCascade();
    pushSolverEvent('tier:selected', { tier: 'wasm' });

    expect(g2).toBe(g1 + 1);
    expect(currentCascadeGeneration()).toBe(g2);
    const [first, second] = getSolverEvents();
    expect(first).toMatchObject({ kind: 'cascade:start', generation: g1, data: {} });
    expect(second).toMatchObject({ kind: 'tier:selected', generation: g2, data: { tier: 'wasm' } });
    expect(typeof second.timestamp).toBe('number');
  });

  it('un evento con generación explícita conserva la suya aunque haya una corrida más nueva', () => {
    const old = beginCascade();
    beginCascade();
    pushSolverEvent('tier:failed', { tier: 'webgpu', stale: true }, old);
    expect(getSolverEvents()[0].generation).toBe(old);
  });

  it('conserva como máximo SOLVER_EVENTS_MAX entradas, desalojando la más vieja', () => {
    for (let i = 0; i < SOLVER_EVENTS_MAX + 5; i++) {
      pushSolverEvent('tier:diagnostic', { i });
    }
    const events = getSolverEvents();
    expect(events).toHaveLength(SOLVER_EVENTS_MAX);
    expect(events[0].data.i).toBe(5);
    expect(events[events.length - 1].data.i).toBe(SOLVER_EVENTS_MAX + 4);
  });
});
```

- [ ] **Paso 2: correr y ver el rojo**

Run: `npx vitest run src/utils/cloth/__tests__/solverRuntimeTracker.test.ts`
Expected: FAIL — `beginCascade` / `pushSolverEvent` no se exportan.

- [ ] **Paso 3: implementar el tracker**

Reemplazar el contenido de `src/utils/cloth/solverRuntimeTracker.ts`:

```ts
import type { SolverTier } from '../../store/simulationSlice';

/**
 * Hechos del runtime del solver que Redux no guarda: el tier realmente
 * activo, y (caja negra 3D) el ring de eventos de la cascada. Módulo sin
 * React ni Redux — lo leen el exporter de diagnóstico y los tests.
 */

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

// ─── Ring de eventos de la cascada ──────────────────────────────────────────

export type SolverEventKind =
  | 'cascade:start'
  | 'tier:skipped'
  | 'tier:selected'
  | 'tier:failed'
  | 'tier:runtime-error'
  | 'tier:diagnostic'
  | 'device:lost'
  | 'nan:detected'
  | 'nan:solver-stopped'
  | 'collision:degraded'
  | 'meshing:piece-failed'
  | 'start:failed';

export interface SolverEvent {
  kind: SolverEventKind;
  timestamp: number;
  /** Corrida de la cascada a la que pertenece (ver `beginCascade`). */
  generation: number;
  data: Record<string, unknown>;
}

export const SOLVER_EVENTS_MAX = 200;

const events: SolverEvent[] = [];
let generation = 0;

/** Cada corrida de la cascada (Play, Stop→Play, pérdida de device) abre una generación. */
export function beginCascade(): number {
  generation += 1;
  return generation;
}

export function currentCascadeGeneration(): number {
  return generation;
}

/**
 * Log de sesión: siempre encendido, en memoria, cap 200. No se limpia por
 * proyecto — `generation` + `timestamp` distinguen corridas.
 */
export function pushSolverEvent(
  kind: SolverEventKind,
  data: Record<string, unknown> = {},
  eventGeneration: number = generation,
): void {
  events.push({ kind, timestamp: Date.now(), generation: eventGeneration, data });
  if (events.length > SOLVER_EVENTS_MAX) events.shift();
}

export function getSolverEvents(): readonly SolverEvent[] {
  return events;
}

/** Solo para tests. */
export function clearSolverEvents(): void {
  events.length = 0;
}
```

- [ ] **Paso 4: verde del tracker**

Run: `npx vitest run src/utils/cloth/__tests__/solverRuntimeTracker.test.ts`
Expected: PASS (3 tests).

- [ ] **Paso 5: tests del lifecycle en rojo**

En `src/components/Viewport3D/__tests__/useSimulationLifecycle.seamInit.test.tsx`:

(a) Ampliar el hoisted `gpuMocks` para registrar instancias:

```ts
const gpuMocks = vi.hoisted(() => ({
  initMultiPieceTsl: vi.fn(),
  instances: [] as Array<{ dispose: ReturnType<typeof vi.fn> }>,
}));
```

y en el mock de `GpuSolverClient` (`vi.mock('../../../utils/cloth/gpu/gpuSolverClient', …)`) añadir un constructor que se registre, manteniendo el resto igual:

```ts
  GpuSolverClient: class {
    constructor() { gpuMocks.instances.push(this as unknown as { dispose: ReturnType<typeof vi.fn> }); }
    onFrame: ((positions: Float32Array) => void) | null = null;
    // …resto del mock sin cambios…
```

(b) Ampliar los imports del tracker:

```ts
import {
  clearActiveSolverTier,
  clearSolverEvents,
  getActiveSolverTier,
  getSolverEvents,
} from '../../../utils/cloth/solverRuntimeTracker';
import { pauseSimulation } from '../../../store/simulationSlice';
```

y en el `afterEach` existente añadir `clearSolverEvents(); gpuMocks.instances.length = 0;`.

(c) Añadir un `describe` nuevo al final del archivo:

```ts
describe('useSimulationLifecycle — caja negra 3D: la cascada contada', () => {
  afterEach(() => {
    clearActiveSolverTier();
    clearSolverEvents();
    gpuMocks.instances.length = 0;
    vi.clearAllMocks();
    localStorage.removeItem(WEBGPU_FEATURE_FLAG_KEY);
    delete (globalThis.navigator as { gpu?: unknown }).gpu;
  });

  function installFakeGpu() {
    const fakeDevice = {
      lost: new Promise(() => {}),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      pushErrorScope: vi.fn(),
      popErrorScope: vi.fn().mockResolvedValue(null),
    };
    (globalThis.navigator as { gpu?: unknown }).gpu = {
      requestAdapter: async () => ({ requestDevice: async () => fakeDevice }),
    };
  }

  it('flag apagado: tier:skipped{webgpu, flag-off} → tier:selected{wasm}, misma generación', async () => {
    localStorage.setItem(WEBGPU_FEATURE_FLAG_KEY, 'false');
    webgpuMocks.isWebGPUAvailable.mockReturnValue(true);
    wasmMocks.isWasmSolverAvailable.mockResolvedValue(true);
    wasmMocks.initMultiPiece.mockResolvedValue(undefined);

    const store = makeStore();
    store.dispatch(startSimulation());
    renderLifecycle(store, seamInitData);

    await waitFor(() => expect(getActiveSolverTier()).toBe('wasm'));

    const kinds = getSolverEvents().map(e => [e.kind, e.data.tier, e.data.reason]);
    expect(kinds).toEqual([
      ['cascade:start', undefined, undefined],
      ['tier:skipped', 'webgpu', 'flag-off'],
      ['tier:selected', 'wasm', undefined],
    ]);
    const generations = new Set(getSolverEvents().map(e => e.generation));
    expect(generations.size).toBe(1);
  });

  it('el init de TSL rechaza: tier:failed{webgpu} con mensaje y stack, luego tier:selected{wasm}', async () => {
    localStorage.setItem(WEBGPU_FEATURE_FLAG_KEY, 'true');
    webgpuMocks.isWebGPUAvailable.mockReturnValue(true);
    installFakeGpu();
    gpuMocks.initMultiPieceTsl.mockRejectedValue(new Error('shader compile failed'));
    wasmMocks.isWasmSolverAvailable.mockResolvedValue(true);
    wasmMocks.initMultiPiece.mockResolvedValue(undefined);

    const store = makeStore();
    store.dispatch(startSimulation());
    renderLifecycle(store, seamInitData);

    await waitFor(() => expect(getActiveSolverTier()).toBe('wasm'));

    const failed = getSolverEvents().find(e => e.kind === 'tier:failed');
    expect(failed).toMatchObject({
      data: { tier: 'webgpu', phase: 'init', message: 'shader compile failed', stale: false },
    });
    expect(typeof failed!.data.stack).toBe('string');
    const order = getSolverEvents().map(e => e.kind);
    expect(order.indexOf('tier:failed')).toBeLessThan(order.lastIndexOf('tier:selected'));
  });

  it('la carrera: un init viejo que rechaza tras Stop→Play no dispone el cliente de la corrida nueva', async () => {
    localStorage.setItem(WEBGPU_FEATURE_FLAG_KEY, 'true');
    webgpuMocks.isWebGPUAvailable.mockReturnValue(true);
    installFakeGpu();
    let rejectFirst: (e: Error) => void = () => {};
    gpuMocks.initMultiPieceTsl
      .mockImplementationOnce(() => new Promise<void>((_, rej) => { rejectFirst = rej; }))
      .mockResolvedValue(undefined);

    const store = makeStore();
    store.dispatch(startSimulation());
    renderLifecycle(store, seamInitData);
    await waitFor(() => expect(gpuMocks.initMultiPieceTsl).toHaveBeenCalledTimes(1));

    // Stop→Play: el efecto se limpia (cancelled=true) y arranca una generación nueva.
    act(() => { store.dispatch(pauseSimulation()); });
    act(() => { store.dispatch(startSimulation()); });
    await waitFor(() => expect(gpuMocks.initMultiPieceTsl).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(getActiveSolverTier()).toBe('webgpu'));
    expect(gpuMocks.instances).toHaveLength(2);

    // La promesa de la generación 1 rechaza tarde.
    rejectFirst(new Error('adapter died late'));
    await waitFor(() =>
      expect(getSolverEvents().some(e => e.kind === 'tier:failed' && e.data.stale === true)).toBe(true),
    );

    const stale = getSolverEvents().find(e => e.kind === 'tier:failed')!;
    const liveGeneration = getSolverEvents().filter(e => e.kind === 'tier:selected').at(-1)!.generation;
    expect(stale.generation).toBeLessThan(liveGeneration);
    // El cliente de la generación 2 sigue vivo: el catch viejo no lo tocó.
    expect(gpuMocks.instances[1].dispose).not.toHaveBeenCalled();
    expect(getActiveSolverTier()).toBe('webgpu');
  });
});
```

Añadir `act` al import de Testing Library: `import { act, renderHook, waitFor } from '@testing-library/react';`.

- [ ] **Paso 6: correr y ver el rojo**

Run: `npx vitest run src/components/Viewport3D/__tests__/useSimulationLifecycle.seamInit.test.tsx`
Expected: FAIL — los tres casos nuevos: `getSolverEvents` vacío; en el tercero, además, `instances[1].dispose` **sí** fue llamado (el bug preexistente). Los casos viejos siguen en verde.

- [ ] **Paso 7: instrumentar la cascada y cerrar la carrera**

En `src/components/Viewport3D/useSimulationLifecycle.ts`:

(a) Import:

```ts
import {
  beginCascade,
  clearActiveSolverTier,
  pushSolverEvent,
  setActiveSolverTier,
} from '../../utils/cloth/solverRuntimeTracker';
```
(verificar el import existente de `setActiveSolverTier`/`clearActiveSolverTier` y fusionarlo).

(b) Helper de módulo, junto a `withTimeout` (`:195`):

```ts
/** Fase de un fallo de tier, deducida del mensaje (los labels de withTimeout y los throws del cascade). */
function failurePhase(message: string): 'adapter' | 'timeout' | 'init' {
  if (message.includes('adapter')) return 'adapter';
  if (message.includes('timed out')) return 'timeout';
  return 'init';
}

function describeFailure(e: unknown): { message: string; stack: string | undefined; phase: string } {
  const err = e instanceof Error ? e : new Error(String(e));
  return { message: err.message, stack: err.stack, phase: failurePhase(err.message) };
}
```

(c) Inicio del efecto (`:450-453`): después de `let cancelled = false;` añadir `const generation = beginCascade();`.

(d) Inicio de `startSim` (`:456`, primera línea del cuerpo): `pushSolverEvent('cascade:start', { pieces: placedMeshes.length, seams: projectHasSeams }, generation);` — colocarlo **después** de `const projectHasSeams = …` (`:462`).

(e) Elección GPU (`:503-505`), reemplazar:

```ts
        const wantsWebGPU = isWebGPUFeatureEnabled() && isWebGPUAvailable() && !gpuDowngradedRef.current;
        if (wantsWebGPU && projectHasSeams && !GPU_CAPABILITIES.seams) {
```
por:
```ts
        const flagEnabled = isWebGPUFeatureEnabled();
        const webgpuAvailable = isWebGPUAvailable();
        const wantsWebGPU = flagEnabled && webgpuAvailable && !gpuDowngradedRef.current;
        if (!wantsWebGPU) {
          pushSolverEvent('tier:skipped', {
            tier: 'webgpu',
            reason: !flagEnabled ? 'flag-off' : !webgpuAvailable ? 'unavailable' : 'downgraded',
          }, generation);
        }
        if (wantsWebGPU && projectHasSeams && !GPU_CAPABILITIES.seams) {
          pushSolverEvent('tier:skipped', { tier: 'webgpu', reason: 'no-seams-capability' }, generation);
```
(la segunda línea nueva va dentro del `if` dormido, antes del `console.warn` existente).

(f) `tier:selected` justo después de cada `dispatch(setSolverTier(...))`:
- `:529` → `pushSolverEvent('tier:selected', { tier: 'webgpu' }, generation);`
- `:637` → `pushSolverEvent('tier:selected', { tier: 'wasm' }, generation);`
- `:692` → `pushSolverEvent('tier:selected', { tier: 'cpu-worker' }, generation);`
- `:743` → `pushSolverEvent('tier:selected', { tier: 'neural-drape' }, generation);`

(g) Catch GPU (`:624-628`), reemplazar entero por:

```ts
          } catch (e) {
            pushSolverEvent('tier:failed', { tier: 'webgpu', ...describeFailure(e), stale: cancelled }, generation);
            // Corrida reemplazada (Stop→Play o device lost): las refs ya son de
            // otra generación — no tocarlas. El cleanup del efecto viejo ya
            // dispuso ESTE cliente.
            if (cancelled) return;
            console.warn('[SimLifecycle] TSL solver failed, falling through to WASM:', e);
            gpuClientRef.current?.dispose();
            gpuClientRef.current = null;
          }
```

(h) WASM no disponible (`:677-679`): dentro del `else if (!cancelled) {` añadir antes del `console.warn`: `pushSolverEvent('tier:failed', { tier: 'wasm', phase: 'availability', message: 'Wasm solver not available', stale: false }, generation);`

(i) Catch WASM (`:680-685`), reemplazar entero por:

```ts
          } catch (e) {
            pushSolverEvent('tier:failed', { tier: 'wasm', ...describeFailure(e), stale: cancelled }, generation);
            if (cancelled) return;
            console.warn('[SimLifecycle] Wasm failed, falling back to CPU:', e);
            // Clean up broken WASM client before falling through
            wasmClientRef.current?.dispose();
            wasmClientRef.current = null;
          }
```

(j) Catch CPU (`:726-728`), reemplazar por:

```ts
          } catch (e) {
            pushSolverEvent('tier:failed', { tier: 'cpu-worker', ...describeFailure(e), stale: cancelled }, generation);
            if (cancelled) return;
            console.warn('[SimLifecycle] CPU worker failed, falling back to Neural Drape:', e);
          }
```

(k) Neural no cose (`:733-740`): antes del `console.error` añadir `pushSolverEvent('start:failed', { reason: 'neural-cannot-sew' }, generation);`

(l) Sumidero final (`:754`), reemplazar por:

```ts
      startSim().catch(e => {
        pushSolverEvent('start:failed', { ...describeFailure(e), stale: cancelled }, generation);
        console.error('[SimLifecycle] Start failed:', e);
      });
```

- [ ] **Paso 8: verde del lifecycle**

Run: `npx vitest run src/components/Viewport3D/__tests__/useSimulationLifecycle.seamInit.test.tsx`
Expected: PASS (todos, incluidos los tres nuevos).

- [ ] **Paso 9: test del exporter en rojo**

En `src/utils/export/__tests__/diagnosticExporter.test.ts`, en el helper `sources()` añadir la fuente nueva:

```ts
    getSolverEvents: vi.fn(() => [{
      kind: 'tier:failed',
      timestamp: 50,
      generation: 3,
      data: { tier: 'webgpu', phase: 'timeout', message: 'TSL solver init timed out (12000ms)', stale: false },
    }]),
```

y un caso nuevo dentro del `describe('bundle de diagnóstico puro')`:

```ts
  it('lleva el ring de eventos del solver en solver.events', () => {
    const bundle = buildDiagnosticBundle(state, undefined, sources(false));
    expect(bundle.solver.events).toEqual([
      expect.objectContaining({ kind: 'tier:failed', generation: 3, data: expect.objectContaining({ tier: 'webgpu' }) }),
    ]);
  });
```

Run: `npx vitest run src/utils/export/__tests__/diagnosticExporter.test.ts`
Expected: FAIL — `solver.events` undefined.

- [ ] **Paso 10: exporter**

En `src/utils/export/diagnosticExporter.ts`:

```ts
import { getActiveSolverTier, getSolverEvents } from '../cloth/solverRuntimeTracker';
```
`DiagnosticSources` gana `getSolverEvents: typeof getSolverEvents;`; `DiagnosticBundle.solver` gana `events: ReturnType<typeof getSolverEvents>;`; `browserSources` gana `getSolverEvents,`; y en `buildDiagnosticBundle` dentro de `solver: { … }` añadir `events: sources.getSolverEvents(),`.

- [ ] **Paso 11: verde y gate**

Run: `npx vitest run src/utils/export/__tests__/diagnosticExporter.test.ts` → PASS.
Run: `npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui` → todo verde.

- [ ] **Paso 12: commit**

```bash
git add src/utils/cloth/solverRuntimeTracker.ts src/utils/cloth/__tests__/solverRuntimeTracker.test.ts src/components/Viewport3D/useSimulationLifecycle.ts src/components/Viewport3D/__tests__/useSimulationLifecycle.seamInit.test.tsx src/utils/export/diagnosticExporter.ts src/utils/export/__tests__/diagnosticExporter.test.ts
git commit -m "feat(diagnostico): ring de eventos del solver — la cascada contada y la carrera entre generaciones cerrada"
```

---

### Tarea 2: La pérdida del device sobrevive al reload que su propio toast pide

**Files:**
- Modify: `src/components/Viewport3D/GarmentSimulation.tsx:1436-1462`
- Modify: `src/components/Viewport3D/Viewport3D.tsx:158-159`
- Modify: `src/components/Viewport3D/useSimulationLifecycle.ts:521-525`
- Modify: `src/utils/__tests__/errorTracker.test.ts` (caso nuevo)

**Interfaces:**
- Consumes: `pushSolverEvent` (Tarea 1); `pushError(entry, { persistForReload: true })` de `src/utils/errorTracker.ts` (ya existe).
- Produces: eventos `device:lost { source: 'renderer' | 'previous-mount' | 'idle' | 'lifecycle-decoy', reason?, message? }` y `tier:runtime-error { tier:'webgpu', code:'uncaptured-error', message }`; error persistido con `source: 'webgpu-device-lost'`; global DEV `window.__VINA_RENDERER_DEVICE__`.

- [ ] **Paso 1: test del errorTracker en rojo (contrato del source)**

Añadir al final de `src/utils/__tests__/errorTracker.test.ts`:

```ts
it('un error de device perdido persistido con persistForReload vuelve al ring tras recargar', async () => {
  const firstLoad = await import('../errorTracker');
  const pushError = (firstLoad as typeof firstLoad & { pushError?: PushError }).pushError;
  const entry = {
    message: 'destroyed: GPU device was destroyed',
    source: 'webgpu-device-lost',
    timestamp: 30,
  };
  pushError!(entry, { persistForReload: true });

  vi.resetModules();
  const afterReload = await import('../errorTracker');
  afterReload.initErrorTracker();
  expect(afterReload.getTrackedErrors()).toContainEqual(entry);
});
```

Run: `npx vitest run src/utils/__tests__/errorTracker.test.ts` → debe pasar YA (el mecanismo existe); este caso pinea el `source` que GarmentSimulation va a usar. Si pasa, seguir; no es un rojo, es un contrato.

- [ ] **Paso 2: GarmentSimulation**

Imports (junto a los existentes de `../../store/copilotUISlice` y `./useSimulationLifecycle`):

```ts
import { pushSolverEvent } from '../../utils/cloth/solverRuntimeTracker';
import { pushError } from '../../utils/errorTracker';
```

Reemplazar el cuerpo del efecto de `:1436-1462` (desde `const device = rendererDevice;` hasta el `return () => …`) por:

```ts
    const device = rendererDevice;
    if (!device) return;
    if (import.meta.env.DEV) {
      // Puerta de verificación manual (plan caja negra 3D § 5, escenario 3):
      // `window.__VINA_RENDERER_DEVICE__.destroy()` pierde EL device del renderer.
      (window as unknown as Record<string, unknown>).__VINA_RENDERER_DEVICE__ = device;
    }
    // Ya muerto desde un montaje anterior (Stop→Start sobre el mismo renderer):
    // re-latchear sin re-enganchar un listener nuevo.
    if (isRendererDeviceLost(device)) {
      rendererDeviceLostRef.current = true;
      pushSolverEvent('device:lost', { source: 'previous-mount' });
      handleGpuDeviceLost();
      return;
    }
    let cancelled = false;
    device.lost.then((info) => {
      markRendererDeviceLost(device);
      if (cancelled) return;
      console.error('[GarmentSimulation] WebGPU device lost:', info?.message);
      const message = `${info?.reason ?? 'unknown'}: ${info?.message ?? ''}`;
      pushSolverEvent('device:lost', { source: 'renderer', reason: info?.reason, message: info?.message });
      // El toast pide recargar — la ranura LS (la misma de los boundaries) es
      // la única forma de que el dato sobreviva a ese reload.
      pushError({ message, source: 'webgpu-device-lost', timestamp: Date.now() }, { persistForReload: true });
      rendererDeviceLostRef.current = true;
      handleGpuDeviceLost();
      dispatch(showErrorToast('Se perdió el dispositivo WebGPU — la simulación sigue en el solver de respaldo. Recarga la página para restaurar la vista 3D.'));
    });
    const onUncaptured = (e: Event) => {
      const message = (e as { error?: { message?: string } }).error?.message;
      console.error('[GarmentSimulation] uncaptured GPU error:', message);
      pushSolverEvent('tier:runtime-error', { tier: 'webgpu', code: 'uncaptured-error', message });
    };
    device.addEventListener?.('uncapturederror', onUncaptured);
    return () => { cancelled = true; device.removeEventListener?.('uncapturederror', onUncaptured); };
```

(El texto del toast no cambia: es la cadena existente, copiada tal cual.)

- [ ] **Paso 3: Viewport3D (pérdida en idle)**

`src/components/Viewport3D/Viewport3D.tsx:158-159`: import `pushSolverEvent` de `'../../utils/cloth/solverRuntimeTracker'` y reemplazar

```ts
    if (device) device.lost.then(() => markRendererDeviceLost(device));
```
por
```ts
    if (device) device.lost.then((info) => {
      markRendererDeviceLost(device);
      pushSolverEvent('device:lost', { source: 'idle', reason: info?.reason, message: info?.message });
    });
```

- [ ] **Paso 4: lifecycle (device señuelo)**

`useSimulationLifecycle.ts:521-525`, dentro del `device.lost.then((info) => { … })` añadir tras el `console.warn`: `pushSolverEvent('device:lost', { source: 'lifecycle-decoy', reason: info.reason, message: info.message }, generation);`

- [ ] **Paso 5: gate y commit**

Run: `npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui` → verde.

```bash
git add src/components/Viewport3D/GarmentSimulation.tsx src/components/Viewport3D/Viewport3D.tsx src/components/Viewport3D/useSimulationLifecycle.ts src/utils/__tests__/errorTracker.test.ts
git commit -m "feat(diagnostico): la pérdida del device WebGPU entra al ring y sobrevive al reload"
```

---

### Tarea 3: Los errores runtime de cada tier entran al ring, con su `code`

**Files:**
- Modify: `src/utils/cloth/wasm/wasmSolverClient.ts:118`, `:152-160`, `:372-378`
- Modify: `src/utils/cloth/wasm/__tests__/wasmSolverClient.test.ts` (caso nuevo)
- Modify: `src/utils/cloth/clothWorkerClient.ts:81-88`, `:124-131`, `:391-396`
- Modify: `src/utils/cloth/__tests__/clothWorkerClient.test.ts` (caso nuevo)
- Modify: `src/utils/cloth/gpu/gpuSolverClient.ts:362-369`, `:1364-1385`, `:1806-1822`, `:1847-1851`
- Modify: `src/utils/cloth/gpu/__tests__/gpuSolverClient.test.ts` (tres casos nuevos)
- Modify: `src/utils/cloth/neural/neuralDrapeClient.ts:174-179`, `:337-342`
- Modify: `src/utils/cloth/simulationInitClient.ts:139-141`

**Interfaces:**
- Consumes: `pushSolverEvent` (Tarea 1). Los clientes no reciben generación: usan la corriente.
- Produces: `tier:runtime-error { tier, code, message }`, `nan:detected { tier:'webgpu', phase:'input', count } | { tier:'webgpu', frame, particleIndex, component }`, `nan:solver-stopped { tier:'webgpu' }`, `collision:degraded { tier:'webgpu', id, reason }`, `tier:diagnostic { tier:'neural-drape', code }`, `meshing:piece-failed { pieceId, message }`.

- [ ] **Paso 1: test WASM en rojo**

En `src/utils/cloth/wasm/__tests__/wasmSolverClient.test.ts`, import `{ clearSolverEvents, getSolverEvents } from '../../solverRuntimeTracker'`, `clearSolverEvents()` en el `beforeEach` existente, y dentro de `describe('init lifecycle (#1)')`:

```ts
    it('un mensaje "error" del worker deja tier:runtime-error{wasm} con su code en el ring', async () => {
      const { worker } = stubWorkerGlobal();
      const client = new WasmSolverClient();
      const initPromise = client.initMultiPiece([makePiece()]);

      worker.emitMessage({ type: 'error', code: 'wasm_memory_unavailable', message: 'WASM memory unavailable' });

      await expect(initPromise).rejects.toThrow();
      expect(getSolverEvents()).toEqual([
        expect.objectContaining({
          kind: 'tier:runtime-error',
          data: { tier: 'wasm', code: 'wasm_memory_unavailable', message: 'WASM memory unavailable' },
        }),
      ]);
    });
```

Run: `npx vitest run src/utils/cloth/wasm/__tests__/wasmSolverClient.test.ts` → FAIL (ring vacío).

- [ ] **Paso 2: wasmSolverClient**

Import `import { pushSolverEvent } from '../solverRuntimeTracker';`.

`:118` (`catch {}` de `new Worker`): reemplazar `throw new Error('Wasm solver worker not available');` por `throw new Error('Wasm solver worker not available', { cause: e });` — convirtiendo el `catch {` en `catch (e) {`.

`:152-160` (listener `error`): antes de `this.onError?.(msg);` añadir `pushSolverEvent('tier:runtime-error', { tier: 'wasm', code: 'worker_error', message: msg });`.

`:372-378` (`case 'error'`): antes de `console.warn` añadir `pushSolverEvent('tier:runtime-error', { tier: 'wasm', code: msg.code ?? 'unknown', message: msg.message });`.

Run: mismo archivo → PASS.

- [ ] **Paso 3: test CPU en rojo**

En `src/utils/cloth/__tests__/clothWorkerClient.test.ts`, import `{ clearSolverEvents, getSolverEvents } from '../solverRuntimeTracker'`; en el `afterEach` existente añadir `clearSolverEvents();`; caso nuevo dentro del `describe('ClothWorkerClient')` (usar el mismo patrón de los casos de `error` existentes en ese archivo — el helper `stubWorkerGlobal()` de `./fakeClothWorker` y el handler `worker.onmessage`):

```ts
  it('un mensaje "error" del worker deja tier:runtime-error{cpu-worker} en el ring', async () => {
    const { worker } = stubWorkerGlobal();
    const client = new ClothWorkerClient();
    const initPromise = client.initMultiPiece([{ pieceId: 'p0', ...makeMesh() }]);

    worker.onmessage?.({ data: { type: 'error', message: 'Solver not initialized' } } as MessageEvent);

    await expect(initPromise).rejects.toThrow('Solver not initialized');
    expect(getSolverEvents()).toEqual([
      expect.objectContaining({
        kind: 'tier:runtime-error',
        data: { tier: 'cpu-worker', code: 'worker_error', message: 'Solver not initialized' },
      }),
    ]);
  });
```

(Si la firma de `initMultiPiece` del cliente CPU exige más campos que `pieceId`/`vertices`/`triIds`, copiar el fixture del caso `initMultiPiece` ya existente en ese archivo.)

Run: `npx vitest run src/utils/cloth/__tests__/clothWorkerClient.test.ts` → FAIL.

- [ ] **Paso 4: clothWorkerClient**

Import `import { pushSolverEvent } from './solverRuntimeTracker';`. En los tres sitios (`worker.onerror` de `init` `:81-88`, `worker.onerror` de `initMultiPiece` `:124-131`, `case 'error'` `:391-396`) añadir, antes de `this.onError?.(…)`, `pushSolverEvent('tier:runtime-error', { tier: 'cpu-worker', code: 'worker_error', message: msg /* o msg.message en el case */ });`.

Run: mismo archivo → PASS.

- [ ] **Paso 5: tests GPU en rojo**

En `src/utils/cloth/gpu/__tests__/gpuSolverClient.test.ts`, import `{ clearSolverEvents, getSolverEvents } from '../../solverRuntimeTracker'` y un `beforeEach(clearSolverEvents)` a nivel de archivo; `describe` nuevo al final:

```ts
describe('caja negra 3D — eventos del tier GPU', () => {
  it('NaN en la malla de entrada deja nan:detected{phase:input} con el conteo', async () => {
    const device = new FakeGPUDevice();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = new GpuSolverClient(device as any);
    const piece = makeQuadPiece();
    piece.vertices[0] = NaN;
    piece.vertices[4] = Infinity;

    await client.initMultiPieceTsl([piece]);

    expect(getSolverEvents()).toContainEqual(
      expect.objectContaining({ kind: 'nan:detected', data: { tier: 'webgpu', phase: 'input', count: 2 } }),
    );
  });

  it('validatePositions deja nan:detected con partícula y componente, y el loop la parada', () => {
    const device = new FakeGPUDevice();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = new GpuSolverClient(device as any) as any;
    const positions = new Float32Array([0, 0, 0, 1, NaN, 1]);

    expect(client.validatePositions(positions)).toBe(false);

    expect(getSolverEvents()).toEqual([
      expect.objectContaining({
        kind: 'nan:detected',
        data: { tier: 'webgpu', frame: 0, particleIndex: 1, component: 'y' },
      }),
    ]);
  });

  it('un colisionador con 0 triángulos deja collision:degraded{zero-triangles}', async () => {
    const device = new FakeGPUDevice();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = new GpuSolverClient(device as any);
    await client.initMultiPieceTsl([makeQuadPiece()]);

    client.setTslCollisionBody('avatar', { vertices: new Float32Array(0), normals: new Float32Array(0), triCount: 0 } as never);

    expect(getSolverEvents()).toContainEqual(
      expect.objectContaining({ kind: 'collision:degraded', data: { tier: 'webgpu', id: 'avatar', reason: 'zero-triangles' } }),
    );
  });
});
```

(Verificar la firma real de `setTslCollisionBody(id, mesh, …)` en `gpuSolverClient.ts:1360-1364` y ajustar el orden de argumentos del test a ella.)

Run: `npx vitest run src/utils/cloth/gpu/__tests__/gpuSolverClient.test.ts` → FAIL (tres casos).

- [ ] **Paso 6: gpuSolverClient**

Import `import { pushSolverEvent } from '../solverRuntimeTracker';`.

`:367-369`: dentro del `if (inputNaN > 0) {` añadir `pushSolverEvent('nan:detected', { tier: 'webgpu', phase: 'input', count: inputNaN });`.

`:1366-1369` (sin solver TSL): añadir `pushSolverEvent('collision:degraded', { tier: 'webgpu', id, reason: 'no-tsl-solver' });` antes del `return`.
`:1370-1376` (triCount 0): `pushSolverEvent('collision:degraded', { tier: 'webgpu', id, reason: 'zero-triangles' });` antes del `return`.
`:1380-1385` (BVH vacío): `pushSolverEvent('collision:degraded', { tier: 'webgpu', id, reason: 'empty-bvh', triCount: mesh.triCount });` antes del `return`.

`:1812-1818` (`validatePositions`, dentro del `if (!isFinite(...))`, después del `console.error`): `pushSolverEvent('nan:detected', { tier: 'webgpu', frame: this.frameCount, particleIndex: particleIdx, component });`.

`:1847-1851` (loop): antes de `this.stop();` añadir `pushSolverEvent('nan:solver-stopped', { tier: 'webgpu', frame: this.frameCount });`.

Run: mismo archivo → PASS.

- [ ] **Paso 7: Neural e init client (sin test unitario propio: tres líneas cada uno, cubiertas por el gate de tipos)**

`neuralDrapeClient.ts`: import `import { pushSolverEvent } from '../solverRuntimeTracker';`. `:177` (tras el `console.warn` del ONNX): `pushSolverEvent('tier:diagnostic', { tier: 'neural-drape', code: 'analytical-fallback', message: String(err) });`. `:339` (tras el `console.warn` de inferencia): `pushSolverEvent('tier:diagnostic', { tier: 'neural-drape', code: 'inference-failed', message: String(err) });`.

`simulationInitClient.ts:139-141`: import `import { pushSolverEvent } from './solverRuntimeTracker';` y tras el `console.warn`: `pushSolverEvent('meshing:piece-failed', { pieceId: piece.id, message: err instanceof Error ? err.message : String(err) });`.

- [ ] **Paso 8: gate y commit**

Run: `npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui` → verde.

```bash
git add src/utils/cloth/wasm/wasmSolverClient.ts src/utils/cloth/wasm/__tests__/wasmSolverClient.test.ts src/utils/cloth/clothWorkerClient.ts src/utils/cloth/__tests__/clothWorkerClient.test.ts src/utils/cloth/gpu/gpuSolverClient.ts src/utils/cloth/gpu/__tests__/gpuSolverClient.test.ts src/utils/cloth/neural/neuralDrapeClient.ts src/utils/cloth/simulationInitClient.ts
git commit -m "feat(diagnostico): los errores runtime de cada tier entran al ring con su code"
```

---

### Tarea 4: Lo que pasa dentro del worker WASM sale del worker (con coalescencia)

**Files:**
- Modify: `src/utils/cloth/solverRuntimeTracker.ts` (función `coalesceSolverEvent`)
- Modify: `src/utils/cloth/__tests__/solverRuntimeTracker.test.ts` (caso nuevo)
- Modify: `src/utils/cloth/wasm/wasmSolverWorker.ts:18-23` (comentario de deuda), `:285-290`, `:575-583`, `:864-866`
- Modify: `src/utils/cloth/wasm/wasmSolverClient.ts:371` (`case 'diagnostic'`)
- Modify: `src/utils/cloth/wasm/__tests__/wasmSolverClient.test.ts` (caso nuevo)

**Interfaces:**
- Produces (tracker): `export function coalesceSolverEvent(kind: SolverEventKind, data: Record<string, unknown>): void` — si el último evento del ring tiene el mismo `kind`, `data.tier` y `data.code`, lo sobreescribe (timestamp y data); si no, `pushSolverEvent`.
- Produces (worker→cliente): mensaje `{ type: 'diagnostic', code: 'nan_reset' | 'self_collision_disabled' | 'warm_start_unsupported', message?: string, count?: number, cumulative?: number, branch?: string }`.

- [ ] **Paso 1: test del tracker en rojo**

Añadir a `src/utils/cloth/__tests__/solverRuntimeTracker.test.ts` (import `coalesceSolverEvent`):

```ts
  it('coalesceSolverEvent sobreescribe el último evento si coincide kind+tier+code, y añade si no', () => {
    coalesceSolverEvent('tier:diagnostic', { tier: 'wasm', code: 'nan_reset', count: 3, cumulative: 3 });
    coalesceSolverEvent('tier:diagnostic', { tier: 'wasm', code: 'nan_reset', count: 5, cumulative: 8 });
    coalesceSolverEvent('tier:diagnostic', { tier: 'wasm', code: 'self_collision_disabled' });
    coalesceSolverEvent('tier:diagnostic', { tier: 'wasm', code: 'nan_reset', count: 1, cumulative: 9 });

    const events = getSolverEvents();
    expect(events.map(e => e.data.code)).toEqual(['nan_reset', 'self_collision_disabled', 'nan_reset']);
    expect(events[0].data.cumulative).toBe(8);
  });
```

Run: `npx vitest run src/utils/cloth/__tests__/solverRuntimeTracker.test.ts` → FAIL.

- [ ] **Paso 2: tracker**

Añadir en `solverRuntimeTracker.ts` tras `pushSolverEvent`:

```ts
/**
 * Para diagnósticos repetitivos (NaN sostenido en WASM): el último evento del
 * mismo kind+tier+code se actualiza en sitio en vez de inundar el ring.
 */
export function coalesceSolverEvent(
  kind: SolverEventKind,
  data: Record<string, unknown>,
): void {
  const last = events[events.length - 1];
  if (last && last.kind === kind && last.data.tier === data.tier && last.data.code === data.code) {
    last.timestamp = Date.now();
    last.data = data;
    return;
  }
  pushSolverEvent(kind, data);
}
```

Run: mismo archivo → PASS.

- [ ] **Paso 3: test del cliente en rojo**

En `wasmSolverClient.test.ts`, dentro de `describe('init lifecycle (#1)')`:

```ts
    it('dos "diagnostic" seguidos del mismo code quedan como UN evento y no rechazan el init', async () => {
      const { worker } = stubWorkerGlobal();
      const client = new WasmSolverClient();
      const initPromise = client.initMultiPiece([makePiece()]);

      worker.emitMessage({ type: 'diagnostic', code: 'nan_reset', count: 2, cumulative: 2, branch: 'collision branch' });
      worker.emitMessage({ type: 'diagnostic', code: 'nan_reset', count: 4, cumulative: 6, branch: 'collision branch' });
      worker.emitMessage({ type: 'ready', numParticles: 3 });

      await expect(initPromise).resolves.toBeUndefined();
      expect(getSolverEvents()).toEqual([
        expect.objectContaining({
          kind: 'tier:diagnostic',
          data: { tier: 'wasm', code: 'nan_reset', count: 4, cumulative: 6, branch: 'collision branch' },
        }),
      ]);
    });
```

Run → FAIL.

- [ ] **Paso 4: cliente**

`wasmSolverClient.ts`: ampliar el import a `{ coalesceSolverEvent, pushSolverEvent }`; en `handleMessage` añadir antes de `case 'error':`:

```ts
      case 'diagnostic': {
        const { type: _type, ...rest } = msg as { type: string } & Record<string, unknown>;
        coalesceSolverEvent('tier:diagnostic', { tier: 'wasm', ...rest });
        break;
      }
```

Run → PASS.

- [ ] **Paso 5: worker**

`wasmSolverWorker.ts`:

`:285-290` (`guardNaN`), reemplazar el bloque `if (nanThisStep > 0) { … }` por:

```ts
  if (nanThisStep > 0) {
    if (nanLogLimiter.tryEmit(nanThisStep)) {
      console.warn(`[WasmWorker] NaN detected in positions buffer: ${nanThisStep} this step, ${nanLogLimiter.count} cumulative (${branchLabel})`);
      // Caja negra 3D: mismo rate-limit que el warn; el cliente coalesce.
      (self as unknown as Worker).postMessage({
        type: 'diagnostic', code: 'nan_reset',
        count: nanThisStep, cumulative: nanLogLimiter.count, branch: branchLabel,
      });
    }
  }
```

`:575-583` (catch de `set_adjacency`), tras el `console.warn`: `(self as unknown as Worker).postMessage({ type: 'diagnostic', code: 'self_collision_disabled', message });`.

`:864-866` (`updateConstraints`), tras el `console.warn`: `(self as unknown as Worker).postMessage({ type: 'diagnostic', code: 'warm_start_unsupported' });`.

`:18-23` (comentario de cabecera): cambiar la frase de la deuda por *«El contador cruza al main thread como mensaje `diagnostic` (caja negra 3D, 2026-08-28) y el cliente lo vuelca al ring de `solverRuntimeTracker`.»*

- [ ] **Paso 6: gate y commit**

Run: `npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui` → verde.

```bash
git add src/utils/cloth/solverRuntimeTracker.ts src/utils/cloth/__tests__/solverRuntimeTracker.test.ts src/utils/cloth/wasm/wasmSolverWorker.ts src/utils/cloth/wasm/wasmSolverClient.ts src/utils/cloth/wasm/__tests__/wasmSolverClient.test.ts
git commit -m "feat(diagnostico): NaN y auto-colisión del worker WASM salen del worker, coalescidos en el ring"
```

---

### Tarea 5: La config que el solver recibió de verdad, y el manifiesto de la malla que se renderiza

**Files:**
- Modify: `src/utils/cloth/solverRuntimeTracker.ts` (`setAppliedSolverConfig`, `getAppliedSolverConfig`, `registerClothGeometry`, `getClothGeometry`; `clearActiveSolverTier` limpia la config)
- Modify: `src/utils/cloth/__tests__/solverRuntimeTracker.test.ts`
- Modify: `src/components/Viewport3D/useSimulationLifecycle.ts:598`, `:649-673`, `:703-724`, `:747-750`
- Modify: `src/components/Viewport3D/__tests__/useSimulationLifecycle.seamInit.test.tsx` (caso nuevo)
- Modify: `src/components/Viewport3D/GarmentSimulation.tsx:311`, `:324-325`, `:343-374`, `:414`, `:928-931`
- Modify: `src/utils/export/diagnosticExporter.ts`, `src/utils/export/__tests__/diagnosticExporter.test.ts`

**Interfaces:**
- Produces (tracker):
  ```ts
  export interface AppliedSolverConfig { tier: SolverTier; init: unknown; postInit: Record<string, unknown> }
  export function setAppliedSolverConfig(config: AppliedSolverConfig): void;
  export function getAppliedSolverConfig(): AppliedSolverConfig | null;   // null tras clearActiveSolverTier()
  export interface MeshManifestEntry { pieceId: string; vertexOffset: number; vertexCount: number; triCount: number }
  export interface ClothGeometryRecord { geometry: BufferGeometry; manifest: MeshManifestEntry[] }
  export function registerClothGeometry(geometry: BufferGeometry | null, manifest: MeshManifestEntry[]): void;
  export function getClothGeometry(): ClothGeometryRecord | null;
  ```
- Produces (exporter): `solver.appliedConfig: AppliedSolverConfig | null`, `solver.meshManifest: MeshManifestEntry[] | null`; **se elimina `solver.config`**. `DiagnosticSources` gana `getAppliedSolverConfig` y `getClothGeometry`.

- [ ] **Paso 1: tests del tracker en rojo**

Añadir a `solverRuntimeTracker.test.ts` (imports: `setAppliedSolverConfig`, `getAppliedSolverConfig`, `clearActiveSolverTier`, `setActiveSolverTier`, `registerClothGeometry`, `getClothGeometry`; y `import { BufferGeometry } from 'three';`):

```ts
describe('solverRuntimeTracker — config aplicada y geometría retenida', () => {
  it('la config aplicada se limpia con clearActiveSolverTier', () => {
    setActiveSolverTier('wasm');
    setAppliedSolverConfig({ tier: 'wasm', init: { substeps: 8 }, postInit: { wind: null } });
    expect(getAppliedSolverConfig()).toEqual({ tier: 'wasm', init: { substeps: 8 }, postInit: { wind: null } });

    clearActiveSolverTier();
    expect(getAppliedSolverConfig()).toBeNull();
  });

  it('la geometría registrada NO se limpia con clearActiveSolverTier: la reemplaza la siguiente', () => {
    const geo = new BufferGeometry();
    registerClothGeometry(geo, [{ pieceId: 'a', vertexOffset: 0, vertexCount: 3, triCount: 1 }]);
    clearActiveSolverTier();
    expect(getClothGeometry()?.geometry).toBe(geo);

    registerClothGeometry(null, []);
    expect(getClothGeometry()).toBeNull();
  });
});
```

Run → FAIL.

- [ ] **Paso 2: tracker**

Añadir a `solverRuntimeTracker.ts` (`import type { BufferGeometry } from 'three';` arriba):

```ts
// ─── Config aplicada por tier ───────────────────────────────────────────────

export interface AppliedSolverConfig {
  tier: SolverTier;
  /** Lo que se pasó al initMultiPiece* — tras configBridge, preset de modo y tejido. */
  init: unknown;
  /** Lo aplicado con llamadas posteriores al init (viento, elásticos). */
  postInit: Record<string, unknown>;
}

let appliedConfig: AppliedSolverConfig | null = null;

export function setAppliedSolverConfig(config: AppliedSolverConfig): void {
  appliedConfig = config;
}

export function getAppliedSolverConfig(): AppliedSolverConfig | null {
  return appliedConfig;
}

// ─── Geometría de la tela retenida para la foto física ──────────────────────

export interface MeshManifestEntry {
  pieceId: string;
  vertexOffset: number;
  vertexCount: number;
  triCount: number;
}

export interface ClothGeometryRecord {
  geometry: BufferGeometry;
  manifest: MeshManifestEntry[];
}

let clothGeometry: ClothGeometryRecord | null = null;

/**
 * Sin unregister a propósito: un boundary caído desmonta GarmentSimulation y
 * el fallback exporta DESPUÉS — la referencia tiene que sobrevivir al unmount.
 * La reemplaza la siguiente simulación (o `null` cuando no hay piezas).
 * ponytail: retiene una geometría entre simulaciones; si un perfil de memoria
 * lo acusa, copiar positions al registrar y soltar la geometría.
 */
export function registerClothGeometry(
  geometry: BufferGeometry | null,
  manifest: MeshManifestEntry[],
): void {
  clothGeometry = geometry ? { geometry, manifest } : null;
}

export function getClothGeometry(): ClothGeometryRecord | null {
  return clothGeometry;
}
```

y en `clearActiveSolverTier()` añadir `appliedConfig = null;`.

Run → PASS.

- [ ] **Paso 3: test del lifecycle en rojo**

En el `describe('useSimulationLifecycle — caja negra 3D: la cascada contada')` (Tarea 1) añadir (import `getAppliedSolverConfig`):

```ts
  it('registra la config que WASM recibió de verdad: substeps del preset y el viento post-init', async () => {
    localStorage.setItem(WEBGPU_FEATURE_FLAG_KEY, 'false');
    wasmMocks.isWasmSolverAvailable.mockResolvedValue(true);
    wasmMocks.initMultiPiece.mockResolvedValue(undefined);

    const store = makeStore();
    store.dispatch(startSimulation());
    renderLifecycle(store, seamInitData);
    await waitFor(() => expect(getActiveSolverTier()).toBe('wasm'));

    const applied = getAppliedSolverConfig();
    expect(applied?.tier).toBe('wasm');
    const initConfig = wasmMocks.initMultiPiece.mock.calls[0][1];
    expect(applied?.init).toBe(initConfig);
    expect(applied?.init).toHaveProperty('substeps');
    expect(applied?.init).not.toHaveProperty('numSubsteps');
    expect(applied?.postInit).toEqual({ wind: null, elastics: 0 });
  });
```

(Verificar en `useSimulationLifecycle.ts:649-660` qué posición ocupa el objeto de config en los argumentos de `wasmClient.initMultiPiece(...)`; ajustar el índice `[0][1]` a la real.)

Run → FAIL.

- [ ] **Paso 4: lifecycle**

Import `setAppliedSolverConfig` del tracker. En `:649-660` la llamada a `wasmClient.initMultiPiece(...)` recibe un objeto de config construido inline; extraerlo a `const wasmInitConfig = { … }` justo antes del `await withTimeout(` y pasar `wasmInitConfig` en su lugar (misma forma, mismo contenido). Después de `:673` (`if (elasticsRef.current.length > 0) wasmClient.setElastics(...)`) y antes de `setActiveSolverTier('wasm')`:

```ts
                setAppliedSolverConfig({
                  tier: 'wasm',
                  init: wasmInitConfig,
                  postInit: { wind: windEnabled ? windForce : null, elastics: elasticsRef.current.length },
                });
```

Mismo patrón en CPU (`:703-724`: extraer `cpuInitConfig`, registrar tras `setElastics` con `postInit: { elastics: elasticsRef.current.length }`), en GPU (`:598`: antes de `setActiveSolverTier('webgpu')`, `setAppliedSolverConfig({ tier: 'webgpu', init: { solverConfig: tslSolverConfig, fabricCompliance }, postInit: { frozenPieces: frozenPieceIds.length } })`), y en Neural (`:749`: `setAppliedSolverConfig({ tier: 'neural-drape', init: { pieces: placedMeshes.length }, postInit: {} })`).

Run → PASS.

- [ ] **Paso 5: GarmentSimulation — el manifiesto en el mismo loop que la geometría**

`GarmentSimulation.tsx`:

- `:311`: `const { staticGeometry, meshManifest } = useMemo(() => {`
- `:325`: `if (validMeshes.length === 0) return { staticGeometry: null, meshManifest: [] as MeshManifestEntry[] };`
- Antes del `for (let pi = 0; …)` de `:343`: `const meshManifest: MeshManifestEntry[] = [];`
- Dentro del loop, justo antes de `vOffset += numVerts;` (`:373`): `meshManifest.push({ pieceId: p.pieceId, vertexOffset: vOffset, vertexCount: numVerts, triCount: p.triIds.length / 3 });`
- `:414`: `return { staticGeometry: geo, meshManifest };`
- `:928-931`, reemplazar por:

```ts
  useEffect(() => {
    geometryRef.current = staticGeometry;
    // Caja negra 3D: la foto física sale de ESTA geometría, retenida en el
    // tracker sin unregister (sobrevive al unmount por un boundary caído).
    registerClothGeometry(staticGeometry, meshManifest);
  }, [staticGeometry, meshManifest]);
```

Import: `import { pushSolverEvent, registerClothGeometry, type MeshManifestEntry } from '../../utils/cloth/solverRuntimeTracker';` (fusionar con el import de la Tarea 2).

- [ ] **Paso 6: test del exporter en rojo**

En `diagnosticExporter.test.ts`, en `sources()` añadir:

```ts
    getAppliedSolverConfig: vi.fn(() => ({ tier: 'wasm', init: { substeps: 8 }, postInit: { wind: null, elastics: 0 } })),
    getClothGeometry: vi.fn(() => null),
```

En el primer caso (`'exporta slices, inspector y active/last-selected por separado'`) quitar la línea `config: state.simulation,` del `toMatchObject` y añadir después del `expect(bundle).toMatchObject(...)`:

```ts
    expect(bundle.solver).not.toHaveProperty('config');
    expect(bundle.solver.appliedConfig).toEqual({ tier: 'wasm', init: { substeps: 8 }, postInit: { wind: null, elastics: 0 } });
    expect(bundle.solver.meshManifest).toBeNull();
```

Caso nuevo:

```ts
  it('lleva el manifiesto por pieza de la geometría registrada', () => {
    const s = sources(false);
    s.getClothGeometry = vi.fn(() => ({
      geometry: { attributes: { position: { array: new Float32Array(6 * 3) } } } as never,
      manifest: [
        { pieceId: 'a', vertexOffset: 0, vertexCount: 4, triCount: 2 },
        { pieceId: 'b', vertexOffset: 4, vertexCount: 2, triCount: 0 },
      ],
    }));
    const bundle = buildDiagnosticBundle(state, undefined, s);
    expect(bundle.solver.meshManifest).toEqual([
      { pieceId: 'a', vertexOffset: 0, vertexCount: 4, triCount: 2 },
      { pieceId: 'b', vertexOffset: 4, vertexCount: 2, triCount: 0 },
    ]);
  });
```

Run → FAIL.

- [ ] **Paso 7: exporter**

`diagnosticExporter.ts`: import `getAppliedSolverConfig`, `getClothGeometry` del tracker; `DiagnosticSources` gana ambos; `browserSources` también. En `DiagnosticBundle.solver`: **quitar `config`**, añadir `appliedConfig: ReturnType<typeof getAppliedSolverConfig>; meshManifest: MeshManifestEntry[] | null;`. En `buildDiagnosticBundle`: quitar `config: state.simulation,`; añadir `appliedConfig: sources.getAppliedSolverConfig(), meshManifest: sources.getClothGeometry()?.manifest ?? null,`.

Run → PASS.

- [ ] **Paso 8: gate y commit**

Run: `npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui` → verde.

```bash
git add src/utils/cloth/solverRuntimeTracker.ts src/utils/cloth/__tests__/solverRuntimeTracker.test.ts src/components/Viewport3D/useSimulationLifecycle.ts src/components/Viewport3D/__tests__/useSimulationLifecycle.seamInit.test.tsx src/components/Viewport3D/GarmentSimulation.tsx src/utils/export/diagnosticExporter.ts src/utils/export/__tests__/diagnosticExporter.test.ts
git commit -m "feat(diagnostico): config aplicada por tier y manifiesto por pieza de la geometría renderizada"
```

---

### Tarea 6: La foto física de la tela al exportar, también desde una pantalla de error

**Files:**
- Modify: `src/utils/export/diagnosticExporter.ts`
- Modify: `src/utils/export/__tests__/diagnosticExporter.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const CLOTH_SNAPSHOT_MAX_VERTICES = 100_000;
  export interface ClothSnapshot {
    vertexCount: number;
    encoding: 'float32-base64';
    positions: string | null;      // null cuando positionsOmitted
    positionsOmitted: boolean;
    manifestMismatch: boolean;     // vertexCount !== suma de manifest.vertexCount
  }
  export function float32ToBase64(arr: Float32Array): string;
  export function base64ToFloat32(b64: string): Float32Array;
  ```
  `solver.clothSnapshot: ClothSnapshot | null`. `downloadDiagnosticBundle` reintenta sin foto si `build + stringify` lanza.

- [ ] **Paso 1: tests en rojo**

Añadir a `diagnosticExporter.test.ts` (imports: `base64ToFloat32`, `CLOTH_SNAPSHOT_MAX_VERTICES`, `downloadDiagnosticBundle`, `float32ToBase64`; y `import * as turntable from '../turntableRenderer';`, `import { getTrackedErrors, clearTrackedErrors } from '../../errorTracker';`):

```ts
function geometryOf(positions: Float32Array, manifest: Array<{ pieceId: string; vertexOffset: number; vertexCount: number; triCount: number }>) {
  return { geometry: { attributes: { position: { array: positions } } } as never, manifest };
}

describe('foto física de la tela', () => {
  it('base64 ↔ Float32Array es exacto', () => {
    const arr = new Float32Array([0, 1.5, -2.25, 3.14159, 1e-7]);
    expect(base64ToFloat32(float32ToBase64(arr))).toEqual(arr);
  });

  it('exporta las posiciones en base64 y el manifiesto corta cada pieza en su rango', () => {
    const positions = new Float32Array([0, 0, 0,  1, 0, 0,  0, 1, 0,   5, 5, 5,  6, 5, 5]);
    const s = sources(false);
    s.getClothGeometry = vi.fn(() => geometryOf(positions, [
      { pieceId: 'a', vertexOffset: 0, vertexCount: 3, triCount: 1 },
      { pieceId: 'b', vertexOffset: 3, vertexCount: 2, triCount: 0 },
    ]));

    const snap = buildDiagnosticBundle(state, undefined, s).solver.clothSnapshot!;

    expect(snap).toMatchObject({ vertexCount: 5, encoding: 'float32-base64', positionsOmitted: false, manifestMismatch: false });
    const decoded = base64ToFloat32(snap.positions!);
    expect(decoded).toEqual(positions);
    expect(Array.from(decoded.subarray(3 * 3, 5 * 3))).toEqual([5, 5, 5, 6, 5, 5]);
  });

  it('por encima del techo omite las posiciones pero conserva el conteo', () => {
    const s = sources(false);
    s.getClothGeometry = vi.fn(() => geometryOf(new Float32Array((CLOTH_SNAPSHOT_MAX_VERTICES + 1) * 3), [
      { pieceId: 'a', vertexOffset: 0, vertexCount: CLOTH_SNAPSHOT_MAX_VERTICES + 1, triCount: 0 },
    ]));
    const snap = buildDiagnosticBundle(state, undefined, s).solver.clothSnapshot!;
    expect(snap).toMatchObject({ vertexCount: CLOTH_SNAPSHOT_MAX_VERTICES + 1, positions: null, positionsOmitted: true });
  });

  it('marca manifestMismatch cuando el manifiesto no suma los vértices del buffer', () => {
    const s = sources(false);
    s.getClothGeometry = vi.fn(() => geometryOf(new Float32Array(4 * 3), [
      { pieceId: 'a', vertexOffset: 0, vertexCount: 3, triCount: 1 },
    ]));
    expect(buildDiagnosticBundle(state, undefined, s).solver.clothSnapshot?.manifestMismatch).toBe(true);
  });

  it('sin geometría registrada la foto es null', () => {
    expect(buildDiagnosticBundle(state, undefined, sources(false)).solver.clothSnapshot).toBeNull();
  });
});

describe('downloadDiagnosticBundle — red en el botón', () => {
  beforeEach(clearTrackedErrors);

  it('si la serialización lanza, reintenta sin la foto y registra el fallo', () => {
    const download = vi.spyOn(turntable, 'downloadBlob').mockImplementation(() => {});
    const s = sources(false);
    s.getClothGeometry = vi.fn(() => geometryOf(new Float32Array(3), [{ pieceId: 'a', vertexOffset: 0, vertexCount: 1, triCount: 0 }]));
    const stringify = vi.spyOn(JSON, 'stringify');
    stringify.mockImplementationOnce(() => { throw new TypeError('Do not know how to serialize a BigInt'); });

    downloadDiagnosticBundle(state, s);

    expect(download).toHaveBeenCalledTimes(1);
    const blob = download.mock.calls[0][0] as Blob;
    expect(blob.size).toBeGreaterThan(0);
    expect(getTrackedErrors()).toContainEqual(expect.objectContaining({ source: 'diagnosticExporter' }));
    stringify.mockRestore();
    download.mockRestore();
  });
});
```

(`downloadDiagnosticBundle` gana un segundo parámetro opcional `sources` para el test.) Run → FAIL.

- [ ] **Paso 2: exporter**

En `diagnosticExporter.ts`:

```ts
import { getTrackedErrors, pushError } from '../errorTracker';
import {
  getActiveSolverTier, getAppliedSolverConfig, getClothGeometry, getSolverEvents,
  type ClothGeometryRecord, type MeshManifestEntry,
} from '../cloth/solverRuntimeTracker';

export const CLOTH_SNAPSHOT_MAX_VERTICES = 100_000;

export interface ClothSnapshot {
  vertexCount: number;
  encoding: 'float32-base64';
  positions: string | null;
  positionsOmitted: boolean;
  manifestMismatch: boolean;
}

export function float32ToBase64(arr: Float32Array): string {
  const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
  let binary = '';
  const CHUNK = 0x8000; // String.fromCharCode con spread revienta la pila por encima de esto
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
  }
  return btoa(binary);
}

export function base64ToFloat32(b64: string): Float32Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Float32Array(bytes.buffer);
}

function snapshotOf(record: ClothGeometryRecord | null): ClothSnapshot | null {
  if (!record) return null;
  const array = record.geometry.attributes.position?.array as Float32Array | undefined;
  if (!array) return null;
  const vertexCount = array.length / 3;
  const manifestTotal = record.manifest.reduce((sum, m) => sum + m.vertexCount, 0);
  // ponytail: techo fijo; si un bundle real lo pisa, decidir entonces.
  const omit = vertexCount > CLOTH_SNAPSHOT_MAX_VERTICES;
  return {
    vertexCount,
    encoding: 'float32-base64',
    positions: omit ? null : float32ToBase64(array instanceof Float32Array ? array : Float32Array.from(array)),
    positionsOmitted: omit,
    manifestMismatch: vertexCount !== manifestTotal,
  };
}
```

`DiagnosticSources` ya tiene `getClothGeometry` (Tarea 5). `DiagnosticBundle.solver` gana `clothSnapshot: ClothSnapshot | null`; en `buildDiagnosticBundle`: `clothSnapshot: snapshotOf(sources.getClothGeometry()),`.

`downloadDiagnosticBundle`:

```ts
export function downloadDiagnosticBundle(
  state: DiagnosticState,
  sources: DiagnosticSources = browserSources,
): void {
  let bundle: DiagnosticBundle;
  let json: string;
  try {
    bundle = buildDiagnosticBundle(state, undefined, sources);
    json = JSON.stringify(bundle, null, 2);
  } catch (e) {
    // El botón vive en el fallback de un boundary caído: ningún boundary
    // atrapa un throw de este onClick. Reintento sin la parte pesada y
    // registro del fallo para que el propio bundle lo cuente.
    pushError({
      message: `Exportación sin foto: ${e instanceof Error ? e.message : String(e)}`,
      source: 'diagnosticExporter',
      timestamp: Date.now(),
    });
    bundle = buildDiagnosticBundle(state, undefined, { ...sources, getClothGeometry: () => null });
    json = JSON.stringify(bundle, null, 2);
  }
  const safeTimestamp = bundle.exportedAt.replace(/[:.]/g, '-');
  downloadBlob(
    new Blob([json], { type: 'application/json' }),
    `vina-diagnostico-${safeTimestamp}.json`,
  );
}
```

Verificar que `downloadBlob` se importa como `import { downloadBlob } from './turntableRenderer';` (ya está) — el test lo espía vía `import * as turntable`; si el bundler no permite espiar un named export ESM, cambiar el test a `vi.mock('../turntableRenderer', …)` con `downloadBlob: vi.fn()`.

Run → PASS.

- [ ] **Paso 3: gate y commit**

Run: `npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui` → verde.

```bash
git add src/utils/export/diagnosticExporter.ts src/utils/export/__tests__/diagnosticExporter.test.ts
git commit -m "feat(diagnostico): la foto física de la tela viaja en el bundle, también desde un boundary caído"
```

---

### Tarea 7: Verificación de la puerta (manual + e2e) y PR

**Files:**
- Create: `tests/e2e/diagnostico-3d.spec.ts`
- Modify: `docs/plans/2026-08-28-caja-negra-telemetria-3d.md` (marcar el estado), `CHANGELOG.md` `[Unreleased]`

- [ ] **Paso 1: e2e del escenario 1 (flag apagado) — primer e2e que intercepta una descarga**

```ts
import { test, expect } from '@playwright/test';

test('exportar diagnóstico tras simular con WebGPU apagado cuenta la cascada y trae la foto', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('vina-use-webgpu', 'false'));
  await page.goto('/');
  // Reusar el helper de carga de proyecto de ejemplo que usen los specs de
  // simulación existentes en tests/e2e (buscar `simulate` o `Simular` en ellos)
  // y arrancar la simulación por la misma puerta que ellos.
  // …carga + Play…
  await page.getByRole('button', { name: /estado de la simulación/i }).waitFor();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /^Vina$|menú/i }).click().then(() => page.getByText('Exportar diagnóstico').click()),
  ]);
  const path = await download.path();
  const bundle = JSON.parse(require('node:fs').readFileSync(path!, 'utf8'));

  const kinds = bundle.solver.events.map((e: { kind: string; data: { tier?: string; reason?: string } }) => [e.kind, e.data.tier, e.data.reason]);
  expect(kinds).toContainEqual(['tier:skipped', 'webgpu', 'flag-off']);
  expect(kinds).toContainEqual(['tier:selected', 'wasm', undefined]);
  expect(bundle.solver.activeTier).toBe('wasm');
  expect(bundle.solver.appliedConfig.tier).toBe('wasm');
  expect(bundle.solver.clothSnapshot.vertexCount).toBe(
    bundle.solver.meshManifest.reduce((s: number, m: { vertexCount: number }) => s + m.vertexCount, 0),
  );
});
```

(Los selectores del menú y del botón de Play se copian de los specs existentes: `grep -rn "Exportar diagnóstico\|Simular" tests/e2e | head`. Servidor caliente y pocos workers: `npx playwright test tests/e2e/diagnostico-3d.spec.ts --workers=2` con `npm run dev` ya levantado.)

- [ ] **Paso 2: verificación manual (spec § 5, escenarios 2–5)** — anotar el resultado de cada uno en el PR: WASM roto → `tier:failed{wasm, availability}`; `__VINA_RENDERER_DEVICE__.destroy()` → `device:lost{renderer}` y, tras recargar, sigue en `errors`; crash del visor con un `throw` temporal → el fallback exporta `clothSnapshot` no nulo; Stop→Play con init lento → dos `cascade:start`, el `tier:failed` viejo con `stale:true`.

- [ ] **Paso 3: docs**

`docs/plans/2026-08-28-caja-negra-telemetria-3d.md`: cambiar «**Estado:** propuesta v2, pendiente de aprobación» por «**Estado:** aprobada 2026-08-28; implementada en PR #<n> (tareas 1–6); replay (§ 4 paso 6) en issue #<m>». `CHANGELOG.md` `[Unreleased] › Added`: una entrada «**Diagnostic black box, 3D half (#<n>)** — the bundle now carries the solver cascade log (which tier ran, which were skipped and why, each failure with phase and stack, per cascade run), WebGPU device loss surviving the reload its toast asks for, runtime errors from every tier with their code, NaN and self-collision diagnostics from the WASM worker, the config each tier actually received, a per-piece mesh manifest and a base64 Float32 snapshot of the rendered cloth — also when exported from a crashed viewport's fallback. Fixes a pre-existing race where a stale cascade run could dispose the live solver client after Stop→Play.»

- [ ] **Paso 4: gate completo, push y PR**

Run: `npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui` → verde. `git push -u origin feat/caja-negra-3d`; `gh pr create` con el resumen por tarea, el registro de la verificación manual y el enlace al spec. Abrir el issue del replay (§ 4 paso 6 del spec) con sus dos precondiciones.

---

## Self-review (hecho al escribir)

- **Cobertura del spec:** § 4 pasos 0–5 ↔ Tareas 1–6 uno a uno; § 5 (verificación) ↔ Tarea 7; § 4 paso 6 ↔ issue en Tarea 7; § 3 «cambio de la v2» (geometría retenida) ↔ Tarea 5 paso 2 + Tarea 6; carrera (§ 1, § 8.4) ↔ Tarea 1 pasos 5–7; `solver.config` borrado ↔ Tarea 5 paso 7; coalescencia ↔ Tarea 4; `__VINA_RENDERER_DEVICE__` DEV ↔ Tarea 2 paso 2.
- **Placeholders:** ninguno; donde una firma real puede diferir (índice del argumento de config en `initMultiPiece`, orden de `setTslCollisionBody`, fixture de `clothWorkerClient`, selectores del e2e) el paso dice qué verificar y dónde.
- **Consistencia de tipos:** `pushSolverEvent(kind, data?, generation?)` en todas las tareas; `coalesceSolverEvent(kind, data)`; `AppliedSolverConfig {tier, init, postInit}`; `MeshManifestEntry {pieceId, vertexOffset, vertexCount, triCount}`; `ClothGeometryRecord {geometry, manifest}`; `ClothSnapshot {vertexCount, encoding, positions, positionsOmitted, manifestMismatch}`; `DiagnosticSources` gana `getSolverEvents` (T1), `getAppliedSolverConfig` + `getClothGeometry` (T5).
