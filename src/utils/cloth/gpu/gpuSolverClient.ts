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
import { createPositionStorageAttribute, createNormalStorageAttribute } from './gpuStorageAttributes';
import type { StorageBufferAttribute } from 'three/webgpu';

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

  /** Whether to skip CPU readback (zero-copy mode).
   *  Disabled by default: StorageBufferAttribute patching doesn't work
   *  with Three.js WebGPURenderer's internal attribute management.
   *  The renderer creates its own GPU buffers and ignores the patched
   *  gpuBuffer field, so positions never update on screen. */
  private zeroCopy: boolean = false;

  /** Guard against concurrent readback requests (mapAsync throws if pending). */
  private readbackPending: boolean = false;

  /** Prevents operations after dispose (readback promises may still resolve). */
  private disposed: boolean = false;

  /** Count frames for NaN diagnostic sampling. */
  private frameCount: number = 0;

  /** Cached StorageBufferAttributes for rendering. */
  private positionAttr: StorageBufferAttribute | null = null;
  private normalAttr: StorageBufferAttribute | null = null;

  constructor(device: GPUDevice, config?: Partial<GpuSolverConfig>) {
    this.solver = new GpuClothSolver(device, config);

    // Listen for uncaptured GPU errors
    device.addEventListener('uncapturederror', (event) => {
      console.error('[GpuSolverClient] WebGPU uncaptured error:', (event as GPUUncapturedErrorEvent).error);
    });
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

    // Validate input data for NaN before sending to GPU
    let inputNaN = 0;
    for (let i = 0; i < positions.length; i++) {
      if (!isFinite(positions[i])) inputNaN++;
    }
    if (inputNaN > 0) {
      console.error(`[GpuSolverClient] ❌ Input mesh has ${inputNaN} NaN/Infinity values in positions!`);
    }

    // Extract constraints from merged mesh
    const stretch = extractStretchConstraints(positions, triangles);
    const bend = extractBendConstraints(positions, triangles);

    // Validate constraint rest lengths
    let zeroRestLen = 0;
    for (let i = 0; i < stretch.restLengths.length; i++) {
      if (stretch.restLengths[i] <= 0 || !isFinite(stretch.restLengths[i])) zeroRestLen++;
    }
    if (zeroRestLen > 0) {
      console.warn(`[GpuSolverClient] ⚠️ ${zeroRestLen}/${stretch.restLengths.length} stretch constraints have invalid rest lengths`);
    }

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

    // Validate GPU-side positions after init (verifies buffer upload)
    try {
      const initPositions = await this.solver.readPositions();
      if (initPositions) {
        let nanCount = 0;
        for (let i = 0; i < Math.min(initPositions.length, 300); i++) {
          if (!isFinite(initPositions[i])) nanCount++;
        }
        if (nanCount > 0) {
          console.error(`[GpuSolverClient] ❌ GPU positions contain ${nanCount} NaN after init (sampled first 100 particles)`);
        } else {
          console.log(`[GpuSolverClient] ✅ GPU positions validated after init: ${totalVerts} particles, first 100 all finite`);
        }
      }
    } catch (e) {
      console.warn('[GpuSolverClient] Init validation readback failed:', e);
    }
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
    if (this.running || this.disposed) return;
    this.running = true;
    this.frameCount = 0;
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
   * Enable or disable zero-copy mode.
   * When enabled, the loop skips CPU readback and the renderer
   * should consume StorageBufferAttributes directly.
   */
  setZeroCopy(enabled: boolean): void {
    this.zeroCopy = enabled;
  }

  /**
   * Get a StorageBufferAttribute wrapping the solver's GPU position buffer.
   * Lazily created and cached.
   */
  getPositionStorageAttribute(): StorageBufferAttribute | null {
    if (!this.positionAttr) {
      this.positionAttr = createPositionStorageAttribute(
        this.solver.getPositionBuffer(),
        this.solver.numParticles,
      );
    }
    return this.positionAttr;
  }

  /**
   * Get a StorageBufferAttribute wrapping the solver's GPU normal buffer.
   * Lazily created and cached.
   */
  getNormalStorageAttribute(): StorageBufferAttribute | null {
    if (!this.normalAttr) {
      this.normalAttr = createNormalStorageAttribute(
        this.solver.getNormalBuffer(),
        this.solver.numParticles,
      );
    }
    return this.normalAttr;
  }

  /**
   * Explicit CPU readback for export/fit-maps (bypasses zero-copy mode).
   */
  async readPositionsToCPU(): Promise<Float32Array | null> {
    return this.solver.readPositions();
  }

  /**
   * Clean up all resources.
   */
  dispose(): void {
    this.disposed = true;
    this.stop();
    this.positionAttr = null;
    this.normalAttr = null;
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

  /**
   * Set triangle collision mesh for body collision.
   * Vertices should be expanded: 9 floats per triangle (3 verts × 3 components).
   * Normals: 3 floats per triangle.
   */
  setCollisionMesh(mesh: { vertices: Float32Array; normals: Float32Array; triCount: number }): void {
    this.solver.setCollisionMesh(mesh);
  }

  /**
   * Update collision mesh vertices/normals (same triangle count, reuses buffers).
   */
  updateCollisionMesh(vertices: Float32Array, normals: Float32Array): void {
    this.solver.updateCollisionMesh(vertices, normals);
  }

  // ─── Private ────────────────────────────────────────────────────────────

  /**
   * Check a position array for NaN/Infinity values. Returns true if valid.
   */
  private validatePositions(positions: Float32Array): boolean {
    // Sample-check (every 100th particle) for performance; full check on first 3 frames
    const stride = this.frameCount < 3 ? 1 : 300;
    for (let i = 0; i < positions.length; i += stride) {
      if (!isFinite(positions[i])) {
        const particleIdx = Math.floor(i / 3);
        const component = ['x', 'y', 'z'][i % 3];
        console.error(
          `[GpuSolverClient] ❌ NaN/Inf at particle ${particleIdx}.${component} (frame ${this.frameCount}, positions[${i}] = ${positions[i]})`,
        );
        return false;
      }
    }
    return true;
  }

  private loop = (): void => {
    if (!this.running || this.disposed) return;

    if (this.readbackPending) {
      // Previous readback still in flight — don't submit more GPU work.
      // Submitting step() while mapAsync is pending causes queue saturation:
      // each step adds ~900 compute passes, and mapAsync can't resolve
      // until ALL queued work drains, creating an ever-growing backlog.
      this.animFrameId = requestAnimationFrame(this.loop);
      return;
    }

    this.solver.step();

    if (this.zeroCopy) {
      this.onFrame?.(new Float32Array(0));
    } else {
      this.readbackPending = true;
      this.solver.readPositions().then(positions => {
        this.readbackPending = false;
        if (this.disposed) return; // Client was disposed during readback

        if (positions) {
          // NaN validation (intensive on first 3 frames, sampled thereafter)
          if (!this.validatePositions(positions)) {
            console.error('[GpuSolverClient] Stopping solver due to NaN positions');
            this.stop();
            return;
          }

          this.frameCount++;
          if (this.onFrame) {
            this.onFrame(positions);
          }
        }
      }).catch((e) => {
        this.readbackPending = false;
        if (this.disposed) return; // Expected: buffer destroyed during dispose
        console.warn('[GpuSolverClient] Readback failed:', e);
      });
    }

    this.animFrameId = requestAnimationFrame(this.loop);
  };
}
