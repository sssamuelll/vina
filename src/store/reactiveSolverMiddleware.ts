/**
 * Reactive Solver Middleware
 *
 * Automatically resolves construction points and rebuilds pieces when
 * measurements or variables change. Uses a worker pool for non-blocking
 * piece building with priority scheduling.
 *
 * Architecture:
 * - Phase 1 (instant): Resolve points synchronously (< 16ms target)
 * - Phase 2 (debounced): Build pieces via worker pool
 * - Adaptive debounce: faster response when compute is fast
 * - Priority queue: selected piece first, then visible, then off-screen
 * - Generation tracking: cancel stale work on new triggers
 *
 * @see docs/plans/2026-02-27-reactive-solver-middleware-design.md
 */

import type { Middleware, AnyAction, Dispatch } from '@reduxjs/toolkit';
import type {
  BuildPieceJob,
  BuildPieceResult,
  JobPriority,
  TransferStrategy,
  SolverMetrics,
} from '../types/reactiveSolver';

import { WorkerPool, getWorkerPool } from '../workers/workerPool';
import {
  serializePoint,
  serializeCurve,
  serializePiece,
  deserializeOutline,
  prepareJobData,
  selectStrategy,
  detectCapabilities,
} from '../workers/workerProtocol';

import { resolveAll, mapPieceIdentity } from './constructionSlice';
import { upsertPieceOutline, addPiece } from './projectSlice';
import { buildPieceWithOffset } from '../utils/construction/pieceBuilder';
import type { FormulaContext } from '../utils/seamly2d/formulaEvaluator';
import type { CPoint, CCurve, CPiece } from '../types/construction';
import type { ConstructionState } from '../types/construction';
import type { ParametricState } from './parametricSlice';

// Define minimal state shape inline to avoid circular imports
interface MinimalProjectState {
  pieces: Array<{ id: string }>;
  avatar: { measurements: Record<string, number> };
}

interface MinimalEditorState {
  selectedPieceIds: string[];
}

interface SolverRootState {
  construction: ConstructionState;
  parametric: ParametricState;
  project: MinimalProjectState;
  editor: MinimalEditorState;
}

// Use generic dispatch type to avoid circular import
type AppDispatch = Dispatch<AnyAction>;

// ─── Configuration ───────────────────────────────────────────────────────────

/** Actions that trigger the reactive solver */
const TRIGGER_ACTIONS = [
  'project/updateMeasurements',
  'construction/setVariable',
  'parametric/setVariableOverride',
  'parametric/setVariableOverrides',
  'parametric/activateTemplate',
] as const;

/** Minimum debounce time in ms */
const MIN_DEBOUNCE_MS = 50;

/** Maximum debounce time in ms */
const MAX_DEBOUNCE_MS = 400;

/** Point count threshold below which we skip workers */
const MAIN_THREAD_THRESHOLD = 50;

// ─── Middleware State ────────────────────────────────────────────────────────

interface MiddlewareState {
  /** Current generation ID - increments on each trigger */
  generationId: number;
  /** Debounce timer handle */
  debounceTimer: ReturnType<typeof setTimeout> | null;
  /** Worker pool instance */
  pool: WorkerPool | null;
  /** Whether pool is initialized */
  poolReady: boolean;
  /** Rolling compute times for adaptive debounce */
  computeTimes: number[];
  /** Detected capabilities */
  capabilities: ReturnType<typeof detectCapabilities>;
  /** Metrics for monitoring */
  metrics: SolverMetrics;
  /** Jobs currently in flight */
  pendingJobs: Map<string, { generationId: number; cPieceId: string }>;
  /** Whether solver is currently computing */
  isComputing: boolean;
  /** Listeners for computing state changes */
  computingListeners: Set<(isComputing: boolean) => void>;
}

const state: MiddlewareState = {
  generationId: 0,
  debounceTimer: null,
  pool: null,
  poolReady: false,
  computeTimes: [],
  capabilities: detectCapabilities(),
  metrics: {
    totalResolves: 0,
    computeTimes: [],
    cancelledJobs: 0,
    strategyUsage: {} as Record<TransferStrategy, number>,
    errors: [],
    lastResolveTimestamp: 0,
  },
  pendingJobs: new Map(),
  isComputing: false,
  computingListeners: new Set(),
};

// ─── Computing State Management ──────────────────────────────────────────────

/**
 * Set computing state and notify listeners.
 */
function setComputingState(computing: boolean): void {
  if (state.isComputing !== computing) {
    state.isComputing = computing;
    state.computingListeners.forEach(listener => listener(computing));
  }
}

/**
 * Subscribe to computing state changes.
 * @returns Unsubscribe function.
 */
export function subscribeToComputingState(listener: (isComputing: boolean) => void): () => void {
  state.computingListeners.add(listener);
  // Immediately notify of current state
  listener(state.isComputing);
  return () => {
    state.computingListeners.delete(listener);
  };
}

/**
 * Get current computing state.
 */
export function getIsComputing(): boolean {
  return state.isComputing;
}

// ─── Adaptive Debounce ───────────────────────────────────────────────────────

/**
 * Calculate debounce time based on recent compute times.
 * Faster when computes are fast, slower when they're slow.
 */
function calculateDebounceMs(): number {
  if (state.computeTimes.length === 0) {
    return 100; // Default for first run
  }

  // Use median of last 10 compute times
  const recent = state.computeTimes.slice(-10);
  const sorted = [...recent].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];

  // Scale: <50ms → 100ms, <150ms → 200ms, else 400ms
  if (median < 50) return Math.max(MIN_DEBOUNCE_MS, 100);
  if (median < 150) return 200;
  return MAX_DEBOUNCE_MS;
}

/**
 * Record a compute time for adaptive debounce.
 */
function recordComputeTime(timeMs: number): void {
  state.computeTimes.push(timeMs);
  // Keep only last 100 measurements
  if (state.computeTimes.length > 100) {
    state.computeTimes.shift();
  }

  // Also record in metrics
  state.metrics.computeTimes.push(timeMs);
  if (state.metrics.computeTimes.length > 100) {
    state.metrics.computeTimes.shift();
  }
}

// ─── Priority Assignment ─────────────────────────────────────────────────────

/**
 * Assign priority to a piece based on selection and visibility.
 */
function assignPriority(
  cPieceId: string,
  selectedPieceIds: string[],
  pieceIdentityMap: Record<string, string>
): JobPriority {
  // Check if this construction piece maps to a selected pattern piece
  const patternPieceId = pieceIdentityMap[cPieceId];

  if (patternPieceId && selectedPieceIds.includes(patternPieceId)) {
    return 'high';
  }

  // TODO: Check visibility based on viewport
  // For now, all non-selected pieces are normal priority
  return 'normal';
}

// ─── Point Resolution (Phase 1) ──────────────────────────────────────────────

/**
 * Resolve all construction points synchronously.
 * This should complete in < 16ms for typical patterns.
 */
function resolvePointsSync(
  reduxState: SolverRootState
): { points: CPoint[]; context: FormulaContext } {
  const { points, variables } = reduxState.construction;
  const measurements = reduxState.parametric.baseMeasurements || reduxState.project.avatar.measurements;
  const overrides = reduxState.parametric.variableOverrides;

  // Build formula context - convert variables to numbers only
  const numericVariables: Record<string, number> = {};
  for (const [key, val] of Object.entries(variables)) {
    numericVariables[key] = typeof val === 'number' ? val : parseFloat(String(val)) || 0;
  }

  const context: FormulaContext = {
    measurements: measurements as Record<string, number>,
    variables: { ...numericVariables, ...overrides },
  };

  // If we have points with definitions, resolve them
  // For now, return as-is since points are already resolved when added
  // Full resolution would require constructionResolver for complex dependencies

  return { points: [...points], context };
}

// ─── Piece Building (Phase 2) ────────────────────────────────────────────────

/**
 * Build pieces using worker pool or main thread fallback.
 */
async function buildPiecesAsync(
  dispatch: AppDispatch,
  reduxState: SolverRootState,
  generationId: number
): Promise<void> {
  const { pieces, curves, pieceIdentityMap } = reduxState.construction;
  const { points, context } = resolvePointsSync(reduxState);
  const selectedPieceIds = reduxState.editor.selectedPieceIds || [];

  if (pieces.length === 0) {
    return;
  }

  const pointCount = points.length;
  const strategy = selectStrategy(state.capabilities, pointCount);

  // Track strategy usage
  state.metrics.strategyUsage[strategy] = (state.metrics.strategyUsage[strategy] || 0) + 1;

  // For small datasets or no worker support, use main thread
  if (strategy === 'mainThread' || pointCount < MAIN_THREAD_THRESHOLD) {
    buildPiecesMainThread(dispatch, pieces, points, curves, context, pieceIdentityMap, generationId);
    return;
  }

  // Use worker pool
  await buildPiecesWorkerPool(
    dispatch,
    pieces,
    points,
    curves,
    context,
    pieceIdentityMap,
    selectedPieceIds,
    generationId,
    strategy
  );
}

/**
 * Build pieces on main thread (fallback or small datasets).
 */
function buildPiecesMainThread(
  dispatch: AppDispatch,
  pieces: CPiece[],
  points: CPoint[],
  curves: CCurve[],
  context: FormulaContext,
  pieceIdentityMap: Record<string, string>,
  generationId: number
): void {
  const startTime = performance.now();

  for (const cPiece of pieces) {
    // Check if generation is still current
    if (generationId !== state.generationId) {
      state.metrics.cancelledJobs++;
      return;
    }

    const existingPieceId = pieceIdentityMap[cPiece.id] || null;

    try {
      const { piece } = buildPieceWithOffset(
        cPiece,
        points,
        curves,
        context,
        existingPieceId || undefined
      );

      // Map identity if new
      if (!existingPieceId) {
        dispatch(mapPieceIdentity({ cPieceId: cPiece.id, patternPieceId: piece.id }));
        dispatch(addPiece(piece));
      } else {
        dispatch(upsertPieceOutline({
          pieceId: piece.id,
          outline: piece.outline,
          position: piece.position,
        }));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      state.metrics.errors.push(message);
      if (state.metrics.errors.length > 10) {
        state.metrics.errors.shift();
      }
    }
  }

  const endTime = performance.now();
  recordComputeTime(endTime - startTime);
  state.metrics.totalResolves++;
  state.metrics.lastResolveTimestamp = Date.now();
}

/**
 * Build pieces using worker pool.
 */
async function buildPiecesWorkerPool(
  dispatch: AppDispatch,
  pieces: CPiece[],
  points: CPoint[],
  curves: CCurve[],
  _context: FormulaContext,
  pieceIdentityMap: Record<string, string>,
  selectedPieceIds: string[],
  generationId: number,
  strategy: TransferStrategy
): Promise<void> {
  // Ensure pool is ready
  if (!state.pool || !state.poolReady) {
    await initializePool();
  }

  if (!state.pool) {
    // Fallback to main thread
    buildPiecesMainThread(dispatch, pieces, points, curves, _context, pieceIdentityMap, generationId);
    return;
  }

  // Prepare shared data
  const serializedPoints = points.map(serializePoint);
  const serializedCurves = curves.map(serializeCurve);
  const jobData = prepareJobData(points, strategy);

  // Submit jobs for each piece
  for (const cPiece of pieces) {
    const existingPieceId = pieceIdentityMap[cPiece.id] || null;
    const priority = assignPriority(cPiece.id, selectedPieceIds, pieceIdentityMap);
    const jobId = `job_${cPiece.id}_${generationId}`;

    const job: BuildPieceJob = {
      jobId,
      generationId,
      cPiece: serializePiece(cPiece),
      points: jobData.points || serializedPoints,
      pointsBuffer: jobData.pointsBuffer,
      pointsShared: jobData.pointsShared,
      pointIds: jobData.pointIds,
      curves: serializedCurves,
      existingPieceId,
    };

    // Track pending job
    state.pendingJobs.set(jobId, { generationId, cPieceId: cPiece.id });

    // Submit to pool
    state.pool.submit(job, priority);
  }
}

// ─── Worker Pool Management ──────────────────────────────────────────────────

/**
 * Initialize the worker pool.
 */
async function initializePool(): Promise<void> {
  if (state.pool && state.poolReady) {
    return;
  }

  state.pool = getWorkerPool({
    poolSize: Math.min(state.capabilities.hardwareConcurrency, 4), // Cap at 4 workers
  });

  // Set up result handler
  state.pool.onResult(handleWorkerResult);

  // Set up error handler
  state.pool.onError((error: string, jobId?: string) => {
    console.error('[ReactiveSolver] Worker error:', error, jobId);
    state.metrics.errors.push(error);
    if (state.metrics.errors.length > 10) {
      state.metrics.errors.shift();
    }

    if (jobId) {
      state.pendingJobs.delete(jobId);
    }
  });

  try {
    await state.pool.initialize();
    state.poolReady = true;

    // Warmup in background
    state.pool.warmup().catch(() => {
      // Warmup failure is not critical
    });
  } catch (error) {
    console.error('[ReactiveSolver] Failed to initialize worker pool:', error);
    state.pool = null;
    state.poolReady = false;
  }
}

// Store dispatch reference for result handler
let storeDispatch: AppDispatch | null = null;

/**
 * Handle result from worker.
 */
function handleWorkerResult(result: BuildPieceResult): void {
  // Check if this result is still relevant
  if (result.generationId !== state.generationId) {
    state.metrics.cancelledJobs++;
    state.pendingJobs.delete(result.jobId);
    return;
  }

  // Record compute time
  recordComputeTime(result.metrics.computeTimeMs);
  state.metrics.totalResolves++;
  state.metrics.lastResolveTimestamp = Date.now();

  // Remove from pending
  state.pendingJobs.delete(result.jobId);

  if (!result.success) {
    state.metrics.errors.push(result.error || 'Unknown error');
    if (state.metrics.errors.length > 10) {
      state.metrics.errors.shift();
    }
    return;
  }

  if (!storeDispatch) {
    console.warn('[ReactiveSolver] No dispatch available for result');
    return;
  }

  // Dispatch updates
  const outline = deserializeOutline(result.outline);

  if (result.pieceId) {
    storeDispatch(upsertPieceOutline({
      pieceId: result.pieceId,
      outline,
      position: result.position,
    }));

    // Map identity if new
    if (result.cPieceId && result.pieceId) {
      storeDispatch(mapPieceIdentity({
        cPieceId: result.cPieceId,
        patternPieceId: result.pieceId,
      }));
    }
  }

  // Check if all jobs complete
  if (state.pendingJobs.size === 0) {
    setComputingState(false);
  }
}

// ─── Middleware Factory ──────────────────────────────────────────────────────

/**
 * Create the reactive solver middleware.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-empty-object-type
export function createReactiveSolverMiddleware(): Middleware<{}, any> {
  return (store) => {
    // Store dispatch reference for async callbacks
    storeDispatch = store.dispatch as AppDispatch;

    return (next) => (action: unknown) => {
      // Let the action go through first
      const result = next(action);

      // Check if this is a trigger action
      const typedAction = action as AnyAction;
      const actionType = typedAction.type as string;
      if (!TRIGGER_ACTIONS.some(trigger => actionType === trigger)) {
        return result;
      }

      // Increment generation and cancel stale work
      const previousGenerationId = state.generationId;
      state.generationId++;

      if (state.pool && state.poolReady) {
        state.pool.cancelGeneration(previousGenerationId);
      }

      // Clear pending debounce
      if (state.debounceTimer) {
        clearTimeout(state.debounceTimer);
        state.debounceTimer = null;
      }

      // Get current state
      const reduxState = store.getState();

      // Phase 1: Resolve points synchronously (instant feedback)
      const { points } = resolvePointsSync(reduxState);

      // Dispatch resolved points
      if (points.length > 0) {
        store.dispatch(resolveAll({
          resolved: points.map(p => ({ id: p.id, x: p.x, y: p.y })),
        }) as AnyAction);
      }

      // Phase 2: Debounced piece building
      const debounceMs = calculateDebounceMs();
      const currentGenerationId = state.generationId;

      // Signal computing started (debounce pending)
      setComputingState(true);

      state.debounceTimer = setTimeout(() => {
        // Double-check generation hasn't changed
        if (currentGenerationId !== state.generationId) {
          setComputingState(false);
          return;
        }

        // Build pieces async
        buildPiecesAsync(
          store.dispatch as AppDispatch,
          store.getState(),
          currentGenerationId
        ).catch((error) => {
          console.error('[ReactiveSolver] Build error:', error);
        }).finally(() => {
          // For main thread builds, mark complete immediately
          // Worker pool builds complete when all pending jobs finish
          if (state.pendingJobs.size === 0) {
            setComputingState(false);
          }
        });
      }, debounceMs);

      return result;
    };
  };
}

// ─── Exports ─────────────────────────────────────────────────────────────────

/**
 * Get solver metrics for debugging/monitoring.
 */
export function getSolverMetrics(): SolverMetrics {
  return { ...state.metrics };
}

/**
 * Get current solver state for debugging.
 */
export function getSolverState(): {
  generationId: number;
  poolReady: boolean;
  pendingJobs: number;
  debounceMs: number;
} {
  return {
    generationId: state.generationId,
    poolReady: state.poolReady,
    pendingJobs: state.pendingJobs.size,
    debounceMs: calculateDebounceMs(),
  };
}

/**
 * Manually trigger pool warmup.
 */
export async function warmupSolver(): Promise<void> {
  await initializePool();
  if (state.pool) {
    await state.pool.warmup();
  }
}

/**
 * Shutdown the solver (for cleanup).
 */
export function shutdownSolver(): void {
  if (state.debounceTimer) {
    clearTimeout(state.debounceTimer);
    state.debounceTimer = null;
  }

  if (state.pool) {
    state.pool.terminate();
    state.pool = null;
    state.poolReady = false;
  }

  state.pendingJobs.clear();
  storeDispatch = null;
}
