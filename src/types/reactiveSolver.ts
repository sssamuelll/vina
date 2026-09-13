/**
 * Reactive Solver Middleware Types
 *
 * Types for the Worker Pool + Adaptive Transfer architecture that enables
 * real-time parametric pattern updates without blocking the main thread.
 *
 * @see docs/plans/2026-02-27-reactive-solver-middleware-design.md
 */

import type { CPoint, CCurve, CPiece, CurveDefinition } from './construction';
import type { PathCommand } from './types';

// ─── Transfer Strategy ───────────────────────────────────────────────────────

/** Available data transfer strategies between main thread and workers */
export type TransferStrategy =
  | 'sharedArrayBuffer'   // Fastest: same-origin, requires COOP/COEP headers
  | 'transferable'        // Fast: zero-copy ArrayBuffer transfer for large data
  | 'structuredClone'     // Simple: automatic serialization, good for small data
  | 'mainThread';         // Fallback: no Worker support, run synchronously

/** Detected browser capabilities for transfer optimization */
export interface TransferCapabilities {
  /** SharedArrayBuffer available (requires crossOriginIsolated) */
  sharedArrayBuffer: boolean;
  /** Transferable ArrayBuffers supported */
  transferable: boolean;
  /** Web Workers supported */
  workerSupport: boolean;
  /** Number of logical CPU cores */
  hardwareConcurrency: number;
}

// ─── Thresholds ──────────────────────────────────────────────────────────────

/** Point count above which Transferable ArrayBuffers are used */
export const TRANSFERABLE_THRESHOLD = 200;

/** Point count above which SharedArrayBuffer is used (if available) */
export const SHARED_BUFFER_THRESHOLD = 500;

// ─── Serialized Types (JSON-safe, no circular references) ───────────────────

/** Serialized CPoint for worker transfer */
export interface CPointSerialized {
  id: string;
  label: string;
  x: number;
  y: number;
}

/** Serialized CCurve for worker transfer */
export interface CCurveSerialized {
  id: string;
  label: string;
  definition: CurveDefinition;
  resolvedCommands?: PathCommandSerialized[];
}

/** Serialized PathCommand for worker transfer */
export interface PathCommandSerialized {
  type: 'M' | 'L' | 'C' | 'Q' | 'Z';
  values: number[];
  authoredAnchor?: true;
  manualBezier?: true;
}

/** Serialized CPiece - flattened structure without complex references */
export interface CPieceSerialized {
  id: string;
  name: string;
  /** Point IDs in order (from PieceNode[]) */
  nodePointIds: string[];
  /** Curve IDs parallel to nodePointIds (null if connection is 'line') */
  nodeCurveIds: (string | null)[];
  /** Connection types parallel to nodePointIds */
  nodeConnections: ('line' | 'curve')[];
  /** Reverse flags parallel to nodePointIds */
  nodeReverse: boolean[];
  seamAllowance: number;
  closed: boolean;
}

// ─── Job Types ───────────────────────────────────────────────────────────────

/** Job priority for the dispatcher queue */
export type JobPriority = 'high' | 'normal' | 'low';

/** A piece building job to be executed by a worker */
export interface BuildPieceJob {
  /** Unique job identifier */
  jobId: string;
  /** Generation counter - increments on each input change, used for stale detection */
  generationId: number;
  /** Serialized piece definition */
  cPiece: CPieceSerialized;
  /** Points as JSON (for small datasets, structuredClone strategy) */
  points: CPointSerialized[];
  /** Points as ArrayBuffer (for large datasets, transferable strategy) */
  pointsBuffer?: ArrayBuffer;
  /** Points as SharedArrayBuffer (for very large datasets, if available) */
  pointsShared?: SharedArrayBuffer;
  /** Point IDs array (parallel to buffer data) */
  pointIds?: string[];
  /** Curves serialized */
  curves: CCurveSerialized[];
  /** Existing piece ID for upsert behavior (preserves seams) */
  existingPieceId: string | null;
}

/** Result from a worker after building a piece */
export interface BuildPieceResult {
  /** Original job ID */
  jobId: string;
  /** Generation ID from the job (for stale detection) */
  generationId: number;
  /** Resulting pattern piece ID */
  pieceId: string;
  /** Original construction piece ID (for identity mapping) */
  cPieceId: string;
  /** Built outline as PathCommands */
  outline: PathCommandSerialized[];
  /** Computed position (after normalization) */
  position: { x: number; y: number };
  /** Whether build succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Performance metrics for adaptive scheduling */
  metrics: {
    /** Time to build this piece in ms */
    computeTimeMs: number;
    /** Number of points processed */
    pointCount: number;
    /** Number of curves processed */
    curveCount: number;
  };
}

// ─── Worker Protocol ─────────────────────────────────────────────────────────

/** Commands sent from main thread to worker */
export type WorkerCommand =
  | { type: 'BUILD'; job: BuildPieceJob }
  | { type: 'CANCEL'; generationId: number }
  | { type: 'WARMUP' }
  | { type: 'PING' }
  | { type: 'TERMINATE' };

/** Responses sent from worker to main thread */
export type WorkerResponse =
  | { type: 'RESULT'; result: BuildPieceResult }
  | { type: 'READY' }
  | { type: 'WARMED' }
  | { type: 'PONG' }
  | { type: 'ERROR'; error: string; jobId?: string };

// ─── Priority Queue ──────────────────────────────────────────────────────────

/** Priority queue for job scheduling */
export interface PriorityQueue<T> {
  /** Selected piece - highest priority */
  high: T[];
  /** Visible pieces - normal priority */
  normal: T[];
  /** Off-screen pieces - lowest priority */
  low: T[];
}

// ─── Middleware State ────────────────────────────────────────────────────────

/** Internal state of the reactive solver middleware */
export interface ReactiveSolverState {
  /** Current generation ID (increments on each input change) */
  currentGenerationId: number;
  /** Rolling average of compute times for adaptive debounce */
  lastComputeTimeMs: number;
  /** Number of jobs currently pending/in-progress */
  pendingJobs: number;
  /** Detected browser capabilities */
  capabilities: TransferCapabilities;
  /** Currently selected transfer strategy */
  strategy: TransferStrategy;
  /** Whether the worker pool is initialized */
  initialized: boolean;
  /** Whether warmup is complete */
  warmedUp: boolean;
}

// ─── Metrics ─────────────────────────────────────────────────────────────────

/** Solver metrics for monitoring and debugging */
export interface SolverMetrics {
  /** Total number of resolve operations */
  totalResolves: number;
  /** Rolling window of compute times (last 100) */
  computeTimes: number[];
  /** Number of cancelled jobs */
  cancelledJobs: number;
  /** Count of each strategy used */
  strategyUsage: Record<TransferStrategy, number>;
  /** Recent errors (last 10) */
  errors: string[];
  /** Timestamp of last resolve */
  lastResolveTimestamp: number;
}

/** Computed metrics summary */
export interface SolverMetricsSummary {
  /** Average compute time in ms */
  averageComputeTimeMs: number;
  /** 95th percentile compute time in ms */
  p95ComputeTimeMs: number;
  /** Success rate (0-1) */
  successRate: number;
  /** Most frequently used strategy */
  preferredStrategy: TransferStrategy;
}

// ─── Actions ─────────────────────────────────────────────────────────────────

/** Actions dispatched by the reactive solver middleware */
export interface ReactiveSolverActions {
  /** Request worker pool warmup */
  warmup: { type: 'reactiveSolver/warmup' };
  /** Set resolver enabled/disabled */
  setEnabled: { type: 'reactiveSolver/setEnabled'; payload: boolean };
  /** Internal: update metrics */
  updateMetrics: { type: 'reactiveSolver/updateMetrics'; payload: Partial<SolverMetrics> };
}

// ─── Utility Types ───────────────────────────────────────────────────────────

/** Serialization helpers */
export interface SerializationHelpers {
  serializePoint: (point: CPoint) => CPointSerialized;
  serializeCurve: (curve: CCurve) => CCurveSerialized;
  serializePiece: (piece: CPiece) => CPieceSerialized;
  deserializeOutline: (commands: PathCommandSerialized[]) => PathCommand[];
}

/** Encoding result for transferable points */
export interface EncodedPoints {
  /** Float64Array with [x0, y0, x1, y1, ...] layout */
  coords: Float64Array;
  /** Point IDs in parallel order */
  ids: string[];
}

// ─── Feature Flag ────────────────────────────────────────────────────────────

/** Environment variable for feature flag */
export const REACTIVE_SOLVER_FEATURE_FLAG = 'VITE_ENABLE_REACTIVE_SOLVER';

/** Check if reactive solver is enabled */
export function isReactiveSolverEnabled(): boolean {
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    return import.meta.env[REACTIVE_SOLVER_FEATURE_FLAG] !== 'false';
  }
  return true; // Default enabled in development
}
