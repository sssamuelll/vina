/**
 * GPU Cloth Solver — orchestrates WebGPU compute passes for XPBD simulation.
 *
 * Manages compute pipelines, bind groups, and the per-frame simulation loop.
 * Positions never leave the GPU during simulation — zero CPU↔GPU transfer.
 *
 * @module gpuSolver
 */

import type { GpuClothBuffers, SimParams, ClothMeshData, StretchConstraints, BendConstraints, SeamConstraintData } from './gpuBuffers';
import { createClothBuffers, destroyClothBuffers, updateSimParams, readbackPositions } from './gpuBuffers';

// Import WGSL shaders as strings (Vite handles ?raw)
import clothShaderSrc from './shaders/cloth.wgsl?raw';
import constraintsShaderSrc from './shaders/constraints.wgsl?raw';
import normalsShaderSrc from './shaders/normals.wgsl?raw';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface GpuSolverConfig {
  substeps: number;
  gravity: [number, number, number];
  damping: number;
  stretchCompliance: number;
  bendCompliance: number;
  seamStiffness: number;
  groundY: number;
  collisionMargin: number;
  clothThickness: number;
  selfCollision: boolean;
}

const DEFAULT_CONFIG: GpuSolverConfig = {
  substeps: 15,
  gravity: [0, -9.81, 0],
  damping: 0.99,
  stretchCompliance: 0.0,
  bendCompliance: 0.01,
  seamStiffness: 0.0,
  groundY: -2.0,
  collisionMargin: 0.005,
  clothThickness: 0.002,
  selfCollision: false,
};

// ─── Solver ─────────────────────────────────────────────────────────────────

export class GpuClothSolver {
  private device: GPUDevice;
  private buffers: GpuClothBuffers | null = null;
  private config: GpuSolverConfig;
  private dt: number = 1 / 60;

  // Compute pipelines
  private preSolvePipeline: GPUComputePipeline | null = null;
  private stretchPipeline: GPUComputePipeline | null = null;
  private seamPipeline: GPUComputePipeline | null = null;
  private postSolvePipeline: GPUComputePipeline | null = null;
  private normalAccumPipeline: GPUComputePipeline | null = null;
  private normalNormPipeline: GPUComputePipeline | null = null;

  // Bind groups
  private coreBindGroup: GPUBindGroup | null = null;
  private stretchBindGroup: GPUBindGroup | null = null;
  private seamBindGroup: GPUBindGroup | null = null;
  private normalBindGroup: GPUBindGroup | null = null;

  // Additional buffers for normals
  private triIdsBuffer: GPUBuffer | null = null;
  private normalsAtomicBuffer: GPUBuffer | null = null;
  private normalParamsBuffer: GPUBuffer | null = null;
  private numTriangles: number = 0;

  constructor(device: GPUDevice, config?: Partial<GpuSolverConfig>) {
    this.device = device;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize the solver with mesh data and constraints.
   */
  async init(
    mesh: ClothMeshData,
    stretch: StretchConstraints,
    bend: BendConstraints,
    seam: SeamConstraintData | null = null,
    triangles: Uint32Array,
  ): Promise<void> {
    // Clean up previous
    this.destroy();

    const params = this.buildSimParams(mesh, stretch, bend, seam);
    this.buffers = createClothBuffers(this.device, mesh, stretch, bend, seam, params);
    this.numTriangles = triangles.length / 3;

    // Upload triangle indices for normal computation
    this.triIdsBuffer = this.device.createBuffer({
      label: 'triIds',
      size: triangles.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Uint32Array(this.triIdsBuffer.getMappedRange()).set(triangles);
    this.triIdsBuffer.unmap();

    // Atomic normals buffer (i32 for atomicAdd)
    this.normalsAtomicBuffer = this.device.createBuffer({
      label: 'normalsAtomic',
      size: this.buffers.numParticles * 3 * 4,
      usage: GPUBufferUsage.STORAGE,
    });

    // Normal params uniform
    const npData = new Uint32Array([this.buffers.numParticles, this.numTriangles, 0, 0]);
    this.normalParamsBuffer = this.device.createBuffer({
      label: 'normalParams',
      size: npData.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Uint32Array(this.normalParamsBuffer.getMappedRange()).set(npData);
    this.normalParamsBuffer.unmap();

    // Create pipelines and bind groups
    await this.createPipelines();
    this.createBindGroups();

    console.log('[GpuSolver] Initialized:', {
      particles: this.buffers.numParticles,
      stretchConstraints: this.buffers.numStretchConstraints,
      bendConstraints: this.buffers.numBendConstraints,
      seamConstraints: this.buffers.numSeamConstraints,
      triangles: this.numTriangles,
    });
  }

  /**
   * Step the simulation forward one frame.
   * Dispatches all compute passes for N substeps.
   */
  step(dt?: number): void {
    if (!this.buffers || !this.preSolvePipeline || !this.coreBindGroup) return;

    const framedt = dt ?? this.dt;
    // Update sdt in params
    const sdt = framedt / this.config.substeps;
    // Quick update: write sdt to params buffer offset 16 (5th float)
    this.device.queue.writeBuffer(this.buffers.params, 4 * 4, new Float32Array([sdt]));

    const encoder = this.device.createCommandEncoder({ label: 'cloth-step' });

    const particleWG = Math.ceil(this.buffers.numParticles / 256);
    const stretchWG = Math.ceil(this.buffers.numStretchConstraints / 256);
    const seamWG = this.buffers.numSeamConstraints > 0
      ? Math.ceil(this.buffers.numSeamConstraints / 256)
      : 0;

    for (let s = 0; s < this.config.substeps; s++) {
      // Pre-solve: gravity + integration
      const pre = encoder.beginComputePass({ label: 'preSolve' });
      pre.setPipeline(this.preSolvePipeline!);
      pre.setBindGroup(0, this.coreBindGroup!);
      pre.dispatchWorkgroups(particleWG);
      pre.end();

      // Stretch constraints
      const str = encoder.beginComputePass({ label: 'stretch' });
      str.setPipeline(this.stretchPipeline!);
      str.setBindGroup(0, this.coreBindGroup!);
      str.setBindGroup(1, this.stretchBindGroup!);
      str.dispatchWorkgroups(stretchWG);
      str.end();

      // Seam constraints
      if (seamWG > 0 && this.seamPipeline && this.seamBindGroup) {
        const sm = encoder.beginComputePass({ label: 'seam' });
        sm.setPipeline(this.seamPipeline);
        sm.setBindGroup(0, this.coreBindGroup!);
        sm.setBindGroup(2, this.seamBindGroup);
        sm.dispatchWorkgroups(seamWG);
        sm.end();
      }

      // Post-solve: velocity update
      const post = encoder.beginComputePass({ label: 'postSolve' });
      post.setPipeline(this.postSolvePipeline!);
      post.setBindGroup(0, this.coreBindGroup!);
      post.dispatchWorkgroups(particleWG);
      post.end();
    }

    // Normal recomputation (once per frame, after all substeps)
    if (this.normalAccumPipeline && this.normalNormPipeline && this.normalBindGroup) {
      const triWG = Math.ceil(this.numTriangles / 256);

      const na = encoder.beginComputePass({ label: 'normalAccum' });
      na.setPipeline(this.normalAccumPipeline);
      na.setBindGroup(0, this.normalBindGroup);
      na.dispatchWorkgroups(triWG);
      na.end();

      const nn = encoder.beginComputePass({ label: 'normalNorm' });
      nn.setPipeline(this.normalNormPipeline);
      nn.setBindGroup(0, this.normalBindGroup);
      nn.dispatchWorkgroups(particleWG);
      nn.end();
    }

    this.device.queue.submit([encoder.finish()]);
  }

  /**
   * Get the position GPU buffer (for direct use as vertex attribute).
   */
  getPositionBuffer(): GPUBuffer | null {
    return this.buffers?.positions ?? null;
  }

  /**
   * Get the normal GPU buffer (for direct use as vertex attribute).
   */
  getNormalBuffer(): GPUBuffer | null {
    return this.buffers?.normals ?? null;
  }

  /**
   * Read positions back to CPU (async, use sparingly — for export/fit maps).
   */
  async readPositions(): Promise<Float32Array | null> {
    if (!this.buffers) return null;
    return readbackPositions(this.device, this.buffers);
  }

  /**
   * Update solver config (fabric properties, etc.)
   */
  updateConfig(config: Partial<GpuSolverConfig>): void {
    this.config = { ...this.config, ...config };
    if (this.buffers) {
      const params = this.buildSimParams(
        { positions: new Float32Array(0), triangles: new Uint32Array(0), invMass: new Float32Array(0) },
        { ids: new Uint32Array(0), restLengths: new Float32Array(0) },
        { ids: new Uint32Array(0), restAngles: new Float32Array(0) },
        null,
      );
      params.numParticles = this.buffers.numParticles;
      params.numStretchConstraints = this.buffers.numStretchConstraints;
      params.numBendConstraints = this.buffers.numBendConstraints;
      params.numSeamConstraints = this.buffers.numSeamConstraints;
      updateSimParams(this.device, this.buffers.params, params);
    }
  }

  /**
   * Get particle count.
   */
  get numParticles(): number {
    return this.buffers?.numParticles ?? 0;
  }

  /**
   * Clean up all GPU resources.
   */
  destroy(): void {
    if (this.buffers) {
      destroyClothBuffers(this.buffers);
      this.buffers = null;
    }
    this.triIdsBuffer?.destroy();
    this.normalsAtomicBuffer?.destroy();
    this.normalParamsBuffer?.destroy();
    this.triIdsBuffer = null;
    this.normalsAtomicBuffer = null;
    this.normalParamsBuffer = null;
    this.preSolvePipeline = null;
    this.stretchPipeline = null;
    this.seamPipeline = null;
    this.postSolvePipeline = null;
    this.normalAccumPipeline = null;
    this.normalNormPipeline = null;
    this.coreBindGroup = null;
    this.stretchBindGroup = null;
    this.seamBindGroup = null;
    this.normalBindGroup = null;
  }

  // ─── Private ────────────────────────────────────────────────────────────

  private buildSimParams(
    mesh: ClothMeshData,
    stretch: StretchConstraints,
    bend: BendConstraints,
    seam: SeamConstraintData | null,
  ): SimParams {
    return {
      numParticles: mesh.positions.length / 3,
      numStretchConstraints: stretch.ids.length / 2,
      numBendConstraints: bend.ids.length / 4,
      numSeamConstraints: seam ? seam.ids.length / 2 : 0,
      dt: this.dt,
      substeps: this.config.substeps,
      gravity: this.config.gravity,
      damping: this.config.damping,
      stretchCompliance: this.config.stretchCompliance,
      bendCompliance: this.config.bendCompliance,
      seamStiffness: this.config.seamStiffness,
      groundY: this.config.groundY,
      collisionMargin: this.config.collisionMargin,
      clothThickness: this.config.clothThickness,
      selfCollision: this.config.selfCollision,
    };
  }

  private async createPipelines(): Promise<void> {
    // Core shader module (preSolve, postSolve)
    const clothModule = this.device.createShaderModule({
      label: 'cloth',
      code: clothShaderSrc,
    });

    // Constraints shader module (solveStretch, solveSeams)
    const constraintsModule = this.device.createShaderModule({
      label: 'constraints',
      code: constraintsShaderSrc,
    });

    // Normals shader module
    const normalsModule = this.device.createShaderModule({
      label: 'normals',
      code: normalsShaderSrc,
    });

    // Core bind group layout: params, pos, prevPos, vel, invMass
    const coreLayout = this.device.createBindGroupLayout({
      label: 'core',
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      ],
    });

    // Stretch bind group layout
    const stretchLayout = this.device.createBindGroupLayout({
      label: 'stretch',
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      ],
    });

    // Seam bind group layout
    const seamLayout = this.device.createBindGroupLayout({
      label: 'seam',
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      ],
    });

    // Pipelines
    const corePipelineLayout = this.device.createPipelineLayout({
      bindGroupLayouts: [coreLayout],
    });
    const stretchPipelineLayout = this.device.createPipelineLayout({
      bindGroupLayouts: [coreLayout, stretchLayout],
    });
    const seamPipelineLayout = this.device.createPipelineLayout({
      bindGroupLayouts: [coreLayout, stretchLayout, seamLayout],
    });

    this.preSolvePipeline = this.device.createComputePipeline({
      label: 'preSolve',
      layout: corePipelineLayout,
      compute: { module: clothModule, entryPoint: 'preSolve' },
    });

    this.postSolvePipeline = this.device.createComputePipeline({
      label: 'postSolve',
      layout: corePipelineLayout,
      compute: { module: clothModule, entryPoint: 'postSolve' },
    });

    this.stretchPipeline = this.device.createComputePipeline({
      label: 'stretch',
      layout: stretchPipelineLayout,
      compute: { module: constraintsModule, entryPoint: 'solveStretch' },
    });

    this.seamPipeline = this.device.createComputePipeline({
      label: 'seam',
      layout: seamPipelineLayout,
      compute: { module: constraintsModule, entryPoint: 'solveSeams' },
    });

    // Normal pipelines
    const normalLayout = this.device.createBindGroupLayout({
      label: 'normals',
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      ],
    });
    const normalPipelineLayout = this.device.createPipelineLayout({
      bindGroupLayouts: [normalLayout],
    });

    this.normalAccumPipeline = this.device.createComputePipeline({
      label: 'normalAccum',
      layout: normalPipelineLayout,
      compute: { module: normalsModule, entryPoint: 'accumulateNormals' },
    });

    this.normalNormPipeline = this.device.createComputePipeline({
      label: 'normalNorm',
      layout: normalPipelineLayout,
      compute: { module: normalsModule, entryPoint: 'normalizeNormals' },
    });
  }

  private createBindGroups(): void {
    if (!this.buffers) return;

    const b = this.buffers;

    // Core bind group
    this.coreBindGroup = this.device.createBindGroup({
      label: 'core',
      layout: this.preSolvePipeline!.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: b.params } },
        { binding: 1, resource: { buffer: b.positions } },
        { binding: 2, resource: { buffer: b.prevPositions } },
        { binding: 3, resource: { buffer: b.velocities } },
        { binding: 4, resource: { buffer: b.invMass } },
      ],
    });

    // Stretch bind group
    this.stretchBindGroup = this.device.createBindGroup({
      label: 'stretch',
      layout: this.stretchPipeline!.getBindGroupLayout(1),
      entries: [
        { binding: 0, resource: { buffer: b.stretchIds } },
        { binding: 1, resource: { buffer: b.stretchRestLengths } },
      ],
    });

    // Seam bind group
    if (b.seamIds && b.seamTargetDist) {
      this.seamBindGroup = this.device.createBindGroup({
        label: 'seam',
        layout: this.seamPipeline!.getBindGroupLayout(2),
        entries: [
          { binding: 0, resource: { buffer: b.seamIds } },
          { binding: 1, resource: { buffer: b.seamTargetDist } },
        ],
      });
    }

    // Normal bind group
    if (this.normalParamsBuffer && this.triIdsBuffer && this.normalsAtomicBuffer) {
      this.normalBindGroup = this.device.createBindGroup({
        label: 'normals',
        layout: this.normalAccumPipeline!.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.normalParamsBuffer } },
          { binding: 1, resource: { buffer: b.positions } },
          { binding: 2, resource: { buffer: this.triIdsBuffer } },
          { binding: 3, resource: { buffer: this.normalsAtomicBuffer } },
          { binding: 4, resource: { buffer: b.normals } },
        ],
      });
    }
  }
}
