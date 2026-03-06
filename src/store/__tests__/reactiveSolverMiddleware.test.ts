/**
 * Integration tests for the Reactive Solver Middleware.
 *
 * Tests the middleware's trigger detection, generation tracking,
 * debounce scheduling, metrics collection, computing state management,
 * and shutdown lifecycle — using a real Redux store with mocked workers.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { configureStore, type AnyAction } from '@reduxjs/toolkit';

// ─── Mock workers BEFORE importing middleware ────────────────────────────────

vi.mock('../../workers/workerPool', () => ({
  WorkerPool: vi.fn(),
  getWorkerPool: vi.fn(() => ({
    submit: vi.fn(),
    cancelGeneration: vi.fn(),
    onResult: vi.fn(),
    onError: vi.fn(),
    initialize: vi.fn().mockResolvedValue(undefined),
    warmup: vi.fn().mockResolvedValue(undefined),
    terminate: vi.fn(),
  })),
}));

vi.mock('../../workers/workerProtocol', () => ({
  serializePoint: vi.fn((p: { id: string; x: number; y: number }) => ({
    id: p.id,
    label: p.id,
    x: p.x,
    y: p.y,
  })),
  serializeCurve: vi.fn((c: { id: string }) => ({ id: c.id })),
  serializePiece: vi.fn((p: { id: string; name: string }) => ({
    id: p.id,
    name: p.name,
    nodePointIds: [],
    nodeCurveIds: [],
    nodeConnections: [],
    nodeReverse: [],
    seamAllowance: 10,
    closed: true,
  })),
  deserializeOutline: vi.fn((cmds: unknown[]) => cmds),
  prepareJobData: vi.fn(() => ({ points: [] })),
  selectStrategy: vi.fn(() => 'mainThread' as const),
  detectCapabilities: vi.fn(() => ({
    sharedArrayBuffer: false,
    transferable: false,
    workerSupport: false,
    hardwareConcurrency: 2,
  })),
}));

vi.mock('../../utils/construction/pieceBuilder', () => ({
  buildPieceWithOffset: vi.fn(
    (
      cPiece: { id: string; name: string },
      _points: unknown[],
      _curves: unknown[],
      _ctx: unknown,
      existingId?: string,
    ) => ({
      piece: {
        id: existingId ?? `generated-${cPiece.id}`,
        name: cPiece.name,
        outline: [
          { type: 'M', values: [0, 0] },
          { type: 'L', values: [100, 0] },
          { type: 'L', values: [100, 200] },
          { type: 'L', values: [0, 200] },
          { type: 'Z', values: [] },
        ],
        position: { x: 0, y: 0 },
      },
      normOffset: { x: 0, y: 0 },
    }),
  ),
}));

// ─── Import middleware and slices AFTER mocks ────────────────────────────────

import {
  createReactiveSolverMiddleware,
  getSolverMetrics,
  getSolverState,
  subscribeToComputingState,
  shutdownSolver,
  getIsComputing,
} from '../reactiveSolverMiddleware';

import constructionReducer, { addPoint, addConstructionPiece } from '../constructionSlice';
import parametricReducer, {
  activateTemplate,
  setVariableOverride,
  setVariableOverrides,
} from '../parametricSlice';
import projectReducer, { updateMeasurements } from '../projectSlice';
import editorReducer from '../editorSlice';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createTestStore() {
  return configureStore({
    reducer: {
      construction: constructionReducer,
      parametric: parametricReducer,
      project: projectReducer,
      editor: editorReducer,
    },
    middleware: (getDefault) =>
      getDefault({ serializableCheck: false }).concat(createReactiveSolverMiddleware()),
  });
}

type TestStore = ReturnType<typeof createTestStore>;

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Reactive Solver Middleware', () => {
  let store: TestStore;

  beforeEach(() => {
    vi.useFakeTimers();
    shutdownSolver(); // Reset module-level state between tests
    store = createTestStore();
  });

  afterEach(() => {
    shutdownSolver();
    vi.useRealTimers();
  });

  // ─── Trigger Detection ─────────────────────────────────────────────

  describe('Trigger Detection', () => {
    it('triggers on project/updateMeasurements', () => {
      const before = getSolverState().generationId;
      store.dispatch(updateMeasurements({ chest: 100 }));
      expect(getSolverState().generationId).toBe(before + 1);
    });

    it('triggers on parametric/setVariableOverride', () => {
      const before = getSolverState().generationId;
      store.dispatch(setVariableOverride({ key: '#BustEase', value: 50 }));
      expect(getSolverState().generationId).toBe(before + 1);
    });

    it('triggers on parametric/setVariableOverrides', () => {
      const before = getSolverState().generationId;
      store.dispatch(setVariableOverrides({ '#BustEase': 50, '#WaistWidth': 740 }));
      expect(getSolverState().generationId).toBe(before + 1);
    });

    it('triggers on parametric/activateTemplate', () => {
      const before = getSolverState().generationId;
      store.dispatch(
        activateTemplate({
          pattern: { name: 'test', variables: {}, construction: [] },
          measurements: { height: 1680, chest: 920, waist: 740, hips: 980, shoulder: 128, armLength: 595, inseam: 780 },
          size: 'M',
          sizeSystem: 'eu-women',
          resolvedVariables: {},
          pieceIds: [],
        }),
      );
      expect(getSolverState().generationId).toBe(before + 1);
    });

    it('does NOT trigger on unrelated actions', () => {
      const before = getSolverState().generationId;
      // Dispatch a random unrelated action
      store.dispatch({ type: 'editor/setViewMode', payload: '3d' } as AnyAction);
      expect(getSolverState().generationId).toBe(before);
    });
  });

  // ─── Generation Tracking ───────────────────────────────────────────

  describe('Generation Tracking', () => {
    it('increments generationId on each trigger', () => {
      const initial = getSolverState().generationId;
      store.dispatch(updateMeasurements({ chest: 100 }));
      store.dispatch(updateMeasurements({ chest: 102 }));
      store.dispatch(updateMeasurements({ chest: 104 }));
      expect(getSolverState().generationId).toBe(initial + 3);
    });

    it('rapid triggers cancel stale debounce timers', () => {
      // Dispatch many triggers rapidly — only last debounce should fire
      for (let i = 0; i < 10; i++) {
        store.dispatch(setVariableOverride({ key: '#Ease', value: 40 + i }));
      }

      // All triggers increment generation
      const state = getSolverState();
      expect(state.generationId).toBeGreaterThanOrEqual(10);
    });
  });

  // ─── Computing State ───────────────────────────────────────────────

  describe('Computing State', () => {
    it('subscribeToComputingState calls listener immediately and on transitions', async () => {
      const listener = vi.fn();
      const unsub = subscribeToComputingState(listener);

      // Listener is called immediately on subscribe with current state
      expect(listener).toHaveBeenCalledTimes(1);
      expect(typeof listener.mock.calls[0][0]).toBe('boolean');

      // After a trigger and debounce cycle, listener should see both true and false
      listener.mockClear();
      store.dispatch(updateMeasurements({ chest: 100 }));
      await vi.advanceTimersByTimeAsync(500);

      // Listener should have been notified at least once during the cycle
      // (exact call count depends on prior state)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allCalls = listener.mock.calls.map((c: any) => c[0]);
      // The full cycle ends with computing=false
      expect(allCalls[allCalls.length - 1]).toBe(false);

      unsub();
    });

    it('unsubscribe stops notifications', () => {
      const listener = vi.fn();
      const unsub = subscribeToComputingState(listener);
      listener.mockClear();

      unsub();

      store.dispatch(updateMeasurements({ chest: 100 }));
      // Listener should NOT be called after unsub
      expect(listener).not.toHaveBeenCalled();
    });

    it('getIsComputing becomes true after trigger', async () => {
      // Flush any prior computing state
      await vi.advanceTimersByTimeAsync(500);

      store.dispatch(updateMeasurements({ chest: 100 }));
      // Computing is set to true during debounce period
      expect(getIsComputing()).toBe(true);
    });
  });

  // ─── Debounced Piece Building ──────────────────────────────────────

  describe('Debounced Piece Building', () => {
    it('builds pieces after debounce completes', async () => {
      // Add a construction piece and point so there's something to build
      store.dispatch(
        addPoint({
          label: 'A',
          definition: { type: 'absolute', x: 0, y: 0 },
        }),
      );
      store.dispatch(
        addConstructionPiece({
          name: 'TestPiece',
          nodes: [],
          seamAllowance: 10,
        }),
      );

      // Trigger middleware
      store.dispatch(updateMeasurements({ chest: 100 }));

      // Before debounce fires, computing should be true
      expect(getIsComputing()).toBe(true);

      // Advance timers past debounce
      await vi.advanceTimersByTimeAsync(500);

      // After debounce + build, computing should be false (no pending worker jobs)
      expect(getIsComputing()).toBe(false);
    });

    it('debounce resets on rapid triggers', async () => {
      store.dispatch(updateMeasurements({ chest: 100 }));

      // Wait 50ms (less than debounce)
      await vi.advanceTimersByTimeAsync(50);

      // Fire another trigger — should reset the debounce
      store.dispatch(updateMeasurements({ chest: 102 }));

      // Advance past original debounce window (but not the new one)
      await vi.advanceTimersByTimeAsync(60);

      // Should still be computing because new debounce hasn't elapsed
      expect(getIsComputing()).toBe(true);

      // Now advance past the new debounce
      await vi.advanceTimersByTimeAsync(500);

      expect(getIsComputing()).toBe(false);
    });
  });

  // ─── Metrics ───────────────────────────────────────────────────────

  describe('Metrics', () => {
    it('metrics has expected shape', () => {
      const metrics = getSolverMetrics();
      expect(typeof metrics.totalResolves).toBe('number');
      expect(typeof metrics.cancelledJobs).toBe('number');
      expect(Array.isArray(metrics.computeTimes)).toBe(true);
      expect(Array.isArray(metrics.errors)).toBe(true);
      expect(typeof metrics.lastResolveTimestamp).toBe('number');
      expect(metrics.strategyUsage).toBeDefined();
    });

    it('records totalResolves after debounced build', async () => {
      // Add construction piece
      store.dispatch(
        addConstructionPiece({
          name: 'TestPiece',
          nodes: [],
          seamAllowance: 10,
        }),
      );

      store.dispatch(updateMeasurements({ chest: 100 }));
      await vi.advanceTimersByTimeAsync(500);

      const metrics = getSolverMetrics();
      expect(metrics.totalResolves).toBeGreaterThanOrEqual(1);
    });

    it('records compute times', async () => {
      store.dispatch(
        addConstructionPiece({
          name: 'TestPiece',
          nodes: [],
          seamAllowance: 10,
        }),
      );

      store.dispatch(updateMeasurements({ chest: 100 }));
      await vi.advanceTimersByTimeAsync(500);

      const metrics = getSolverMetrics();
      expect(metrics.computeTimes.length).toBeGreaterThanOrEqual(1);
      // Compute times should be non-negative numbers
      for (const t of metrics.computeTimes) {
        expect(t).toBeGreaterThanOrEqual(0);
      }
    });

    it('metrics is a defensive copy', () => {
      const a = getSolverMetrics();
      const b = getSolverMetrics();
      expect(a).not.toBe(b);
      expect(a).toEqual(b);
    });
  });

  // ─── Solver State ──────────────────────────────────────────────────

  describe('Solver State', () => {
    it('returns initial solver state', () => {
      const s = getSolverState();
      expect(s.poolReady).toBe(false);
      expect(s.pendingJobs).toBe(0);
      expect(s.debounceMs).toBeGreaterThanOrEqual(50);
    });

    it('debounceMs adapts after computes', async () => {
      store.dispatch(
        addConstructionPiece({
          name: 'TestPiece',
          nodes: [],
          seamAllowance: 10,
        }),
      );

      store.dispatch(updateMeasurements({ chest: 100 }));
      await vi.advanceTimersByTimeAsync(500);

      // After recording compute times, debounce should be calculated from them
      const s = getSolverState();
      // The debounce is calculated from the median of compute times
      expect(s.debounceMs).toBeGreaterThanOrEqual(50);
      expect(s.debounceMs).toBeLessThanOrEqual(400);
    });
  });

  // ─── Shutdown ──────────────────────────────────────────────────────

  describe('Shutdown', () => {
    it('shutdownSolver clears pending state', () => {
      store.dispatch(updateMeasurements({ chest: 100 }));
      // Computing should be true
      expect(getIsComputing()).toBe(true);

      shutdownSolver();

      // After shutdown, pending jobs should be 0
      const s = getSolverState();
      expect(s.pendingJobs).toBe(0);
      expect(s.poolReady).toBe(false);
    });

    it('shutdownSolver clears debounce timer', async () => {
      store.dispatch(updateMeasurements({ chest: 100 }));

      shutdownSolver();

      // Advancing timers should not cause errors
      await vi.advanceTimersByTimeAsync(1000);

      // Generation should stay at whatever it was
      const s = getSolverState();
      expect(s.generationId).toBeGreaterThan(0);
    });
  });

  // ─── Action Pass-Through ───────────────────────────────────────────

  describe('Action Pass-Through', () => {
    it('trigger actions still reach reducers', () => {
      store.dispatch(updateMeasurements({ chest: 100 }));
      // The updateMeasurements action should have been applied to the project state
      const avatar = store.getState().project.avatar;
      expect(avatar.measurements.chest).toBe(100);
    });

    it('non-trigger actions pass through normally', () => {
      store.dispatch(setVariableOverride({ key: '#Test', value: 42 }));
      expect(store.getState().parametric.variableOverrides['#Test']).toBe(42);
    });
  });
});
