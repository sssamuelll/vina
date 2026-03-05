/**
 * Wasm Solver Client — bridges the Rust XPBD Wasm solver via Web Worker.
 *
 * Drop-in replacement for ClothWorkerClient and GpuSolverClient.
 * All heavy work (Wasm loading, constraint extraction, simulation loop)
 * runs in a dedicated Web Worker — never blocks the main thread.
 *
 * @module wasmSolverClient
 */

import type { SDFData } from '../sdfGenerator';
import type { SeamInitData } from '../clothWorker';

export interface PieceMeshData {
  pieceId: string;
  vertices: Float32Array;
  triIds: Int32Array | number[];
  outline?: Array<{ type: string; values: number[] }>;
  /** UV coordinates [u0,v0, u1,v1, ...] for anisotropic stretch */
  uvs?: Float32Array;
}

export interface WasmSolverConfig {
  substeps?: number;
  damping?: number;
  gravityY?: number;
  stretchCompliance?: number;
  bendCompliance?: number;
  selfCollision?: boolean;
  thickness?: number;
  collisionMargin?: number;
  groundY?: number;
  dragCoefficient?: number;
  /** Stretch compliance for WARP (vertical) edges */
  stretchComplianceWarp?: number;
  /** Stretch compliance for WEFT (horizontal) edges */
  stretchComplianceWeft?: number;
  /** Stretch compliance for SHEAR (diagonal) edges */
  stretchComplianceShear?: number;
}

export class WasmSolverClient {
  private worker: Worker | null = null;
  private readyResolve: (() => void) | null = null;
  private readyReject: ((e: Error) => void) | null = null;

  onFrame?: (positions: Float32Array) => void;
  onReady?: () => void;
  onError?: (error: string) => void;
  onSnapshotSaved?: (id: string, particleCount: number) => void;
  onSnapshotRestored?: (id: string) => void;
  onSnapshotDeleted?: (id: string) => void;
  onConstraintsUpdated?: () => void;

  /**
   * Initialize with merged multi-piece mesh data and seam connections.
   * @param pieces Array of piece mesh data
   * @param seams Array of seam connection data
   * @param config Optional solver configuration (includes dragCoefficient)
   */
  async initMultiPiece(
    pieces: PieceMeshData[],
    seams: SeamInitData[] = [],
    config?: WasmSolverConfig,
  ): Promise<void> {
    this.dispose();

    try {
      this.worker = new Worker(
        new URL('./wasmSolverWorker.ts', import.meta.url),
        { type: 'module' },
      );
    } catch {
      throw new Error('Wasm solver worker not available');
    }

    this.worker.addEventListener('message', this.handleMessage);
    this.worker.addEventListener('error', (e) => {
      const msg = e.message || 'Wasm worker crashed';
      this.readyReject?.(new Error(msg));
      this.readyReject = null;
      this.readyResolve = null;
      this.onError?.(msg);
    });

    const baseUrl = import.meta.env.BASE_URL ?? '/';

    return new Promise<void>((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
      this.worker!.postMessage({
        type: 'init',
        baseUrl,
        pieces,
        seams,
        config,
      });
    });
  }

  setSDF(sdf: SDFData): void {
    this.worker?.postMessage({ type: 'setSDF', sdf });
  }

  /**
   * Apply initial collision pass to push all particles outside the body.
   * Call this AFTER setSDF() and BEFORE start() to prevent explosion.
   */
  applyInitialCollision(): void {
    this.worker?.postMessage({ type: 'applyInitialCollision' });
  }

  /**
   * Set pinned vertices with target positions.
   * @param pins Array of { vertexIndex, position: [x, y, z] }
   */
  setPins(pins: Array<{ vertexIndex: number; position: [number, number, number] }>): void {
    if (!this.worker || pins.length === 0) {
      if (this.worker && pins.length === 0) {
        this.worker.postMessage({ type: 'clearPins' });
      }
      return;
    }

    const indices = new Uint32Array(pins.length);
    const positions = new Float32Array(pins.length * 3);

    for (let i = 0; i < pins.length; i++) {
      indices[i] = pins[i].vertexIndex;
      positions[i * 3] = pins[i].position[0];
      positions[i * 3 + 1] = pins[i].position[1];
      positions[i * 3 + 2] = pins[i].position[2];
    }

    this.worker.postMessage({
      type: 'setPins',
      indices: Array.from(indices),
      positions: Array.from(positions),
    });
  }

  /**
   * Clear all pinned vertices.
   */
  clearPins(): void {
    this.worker?.postMessage({ type: 'clearPins' });
  }

  /**
   * Save current particle positions as a named snapshot in the worker.
   */
  saveSnapshot(id: string): void {
    this.worker?.postMessage({ type: 'saveSnapshot', id });
  }

  /**
   * Restore particle positions from a previously saved snapshot.
   */
  restoreSnapshot(id: string): void {
    this.worker?.postMessage({ type: 'restoreSnapshot', id });
  }

  /**
   * Delete a snapshot from worker memory.
   */
  deleteSnapshot(id: string): void {
    this.worker?.postMessage({ type: 'deleteSnapshot', id });
  }

  /**
   * Apply positions for warm-start (after pattern edit, keeps draped state).
   */
  warmStart(positions: Float32Array): void {
    this.worker?.postMessage({ type: 'warmStart', positions });
  }

  /**
   * Update stretch constraint rest lengths in-place.
   * Solver continues from current positions with new constraints.
   */
  updateConstraints(restLengths: Float32Array): void {
    this.worker?.postMessage(
      { type: 'updateConstraints', restLengths },
      [restLengths.buffer],
    );
  }

  start(): void {
    this.worker?.postMessage({ type: 'start' });
  }

  stop(): void {
    this.worker?.postMessage({ type: 'stop' });
  }

  dispose(): void {
    if (this.worker) {
      this.worker.postMessage({ type: 'dispose' });
      this.worker.terminate();
      this.worker = null;
    }
    this.readyResolve = null;
    this.readyReject = null;
  }

  private handleMessage = (event: MessageEvent): void => {
    const msg = event.data;
    switch (msg.type) {
      case 'ready':
        console.log('[WasmSolver] Initialized in worker:', { particles: msg.numParticles });
        this.readyResolve?.();
        this.readyResolve = null;
        this.readyReject = null;
        this.onReady?.();
        break;
      case 'frame':
        this.onFrame?.(msg.positions);
        break;
      case 'stopped':
        break;
      case 'error':
        console.warn('[WasmSolver] Worker error:', msg.message);
        this.readyReject?.(new Error(msg.message));
        this.readyReject = null;
        this.readyResolve = null;
        this.onError?.(msg.message);
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
  };
}

/**
 * Check if Wasm XPBD solver is available.
 * Uses a quick fetch HEAD check instead of loading the full module.
 */
export async function isWasmSolverAvailable(): Promise<boolean> {
  try {
    const baseUrl = import.meta.env.BASE_URL ?? '/';
    const resp = await fetch(`${baseUrl}wasm/xpbd_wasm_bg.wasm`, { method: 'HEAD' });
    return resp.ok;
  } catch {
    return false;
  }
}
