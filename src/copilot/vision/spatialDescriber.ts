/**
 * Spatial Describer — Core distance and bounding box functions.
 *
 * Provides fundamental geometric operations for spatial analysis:
 * - 3D distance calculation between points
 * - Bounding box computation from vertex arrays
 * - Bounding box overlap detection
 *
 * @module copilot/vision/spatialDescriber
 */

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * A point in 3D space.
 */
export interface Point3D {
  x: number;
  y: number;
  z: number;
}

/**
 * Axis-aligned bounding box in 3D space.
 */
export interface BoundingBox3D {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

// ─── Distance Functions ─────────────────────────────────────────────────────

/**
 * Calculate Euclidean distance between two 3D points.
 *
 * @param p1 - First point
 * @param p2 - Second point
 * @returns Distance in the same units as the input coordinates
 */
export function distance3D(p1: Point3D, p2: Point3D): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const dz = p2.z - p1.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// ─── Bounding Box Functions ─────────────────────────────────────────────────

/**
 * Compute axis-aligned bounding box from a flat vertex array.
 *
 * The vertex array is expected to have coordinates in [x, y, z, x, y, z, ...]
 * format, typical of WebGL/Three.js BufferGeometry.
 *
 * @param vertices - Flat array of vertex coordinates (x, y, z triplets)
 * @returns Bounding box enclosing all vertices
 * @throws Error if vertices array is empty or has invalid length
 */
export function computeBoundingBox3D(vertices: Float32Array): BoundingBox3D {
  if (vertices.length === 0) {
    throw new Error('Cannot compute bounding box from empty vertex array');
  }
  if (vertices.length % 3 !== 0) {
    throw new Error('Vertex array length must be a multiple of 3');
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (let i = 0; i < vertices.length; i += 3) {
    const x = vertices[i];
    const y = vertices[i + 1];
    const z = vertices[i + 2];

    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }

  return { minX, maxX, minY, maxY, minZ, maxZ };
}

/**
 * Check if two axis-aligned bounding boxes overlap.
 *
 * Two boxes overlap if they intersect on all three axes.
 *
 * @param box1 - First bounding box
 * @param box2 - Second bounding box
 * @returns True if the boxes overlap, false otherwise
 */
export function boundingBoxesOverlap(
  box1: BoundingBox3D,
  box2: BoundingBox3D
): boolean {
  // Two boxes overlap if they overlap on all three axes
  const overlapX = box1.minX <= box2.maxX && box1.maxX >= box2.minX;
  const overlapY = box1.minY <= box2.maxY && box1.maxY >= box2.minY;
  const overlapZ = box1.minZ <= box2.maxZ && box1.maxZ >= box2.minZ;

  return overlapX && overlapY && overlapZ;
}
