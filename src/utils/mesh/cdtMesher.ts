/**
 * CDT (Constrained Delaunay Triangulation) Mesher for OpenClo
 *
 * Replaces ear-clipping triangulation with proper CDT using cdt2d + clean-pslg
 * for simulation-quality meshes. This is the foundation for cloth simulation —
 * bad triangles = unstable physics.
 *
 * @module cdtMesher
 */

import cdt2d from 'cdt2d';
import cleanPSLG from 'clean-pslg';
import type { PatternPiece, Point2D, PathCommand } from '../../types/types';
import type { ClothMeshData } from '../cloth/xpbdSolver';
import { flattenPath } from '../seam/index';
import { refineMesh } from './refine';

// ─── Configuration ──────────────────────────────────────────────────────────

/** Configuration for CDT mesh generation */
export interface MeshConfig {
  /** Y height in 3D space (default 1.2m above ground) */
  yHeight?: number;
  /** Scale factor from pattern units to meters (default 0.003 = mm→m) */
  scale?: number;
  /** Maximum edge length in pattern units before refinement (default 15mm) */
  maxEdgeLength?: number;
  /** Minimum triangle angle in degrees before refinement (default 25°) */
  minAngle?: number;
  /** Maximum refinement passes to prevent infinite loops (default 3) */
  maxRefinementPasses?: number;
  /** Curve resolution for flattening Bezier curves (default 12) */
  curveResolution?: number;
}

/** Default mesh configuration */
const DEFAULT_CONFIG: Required<MeshConfig> = {
  yHeight: 1.2,
  scale: 0.001, // 1mm = 0.001m
  maxEdgeLength: 15,
  minAngle: 25,
  maxRefinementPasses: 3,
  curveResolution: 12,
};

// ─── Core Functions ─────────────────────────────────────────────────────────

/**
 * Convert a PatternPiece to a high-quality mesh using Constrained Delaunay Triangulation.
 *
 * This function:
 * 1. Flattens the outline and internal lines to 2D points
 * 2. Converts to PSLG (Planar Straight Line Graph) format
 * 3. Runs cleanPSLG to fix self-intersections and T-junctions
 * 4. Runs CDT with interior-only triangles
 * 5. Applies Ruppert-style refinement for quality triangles
 * 6. Returns ClothMeshData with 3D vertices ready for XPBD solver
 *
 * @param piece - Pattern piece to mesh
 * @param config - Mesh generation configuration
 * @returns ClothMeshData ready for cloth simulation
 */
export function meshPiece(piece: PatternPiece, config: MeshConfig = {}): ClothMeshData {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  try {
    // Flatten the outline to 2D points
    const outlinePoints = flattenPath(piece.outline, cfg.curveResolution);
    
    if (outlinePoints.length < 3) {
      return { vertices: new Float32Array(0), triIds: new Int32Array(0) };
    }

    return meshPieceOutline(outlinePoints, piece.internals, cfg);
  } catch (error) {
    console.warn('CDT meshing failed for piece', piece.id, ':', error);
    return { vertices: new Float32Array(0), triIds: new Int32Array(0) };
  }
}

/**
 * Lower-level function that takes flattened 2D points directly.
 *
 * @param outlinePoints - 2D outline points (closed polygon)
 * @param internalLines - Internal lines (darts, fold lines) to constrain
 * @param config - Mesh generation configuration
 * @returns ClothMeshData ready for cloth simulation
 */
export function meshPieceOutline(
  outlinePoints: Point2D[],
  internalLines: { path: PathCommand[] }[] = [],
  config: Required<MeshConfig> = DEFAULT_CONFIG,
): ClothMeshData {
  if (outlinePoints.length < 3) {
    return { vertices: new Float32Array(0), triIds: new Int32Array(0) };
  }

  // Remove duplicate consecutive points
  const cleanOutline = removeDuplicatePoints(outlinePoints);
  if (cleanOutline.length < 3) {
    return { vertices: new Float32Array(0), triIds: new Int32Array(0) };
  }

  // Convert to PSLG format
  const { points, edges } = convertToPSLG(cleanOutline, internalLines, config.curveResolution);

  if (points.length < 3 || edges.length === 0) {
    return { vertices: new Float32Array(0), triIds: new Int32Array(0) };
  }

  // Clean PSLG to fix self-intersections and T-junctions
  // Note: cleanPSLG may return false but still process the data successfully
  cleanPSLG(points, edges);

  // Run Constrained Delaunay Triangulation
  let triangles: number[][];
  try {
    triangles = cdt2d(points, edges, {
      interior: true,
      exterior: false, // Only interior triangles for cloth simulation
    });
  } catch (error) {
    console.warn('CDT failed:', error);
    return { vertices: new Float32Array(0), triIds: new Int32Array(0) };
  }

  if (triangles.length === 0) {
    // Try with exterior triangles as fallback
    try {
      triangles = cdt2d(points, edges, {
        interior: true,
        exterior: true,
      });
    } catch (error) {
      console.warn('CDT with exterior also failed:', error);
      return { vertices: new Float32Array(0), triIds: new Int32Array(0) };
    }
    
    if (triangles.length === 0) {
      return { vertices: new Float32Array(0), triIds: new Int32Array(0) };
    }
  }

  // Apply refinement for better quality triangles (with fallback)
  try {
    const refined = refineMesh(points, triangles, edges, config.maxEdgeLength, config.minAngle, config.maxRefinementPasses);
    
    // Only use refined result if it produced valid triangles
    if (refined.triangles.length > 0) {
      return convertToClothMeshData(refined.points, refined.triangles, config);
    } else {
      console.warn('Refinement produced no triangles, falling back to basic CDT');
    }
  } catch (error) {
    console.warn('Refinement failed, falling back to basic CDT:', error);
  }
  
  // Fallback to basic CDT mesh
  return convertToClothMeshData(points, triangles, config);
}

// ─── Helper Functions ───────────────────────────────────────────────────────

/**
 * Remove consecutive duplicate points from a polygon outline.
 *
 * @param points - Input 2D points
 * @param tolerance - Distance tolerance for considering points identical
 * @returns Cleaned point array
 */
function removeDuplicatePoints(points: Point2D[], tolerance: number = 0.001): Point2D[] {
  if (points.length <= 1) return points;

  const result: Point2D[] = [points[0]];
  
  for (let i = 1; i < points.length; i++) {
    const prev = result[result.length - 1];
    const curr = points[i];
    
    const dx = curr.x - prev.x;
    const dy = curr.y - prev.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    if (dist > tolerance) {
      result.push(curr);
    }
  }

  // Check if last point is too close to first (close polygon)
  if (result.length > 2) {
    const first = result[0];
    const last = result[result.length - 1];
    const dx = last.x - first.x;
    const dy = last.y - first.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    if (dist <= tolerance) {
      result.pop(); // Remove duplicate closing point
    }
  }

  return result;
}

/**
 * Convert outline and internal lines to PSLG format (points + constrained edges).
 *
 * @param outlinePoints - Polygon outline points
 * @param internalLines - Internal lines to constrain
 * @param curveResolution - Resolution for flattening internal curves
 * @returns PSLG representation with points array and constraint edges
 */
function convertToPSLG(
  outlinePoints: Point2D[],
  internalLines: { path: PathCommand[] }[],
  curveResolution: number,
): { points: number[][]; edges: number[][] } {
  const points: number[][] = [];
  const edges: number[][] = [];

  // Add outline points
  for (const pt of outlinePoints) {
    points.push([pt.x, pt.y]);
  }

  // Add outline edges (closed loop)
  for (let i = 0; i < outlinePoints.length; i++) {
    const next = (i + 1) % outlinePoints.length;
    edges.push([i, next]);
  }

  // Add internal lines as constrained edges
  for (const line of internalLines) {
    const linePoints = flattenPath(line.path, curveResolution);
    if (linePoints.length < 2) continue;

    const startIdx = points.length;
    
    // Add internal line points
    for (const pt of linePoints) {
      points.push([pt.x, pt.y]);
    }

    // Add internal line edges
    for (let i = 0; i < linePoints.length - 1; i++) {
      edges.push([startIdx + i, startIdx + i + 1]);
    }
  }

  return { points, edges };
}

/**
 * Convert refined 2D mesh to 3D ClothMeshData format.
 *
 * @param points - 2D mesh points
 * @param triangles - Triangle indices
 * @param config - Configuration with scale and yHeight
 * @returns ClothMeshData with flat vertex buffer and triangle indices
 */
function convertToClothMeshData(
  points: number[][],
  triangles: number[][],
  config: Required<MeshConfig>,
): ClothMeshData {
  // Center the points for better stability
  let centerX = 0;
  let centerY = 0;
  for (const p of points) {
    centerX += p[0];
    centerY += p[1];
  }
  centerX /= points.length;
  centerY /= points.length;

  // Build 3D vertices: [x0, yHeight, z0, x1, yHeight, z1, ...]
  const vertices = new Float32Array(points.length * 3);
  for (let i = 0; i < points.length; i++) {
    vertices[i * 3] = (points[i][0] - centerX) * config.scale; // x
    vertices[i * 3 + 1] = config.yHeight; // y (constant height)
    vertices[i * 3 + 2] = (points[i][1] - centerY) * config.scale; // z (was y in 2D)
  }

  // Build flat triangle index buffer
  const triIds = new Int32Array(triangles.length * 3);
  for (let i = 0; i < triangles.length; i++) {
    triIds[i * 3] = triangles[i][0];
    triIds[i * 3 + 1] = triangles[i][1];
    triIds[i * 3 + 2] = triangles[i][2];
  }

  return { vertices, triIds };
}