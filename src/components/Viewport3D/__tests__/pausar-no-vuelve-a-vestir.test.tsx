/**
 * @vitest-environment jsdom
 *
 * Pausar no vuelve a vestir (2026-10-11). Samuel, en su PC con Chrome: «se
 * reinicia». El botón «Simular» alterna entre correr y pausar, pero el efecto
 * de la cascada tenía `simulationState` entre sus dependencias: al pasar de
 * 'running' a 'paused' su limpieza destruía el solver, y al reanudar arrancaba
 * una cascada nueva desde la colocación inicial. La prenda volvía a empezar.
 *
 * El contrato: una sesión vive mientras la simulación no esté en 'idle'.
 * Pausar para el solver sin soltarlo y reanudar sigue donde estaba; solo
 * «Restablecer» (idle) lo destruye.
 *
 * Harness modelado sobre useSimulationLifecycle.seamInit.test.tsx.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import type { ReactNode } from 'react';

const wasm = vi.hoisted(() => ({
  initMultiPiece: vi.fn(),
  isWasmSolverAvailable: vi.fn(),
  instancias: [] as Array<{ start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> }>,
}));
const cpu = vi.hoisted(() => ({ initMultiPiece: vi.fn() }));
const neural = vi.hoisted(() => ({
  instancias: [] as Array<{ start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> }>,
}));
const gpu = vi.hoisted(() => ({
  initMultiPieceTsl: vi.fn(),
  isWebGPUAvailable: vi.fn(() => false),
  instancias: [] as Array<{ dispose: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }>,
}));

vi.mock('../../../utils/cloth/wasm/wasmSolverClient', () => ({
  WasmSolverClient: class {
    constructor() {
      wasm.instancias.push(this as unknown as (typeof wasm.instancias)[number]);
    }
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
vi.mock('../../../utils/cloth/clothWorkerClient', () => ({
  ClothWorkerClient: class {
    onFrame = null;
    onEdgeData = null;
    initMultiPiece = cpu.initMultiPiece;
    init = vi.fn();
    setFabric = vi.fn();
    requestEdgeData = vi.fn();
    start = vi.fn();
    stop = vi.fn();
    dispose = vi.fn();
    setElastics = vi.fn();
    setCollisionMesh = vi.fn();
    updateCollisionBody = vi.fn();
  },
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
vi.mock('../../../utils/cloth/neural/neuralDrapeClient', () => ({
  NeuralDrapeClient: class {
    constructor() {
      neural.instancias.push(this as unknown as (typeof neural.instancias)[number]);
    }
    onFrame = null;
    initMultiPiece = vi.fn().mockResolvedValue(undefined);
    start = vi.fn();
    stop = vi.fn();
    dispose = vi.fn();
  },
}));
vi.mock('../../../utils/cloth/gpu/webgpuDetect', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../utils/cloth/gpu/webgpuDetect')>()),
  isWebGPUAvailable: gpu.isWebGPUAvailable,
}));
vi.mock('../../../utils/cloth/avatarCollisionMesh', () => ({
  extractAvatarCollisionMesh: vi.fn().mockResolvedValue(null),
}));
// El horneado del cuerpo que se ve: con un cuerpo de mentira, la carga de la
// colisión (y su reconstrucción) llegan al cliente y se pueden contar.
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
import { WEBGPU_FEATURE_FLAG_KEY } from '../../../utils/cloth/gpu/webgpuDetect';
import projectReducer from '../../../store/projectSlice';
import simulationReducer, { marcarTelaEnMovimiento, pauseSimulation, resetSimulation, startSimulation } from '../../../store/simulationSlice';
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
});

/**
 * Mallas, costuras y elásticos son listas ESTABLES, como los `useMemo` de
 * GarmentSimulation sin cambios en el patrón: una lista nueva por render es
 * una cascada nueva por render, y el test mediría eso y no la pausa.
 */
function montar(store: ReturnType<typeof makeStore>) {
  const placedMeshes = [malla('a')];
  const seamInitData: SeamInitData[] = [];
  const elastics: Elastic[] = [];
  const stretchingIdsRef = { current: null as Int32Array | null };
  return renderHook(
    () => useSimulationLifecycle({ placedMeshes, seamInitData, elastics, fabricId: 'cotton-poplin', stretchingIdsRef }),
    { wrapper: ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider> },
  );
}

const arranques = () => getSolverEvents().filter((e) => e.kind === 'cascade:start').length;

function gpuFalsa() {
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
}

afterEach(() => {
  clearActiveSolverTier();
  clearSolverEvents();
  wasm.instancias.length = 0;
  gpu.instancias.length = 0;
  neural.instancias.length = 0;
  vi.clearAllMocks();
  localStorage.removeItem(WEBGPU_FEATURE_FLAG_KEY);
  gpu.isWebGPUAvailable.mockReturnValue(false);
  delete (globalThis.navigator as { gpu?: unknown }).gpu;
});

describe('pausar no vuelve a vestir', () => {
  it('WebGPU: pausar y reanudar deja vivo el mismo solver, sin otra cascada', async () => {
    gpu.isWebGPUAvailable.mockReturnValue(true);
    gpu.initMultiPieceTsl.mockResolvedValue(undefined);
    gpuFalsa();
    const store = makeStore();
    store.dispatch(startSimulation());
    montar(store);
    await waitFor(() => expect(getActiveSolverTier()).toBe('webgpu'));

    await act(async () => { store.dispatch(pauseSimulation()); });
    expect(gpu.instancias[0].dispose, 'pausar no suelta el solver').not.toHaveBeenCalled();

    await act(async () => { store.dispatch(startSimulation()); });
    await waitFor(() => expect(getActiveSolverTier()).toBe('webgpu'));
    expect(gpu.instancias, 'reanudar no crea otro solver').toHaveLength(1);
    expect(gpu.initMultiPieceTsl).toHaveBeenCalledTimes(1);
    expect(arranques(), 'una sola cascada: la del primer «Simular»').toBe(1);
  });

  it('WASM: pausar para el worker y reanudar lo arranca otra vez, el mismo', async () => {
    localStorage.setItem(WEBGPU_FEATURE_FLAG_KEY, 'false');
    wasm.isWasmSolverAvailable.mockResolvedValue(true);
    wasm.initMultiPiece.mockResolvedValue(undefined);
    const store = makeStore();
    store.dispatch(startSimulation());
    montar(store);
    await waitFor(() => expect(getActiveSolverTier()).toBe('wasm'));
    const cliente = wasm.instancias[0];
    expect(cliente.start).toHaveBeenCalledTimes(1);

    await act(async () => { store.dispatch(pauseSimulation()); });
    expect(cliente.stop).toHaveBeenCalled();
    expect(cliente.dispose, 'pausar no suelta el worker').not.toHaveBeenCalled();

    await act(async () => { store.dispatch(startSimulation()); });
    expect(wasm.instancias).toHaveLength(1);
    expect(wasm.initMultiPiece).toHaveBeenCalledTimes(1);
    expect(cliente.start, 'reanudar sigue con el mismo worker').toHaveBeenCalledTimes(2);
    expect(arranques()).toBe(1);
  });

  it('WASM: pausar en mitad del arranque no lo deja corriendo, y reanudar lo arranca', async () => {
    localStorage.setItem(WEBGPU_FEATURE_FLAG_KEY, 'false');
    wasm.isWasmSolverAvailable.mockResolvedValue(true);
    let terminarInit: () => void = () => {};
    wasm.initMultiPiece.mockImplementation(() => new Promise<void>((ok) => { terminarInit = ok; }));
    const store = makeStore();
    store.dispatch(startSimulation());
    montar(store);
    await waitFor(() => expect(wasm.initMultiPiece).toHaveBeenCalledTimes(1));

    await act(async () => { store.dispatch(pauseSimulation()); });
    await act(async () => { terminarInit(); });
    await waitFor(() => expect(getActiveSolverTier()).toBe('wasm'));
    const cliente = wasm.instancias[0];
    expect(cliente.start, 'en pausa, el worker listo no echa a andar').not.toHaveBeenCalled();

    await act(async () => { store.dispatch(startSimulation()); });
    expect(cliente.start).toHaveBeenCalledTimes(1);
    expect(wasm.instancias).toHaveLength(1);
  });

  it('una cascada vieja que termina tarde no da por listo al worker de la nueva', async () => {
    // Las mallas cambian a mitad del arranque (el esqueleto publica la pose A
    // tras el primer «Simular»): la cascada vieja se cancela, pero su arranque
    // sigue en vuelo. Si al terminar marca «listo», reanudar le haría start()
    // al worker NUEVO antes de que termine su init.
    localStorage.setItem(WEBGPU_FEATURE_FLAG_KEY, 'false');
    wasm.isWasmSolverAvailable.mockResolvedValue(true);
    const terminar: Array<() => void> = [];
    wasm.initMultiPiece.mockImplementation(() => new Promise<void>((ok) => { terminar.push(ok); }));
    const store = makeStore();
    store.dispatch(startSimulation());
    const seamInitData: SeamInitData[] = [];
    const elastics: Elastic[] = [];
    const stretchingIdsRef = { current: null as Int32Array | null };
    const { rerender } = renderHook(
      ({ mallas }: { mallas: PlacedMesh[] }) =>
        useSimulationLifecycle({ placedMeshes: mallas, seamInitData, elastics, fabricId: 'cotton-poplin', stretchingIdsRef }),
      {
        initialProps: { mallas: [malla('a')] },
        wrapper: ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>,
      },
    );
    await waitFor(() => expect(wasm.initMultiPiece).toHaveBeenCalledTimes(1));
    rerender({ mallas: [malla('a')] });
    await waitFor(() => expect(wasm.initMultiPiece).toHaveBeenCalledTimes(2));

    await act(async () => { terminar[0](); });
    await act(async () => { store.dispatch(pauseSimulation()); });
    await act(async () => { store.dispatch(startSimulation()); });
    expect(wasm.instancias[1].start, 'el worker nuevo no arranca antes de su init').not.toHaveBeenCalled();

    await act(async () => { terminar[1](); });
    await waitFor(() => expect(wasm.instancias[1].start).toHaveBeenCalledTimes(1));
  });

  it('pausar y reanudar sigue con la tela en movimiento; una cascada nueva la vuelve a preparar', async () => {
    // «Preparando la tela» dura hasta el primer cuadro de la corrida, que marca GarmentSimulation.
    // Mallas nuevas en marcha (una edición, la pose A) son otra corrida, con otra tela que preparar.
    localStorage.setItem(WEBGPU_FEATURE_FLAG_KEY, 'false');
    wasm.isWasmSolverAvailable.mockResolvedValue(true);
    wasm.initMultiPiece.mockResolvedValue(undefined);
    const store = makeStore();
    store.dispatch(startSimulation());
    const seamInitData: SeamInitData[] = [];
    const elastics: Elastic[] = [];
    const stretchingIdsRef = { current: null as Int32Array | null };
    const { rerender } = renderHook(
      ({ mallas }: { mallas: PlacedMesh[] }) =>
        useSimulationLifecycle({ placedMeshes: mallas, seamInitData, elastics, fabricId: 'cotton-poplin', stretchingIdsRef }),
      {
        initialProps: { mallas: [malla('a')] },
        wrapper: ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>,
      },
    );
    await waitFor(() => expect(getActiveSolverTier()).toBe('wasm'));
    await act(async () => { store.dispatch(marcarTelaEnMovimiento(true)); }); // el primer cuadro
    const enMovimiento = () => store.getState().simulation.telaEnMovimiento;

    await act(async () => { store.dispatch(pauseSimulation()); });
    await act(async () => { store.dispatch(startSimulation()); });
    expect(enMovimiento(), 'pausar y reanudar no vuelve a preparar la tela').toBe(true);

    rerender({ mallas: [malla('a')] });
    await waitFor(() => expect(wasm.instancias).toHaveLength(2));
    await waitFor(() => expect(getActiveSolverTier()).toBe('wasm'));
    expect(arranques()).toBe(2);
    expect(enMovimiento(), 'la cascada nueva arranca sin decir que prepara otra tela').toBe(false);
  });

  it('neural (sin costuras, el último tier): pausar lo para y reanudar lo vuelve a arrancar', async () => {
    localStorage.setItem(WEBGPU_FEATURE_FLAG_KEY, 'false');
    wasm.isWasmSolverAvailable.mockResolvedValue(false);
    cpu.initMultiPiece.mockRejectedValueOnce(new Error('sin worker'));
    const store = makeStore();
    store.dispatch(startSimulation());
    montar(store);
    await waitFor(() => expect(getActiveSolverTier()).toBe('neural-drape'));
    const cliente = neural.instancias[0];
    expect(cliente.start).toHaveBeenCalledTimes(1);

    await act(async () => { store.dispatch(pauseSimulation()); });
    expect(cliente.stop).toHaveBeenCalled();
    await act(async () => { store.dispatch(startSimulation()); });
    expect(cliente.start).toHaveBeenCalledTimes(2);
    expect(neural.instancias).toHaveLength(1);
  });

  it('reanudar no reconstruye la colisión del cuerpo: no cambió ninguna medida', async () => {
    // La reconstrucción (horneado + BVH de ~25.000 triángulos) escuchaba
    // `simulationState` y corría en cada «reanudar» diciendo «measurement change».
    localStorage.setItem(WEBGPU_FEATURE_FLAG_KEY, 'false');
    wasm.isWasmSolverAvailable.mockResolvedValue(true);
    wasm.initMultiPiece.mockResolvedValue(undefined);
    const store = makeStore();
    store.dispatch(startSimulation());
    montar(store);
    await waitFor(() => expect(getActiveSolverTier()).toBe('wasm'));
    const cliente = wasm.instancias[0] as unknown as { setCollisionMesh: ReturnType<typeof vi.fn> };
    await waitFor(() => expect(cliente.setCollisionMesh).toHaveBeenCalledTimes(1));

    await act(async () => { store.dispatch(pauseSimulation()); });
    await act(async () => { store.dispatch(startSimulation()); });
    await act(async () => { await new Promise((r) => setTimeout(r, 400)); });

    expect(cliente.setCollisionMesh, 'la colisión del init sigue valiendo').toHaveBeenCalledTimes(1);
  });

  it('Restablecer sí suelta el solver: es el único que vuelve a empezar', async () => {
    localStorage.setItem(WEBGPU_FEATURE_FLAG_KEY, 'false');
    wasm.isWasmSolverAvailable.mockResolvedValue(true);
    wasm.initMultiPiece.mockResolvedValue(undefined);
    const store = makeStore();
    store.dispatch(startSimulation());
    montar(store);
    await waitFor(() => expect(getActiveSolverTier()).toBe('wasm'));

    await act(async () => { store.dispatch(resetSimulation()); });
    expect(wasm.instancias[0].dispose).toHaveBeenCalled();
    expect(getActiveSolverTier()).toBe('none');

    await act(async () => { store.dispatch(startSimulation()); });
    await waitFor(() => expect(wasm.instancias).toHaveLength(2));
    expect(arranques()).toBe(2);
  });
});
