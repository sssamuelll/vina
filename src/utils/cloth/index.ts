/**
 * Cloth Simulation Module
 * 
 * Exports all types and utilities for cloth simulation including
 * XPBD solver, SDF generation, and avatar mesh extraction.
 * 
 * @module cloth
 */

// Core XPBD solver exports
export {
  XPBDClothSolver,
  generateRectClothMesh,
  triangulatePieceOutline,
  type ClothSimConfig,
  type SphereCollider,
  type CapsuleCollider,
  type ClothMeshData,
  type ClothSnapshot
} from './xpbdSolver';

// SDF generation exports
export {
  generateSDF,
  sampleSDF,
  sdfGradient,
  type SDFData
} from './sdfGenerator';

// Avatar mesh extraction exports
export {
  extractAvatarMesh,
  createTestMesh,
  validateMeshData,
  type ExtractedMeshData
} from './avatarMeshExtractor';

// Worker client exports
export {
  ClothWorkerClient,
  type FrameCallback
} from './clothWorkerClient';

// Fabric library exports
export {
  FABRIC_LIBRARY,
  getComplianceForFabric,
  type FabricMaterial
} from './fabricLibrary';