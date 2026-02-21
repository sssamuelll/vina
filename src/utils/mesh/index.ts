/**
 * CDT Meshing Module for OpenClo
 *
 * Provides high-quality triangle mesh generation using Constrained Delaunay
 * Triangulation (CDT) for cloth simulation. Replaces ear-clipping with proper
 * CDT for better physics stability.
 *
 * @module mesh
 */

// ─── Core Functions ─────────────────────────────────────────────────────────

export {
  meshPiece,
  meshPieceOutline,
  type MeshConfig,
} from './cdtMesher';

export {
  refineMesh,
  type RefinementResult,
} from './refine';

// ─── Re-exports from cloth solver for convenience ──────────────────────────

export type { ClothMeshData } from '../cloth/xpbdSolver';