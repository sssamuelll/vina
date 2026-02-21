/**
 * Mesh Refinement for CDT Meshing
 *
 * Implements Ruppert-style refinement to improve triangle quality by subdividing
 * triangles that violate edge length or minimum angle constraints.
 *
 * @module refine
 */

import cdt2d from 'cdt2d';

// ─── Types ──────────────────────────────────────────────────────────────────

/** Refinement result containing improved points and triangles */
export interface RefinementResult {
  /** Refined 2D points */
  points: number[][];
  /** Refined triangles */
  triangles: number[][];
  /** Number of refinement passes performed */
  passesUsed: number;
}

/** Information about a bad triangle that needs refinement */
interface BadTriangle {
  /** Triangle index */
  triangleIndex: number;
  /** Longest edge length */
  longestEdgeLength: number;
  /** Minimum angle in degrees */
  minAngle: number;
  /** Midpoint of longest edge */
  edgeMidpoint: [number, number];
}

// ─── Core Refinement Function ───────────────────────────────────────────────

/**
 * Refine a 2D triangle mesh using Ruppert-style algorithm.
 *
 * Iteratively identifies bad triangles (violating edge length or angle constraints)
 * and inserts new points at edge midpoints to improve quality.
 *
 * @param points - 2D mesh points (will not be modified)
 * @param triangles - Triangle indices (will not be modified)
 * @param edges - Original constraint edges to preserve during re-triangulation
 * @param maxEdgeLength - Maximum allowed edge length
 * @param minAngleDeg - Minimum allowed angle in degrees
 * @param maxPasses - Maximum refinement iterations
 * @returns Refined mesh with improved triangle quality
 */
export function refineMesh(
  points: number[][],
  triangles: number[][],
  edges: number[][],
  maxEdgeLength: number,
  minAngleDeg: number,
  maxPasses: number = 3,
): RefinementResult {
  // Work on copies to avoid modifying input
  let currentPoints = points.map(p => [...p]);
  let currentTriangles = [...triangles];

  let passesUsed = 0;

  for (let pass = 0; pass < maxPasses; pass++) {
    const badTriangles = identifyBadTriangles(
      currentPoints,
      currentTriangles,
      maxEdgeLength,
      minAngleDeg,
    );

    if (badTriangles.length === 0) {
      // No more bad triangles, refinement complete
      break;
    }

    // Sort by worst quality first (longest edge or smallest angle)
    badTriangles.sort((a, b) => {
      // Prioritize by longest edge, then by smallest angle
      const edgeDiff = b.longestEdgeLength - a.longestEdgeLength;
      if (Math.abs(edgeDiff) > 0.1) return edgeDiff;
      return a.minAngle - b.minAngle;
    });

    // Insert new points at edge midpoints (limit per pass to avoid explosion)
    const maxInsertionsPerPass = Math.min(badTriangles.length, 10);
    const newPoints: number[][] = [];

    for (let i = 0; i < maxInsertionsPerPass; i++) {
      const bad = badTriangles[i];
      
      // Check if midpoint is far enough from existing points
      if (isPointTooClose(bad.edgeMidpoint, currentPoints, maxEdgeLength * 0.3)) {
        continue;
      }

      newPoints.push(bad.edgeMidpoint);
    }

    if (newPoints.length === 0) {
      // No new points could be inserted, stop refinement
      break;
    }

    // Add new points and rebuild triangulation
    currentPoints.push(...newPoints);

    // Rebuild CDT with new points (preserve original constraint edges)
    // The original edges still reference the same boundary point indices
    try {
      currentTriangles = cdt2d(currentPoints, edges, {
        interior: true,
        exterior: false,
      });
    } catch (error) {
      // CDT failed, revert to previous state
      console.warn('CDT refinement failed on pass', pass + 1, ':', error);
      currentPoints = currentPoints.slice(0, -newPoints.length);
      break;
    }

    passesUsed++;
  }

  return {
    points: currentPoints,
    triangles: currentTriangles,
    passesUsed,
  };
}

// ─── Helper Functions ───────────────────────────────────────────────────────

/**
 * Identify triangles that violate quality constraints.
 *
 * @param points - 2D mesh points
 * @param triangles - Triangle indices
 * @param maxEdgeLength - Maximum allowed edge length
 * @param minAngleDeg - Minimum allowed angle in degrees
 * @returns Array of bad triangles with their quality metrics
 */
function identifyBadTriangles(
  points: number[][],
  triangles: number[][],
  maxEdgeLength: number,
  minAngleDeg: number,
): BadTriangle[] {
  const badTriangles: BadTriangle[] = [];

  for (let i = 0; i < triangles.length; i++) {
    const tri = triangles[i];
    if (tri.length !== 3) continue;

    const [i0, i1, i2] = tri;
    if (i0 >= points.length || i1 >= points.length || i2 >= points.length) continue;

    const p0 = points[i0];
    const p1 = points[i1];
    const p2 = points[i2];

    // Compute edge lengths
    const edge01 = distance(p0, p1);
    const edge12 = distance(p1, p2);
    const edge20 = distance(p2, p0);

    const longestEdge = Math.max(edge01, edge12, edge20);

    // Compute angles
    const angles = computeTriangleAngles(p0, p1, p2);
    const minAngle = Math.min(...angles);

    // Check if triangle violates constraints
    const violatesEdgeLength = longestEdge > maxEdgeLength;
    const violatesMinAngle = minAngle < minAngleDeg;

    if (violatesEdgeLength || violatesMinAngle) {
      // Find midpoint of longest edge
      let edgeMidpoint: [number, number];
      
      if (edge01 >= edge12 && edge01 >= edge20) {
        edgeMidpoint = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
      } else if (edge12 >= edge20) {
        edgeMidpoint = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
      } else {
        edgeMidpoint = [(p2[0] + p0[0]) / 2, (p2[1] + p0[1]) / 2];
      }

      badTriangles.push({
        triangleIndex: i,
        longestEdgeLength: longestEdge,
        minAngle,
        edgeMidpoint,
      });
    }
  }

  return badTriangles;
}

/**
 * Compute the three angles of a triangle in degrees.
 *
 * @param p0 - First vertex
 * @param p1 - Second vertex
 * @param p2 - Third vertex
 * @returns Array of three angles in degrees
 */
function computeTriangleAngles(p0: number[], p1: number[], p2: number[]): number[] {
  const a = distance(p1, p2); // opposite to p0
  const b = distance(p2, p0); // opposite to p1
  const c = distance(p0, p1); // opposite to p2

  // Law of cosines: cos(A) = (b² + c² - a²) / (2bc)
  const cosA = Math.max(-1, Math.min(1, (b * b + c * c - a * a) / (2 * b * c)));
  const cosB = Math.max(-1, Math.min(1, (a * a + c * c - b * b) / (2 * a * c)));
  const cosC = Math.max(-1, Math.min(1, (a * a + b * b - c * c) / (2 * a * b)));

  return [
    (Math.acos(cosA) * 180) / Math.PI,
    (Math.acos(cosB) * 180) / Math.PI,
    (Math.acos(cosC) * 180) / Math.PI,
  ];
}

/**
 * Compute Euclidean distance between two 2D points.
 *
 * @param p1 - First point
 * @param p2 - Second point
 * @returns Distance between points
 */
function distance(p1: number[], p2: number[]): number {
  const dx = p1[0] - p2[0];
  const dy = p1[1] - p2[1];
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Check if a point is too close to existing points.
 *
 * @param newPoint - Point to check
 * @param existingPoints - Array of existing points
 * @param minDistance - Minimum allowed distance
 * @returns True if point is too close to any existing point
 */
function isPointTooClose(
  newPoint: number[],
  existingPoints: number[][],
  minDistance: number,
): boolean {
  for (const existing of existingPoints) {
    if (distance(newPoint, existing) < minDistance) {
      return true;
    }
  }
  return false;
}