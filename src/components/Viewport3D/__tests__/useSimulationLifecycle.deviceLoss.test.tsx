/**
 * @vitest-environment jsdom
 *
 * #901 + decoy-device fix — pérdida del device GPU del renderer auto-cascada
 * a WASM SIN restart manual.
 *
 * Historia: antes de este fix el cascade GPU→WASM solo corría una vez (en el
 * mount del effect). Cuando el device WebGPU se perdía a mitad de simulación,
 * `gpuDeviceLostRef` se prendía pero NO era un dep del effect, así que nada
 * re-entraba a `startSim`: el `useFrame` seguía llamando `renderer.compute()`
 * sobre un device muerto y el único recovery era parar y reanudar a mano
 * (toast "restart the simulation to fall back to WASM"). Además el handler que
 * prendía el ref vigilaba el device del LIFECYCLE (requestDevice() propio), no
 * el device del RENDERER donde de verdad corren los kernels TSL (decoy).
 *
 * El fix: el hook expone `handleGpuDeviceLost`, que GarmentSimulation llama
 * desde el handler del device del renderer (el correcto). El handler degrada
 * el tier GPU (sticky) y bumpea un contador de estado que SÍ es dep del effect,
 * forzando la re-entrada al cascade → cae a WASM solo.
 *
 * Harness modelado sobre useSimulationLifecycle.seamInit.test.tsx.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import type { ReactNode } from 'react';

const wasmMocks = vi.hoisted(() => ({
  initMultiPiece: vi.fn(),
  isWasmSolverAvailable: vi.fn(),
}));
const cpuMocks = vi.hoisted(() => ({
  initMultiPiece: vi.fn(),
}));
const neuralMocks = vi.hoisted(() => ({
  initMultiPiece: vi.fn(),
}));
const webgpuMocks = vi.hoisted(() => ({
  isWebGPUAvailable: vi.fn(() => false),
}));
const gpuMocks = vi.hoisted(() => ({
  initMultiPieceTsl: vi.fn(),
}));

vi.mock('../../../utils/cloth/wasm/wasmSolverClient', () => {
  class FakeWasmSolverClient {
    onFrame: ((positions: Float32Array) => void) | null = null;
    onEdgeData: ((ids: Int32Array, lengths: Float32Array) => void) | null = null;
    initMultiPiece = wasmMocks.initMultiPiece;
    requestEdgeData = vi.fn();
    start = vi.fn();
    stop = vi.fn();
    dispose = vi.fn();
    setWind = vi.fn();
    setElastics = vi.fn();
    setCollisionMesh = vi.fn();
    updateCollisionBody = vi.fn();
    applyInitialTriangleCollision = vi.fn();
  }
  return {
    WasmSolverClient: FakeWasmSolverClient,
    isWasmSolverAvailable: wasmMocks.isWasmSolverAvailable,
  };
});

vi.mock('../../../utils/cloth/clothWorkerClient', () => ({
  ClothWorkerClient: class {
    onFrame = null;
    onEdgeData = null;
    initMultiPiece = cpuMocks.initMultiPiece;
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
    onFrame: ((positions: Float32Array) => void) | null = null;
    // #1010: contrato edge-data (behavior #16) — el lifecycle lo llama en init TSL.
    onEdgeData: ((ids: Int32Array, lengths: Float32Array) => void) | null = null;
    requestEdgeData = vi.fn();
    initMultiPieceTsl = gpuMocks.initMultiPieceTsl;
    getTslSolver = () => ({});
    getPieceVertexRanges = () => null;
    setCollisionMesh = vi.fn();
    updateCollisionBody = vi.fn();
    freezePieces = vi.fn();
    setWind = vi.fn();
    setBrushParams = vi.fn();
    start = vi.fn();
    stop = vi.fn();
    dispose = vi.fn();
  },
}));
vi.mock('../../../utils/cloth/neural/neuralDrapeClient', () => ({
  NeuralDrapeClient: class {
    onFrame = null;
    initMultiPiece = neuralMocks.initMultiPiece;
    start = vi.fn();
    stop = vi.fn();
    dispose = vi.fn();
  },
}));
vi.mock('../../../utils/cloth/gpu/webgpuDetect', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../utils/cloth/gpu/webgpuDetect')>();
  return {
    ...actual,
    isWebGPUAvailable: webgpuMocks.isWebGPUAvailable,
  };
});
vi.mock('../../../utils/cloth/avatarCollisionMesh', () => ({
  extractAvatarCollisionMesh: vi.fn().mockResolvedValue(null),
}));
vi.mock('../../../utils/import/meshImporter', () => ({
  importMesh: vi.fn().mockRejectedValue(new Error('not in test')),
}));

import { useSimulationLifecycle, type PlacedMesh } from '../useSimulationLifecycle';
import { WEBGPU_FEATURE_FLAG_KEY } from '../../../utils/cloth/gpu/webgpuDetect';
import projectReducer from '../../../store/projectSlice';
import simulationReducer, { startSimulation } from '../../../store/simulationSlice';
import avatarReducer from '../../../store/avatarSlice';
import collisionBodyReducer from '../../../store/collisionBodySlice';
import copilotUIReducer from '../../../store/copilotUISlice';
import inspectorReducer from '../../../store/inspectorSlice';

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

function wrapperFor(store: ReturnType<typeof makeStore>) {
  return ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;
}

function makePlacedMesh(pieceId: string): PlacedMesh {
  return {
    pieceId,
    vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    triIds: new Int32Array([0, 1, 2]),
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [10, 0] },
      { type: 'L', values: [10, 10] },
      { type: 'Z', values: [] },
    ],
  };
}

/** Fake GPUDevice whose `lost` never resolves (the renderer-device loss is
 *  driven explicitly via `handleGpuDeviceLost`, not via this promise). */
function makeFakeDevice() {
  return {
    lost: new Promise(() => {}),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    pushErrorScope: vi.fn(),
    popErrorScope: vi.fn().mockResolvedValue(null),
  };
}

function renderLifecycle(store: ReturnType<typeof makeStore>, gpuInitiallyDowngraded = false) {
  // Referencias ESTABLES entre renders (igual que seamInit.test.tsx): inputs
  // nuevos por render son deps del effect del cascade y, combinados con el bump
  // de setTslGeneration en el init de GPU, harían un loop de re-init que
  // enmascara si la re-cascada vino del bump de deviceLostGeneration. En
  // producción GarmentSimulation memoiza estos valores.
  const placedMeshes = [makePlacedMesh('a')];
  const seamInitData: never[] = [];
  const elastics: never[] = [];
  const stretchingIdsRef = { current: null as Int32Array | null };
  return renderHook(
    () =>
      useSimulationLifecycle({
        placedMeshes,
        seamInitData,
        elastics,
        fabricId: 'cotton-poplin',
        stretchingIdsRef,
        gpuInitiallyDowngraded,
      }),
    { wrapper: wrapperFor(store) },
  );
}

describe('useSimulationLifecycle — auto-cascada en pérdida de device GPU (#901)', () => {
  afterEach(() => {
    vi.clearAllMocks();
    localStorage.removeItem(WEBGPU_FEATURE_FLAG_KEY);
    webgpuMocks.isWebGPUAvailable.mockReturnValue(false);
    delete (globalThis.navigator as { gpu?: unknown }).gpu;
  });

  it('pérdida de device del renderer → auto-cascada GPU→WASM sin restart manual', async () => {
    webgpuMocks.isWebGPUAvailable.mockReturnValue(true);
    gpuMocks.initMultiPieceTsl.mockResolvedValue(undefined);
    wasmMocks.isWasmSolverAvailable.mockResolvedValue(true);
    wasmMocks.initMultiPiece.mockResolvedValue(undefined);
    (globalThis.navigator as { gpu?: unknown }).gpu = {
      requestAdapter: async () => ({ requestDevice: async () => makeFakeDevice() }),
    };

    const store = makeStore();
    store.dispatch(startSimulation());
    const { result } = renderLifecycle(store);

    // El tier GPU arranca primero.
    await waitFor(() => expect(store.getState().simulation.solverTier).toBe('webgpu'));
    expect(wasmMocks.initMultiPiece).not.toHaveBeenCalled();

    // GarmentSimulation detecta la pérdida del device del renderer (el real,
    // no el señuelo del lifecycle) y avisa al hook. NO se dispatcha ningún
    // stop/start — la cascada debe ser automática.
    act(() => {
      result.current.handleGpuDeviceLost();
    });

    // El cascade re-entra solo y cae a WASM.
    await waitFor(() => expect(wasmMocks.initMultiPiece).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(store.getState().simulation.solverTier).toBe('wasm'));
  });

  it('handleGpuDeviceLost es idempotente — avisos repetidos del device muerto no re-cascadean', async () => {
    webgpuMocks.isWebGPUAvailable.mockReturnValue(true);
    gpuMocks.initMultiPieceTsl.mockResolvedValue(undefined);
    wasmMocks.isWasmSolverAvailable.mockResolvedValue(true);
    wasmMocks.initMultiPiece.mockResolvedValue(undefined);
    (globalThis.navigator as { gpu?: unknown }).gpu = {
      requestAdapter: async () => ({ requestDevice: async () => makeFakeDevice() }),
    };

    const store = makeStore();
    store.dispatch(startSimulation());
    const { result } = renderLifecycle(store);

    await waitFor(() => expect(store.getState().simulation.solverTier).toBe('webgpu'));

    act(() => {
      result.current.handleGpuDeviceLost();
    });
    await waitFor(() => expect(wasmMocks.initMultiPiece).toHaveBeenCalledTimes(1));

    // Múltiples device.lost handlers / re-renders pueden re-avisar; el tier ya
    // está degradado, así que NO debe re-inicializar WASM ni volver a GPU.
    act(() => {
      result.current.handleGpuDeviceLost();
      result.current.handleGpuDeviceLost();
    });

    await waitFor(() => expect(store.getState().simulation.solverTier).toBe('wasm'));
    expect(wasmMocks.initMultiPiece).toHaveBeenCalledTimes(1);
    expect(gpuMocks.initMultiPieceTsl).toHaveBeenCalledTimes(1);
  });

  it('gpuInitiallyDowngraded=true → salta GPU directo a WASM (supervivencia al remount tras device loss)', async () => {
    // Modela el remount post-pérdida: GarmentSimulation se desmonta en cada Stop,
    // así que las refs sticky se resetean — pero el registro de devices muertos
    // (keyado por el device estable del renderer) sobrevive y hace que
    // GarmentSimulation pase gpuInitiallyDowngraded=true al re-montar. El cascade
    // NO debe intentar el tier GPU aunque el HW esté disponible y la key default-ON,
    // porque el device del renderer sigue muerto. Sin esto, el Stop→Start re-entra a
    // GPU y re-congela durante el init (#901, hallazgo de la revisión adversarial).
    webgpuMocks.isWebGPUAvailable.mockReturnValue(true);
    gpuMocks.initMultiPieceTsl.mockResolvedValue(undefined);
    wasmMocks.isWasmSolverAvailable.mockResolvedValue(true);
    wasmMocks.initMultiPiece.mockResolvedValue(undefined);
    (globalThis.navigator as { gpu?: unknown }).gpu = {
      requestAdapter: async () => ({ requestDevice: async () => makeFakeDevice() }),
    };

    const store = makeStore();
    store.dispatch(startSimulation());
    renderLifecycle(store, /* gpuInitiallyDowngraded */ true);

    await waitFor(() => expect(wasmMocks.initMultiPiece).toHaveBeenCalledTimes(1));
    expect(gpuMocks.initMultiPieceTsl).not.toHaveBeenCalled();
    expect(store.getState().simulation.solverTier).toBe('wasm');
  });
});
