/**
 * GPU Cloth Solver — orchestrates WebGPU compute passes for XPBD simulation.
 *
 * Manages compute pipelines, bind groups, and the per-frame simulation loop.
 * Positions never leave the GPU during simulation — zero CPU↔GPU transfer.
 *
 * Key design decisions:
 * - Stretch constraints are graph-colored (capped at 16 colors) so each
 *   color group dispatches in its own compute pass without race conditions.
 * - Bend constraints use single Jacobi dispatch (soft constraints tolerate races).
 * - Body collision uses a brute-force point-vs-triangle shader dispatched
 *   per substep after constraint projection.
 * - SimParams uniform buffer uses DataView for correct u32/f32 bit packing.
 *
 * @module gpuSolver
 */

import type { GpuClothBuffers, SimParams, ClothMeshData, StretchConstraints, BendConstraints, SeamConstraintData, ColoredConstraints } from './gpuBuffers';
import { createClothBuffers, destroyClothBuffers, updateSimParams, readbackPositions, colorConstraints } from './gpuBuffers';

// Import WGSL shaders as strings (Vite handles ?raw)
import clothShaderSrc from './shaders/cloth.wgsl?raw';
import constraintsShaderSrc from './shaders/constraints.wgsl?raw';
import collisionShaderSrc from './shaders/collision.wgsl?raw';
import normalsShaderSrc from './shaders/normals.wgsl?raw';
import selfCollisionShaderSrc from './shaders/selfCollision.wgsl?raw';
import { buildAdjacency } from '../selfCollision';

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
  // Effective damping matching WASM: damping * (1 - internalDamping * 0.1)
  // = 0.99 * (1 - 0.3 * 0.1) = 0.9603
  damping: 0.9603,
  // Without UVs, all edges are classified as SHEAR.
  // WASM uses stretchComplianceShear=0.001 for SHEAR edges.
  // Using 0.0 makes cloth infinitely stiff (rigid plate, bounces/spins off body).
  stretchCompliance: 0.001,
  // WASM uses per-constraint bend compliance: warp=1.0, weft=1.0.
  // All edges without UVs → SHEAR → defaults to weft compliance = 1.0
  bendCompliance: 1.0,
  seamStiffness: 0.0,
  groundY: 0.0,
  collisionMargin: 0.005,
  clothThickness: 0.002,
  selfCollision: false,
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeStorageBuffer(
  device: GPUDevice,
  data: Float32Array | Uint32Array,
  label: string,
  usage: GPUBufferUsageFlags = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
): GPUBuffer {
  const buffer = device.createBuffer({
    label,
    size: Math.max(data.byteLength, 4), // minimum 4 bytes
    usage,
    mappedAtCreation: true,
  });
  if (data instanceof Float32Array) {
    new Float32Array(buffer.getMappedRange()).set(data);
  } else {
    new Uint32Array(buffer.getMappedRange()).set(data);
  }
  buffer.unmap();
  return buffer;
}

function makeDispatchUniform(device: GPUDevice, count: number, label: string): GPUBuffer {
  const data = new Uint32Array([count, 0, 0, 0]); // pad to 16 bytes
  const buffer = device.createBuffer({
    label,
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    mappedAtCreation: true,
  });
  new Uint32Array(buffer.getMappedRange()).set(data);
  buffer.unmap();
  return buffer;
}

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

  // Core bind group (params, pos, prevPos, vel, invMass)
  private coreBindGroup: GPUBindGroup | null = null;

  // Per-color stretch groups (graph-colored for race-free dispatch)
  private stretchColorBindGroups: GPUBindGroup[] = [];
  private stretchColorCounts: number[] = [];
  private stretchColorBuffers: GPUBuffer[] = []; // for cleanup

  // Bend constraints (single Jacobi dispatch — soft constraints tolerate races)
  private bendPipeline: GPUComputePipeline | null = null;
  private bendBindGroup: GPUBindGroup | null = null;
  private bendDispatchBuffer: GPUBuffer | null = null;
  private numBendConstraints: number = 0;
  private bendBuffers: GPUBuffer[] = []; // for cleanup

  // Seam bind group + dispatch uniform
  private seamBindGroup: GPUBindGroup | null = null;
  private seamDispatchBuffer: GPUBuffer | null = null;

  // Normal computation
  private normalBindGroup: GPUBindGroup | null = null;
  private triIdsBuffer: GPUBuffer | null = null;
  private normalsAtomicBuffer: GPUBuffer | null = null;
  private normalParamsBuffer: GPUBuffer | null = null;
  private numTriangles: number = 0;

  // Body collision
  private collisionPipeline: GPUComputePipeline | null = null;
  private collisionLayout: GPUBindGroupLayout | null = null;
  private collisionBindGroup: GPUBindGroup | null = null;
  private collisionVertsBuffer: GPUBuffer | null = null;
  private collisionNormalsBuffer: GPUBuffer | null = null;
  private collisionParamsBuffer: GPUBuffer | null = null;
  private collisionTriCount: number = 0;

  // Stored layouts for deferred bind group creation
  private stretchLayout: GPUBindGroupLayout | null = null;

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

    const numStretch = stretch.ids.length / 2;
    const numBend = bend.ids.length / 4;

    // Create seam dispatch uniform (needed before bind groups)
    const numSeam = seam ? seam.ids.length / 2 : 0;
    if (numSeam > 0) {
      this.seamDispatchBuffer = makeDispatchUniform(this.device, numSeam, 'seamDispatch');
    }

    // Create pipelines (stores layouts for bind group creation)
    await this.createPipelines();

    // Graph-color stretch constraints for race-free parallel dispatch
    this.createColoredStretchGroups(stretch);

    // Create bend constraint bind group (single Jacobi — soft constraints tolerate races)
    this.numBendConstraints = numBend;
    if (this.stretchLayout && numBend > 0) {
      const bendIdsBuffer = makeStorageBuffer(this.device, bend.ids, 'bendIds');
      const bendRestBuffer = makeStorageBuffer(this.device, bend.restAngles, 'bendRestAngles');
      this.bendDispatchBuffer = makeDispatchUniform(this.device, numBend, 'bendDispatch');
      this.bendBuffers = [bendIdsBuffer, bendRestBuffer];

      this.bendBindGroup = this.device.createBindGroup({
        label: 'bend',
        layout: this.stretchLayout,
        entries: [
          { binding: 0, resource: { buffer: bendIdsBuffer } },
          { binding: 1, resource: { buffer: bendRestBuffer } },
          { binding: 2, resource: { buffer: this.bendDispatchBuffer } },
        ],
      });
    }

    // Create core, seam, and normal bind groups
    this.createBindGroups();

    // Self-collision setup
    if (this.config.selfCollision) {
      this.initSelfCollision(triangles, mesh.positions.length / 3);
    }

    console.log('[GpuSolver] Initialized:', {
      particles: this.buffers.numParticles,
      stretchConstraints: numStretch,
      stretchColors: this.stretchColorBindGroups.length,
      bendConstraints: numBend,
      seamConstraints: numSeam,
      triangles: this.numTriangles,
      substeps: this.config.substeps,
      selfCollision: this.config.selfCollision,
    });
  }

  /**
   * Step the simulation forward one frame.
   * Dispatches all compute passes for N substeps.
   *
   * Per substep: preSolve → stretch → seam → collision → postSolve
   */
  step(dt?: number): void {
    if (!this.buffers || !this.preSolvePipeline || !this.coreBindGroup) return;

    const framedt = dt ?? this.dt;
    const sdt = framedt / this.config.substeps;
    // Update sdt in params buffer (offset 16 = 5th field, f32)
    this.device.queue.writeBuffer(this.buffers.params, 16, new Float32Array([sdt]));

    const encoder = this.device.createCommandEncoder({ label: 'cloth-step' });
    const particleWG = Math.ceil(this.buffers.numParticles / 256);

    for (let s = 0; s < this.config.substeps; s++) {
      // ─── Pre-solve: gravity + integration ───────────────────────
      const pre = encoder.beginComputePass({ label: 'preSolve' });
      pre.setPipeline(this.preSolvePipeline!);
      pre.setBindGroup(0, this.coreBindGroup!);
      pre.dispatchWorkgroups(particleWG);
      pre.end();

      // ─── Stretch constraints (per-color Gauss-Seidel dispatches) ───
      for (let c = 0; c < this.stretchColorBindGroups.length; c++) {
        const pass = encoder.beginComputePass({ label: `stretch-c${c}` });
        pass.setPipeline(this.stretchPipeline!);
        pass.setBindGroup(0, this.coreBindGroup!);
        pass.setBindGroup(1, this.stretchColorBindGroups[c]);
        pass.dispatchWorkgroups(Math.ceil(this.stretchColorCounts[c] / 256));
        pass.end();
      }

      // ─── Bend constraints (single Jacobi — soft constraints tolerate races) ───
      if (this.bendBindGroup && this.bendPipeline && this.numBendConstraints > 0) {
        const bend = encoder.beginComputePass({ label: 'bend' });
        bend.setPipeline(this.bendPipeline);
        bend.setBindGroup(0, this.coreBindGroup!);
        bend.setBindGroup(1, this.bendBindGroup);
        bend.dispatchWorkgroups(Math.ceil(this.numBendConstraints / 256));
        bend.end();
      }

      // ─── Seam constraints ──────────────────────────────────────
      if (this.seamBindGroup && this.seamPipeline && this.buffers.numSeamConstraints > 0 && this.stretchColorBindGroups.length > 0) {
        const sm = encoder.beginComputePass({ label: 'seam' });
        sm.setPipeline(this.seamPipeline);
        sm.setBindGroup(0, this.coreBindGroup!);
        // Pipeline layout requires group(1) even though seam shader doesn't use it
        sm.setBindGroup(1, this.stretchColorBindGroups[0]);
        sm.setBindGroup(2, this.seamBindGroup);
        sm.dispatchWorkgroups(Math.ceil(this.buffers.numSeamConstraints / 256));
        sm.end();
      }

      // ─── Body collision ─────────────────────────────────────────
      if (this.collisionBindGroup && this.collisionPipeline && this.collisionTriCount > 0) {
        const col = encoder.beginComputePass({ label: 'collision' });
        col.setPipeline(this.collisionPipeline);
        col.setBindGroup(0, this.collisionBindGroup);
        col.dispatchWorkgroups(particleWG);
        col.end();
      }

      // ─── Self-collision (4 passes) ─────────────────────────────
      if (this.config.selfCollision && this.scHashCountPipeline && this.scBindGroup && this.scAdjBindGroup) {
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

      // ─── Post-solve: velocity update ───────────────────────────
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
      const params: SimParams = {
        numParticles: this.buffers.numParticles,
        numStretchConstraints: this.buffers.numStretchConstraints,
        numBendConstraints: this.buffers.numBendConstraints,
        numSeamConstraints: this.buffers.numSeamConstraints,
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
      updateSimParams(this.device, this.buffers.params, params);
    }
  }

  /**
   * Set triangle collision mesh for body collision.
   * Call after init(). Can be called multiple times to update the mesh.
   *
   * @param mesh.vertices - Expanded triangle vertices (9 floats per tri: 3 verts × 3 components)
   * @param mesh.normals - Per-triangle normals (3 floats per tri)
   * @param mesh.triCount - Number of collision triangles
   */
  setCollisionMesh(mesh: { vertices: Float32Array; normals: Float32Array; triCount: number }): void {
    if (!this.buffers || !this.collisionLayout) return;

    // Clean up previous collision buffers
    this.collisionVertsBuffer?.destroy();
    this.collisionNormalsBuffer?.destroy();
    this.collisionParamsBuffer?.destroy();
    this.collisionBindGroup = null;

    this.collisionTriCount = mesh.triCount;

    if (mesh.triCount === 0) {
      return;
    }

    // Create collision mesh buffers
    this.collisionVertsBuffer = makeStorageBuffer(
      this.device, mesh.vertices, 'collisionVerts',
    );
    this.collisionNormalsBuffer = makeStorageBuffer(
      this.device, mesh.normals, 'collisionNormals',
    );

    // CollisionParams: { numParticles: u32, numTriangles: u32, margin: f32, friction: f32 }
    const paramsData = new ArrayBuffer(16);
    const view = new DataView(paramsData);
    view.setUint32(0, this.buffers.numParticles, true);
    view.setUint32(4, mesh.triCount, true);
    view.setFloat32(8, this.config.collisionMargin, true);
    view.setFloat32(12, 0.3, true); // default friction

    this.collisionParamsBuffer = this.device.createBuffer({
      label: 'collisionParams',
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Uint8Array(this.collisionParamsBuffer.getMappedRange()).set(new Uint8Array(paramsData));
    this.collisionParamsBuffer.unmap();

    // Create collision bind group
    this.collisionBindGroup = this.device.createBindGroup({
      label: 'collision',
      layout: this.collisionLayout,
      entries: [
        { binding: 0, resource: { buffer: this.buffers.positions } },
        { binding: 1, resource: { buffer: this.collisionVertsBuffer } },
        { binding: 2, resource: { buffer: this.collisionNormalsBuffer } },
        { binding: 3, resource: { buffer: this.collisionParamsBuffer } },
      ],
    });

    console.log('[GpuSolver] Collision mesh set:', { triCount: mesh.triCount });
  }

  /**
   * Update collision mesh vertices and normals (same triangle count).
   * More efficient than setCollisionMesh — reuses existing buffers.
   */
  updateCollisionMesh(vertices: Float32Array, normals: Float32Array): void {
    if (this.collisionVertsBuffer && this.collisionNormalsBuffer) {
      this.device.queue.writeBuffer(this.collisionVertsBuffer, 0, vertices);
      this.device.queue.writeBuffer(this.collisionNormalsBuffer, 0, normals);
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

    // Normal buffers
    this.triIdsBuffer?.destroy();
    this.normalsAtomicBuffer?.destroy();
    this.normalParamsBuffer?.destroy();
    this.triIdsBuffer = null;
    this.normalsAtomicBuffer = null;
    this.normalParamsBuffer = null;

    // Stretch color buffers
    for (const buf of this.stretchColorBuffers) buf.destroy();
    this.stretchColorBuffers = [];
    this.stretchColorBindGroups = [];
    this.stretchColorCounts = [];

    // Bend buffers
    for (const buf of this.bendBuffers) buf.destroy();
    this.bendBuffers = [];
    this.bendDispatchBuffer?.destroy();
    this.bendDispatchBuffer = null;
    this.bendBindGroup = null;
    this.numBendConstraints = 0;

    // Seam dispatch
    this.seamDispatchBuffer?.destroy();
    this.seamDispatchBuffer = null;

    // Collision buffers
    this.collisionVertsBuffer?.destroy();
    this.collisionNormalsBuffer?.destroy();
    this.collisionParamsBuffer?.destroy();
    this.collisionVertsBuffer = null;
    this.collisionNormalsBuffer = null;
    this.collisionParamsBuffer = null;
    this.collisionTriCount = 0;

    // Pipelines and bind groups
    this.preSolvePipeline = null;
    this.stretchPipeline = null;
    this.bendPipeline = null;
    this.seamPipeline = null;
    this.postSolvePipeline = null;
    this.normalAccumPipeline = null;
    this.normalNormPipeline = null;
    this.collisionPipeline = null;
    this.coreBindGroup = null;
    this.seamBindGroup = null;
    this.normalBindGroup = null;
    this.collisionBindGroup = null;
    this.collisionLayout = null;
    this.stretchLayout = null;

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

    // Collision shader module (solveBodyCollision)
    const collisionModule = this.device.createShaderModule({
      label: 'collision',
      code: collisionShaderSrc,
    });

    // Normals shader module
    const normalsModule = this.device.createShaderModule({
      label: 'normals',
      code: normalsShaderSrc,
    });

    // ─── Bind group layouts ──────────────────────────────────────────

    // Core layout: params(uniform), pos(rw), prevPos(rw), vel(rw), invMass(ro)
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

    // Stretch layout: ids(ro), restLengths(ro), dispatchParams(uniform)
    this.stretchLayout = this.device.createBindGroupLayout({
      label: 'stretch',
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      ],
    });

    // Seam layout: seamIds(ro), seamTargetDist(ro), seamDispatch(uniform)
    const seamLayout = this.device.createBindGroupLayout({
      label: 'seam',
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      ],
    });

    // Collision layout: pos(rw), collisionVerts(ro), collisionNormals(ro), cparams(uniform)
    this.collisionLayout = this.device.createBindGroupLayout({
      label: 'collision',
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      ],
    });

    // ─── Pipeline layouts ────────────────────────────────────────────

    const corePipelineLayout = this.device.createPipelineLayout({
      bindGroupLayouts: [coreLayout],
    });
    const stretchPipelineLayout = this.device.createPipelineLayout({
      bindGroupLayouts: [coreLayout, this.stretchLayout],
    });
    // Seam pipeline needs group(2), so layout must include [core, stretch, seam]
    const seamPipelineLayout = this.device.createPipelineLayout({
      bindGroupLayouts: [coreLayout, this.stretchLayout, seamLayout],
    });
    const collisionPipelineLayout = this.device.createPipelineLayout({
      bindGroupLayouts: [this.collisionLayout],
    });

    // ─── Compute pipelines ───────────────────────────────────────────

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

    this.bendPipeline = this.device.createComputePipeline({
      label: 'bend',
      layout: stretchPipelineLayout,
      compute: { module: constraintsModule, entryPoint: 'solveBend' },
    });

    this.seamPipeline = this.device.createComputePipeline({
      label: 'seam',
      layout: seamPipelineLayout,
      compute: { module: constraintsModule, entryPoint: 'solveSeams' },
    });

    this.collisionPipeline = this.device.createComputePipeline({
      label: 'collision',
      layout: collisionPipelineLayout,
      compute: { module: collisionModule, entryPoint: 'solveBodyCollision' },
    });

    // ─── Normal pipelines ────────────────────────────────────────────

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

    // Seam bind group (with dispatch uniform)
    if (b.seamIds && b.seamTargetDist && this.seamDispatchBuffer) {
      this.seamBindGroup = this.device.createBindGroup({
        label: 'seam',
        layout: this.seamPipeline!.getBindGroupLayout(2),
        entries: [
          { binding: 0, resource: { buffer: b.seamIds } },
          { binding: 1, resource: { buffer: b.seamTargetDist } },
          { binding: 2, resource: { buffer: this.seamDispatchBuffer } },
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

  /**
   * Graph-color stretch constraints and create per-color GPU bind groups.
   * Caps at maxColors to bound dispatch count; excess colors are merged
   * (introduces minor races but maintains mostly race-free behavior).
   */
  private createColoredStretchGroups(stretch: StretchConstraints): void {
    const numStretch = stretch.ids.length / 2;
    if (numStretch === 0 || !this.stretchLayout) return;

    const maxColors = 16;
    let colored = colorConstraints(stretch.ids, stretch.restLengths, numStretch);

    // Cap at maxColors if needed
    if (colored.colorRanges.length > maxColors) {
      colored = this.capColorGroups(colored, maxColors);
    }

    // Create per-color bind groups
    for (let ci = 0; ci < colored.colorRanges.length; ci++) {
      const range = colored.colorRanges[ci];
      const colorIds = colored.ids.slice(range.offset * 2, (range.offset + range.count) * 2);
      const colorRest = colored.restLengths.slice(range.offset, range.offset + range.count);

      const idsBuffer = makeStorageBuffer(this.device, colorIds, `stretch-ids-c${ci}`);
      const restBuffer = makeStorageBuffer(this.device, colorRest, `stretch-rest-c${ci}`);
      const dispatchBuffer = makeDispatchUniform(this.device, range.count, `stretch-dispatch-c${ci}`);

      this.stretchColorBuffers.push(idsBuffer, restBuffer, dispatchBuffer);
      this.stretchColorCounts.push(range.count);

      this.stretchColorBindGroups.push(
        this.device.createBindGroup({
          label: `stretch-c${ci}`,
          layout: this.stretchLayout!,
          entries: [
            { binding: 0, resource: { buffer: idsBuffer } },
            { binding: 1, resource: { buffer: restBuffer } },
            { binding: 2, resource: { buffer: dispatchBuffer } },
          ],
        }),
      );
    }

    console.log(`[GpuSolver] Stretch coloring: ${colored.colorRanges.length} colors for ${numStretch} constraints`);
  }

  /**
   * Cap the number of color groups by merging excess groups into the first maxColors.
   */
  private capColorGroups(colored: ColoredConstraints, maxColors: number): ColoredConstraints {
    const ranges = colored.colorRanges;
    if (ranges.length <= maxColors) return colored;

    // Assign each existing color to a capped group (round-robin)
    const newGroupIndices: number[][] = Array.from({ length: maxColors }, () => []);
    for (let c = 0; c < ranges.length; c++) {
      const target = c % maxColors;
      const range = ranges[c];
      for (let j = 0; j < range.count; j++) {
        newGroupIndices[target].push(range.offset + j);
      }
    }

    // Rebuild flat arrays
    const total = colored.ids.length / 2;
    const newIds = new Uint32Array(total * 2);
    const newRest = new Float32Array(total);
    const newRanges: Array<{ offset: number; count: number }> = [];
    let offset = 0;

    for (const group of newGroupIndices) {
      newRanges.push({ offset, count: group.length });
      for (let j = 0; j < group.length; j++) {
        const srcIdx = group[j];
        newIds[(offset + j) * 2] = colored.ids[srcIdx * 2];
        newIds[(offset + j) * 2 + 1] = colored.ids[srcIdx * 2 + 1];
        newRest[offset + j] = colored.restLengths[srcIdx];
      }
      offset += group.length;
    }

    console.log(`[GpuSolver] Capped ${ranges.length} colors → ${maxColors}`);
    return { ids: newIds, restLengths: newRest, colorRanges: newRanges };
  }

  /**
   * Initialize self-collision buffers, pipelines, and bind groups.
   */
  private initSelfCollision(triangles: Uint32Array, numParticles: number): void {
    if (!this.buffers) return;

    // Build adjacency in CSR format
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

    // Hash table sizing (prime ~2× particles)
    let ts = numParticles * 2;
    if (ts % 2 === 0) ts++;
    outer: while (true) {
      const lim = Math.floor(Math.sqrt(ts));
      for (let d = 3; d <= lim; d += 2) {
        if (ts % d === 0) { ts += 2; continue outer; }
      }
      break;
    }
    this.scTableSize = ts;

    // Params uniform
    const paramsData = new ArrayBuffer(16);
    const pView = new DataView(paramsData);
    pView.setUint32(0, numParticles, true);
    pView.setUint32(4, ts, true);
    pView.setFloat32(8, this.config.clothThickness, true);
    pView.setUint32(12, 0, true);

    this.scParamsBuffer = this.device.createBuffer({
      label: 'sc-params',
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Uint8Array(this.scParamsBuffer.getMappedRange()).set(new Uint8Array(paramsData));
    this.scParamsBuffer.unmap();

    this.scCellCountBuffer = this.device.createBuffer({
      label: 'sc-cellCount',
      size: ts * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    this.scCellStartBuffer = this.device.createBuffer({
      label: 'sc-cellStart',
      size: ts * 4,
      usage: GPUBufferUsage.STORAGE,
    });

    this.scCellEntriesBuffer = this.device.createBuffer({
      label: 'sc-cellEntries',
      size: numParticles * 4,
      usage: GPUBufferUsage.STORAGE,
    });

    this.scAdjOffsetsBuffer = this.device.createBuffer({
      label: 'sc-adjOffsets',
      size: offsets.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Uint32Array(this.scAdjOffsetsBuffer.getMappedRange()).set(offsets);
    this.scAdjOffsetsBuffer.unmap();

    this.scAdjNeighborsBuffer = this.device.createBuffer({
      label: 'sc-adjNeighbors',
      size: Math.max(neighbors.byteLength, 4),
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Uint32Array(this.scAdjNeighborsBuffer.getMappedRange()).set(neighbors);
    this.scAdjNeighborsBuffer.unmap();

    // Pipelines
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

    // Bind groups
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
}
