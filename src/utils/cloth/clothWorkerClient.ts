/**
 * Cloth Worker Client — Main-thread interface to the cloth simulation Web Worker.
 *
 * Provides a clean API to init, start, stop, and configure the worker-based
 * XPBD cloth solver without blocking the UI thread.
 *
 * @module clothWorkerClient
 */

import type { ClothSimConfig, SphereCollider, CapsuleCollider } from './xpbdSolver';
import type { WorkerInMessage, WorkerOutMessage, SeamInitData } from './clothWorker';
import type { SDFData } from './sdfGenerator';

/**
 * Callback for receiving simulation frames.
 */
export type FrameCallback = (positions: Float32Array, numParticles: number, triIds: Int32Array) => void;

/**
 * Client wrapper around the cloth simulation Web Worker.
 *
 * Usage:
 * ```ts
 * const client = new ClothWorkerClient();
 * client.onFrame = (positions, numParticles, triIds) => { ... };
 * await client.init(meshData);
 * client.start();
 * // later:
 * client.stop();
 * client.dispose();
 * ```
 */
export class ClothWorkerClient {
  private worker: Worker | null = null;
  private readyResolve: (() => void) | null = null;

  /** Called each time the worker produces a new frame. */
  onFrame: FrameCallback | null = null;

  /** Called when the worker reports an error. */
  onError: ((message: string) => void) | null = null;

  /** Whether the simulation is currently running. */
  isRunning = false;

  /**
   * Initialize the worker and load mesh data.
   *
   * @param meshData - Vertices and triangle indices
   * @param config - Optional initial simulation config
   * @returns Promise that resolves when worker is ready
   */
  async init(
    meshData: { vertices: number[]; triIds: number[] },
    config?: Partial<ClothSimConfig>,
  ): Promise<void> {
    this.dispose();

    // Vite Web Worker pattern
    this.worker = new Worker(
      new URL('./clothWorker.ts', import.meta.url),
      { type: 'module' },
    );

    this.worker.onmessage = (event: MessageEvent<WorkerOutMessage>) => {
      this.handleMessage(event.data);
    };

    this.worker.onerror = (err) => {
      this.onError?.(err.message);
    };

    // Wait for 'ready' message
    return new Promise<void>((resolve) => {
      this.readyResolve = resolve;
      this.postMessage({ type: 'init', meshData, config });
    });
  }

  /**
   * Initialize the worker with multiple pieces merged into one solver, plus seam constraints.
   *
   * @param pieces - Array of piece mesh data with outlines
   * @param seams - Seam init data for building constraints
   * @param config - Optional initial simulation config
   * @returns Promise that resolves when worker is ready
   */
  async initMultiPiece(
    pieces: Array<{ pieceId: string; vertices: number[]; triIds: number[]; outline: Array<{ type: string; values: number[] }> }>,
    seams: SeamInitData[],
    config?: Partial<ClothSimConfig>,
  ): Promise<void> {
    this.dispose();

    this.worker = new Worker(
      new URL('./clothWorker.ts', import.meta.url),
      { type: 'module' },
    );

    this.worker.onmessage = (event: MessageEvent<WorkerOutMessage>) => {
      this.handleMessage(event.data);
    };

    this.worker.onerror = (err) => {
      this.onError?.(err.message);
    };

    return new Promise<void>((resolve) => {
      this.readyResolve = resolve;
      this.postMessage({ type: 'initMultiPiece', pieces, seams, config });
    });
  }

  /**
   * Update seam constraints on a running multi-piece solver.
   *
   * @param seams - New seam init data
   */
  setSeams(seams: SeamInitData[]): void {
    this.postMessage({ type: 'setSeams', seams });
  }

  /**
   * Start the simulation loop.
   */
  start(): void {
    this.isRunning = true;
    this.postMessage({ type: 'start' });
  }

  /**
   * Stop the simulation loop.
   */
  stop(): void {
    this.isRunning = false;
    this.postMessage({ type: 'stop' });
  }

  /**
   * Reset particles to initial positions.
   */
  reset(): void {
    this.isRunning = false;
    this.postMessage({ type: 'reset' });
  }

  /**
   * Advance simulation by a single step.
   */
  step(): void {
    this.postMessage({ type: 'step' });
  }

  /**
   * Apply a fabric material preset by ID.
   *
   * @param fabricId - Key from the FABRIC_LIBRARY (e.g. 'silk-charmeuse')
   */
  setFabric(fabricId: string): void {
    this.postMessage({ type: 'setFabric', fabricId });
  }

  /**
   * Update the gravity vector.
   *
   * @param gravity - [x, y, z] in m/s²
   */
  setGravity(gravity: [number, number, number]): void {
    this.postMessage({ type: 'setGravity', gravity });
  }

  /**
   * Update arbitrary simulation config.
   *
   * @param config - Partial configuration to merge
   */
  setConfig(config: Partial<ClothSimConfig>): void {
    this.postMessage({ type: 'setConfig', config });
  }

  /**
   * Update sphere colliders for avatar collision.
   *
   * @param colliders - Array of sphere colliders
   */
  setSphereColliders(colliders: SphereCollider[]): void {
    this.postMessage({ type: 'setSphereColliders', colliders });
  }

  /**
   * Update capsule colliders for avatar collision.
   *
   * @param colliders - Array of capsule colliders
   */
  setCapsuleColliders(colliders: CapsuleCollider[]): void {
    this.postMessage({ type: 'setCapsuleColliders', colliders });
  }

  /**
   * Set SDF data for accurate avatar body collision.
   *
   * @param sdf - Signed distance field data
   */
  setSDF(sdf: SDFData): void {
    this.postMessage({ type: 'setSDF', sdf });
  }

  /**
   * Pin a particle in place.
   *
   * @param index - Particle index
   */
  pinParticle(index: number): void {
    this.postMessage({ type: 'pinParticle', index });
  }

  /**
   * Unpin a particle.
   *
   * @param index - Particle index
   */
  unpinParticle(index: number): void {
    this.postMessage({ type: 'unpinParticle', index });
  }

  /** Callback for edge data response (for fit maps). */
  onEdgeData: ((stretchingIds: Int32Array, stretchingLengths: Float32Array) => void) | null = null;

  /**
   * Request edge constraint data from the worker (for fit map computation).
   * Results arrive asynchronously via onEdgeData callback.
   */
  requestEdgeData(): void {
    this.postMessage({ type: 'getEdgeData' });
  }

  /**
   * Terminate the worker and release resources.
   */
  dispose(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.isRunning = false;
    this.readyResolve = null;
  }

  // ─── Internal ──────────────────────────────────────────────────────────

  private postMessage(msg: WorkerInMessage): void {
    this.worker?.postMessage(msg);
  }

  private handleMessage(msg: WorkerOutMessage): void {
    switch (msg.type) {
      case 'ready':
        if (this.readyResolve) {
          this.readyResolve();
          this.readyResolve = null;
        }
        break;

      case 'frame':
        this.onFrame?.(msg.positions, msg.numParticles, msg.triIds);
        break;

      case 'stopped':
        this.isRunning = false;
        break;

      case 'error':
        this.onError?.(msg.message);
        break;

      case 'edgeData':
        this.onEdgeData?.(msg.stretchingIds, msg.stretchingLengths);
        break;
    }
  }
}
