/**
 * GPU Solver Client — bridges GpuClothSolver with React components.
 *
 * Manages the solver lifecycle, handles init/start/stop/dispose,
 * and provides per-frame position updates via callback.
 *
 * Drop-in replacement for ClothWorkerClient when WebGPU is available.
 *
 * @module gpuSolverClient
 */

import { GpuClothSolver, type GpuSolverConfig } from './gpuSolver';
import { extractStretchConstraints, extractBendConstraints, type SeamConstraintData } from './gpuBuffers';
import type { SDFData } from '../sdfGenerator';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PieceMeshData {
  pieceId: string;
  vertices: Float32Array;
  triIds: Int32Array;
}

export interface GpuSolverClientCallbacks {
  onFrame?: (positions: Float32Array) => void;
  onReady?: () => void;
  onError?: (error: string) => void;
}

// ─── Client ─────────────────────────────────────────────────────────────────

export class GpuSolverClient {
  private solver: GpuClothSolver;
  private running: boolean = false;
  private animFrameId: number | null = null;

  /** Called each frame with updated positions */
  onFrame: ((positions: Float32Array) => void) | null = null;

  constructor(device: GPUDevice, config?: Partial<GpuSolverConfig>) {
    this.solver = new GpuClothSolver(device, config);
  }

  /**
   * Initialize with multiple pieces (merged into one solver).
   */
  async initMultiPiece(
    pieces: PieceMeshData[],
    seamPairs?: Array<{ pieceAId: string; pieceBId: string; vertexPairs: Array<[number, number]> }>,
  ): Promise<void> {
    // Merge all pieces into a single mesh
    let totalVerts = 0;
    let totalTris = 0;
    const vertexOffsets = new Map<string, number>();

    for (const p of pieces) {
      vertexOffsets.set(p.pieceId, totalVerts);
      totalVerts += p.vertices.length / 3;
      totalTris += p.triIds.length;
    }

    const positions = new Float32Array(totalVerts * 3);
    const invMass = new Float32Array(totalVerts);
    const triangles = new Uint32Array(totalTris);

    let vOff = 0;
    let tOff = 0;

    for (const p of pieces) {
      const numV = p.vertices.length / 3;

      // Copy positions efficiently
      positions.set(p.vertices, vOff * 3);

      // All particles have equal mass (invMass = 1.0)
      for (let i = 0; i < numV; i++) {
        invMass[vOff + i] = 1.0;
      }

      // Copy triangles with offset
      for (let i = 0; i < p.triIds.length; i++) {
        triangles[tOff + i] = p.triIds[i] + vOff;
      }

      vOff += numV;
      tOff += p.triIds.length;
    }

    // totalVerts used for validation

    // Extract constraints from merged mesh
    const stretch = extractStretchConstraints(positions, triangles);
    const bend = extractBendConstraints(positions, triangles);

    // Build seam constraints
    let seam: SeamConstraintData | null = null;
    if (seamPairs && seamPairs.length > 0) {
      const seamIds: number[] = [];
      const seamDist: number[] = [];
      for (const sp of seamPairs) {
        const offA = vertexOffsets.get(sp.pieceAId) ?? 0;
        const offB = vertexOffsets.get(sp.pieceBId) ?? 0;
        for (const [a, b] of sp.vertexPairs) {
          seamIds.push(a + offA, b + offB);
          seamDist.push(0); // target: pull together
        }
      }
      if (seamIds.length > 0) {
        seam = {
          ids: new Uint32Array(seamIds),
          targetDist: new Float32Array(seamDist),
        };
      }
    }

    await this.solver.init(
      { positions, triangles, invMass },
      stretch,
      bend,
      seam,
      triangles,
    );
  }

  /**
   * Set avatar SDF for body collision.
   */
  setSDF(sdf: SDFData): void {
    this.solver.setSDF(sdf);
  }

  /**
   * Update fabric properties.
   */
  setFabricConfig(config: Partial<GpuSolverConfig>): void {
    this.solver.updateConfig(config);
  }

  /**
   * Start the simulation loop.
   */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.loop();
  }

  /**
   * Stop the simulation loop.
   */
  stop(): void {
    this.running = false;
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  /**
   * Clean up all resources.
   */
  dispose(): void {
    this.stop();
    this.solver.destroy();
  }

  /**
   * Get the GPU position buffer (for future zero-copy WebGPU rendering).
   */
  getPositionBuffer(): GPUBuffer | null {
    return this.solver.getPositionBuffer();
  }

  /**
   * Get the GPU normal buffer (for future zero-copy WebGPU rendering).
   */
  getNormalBuffer(): GPUBuffer | null {
    return this.solver.getNormalBuffer();
  }

  // ─── Private ────────────────────────────────────────────────────────────

  private loop = (): void => {
    if (!this.running) return;

    // Step simulation
    this.solver.step();

    // Readback positions for R3F rendering
    // TODO: When migrating to WebGPURenderer, use getPositionBuffer() directly
    this.solver.readPositions().then(positions => {
      if (positions && this.onFrame) {
        this.onFrame(positions);
      }
    });

    this.animFrameId = requestAnimationFrame(this.loop);
  };
}
