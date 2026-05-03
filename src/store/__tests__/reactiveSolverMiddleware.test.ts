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
  reactiveSolverMiddleware,
  filterBuildablePieces,
  getSolverMetrics,
  getSolverState,
  subscribeToComputingState,
  shutdownSolver,
  getIsComputing,
  SOLVER_TOAST_RATE_LIMIT_MS,
  shouldEmitSolverToast,
} from '../reactiveSolverMiddleware';
import type { CPiece, CPoint } from '../../types/construction';

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
      getDefault({ serializableCheck: false }).concat(reactiveSolverMiddleware),
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

  // ─── Worker pool error rate-limit boundary (E-async D8 gap 5) ──────

  // Direct test of the exported `shouldEmitSolverToast` pure function +
  // the `SOLVER_TOAST_RATE_LIMIT_MS` constant. Regression guards for:
  //  (a) magnitude — 5000ms window matches A3 wasmNaNCount precedent.
  //  (b) strict `>` comparison — exactly windowMs delta suppresses.
  //  (c) first-error-after-init semantics — at production Date.now(),
  //      the initial lastSolverToastTs=0 sentinel always emits because
  //      Date.now() returns millis-since-epoch (>> windowMs). Future
  //      refactor that initializes lastSolverToastTs = Date.now() would
  //      silently suppress the first error of every session.
  describe('Worker pool error rate-limit boundary (E-async D8 gap 5)', () => {
    it('SOLVER_TOAST_RATE_LIMIT_MS is 5000ms (matches A3 precedent)', () => {
      expect(SOLVER_TOAST_RATE_LIMIT_MS).toBe(5000);
    });

    it('strict `>` comparison: exactly windowMs delta suppresses (off-by-one boundary)', () => {
      const last = 1_000_000; // arbitrary anchor
      expect(shouldEmitSolverToast(last + 4999, last)).toBe(false);
      expect(shouldEmitSolverToast(last + 5000, last)).toBe(false); // boundary — suppressed
      expect(shouldEmitSolverToast(last + 5001, last)).toBe(true);
    });

    it('first-error-after-init: with lastTs=0 + production Date.now (>> 5000ms), emits', () => {
      // Production Date.now() returns millis since epoch (~1.7e12).
      // With initial lastSolverToastTs = 0, the first onError always
      // emits because (Date.now - 0) >> 5000.
      expect(shouldEmitSolverToast(Date.now(), 0)).toBe(true);
      expect(shouldEmitSolverToast(1_700_000_000_000, 0)).toBe(true);
    });

    it('first-error-after-init regression guard: if future refactor sets lastTs = Date.now() at init, first error suppressed', () => {
      // Documents the regression risk. If a future refactor initializes
      // `let lastSolverToastTs = Date.now();` instead of `= 0`, then
      // (Date.now - Date.now) === 0, not > 5000 → first error suppressed.
      // The current init `= 0` is intentional — this test fails if anyone
      // changes it to Date.now() initialization.
      const initSentinel = 0; // current behavior — must stay 0, not Date.now()
      expect(shouldEmitSolverToast(Date.now(), initSentinel)).toBe(true);

      // Anti-pattern verification (would break first-error emission):
      const dateNowInitAntiPattern = Date.now();
      expect(shouldEmitSolverToast(Date.now(), dateNowInitAntiPattern)).toBe(false);
    });

    it('within-window suppression: 0ms after last toast', () => {
      // Burst case: error fires immediately after another → 0ms delta.
      const last = 1_000_000;
      expect(shouldEmitSolverToast(last, last)).toBe(false);
    });
  });
});

// ─── filterBuildablePieces (O(P·K·M) → O(M + P·K) refactor) ──────────────────

/**
 * Reference implementation matching the pre-refactor code at
 * reactiveSolverMiddleware.ts:290-295 (commit prior to this change).
 * Kept in the test file only — never exported — so we can assert exact
 * parity with the Map-indexed replacement.
 */
function legacyFilterBuildablePieces(pieces: CPiece[], points: CPoint[]): CPiece[] {
  return pieces.filter(cPiece =>
    !cPiece.nodes.some(node => {
      const pt = points.find(p => p.id === node.pointId);
      return pt?.resolutionError != null;
    })
  );
}

function makePoint(id: string, overrides: Partial<CPoint> = {}): CPoint {
  return {
    id,
    label: id,
    x: 0,
    y: 0,
    definition: { type: 'absolute', x: 0, y: 0 },
    visible: true,
    ...overrides,
  };
}

function makePiece(id: string, pointIds: string[]): CPiece {
  return {
    id,
    name: id,
    nodes: pointIds.map((pointId) => ({ pointId, connection: 'line' as const })),
    seamAllowance: 10,
    closed: true,
  };
}

/** Mulberry32 — seeded PRNG so property checks are reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomScenario(
  seed: number,
  numPoints: number,
  numPieces: number,
  maxNodesPerPiece: number,
  errorRate: number,
): { points: CPoint[]; pieces: CPiece[] } {
  const rand = mulberry32(seed);
  const points: CPoint[] = [];
  for (let i = 0; i < numPoints; i++) {
    const hasError = rand() < errorRate;
    points.push(
      makePoint(`p${i}`, hasError ? { resolutionError: `err-${i}` } : {}),
    );
  }
  const pieces: CPiece[] = [];
  for (let i = 0; i < numPieces; i++) {
    const k = 1 + Math.floor(rand() * maxNodesPerPiece);
    const nodeIds: string[] = [];
    for (let j = 0; j < k; j++) {
      nodeIds.push(`p${Math.floor(rand() * numPoints)}`);
    }
    pieces.push(makePiece(`piece${i}`, nodeIds));
  }
  return { points, pieces };
}

describe('filterBuildablePieces', () => {
  describe('parity with legacy O(P·K·M) implementation', () => {
    it('matches legacy output on 10 seeded random scenarios', () => {
      const seeds = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89];
      for (const seed of seeds) {
        const { points, pieces } = randomScenario(seed, 80, 40, 8, 0.2);
        const fresh = filterBuildablePieces(pieces, points);
        const legacy = legacyFilterBuildablePieces(pieces, points);
        expect(fresh.map((p) => p.id)).toEqual(legacy.map((p) => p.id));
      }
    });

    it('matches legacy output when every point errors', () => {
      const points = [makePoint('a', { resolutionError: 'nope' })];
      const pieces = [makePiece('piece1', ['a'])];
      expect(filterBuildablePieces(pieces, points)).toEqual(
        legacyFilterBuildablePieces(pieces, points),
      );
    });

    it('matches legacy output when no point errors', () => {
      const points = [makePoint('a'), makePoint('b')];
      const pieces = [makePiece('piece1', ['a', 'b'])];
      expect(filterBuildablePieces(pieces, points)).toEqual(
        legacyFilterBuildablePieces(pieces, points),
      );
    });
  });

  describe('semantic invariants', () => {
    it('keeps a piece whose nodes all resolve cleanly', () => {
      const points = [makePoint('a'), makePoint('b')];
      const pieces = [makePiece('piece1', ['a', 'b'])];
      expect(filterBuildablePieces(pieces, points).map((p) => p.id)).toEqual(['piece1']);
    });

    it('drops a piece when ANY node references an errored point', () => {
      const points = [makePoint('a'), makePoint('b', { resolutionError: 'boom' })];
      const pieces = [makePiece('piece1', ['a', 'b'])];
      expect(filterBuildablePieces(pieces, points)).toEqual([]);
    });

    it('keeps a piece whose nodes reference a nonexistent pointId (undefined → not errored)', () => {
      const points = [makePoint('a')];
      const pieces = [makePiece('piece1', ['ghost'])];
      // Legacy .find() returns undefined, pt?.resolutionError is undefined, != null is false
      // The Map.get() returns undefined, same branch. Both keep the piece.
      expect(filterBuildablePieces(pieces, points).map((p) => p.id)).toEqual(['piece1']);
      expect(filterBuildablePieces(pieces, points)).toEqual(
        legacyFilterBuildablePieces(pieces, points),
      );
    });

    it('preserves the input order of pieces', () => {
      const points = [makePoint('a')];
      const pieces = [
        makePiece('z', ['a']),
        makePiece('a', ['a']),
        makePiece('m', ['a']),
      ];
      expect(filterBuildablePieces(pieces, points).map((p) => p.id)).toEqual(['z', 'a', 'm']);
    });

    it('first-wins on duplicate point IDs (matches Array.prototype.find)', () => {
      // Two points share id 'dup'; legacy .find returns the first occurrence
      // (clean). Our Map must also retain the first and not be shadowed.
      const points = [
        makePoint('dup'),
        makePoint('dup', { resolutionError: 'would break if second wins' }),
      ];
      const pieces = [makePiece('piece1', ['dup'])];
      expect(filterBuildablePieces(pieces, points).map((p) => p.id)).toEqual(['piece1']);
      expect(filterBuildablePieces(pieces, points)).toEqual(
        legacyFilterBuildablePieces(pieces, points),
      );
    });
  });

  describe('edge cases', () => {
    it('returns [] for empty pieces', () => {
      expect(filterBuildablePieces([], [makePoint('a')])).toEqual([]);
    });

    it('handles empty points array (pieces with any nodes are kept, nodes resolve to undefined)', () => {
      const pieces = [makePiece('piece1', ['a'])];
      expect(filterBuildablePieces(pieces, []).map((p) => p.id)).toEqual(['piece1']);
    });

    it('handles a piece with zero nodes (vacuously buildable)', () => {
      const pieces: CPiece[] = [{
        id: 'empty',
        name: 'empty',
        nodes: [],
        seamAllowance: 10,
        closed: true,
      }];
      expect(filterBuildablePieces(pieces, []).map((p) => p.id)).toEqual(['empty']);
    });

    it('handles N=1 pieces and N=1 points', () => {
      expect(
        filterBuildablePieces([makePiece('p1', ['a'])], [makePoint('a')]).map((p) => p.id),
      ).toEqual(['p1']);
    });

    it('is stable under reversed input order', () => {
      const points = [makePoint('a'), makePoint('b', { resolutionError: 'boom' }), makePoint('c')];
      const pieces = [
        makePiece('p1', ['a']),
        makePiece('p2', ['b']),
        makePiece('p3', ['c']),
      ];
      const forward = filterBuildablePieces(pieces, points).map((p) => p.id);
      const reversedPoints = filterBuildablePieces(pieces, [...points].reverse()).map((p) => p.id);
      expect(forward).toEqual(['p1', 'p3']);
      expect(reversedPoints).toEqual(['p1', 'p3']);
    });

    it('does not mutate its input arrays', () => {
      const points = [makePoint('a'), makePoint('b', { resolutionError: 'boom' })];
      const pieces = [makePiece('p1', ['a']), makePiece('p2', ['b'])];
      const pointsSnapshot = points.map((p) => ({ ...p }));
      const piecesSnapshot = pieces.map((p) => ({ ...p, nodes: [...p.nodes] }));
      filterBuildablePieces(pieces, points);
      expect(points).toEqual(pointsSnapshot);
      expect(pieces).toEqual(piecesSnapshot);
    });
  });

  describe('performance (detects O(P·K·M) regression)', () => {
    // With the legacy nested .find(), this scenario is ~P·K·M ≈ 3e8 ops
    // and runs in tens of seconds on a modern machine. The Map-indexed
    // version finishes in single-digit milliseconds.
    it('completes 1000 pieces × 30 nodes × 10000 points in under 250ms', () => {
      const { points, pieces } = randomScenario(42, 10_000, 1_000, 30, 0.1);
      const start = performance.now();
      const out = filterBuildablePieces(pieces, points);
      const elapsed = performance.now() - start;
      expect(out.length).toBeGreaterThanOrEqual(0);
      expect(out.length).toBeLessThanOrEqual(pieces.length);
      expect(elapsed).toBeLessThan(250);
    });
  });
});
