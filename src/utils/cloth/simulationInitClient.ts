/**
 * Simulation Init Client — async interface to the simulation worker.
 *
 * Provides promise-based API for meshing and SDF generation that runs
 * off the main thread. Falls back to synchronous execution if worker fails.
 *
 * @module simulationInitClient
 */

import type { PatternPiece } from '../../types/types';
import type { SDFData } from './sdfGenerator';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface MeshedPiece {
  pieceId: string;
  vertices: number[];
  triIds: number[];
}

export interface SimInitProgress {
  stage: string;
  current: number;
  total: number;
}

const SCALE = 0.001; // 1 SVG unit = 1mm = 0.001m

// ─── Client ─────────────────────────────────────────────────────────────────

export class SimulationInitClient {
  private worker: Worker | null = null;
  private pendingMesh = new Map<string, {
    resolve: (v: { vertices: Float32Array; triIds: Int32Array }) => void;
    reject: (e: Error) => void;
  }>();
  private pendingSDF: {
    resolve: (v: SDFData | null) => void;
    reject: (e: Error) => void;
  } | null = null;

  onProgress?: (p: SimInitProgress) => void;

  constructor() {
    try {
      this.worker = new Worker(
        new URL('./simulationWorker.ts', import.meta.url),
        { type: 'module' },
      );
      this.worker.addEventListener('message', this.handleMessage);
      this.worker.addEventListener('error', (e) => {
        console.error('[SimInitClient] Worker error:', e);
        this.rejectAll(new Error('Worker crashed'));
      });
    } catch {
      console.warn('[SimInitClient] Worker not available, will use main thread fallback');
      this.worker = null;
    }
  }

  private handleMessage = (event: MessageEvent) => {
    const msg = event.data;

    if (msg.type === 'meshPieceResult') {
      const pending = this.pendingMesh.get(msg.pieceId);
      if (pending) {
        this.pendingMesh.delete(msg.pieceId);
        if (msg.error) {
          pending.reject(new Error(msg.error));
        } else {
          pending.resolve({ vertices: msg.vertices, triIds: msg.triIds });
        }
      }
    }

    if (msg.type === 'sdfResult') {
      if (this.pendingSDF) {
        const { resolve, reject } = this.pendingSDF;
        this.pendingSDF = null;
        if (msg.error) {
          reject(new Error(msg.error));
        } else {
          resolve(msg.sdf);
        }
      }
    }

    if (msg.type === 'progress') {
      this.onProgress?.({ stage: msg.stage, current: msg.current, total: msg.total });
    }
  };

  /**
   * Mesh a pattern piece off the main thread.
   */
  async meshPiece(piece: PatternPiece, particleDistance: number): Promise<{ vertices: Float32Array; triIds: Int32Array }> {
    const options = {
      yHeight: 1.2,
      scale: SCALE,
      maxEdgeLength: particleDistance,
      minAngle: 25,
      maxRefinementPasses: 3,
      curveResolution: 12,
    };

    if (!this.worker) {
      // Fallback: dynamic import + sync execution (yields to event loop via microtask)
      const { meshPiece } = await import('../mesh');
      return meshPiece(piece, options);
    }

    return new Promise((resolve, reject) => {
      this.pendingMesh.set(piece.id, { resolve, reject });
      this.worker!.postMessage({ type: 'meshPiece', piece, options });

      // Timeout: 10s per piece
      setTimeout(() => {
        if (this.pendingMesh.has(piece.id)) {
          this.pendingMesh.delete(piece.id);
          reject(new Error(`Meshing timeout for piece ${piece.id}`));
        }
      }, 10000);
    });
  }

  /**
   * Generate SDF off the main thread.
   */
  async generateSDF(vertices: Float32Array, indices: Uint32Array, resolution: number): Promise<SDFData | null> {
    if (!this.worker) {
      // Fallback: dynamic import + sync execution
      const { generateSDF } = await import('./sdfGenerator');
      return generateSDF(vertices, indices, resolution);
    }

    return new Promise((resolve, reject) => {
      this.pendingSDF = { resolve, reject };
      this.worker!.postMessage(
        { type: 'generateSDF', vertices, indices, resolution },
        [vertices.buffer, indices.buffer],
      );

      // Timeout: 30s for SDF
      setTimeout(() => {
        if (this.pendingSDF) {
          this.pendingSDF = null;
          reject(new Error('SDF generation timeout'));
        }
      }, 30000);
    });
  }

  /**
   * Mesh all pieces, returning results as they complete.
   */
  async meshAllPieces(
    pieces: PatternPiece[],
    particleDistances: Record<string, number>,
    globalPD: number,
  ): Promise<MeshedPiece[]> {
    const results: MeshedPiece[] = [];

    // Process sequentially to avoid worker overload (worker is single-threaded)
    for (let i = 0; i < pieces.length; i++) {
      const piece = pieces[i];
      const pd = particleDistances[piece.id] ?? globalPD;
      this.onProgress?.({ stage: 'Meshing pieces', current: i + 1, total: pieces.length });

      try {
        const { vertices, triIds } = await this.meshPiece(piece, pd);
        if (vertices.length > 0 && triIds.length > 0) {
          results.push({
            pieceId: piece.id,
            vertices: Array.from(vertices),
            triIds: Array.from(triIds),
          });
        }
      } catch (err) {
        console.warn(`[SimInitClient] Meshing failed for piece ${piece.id}:`, err);
      }
    }

    return results;
  }

  private rejectAll(error: Error) {
    for (const [, p] of this.pendingMesh) {
      p.reject(error);
    }
    this.pendingMesh.clear();
    if (this.pendingSDF) {
      this.pendingSDF.reject(error);
      this.pendingSDF = null;
    }
  }

  dispose() {
    this.worker?.terminate();
    this.worker = null;
    this.rejectAll(new Error('Disposed'));
  }
}
