/**
 * @vitest-environment jsdom
 *
 * F0 (#897): contabilidad del frame-time que alimenta el FPS de la UI.
 *
 * Historia: nació como repro ROJO del bug de contabilidad — `onFrame`
 * sobrescribía `lastFrameTimeRef` en CADA llamada, así que el valor
 * despachado era el delta de UN solo frame dividido por 30 (FPS mostrado
 * ~30x inflado). El fix mide la ventana real de 30 frames.
 *
 * Además el tier GPU TSL nunca dispara `onFrame` (frameDriven — el compute
 * lo conduce useFrame), así que el hook expone `recordFrameTick` con la
 * misma contabilidad para que GarmentSimulation lo llame por render-frame.
 *
 * Harness modelado sobre useSimulationLifecycle.seamInit.test.tsx.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore, type Middleware } from '@reduxjs/toolkit';
import type { ReactNode } from 'react';

// Tiers del cascade: stubs herméticos para que jsdom no instancie
// Workers/WebGPU reales (la sim queda en 'idle' en estos tests — los stubs
// son aislamiento de imports, no comportamiento).
vi.mock('../../../utils/cloth/wasm/wasmSolverClient', () => ({
  WasmSolverClient: class {
    onFrame = null;
    onEdgeData = null;
    initMultiPiece = vi.fn();
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
  isWasmSolverAvailable: vi.fn().mockResolvedValue(false),
}));
vi.mock('../../../utils/cloth/clothWorkerClient', () => ({
  ClothWorkerClient: class {
    onFrame = null;
    onEdgeData = null;
    initMultiPiece = vi.fn();
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
    initMultiPiece = vi.fn();
    start = vi.fn();
    stop = vi.fn();
    dispose = vi.fn();
  },
}));
vi.mock('../../../utils/cloth/avatarCollisionMesh', () => ({
  extractAvatarCollisionMesh: vi.fn().mockResolvedValue(null),
}));
vi.mock('../../../utils/import/meshImporter', () => ({
  importMesh: vi.fn().mockRejectedValue(new Error('not in test')),
}));

import { useSimulationLifecycle, type PlacedMesh } from '../useSimulationLifecycle';
import projectReducer from '../../../store/projectSlice';
import simulationReducer from '../../../store/simulationSlice';
import avatarReducer from '../../../store/avatarSlice';
import collisionBodyReducer from '../../../store/collisionBodySlice';
import copilotUIReducer from '../../../store/copilotUISlice';
import inspectorReducer from '../../../store/inspectorSlice';

interface RecordedAction {
  type: string;
  payload?: unknown;
}

function makeStore(dispatched: RecordedAction[]) {
  const recorder: Middleware = () => (next) => (action) => {
    dispatched.push(action as RecordedAction);
    return next(action);
  };
  return configureStore({
    reducer: {
      project: projectReducer,
      simulation: simulationReducer,
      avatar: avatarReducer,
      collisionBody: collisionBodyReducer,
      copilotUI: copilotUIReducer,
      inspector: inspectorReducer,
    },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(recorder),
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

function renderLifecycle(store: ReturnType<typeof makeStore>) {
  const stretchingIdsRef = { current: null as Int32Array | null };
  return renderHook(
    () =>
      useSimulationLifecycle({
        placedMeshes: [makePlacedMesh('a')],
        seamInitData: [],
        elastics: [],
        fabricId: 'cotton-poplin',
        stretchingIdsRef,
      }),
    { wrapper: wrapperFor(store) },
  );
}

function frameTimeActions(dispatched: RecordedAction[]): RecordedAction[] {
  return dispatched.filter((a) => a.type === 'simulation/setFrameTime');
}

// Reloj controlable. Arranca en 1000, NO en 0 — un origen 0 colisiona con
// centinelas ingenuos (el código buggy usaba `lastFrameTimeRef.current > 0`).
let nowValue = 1000;

describe('useSimulationLifecycle — contabilidad de frame-time (F0 #897)', () => {
  beforeEach(() => {
    nowValue = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => nowValue);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('dispatches the true 30-frame average, not the single-frame delta / 30', () => {
    const dispatched: RecordedAction[] = [];
    const store = makeStore(dispatched);
    const { result } = renderLifecycle(store);
    const { onFrame } = result.current;

    // Descarta el setFrameTime(0) del branch 'idle' al montar.
    dispatched.length = 0;

    const positions = new Float32Array(3);
    act(() => {
      for (let i = 0; i <= 30; i++) {
        nowValue = 1000 + i * 100; // 100ms entre frames → media real 100
        onFrame(positions);
      }
    });

    const actions = frameTimeActions(dispatched);
    expect(actions.length).toBeGreaterThan(0);
    // El código buggy despacha ~3.3 (delta de un frame / 30).
    expect(actions.at(-1)?.payload).toBeCloseTo(100, 0);
    expect(store.getState().simulation.frameTimeMs).toBeCloseTo(100, 0);
  });

  it('recordFrameTick is exposed and feeds the same accounting', () => {
    const dispatched: RecordedAction[] = [];
    const store = makeStore(dispatched);
    const { result } = renderLifecycle(store);
    const { recordFrameTick } = result.current;

    dispatched.length = 0;

    act(() => {
      for (let i = 0; i <= 30; i++) {
        nowValue = 1000 + i * 16.7;
        recordFrameTick();
      }
    });

    const actions = frameTimeActions(dispatched);
    expect(actions.length).toBeGreaterThan(0);
    expect(actions.at(-1)?.payload).toBeCloseTo(16.7, 1);
    expect(store.getState().simulation.frameTimeMs).toBeCloseTo(16.7, 1);
  });
});
