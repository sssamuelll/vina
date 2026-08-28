/**
 * @vitest-environment jsdom
 *
 * Contratos del tier cascade sobre seams — plan de paridad CLO3D.
 * Plan: docs/plans/2026-06-11-clo3d-seam-sewing-parity-plan.md § 1/§ 4
 *
 * Historia: nació como repro ROJO de BP-1 en Fase 0 (el callsite WASM no
 * pasaba seamInitData y el default `[]` del cliente ganaba — el tier por
 * defecto simulaba con CERO costuras). Verde desde Fase 1; queda como
 * contrato del cascade.
 *
 * Fase 4 añade el capability gate: tiers que declaran `seams: false`
 * se saltan con aviso visible cuando el proyecto tiene seams activos —
 * nunca silenciosamente (doctrina A7/C4, guardarraíl "no cobardes" del
 * plan § 7).
 *
 * #897 F4 flipea `GPU_CAPABILITIES.seams` a `true` (paridad de cierre
 * verificada con María en navegador real): el gate GPU deja de disparar y
 * el caso positivo de abajo pinna que el cascade SÍ intenta el tier GPU
 * con seamPairs resueltos. El gate queda vivo solo para Neural (exclusión
 * arquitectónica) y como guardarraíl ante una regresión de capability.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
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
// isWebGPUAvailable es controlable por test; el flag del tier GPU (opt-out
// desde #897: default ON, 'false' lo apaga) se controla vía localStorage
// ('vina-use-webgpu'), que es lo que lee el hook real.
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

// Tiers vecinos del cascade: stubs herméticos para que un fallthrough
// accidental no instancie Workers/WebGPU reales en jsdom.
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
// El mock reemplaza el módulo entero — el constructor real (que llama
// instrumentShaderCapture/attachUncapturedErrorListener sobre el device)
// nunca corre. Superficie = exactamente lo que la rama GPU del cascade
// toca tras el init: getTslSolver (tslSolverRef), loadCollision
// (setCollisionMesh/updateCollisionBody), freezePieces, setWind (efecto
// de viento), stop/dispose (cleanup cascade).
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
// Colisión de avatar: projectSlice arranca con '/default-avatar.glb' — null
// evita red/three en el test sin tocar el flujo del cascade.
vi.mock('../../../utils/cloth/avatarCollisionMesh', () => ({
  extractAvatarCollisionMesh: vi.fn().mockResolvedValue(null),
}));
vi.mock('../../../utils/import/meshImporter', () => ({
  importMesh: vi.fn().mockRejectedValue(new Error('not in test')),
}));

import { useSimulationLifecycle, type PlacedMesh } from '../useSimulationLifecycle';
import type { SeamInitData } from '../../../utils/cloth/clothWorker';
import { WEBGPU_FEATURE_FLAG_KEY } from '../../../utils/cloth/gpu/webgpuDetect';
import projectReducer from '../../../store/projectSlice';
import simulationReducer, { startSimulation } from '../../../store/simulationSlice';
import avatarReducer from '../../../store/avatarSlice';
import collisionBodyReducer from '../../../store/collisionBodySlice';
import copilotUIReducer from '../../../store/copilotUISlice';
import inspectorReducer from '../../../store/inspectorSlice';
import {
  clearActiveSolverTier,
  getActiveSolverTier,
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
    edges: [{ name: 'rightEdge', segmentRange: [1, 2] }],
  };
}

function makeSeam(overrides: Partial<SeamInitData> = {}): SeamInitData {
  return {
    id: 'seam-1',
    pieceAId: 'a',
    pieceAEdgeName: 'rightEdge',
    pieceBId: 'b',
    pieceBEdgeName: 'rightEdge',
    type: 'standard',
    tension: 100,
    strength: 1.0,
    active: true,
    taped: false,
    ...overrides,
  };
}

const seamInitData: SeamInitData[] = [makeSeam()];

function renderLifecycleWithHandle(
  store: ReturnType<typeof makeStore>,
  seams: SeamInitData[],
) {
  const placedMeshes = [makePlacedMesh('a'), makePlacedMesh('b')];
  const stretchingIdsRef = { current: null as Int32Array | null };
  const hook = renderHook(
    () =>
      useSimulationLifecycle({
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

function renderLifecycle(store: ReturnType<typeof makeStore>, seams: SeamInitData[]) {
  return renderLifecycleWithHandle(store, seams).placedMeshes;
}

describe('useSimulationLifecycle — tier WASM (cascade por defecto)', () => {
  afterEach(() => {
    clearActiveSolverTier();
    vi.clearAllMocks();
    localStorage.removeItem(WEBGPU_FEATURE_FLAG_KEY);
    webgpuMocks.isWebGPUAvailable.mockReturnValue(false);
    // El caso positivo GPU instala un navigator.gpu fake — restaurar el
    // jsdom desnudo para que los casos de fallthrough sigan lanzando.
    delete (globalThis.navigator as { gpu?: unknown }).gpu;
  });

  it('FASE 1 (BP-1): el init del tier WASM recibe seamInitData', async () => {
    wasmMocks.isWasmSolverAvailable.mockResolvedValue(true);
    wasmMocks.initMultiPiece.mockResolvedValue(undefined);

    const store = makeStore();
    store.dispatch(startSimulation());
    const placedMeshes = renderLifecycle(store, seamInitData);

    await waitFor(() => expect(wasmMocks.initMultiPiece).toHaveBeenCalledTimes(1));

    const [piecesArg, seamsArg] = wasmMocks.initMultiPiece.mock.calls[0];
    expect(piecesArg).toBe(placedMeshes);
    // Contrato BP-1 (verde desde Fase 1): el callsite pasa los seams; el
    // default `[]` del cliente ya no puede ganar en silencio.
    expect(seamsArg).toEqual(seamInitData);

    // Observabilidad (Fase 4): el summary main-thread refleja la resolución
    // sana — constraints > 0, sin seams a cero, sin errores en inspector.
    const summary = store.getState().simulation.seamResolution;
    expect(summary?.totalConstraints).toBeGreaterThan(0);
    expect(summary?.zeroConstraintSeams).toEqual([]);
    expect(store.getState().inspector.seamResolutionErrors).toEqual([]);
  });

  it('limpia activeTier al desmontar sin falsificar lastSelectedTier', async () => {
    wasmMocks.isWasmSolverAvailable.mockResolvedValue(true);
    wasmMocks.initMultiPiece.mockResolvedValue(undefined);
    const store = makeStore();
    store.dispatch(startSimulation());
    const { unmount } = renderLifecycleWithHandle(store, seamInitData);

    await waitFor(() => expect(getActiveSolverTier()).toBe('wasm'));
    expect(store.getState().simulation.solverTier).toBe('wasm');

    unmount();

    expect(getActiveSolverTier()).toBe('none');
    expect(store.getState().simulation.solverTier).toBe('wasm');
  });

  it('FASE 4: seam que resuelve a 0 constraints → toast de error + inspector + summary del overlay', async () => {
    wasmMocks.isWasmSolverAvailable.mockResolvedValue(true);
    wasmMocks.initMultiPiece.mockResolvedValue(undefined);

    const store = makeStore();
    store.dispatch(startSimulation());
    renderLifecycle(store, [makeSeam({ pieceAEdgeName: 'noSuchEdge' })]);

    // Degradación, no aborto: la sim arranca igual en WASM…
    await waitFor(() => expect(wasmMocks.initMultiPiece).toHaveBeenCalledTimes(1));

    // …pero las tres superficies E-async reportan el seam irresoluble.
    const toasts = store.getState().copilotUI.toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].type).toBe('error');
    expect(toasts[0].message).toMatch(/no va a coser/);

    expect(store.getState().simulation.seamResolution).toEqual({
      totalConstraints: 0,
      zeroConstraintSeams: [{ seamId: 'seam-1', reason: 'unknown-edge' }],
    });

    const errors = store.getState().inspector.seamResolutionErrors;
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ seamId: 'seam-1', reason: 'unknown-edge' });
  });

  // (#897 F4) Aquí vivía el caso "opt-in + seams → GPU saltado con toast de
  // aviso, cae a WASM": obsoleto con el flip de GPU_CAPABILITIES.seams a
  // true — el gate ya no dispara para GPU. Sustituido por el caso positivo
  // de abajo. Git history lo conserva.

  // (#897 F4) Aquí vivía el caso del bypass dev de costuras GPU vía
  // localStorage (F1.5): el bypass se eliminó en este mismo PR junto con el
  // flip — la ruta GPU con seams ya es la ruta normal, sin key dev. Git
  // history conserva el caso y la key.

  it('F4 (#897): opt-in + seams → GPU tier intentado con seamPairs (capability flip)', async () => {
    localStorage.setItem(WEBGPU_FEATURE_FLAG_KEY, 'true');
    webgpuMocks.isWebGPUAvailable.mockReturnValue(true);
    gpuMocks.initMultiPieceTsl.mockResolvedValue(undefined);
    // jsdom no tiene navigator.gpu — fake mínimo para que la rama GPU del
    // cascade corra de verdad (requestAdapter → requestDevice → init):
    const fakeDevice = {
      lost: new Promise(() => {}), // nunca resuelve
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      pushErrorScope: vi.fn(),
      popErrorScope: vi.fn().mockResolvedValue(null),
    };
    (globalThis.navigator as { gpu?: unknown }).gpu = {
      requestAdapter: async () => ({ requestDevice: async () => fakeDevice }),
    };

    const store = makeStore();
    store.dispatch(startSimulation());
    const placedMeshes = renderLifecycle(store, seamInitData);

    await waitFor(() => expect(gpuMocks.initMultiPieceTsl).toHaveBeenCalledTimes(1));

    // Señal POSITIVA del flip: el tier GPU recibe los seamPairs RESUELTOS
    // (misma pipeline parameterizeEdge + matchVertices que el summary) —
    // no un array vacío ni un downgrade a WASM.
    const [piecesArg, seamPairsArg] = gpuMocks.initMultiPieceTsl.mock.calls[0];
    expect(piecesArg).toBe(placedMeshes);
    expect(seamPairsArg.length).toBeGreaterThan(0);
    expect(seamPairsArg[0].vertexPairs.length).toBeGreaterThan(0);

    // El viejo toast de aviso del gate NO se dispatcha y el tier es webgpu.
    await waitFor(() => expect(store.getState().simulation.solverTier).toBe('webgpu'));
    expect(store.getState().copilotUI.toasts).toHaveLength(0);
    expect(wasmMocks.initMultiPiece).not.toHaveBeenCalled();
  });

  it('F-default-on (#897): key SIN setear + seams → GPU tier por defecto (opt-out)', async () => {
    // El corazón del flip opt-in→opt-out: NO se llama localStorage.setItem.
    // Con HW disponible y la key ausente, el default debe ser GPU (como 'true'),
    // no WASM. Mismo escenario que el caso opt-in de arriba SIN la línea
    // `setItem(WEBGPU_FEATURE_FLAG_KEY, 'true')`.
    webgpuMocks.isWebGPUAvailable.mockReturnValue(true);
    gpuMocks.initMultiPieceTsl.mockResolvedValue(undefined);
    const fakeDevice = {
      lost: new Promise(() => {}), // nunca resuelve
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      pushErrorScope: vi.fn(),
      popErrorScope: vi.fn().mockResolvedValue(null),
    };
    (globalThis.navigator as { gpu?: unknown }).gpu = {
      requestAdapter: async () => ({ requestDevice: async () => fakeDevice }),
    };

    const store = makeStore();
    store.dispatch(startSimulation());
    const placedMeshes = renderLifecycle(store, seamInitData);

    await waitFor(() => expect(gpuMocks.initMultiPieceTsl).toHaveBeenCalledTimes(1));

    const [piecesArg, seamPairsArg] = gpuMocks.initMultiPieceTsl.mock.calls[0];
    expect(piecesArg).toBe(placedMeshes);
    expect(seamPairsArg.length).toBeGreaterThan(0);

    await waitFor(() => expect(store.getState().simulation.solverTier).toBe('webgpu'));
    expect(store.getState().copilotUI.toasts).toHaveLength(0);
    expect(wasmMocks.initMultiPiece).not.toHaveBeenCalled();
  });

  it('F-default-on (#897): escape hatch — key en \'false\' → GPU NO se intenta (cae a WASM)', async () => {
    // La salida de emergencia del opt-out: 'false' explícito desactiva el tier
    // GPU aunque el HW esté disponible. Prueba que el default ON no es absoluto.
    localStorage.setItem(WEBGPU_FEATURE_FLAG_KEY, 'false');
    webgpuMocks.isWebGPUAvailable.mockReturnValue(true);
    wasmMocks.isWasmSolverAvailable.mockResolvedValue(true);
    wasmMocks.initMultiPiece.mockResolvedValue(undefined);
    // Si la rama GPU corriese, instanciaría el cliente GPU; al estar 'false'
    // ni siquiera se toca navigator.gpu — no lo fakeamos a propósito.

    const store = makeStore();
    store.dispatch(startSimulation());
    renderLifecycle(store, seamInitData);

    await waitFor(() => expect(wasmMocks.initMultiPiece).toHaveBeenCalledTimes(1));
    expect(gpuMocks.initMultiPieceTsl).not.toHaveBeenCalled();
    expect(store.getState().simulation.solverTier).toBe('wasm');
  });

  it('FASE 4 (control): WebGPU opt-in SIN seams → el gate no dispara toast', async () => {
    localStorage.setItem(WEBGPU_FEATURE_FLAG_KEY, 'true');
    webgpuMocks.isWebGPUAvailable.mockReturnValue(true);
    wasmMocks.isWasmSolverAvailable.mockResolvedValue(true);
    wasmMocks.initMultiPiece.mockResolvedValue(undefined);

    const store = makeStore();
    store.dispatch(startSimulation());
    // Sin seams el hook SÍ intenta GPU: en jsdom navigator.gpu no existe,
    // el try lanza y cae a WASM por el fallthrough natural (console.warn,
    // sin toast). Eso separa el gate del fallthrough.
    renderLifecycle(store, []);

    await waitFor(() => expect(wasmMocks.initMultiPiece).toHaveBeenCalledTimes(1));
    expect(store.getState().copilotUI.toasts).toHaveLength(0);
  });

  it('FASE 4: seams solo inactivos (active:false) no activan el gate', async () => {
    localStorage.setItem(WEBGPU_FEATURE_FLAG_KEY, 'true');
    webgpuMocks.isWebGPUAvailable.mockReturnValue(true);
    wasmMocks.isWasmSolverAvailable.mockResolvedValue(true);
    wasmMocks.initMultiPiece.mockResolvedValue(undefined);

    const store = makeStore();
    store.dispatch(startSimulation());
    renderLifecycle(store, [makeSeam({ active: false })]);

    await waitFor(() => expect(wasmMocks.initMultiPiece).toHaveBeenCalledTimes(1));
    expect(store.getState().copilotUI.toasts).toHaveLength(0);
  });

  it('FASE 4: todos los tiers con seams fallan → Neural NO arranca, toast de error, tier none', async () => {
    // GPU no disponible en este test (isWebGPUAvailable=false, el default del
    // beforeEach — ya no es por falta de opt-in), WASM no disponible, CPU revienta:
    // el último tier (Neural, seams:false) descartaría las costuras en
    // silencio — el cascade debe negarse a arrancarlo y avisar.
    wasmMocks.isWasmSolverAvailable.mockResolvedValue(false);
    cpuMocks.initMultiPiece.mockRejectedValue(new Error('no workers in test'));

    const store = makeStore();
    store.dispatch(startSimulation());
    renderLifecycle(store, seamInitData);

    await waitFor(() => {
      const toasts = store.getState().copilotUI.toasts;
      expect(toasts).toHaveLength(1);
      expect(toasts[0].type).toBe('error');
    });
    expect(neuralMocks.initMultiPiece).not.toHaveBeenCalled();
    expect(store.getState().simulation.solverTier).toBe('none');
  });

  it('FASE 4 (control): todos los tiers fallan SIN seams → Neural sí arranca como último recurso', async () => {
    wasmMocks.isWasmSolverAvailable.mockResolvedValue(false);
    cpuMocks.initMultiPiece.mockRejectedValue(new Error('no workers in test'));
    neuralMocks.initMultiPiece.mockResolvedValue(undefined);

    const store = makeStore();
    store.dispatch(startSimulation());
    renderLifecycle(store, []);

    await waitFor(() => expect(neuralMocks.initMultiPiece).toHaveBeenCalledTimes(1));
    expect(store.getState().simulation.solverTier).toBe('neural-drape');
    expect(store.getState().copilotUI.toasts).toHaveLength(0);
  });
});
