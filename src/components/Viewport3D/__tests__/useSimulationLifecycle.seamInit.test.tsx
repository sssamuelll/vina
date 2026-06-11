/**
 * @vitest-environment jsdom
 *
 * Repro — Fase 0 del plan de paridad CLO3D (BP-1). ROJO hasta la Fase 1.
 * Plan: docs/plans/2026-06-11-clo3d-seam-sewing-parity-plan.md § 1/§ 4
 *
 * BP-1: el tier por defecto (WASM) simula con CERO costuras. La firma de
 * `WasmSolverClient.initMultiPiece(pieces, seams = [], config?)` acepta seams
 * y el worker los honra (`buildSeamConstraints` → `set_seams_with_compliance`),
 * pero el único callsite de producción (`useSimulationLifecycle`, marcador
 * `─── WASM XPBD ───`) llama `initMultiPiece(placedMeshes)` y el default `[]`
 * gana. El CPU worker (`─── CPU Web Worker ───`) SÍ recibe `seamInitData` —
 * las costuras solo funcionan cuando WASM falla y cae a CPU.
 *
 * Fase 1 = pasar `seamInitData` en ese callsite. Este test pasa de rojo a
 * verde con ese cambio y queda como contrato del cascade.
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
    initMultiPiece = vi.fn().mockResolvedValue(undefined);
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
    initMultiPiece = vi.fn().mockResolvedValue(undefined);
    start = vi.fn();
    stop = vi.fn();
    dispose = vi.fn();
  },
}));
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
import projectReducer from '../../../store/projectSlice';
import simulationReducer, { startSimulation } from '../../../store/simulationSlice';
import avatarReducer from '../../../store/avatarSlice';
import collisionBodyReducer from '../../../store/collisionBodySlice';

function makeStore() {
  return configureStore({
    reducer: {
      project: projectReducer,
      simulation: simulationReducer,
      avatar: avatarReducer,
      collisionBody: collisionBodyReducer,
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

const seamInitData: SeamInitData[] = [
  {
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
  },
];

describe('useSimulationLifecycle — tier WASM (cascade por defecto)', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('FASE 1 (BP-1): el init del tier WASM recibe seamInitData', async () => {
    wasmMocks.isWasmSolverAvailable.mockResolvedValue(true);
    wasmMocks.initMultiPiece.mockResolvedValue(undefined);

    const store = makeStore();
    store.dispatch(startSimulation());

    const placedMeshes = [makePlacedMesh('a'), makePlacedMesh('b')];
    const stretchingIdsRef = { current: null as Int32Array | null };

    renderHook(
      () =>
        useSimulationLifecycle({
          placedMeshes,
          seamInitData,
          elastics: [],
          fabricId: 'cotton-poplin',
          stretchingIdsRef,
        }),
      { wrapper: wrapperFor(store) },
    );

    await waitFor(() => expect(wasmMocks.initMultiPiece).toHaveBeenCalledTimes(1));

    const [piecesArg, seamsArg] = wasmMocks.initMultiPiece.mock.calls[0];
    expect(piecesArg).toBe(placedMeshes);
    // ROJO HOY: el callsite no pasa seams y el default `[]` del cliente gana —
    // el tier por defecto simula la prenda sin una sola costura (BP-1).
    expect(seamsArg).toEqual(seamInitData);
  });
});
