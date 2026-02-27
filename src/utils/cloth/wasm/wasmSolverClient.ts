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
  vertices: number[];
  triIds: number[];
  outline?: Array<{ type: string; values: number[] }>;
}

export class WasmSolverClient {
  private worker: Worker | null = null;
  private readyResolve: (() => void) | null = null;
  private readyReject: ((e: Error) => void) | null = null;

  onFrame?: (positions: Float32Array) => void;
  onReady?: () => void;
  onError?: (error: string) => void;

  /**
   * Initialize with merged multi-piece mesh data and seam connections.
   */
  async initMultiPiece(pieces: PieceMeshData[], seams: SeamInitData[] = []): Promise<void> {
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
      });
    });
  }

  setSDF(sdf: SDFData): void {
    this.worker?.postMessage({ type: 'setSDF', sdf });
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
