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
  private readyReject: ((e: Error) => void) | null = null;

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
    meshData: { vertices: Float32Array; triIds: Int32Array },
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
      err.preventDefault();
      const msg = err.message || 'Cloth worker crashed';
      this.readyReject?.(new Error(msg));
      this.readyReject = null;
      this.readyResolve = null;
      this.onError?.(msg);
    };

    // Wait for 'ready' message
    return new Promise<void>((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
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
    pieces: Array<{ pieceId: string; vertices: Float32Array; triIds: Int32Array; outline: Array<{ type: string; values: number[] }>; edges?: Array<{ name: string; segmentRange: [number, number] }>; stiffnessMultiplier?: number; pressurePa?: number; internals?: Array<{ id: string; type: string; path: Array<{ type: string; values: number[] }>; foldOptions?: { direction: string; creaseAngleDeg: number; pleatId?: string } }> }>,
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
      err.preventDefault();
      const msg = err.message || 'Cloth worker crashed';
      this.readyReject?.(new Error(msg));
      this.readyReject = null;
      this.readyResolve = null;
      this.onError?.(msg);
    };

    return new Promise<void>((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
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
   * Set elastic constraints on the solver.
   *
   * @param elastics - Array of Elastic objects (active ones only)
   */
  setElastics(elastics: import('../../types/types').Elastic[]): void {
    this.postMessage({ type: 'setElastics', elastics } as WorkerInMessage);
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
   * Set triangle collision mesh for body collision.
   */
  setCollisionMesh(mesh: { vertices: Float32Array; normals: Float32Array; triCount: number }): void {
    this.worker?.postMessage(
      { type: 'setCollisionMesh', mesh } as WorkerInMessage,
      [mesh.vertices.buffer, mesh.normals.buffer],
    );
  }

  /**
   * Set all collision bodies at once (replaces any existing bodies).
   */
  setCollisionBodies(bodies: Array<{ id: string; mesh: { vertices: Float32Array; normals: Float32Array; triCount: number }; friction: number; margin: number }>): void {
    const transferables: ArrayBuffer[] = [];
    const payload = bodies.map(b => {
      transferables.push(b.mesh.vertices.buffer, b.mesh.normals.buffer);
      return { id: b.id, mesh: b.mesh, friction: b.friction, margin: b.margin };
    });
    this.worker?.postMessage(
      { type: 'setCollisionBodies', bodies: payload } as WorkerInMessage,
      transferables,
    );
  }

  /**
   * Update a single collision body's mesh and properties.
   */
  updateCollisionBody(body: { id: string; mesh: { vertices: Float32Array; normals: Float32Array; triCount: number }; friction: number; margin: number }): void {
    this.worker?.postMessage(
      { type: 'updateCollisionBody', id: body.id, mesh: body.mesh, friction: body.friction, margin: body.margin } as WorkerInMessage,
      [body.mesh.vertices.buffer, body.mesh.normals.buffer],
    );
  }

  /**
   * Remove a collision body by ID.
   */
  removeCollisionBody(id: string): void {
    this.postMessage({ type: 'removeCollisionBody', id });
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

  /** Callback for snapshot saved confirmation. */
  onSnapshotSaved: ((id: string, particleCount: number) => void) | null = null;

  /** Callback for snapshot restored confirmation. */
  onSnapshotRestored: ((id: string) => void) | null = null;

  /** Callback for snapshot deleted confirmation. */
  onSnapshotDeleted: ((id: string) => void) | null = null;

  /** Called when constraints have been updated. */
  onConstraintsUpdated: (() => void) | null = null;

  /**
   * Save current particle positions as a named snapshot in the worker.
   */
  saveSnapshot(id: string): void {
    this.postMessage({ type: 'saveSnapshot', id });
  }

  /**
   * Restore particle positions from a previously saved snapshot.
   */
  restoreSnapshot(id: string): void {
    this.postMessage({ type: 'restoreSnapshot', id });
  }

  /**
   * Delete a snapshot from worker memory.
   */
  deleteSnapshot(id: string): void {
    this.postMessage({ type: 'deleteSnapshot', id });
  }

  /**
   * Apply positions for warm-start (after pattern edit, keeps draped state).
   */
  warmStart(positions: Float32Array): void {
    this.postMessage({ type: 'warmStart', positions });
  }

  /**
   * Update stretch constraint rest lengths in-place.
   * Solver continues from current positions with new constraints.
   */
  updateConstraints(restLengths: Float32Array): void {
    this.worker?.postMessage(
      { type: 'updateConstraints', restLengths } as WorkerInMessage,
      [restLengths.buffer],
    );
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
    this.readyReject = null;
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
          this.readyReject = null;
        }
        break;

      case 'frame':
        this.onFrame?.(msg.positions, msg.numParticles, msg.triIds);
        break;

      case 'stopped':
        this.isRunning = false;
        break;

      case 'error':
        this.readyReject?.(new Error(msg.message));
        this.readyReject = null;
        this.readyResolve = null;
        this.onError?.(msg.message);
        break;

      case 'edgeData':
        this.onEdgeData?.(msg.stretchingIds, msg.stretchingLengths);
        break;

      case 'snapshotSaved':
        this.onSnapshotSaved?.(msg.id, msg.particleCount);
        break;

      case 'snapshotRestored':
        this.onSnapshotRestored?.(msg.id);
        break;

      case 'snapshotDeleted':
        this.onSnapshotDeleted?.(msg.id);
        break;

      case 'constraintsUpdated':
        this.onConstraintsUpdated?.();
        break;
    }
  }
}
