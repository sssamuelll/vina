/**
 * Worker Pool for Piece Building
 *
 * Manages a pool of Web Workers for parallel piece building operations.
 * Features priority-based job scheduling, cancellation, and crash recovery.
 *
 * @see docs/plans/2026-02-27-reactive-solver-middleware-design.md
 */

import type {
  WorkerResponse,
  BuildPieceJob,
  BuildPieceResult,
  TransferCapabilities,
} from '../types/reactiveSolver';

import type { JobPriority, PriorityQueue } from '../types/reactiveSolver';

import {
  createWarmupCommand,
  createBuildCommand,
  createCancelCommand,
  createPingCommand,
  createTerminateCommand,
  getTransferList,
  isWorkerResponse,
  detectCapabilities,
} from './workerProtocol';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Internal worker wrapper with state tracking */
interface PoolWorker {
  /** The actual Web Worker instance */
  worker: Worker;
  /** Unique worker ID for tracking */
  id: number;
  /** Whether this worker is currently processing a job */
  busy: boolean;
  /** Current job ID being processed (if busy) */
  currentJobId: string | null;
  /** Whether this worker has completed warmup */
  warmedUp: boolean;
  /** Timestamp of last activity (for health checks) */
  lastActivity: number;
}

/** Job in the priority queue */
interface QueuedJob {
  job: BuildPieceJob;
  priority: JobPriority;
  transferList?: Transferable[];
}

/** Pool configuration options */
export interface WorkerPoolConfig {
  /** Number of workers to spawn (default: navigator.hardwareConcurrency) */
  poolSize?: number;
  /** Timeout for worker initialization in ms (default: 5000) */
  initTimeout?: number;
  /** Timeout for warmup in ms (default: 10000) */
  warmupTimeout?: number;
  /** Enable automatic crash recovery (default: true) */
  autoRecover?: boolean;
  /** Health check interval in ms (default: 30000) */
  healthCheckInterval?: number;
}

/** Pool statistics */
export interface PoolStats {
  /** Total workers in pool */
  totalWorkers: number;
  /** Workers currently processing jobs */
  busyWorkers: number;
  /** Workers completed warmup */
  warmedUpWorkers: number;
  /** Jobs waiting in queue */
  queuedJobs: number;
  /** Jobs completed since initialization */
  completedJobs: number;
  /** Worker crashes recovered */
  crashesRecovered: number;
}

// ─── Worker Pool Class ───────────────────────────────────────────────────────

export class WorkerPool {
  private workers: PoolWorker[] = [];
  private jobQueue: PriorityQueue<QueuedJob> = { high: [], normal: [], low: [] };
  private nextWorkerId = 0;
  private initialized = false;
  private initializing = false;
  private capabilities: TransferCapabilities;
  private config: Required<WorkerPoolConfig>;

  // Callbacks
  private onResultCallback: ((result: BuildPieceResult) => void) | null = null;
  private onErrorCallback: ((error: string, jobId?: string) => void) | null = null;

  // Statistics
  private completedJobs = 0;
  private crashesRecovered = 0;

  // Health check
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: WorkerPoolConfig = {}) {
    this.capabilities = detectCapabilities();

    this.config = {
      poolSize: config.poolSize ?? this.capabilities.hardwareConcurrency,
      initTimeout: config.initTimeout ?? 5000,
      warmupTimeout: config.warmupTimeout ?? 10000,
      autoRecover: config.autoRecover ?? true,
      healthCheckInterval: config.healthCheckInterval ?? 30000,
    };
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  /**
   * Initialize the worker pool.
   * Spawns workers and waits for all to report READY.
   */
  async initialize(): Promise<void> {
    if (this.initialized || this.initializing) {
      return;
    }

    this.initializing = true;

    try {
      // Spawn workers
      const readyPromises: Promise<void>[] = [];

      for (let i = 0; i < this.config.poolSize; i++) {
        const poolWorker = this.spawnWorker();
        this.workers.push(poolWorker);
        readyPromises.push(this.waitForReady(poolWorker));
      }

      // Wait for all workers to be ready with timeout
      await Promise.race([
        Promise.all(readyPromises),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Worker initialization timeout')), this.config.initTimeout)
        ),
      ]);

      // Start health check
      this.startHealthCheck();

      this.initialized = true;
    } finally {
      this.initializing = false;
    }
  }

  /**
   * Warmup all workers by pre-importing dependencies.
   */
  async warmup(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    const warmupPromises = this.workers
      .filter(w => !w.warmedUp)
      .map(w => this.warmupWorker(w));

    await Promise.race([
      Promise.all(warmupPromises),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Worker warmup timeout')), this.config.warmupTimeout)
      ),
    ]);
  }

  /**
   * Terminate all workers and clean up.
   */
  terminate(): void {
    this.stopHealthCheck();

    for (const poolWorker of this.workers) {
      poolWorker.worker.postMessage(createTerminateCommand());
      poolWorker.worker.terminate();
    }

    this.workers = [];
    this.jobQueue = { high: [], normal: [], low: [] };
    this.initialized = false;
  }

  // ─── Job Submission ────────────────────────────────────────────────────────

  /**
   * Submit a job to the pool.
   * Jobs are queued by priority and dispatched to available workers.
   */
  submit(
    job: BuildPieceJob,
    priority: JobPriority = 'normal',
    transferList?: Transferable[]
  ): void {
    if (!this.initialized) {
      throw new Error('WorkerPool not initialized. Call initialize() first.');
    }

    // Add to priority queue
    this.jobQueue[priority].push({ job, priority, transferList });

    // Try to dispatch immediately
    this.dispatch();
  }

  /**
   * Cancel all jobs for a generation.
   * Removes pending jobs from queue and notifies busy workers.
   */
  cancelGeneration(generationId: number): void {
    // Remove from queues
    for (const priority of ['high', 'normal', 'low'] as const) {
      this.jobQueue[priority] = this.jobQueue[priority].filter(
        qj => qj.job.generationId !== generationId
      );
    }

    // Notify busy workers
    for (const poolWorker of this.workers) {
      if (poolWorker.busy) {
        poolWorker.worker.postMessage(createCancelCommand(generationId));
      }
    }
  }

  // ─── Callbacks ─────────────────────────────────────────────────────────────

  /**
   * Set callback for job results.
   */
  onResult(callback: (result: BuildPieceResult) => void): void {
    this.onResultCallback = callback;
  }

  /**
   * Set callback for errors.
   */
  onError(callback: (error: string, jobId?: string) => void): void {
    this.onErrorCallback = callback;
  }

  // ─── Statistics ────────────────────────────────────────────────────────────

  /**
   * Get pool statistics.
   */
  getStats(): PoolStats {
    const queuedJobs =
      this.jobQueue.high.length +
      this.jobQueue.normal.length +
      this.jobQueue.low.length;

    return {
      totalWorkers: this.workers.length,
      busyWorkers: this.workers.filter(w => w.busy).length,
      warmedUpWorkers: this.workers.filter(w => w.warmedUp).length,
      queuedJobs,
      completedJobs: this.completedJobs,
      crashesRecovered: this.crashesRecovered,
    };
  }

  /**
   * Check if pool is ready to accept jobs.
   */
  isReady(): boolean {
    return this.initialized;
  }

  /**
   * Check if pool is fully warmed up.
   */
  isWarmedUp(): boolean {
    return this.initialized && this.workers.every(w => w.warmedUp);
  }

  // ─── Private: Worker Management ────────────────────────────────────────────

  /**
   * Spawn a new worker.
   */
  private spawnWorker(): PoolWorker {
    const id = this.nextWorkerId++;

    // Create worker using Vite's worker import syntax
    const worker = new Worker(
      new URL('./pieceBuilderWorker.ts', import.meta.url),
      { type: 'module' }
    );

    const poolWorker: PoolWorker = {
      worker,
      id,
      busy: false,
      currentJobId: null,
      warmedUp: false,
      lastActivity: Date.now(),
    };

    // Set up message handler
    worker.onmessage = (event: MessageEvent) => {
      this.handleWorkerMessage(poolWorker, event.data);
    };

    // Set up error handler
    worker.onerror = (event: ErrorEvent) => {
      this.handleWorkerError(poolWorker, event);
    };

    return poolWorker;
  }

  /**
   * Wait for a worker to report READY.
   */
  private waitForReady(poolWorker: PoolWorker): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Worker ${poolWorker.id} did not report READY`));
      }, this.config.initTimeout);

      const originalHandler = poolWorker.worker.onmessage;
      poolWorker.worker.onmessage = (event: MessageEvent) => {
        if (isWorkerResponse(event.data) && event.data.type === 'READY') {
          clearTimeout(timeout);
          poolWorker.worker.onmessage = originalHandler;
          resolve();
        }
        // Forward to original handler
        if (originalHandler) {
          originalHandler.call(poolWorker.worker, event);
        }
      };
    });
  }

  /**
   * Warmup a single worker.
   */
  private warmupWorker(poolWorker: PoolWorker): Promise<void> {
    return new Promise((resolve) => {
      // If already warmed up, resolve immediately
      if (poolWorker.warmedUp) {
        resolve();
        return;
      }

      const originalHandler = poolWorker.worker.onmessage;
      poolWorker.worker.onmessage = (event: MessageEvent) => {
        if (isWorkerResponse(event.data) && event.data.type === 'WARMED') {
          poolWorker.warmedUp = true;
          poolWorker.worker.onmessage = originalHandler;
          resolve();
        }
        // Forward to original handler
        if (originalHandler) {
          originalHandler.call(poolWorker.worker, event);
        }
      };

      poolWorker.worker.postMessage(createWarmupCommand());
    });
  }

  /**
   * Handle message from a worker.
   */
  private handleWorkerMessage(poolWorker: PoolWorker, data: unknown): void {
    poolWorker.lastActivity = Date.now();

    if (!isWorkerResponse(data)) {
      return;
    }

    const response = data as WorkerResponse;

    switch (response.type) {
      case 'RESULT': {
        const result = response.result;
        poolWorker.busy = false;
        poolWorker.currentJobId = null;
        this.completedJobs++;

        // Warmup completes on first successful build too
        if (!poolWorker.warmedUp) {
          poolWorker.warmedUp = true;
        }

        if (this.onResultCallback) {
          this.onResultCallback(result);
        }

        // Dispatch next job
        this.dispatch();
        break;
      }

      case 'ERROR': {
        poolWorker.busy = false;
        poolWorker.currentJobId = null;

        if (this.onErrorCallback) {
          this.onErrorCallback(response.error, response.jobId);
        }

        // Dispatch next job
        this.dispatch();
        break;
      }

      case 'READY':
      case 'WARMED':
      case 'PONG':
        // Handled by waitForReady/warmupWorker/healthCheck
        break;
    }
  }

  /**
   * Handle worker error (crash).
   */
  private handleWorkerError(poolWorker: PoolWorker, event: ErrorEvent): void {
    console.error(`[WorkerPool] Worker ${poolWorker.id} crashed:`, event.message);

    // Mark as not busy
    const currentJobId = poolWorker.currentJobId;
    poolWorker.busy = false;
    poolWorker.currentJobId = null;

    // Report error
    if (this.onErrorCallback && currentJobId) {
      this.onErrorCallback(`Worker crashed: ${event.message}`, currentJobId);
    }

    // Auto-recover if enabled
    if (this.config.autoRecover) {
      this.replaceWorker(poolWorker);
    }
  }

  /**
   * Replace a crashed worker with a new one.
   */
  private replaceWorker(oldWorker: PoolWorker): void {
    // Terminate old worker
    oldWorker.worker.terminate();

    // Remove from pool
    const index = this.workers.indexOf(oldWorker);
    if (index !== -1) {
      this.workers.splice(index, 1);
    }

    // Spawn new worker
    const newWorker = this.spawnWorker();
    this.workers.push(newWorker);
    this.crashesRecovered++;

    // Wait for ready then dispatch
    this.waitForReady(newWorker).then(() => {
      this.dispatch();
    }).catch((error) => {
      console.error('[WorkerPool] Failed to recover worker:', error);
    });
  }

  // ─── Private: Job Dispatch ─────────────────────────────────────────────────

  /**
   * Dispatch jobs to available workers.
   * Prioritizes: high > normal > low
   */
  private dispatch(): void {
    // Find available workers
    const availableWorkers = this.workers.filter(w => !w.busy);

    if (availableWorkers.length === 0) {
      return;
    }

    // Get next job by priority
    for (const priority of ['high', 'normal', 'low'] as const) {
      while (availableWorkers.length > 0 && this.jobQueue[priority].length > 0) {
        const worker = availableWorkers.shift()!;
        const queuedJob = this.jobQueue[priority].shift()!;

        this.assignJob(worker, queuedJob);
      }
    }
  }

  /**
   * Assign a job to a worker.
   */
  private assignJob(poolWorker: PoolWorker, queuedJob: QueuedJob): void {
    poolWorker.busy = true;
    poolWorker.currentJobId = queuedJob.job.jobId;
    poolWorker.lastActivity = Date.now();

    const command = createBuildCommand(queuedJob.job);
    const transferList = queuedJob.transferList || getTransferList(queuedJob.job.pointsBuffer);

    poolWorker.worker.postMessage(command, transferList);
  }

  // ─── Private: Health Check ─────────────────────────────────────────────────

  /**
   * Start periodic health checks.
   */
  private startHealthCheck(): void {
    if (this.healthCheckTimer) {
      return;
    }

    this.healthCheckTimer = setInterval(() => {
      this.performHealthCheck();
    }, this.config.healthCheckInterval);
  }

  /**
   * Stop health checks.
   */
  private stopHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  /**
   * Perform health check on all workers.
   */
  private performHealthCheck(): void {
    const now = Date.now();
    const staleThreshold = this.config.healthCheckInterval * 2;

    for (const poolWorker of this.workers) {
      // Skip busy workers - they'll respond when done
      if (poolWorker.busy) {
        continue;
      }

      // Check if worker is stale
      if (now - poolWorker.lastActivity > staleThreshold) {
        // Send ping to verify worker is alive
        poolWorker.worker.postMessage(createPingCommand());
      }
    }
  }
}

// ─── Singleton Instance ──────────────────────────────────────────────────────

let poolInstance: WorkerPool | null = null;

/**
 * Get the singleton worker pool instance.
 */
export function getWorkerPool(config?: WorkerPoolConfig): WorkerPool {
  if (!poolInstance) {
    poolInstance = new WorkerPool(config);
  }
  return poolInstance;
}

/**
 * Reset the singleton instance (for testing).
 */
export function resetWorkerPool(): void {
  if (poolInstance) {
    poolInstance.terminate();
    poolInstance = null;
  }
}
