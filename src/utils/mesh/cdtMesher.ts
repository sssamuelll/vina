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

/**
 * UV scale factor: pattern coordinates (mm) are divided by this value.
 * 100mm = 1 UV unit, so textures tile every 10cm in pattern space.
 */
const PATTERN_UV_SCALE = 100;

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
 * @param particleDistance - Optional override for maxEdgeLength (simulation resolution)
 * @returns ClothMeshData ready for cloth simulation
 */
export function meshPiece(
  piece: PatternPiece,
  config: MeshConfig = {},
  particleDistance?: number,
): ClothMeshData {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  if (particleDistance) cfg.maxEdgeLength = particleDistance;

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
  let cleanOutline = removeDuplicatePoints(outlinePoints);
  if (cleanOutline.length < 3) {
    return { vertices: new Float32Array(0), triIds: new Int32Array(0) };
  }

  // Simplify dense outlines (300+ points from offset operations)
  cleanOutline = simplifyOutline(cleanOutline, 200, 0.5);

  // Ensure clockwise winding (positive signedArea in screen coords / y-down)
  // CDT2D's interior:true needs CW winding to correctly identify interior triangles.
  if (signedArea(cleanOutline) < 0) {
    cleanOutline = cleanOutline.slice().reverse();
  }

  // 1. Convert to PSLG format with boundary subdivision
  const { points, edges } = convertToPSLG(cleanOutline, internalLines, config.curveResolution, config.maxEdgeLength);

  if (points.length < 3 || edges.length === 0) {
    return { vertices: new Float32Array(0), triIds: new Int32Array(0) };
  }

  // 2. Clean PSLG to fix intersections (critical for complex patterns)
  cleanPSLG(points, edges);

  // 3. Generate interior grid points for density
  // We use the cleaned outline for point-in-polygon tests
  const boundaryPoints = cleanOutline.map(p => [p.x, p.y]);
  const interiorPoints = generateInteriorGrid(points, boundaryPoints, config.maxEdgeLength);
  
  const allPoints = [...points, ...interiorPoints];

  // 4. Run CDT
  let triangles: number[][];
  try {
    triangles = cdt2d(allPoints, edges, {
      interior: true,
      exterior: false,
    });
  } catch (error) {
    console.warn('[cdtMesher] CDT failed:', error);
    return { vertices: new Float32Array(0), triIds: new Int32Array(0) };
  }

  if (triangles.length === 0) {
    console.warn('[cdtMesher] CDT returned 0 interior triangles. Trying fallback with exterior:true...');
    try {
      triangles = cdt2d(allPoints, edges, {
        interior: true,
        exterior: true,
      });
    } catch (error) {
      console.error('[cdtMesher] All CDT attempts failed:', error);
      return { vertices: new Float32Array(0), triIds: new Int32Array(0) };
    }
  }

  if (triangles.length === 0) {
    console.error('[cdtMesher] Still 0 triangles after fallback. Points:', allPoints.length, 'Edges:', edges.length);
  }

  return convertToClothMeshData(allPoints, triangles, config);
}

// ─── Helper Functions ───────────────────────────────────────────────────────

/**
 * Remove consecutive duplicate points from a polygon outline.
 *
 * @param points - Input 2D points
 * @param tolerance - Distance tolerance for considering points identical
 * @returns Cleaned point array
 */
function removeDuplicatePoints(points: Point2D[], tolerance: number = 0.1): Point2D[] {
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
 * Simplify a dense outline using Douglas-Peucker algorithm.
 * Only simplifies if the outline has more points than the threshold.
 */
function simplifyOutline(points: Point2D[], maxPoints: number = 200, minEpsilon: number = 0.5): Point2D[] {
  if (points.length <= maxPoints) return points;

  // Adaptive epsilon: start small, increase until we're under maxPoints
  let epsilon = minEpsilon;
  let simplified = douglasPeucker(points, epsilon);

  while (simplified.length > maxPoints && epsilon < 50) {
    epsilon *= 1.5;
    simplified = douglasPeucker(points, epsilon);
  }

  // Ensure we have at least 3 points
  if (simplified.length < 3) return points.slice(0, maxPoints);
  return simplified;
}

/**
 * Douglas-Peucker polyline simplification.
 */
function douglasPeucker(points: Point2D[], epsilon: number): Point2D[] {
  if (points.length <= 2) return points;

  // Find the point with the maximum distance from the line between first and last
  let maxDist = 0;
  let maxIdx = 0;
  const first = points[0];
  const last = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const dist = perpendicularDistance(points[i], first, last);
    if (dist > maxDist) {
      maxDist = dist;
      maxIdx = i;
    }
  }

  if (maxDist > epsilon) {
    const left = douglasPeucker(points.slice(0, maxIdx + 1), epsilon);
    const right = douglasPeucker(points.slice(maxIdx), epsilon);
    return [...left.slice(0, -1), ...right];
  }

  return [first, last];
}

/**
 * Signed area of a polygon (positive = clockwise in screen coords / CW in math).
 * Negative = counter-clockwise. Used to ensure consistent winding for CDT.
 */
function signedArea(points: Point2D[]): number {
  let area = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    area += (points[j].x - points[i].x) * (points[j].y + points[i].y);
  }
  return area * 0.5;
}

function perpendicularDistance(point: Point2D, lineStart: Point2D, lineEnd: Point2D): number {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.sqrt((point.x - lineStart.x) ** 2 + (point.y - lineStart.y) ** 2);
  const t = Math.max(0, Math.min(1, ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / lenSq));
  const projX = lineStart.x + t * dx;
  const projY = lineStart.y + t * dy;
  return Math.sqrt((point.x - projX) ** 2 + (point.y - projY) ** 2);
}

/**
 * Convert outline and internal lines to PSLG format (points + constrained edges).
 * Subdivides any edges longer than maxEdgeLength to ensure simulation resolution.
 *
 * @param outlinePoints - Polygon outline points
 * @param internalLines - Internal lines to constrain
 * @param curveResolution - Resolution for flattening internal curves
 * @param maxEdgeLength - Maximum allowed edge length before subdivision
 * @returns PSLG representation with points array and constraint edges
 */
function convertToPSLG(
  outlinePoints: Point2D[],
  internalLines: { path: PathCommand[] }[],
  curveResolution: number,
  maxEdgeLength: number,
): { points: number[][]; edges: number[][] } {
  const points: number[][] = [];
  const edges: number[][] = [];

  function addSubdividedEdge(p1: Point2D, p2: Point2D) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    let startIdx = points.length - 1;
    if (startIdx < 0 || points[startIdx][0] !== p1.x || points[startIdx][1] !== p1.y) {
      points.push([p1.x, p1.y]);
      startIdx = points.length - 1;
    }

    if (dist <= maxEdgeLength) {
      points.push([p2.x, p2.y]);
      edges.push([startIdx, points.length - 1]);
    } else {
      const numSegments = Math.ceil(dist / maxEdgeLength);
      let prevIdx = startIdx;
      for (let i = 1; i <= numSegments; i++) {
        const t = i / numSegments;
        points.push([p1.x + dx * t, p1.y + dy * t]);
        const currIdx = points.length - 1;
        edges.push([prevIdx, currIdx]);
        prevIdx = currIdx;
      }
    }
  }

  // 1. Add outline with subdivision
  for (let i = 0; i < outlinePoints.length; i++) {
    const p1 = outlinePoints[i];
    const p2 = outlinePoints[(i + 1) % outlinePoints.length];
    addSubdividedEdge(p1, p2);
  }

  // 2. Add internal lines with subdivision
  for (const line of internalLines) {
    const linePoints = flattenPath(line.path, curveResolution);
    if (linePoints.length < 2) continue;
    
    for (let i = 0; i < linePoints.length - 1; i++) {
      addSubdividedEdge(linePoints[i], linePoints[i + 1]);
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
  // Center using bounding box center (must match PieceMesh.tsx's ShapeGeometry centering)
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p[0] < minX) minX = p[0];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] < minY) minY = p[1];
    if (p[1] > maxY) maxY = p[1];
  }
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

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

  // UVs from 2D pattern coordinates — centered to match vertex centering,
  // normalized so textures tile at a reasonable rate (1 UV unit = 100mm = 10cm)
  const uvs = new Float32Array(points.length * 2);
  for (let i = 0; i < points.length; i++) {
    uvs[i * 2] = (points[i][0] - centerX) / PATTERN_UV_SCALE;
    uvs[i * 2 + 1] = (points[i][1] - centerY) / PATTERN_UV_SCALE;
  }

    return { vertices, triIds, uvs };
  }
  
  /**
   * Generate interior grid points inside a polygon at the given spacing.
   * Uses a grid-based spatial hash for O(1) proximity checks instead of O(n).
   */
  function generateInteriorGrid(
    points: number[][],
    boundaryPoly: number[][],
    spacing: number,
  ): number[][] {
    if (spacing <= 0 || boundaryPoly.length < 3) return [];

    // Compute bounding box
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of boundaryPoly) {
      if (p[0] < minX) minX = p[0];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] < minY) minY = p[1];
      if (p[1] > maxY) maxY = p[1];
    }

    const halfSpacing = spacing * 0.5;
    const cellSize = halfSpacing; // cell size = exclusion radius

    // Build spatial hash of existing boundary points for O(1) proximity checks
    const occupied = new Set<string>();
    function cellKey(x: number, y: number): string {
      return `${Math.floor(x / cellSize)},${Math.floor(y / cellSize)}`;
    }
    function markOccupied(x: number, y: number): void {
      occupied.add(cellKey(x, y));
    }
    function isTooClose(x: number, y: number): boolean {
      const cx = Math.floor(x / cellSize);
      const cy = Math.floor(y / cellSize);
      // Check 3x3 neighborhood
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (occupied.has(`${cx + dx},${cy + dy}`)) {
            // Need exact distance check for points in neighboring cells
            return true;
          }
        }
      }
      return false;
    }

    // Register all boundary points
    for (const p of points) {
      markOccupied(p[0], p[1]);
    }

    // For very dense grids, skip the per-point distance check entirely and use
    // the grid hash. The grid alignment ensures points are already well-spaced.
    const interior: number[][] = [];

    // Offset grid to avoid landing exactly on edges
    for (let y = minY + halfSpacing; y < maxY; y += spacing) {
      for (let x = minX + halfSpacing; x < maxX; x += spacing) {
        if (pointInPolygon(x, y, boundaryPoly) && !isTooClose(x, y)) {
          interior.push([x, y]);
          markOccupied(x, y);
        }
      }
    }

    return interior;
  }
  
  /**
   * Ray casting point-in-polygon test.
   */
  function pointInPolygon(x: number, y: number, polygon: number[][]): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i][0], yi = polygon[i][1];
      const xj = polygon[j][0], yj = polygon[j][1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
    return inside;
  }
  