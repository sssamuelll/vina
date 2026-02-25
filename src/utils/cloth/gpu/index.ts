/**
 * WebGPU Cloth Simulation — GPU-accelerated XPBD solver.
 *
 * @module gpu
 */

export { isWebGPUAvailable, initWebGPU, getCpuFallback } from './webgpuDetect';
export type { GpuCapabilities, GpuContext, SolverBackend } from './webgpuDetect';

export { GpuClothSolver } from './gpuSolver';
export type { GpuSolverConfig } from './gpuSolver';

export {
  createClothBuffers,
  destroyClothBuffers,
  updateSimParams,
  readbackPositions,
  extractStretchConstraints,
  extractBendConstraints,
} from './gpuBuffers';
export type {
  ClothMeshData,
  StretchConstraints,
  BendConstraints,
  SeamConstraintData,
  SimParams,
  GpuClothBuffers,
} from './gpuBuffers';
