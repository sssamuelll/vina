/**
 * Spatial Describer — Core distance and bounding box functions.
 *
 * Provides fundamental geometric operations for spatial analysis:
 * - 3D distance calculation between points
 * - Bounding box computation from vertex arrays
 * - Bounding box overlap detection
 * - Relationship analysis between pieces
 *
 * @module copilot/vision/spatialDescriber
 */

import type { SpatialRelationship, SpatialRelationType } from './types';

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

/**
 * Result of minimum distance calculation between two vertex sets.
 */
export interface MinDistanceResult {
  distance: number;
  indexA: number;
  indexB: number;
}

/**
 * Spatial information for a single piece in world space.
 */
export interface PieceSpatialInfo {
  pieceId: string;
  position: [number, number, number];
  worldBounds: BoundingBox3D;
  worldVertices: Float32Array;
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

// ─── Vertex Distance Functions ───────────────────────────────────────────────

/**
 * Find the minimum distance between two sets of vertices.
 *
 * Performs a brute-force comparison of all vertex pairs to find the
 * closest pair. Returns the distance and indices of the closest vertices.
 *
 * @param verticesA - First vertex array (x, y, z triplets)
 * @param verticesB - Second vertex array (x, y, z triplets)
 * @returns Minimum distance and indices of the closest vertex pair
 */
export function findMinimumDistance(
  verticesA: Float32Array,
  verticesB: Float32Array,
): MinDistanceResult {
  if (verticesA.length === 0 || verticesB.length === 0) {
    return { distance: Infinity, indexA: -1, indexB: -1 };
  }

  let minDist = Infinity;
  let minIndexA = -1;
  let minIndexB = -1;

  const numA = verticesA.length / 3;
  const numB = verticesB.length / 3;

  for (let i = 0; i < numA; i++) {
    const ax = verticesA[i * 3];
    const ay = verticesA[i * 3 + 1];
    const az = verticesA[i * 3 + 2];

    for (let j = 0; j < numB; j++) {
      const bx = verticesB[j * 3];
      const by = verticesB[j * 3 + 1];
      const bz = verticesB[j * 3 + 2];

      const dx = bx - ax;
      const dy = by - ay;
      const dz = bz - az;
      const distSq = dx * dx + dy * dy + dz * dz;

      if (distSq < minDist * minDist) {
        minDist = Math.sqrt(distSq);
        minIndexA = i;
        minIndexB = j;
      }
    }
  }

  return { distance: minDist, indexA: minIndexA, indexB: minIndexB };
}

// ─── Piece Spatial Info ──────────────────────────────────────────────────────

/**
 * Extract spatial information for a piece, transforming local vertices to world space.
 *
 * Takes local-space vertices and a world position, then computes:
 * - World-space vertices (local + position offset)
 * - World-space bounding box
 *
 * @param pieceId - Unique identifier for the piece
 * @param localVertices - Vertex array in local/object space (x, y, z triplets)
 * @param position - World position offset [x, y, z]
 * @returns Spatial information with world-space coordinates
 */
export function extractPieceInfo(
  pieceId: string,
  localVertices: Float32Array,
  position: [number, number, number],
): PieceSpatialInfo {
  const [px, py, pz] = position;

  const worldVertices = new Float32Array(localVertices.length);
  for (let i = 0; i < localVertices.length; i += 3) {
    worldVertices[i] = localVertices[i] + px;
    worldVertices[i + 1] = localVertices[i + 1] + py;
    worldVertices[i + 2] = localVertices[i + 2] + pz;
  }

  const worldBounds = computeBoundingBox3D(worldVertices);

  return { pieceId, position, worldBounds, worldVertices };
}

// ─── Relationship Analysis ──────────────────────────────────────────────────

/** Threshold below which pieces are considered overlapping (mm) */
const OVERLAP_THRESHOLD = 1;

/** Threshold below which pieces are considered adjacent (mm) */
const ADJACENT_THRESHOLD = 10;

/**
 * Analyze the spatial relationship between two pieces.
 *
 * Classifies the relationship based on minimum vertex distance:
 * - 'sewn': Pieces have a sewing connection (takes precedence)
 * - 'overlapping': Distance < 1mm
 * - 'adjacent': Distance < 10mm
 * - 'distant': Distance >= 10mm
 *
 * @param infoA - Spatial information for the first piece
 * @param infoB - Spatial information for the second piece
 * @param hasSewingConnection - Whether the pieces are connected by a seam
 * @returns Spatial relationship between the two pieces
 */
export function analyzePieceRelationship(
  infoA: PieceSpatialInfo,
  infoB: PieceSpatialInfo,
  hasSewingConnection: boolean,
): SpatialRelationship {
  const { distance, indexA, indexB } = findMinimumDistance(
    infoA.worldVertices,
    infoB.worldVertices,
  );

  if (hasSewingConnection) {
    return {
      pieceAId: infoA.pieceId,
      pieceBId: infoB.pieceId,
      type: 'sewn',
      distance3D: distance,
      edgeAIndex: indexA,
      edgeBIndex: indexB,
      hasSewingConnection: true,
    };
  }

  let type: SpatialRelationType;
  if (distance < OVERLAP_THRESHOLD) {
    type = 'overlapping';
  } else if (distance < ADJACENT_THRESHOLD) {
    type = 'adjacent';
  } else {
    type = 'distant';
  }

  return {
    pieceAId: infoA.pieceId,
    pieceBId: infoB.pieceId,
    type,
    distance3D: distance,
    edgeAIndex: indexA,
    edgeBIndex: indexB,
    hasSewingConnection: false,
  };
}
