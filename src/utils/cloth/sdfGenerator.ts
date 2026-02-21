/**
 * SDF (Signed Distance Field) Generator for Avatar Body Collision
 * 
 * Generates a 3D signed distance field from triangle mesh data to enable
 * accurate avatar body collision detection during cloth simulation.
 * 
 * @module sdfGenerator
 */

/**
 * Contains the 3D signed distance field data and metadata.
 */
export interface SDFData {
  /** Flat Float32Array of signed distance values, size = resolution³ */
  distances: Float32Array;
  /** Grid resolution (e.g. 64 = 64×64×64 grid) */
  resolution: number;
  /** Bounding box min corner [x, y, z] */
  min: [number, number, number];
  /** Bounding box max corner [x, y, z] */
  max: [number, number, number];
  /** Cell size (uniform in all axes) */
  cellSize: number;
}

/**
 * Result of point-to-triangle distance calculation.
 */
interface TriangleDistanceResult {
  /** Distance from point to closest point on triangle */
  distance: number;
  /** Closest point on triangle surface */
  closestPoint: [number, number, number];
  /** Triangle normal at closest point */
  normal: [number, number, number];
}

/**
 * Simple spatial hash for accelerating nearest triangle queries.
 */
class SpatialHash {
  private readonly cellSize: number;
  private readonly cells = new Map<string, number[]>();
  private readonly vertices: Float32Array;
  private readonly indices: Uint32Array;

  constructor(vertices: Float32Array, indices: Uint32Array, cellSize: number) {
    this.vertices = vertices;
    this.indices = indices;
    this.cellSize = cellSize;
    this.buildHash();
  }

  private buildHash(): void {
    const numTriangles = this.indices.length / 3;
    
    for (let triIdx = 0; triIdx < numTriangles; triIdx++) {
      const i0 = this.indices[triIdx * 3] * 3;
      const i1 = this.indices[triIdx * 3 + 1] * 3;
      const i2 = this.indices[triIdx * 3 + 2] * 3;
      
      // Get triangle bounds
      const minX = Math.min(this.vertices[i0], this.vertices[i1], this.vertices[i2]);
      const maxX = Math.max(this.vertices[i0], this.vertices[i1], this.vertices[i2]);
      const minY = Math.min(this.vertices[i0 + 1], this.vertices[i1 + 1], this.vertices[i2 + 1]);
      const maxY = Math.max(this.vertices[i0 + 1], this.vertices[i1 + 1], this.vertices[i2 + 1]);
      const minZ = Math.min(this.vertices[i0 + 2], this.vertices[i1 + 2], this.vertices[i2 + 2]);
      const maxZ = Math.max(this.vertices[i0 + 2], this.vertices[i1 + 2], this.vertices[i2 + 2]);
      
      // Add triangle to all overlapping cells
      const minCellX = Math.floor(minX / this.cellSize);
      const maxCellX = Math.floor(maxX / this.cellSize);
      const minCellY = Math.floor(minY / this.cellSize);
      const maxCellY = Math.floor(maxY / this.cellSize);
      const minCellZ = Math.floor(minZ / this.cellSize);
      const maxCellZ = Math.floor(maxZ / this.cellSize);
      
      for (let cx = minCellX; cx <= maxCellX; cx++) {
        for (let cy = minCellY; cy <= maxCellY; cy++) {
          for (let cz = minCellZ; cz <= maxCellZ; cz++) {
            const key = `${cx},${cy},${cz}`;
            if (!this.cells.has(key)) {
              this.cells.set(key, []);
            }
            this.cells.get(key)!.push(triIdx);
          }
        }
      }
    }
  }

  getTrianglesNear(point: [number, number, number]): number[] {
    const cellX = Math.floor(point[0] / this.cellSize);
    const cellY = Math.floor(point[1] / this.cellSize);
    const cellZ = Math.floor(point[2] / this.cellSize);
    
    const triangles: number[] = [];
    
    // Check 3x3x3 neighborhood for more reliable results
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const key = `${cellX + dx},${cellY + dy},${cellZ + dz}`;
          const cellTriangles = this.cells.get(key);
          if (cellTriangles) {
            triangles.push(...cellTriangles);
          }
        }
      }
    }
    
    // Remove duplicates
    return [...new Set(triangles)];
  }
}

/**
 * Compute the signed distance from a point to a triangle.
 * 
 * @param point - Query point [x, y, z]
 * @param v0 - Triangle vertex 0 [x, y, z]
 * @param v1 - Triangle vertex 1 [x, y, z]
 * @param v2 - Triangle vertex 2 [x, y, z]
 * @returns Distance info including sign based on triangle normal
 */
function pointToTriangleDistance(
  point: [number, number, number],
  v0: [number, number, number],
  v1: [number, number, number],
  v2: [number, number, number]
): TriangleDistanceResult {
  const px = point[0], py = point[1], pz = point[2];
  const ax = v0[0], ay = v0[1], az = v0[2];
  const bx = v1[0], by = v1[1], bz = v1[2];
  const cx = v2[0], cy = v2[1], cz = v2[2];
  
  // Triangle edges
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const acx = cx - ax, acy = cy - ay, acz = cz - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  
  // Triangle normal (unnormalized)
  const nx = aby * acz - abz * acy;
  const ny = abz * acx - abx * acz;
  const nz = abx * acy - aby * acx;
  const nlen = Math.sqrt(nx * nx + ny * ny + nz * nz);
  
  if (nlen < 1e-12) {
    // Degenerate triangle
    return {
      distance: Math.sqrt(apx * apx + apy * apy + apz * apz),
      closestPoint: [ax, ay, az],
      normal: [0, 1, 0]
    };
  }
  
  // Normalized normal
  const nnx = nx / nlen, nny = ny / nlen, nnz = nz / nlen;
  
  // Project point onto triangle plane
  const dot = apx * nnx + apy * nny + apz * nnz;
  const projx = px - dot * nnx;
  const projy = py - dot * nny;
  const projz = pz - dot * nnz;
  
  // Check if projection is inside triangle using barycentric coordinates
  const v0x = projx - ax, v0y = projy - ay, v0z = projz - az;
  const dot00 = abx * abx + aby * aby + abz * abz;
  const dot01 = abx * acx + aby * acy + abz * acz;
  const dot02 = abx * v0x + aby * v0y + abz * v0z;
  const dot11 = acx * acx + acy * acy + acz * acz;
  const dot12 = acx * v0x + acy * v0y + acz * v0z;
  
  const invDenom = 1.0 / (dot00 * dot11 - dot01 * dot01);
  const u = (dot11 * dot02 - dot01 * dot12) * invDenom;
  const v = (dot00 * dot12 - dot01 * dot02) * invDenom;
  
  let closestPoint: [number, number, number];
  
  if (u >= 0 && v >= 0 && u + v <= 1) {
    // Inside triangle
    closestPoint = [projx, projy, projz];
  } else {
    // Outside triangle - find closest edge/vertex
    let minDistSq = Infinity;
    let tempClosest: [number, number, number] = [ax, ay, az];
    
    // Edge AB
    const t1 = Math.max(0, Math.min(1, (apx * abx + apy * aby + apz * abz) / (abx * abx + aby * aby + abz * abz)));
    const c1x = ax + t1 * abx;
    const c1y = ay + t1 * aby;
    const c1z = az + t1 * abz;
    const d1sq = (px - c1x) * (px - c1x) + (py - c1y) * (py - c1y) + (pz - c1z) * (pz - c1z);
    if (d1sq < minDistSq) {
      minDistSq = d1sq;
      tempClosest = [c1x, c1y, c1z];
    }
    
    // Edge AC
    const t2 = Math.max(0, Math.min(1, (apx * acx + apy * acy + apz * acz) / (acx * acx + acy * acy + acz * acz)));
    const c2x = ax + t2 * acx;
    const c2y = ay + t2 * acy;
    const c2z = az + t2 * acz;
    const d2sq = (px - c2x) * (px - c2x) + (py - c2y) * (py - c2y) + (pz - c2z) * (pz - c2z);
    if (d2sq < minDistSq) {
      minDistSq = d2sq;
      tempClosest = [c2x, c2y, c2z];
    }
    
    // Edge BC
    const bcx = cx - bx, bcy = cy - by, bcz = cz - bz;
    const bpx = px - bx, bpy = py - by, bpz = pz - bz;
    const t3 = Math.max(0, Math.min(1, (bpx * bcx + bpy * bcy + bpz * bcz) / (bcx * bcx + bcy * bcy + bcz * bcz)));
    const c3x = bx + t3 * bcx;
    const c3y = by + t3 * bcy;
    const c3z = bz + t3 * bcz;
    const d3sq = (px - c3x) * (px - c3x) + (py - c3y) * (py - c3y) + (pz - c3z) * (pz - c3z);
    if (d3sq < minDistSq) {
      minDistSq = d3sq;
      tempClosest = [c3x, c3y, c3z];
    }
    
    closestPoint = tempClosest;
  }
  
  // Compute distance
  const dx = px - closestPoint[0];
  const dy = py - closestPoint[1];
  const dz = pz - closestPoint[2];
  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
  
  return {
    distance,
    closestPoint,
    normal: [nnx, nny, nnz]
  };
}

/**
 * Generate a 3D signed distance field from a triangle mesh.
 * 
 * @param vertices - Flat vertex array [x0,y0,z0, x1,y1,z1, ...]
 * @param indices - Triangle indices [i0,i1,i2, i3,i4,i5, ...]
 * @param resolution - Grid resolution (e.g. 64 for 64³ grid)
 * @returns SDF data or null if mesh is empty
 */
export function generateSDF(vertices: Float32Array, indices: Uint32Array, resolution: number): SDFData | null {
  if (vertices.length === 0 || indices.length === 0) {
    return null;
  }
  
  const numVertices = vertices.length / 3;
  const numTriangles = indices.length / 3;
  
  if (numVertices < 3 || numTriangles < 1) {
    return null;
  }
  
  // Compute bounding box with 5cm padding
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  
  for (let i = 0; i < numVertices; i++) {
    const x = vertices[i * 3];
    const y = vertices[i * 3 + 1];
    const z = vertices[i * 3 + 2];
    
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  
  // Add 5cm padding
  const padding = 0.05;
  minX -= padding;
  minY -= padding;
  minZ -= padding;
  maxX += padding;
  maxY += padding;
  maxZ += padding;
  
  // Compute cell size (uniform)
  const sizeX = maxX - minX;
  const sizeY = maxY - minY;
  const sizeZ = maxZ - minZ;
  const maxSize = Math.max(sizeX, sizeY, sizeZ);
  const cellSize = maxSize / (resolution - 1);
  
  // Adjust bounds to be cubic
  const centerX = (minX + maxX) * 0.5;
  const centerY = (minY + maxY) * 0.5;
  const centerZ = (minZ + maxZ) * 0.5;
  const halfSize = maxSize * 0.5;
  
  const min: [number, number, number] = [centerX - halfSize, centerY - halfSize, centerZ - halfSize];
  const max: [number, number, number] = [centerX + halfSize, centerY + halfSize, centerZ + halfSize];
  
  // Build spatial hash for acceleration
  const spatialHash = new SpatialHash(vertices, indices, cellSize * 4); // Use larger cells for spatial hash
  
  // Generate SDF
  const distances = new Float32Array(resolution * resolution * resolution);
  
  for (let zi = 0; zi < resolution; zi++) {
    for (let yi = 0; yi < resolution; yi++) {
      for (let xi = 0; xi < resolution; xi++) {
        // Grid position
        const x = min[0] + xi * cellSize;
        const y = min[1] + yi * cellSize;
        const z = min[2] + zi * cellSize;
        const point: [number, number, number] = [x, y, z];
        
        // Find nearest triangle
        let minDistance = Infinity;
        let bestNormal: [number, number, number] = [0, 1, 0];
        let bestClosest: [number, number, number] = point;
        
        const nearTriangles = spatialHash.getTrianglesNear(point);
        const trianglesToCheck = nearTriangles.length > 0 ? nearTriangles : Array.from({ length: numTriangles }, (_, i) => i);
        
        for (const triIdx of trianglesToCheck) {
          const i0 = indices[triIdx * 3] * 3;
          const i1 = indices[triIdx * 3 + 1] * 3;
          const i2 = indices[triIdx * 3 + 2] * 3;
          
          const v0: [number, number, number] = [vertices[i0], vertices[i0 + 1], vertices[i0 + 2]];
          const v1: [number, number, number] = [vertices[i1], vertices[i1 + 1], vertices[i1 + 2]];
          const v2: [number, number, number] = [vertices[i2], vertices[i2 + 1], vertices[i2 + 2]];
          
          const result = pointToTriangleDistance(point, v0, v1, v2);
          
          if (result.distance < minDistance) {
            minDistance = result.distance;
            bestNormal = result.normal;
            bestClosest = result.closestPoint;
          }
        }
        
        // Determine sign using ray casting for more robust inside/outside classification
        // Simple approach: use the normal direction from the closest point
        const dx = x - bestClosest[0];
        const dy = y - bestClosest[1];
        const dz = z - bestClosest[2];
        
        // If we're very close to surface, use normal direction
        if (minDistance < 1e-6) {
          const signedDistance = 0;
          distances[zi * resolution * resolution + yi * resolution + xi] = signedDistance;
          continue;
        }
        
        const dot = dx * bestNormal[0] + dy * bestNormal[1] + dz * bestNormal[2];
        
        // For a closed mesh, points inside should be negative, outside positive
        // The normal usually points outward, so negative dot means inside
        const signedDistance = dot > 0 ? minDistance : -minDistance;
        
        // Store in grid
        const index = zi * resolution * resolution + yi * resolution + xi;
        distances[index] = signedDistance;
      }
    }
  }
  
  return {
    distances,
    resolution,
    min,
    max,
    cellSize
  };
}

/**
 * Sample the SDF at a given point using trilinear interpolation.
 * 
 * @param sdf - SDF data
 * @param point - World space point [x, y, z]
 * @returns Interpolated signed distance value
 */
export function sampleSDF(sdf: SDFData, point: [number, number, number]): number {
  const { distances, resolution, min, cellSize } = sdf;
  
  // Convert to grid coordinates
  const gx = (point[0] - min[0]) / cellSize;
  const gy = (point[1] - min[1]) / cellSize;
  const gz = (point[2] - min[2]) / cellSize;
  
  // Bounds check
  if (gx < 0 || gx >= resolution - 1 || gy < 0 || gy >= resolution - 1 || gz < 0 || gz >= resolution - 1) {
    // Outside grid - return large positive distance
    return 1.0;
  }
  
  // Grid cell indices
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const z0 = Math.floor(gz);
  const x1 = Math.min(x0 + 1, resolution - 1);
  const y1 = Math.min(y0 + 1, resolution - 1);
  const z1 = Math.min(z0 + 1, resolution - 1);
  
  // Fractional coordinates
  const fx = gx - x0;
  const fy = gy - y0;
  const fz = gz - z0;
  
  // Trilinear interpolation
  const c000 = distances[z0 * resolution * resolution + y0 * resolution + x0];
  const c001 = distances[z1 * resolution * resolution + y0 * resolution + x0];
  const c010 = distances[z0 * resolution * resolution + y1 * resolution + x0];
  const c011 = distances[z1 * resolution * resolution + y1 * resolution + x0];
  const c100 = distances[z0 * resolution * resolution + y0 * resolution + x1];
  const c101 = distances[z1 * resolution * resolution + y0 * resolution + x1];
  const c110 = distances[z0 * resolution * resolution + y1 * resolution + x1];
  const c111 = distances[z1 * resolution * resolution + y1 * resolution + x1];
  
  const c00 = c000 * (1 - fx) + c100 * fx;
  const c01 = c001 * (1 - fx) + c101 * fx;
  const c10 = c010 * (1 - fx) + c110 * fx;
  const c11 = c011 * (1 - fx) + c111 * fx;
  
  const c0 = c00 * (1 - fy) + c10 * fy;
  const c1 = c01 * (1 - fy) + c11 * fy;
  
  return c0 * (1 - fz) + c1 * fz;
}

/**
 * Compute SDF gradient using finite differences.
 * 
 * @param sdf - SDF data
 * @param point - World space point [x, y, z]
 * @returns Normalized gradient vector (push direction)
 */
export function sdfGradient(sdf: SDFData, point: [number, number, number]): [number, number, number] {
  const h = sdf.cellSize * 0.5; // Half cell size for finite difference
  
  const dx = (sampleSDF(sdf, [point[0] + h, point[1], point[2]]) - sampleSDF(sdf, [point[0] - h, point[1], point[2]])) / (2 * h);
  const dy = (sampleSDF(sdf, [point[0], point[1] + h, point[2]]) - sampleSDF(sdf, [point[0], point[1] - h, point[2]])) / (2 * h);
  const dz = (sampleSDF(sdf, [point[0], point[1], point[2] + h]) - sampleSDF(sdf, [point[0], point[1], point[2] - h])) / (2 * h);
  
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  
  if (len < 1e-12) {
    return [0, 1, 0]; // Default upward
  }
  
  return [dx / len, dy / len, dz / len];
}