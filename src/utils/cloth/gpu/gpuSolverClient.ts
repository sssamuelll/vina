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
import { extractStretchConstraints, extractBendConstraints, colorConstraints, type SeamConstraintData } from './gpuBuffers';
import { createPositionStorageAttribute, createNormalStorageAttribute } from './gpuStorageAttributes';
import {
  createTslBuffers,
  createSBA,
  destroyTslBufferSet,
  disposeStorageBufferAttribute,
  type TslBufferSet,
  type FabricComplianceConfig,
} from './tslBuffers';
import { createTslSolver, type TslSolver, type TslSolverConfig } from './tslSolver';
import { buildLinearBVH } from './bvh';
import { createTslCollisionBody } from './tslCollision';
import { type SolverCapabilities, GPU_CAPABILITIES } from '../solverCapabilities';
import type { ClothSolverClient } from '../solverProtocol';
import type { LocalVertexIndex } from '../seamPairs';
import type { StorageBufferAttribute } from 'three/webgpu';
import * as THREE from 'three';
import { EdgeType } from './gpuBuffers';
import { withErrorScope, attachUncapturedErrorListener, instrumentShaderCapture } from './webgpuDebug';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PieceMeshData {
  pieceId: string;
  vertices: Float32Array;
  triIds: Int32Array;
  uvs?: Float32Array;
}

export interface GpuSolverClientCallbacks {
  onFrame?: (positions: Float32Array) => void;
  onReady?: () => void;
  onError?: (error: string) => void;
}

// ─── Client ─────────────────────────────────────────────────────────────────

export class GpuSolverClient implements ClothSolverClient {
  private device: GPUDevice;
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

  /** TSL solver (when using renderer.compute() path) */
  private tslSolver: TslSolver | null = null;
  private tslBuffers: TslBufferSet | null = null;
  private pieceVertexRanges: Map<string, { start: number; count: number }> | null = null;
  private originalInvMass: Float32Array | null = null;

  /**
   * Cached WebGPURenderer reference, captured the first time a render-coupled
   * method (`readbackPositionsToGeometry`) sees one. Required by the disposal
   * path in `dispose()` / `initMultiPieceTsl` / `setTslCollisionBody`: Three.js
   * 0.183 `StorageBufferAttribute` has no public `dispose()` so the
   * canonical GPU-buffer release route is `renderer._attributes.delete(attr)`.
   * Null until first use; disposal degrades to ref-drop without it.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private rendererRef: any = null;

  /**
   * Tracks BVH SBAs per collision body id so `setTslCollisionBody` can free
   * the previous allocation when called again for the same id (avatar pose
   * updates re-allocate 3 SBAs each call, see #753).
   */
  private collisionBodySBAs: Map<
    string,
    { bvhNodesSBA: StorageBufferAttribute; triVertsSBA: StorageBufferAttribute; triNormalsSBA: StorageBufferAttribute }
  > = new Map();

  constructor(device: GPUDevice, config?: Partial<GpuSolverConfig>) {
    this.device = device;
    // Install debug instrumentation BEFORE solver/pipeline construction so every
    // shader module created during init is captured into window.__OPENCLO_SHADERS__
    // and `[WebGPU shader] compile error` diagnostics are surfaced.
    //
    // instrumentShaderCapture is dev-only (no-op in production).
    // attachUncapturedErrorListener stays active in prod — an idle listener is
    // zero-cost and surfaces validation failures that would otherwise be silently
    // swallowed. Both helpers are idempotent.
    instrumentShaderCapture(device);
    attachUncapturedErrorListener(device);
    this.solver = new GpuClothSolver(device, config);
  }

  /**
   * Solver capability surface — declares which physics features and
   * execution modes this tier supports. Per A6 § 3.4 Option A
   * (capability extension to GPU + Neural).
   *
   * Currently all physics flags `false` (selfCollision is scaffolded
   * but unwired — see `GPU_CAPABILITIES` JSDoc). `frameDriven: true`
   * signals consumers to dispatch frames via `useFrame` rather than
   * calling `start()`.
   */
  get capabilities(): SolverCapabilities {
    return GPU_CAPABILITIES;
  }

  /**
   * Initialize with multiple pieces (merged into one solver).
   */
  async initMultiPiece(
    pieces: PieceMeshData[],
    seamPairs?: Array<{ pieceAId: string; pieceBId: string; vertexPairs: Array<[LocalVertexIndex, LocalVertexIndex]> }>,
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

    await withErrorScope(this.device, 'GpuSolverClient.initMultiPiece', async () => {
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
    });
  }

  /**
   * Initialize with TSL solver (for zero-copy rendering via positionNode).
   * Call this instead of initMultiPiece() when using MeshStandardNodeMaterial.
   *
   * @param fabricCompliance — per-edge-type compliance from toXPBDParams().
   *   When provided, each stretch/bend constraint gets its own compliance
   *   value based on UV-classified edge direction (warp/weft/shear).
   */
  async initMultiPieceTsl(
    pieces: PieceMeshData[],
    seamPairs?: Array<{ pieceAId: string; pieceBId: string; vertexPairs: Array<[LocalVertexIndex, LocalVertexIndex]> }>,
    solverConfig?: Partial<TslSolverConfig>,
    fabricCompliance?: FabricComplianceConfig,
  ): Promise<void> {
    // Merge pieces (same logic as initMultiPiece)
    let totalVerts = 0;
    let totalTris = 0;
    const vertexOffsets = new Map<string, number>();

    for (const p of pieces) {
      vertexOffsets.set(p.pieceId, totalVerts);
      totalVerts += p.vertices.length / 3;
      totalTris += p.triIds.length;
    }

    // Store piece vertex ranges for freeze/unfreeze support
    this.pieceVertexRanges = new Map();
    for (const p of pieces) {
      const start = vertexOffsets.get(p.pieceId) ?? 0;
      const count = p.vertices.length / 3;
      this.pieceVertexRanges.set(p.pieceId, { start, count });
    }

    const positions = new Float32Array(totalVerts * 3);
    const invMass = new Float32Array(totalVerts);
    const triangles = new Uint32Array(totalTris);
    // Merge UVs for anisotropic edge classification
    let mergedUvs: Float32Array | undefined;
    let hasUvs = false;

    let vOff = 0;
    let tOff = 0;

    for (const p of pieces) {
      const numV = p.vertices.length / 3;
      positions.set(p.vertices, vOff * 3);
      for (let i = 0; i < numV; i++) invMass[vOff + i] = 1.0;
      for (let i = 0; i < p.triIds.length; i++) triangles[tOff + i] = p.triIds[i] + vOff;

      // Merge UVs
      if (p.uvs && p.uvs.length >= numV * 2) {
        if (!mergedUvs) {
          mergedUvs = new Float32Array(totalVerts * 2);
        }
        mergedUvs.set(p.uvs.subarray(0, numV * 2), vOff * 2);
        hasUvs = true;
      }

      vOff += numV;
      tOff += p.triIds.length;
    }

    // Snapshot invMass for freeze/unfreeze restore. Currently all particles
    // init at 1.0. If a GPU pin system is added that also mutates invMass,
    // this snapshot must be taken AFTER pins are applied.
    this.originalInvMass = new Float32Array(invMass);

    // Extract constraints with UV-based edge classification
    const uvArg = hasUvs ? mergedUvs : undefined;
    const stretch = extractStretchConstraints(positions, triangles, uvArg);
    const bend = extractBendConstraints(positions, triangles, uvArg);

    // Compute per-constraint compliance from edge types + fabric config
    const fabric: FabricComplianceConfig = fabricCompliance ?? {
      stretchComplianceWarp: 0.0,
      stretchComplianceWeft: 0.0,
      shearCompliance: 0.001,
      bendComplianceWarp: 1.0,
      bendComplianceWeft: 1.0,
    };

    const numStretch = stretch.ids.length / 2;
    const stretchCompliance = new Float32Array(numStretch);
    for (let i = 0; i < numStretch; i++) {
      const et = stretch.edgeTypes[i];
      if (et === EdgeType.WARP) stretchCompliance[i] = fabric.stretchComplianceWarp;
      else if (et === EdgeType.WEFT) stretchCompliance[i] = fabric.stretchComplianceWeft;
      else stretchCompliance[i] = fabric.shearCompliance;
    }

    const colored = colorConstraints(stretch.ids, stretch.restLengths, numStretch, stretchCompliance);

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
          seamDist.push(0);
        }
      }
      if (seamIds.length > 0) {
        seam = { ids: new Uint32Array(seamIds), targetDist: new Float32Array(seamDist) };
      }
    }

    await withErrorScope(this.device, 'GpuSolverClient.initMultiPieceTsl', () => {
      // Re-init: free any previously-allocated TSL resources so re-init cycles
      // (load project → simulate → load different project) don't leak GPUBuffers
      // (#753). When the renderer hasn't been captured yet (first init), this
      // degrades to a ref-drop — see `disposeStorageBufferAttribute`.
      this.disposeTslResources();

      // Create TSL buffers with per-constraint compliance
      this.tslBuffers = createTslBuffers(
        { positions, triangles, invMass },
        colored,
        bend,
        seam,
        fabric,
      );

      const defaultConfig: TslSolverConfig = {
        substeps: 15,
        gravity: [0, -9.81, 0],
        damping: 0.9603,
        internalDamping: 0.3,
        seamStiffness: 0.0,
        groundY: 0.0,
        dt: 1 / 60,
        ...solverConfig,
      };

      this.tslSolver = createTslSolver(this.tslBuffers, defaultConfig);
      this.zeroCopy = true; // TSL mode = zero-copy

      console.log('[GpuSolverClient] TSL solver initialized:', {
        particles: totalVerts,
        stretchColors: colored.colorRanges.length,
        bendConstraints: bend.ids.length / 4,
        seamConstraints: seam ? seam.ids.length / 2 : 0,
        hasUvs,
        fabric: fabricCompliance ? 'custom' : 'defaults',
      });
    });
  }

  /**
   * Get the TSL solver (for renderer.compute() dispatch in useFrame).
   */
  getTslSolver(): TslSolver | null {
    return this.tslSolver;
  }

  /**
   * Get vertex ranges for each piece in the merged mesh.
   * Returns null if solver not initialized.
   */
  getPieceVertexRanges(): Map<string, { start: number; count: number }> | null {
    return this.pieceVertexRanges;
  }

  /**
   * Update fabric properties.
   */
  setFabricConfig(config: Partial<GpuSolverConfig>): void {
    this.solver.updateConfig(config);
  }

  /**
   * Update wind force on the TSL solver.
   */
  setWind(force: [number, number, number], dragCoefficient?: number): void {
    if (this.tslSolver) {
      this.tslSolver.updateConfig({
        windForce: force,
        ...(dragCoefficient !== undefined ? { dragCoefficient } : {}),
      });
    }
  }

  /**
   * Freeze/unfreeze pieces by setting invMass=0 for frozen vertices.
   * Restores original invMass for unfrozen vertices.
   * Bumps SBA version to trigger GPU buffer re-upload.
   */
  freezePieces(frozenPieceIds: string[]): void {
    if (!this.tslBuffers || !this.originalInvMass || !this.pieceVertexRanges) return;

    const invMassArr = this.tslBuffers.invMassSBA.array as Float32Array;
    // Restore all to original values first
    invMassArr.set(this.originalInvMass);

    // Zero out invMass for frozen pieces
    const frozenSet = new Set(frozenPieceIds);
    for (const [pieceId, range] of this.pieceVertexRanges) {
      if (frozenSet.has(pieceId)) {
        for (let i = range.start; i < range.start + range.count; i++) {
          invMassArr[i] = 0;
        }
      }
    }

    // Bump version to trigger GPU buffer re-upload on next render
    this.tslBuffers.invMassSBA.version++;
  }

  /**
   * Update steam brush parameters for the GPU compute kernel.
   * The brush kernel runs once per frame after substeps.
   * Set strength to 0 to deactivate (kernel early-exits).
   *
   * @param center - Brush world-space position [x, y, z]
   * @param radius - Brush sphere radius
   * @param strength - Damping strength 0-1 (0 = inactive, 1 = full damp)
   */
  setBrushParams(center: [number, number, number], radius: number, strength: number): void {
    if (!this.tslSolver) return;
    const b = this.tslSolver.brushNodes;
    b.centerX.value = center[0];
    b.centerY.value = center[1];
    b.centerZ.value = center[2];
    b.radius.value = radius;
    b.strength.value = strength;
  }

  /**
   * Start grab at the given center position.
   * Sets uniforms and flags grabInitPending so the next useFrame dispatches
   * the one-shot GPU init kernel (fills mask + offset on GPU, no CPU upload).
   */
  grabStart(center: [number, number, number], radius: number, strength: number): void {
    if (!this.tslSolver) return;
    const g = this.tslSolver.grabNodes;
    g.grabCenterX.value = center[0];
    g.grabCenterY.value = center[1];
    g.grabCenterZ.value = center[2];
    g.grabRadius.value = radius;
    g.grabStrength.value = strength;
    g.grabActive.value = 1;
    g.grabInitPending.value = 1; // triggers one-shot init kernel on next frame
  }

  /** Update grab center (called on pointer move). */
  grabMove(center: [number, number, number]): void {
    if (!this.tslSolver) return;
    const g = this.tslSolver.grabNodes;
    g.grabCenterX.value = center[0];
    g.grabCenterY.value = center[1];
    g.grabCenterZ.value = center[2];
  }

  /** Release grab. */
  grabRelease(): void {
    if (!this.tslSolver) return;
    this.tslSolver.grabNodes.grabActive.value = 0;
  }

  /**
   * Read GPU positions back to CPU and update a BufferGeometry's position attribute.
   * Uses renderer.getArrayBufferAsync() for GPU→CPU readback.
   * Returns the position Float32Array for reuse (e.g. by grabStartWithPositions).
   *
   * @param renderer - Three.js WebGPURenderer (passed as `gl` from useFrame)
   * @param geometry - The BufferGeometry whose position attribute should be updated
   */
  async readbackPositionsToGeometry(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    renderer: any,
    geometry: THREE.BufferGeometry,
  ): Promise<Float32Array | null> {
    if (!this.tslSolver) return null;
    // Capture the renderer the first time we see one so dispose() can route
    // GPU-buffer destruction through `renderer._attributes.delete(attr)`.
    // The renderer is stable for the lifetime of the WebGPU context, so
    // first-write-wins is sufficient.
    if (!this.rendererRef) this.rendererRef = renderer;
    const sba = this.tslSolver.positionSBA;
    try {
      const ab: ArrayBuffer = await renderer.getArrayBufferAsync(sba);
      const gpuPositions = new Float32Array(ab);
      const posAttr = geometry.getAttribute('position');
      if (!posAttr) return gpuPositions;
      const dst = posAttr.array as Float32Array;
      const vertCount = posAttr.count;

      if (gpuPositions.length === dst.length) {
        // vec3 → vec3: direct copy
        dst.set(gpuPositions);
      } else if (gpuPositions.length === vertCount * 4) {
        // vec4 (XYZW) → vec3 (XYZ): strip W component
        for (let i = 0; i < vertCount; i++) {
          dst[i * 3] = gpuPositions[i * 4];
          dst[i * 3 + 1] = gpuPositions[i * 4 + 1];
          dst[i * 3 + 2] = gpuPositions[i * 4 + 2];
        }
      } else {
        return gpuPositions;
      }

      posAttr.needsUpdate = true;
      geometry.computeBoundingSphere();
      return gpuPositions;
    } catch (e) {
      console.warn('[GpuSolverClient] Position readback failed:', e);
      return null;
    }
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
   * Explicit CPU readback for export/fit-maps.
   * For TSL mode: reads back from the StorageBufferAttribute's GPU buffer via
   * `renderer.getArrayBufferAsync`. Falls back to the renderer cached by the
   * first `readbackPositionsToGeometry` call when no `renderer` is passed.
   * For WGSL mode: delegates to solver.readPositions().
   *
   * Returns a fresh, flat `numParticles * 3` Float32Array (vec3 layout) to
   * mirror the WGSL contract. The GPU buffer may be padded to vec4 for
   * alignment; the W component is stripped here so callers get a uniform
   * shape regardless of tier.
   */
  async readPositionsToCPU(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    renderer?: any,
  ): Promise<Float32Array | null> {
    if (this.tslSolver) {
      const r = renderer ?? this.rendererRef;
      if (!r) {
        throw new Error(
          '[GpuSolverClient] readPositionsToCPU (TSL) requires a WebGPURenderer. ' +
            'Pass one explicitly or call readbackPositionsToGeometry first to cache one.',
        );
      }
      if (!this.rendererRef) this.rendererRef = r;
      const sba = this.tslSolver.positionSBA;
      const ab: ArrayBuffer = await r.getArrayBufferAsync(sba);
      const raw = new Float32Array(ab);
      const numParticles = this.tslBuffers?.numParticles ?? Math.floor(raw.length / 3);
      if (raw.length === numParticles * 4) {
        // vec4 (XYZW padded) → vec3 (XYZ)
        const out = new Float32Array(numParticles * 3);
        for (let i = 0; i < numParticles; i++) {
          out[i * 3] = raw[i * 4];
          out[i * 3 + 1] = raw[i * 4 + 1];
          out[i * 3 + 2] = raw[i * 4 + 2];
        }
        return out;
      }
      return raw;
    }
    return this.solver.readPositions();
  }

  /**
   * Clean up all resources.
   *
   * Order matters: TSL GPU buffers must be released BEFORE `solver.destroy()`
   * because the cached `rendererRef` may share the device with the WGSL
   * solver, and once `device` is destroyed the renderer's backend can't
   * service `_attributes.delete()` calls.
   */
  dispose(): void {
    this.disposed = true;
    this.stop();
    this.positionAttr = null;
    this.normalAttr = null;
    this.disposeTslResources();
    this.pieceVertexRanges = null;
    this.originalInvMass = null;
    this.rendererRef = null;
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
    if (this.tslSolver) {
      // TSL mode: build BVH and create TSL collision body
      this.setTslCollisionBody('__avatar__', mesh);
      return;
    }
    this.solver.setCollisionMesh(mesh);
  }

  /**
   * Update collision mesh vertices/normals (same triangle count, reuses buffers).
   */
  updateCollisionMesh(vertices: Float32Array, normals: Float32Array): void {
    if (this.tslSolver) {
      // TSL mode: rebuild BVH (topology may differ, so full rebuild)
      const triCount = vertices.length / 9;
      this.setTslCollisionBody('__avatar__', { vertices, normals, triCount });
      return;
    }
    this.solver.updateCollisionMesh(vertices, normals);
  }

  /**
   * Add/update a custom collision body (non-avatar props like mannequin stands).
   */
  updateCollisionBody(data: { id: string; mesh: { vertices: Float32Array; normals: Float32Array; triCount: number }; friction: number; margin: number }): void {
    if (this.tslSolver) {
      this.setTslCollisionBody(data.id, data.mesh, data.friction, data.margin);
      return;
    }
    // WGSL path — delegate to underlying solver
    this.solver.setCollisionMesh(data.mesh);
  }

  /**
   * Set a TSL collision body from collision mesh data.
   * Builds a BVH on CPU, uploads to GPU as StorageBufferAttributes,
   * creates a TSL collision compute node, and registers it on the solver.
   */
  setTslCollisionBody(
    id: string,
    mesh: { vertices: Float32Array; normals: Float32Array; triCount: number },
    friction: number = 0.3,
    margin: number = 0.005,
  ): void {
    if (!this.tslSolver || !this.tslBuffers) {
      console.warn('[GpuSolverClient] setTslCollisionBody called but no TSL solver active');
      return;
    }
    if (mesh.triCount === 0) {
      console.warn(
        `[GpuSolverClient] setTslCollisionBody '${id}': input mesh has triCount=0, skipping. ` +
          `Avatar collision is not degradable — particles will fall through any region this body would have covered.`,
      );
      return;
    }

    // Build BVH on CPU
    const bvh = buildLinearBVH(mesh);
    if (bvh.nodeCount === 0) {
      console.warn(
        `[GpuSolverClient] setTslCollisionBody '${id}': BVH build produced 0 nodes from ${mesh.triCount} triangles, skipping. ` +
          `Likely a degenerate mesh; avatar collision will be absent for this body.`,
      );
      return;
    }

    // Re-allocation cleanup: avatar pose updates call this method repeatedly
    // for the same body id. Without this, each call leaks 3 SBAs worth of
    // GPUBuffer (BVH nodes, tri verts, tri normals) — #753.
    const previous = this.collisionBodySBAs.get(id);
    if (previous) {
      disposeStorageBufferAttribute(previous.bvhNodesSBA, this.rendererRef);
      disposeStorageBufferAttribute(previous.triVertsSBA, this.rendererRef);
      disposeStorageBufferAttribute(previous.triNormalsSBA, this.rendererRef);
    }

    // Create StorageBufferAttributes for GPU upload
    const bvhNodesSBA = createSBA(bvh.nodes, 1);
    const triVertsSBA = createSBA(bvh.triVerts, 1);
    const triNormalsSBA = createSBA(bvh.triNormals, 1);
    this.collisionBodySBAs.set(id, { bvhNodesSBA, triVertsSBA, triNormalsSBA });

    // Use shared buffer nodes from the solver
    const N = this.tslSolver.numParticles;
    const posBuf = this.tslSolver.positionBufNode;
    const prevPosBuf = this.tslSolver.prevPosBufNode;
    const invMassBuf = this.tslSolver.invMassBufNode;

    const body = createTslCollisionBody(
      posBuf,
      prevPosBuf,
      invMassBuf,
      bvhNodesSBA,
      triVertsSBA,
      triNormalsSBA,
      N,
      bvh.nodeCount,
      bvh.triCount,
      id,
      margin,
      friction,
    );

    this.tslSolver.setCollisionBody(body, this.rendererRef);

    console.log(`[GpuSolverClient] TSL collision body '${id}':`, {
      bvhNodes: bvh.nodeCount,
      triangles: bvh.triCount,
      margin,
      friction,
    });
  }

  /**
   * Remove a TSL collision body by ID.
   */
  removeTslCollisionBody(id: string): void {
    this.tslSolver?.removeCollisionBody(id, this.rendererRef);
    const tracked = this.collisionBodySBAs.get(id);
    if (tracked) {
      disposeStorageBufferAttribute(tracked.bvhNodesSBA, this.rendererRef);
      disposeStorageBufferAttribute(tracked.triVertsSBA, this.rendererRef);
      disposeStorageBufferAttribute(tracked.triNormalsSBA, this.rendererRef);
      this.collisionBodySBAs.delete(id);
    }
  }

  /**
   * Free all TSL-side GPU resources (buffer set + per-body BVH SBAs + solver
   * compute-node refs). Idempotent. Used by both `dispose()` and the re-init
   * path in `initMultiPieceTsl`.
   */
  private disposeTslResources(): void {
    for (const tracked of this.collisionBodySBAs.values()) {
      disposeStorageBufferAttribute(tracked.bvhNodesSBA, this.rendererRef);
      disposeStorageBufferAttribute(tracked.triVertsSBA, this.rendererRef);
      disposeStorageBufferAttribute(tracked.triNormalsSBA, this.rendererRef);
    }
    this.collisionBodySBAs.clear();
    if (this.tslBuffers) {
      destroyTslBufferSet(this.tslBuffers, this.rendererRef);
      this.tslBuffers = null;
    }
    if (this.tslSolver) {
      this.tslSolver.dispose(this.rendererRef);
      this.tslSolver = null;
    }
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
