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

      // Timeout: 30s per piece (large pieces at 5mm can generate 5K+ interior points)
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

      // Timeout: 60s for SDF (32³ grid should complete in <15s)
      setTimeout(() => {
        if (this.pendingSDF) {
          this.pendingSDF = null;
          reject(new Error('SDF generation timeout'));
        }
      }, 60000);
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

  /**
   * Apply placement transforms to meshed pieces off the main thread.
   * Falls back to inline math if worker unavailable.
   */
  async applyPlacements(
    pieces: Array<{
      pieceId: string; vertices: number[]; triIds: number[];
      outline: Array<{ type: string; values: number[] }>;
      rotation: [number, number, number];
      position: [number, number, number];
    }>,
  ): Promise<Array<{ pieceId: string; vertices: number[]; triIds: number[]; outline: Array<{ type: string; values: number[] }> }>> {
    // Use a dedicated placement worker
    try {
      const placementWorker = new Worker(
        new URL('./placementWorker.ts', import.meta.url),
        { type: 'module' },
      );

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          placementWorker.terminate();
          reject(new Error('Placement transform timeout'));
        }, 5000);

        placementWorker.addEventListener('message', (event) => {
          clearTimeout(timeout);
          placementWorker.terminate();
          if (event.data.type === 'transformed') {
            resolve(event.data.pieces);
          } else {
            reject(new Error('Unexpected placement response'));
          }
        });

        placementWorker.addEventListener('error', (e) => {
          clearTimeout(timeout);
          placementWorker.terminate();
          reject(new Error(`Placement worker error: ${e.message}`));
        });

        placementWorker.postMessage({ type: 'transform', pieces });
      });
    } catch {
      // Fallback: inline transforms (pure math, no Three.js)
      return pieces.map(p => {
        const numVerts = p.vertices.length / 3;
        const transformed = new Array<number>(p.vertices.length);
        const [rx, ry, rz] = p.rotation;
        const [px, py, pz] = p.position;
        const cx = Math.cos(rx), sx = Math.sin(rx);
        const cy = Math.cos(ry), sy = Math.sin(ry);
        const cz = Math.cos(rz), sz = Math.sin(rz);

        for (let i = 0; i < numVerts; i++) {
          const vx = p.vertices[i * 3], vy = p.vertices[i * 3 + 1], vz = p.vertices[i * 3 + 2];
          const y1 = vy * cx - vz * sx, z1 = vy * sx + vz * cx;
          const x2 = vx * cy + z1 * sy, z2 = -vx * sy + z1 * cy;
          const x3 = x2 * cz - y1 * sz, y3 = x2 * sz + y1 * cz;
          transformed[i * 3] = x3 + px;
          transformed[i * 3 + 1] = y3 + py;
          transformed[i * 3 + 2] = z2 + pz;
        }
        return { pieceId: p.pieceId, vertices: transformed, triIds: p.triIds, outline: p.outline };
      });
    }
  }

  dispose() {
    this.worker?.terminate();
    this.worker = null;
    this.rejectAll(new Error('Disposed'));
  }
}
