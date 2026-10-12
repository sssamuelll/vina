/**
 * @vitest-environment jsdom
 *
 * El solver usa la tela preparada (simular al instante, tarea 8). La rama
 * WebGPU de la cascada armaba la tela en el hilo principal dentro de
 * `initMultiPieceTsl` (~735 ms congelados en la camisa de María). Ahora la
 * pide a `obtenerTela` con la huella de todo lo que entra al armado y se la
 * pasa armada al cliente, que solo la sube a la GPU.
 *
 * Arnés de pausar-no-vuelve-a-vestir.test.tsx, con `obtenerTela` de mentira.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import type { ReactNode } from 'react';

const wasm = vi.hoisted(() => ({ initMultiPiece: vi.fn(), isWasmSolverAvailable: vi.fn() }));
const gpu = vi.hoisted(() => ({
  initMultiPieceTsl: vi.fn(),
  instancias: [] as Array<{ dispose: ReturnType<typeof vi.fn> }>,
}));
const telas = vi.hoisted(() => ({ obtenerTela: vi.fn() }));

vi.mock('../../../utils/cloth/gpu/telasPreparadas', () => ({ obtenerTela: telas.obtenerTela }));
vi.mock('../../../utils/cloth/wasm/wasmSolverClient', () => ({
  WasmSolverClient: class {
    onFrame = null;
    onEdgeData = null;
    initMultiPiece = wasm.initMultiPiece;
    requestEdgeData = vi.fn();
    start = vi.fn();
    stop = vi.fn();
    dispose = vi.fn();
    setWind = vi.fn();
    setElastics = vi.fn();
    setCollisionMesh = vi.fn();
    updateCollisionBody = vi.fn();
    applyInitialTriangleCollision = vi.fn();
  },
  isWasmSolverAvailable: wasm.isWasmSolverAvailable,
}));
vi.mock('../../../utils/cloth/gpu/gpuSolverClient', () => ({
  GpuSolverClient: class {
    constructor() {
      gpu.instancias.push(this as unknown as (typeof gpu.instancias)[number]);
    }
    onFrame = null;
    onEdgeData = null;
    requestEdgeData = vi.fn();
    initMultiPieceTsl = gpu.initMultiPieceTsl;
    getTslSolver = () => ({});
    setCollisionMesh = vi.fn();
    updateCollisionBody = vi.fn();
    freezePieces = vi.fn();
    setWind = vi.fn();
    start = vi.fn();
    stop = vi.fn();
    dispose = vi.fn();
  },
}));
vi.mock('../../../utils/cloth/gpu/webgpuDetect', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../utils/cloth/gpu/webgpuDetect')>()),
  isWebGPUAvailable: () => true,
}));
vi.mock('../../../utils/cloth/avatarCollisionMesh', () => ({
  extractAvatarCollisionMesh: vi.fn().mockResolvedValue(null),
}));
vi.mock('../../../utils/cloth/renderCollisionBake', () => ({
  bakeCollisionFromRender: vi.fn().mockResolvedValue({ triCount: 1 }),
}));
vi.mock('../../../utils/cloth/penetrationMetric', () => ({
  registerPenetrationBody: vi.fn(),
}));
vi.mock('../../../utils/import/meshImporter', () => ({
  importMesh: vi.fn().mockRejectedValue(new Error('not in test')),
}));

import { useSimulationLifecycle, type PlacedMesh } from '../useSimulationLifecycle';
import type { SeamInitData } from '../../../utils/cloth/clothWorker';
import type { Elastic } from '../../../types/types';
import type { TelaPreparada } from '../../../utils/cloth/gpu/prepararTela';
import { complianceDeTela } from '../../../utils/cloth/complianceDeTela';
import { getAllPhysicalFabrics, getPhysicalFabric, toXPBDParams } from '../../../utils/cloth/physicalFabric';
import { huella } from '../../../utils/cloth/huella';
import { seamInitDataToPairs } from '../../../utils/cloth/seamPairs';
import projectReducer from '../../../store/projectSlice';
import simulationReducer, { resetSimulation, startSimulation } from '../../../store/simulationSlice';
import avatarReducer from '../../../store/avatarSlice';
import collisionBodyReducer from '../../../store/collisionBodySlice';
import copilotUIReducer from '../../../store/copilotUISlice';
import inspectorReducer from '../../../store/inspectorSlice';
import {
  clearActiveSolverTier,
  clearSolverEvents,
  getActiveSolverTier,
  getSolverEvents,
} from '../../../utils/cloth/solverRuntimeTracker';

describe('complianceDeTela', () => {
  // La expresión que la rama GPU de la cascada armaba en línea, copiada tal cual.
  const comoAntes = (fabricId: string) => {
    const pf = getPhysicalFabric(fabricId);
    const xpbd = pf ? toXPBDParams(pf) : undefined;
    return xpbd
      ? {
          stretchComplianceWarp: 0.0,
          stretchComplianceWeft: 0.0,
          shearCompliance: 0.001,
          bendComplianceWarp: xpbd.bendComplianceWarp,
          bendComplianceWeft: xpbd.bendComplianceWeft,
          density: xpbd.density,
        }
      : undefined;
  };

  it('es el objeto que la rama GPU armaba en línea, para cada tela de la biblioteca', () => {
    expect(complianceDeTela('cotton-poplin')).toBeDefined();
    for (const { id } of getAllPhysicalFabrics()) expect(complianceDeTela(id), id).toStrictEqual(comoAntes(id));
  });

  it('una tela que no está en la biblioteca no trae compliance: el armado usa la suya', () => {
    expect(complianceDeTela('no-existe')).toBeUndefined();
  });
});

// ─── La rama WebGPU de la cascada ────────────────────────────────────────────

function makeStore() {
  return configureStore({
    reducer: {
      project: projectReducer,
      simulation: simulationReducer,
      avatar: avatarReducer,
      collisionBody: collisionBodyReducer,
      copilotUI: copilotUIReducer,
      inspector: inspectorReducer,
    },
  });
}

/** Un triángulo con su borde derecho: la costura de abajo lo resuelve y la prenda cose. */
const malla = (pieceId: string): PlacedMesh => ({
  pieceId,
  vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
  triIds: new Int32Array([0, 1, 2]),
  outline: [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [10, 0] },
    { type: 'L', values: [10, 10] },
    { type: 'Z', values: [] },
  ],
  edges: [{ name: 'rightEdge', segmentRange: [1, 2] }],
});

const costura: SeamInitData = {
  id: 'costura-1',
  pieceAId: 'a',
  pieceAEdgeName: 'rightEdge',
  pieceBId: 'b',
  pieceBEdgeName: 'rightEdge',
  type: 'standard',
  tension: 100,
  strength: 1.0,
  active: true,
  taped: false,
};

/** Lo que devuelve el `obtenerTela` de mentira: la tela no se mira, se sigue. */
const TELA = { marca: 'la tela de obtenerTela' } as unknown as TelaPreparada;

/** «Simular» con una prenda de dos piezas cosidas y la tela de la biblioteca. Listas estables, como los useMemo. */
function simular() {
  (globalThis.navigator as { gpu?: unknown }).gpu = {
    requestAdapter: async () => ({
      requestDevice: async () => ({
        lost: new Promise(() => {}),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        pushErrorScope: vi.fn(),
        popErrorScope: vi.fn().mockResolvedValue(null),
      }),
    }),
  };
  const store = makeStore();
  store.dispatch(startSimulation());
  const placedMeshes = [malla('a'), malla('b')];
  const seamInitData = [costura];
  const elastics: Elastic[] = [];
  const stretchingIdsRef = { current: null as Int32Array | null };
  renderHook(
    () => useSimulationLifecycle({ placedMeshes, seamInitData, elastics, fabricId: 'cotton-poplin', stretchingIdsRef }),
    { wrapper: ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider> },
  );
  return { store, placedMeshes, seamInitData };
}

const usadas = () => getSolverEvents().filter((e) => e.kind === 'preparar:usada');

afterEach(() => {
  vi.useRealTimers();
  clearActiveSolverTier();
  clearSolverEvents();
  gpu.instancias.length = 0;
  vi.clearAllMocks();
  localStorage.removeItem('vina-crossbend');
  delete (globalThis.navigator as { gpu?: unknown }).gpu;
});

describe('la cascada WebGPU usa la tela preparada', () => {
  it('pide la tela con la huella de lo que entra al armado y se la pasa al solver', async () => {
    localStorage.setItem('vina-crossbend', 'off');
    telas.obtenerTela.mockResolvedValue({ tela: TELA, origen: 'cache' });
    gpu.initMultiPieceTsl.mockResolvedValue(undefined);
    const { placedMeshes, seamInitData } = simular();
    await waitFor(() => expect(getActiveSolverTier()).toBe('webgpu'));

    // Las entradas, calculadas aquí por su cuenta: quien prepare la tela por
    // adelantado con estas mismas tiene que dar esta huella.
    const seamPairs = seamInitDataToPairs(seamInitData, placedMeshes);
    const fabric = complianceDeTela('cotton-poplin');
    const interruptores = { crossBend: false, seamScExcl: true };
    expect(seamPairs.length, 'la prenda cose: las costuras entran a la huella').toBeGreaterThan(0);

    expect(telas.obtenerTela).toHaveBeenCalledTimes(1);
    // Sin `soloFueraDelHilo`: al pulsar, sin worker la tela se arma en el hilo, como antes.
    expect(telas.obtenerTela.mock.calls[0]).toEqual([
      huella(placedMeshes, seamPairs, fabric, interruptores),
      { pieces: placedMeshes, seamPairs, fabric, interruptores },
    ]);
    expect(gpu.initMultiPieceTsl).toHaveBeenCalledTimes(1);
    const [piezas, costuras, , tela, preparada] = gpu.initMultiPieceTsl.mock.calls[0];
    expect([piezas, costuras, tela], 'el solver arma con las mismas entradas que la huella').toEqual([placedMeshes, seamPairs, fabric]);
    expect(preparada, 'la tela de obtenerTela, quinto argumento').toBe(TELA);
  });

  it.each(['cache', 'armada-en-el-hilo'])('empuja preparar:usada con el origen que dio obtenerTela (%s), en la generación de la corrida', async (origen) => {
    telas.obtenerTela.mockResolvedValue({ tela: TELA, origen });
    gpu.initMultiPieceTsl.mockResolvedValue(undefined);
    simular();
    await waitFor(() => expect(getActiveSolverTier()).toBe('webgpu'));

    expect(usadas().map((e) => e.data)).toEqual([{ fase: 'tela', origen }]);
    const corrida = getSolverEvents().find((e) => e.kind === 'cascade:start')!;
    expect(usadas()[0].generation).toBe(corrida.generation);
  });

  it('cancelada («Restablecer») mientras obtenerTela espera: no arma el solver ni dice que usó la tela', async () => {
    let entregar: (r: { tela: TelaPreparada; origen: string }) => void = () => {};
    telas.obtenerTela.mockImplementation(() => new Promise((ok) => { entregar = ok; }));
    gpu.initMultiPieceTsl.mockResolvedValue(undefined);
    const { store } = simular();
    await waitFor(() => expect(telas.obtenerTela).toHaveBeenCalledTimes(1));

    await act(async () => { store.dispatch(resetSimulation()); });
    await act(async () => {
      entregar({ tela: TELA, origen: 'armada' });
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(gpu.initMultiPieceTsl).not.toHaveBeenCalled();
    expect(usadas()).toEqual([]);
  });

  it('vencido el plazo de 12 s mientras obtenerTela espera: cae a WASM, y la tela que llega tarde no arma el cliente soltado', async () => {
    // Un worker que no contesta (10 s) y el armado en el hilo después pueden
    // pasar del plazo. La cascada ya siguió con WASM; la tela que llega tarde
    // no es de nadie.
    vi.useFakeTimers();
    let entregar: (r: { tela: TelaPreparada; origen: string }) => void = () => {};
    telas.obtenerTela.mockImplementation(() => new Promise((ok) => { entregar = ok; }));
    gpu.initMultiPieceTsl.mockResolvedValue(undefined);
    wasm.isWasmSolverAvailable.mockResolvedValue(true);
    wasm.initMultiPiece.mockResolvedValue(undefined);
    simular();
    await vi.waitFor(() => expect(telas.obtenerTela).toHaveBeenCalledTimes(1));

    await act(async () => { await vi.advanceTimersByTimeAsync(12_000); });
    await vi.waitFor(() => expect(getActiveSolverTier()).toBe('wasm'));
    expect(getSolverEvents().find((e) => e.kind === 'tier:failed')!.data).toMatchObject({ tier: 'webgpu', phase: 'timeout' });

    await act(async () => {
      entregar({ tela: TELA, origen: 'armada' });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(gpu.initMultiPieceTsl).not.toHaveBeenCalled();
    expect(usadas(), 'la corrida no usó esa tela: siguió con WASM').toEqual([]);
  });

  it.each([
    ['obtenerTela', () => {
      telas.obtenerTela.mockRejectedValue(new Error('se rompió'));
      gpu.initMultiPieceTsl.mockResolvedValue(undefined);
    }],
    ['initMultiPieceTsl', () => {
      telas.obtenerTela.mockResolvedValue({ tela: TELA, origen: 'armada' });
      gpu.initMultiPieceTsl.mockRejectedValue(new Error('se rompió'));
    }],
  ])('si %s falla, la cascada cae a WASM igual', async (_, fallar) => {
    fallar();
    wasm.isWasmSolverAvailable.mockResolvedValue(true);
    wasm.initMultiPiece.mockResolvedValue(undefined);
    simular();
    await waitFor(() => expect(getActiveSolverTier()).toBe('wasm'));

    const tiers = getSolverEvents().filter((e) => e.kind.startsWith('tier:')).map((e) => [e.kind, e.data.tier]);
    expect(tiers).toEqual([['tier:selected', 'webgpu'], ['tier:failed', 'webgpu'], ['tier:selected', 'wasm']]);
    expect(getSolverEvents().find((e) => e.kind === 'tier:failed')!.data)
      .toMatchObject({ phase: 'init', message: 'se rompió', stale: false });
    expect(gpu.instancias[0].dispose, 'suelta el cliente GPU').toHaveBeenCalled();
  });
});
