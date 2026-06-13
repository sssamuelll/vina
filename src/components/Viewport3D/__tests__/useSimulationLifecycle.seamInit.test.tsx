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
 * (GPU TSL sin parity de cierre; Neural sin seams en el contrato de
 * inferencia) se saltan con aviso visible cuando el proyecto tiene seams
 * activos — nunca silenciosamente (doctrina A7/C4, guardarraíl "no
 * cobardes" del plan § 7).
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
// isWebGPUAvailable es controlable por test; el flag de opt-in se controla
// vía localStorage ('openclo-use-webgpu') que es lo que lee el hook real.
const webgpuMocks = vi.hoisted(() => ({
  isWebGPUAvailable: vi.fn(() => false),
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
vi.mock('../../../utils/cloth/gpu/gpuSolverClient', () => ({
  GpuSolverClient: class {
    dispose = vi.fn();
    stop = vi.fn();
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

function renderLifecycle(store: ReturnType<typeof makeStore>, seams: SeamInitData[]) {
  const placedMeshes = [makePlacedMesh('a'), makePlacedMesh('b')];
  const stretchingIdsRef = { current: null as Int32Array | null };
  renderHook(
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
  return placedMeshes;
}

describe('useSimulationLifecycle — tier WASM (cascade por defecto)', () => {
  afterEach(() => {
    vi.clearAllMocks();
    localStorage.removeItem(WEBGPU_FEATURE_FLAG_KEY);
    localStorage.removeItem('openclo-webgpu-seams-unsafe');
    webgpuMocks.isWebGPUAvailable.mockReturnValue(false);
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
    expect(toasts[0].message).toMatch(/will not sew/);

    expect(store.getState().simulation.seamResolution).toEqual({
      totalConstraints: 0,
      zeroConstraintSeams: [{ seamId: 'seam-1', reason: 'unknown-edge' }],
    });

    const errors = store.getState().inspector.seamResolutionErrors;
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ seamId: 'seam-1', reason: 'unknown-edge' });
  });

  it('FASE 4: WebGPU opt-in + seams activos → GPU saltado con toast de aviso, cae a WASM', async () => {
    localStorage.setItem(WEBGPU_FEATURE_FLAG_KEY, 'true');
    webgpuMocks.isWebGPUAvailable.mockReturnValue(true);
    wasmMocks.isWasmSolverAvailable.mockResolvedValue(true);
    wasmMocks.initMultiPiece.mockResolvedValue(undefined);

    const store = makeStore();
    store.dispatch(startSimulation());
    renderLifecycle(store, seamInitData);

    await waitFor(() => expect(wasmMocks.initMultiPiece).toHaveBeenCalledTimes(1));

    // Aviso visible — nunca un downgrade silencioso (plan § 7, "no cobardes").
    const toasts = store.getState().copilotUI.toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].type).toBe('warning');
    expect(toasts[0].message).toMatch(/WebGPU/);
    expect(store.getState().simulation.solverTier).toBe('wasm');
  });

  it('F1.5 (#897): bypass dev openclo-webgpu-seams-unsafe → el gate NO dispara toast y se intenta GPU', async () => {
    localStorage.setItem(WEBGPU_FEATURE_FLAG_KEY, 'true');
    localStorage.setItem('openclo-webgpu-seams-unsafe', 'true');
    webgpuMocks.isWebGPUAvailable.mockReturnValue(true);
    wasmMocks.isWasmSolverAvailable.mockResolvedValue(true);
    wasmMocks.initMultiPiece.mockResolvedValue(undefined);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const store = makeStore();
    store.dispatch(startSimulation());
    // Con el bypass dev el hook SÍ entra en la rama GPU pese a seams:false:
    // en jsdom navigator.gpu no existe, el try lanza y cae a WASM por el
    // mismo fallthrough natural del caso control sin seams. La diferencia
    // observable vs el caso del gate es la AUSENCIA del toast de aviso +
    // el console.warn del bypass.
    renderLifecycle(store, seamInitData);

    await waitFor(() => expect(wasmMocks.initMultiPiece).toHaveBeenCalledTimes(1));

    expect(store.getState().copilotUI.toasts).toHaveLength(0);
    expect(store.getState().simulation.solverTier).toBe('wasm');
    expect(
      warnSpy.mock.calls.some((c) => String(c[0]).includes('openclo-webgpu-seams-unsafe activo')),
    ).toBe(true);
    warnSpy.mockRestore();
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
    // GPU deshabilitado (sin opt-in), WASM no disponible, CPU revienta:
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
