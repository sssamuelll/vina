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
import collisionShaderSrc from './shaders/collision.wgsl?raw';
import selfCollisionShaderSrc from './shaders/selfCollision.wgsl?raw';
import { buildAdjacency } from '../selfCollision';

import type { SDFData } from '../sdfGenerator';

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
  groundY: 0.0,
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
  private collisionPipeline: GPUComputePipeline | null = null;

  // Bind groups
  private coreBindGroup: GPUBindGroup | null = null;
  private stretchBindGroup: GPUBindGroup | null = null;
  private seamBindGroup: GPUBindGroup | null = null;
  private normalBindGroup: GPUBindGroup | null = null;
  private collisionBindGroup: GPUBindGroup | null = null;

  // Additional buffers for normals
  private triIdsBuffer: GPUBuffer | null = null;
  private normalsAtomicBuffer: GPUBuffer | null = null;
  private normalParamsBuffer: GPUBuffer | null = null;
  private numTriangles: number = 0;

  // SDF collision
  private sdfBuffer: GPUBuffer | null = null;
  private collisionParamsBuffer: GPUBuffer | null = null;
  private hasSDF: boolean = false;

  // Self-collision spatial hash
  private scHashCountPipeline: GPUComputePipeline | null = null;
  private scPrefixSumPipeline: GPUComputePipeline | null = null;
  private scScatterPipeline: GPUComputePipeline | null = null;
  private scResolvePipeline: GPUComputePipeline | null = null;
  private scBindGroup: GPUBindGroup | null = null;
  private scAdjBindGroup: GPUBindGroup | null = null;
  private scParamsBuffer: GPUBuffer | null = null;
  private scCellCountBuffer: GPUBuffer | null = null;
  private scCellStartBuffer: GPUBuffer | null = null;
  private scCellEntriesBuffer: GPUBuffer | null = null;
  private scAdjOffsetsBuffer: GPUBuffer | null = null;
  private scAdjNeighborsBuffer: GPUBuffer | null = null;
  private scTableSize: number = 0;

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

    // Self-collision setup
    if (this.config.selfCollision) {
      this.initSelfCollision(triangles, mesh.positions.length / 3);
    }

    console.log('[GpuSolver] Initialized:', {
      particles: this.buffers.numParticles,
      stretchConstraints: this.buffers.numStretchConstraints,
      bendConstraints: this.buffers.numBendConstraints,
      seamConstraints: this.buffers.numSeamConstraints,
      triangles: this.numTriangles,
      selfCollision: this.config.selfCollision,
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

      // SDF body collision
      if (this.hasSDF && this.collisionPipeline && this.collisionBindGroup) {
        const col = encoder.beginComputePass({ label: 'collision' });
        col.setPipeline(this.collisionPipeline);
        col.setBindGroup(0, this.collisionBindGroup);
        col.dispatchWorkgroups(particleWG);
        col.end();
      }

      // Self-collision (4 passes: hash, prefix sum, scatter, resolve)
      if (this.config.selfCollision && this.scHashCountPipeline && this.scBindGroup && this.scAdjBindGroup) {
        // Clear cellCount buffer
        encoder.clearBuffer(this.scCellCountBuffer!, 0, this.scTableSize * 4);

        const scWG = particleWG;

        const h = encoder.beginComputePass({ label: 'sc-hashCount' });
        h.setPipeline(this.scHashCountPipeline);
        h.setBindGroup(0, this.scBindGroup);
        h.setBindGroup(1, this.scAdjBindGroup);
        h.dispatchWorkgroups(scWG);
        h.end();

        const ps = encoder.beginComputePass({ label: 'sc-prefixSum' });
        ps.setPipeline(this.scPrefixSumPipeline!);
        ps.setBindGroup(0, this.scBindGroup);
        ps.setBindGroup(1, this.scAdjBindGroup);
        ps.dispatchWorkgroups(1);
        ps.end();

        const sc = encoder.beginComputePass({ label: 'sc-scatter' });
        sc.setPipeline(this.scScatterPipeline!);
        sc.setBindGroup(0, this.scBindGroup);
        sc.setBindGroup(1, this.scAdjBindGroup);
        sc.dispatchWorkgroups(scWG);
        sc.end();

        const res = encoder.beginComputePass({ label: 'sc-resolve' });
        res.setPipeline(this.scResolvePipeline!);
        res.setBindGroup(0, this.scBindGroup);
        res.setBindGroup(1, this.scAdjBindGroup);
        res.dispatchWorkgroups(scWG);
        res.end();
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
   * Upload SDF volume for body collision.
   * SDF is generated CPU-side from avatar mesh, uploaded once (or per pose change).
   */
  setSDF(sdf: SDFData): void {
    if (!this.buffers) return;

    // Destroy old SDF buffers
    this.sdfBuffer?.destroy();
    this.collisionParamsBuffer?.destroy();

    // Upload SDF volume
    this.sdfBuffer = this.device.createBuffer({
      label: 'sdfVolume',
      size: sdf.distances.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Float32Array(this.sdfBuffer.getMappedRange()).set(sdf.distances);
    this.sdfBuffer.unmap();

    // Collision params uniform (must match CollisionParams struct in collision.wgsl)
    // Layout: numParticles(u32), resolution(u32), pad, pad, minX, minY, minZ, cellSize, margin, friction, pad, pad
    const cpData = new ArrayBuffer(48); // 12 × 4 bytes
    const cpView = new DataView(cpData);
    cpView.setUint32(0, this.buffers.numParticles, true);
    cpView.setUint32(4, sdf.resolution, true);
    cpView.setUint32(8, 0, true);  // pad
    cpView.setUint32(12, 0, true); // pad
    cpView.setFloat32(16, sdf.min[0], true);
    cpView.setFloat32(20, sdf.min[1], true);
    cpView.setFloat32(24, sdf.min[2], true);
    cpView.setFloat32(28, sdf.cellSize, true);
    cpView.setFloat32(32, this.config.collisionMargin, true);
    cpView.setFloat32(36, 0.3, true);  // friction
    cpView.setFloat32(40, 0, true); // pad
    cpView.setFloat32(44, 0, true); // pad

    this.collisionParamsBuffer = this.device.createBuffer({
      label: 'collisionParams',
      size: cpData.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Uint8Array(this.collisionParamsBuffer.getMappedRange()).set(new Uint8Array(cpData));
    this.collisionParamsBuffer.unmap();

    // Create collision bind group
    if (this.collisionPipeline) {
      this.collisionBindGroup = this.device.createBindGroup({
        label: 'collision',
        layout: this.collisionPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.collisionParamsBuffer } },
          { binding: 1, resource: { buffer: this.buffers.positions } },
          { binding: 2, resource: { buffer: this.buffers.prevPositions } },
          { binding: 3, resource: { buffer: this.buffers.invMass } },
          { binding: 4, resource: { buffer: this.sdfBuffer } },
        ],
      });
      this.hasSDF = true;
    }

    console.log('[GpuSolver] SDF uploaded:', {
      resolution: sdf.resolution,
      volumeSize: `${(sdf.distances.byteLength / 1024).toFixed(0)}KB`,
      bounds: `[${sdf.min.map(v => v.toFixed(2))}] → [${sdf.max.map(v => v.toFixed(2))}]`,
    });
  }

  /**
   * Clear SDF collision (cloth will pass through avatar).
   */
  clearSDF(): void {
    this.sdfBuffer?.destroy();
    this.collisionParamsBuffer?.destroy();
    this.sdfBuffer = null;
    this.collisionParamsBuffer = null;
    this.collisionBindGroup = null;
    this.hasSDF = false;
  }

  /**
   * Update solver config (fabric properties, etc.)
   */
  updateConfig(config: Partial<GpuSolverConfig>): void {
    this.config = { ...this.config, ...config };
    if (this.buffers) {
      const params = this.buildSimParams(
        { positions: new Float32Array(0), triangles: new Uint32Array(0), invMass: new Float32Array(0) },
        { ids: new Uint32Array(0), restLengths: new Float32Array(0), edgeTypes: new Uint8Array(0) },
        { ids: new Uint32Array(0), restAngles: new Float32Array(0), edgeTypes: new Uint8Array(0) },
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
    this.collisionPipeline = null;
    this.coreBindGroup = null;
    this.stretchBindGroup = null;
    this.seamBindGroup = null;
    this.normalBindGroup = null;
    this.collisionBindGroup = null;
    this.sdfBuffer?.destroy();
    this.collisionParamsBuffer?.destroy();
    this.sdfBuffer = null;
    this.collisionParamsBuffer = null;
    this.hasSDF = false;
    // Self-collision cleanup
    this.scParamsBuffer?.destroy();
    this.scCellCountBuffer?.destroy();
    this.scCellStartBuffer?.destroy();
    this.scCellEntriesBuffer?.destroy();
    this.scAdjOffsetsBuffer?.destroy();
    this.scAdjNeighborsBuffer?.destroy();
    this.scParamsBuffer = null;
    this.scCellCountBuffer = null;
    this.scCellStartBuffer = null;
    this.scCellEntriesBuffer = null;
    this.scAdjOffsetsBuffer = null;
    this.scAdjNeighborsBuffer = null;
    this.scHashCountPipeline = null;
    this.scPrefixSumPipeline = null;
    this.scScatterPipeline = null;
    this.scResolvePipeline = null;
    this.scBindGroup = null;
    this.scAdjBindGroup = null;
    this.scTableSize = 0;
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

    // Collision pipeline
    const collisionModule = this.device.createShaderModule({
      label: 'collision',
      code: collisionShaderSrc,
    });
    const collisionLayout = this.device.createBindGroupLayout({
      label: 'collision',
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      ],
    });
    this.collisionPipeline = this.device.createComputePipeline({
      label: 'collision',
      layout: this.device.createPipelineLayout({ bindGroupLayouts: [collisionLayout] }),
      compute: { module: collisionModule, entryPoint: 'solveCollision' },
    });
  }

  /**
   * Initialize self-collision buffers, pipelines, and bind groups.
   * Builds adjacency from triangle data (CSR format), allocates hash table buffers.
   */
  private initSelfCollision(triangles: Uint32Array, numParticles: number): void {
    if (!this.buffers) return;

    // ─── Build adjacency in CSR format ──────────────────────────────
    const adjSets = buildAdjacency(new Int32Array(triangles.buffer, triangles.byteOffset, triangles.length), numParticles);
    const offsets = new Uint32Array(numParticles + 1);
    let totalNeighbors = 0;
    for (let i = 0; i < numParticles; i++) {
      offsets[i] = totalNeighbors;
      totalNeighbors += adjSets[i].size;
    }
    offsets[numParticles] = totalNeighbors;

    const neighbors = new Uint32Array(Math.max(totalNeighbors, 1));
    for (let i = 0; i < numParticles; i++) {
      let k = offsets[i];
      for (const n of adjSets[i]) {
        neighbors[k++] = n;
      }
    }

    // ─── Hash table sizing ──────────────────────────────────────────
    // Prime table size ~2× particles
    let ts = numParticles * 2;
    // Simple next-odd prime search
    if (ts % 2 === 0) ts++;
    outer: while (true) {
      const lim = Math.floor(Math.sqrt(ts));
      for (let d = 3; d <= lim; d += 2) {
        if (ts % d === 0) { ts += 2; continue outer; }
      }
      break;
    }
    this.scTableSize = ts;

    // ─── Create buffers ─────────────────────────────────────────────
    // Params uniform
    const paramsData = new ArrayBuffer(16);
    const pView = new DataView(paramsData);
    pView.setUint32(0, numParticles, true);
    pView.setUint32(4, ts, true);
    pView.setFloat32(8, this.config.clothThickness, true);
    pView.setUint32(12, 0, true); // pad

    this.scParamsBuffer = this.device.createBuffer({
      label: 'sc-params',
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Uint8Array(this.scParamsBuffer.getMappedRange()).set(new Uint8Array(paramsData));
    this.scParamsBuffer.unmap();

    // Cell count (atomic u32)
    this.scCellCountBuffer = this.device.createBuffer({
      label: 'sc-cellCount',
      size: ts * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    // Cell start
    this.scCellStartBuffer = this.device.createBuffer({
      label: 'sc-cellStart',
      size: ts * 4,
      usage: GPUBufferUsage.STORAGE,
    });

    // Cell entries
    this.scCellEntriesBuffer = this.device.createBuffer({
      label: 'sc-cellEntries',
      size: numParticles * 4,
      usage: GPUBufferUsage.STORAGE,
    });

    // Adjacency offsets
    this.scAdjOffsetsBuffer = this.device.createBuffer({
      label: 'sc-adjOffsets',
      size: offsets.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Uint32Array(this.scAdjOffsetsBuffer.getMappedRange()).set(offsets);
    this.scAdjOffsetsBuffer.unmap();

    // Adjacency neighbors
    this.scAdjNeighborsBuffer = this.device.createBuffer({
      label: 'sc-adjNeighbors',
      size: Math.max(neighbors.byteLength, 4),
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Uint32Array(this.scAdjNeighborsBuffer.getMappedRange()).set(neighbors);
    this.scAdjNeighborsBuffer.unmap();

    // ─── Pipelines ──────────────────────────────────────────────────
    const scModule = this.device.createShaderModule({
      label: 'selfCollision',
      code: selfCollisionShaderSrc,
    });

    const scLayout = this.device.createBindGroupLayout({
      label: 'sc-main',
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      ],
    });

    const adjLayout = this.device.createBindGroupLayout({
      label: 'sc-adj',
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      ],
    });

    const scPipelineLayout = this.device.createPipelineLayout({
      bindGroupLayouts: [scLayout, adjLayout],
    });

    this.scHashCountPipeline = this.device.createComputePipeline({
      label: 'sc-hashCount',
      layout: scPipelineLayout,
      compute: { module: scModule, entryPoint: 'hashCount' },
    });
    this.scPrefixSumPipeline = this.device.createComputePipeline({
      label: 'sc-prefixSum',
      layout: scPipelineLayout,
      compute: { module: scModule, entryPoint: 'prefixSum' },
    });
    this.scScatterPipeline = this.device.createComputePipeline({
      label: 'sc-scatter',
      layout: scPipelineLayout,
      compute: { module: scModule, entryPoint: 'scatter' },
    });
    this.scResolvePipeline = this.device.createComputePipeline({
      label: 'sc-resolve',
      layout: scPipelineLayout,
      compute: { module: scModule, entryPoint: 'resolveCollisions' },
    });

    // ─── Bind groups ────────────────────────────────────────────────
    this.scBindGroup = this.device.createBindGroup({
      label: 'sc-main',
      layout: scLayout,
      entries: [
        { binding: 0, resource: { buffer: this.scParamsBuffer } },
        { binding: 1, resource: { buffer: this.buffers.positions } },
        { binding: 2, resource: { buffer: this.buffers.invMass } },
        { binding: 3, resource: { buffer: this.scCellCountBuffer } },
        { binding: 4, resource: { buffer: this.scCellStartBuffer } },
        { binding: 5, resource: { buffer: this.scCellEntriesBuffer } },
      ],
    });

    this.scAdjBindGroup = this.device.createBindGroup({
      label: 'sc-adj',
      layout: adjLayout,
      entries: [
        { binding: 0, resource: { buffer: this.scAdjOffsetsBuffer } },
        { binding: 1, resource: { buffer: this.scAdjNeighborsBuffer } },
      ],
    });

    console.log('[GpuSolver] Self-collision initialized:', {
      tableSize: ts,
      adjNeighbors: totalNeighbors,
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
