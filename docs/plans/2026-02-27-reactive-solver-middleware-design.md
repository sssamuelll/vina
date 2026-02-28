# Reactive Solver Middleware — Design Document

**Issue**: #154
**Date**: 2026-02-27
**Status**: Approved
**Rating**: 8/10 → 9.5/10 (with adjustments)

---

## 1. Problem Statement

Currently, updating measurements or variables requires manually invoking the "resolveConstruction" tool. This creates friction in the UX and breaks the real-time parametric editing experience.

**Goal**: Measurements/variables change → construction auto-resolves → pieces auto-update → simulation reflects changes. Zero manual steps.

---

## 2. Scope of Reactivity

The middleware listens to ALL relevant triggers:

| Action | Source |
|--------|--------|
| `project/updateMeasurements` | Avatar sliders |
| `construction/setVariable` | Manual formulas |
| `parametric/setVariableOverride` | Pattern variable sliders |

---

## 3. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           MAIN THREAD                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐    ┌──────────────────┐    ┌─────────────────────────┐    │
│  │ User Input  │───►│ Predictive Layer │───►│ Priority Dispatcher     │    │
│  │ (slider)    │    │ • onFocus: warm  │    │ • Selected piece first  │    │
│  └─────────────┘    │ • onHover: prep  │    │ • Visible pieces next   │    │
│                     │ • onChange: exec │    │ • Off-screen last       │    │
│                     └──────────────────┘    └───────────┬─────────────┘    │
│                                                         │                   │
│  ┌─────────────────────────────────────────────────────┼───────────────┐   │
│  │                    INSTANT FEEDBACK (< 16ms)         │               │   │
│  │  • Construction points update                        │               │   │
│  │  • Visual guides/lines redraw                        │               │   │
│  │  • "Computing..." indicator if > 100ms               │               │   │
│  └─────────────────────────────────────────────────────┼───────────────┘   │
│                                                         │                   │
└─────────────────────────────────────────────────────────┼───────────────────┘
                                                          │
                    ┌─────────────────────────────────────┼─────────────────┐
                    │              WORKER POOL            ▼                 │
                    ├───────────────────────────────────────────────────────┤
                    │  ┌─────────┐  ┌─────────┐  ┌─────────┐               │
                    │  │Worker 1 │  │Worker 2 │  │Worker N │  (N = cores)  │
                    │  │ piece A │  │ piece B │  │ piece C │               │
                    │  └────┬────┘  └────┬────┘  └────┬────┘               │
                    │       │            │            │                     │
                    │       ▼            ▼            ▼                     │
                    │  ┌─────────────────────────────────────────────────┐ │
                    │  │         Adaptive Transfer Strategy              │ │
                    │  │   SharedArrayBuffer > Transferable > Clone      │ │
                    │  └─────────────────────────────────────────────────┘ │
                    └───────────────────────────────────────────────────────┘
                                          │
                                          ▼
                    ┌───────────────────────────────────────────────────────┐
                    │              STREAMING UPDATES                        │
                    │  • Piece A ready → render immediately                 │
                    │  • Piece B ready → render immediately                 │
                    │  • Metrics logged for adaptive scheduling             │
                    └───────────────────────────────────────────────────────┘
```

---

## 4. Module Structure

```
src/
├── store/
│   ├── reactiveSolverMiddleware.ts    # Main orchestrator
│   ├── pieceIdentityMap.ts            # CPiece.id ↔ PatternPiece.id mapping
│   └── index.ts                        # Middleware integration
│
├── workers/
│   ├── pieceBuilderWorker.ts          # Worker that executes buildPiece
│   ├── workerPool.ts                  # Pool manager (spawn/reuse/terminate)
│   ├── workerProtocol.ts              # Shared types main↔worker
│   └── arrayBufferCodec.ts            # CPoint[] ↔ ArrayBuffer encoding
│
├── utils/
│   └── construction/
│       └── pieceBuilder.ts            # Add existingPieceId param (upsert)
│
├── hooks/
│   └── usePredictiveWarmup.ts         # onFocus/onHover pre-warm hook
│
└── types/
    └── reactiveSolver.ts              # Centralized type definitions
```

---

## 5. Type Definitions

```typescript
// types/reactiveSolver.ts

// ─── Transfer Strategy ───────────────────────────────────────────────────────

export type TransferStrategy =
  | 'sharedArrayBuffer'   // Fastest: same-origin, COOP/COEP headers
  | 'transferable'        // Fast: zero-copy for large data
  | 'structuredClone'     // Simple: small data, no overhead
  | 'mainThread';         // Fallback: no Worker support

export interface TransferCapabilities {
  sharedArrayBuffer: boolean;
  transferable: boolean;
  workerSupport: boolean;
  hardwareConcurrency: number;
}

// ─── Job Types ───────────────────────────────────────────────────────────────

export interface BuildPieceJob {
  jobId: string;
  generationId: number;              // Increments on each input change (for stale detection)
  cPiece: CPieceSerialized;
  points: CPointSerialized[];        // For small datasets
  pointsBuffer?: ArrayBuffer;        // For large datasets (Transferable)
  pointsShared?: SharedArrayBuffer;  // For same-origin (fastest)
  curves: CCurveSerialized[];
  existingPieceId: string | null;    // For upsert (preserves seams)
}

export interface CPieceSerialized {
  id: string;
  name: string;
  nodePointIds: string[];
  nodeCurveIds: (string | null)[];
  nodeConnections: ('line' | 'curve')[];
  nodeReverse: boolean[];
  seamAllowance: number;
  closed: boolean;
}

export interface CPointSerialized {
  id: string;
  label: string;
  x: number;
  y: number;
}

export interface CCurveSerialized {
  id: string;
  label: string;
  definition: CurveDefinition;
  resolvedCommands?: PathCommandSerialized[];
}

export interface PathCommandSerialized {
  type: 'M' | 'L' | 'C' | 'Z';
  values: number[];
}

// ─── Result Types ────────────────────────────────────────────────────────────

export interface BuildPieceResult {
  jobId: string;
  generationId: number;
  pieceId: string;
  cPieceId: string;                  // For identity mapping
  outline: PathCommandSerialized[];
  position: { x: number; y: number };
  success: boolean;
  error?: string;
  metrics: {
    computeTimeMs: number;
    pointCount: number;
    curveCount: number;
  };
}

// ─── Worker Commands ─────────────────────────────────────────────────────────

export type WorkerCommand =
  | { type: 'BUILD'; job: BuildPieceJob; transferList?: ArrayBuffer[] }
  | { type: 'CANCEL'; generationId: number }  // Cancel all jobs from this generation
  | { type: 'WARMUP' }                         // Pre-load dependencies
  | { type: 'TERMINATE' };

export type WorkerResponse =
  | { type: 'RESULT'; result: BuildPieceResult }
  | { type: 'READY' }                          // Worker initialized
  | { type: 'WARMED' }                         // Dependencies loaded
  | { type: 'ERROR'; error: string };

// ─── Priority Queue ──────────────────────────────────────────────────────────

export type JobPriority = 'high' | 'normal' | 'low';

export interface PriorityQueue {
  high: BuildPieceJob[];     // Selected piece
  normal: BuildPieceJob[];   // Visible pieces
  low: BuildPieceJob[];      // Off-screen pieces
}

// ─── Middleware State ────────────────────────────────────────────────────────

export interface ReactiveSolverState {
  currentGenerationId: number;
  lastComputeTimeMs: number;
  pendingJobs: number;
  capabilities: TransferCapabilities;
  strategy: TransferStrategy;
}

// ─── Metrics ─────────────────────────────────────────────────────────────────

export interface SolverMetrics {
  totalResolves: number;
  averageComputeTimeMs: number;
  p95ComputeTimeMs: number;
  cancelledJobs: number;
  strategyUsed: Record<TransferStrategy, number>;
}
```

---

## 6. Adaptive Transfer Strategy

```typescript
// workers/arrayBufferCodec.ts

const TRANSFERABLE_THRESHOLD = 200;  // points
const SHARED_BUFFER_THRESHOLD = 500; // points

export function detectCapabilities(): TransferCapabilities {
  return {
    sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined'
                       && crossOriginIsolated === true,
    transferable: typeof ArrayBuffer !== 'undefined',
    workerSupport: typeof Worker !== 'undefined',
    hardwareConcurrency: navigator.hardwareConcurrency || 2,
  };
}

export function selectStrategy(
  capabilities: TransferCapabilities,
  pointCount: number
): TransferStrategy {
  if (!capabilities.workerSupport) {
    return 'mainThread';
  }

  if (pointCount >= SHARED_BUFFER_THRESHOLD && capabilities.sharedArrayBuffer) {
    return 'sharedArrayBuffer';
  }

  if (pointCount >= TRANSFERABLE_THRESHOLD && capabilities.transferable) {
    return 'transferable';
  }

  return 'structuredClone';
}

// Encoding for Transferable/SharedArrayBuffer
// Layout: [x0, y0, x1, y1, ...] (Float64Array)
// IDs passed separately as string[] (small overhead, avoids hash collisions)

export function encodePoints(points: CPoint[]): {
  coords: Float64Array;
  ids: string[];
} {
  const coords = new Float64Array(points.length * 2);
  const ids: string[] = [];

  points.forEach((p, i) => {
    coords[i * 2] = p.x;
    coords[i * 2 + 1] = p.y;
    ids.push(p.id);
  });

  return { coords, ids };
}

export function decodePoints(coords: Float64Array, ids: string[]): CPointSerialized[] {
  const points: CPointSerialized[] = [];

  for (let i = 0; i < ids.length; i++) {
    points.push({
      id: ids[i],
      label: ids[i],
      x: coords[i * 2],
      y: coords[i * 2 + 1],
    });
  }

  return points;
}
```

---

## 7. Worker Pool Implementation

```typescript
// workers/workerPool.ts

export class WorkerPool {
  private workers: Worker[] = [];
  private available: Worker[] = [];
  private busy: Map<Worker, BuildPieceJob> = new Map();
  private queue: PriorityQueue = { high: [], normal: [], low: [] };
  private currentGenerationId = 0;

  constructor(private size: number = navigator.hardwareConcurrency || 2) {
    // Limit to reasonable max
    this.size = Math.min(this.size, 8);
  }

  async initialize(): Promise<void> {
    const workerUrl = new URL('./pieceBuilderWorker.ts', import.meta.url);

    for (let i = 0; i < this.size; i++) {
      const worker = new Worker(workerUrl, { type: 'module' });

      worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
        this.handleWorkerMessage(worker, e.data);
      };

      worker.onerror = (e) => {
        console.error('[WorkerPool] Worker error:', e);
        this.replaceWorker(worker);
      };

      this.workers.push(worker);
      this.available.push(worker);
    }

    // Warmup all workers
    await Promise.all(this.workers.map(w => this.warmup(w)));
  }

  private async warmup(worker: Worker): Promise<void> {
    return new Promise((resolve) => {
      const handler = (e: MessageEvent<WorkerResponse>) => {
        if (e.data.type === 'WARMED') {
          worker.removeEventListener('message', handler);
          resolve();
        }
      };
      worker.addEventListener('message', handler);
      worker.postMessage({ type: 'WARMUP' });
    });
  }

  submit(job: BuildPieceJob, priority: JobPriority): void {
    this.queue[priority].push(job);
    this.dispatch();
  }

  cancelGeneration(generationId: number): void {
    // Remove from queues
    for (const priority of ['high', 'normal', 'low'] as JobPriority[]) {
      this.queue[priority] = this.queue[priority].filter(
        j => j.generationId !== generationId
      );
    }

    // Notify busy workers (they'll discard results for this generation)
    this.workers.forEach(w => {
      w.postMessage({ type: 'CANCEL', generationId });
    });
  }

  private dispatch(): void {
    while (this.available.length > 0) {
      const job = this.dequeue();
      if (!job) break;

      const worker = this.available.pop()!;
      this.busy.set(worker, job);

      const command: WorkerCommand = { type: 'BUILD', job };

      // Transfer ArrayBuffer if present
      if (job.pointsBuffer) {
        worker.postMessage(command, [job.pointsBuffer]);
      } else {
        worker.postMessage(command);
      }
    }
  }

  private dequeue(): BuildPieceJob | undefined {
    return this.queue.high.shift()
        || this.queue.normal.shift()
        || this.queue.low.shift();
  }

  private handleWorkerMessage(worker: Worker, response: WorkerResponse): void {
    if (response.type === 'RESULT') {
      const job = this.busy.get(worker);
      this.busy.delete(worker);
      this.available.push(worker);

      // Emit result if not stale
      if (response.result.generationId === this.currentGenerationId) {
        this.onResult?.(response.result);
      }

      // Process next job
      this.dispatch();
    }
  }

  private replaceWorker(deadWorker: Worker): void {
    const index = this.workers.indexOf(deadWorker);
    if (index !== -1) {
      deadWorker.terminate();
      const newWorker = new Worker(
        new URL('./pieceBuilderWorker.ts', import.meta.url),
        { type: 'module' }
      );
      this.workers[index] = newWorker;
      this.available.push(newWorker);
    }
  }

  setGenerationId(id: number): void {
    this.currentGenerationId = id;
  }

  onResult?: (result: BuildPieceResult) => void;

  terminate(): void {
    this.workers.forEach(w => w.terminate());
    this.workers = [];
    this.available = [];
    this.busy.clear();
  }
}
```

---

## 8. Middleware Implementation

```typescript
// store/reactiveSolverMiddleware.ts

import type { Middleware } from '@reduxjs/toolkit';
import { WorkerPool } from '../workers/workerPool';
import { selectStrategy, encodePoints, detectCapabilities } from '../workers/arrayBufferCodec';
import { resolveConstructionPoints } from '../utils/construction/resolver';

const DEBOUNCE_BASE_MS = 50;

// Actions that trigger resolution
const TRIGGER_ACTIONS = [
  'project/updateMeasurements',
  'project/setAvatarMeasurements',
  'construction/setVariable',
  'parametric/setVariableOverride',
];

export function createReactiveSolverMiddleware(): Middleware {
  let pool: WorkerPool | null = null;
  let generationId = 0;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let lastComputeTimeMs = 50;
  let metricsHistory: number[] = [];

  const capabilities = detectCapabilities();

  // Lazy initialization
  const ensurePool = async (): Promise<WorkerPool> => {
    if (!pool && capabilities.workerSupport) {
      pool = new WorkerPool(capabilities.hardwareConcurrency);
      await pool.initialize();
    }
    return pool!;
  };

  // Adaptive debounce based on recent compute times
  const getAdaptiveDebounce = (): number => {
    if (lastComputeTimeMs < 50) return 100;
    if (lastComputeTimeMs < 150) return 200;
    return 400;
  };

  return (store) => {
    // Setup result handler
    ensurePool().then((p) => {
      if (p) {
        p.onResult = (result) => {
          if (result.success) {
            // Update metrics
            metricsHistory.push(result.metrics.computeTimeMs);
            if (metricsHistory.length > 10) metricsHistory.shift();
            lastComputeTimeMs = metricsHistory.reduce((a, b) => a + b, 0) / metricsHistory.length;

            // Update piece identity map
            store.dispatch({
              type: 'construction/mapPieceIdentity',
              payload: { cPieceId: result.cPieceId, patternPieceId: result.pieceId },
            });

            // Update piece outline (upsert)
            store.dispatch({
              type: 'project/upsertPieceOutline',
              payload: {
                pieceId: result.pieceId,
                outline: result.outline,
                position: result.position,
              },
            });
          } else {
            console.error('[ReactiveSolver] Build failed:', result.error);
          }
        };
      }
    });

    return (next) => (action) => {
      const result = next(action);

      if (!TRIGGER_ACTIONS.includes(action.type)) {
        return result;
      }

      // Increment generation, cancel stale work
      generationId++;
      pool?.cancelGeneration(generationId - 1);
      pool?.setGenerationId(generationId);

      // Phase 1: Instant feedback (resolve points synchronously)
      const state = store.getState();
      const { points } = state.construction;
      const measurements = state.project.avatar.measurements;
      const variables = { ...state.construction.variables, ...state.parametric.variableOverrides };

      const { resolved, errors } = resolveConstructionPoints(points, measurements, variables);

      if (resolved.length > 0) {
        store.dispatch({
          type: 'construction/resolveAll',
          payload: { resolved },
        });
      }

      if (errors.length > 0) {
        console.warn('[ReactiveSolver] Resolution errors:', errors);
      }

      // Phase 2: Debounced piece building
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }

      debounceTimer = setTimeout(async () => {
        const currentState = store.getState();
        const { pieces, points: resolvedPoints, curves } = currentState.construction;
        const identityMap = currentState.construction.pieceIdentityMap || {};
        const selectedPieceId = currentState.editor.selectedPieceId;
        const visiblePieceIds = currentState.editor.visiblePieceIds || [];

        const workerPool = await ensurePool();

        if (!workerPool) {
          // Fallback: main thread
          // ... (simplified, omitted for brevity)
          return;
        }

        const strategy = selectStrategy(capabilities, resolvedPoints.length);

        // Prepare jobs with priority
        for (const cPiece of pieces) {
          const existingPieceId = identityMap[cPiece.id] || null;

          const priority: JobPriority =
            existingPieceId === selectedPieceId ? 'high' :
            visiblePieceIds.includes(existingPieceId) ? 'normal' : 'low';

          const job: BuildPieceJob = {
            jobId: `${generationId}-${cPiece.id}`,
            generationId,
            cPiece: serializeCPiece(cPiece),
            points: strategy === 'structuredClone'
              ? resolvedPoints.map(serializePoint)
              : [],
            pointsBuffer: strategy === 'transferable'
              ? encodePoints(resolvedPoints).coords.buffer
              : undefined,
            curves: curves.map(serializeCurve),
            existingPieceId,
          };

          workerPool.submit(job, priority);
        }
      }, getAdaptiveDebounce());

      return result;
    };
  };
}
```

---

## 9. Piece Builder Modification

```typescript
// utils/construction/pieceBuilder.ts

// ADD: existingPieceId parameter for upsert behavior
export function buildPiece(
  cPiece: CPiece,
  points: CPoint[],
  curves: CCurve[],
  ctx: FormulaContext,
  existingPieceId?: string  // NEW: preserve identity
): PatternPiece {
  // ... existing logic ...

  return {
    id: existingPieceId || uid('pp'),  // CHANGED: use existing ID if provided
    name: cPiece.name,
    outline,
    internals: [],
    position: { x: minX, y: minY },
    rotation: 0,
    seamAllowance: cPiece.seamAllowance,
    constructionPieceId: cPiece.id,  // NEW: back-reference for mapping
  };
}
```

---

## 10. Predictive Warmup Hook

```typescript
// hooks/usePredictiveWarmup.ts

import { useCallback, useRef } from 'react';

export function usePredictiveWarmup(warmupFn: () => void) {
  const warmedUp = useRef(false);

  const onFocus = useCallback(() => {
    if (!warmedUp.current) {
      warmupFn();
      warmedUp.current = true;
    }
  }, [warmupFn]);

  const onMouseEnter = useCallback(() => {
    if (!warmedUp.current) {
      // Delay slightly to avoid false positives
      setTimeout(() => {
        if (!warmedUp.current) {
          warmupFn();
          warmedUp.current = true;
        }
      }, 100);
    }
  }, [warmupFn]);

  return { onFocus, onMouseEnter };
}

// Usage in MeasurementSlider component:
// const { onFocus, onMouseEnter } = usePredictiveWarmup(() => {
//   dispatch({ type: 'reactiveSolver/warmup' });
// });
```

---

## 11. Piece Identity Map

```typescript
// store/pieceIdentityMap.ts

// Stored in constructionSlice.pieceIdentityMap
// Maps CPiece.id → PatternPiece.id

export interface PieceIdentityState {
  pieceIdentityMap: Record<string, string>;  // cPieceId → patternPieceId
}

// Reducer additions to constructionSlice:
reducers: {
  // ... existing reducers ...

  mapPieceIdentity(state, action: PayloadAction<{ cPieceId: string; patternPieceId: string }>) {
    state.pieceIdentityMap[action.payload.cPieceId] = action.payload.patternPieceId;
  },

  clearPieceIdentity(state, action: PayloadAction<string>) {
    delete state.pieceIdentityMap[action.payload];
  },

  clearAllIdentities(state) {
    state.pieceIdentityMap = {};
  },
}
```

---

## 12. Project Slice Additions

```typescript
// store/projectSlice.ts

// New reducer for upsert behavior
reducers: {
  // ... existing reducers ...

  upsertPieceOutline(state, action: PayloadAction<{
    pieceId: string;
    outline: PathCommand[];
    position: { x: number; y: number };
  }>) {
    const { pieceId, outline, position } = action.payload;
    const existingIndex = state.pieces.findIndex(p => p.id === pieceId);

    if (existingIndex !== -1) {
      // Update existing piece (preserves seams, selection, etc.)
      state.pieces[existingIndex].outline = outline;
      state.pieces[existingIndex].position = position;
    } else {
      // Should not happen if identity map is correct
      console.warn('[upsertPieceOutline] Piece not found:', pieceId);
    }
  },
}
```

---

## 13. Metrics & Monitoring

```typescript
// store/solverMetrics.ts

export interface SolverMetricsState {
  totalResolves: number;
  computeTimes: number[];           // Last 100 measurements
  cancelledJobs: number;
  strategyUsage: Record<TransferStrategy, number>;
  errors: string[];                 // Last 10 errors
}

// Exported for analytics/debugging
export function getSolverMetrics(state: RootState): {
  averageComputeTimeMs: number;
  p95ComputeTimeMs: number;
  successRate: number;
  preferredStrategy: TransferStrategy;
} {
  const { computeTimes, totalResolves, cancelledJobs, strategyUsage } = state.solverMetrics;

  const sorted = [...computeTimes].sort((a, b) => a - b);
  const p95Index = Math.floor(sorted.length * 0.95);

  return {
    averageComputeTimeMs: computeTimes.reduce((a, b) => a + b, 0) / computeTimes.length || 0,
    p95ComputeTimeMs: sorted[p95Index] || 0,
    successRate: (totalResolves - cancelledJobs) / totalResolves || 1,
    preferredStrategy: Object.entries(strategyUsage)
      .sort(([, a], [, b]) => b - a)[0]?.[0] as TransferStrategy || 'structuredClone',
  };
}
```

---

## 14. Testing Strategy

### Unit Tests
- `arrayBufferCodec.test.ts` — encode/decode round-trip
- `workerPool.test.ts` — job scheduling, cancellation, error recovery
- `pieceBuilder.test.ts` — upsert behavior with existingPieceId

### Integration Tests
- Middleware triggers on measurement change
- Points resolve immediately (< 16ms)
- Pieces update after debounce
- Seams preserved after parametric update
- Cancellation works (rapid slider dragging)

### Performance Tests
- Benchmark: Transferable vs StructuredClone at various sizes
- Measure actual compute times in CI
- Validate adaptive debounce behavior

### E2E Tests
- Drag measurement slider → see pattern deform in real-time
- Multiple rapid changes → no visual glitches
- Works on Safari (no SharedArrayBuffer)

---

## 15. Rollout Plan

1. **Feature flag**: `ENABLE_REACTIVE_SOLVER=false` initially
2. **Internal testing**: Enable for team, collect metrics
3. **Beta**: Enable for 10% of users, monitor p95 latency
4. **GA**: Enable for all, remove flag

---

## 16. Success Criteria

| Metric | Target |
|--------|--------|
| Point resolution latency | < 16ms (1 frame) |
| Piece update latency (p95) | < 100ms |
| Memory overhead | < 50MB for Worker pool |
| No simulation resets | 100% seam preservation |
| Fallback coverage | Works on all browsers |

---

## 17. Dependencies

- **#155 (Persistent Identity)**: Partially solved by `existingPieceId` param
- **#156 (Geometry Reference)**: Separate issue, not blocked

---

## 18. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| SharedArrayBuffer not available | Graceful fallback to Transferable/Clone |
| Worker crashes | Auto-restart with `replaceWorker()` |
| Memory leaks in Workers | Periodic termination/restart (every 1000 jobs) |
| Encoding overhead > benefit | Benchmark-driven thresholds, adaptive strategy |

