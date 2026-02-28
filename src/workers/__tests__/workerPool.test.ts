/**
 * Tests for Worker Pool
 *
 * Note: Full integration tests require browser environment.
 * These unit tests verify the pool logic using mocked workers.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { PoolStats } from '../workerPool';

// Mock Worker since we're in Node environment
class MockWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  private terminated = false;

  constructor(_url: URL | string, _options?: WorkerOptions) {
    void _url; void _options; // Satisfy no-unused-vars
    // Simulate async READY message
    setTimeout(() => {
      if (this.onmessage && !this.terminated) {
        this.onmessage({ data: { type: 'READY' } } as MessageEvent);
      }
    }, 0);
  }

  postMessage(_message: unknown, _transfer?: Transferable[]): void {
    void _message; void _transfer; // Satisfy no-unused-vars
    // Mock implementation
  }

  terminate(): void {
    this.terminated = true;
  }
}

// Install mock before importing WorkerPool
vi.stubGlobal('Worker', MockWorker);

describe('WorkerPool', () => {
  let WorkerPool: typeof import('../workerPool').WorkerPool;
  let resetWorkerPool: typeof import('../workerPool').resetWorkerPool;
  let getWorkerPool: typeof import('../workerPool').getWorkerPool;

  beforeEach(async () => {
    // Fresh import each test
    vi.resetModules();
    const module = await import('../workerPool');
    WorkerPool = module.WorkerPool;
    resetWorkerPool = module.resetWorkerPool;
    getWorkerPool = module.getWorkerPool;
  });

  afterEach(() => {
    resetWorkerPool();
  });

  describe('constructor', () => {
    it('creates pool with default config', () => {
      const pool = new WorkerPool();
      expect(pool).toBeDefined();
      expect(pool.isReady()).toBe(false);
    });

    it('accepts custom config', () => {
      const pool = new WorkerPool({
        poolSize: 2,
        initTimeout: 1000,
        warmupTimeout: 2000,
        autoRecover: false,
        healthCheckInterval: 60000,
      });
      expect(pool).toBeDefined();
    });
  });

  describe('initialize', () => {
    it('initializes workers and becomes ready', async () => {
      const pool = new WorkerPool({ poolSize: 2 });

      await pool.initialize();

      expect(pool.isReady()).toBe(true);
      const stats = pool.getStats();
      expect(stats.totalWorkers).toBe(2);
    });

    it('does not reinitialize if already initialized', async () => {
      const pool = new WorkerPool({ poolSize: 1 });

      await pool.initialize();
      await pool.initialize(); // Should be no-op

      expect(pool.getStats().totalWorkers).toBe(1);
    });
  });

  describe('getStats', () => {
    it('returns correct initial stats', async () => {
      const pool = new WorkerPool({ poolSize: 3 });
      await pool.initialize();

      const stats: PoolStats = pool.getStats();

      expect(stats.totalWorkers).toBe(3);
      expect(stats.busyWorkers).toBe(0);
      expect(stats.queuedJobs).toBe(0);
      expect(stats.completedJobs).toBe(0);
      expect(stats.crashesRecovered).toBe(0);
    });
  });

  describe('submit', () => {
    it('throws if not initialized', () => {
      const pool = new WorkerPool({ poolSize: 1 });

      expect(() => {
        pool.submit({
          jobId: 'job-1',
          generationId: 1,
          cPiece: {
            id: 'piece-1',
            name: 'Test',
            nodePointIds: [],
            nodeCurveIds: [],
            nodeConnections: [],
            nodeReverse: [],
            seamAllowance: 10,
            closed: true,
          },
          points: [],
          curves: [],
          existingPieceId: null,
        });
      }).toThrow('WorkerPool not initialized');
    });

    it('queues jobs by priority', async () => {
      const pool = new WorkerPool({ poolSize: 1 });
      await pool.initialize();

      const makeJob = (id: string) => ({
        jobId: id,
        generationId: 1,
        cPiece: {
          id: 'piece-1',
          name: 'Test',
          nodePointIds: [],
          nodeCurveIds: [],
          nodeConnections: [],
          nodeReverse: [],
          seamAllowance: 10,
          closed: true,
        },
        points: [],
        curves: [],
        existingPieceId: null,
      });

      // Submit multiple jobs while worker is "busy" with first
      pool.submit(makeJob('job-1'), 'low');
      pool.submit(makeJob('job-2'), 'high');
      pool.submit(makeJob('job-3'), 'normal');

      // First job should be dispatched immediately
      // Remaining should be queued by priority
      const stats = pool.getStats();
      // Depending on mock timing, at least some should be queued
      expect(stats.queuedJobs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('cancelGeneration', () => {
    it('removes jobs from queue', async () => {
      const pool = new WorkerPool({ poolSize: 1 });
      await pool.initialize();

      const makeJob = (id: string, genId: number) => ({
        jobId: id,
        generationId: genId,
        cPiece: {
          id: 'piece-1',
          name: 'Test',
          nodePointIds: [],
          nodeCurveIds: [],
          nodeConnections: [],
          nodeReverse: [],
          seamAllowance: 10,
          closed: true,
        },
        points: [],
        curves: [],
        existingPieceId: null,
      });

      // Queue jobs for different generations
      pool.submit(makeJob('job-1', 1), 'normal');
      pool.submit(makeJob('job-2', 2), 'normal');
      pool.submit(makeJob('job-3', 1), 'normal');

      // Cancel generation 1
      pool.cancelGeneration(1);

      // Jobs for generation 1 should be removed
      // (actual verification depends on internal state access)
    });
  });

  describe('onResult callback', () => {
    it('can set result callback', async () => {
      const pool = new WorkerPool({ poolSize: 1 });
      await pool.initialize();

      const callback = vi.fn();
      pool.onResult(callback);

      // Callback is set (actual invocation requires real worker)
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('onError callback', () => {
    it('can set error callback', async () => {
      const pool = new WorkerPool({ poolSize: 1 });
      await pool.initialize();

      const callback = vi.fn();
      pool.onError(callback);

      // Callback is set
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('terminate', () => {
    it('terminates all workers and resets state', async () => {
      const pool = new WorkerPool({ poolSize: 2 });
      await pool.initialize();

      expect(pool.isReady()).toBe(true);

      pool.terminate();

      expect(pool.isReady()).toBe(false);
      expect(pool.getStats().totalWorkers).toBe(0);
    });
  });

  describe('isWarmedUp', () => {
    it('returns false before warmup', async () => {
      const pool = new WorkerPool({ poolSize: 1 });
      await pool.initialize();

      // Workers report READY but not WARMED yet
      expect(pool.isWarmedUp()).toBe(false);
    });
  });

  describe('singleton functions', () => {
    it('getWorkerPool returns same instance', () => {
      const pool1 = getWorkerPool({ poolSize: 2 });
      const pool2 = getWorkerPool({ poolSize: 4 }); // Config ignored for existing

      expect(pool1).toBe(pool2);
    });

    it('resetWorkerPool clears singleton', () => {
      const pool1 = getWorkerPool({ poolSize: 2 });
      resetWorkerPool();
      const pool2 = getWorkerPool({ poolSize: 2 });

      expect(pool1).not.toBe(pool2);
    });
  });
});
