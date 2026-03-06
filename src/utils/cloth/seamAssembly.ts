/**
 * Seam Assembly — Virtual sewing engine for XPBD cloth simulation.
 *
 * Provides edge parameterization, vertex pairing, seam constraint generation,
 * and multi-piece mesh merging so pattern pieces can be sewn together during
 * simulation.
 *
 * @module seamAssembly
 */

import type { PathCommand, Point2D, Seam, SemanticEdge } from '../../types/types';
import { flattenPath } from '../seam/index';

// ─── Types ──────────────────────────────────────────────────────────────────

/** A vertex on a boundary edge with its arc-length parameter (0–1). */
export interface ParameterizedVertex {
  /** Global particle index in the merged mesh */
  index: number;
  /** Normalized arc-length parameter along the edge (0 = start, 1 = end) */
  t: number;
}

/** A pair of vertices to be sewn together. */
export interface SeamConstraintPair {
  /** Particle index from piece A */
  idA: number;
  /** Particle index from piece B */
  idB: number;
  /** Current rest length (shrinks toward 0) */
  restLength: number;
}

/** Configuration for seam constraint behaviour. */
export interface SeamConstraintConfig {
  /** Shrink factor per substep (e.g. 0.995 = slow sewing). Default 0.995 */
  shrinkFactor: number;
  /** Minimum rest length below which the seam is considered "sewn". Default 1e-6 */
  sewedThreshold: number;
  /** XPBD compliance per seam type. Lower = stiffer. */
  compliance: Record<Seam['type'], number>;
}

/** A complete set of seam constraints ready for the solver. */
export interface SeamConstraintSet {
  /** Flat array of paired particle indices [idA0, idB0, idA1, idB1, ...] */
  ids: Int32Array;
  /** Current rest lengths (one per pair, shrinks each step) */
  restLengths: Float32Array;
  /** Compliance value per pair */
  compliances: Float32Array;
  /** Number of constraint pairs */
  count: number;
  /** Config used */
  config: SeamConstraintConfig;
}

/** Tracking info for a piece within a merged mesh. */
export interface PieceOffset {
  pieceId: string;
  /** First particle index in the merged mesh */
  vertexOffset: number;
  /** Number of particles for this piece */
  vertexCount: number;
  /** First triangle index (in triIds) for this piece */
  triangleOffset: number;
  /** Number of triangles for this piece */
  triangleCount: number;
}

/** Result of merging multiple piece meshes. */
export interface MergedMesh {
  /** Combined vertex positions [x0,y0,z0, ...] */
  vertices: Float32Array;
  /** Combined triangle indices (offsets applied) */
  triIds: Int32Array;
  /** Per-piece offset tracking */
  pieces: PieceOffset[];
  /** Combined UV coordinates [u0,v0, u1,v1, ...] (optional) */
  uvs?: Float32Array;
}

// ─── Default Config ─────────────────────────────────────────────────────────

/** Default seam constraint configuration. */
export const DEFAULT_SEAM_CONFIG: SeamConstraintConfig = {
  shrinkFactor: 0.995,
  sewedThreshold: 1e-6,
  compliance: {
    standard: 0.0001,
    french: 0.00001,
    'flat-felled': 0.00005,
    overlock: 0.0002,
  },
};

// ─── Edge Parameterization ──────────────────────────────────────────────────

/**
 * Compute arc-length parameterized points from a sequence of 2D points.
 *
 * Returns normalized t values (0–1) for each input point based on cumulative
 * Euclidean distance along the polyline.
 *
 * @param points - Ordered 2D points along the edge
 * @returns Array of normalized arc-length parameters, one per point
 */
export function computeArcLengthParams(points: Point2D[]): number[] {
  if (points.length === 0) return [];
  if (points.length === 1) return [0];

  const cumLengths: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    cumLengths.push(cumLengths[i - 1] + Math.sqrt(dx * dx + dy * dy));
  }

  const totalLength = cumLengths[cumLengths.length - 1];
  if (totalLength === 0) return points.map(() => 0);

  return cumLengths.map(l => l / totalLength);
}

/**
 * Extract boundary vertices for a given edge segment of a pattern piece outline.
 * Subdivides edges according to maxEdgeLength to match the CDT mesher's output.
 *
 * @param outline - Pattern piece outline path commands
 * @param edgeStart - Start vertex index in the flattened outline
 * @param edgeEnd - End vertex index in the flattened outline
 * @param globalOffset - Offset to add to vertex indices for the merged mesh
 * @param curveResolution - Resolution for flattening curves
 * @param maxEdgeLength - Maximum allowed edge length before subdivision
 * @returns Array of parameterized vertices along the edge
 */
export function parameterizeEdge(
  outline: PathCommand[],
  edgeStart: number,
  edgeEnd: number,
  globalOffset: number = 0,
  curveResolution: number = 12,
  maxEdgeLength: number = 15,
): ParameterizedVertex[] {
  const flatPoints = flattenPath(outline, curveResolution);
  if (flatPoints.length === 0) return [];

  // 1. Calculate the global vertex index for each subdivided point in the WHOLE outline
  // This is how the CDT mesher numbers them.
  const allOutlineVertices: Array<{ x: number; y: number; originalIdx: number; isSubdivided: boolean }> = [];
  const pointToGlobalIdx = new Map<number, number>();

  for (let i = 0; i < flatPoints.length; i++) {
    const p1 = flatPoints[i];
    const p2 = flatPoints[(i + 1) % flatPoints.length];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const numSegments = dist <= maxEdgeLength ? 1 : Math.ceil(dist / maxEdgeLength);

    pointToGlobalIdx.set(i, allOutlineVertices.length);
    allOutlineVertices.push({ ...p1, originalIdx: i, isSubdivided: false });

    for (let s = 1; s < numSegments; s++) {
      const t = s / numSegments;
      allOutlineVertices.push({ 
        x: p1.x + dx * t, 
        y: p1.y + dy * t, 
        originalIdx: i, 
        isSubdivided: true 
      });
    }
  }

  // 2. Extract the range of global indices that correspond to the requested seam segment
  const seamVertices: ParameterizedVertex[] = [];
  let currentDist = 0;
  const distances: number[] = [0];

  // Determine the sequence of original points in the segment
  const segmentOriginalIndices: number[] = [];
  if (edgeEnd >= edgeStart) {
    for (let i = edgeStart; i <= edgeEnd; i++) segmentOriginalIndices.push(i);
  } else {
    for (let i = edgeStart; i < flatPoints.length; i++) segmentOriginalIndices.push(i);
    for (let i = 0; i <= edgeEnd; i++) segmentOriginalIndices.push(i);
  }

  // Collect all vertices (original and subdivided) for these segments
  for (let k = 0; k < segmentOriginalIndices.length; k++) {
    const origIdx = segmentOriginalIndices[k];
    const globalIdx = pointToGlobalIdx.get(origIdx)!;
    
    // Add the original point
    seamVertices.push({ index: globalIdx + globalOffset, t: 0 });

    // Add any subdivided points AFTER this point (if not at the very end of the seam)
    if (k < segmentOriginalIndices.length - 1) {
      let nextGlobalIdx = (globalIdx + 1) % allOutlineVertices.length;
      while (allOutlineVertices[nextGlobalIdx].isSubdivided) {
        seamVertices.push({ index: nextGlobalIdx + globalOffset, t: 0 });
        nextGlobalIdx = (nextGlobalIdx + 1) % allOutlineVertices.length;
      }
    }
  }

  // 3. Calculate T parameters (arc length) for the extracted vertices
  if (seamVertices.length > 1) {
    for (let i = 1; i < seamVertices.length; i++) {
      const p1 = allOutlineVertices[seamVertices[i - 1].index - globalOffset];
      const p2 = allOutlineVertices[seamVertices[i].index - globalOffset];
      const d = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
      currentDist += d;
      distances.push(currentDist);
    }
    const total = distances[distances.length - 1];
    for (let i = 0; i < seamVertices.length; i++) {
      seamVertices[i].t = total > 0 ? distances[i] / total : 0;
    }
  }

  return seamVertices;
}

// ─── Vertex Pairing ─────────────────────────────────────────────────────────

/**
 * Match vertices from two parameterized edges by closest arc-length parameter.
 *
 * For each vertex on the shorter edge, finds the closest match on the longer
 * edge. Handles unequal vertex counts gracefully.
 *
 * @param edgeA - Parameterized vertices of edge A
 * @param edgeB - Parameterized vertices of edge B
 * @returns Array of [indexA, indexB] pairs
 */
export function matchVertices(
  edgeA: ParameterizedVertex[],
  edgeB: ParameterizedVertex[],
): Array<[number, number]> {
  if (edgeA.length === 0 || edgeB.length === 0) return [];

  const pairs: Array<[number, number]> = [];

  // Use the shorter edge as the driver to ensure every vertex gets paired
  const [driver, target] = edgeA.length <= edgeB.length
    ? [edgeA, edgeB]
    : [edgeB, edgeA];
  const driverIsA = edgeA.length <= edgeB.length;

  for (const dv of driver) {
    let bestIdx = 0;
    let bestDist = Math.abs(dv.t - target[0].t);
    for (let j = 1; j < target.length; j++) {
      const dist = Math.abs(dv.t - target[j].t);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = j;
      }
    }
    if (driverIsA) {
      pairs.push([dv.index, target[bestIdx].index]);
    } else {
      pairs.push([target[bestIdx].index, dv.index]);
    }
  }

  return pairs;
}

// ─── Multi-piece Mesh Merging ───────────────────────────────────────────────

/**
 * Merge multiple piece meshes into a single combined mesh with shared particle system.
 *
 * All vertex positions are concatenated into one Float32Array, triangle indices
 * are offset accordingly, and per-piece offset info is tracked for later use.
 *
 * @param pieces - Array of { pieceId, vertices (flat xyz), triIds, uvs? (flat uv) }
 * @returns Merged mesh with offset tracking
 */
export function mergeMeshes(
  pieces: Array<{ pieceId: string; vertices: Float32Array; triIds: Int32Array; uvs?: Float32Array }>,
): MergedMesh {
  const totalVerts = pieces.reduce((s, p) => s + p.vertices.length, 0);
  const totalTris = pieces.reduce((s, p) => s + p.triIds.length, 0);
  const hasUVs = pieces.every(p => p.uvs && p.uvs.length > 0);
  const totalUVs = hasUVs ? pieces.reduce((s, p) => s + (p.uvs?.length ?? 0), 0) : 0;

  const vertices = new Float32Array(totalVerts);
  const triIds = new Int32Array(totalTris);
  const uvs = hasUVs ? new Float32Array(totalUVs) : undefined;
  const offsets: PieceOffset[] = [];

  let vOff = 0; // float offset for vertices
  let tOff = 0; // int offset for triangles
  let uvOff = 0; // float offset for UVs

  for (const p of pieces) {
    const vertexOffset = vOff / 3;
    const vertexCount = p.vertices.length / 3;
    const triangleOffset = tOff / 3;
    const triangleCount = p.triIds.length / 3;

    vertices.set(p.vertices, vOff);
    for (let i = 0; i < p.triIds.length; i++) {
      triIds[tOff + i] = p.triIds[i] + vertexOffset;
    }

    // Merge UVs if available
    if (uvs && p.uvs) {
      uvs.set(p.uvs, uvOff);
      uvOff += p.uvs.length;
    }

    offsets.push({
      pieceId: p.pieceId,
      vertexOffset,
      vertexCount,
      triangleOffset,
      triangleCount,
    });

    vOff += p.vertices.length;
    tOff += p.triIds.length;
  }

  return { vertices, triIds, pieces: offsets, uvs };
}

// ─── Seam Constraint Generation ─────────────────────────────────────────────

/**
 * Build seam constraints from a list of seams, outlines, and a merged mesh.
 *
 * For each seam, resolves edge names to segment ranges using piece edge data,
 * parameterizes both edges, matches vertices, and creates XPBD distance
 * constraints that will pull the pairs together.
 *
 * @param seams - Seam definitions (edge-name based)
 * @param outlines - Map of pieceId → outline PathCommand[]
 * @param mergedMesh - The merged mesh (needed for piece offsets and positions)
 * @param pieces - Optional map of pieceId → { edges } for resolving edge names to segment ranges
 * @param config - Optional seam constraint configuration
 * @returns SeamConstraintSet ready for the solver
 */
export function buildSeamConstraints(
  seams: Seam[],
  outlines: Map<string, PathCommand[]>,
  mergedMesh: MergedMesh,
  pieces?: Map<string, { edges?: Array<Pick<SemanticEdge, 'name' | 'segmentRange'>> }>,
  config: SeamConstraintConfig = DEFAULT_SEAM_CONFIG,
): SeamConstraintSet {
  const allPairs: Array<{ idA: number; idB: number; compliance: number }> = [];
  const positions = mergedMesh.vertices;

  for (const seam of seams) {
    const outlineA = outlines.get(seam.pieceA.pieceId);
    const outlineB = outlines.get(seam.pieceB.pieceId);
    if (!outlineA || !outlineB) continue;

    const offsetA = mergedMesh.pieces.find(p => p.pieceId === seam.pieceA.pieceId);
    const offsetB = mergedMesh.pieces.find(p => p.pieceId === seam.pieceB.pieceId);
    if (!offsetA || !offsetB) continue;

    // Resolve edge names to segment ranges
    const pieceAData = pieces?.get(seam.pieceA.pieceId);
    const pieceBData = pieces?.get(seam.pieceB.pieceId);
    const edgeADef = pieceAData?.edges?.find(e => e.name === seam.pieceA.edgeName);
    const edgeBDef = pieceBData?.edges?.find(e => e.name === seam.pieceB.edgeName);
    if (!edgeADef || !edgeBDef) continue;

    // Default maxEdgeLength is 15 in CDT, but we should ideally pass this from config
    const maxEdgeLength = 15;

    const edgeA = parameterizeEdge(outlineA, edgeADef.segmentRange[0], edgeADef.segmentRange[1], offsetA.vertexOffset, 12, maxEdgeLength);
    const edgeB = parameterizeEdge(outlineB, edgeBDef.segmentRange[0], edgeBDef.segmentRange[1], offsetB.vertexOffset, 12, maxEdgeLength);

    const pairs = matchVertices(edgeA, edgeB);
    const compliance = config.compliance[seam.type];

    for (const [idA, idB] of pairs) {
      allPairs.push({ idA, idB, compliance });
    }
  }

  const count = allPairs.length;
  const ids = new Int32Array(count * 2);
  const restLengths = new Float32Array(count);
  const compliances = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const { idA, idB, compliance } = allPairs[i];
    ids[2 * i] = idA;
    ids[2 * i + 1] = idB;

    // Initial rest length = current distance
    const ai = idA * 3;
    const bi = idB * 3;
    const dx = positions[ai] - positions[bi];
    const dy = positions[ai + 1] - positions[bi + 1];
    const dz = positions[ai + 2] - positions[bi + 2];
    restLengths[i] = Math.sqrt(dx * dx + dy * dy + dz * dz);

    compliances[i] = compliance;
  }

  return { ids, restLengths, compliances, count, config };
}

// ─── XPBD Seam Constraint Solver ────────────────────────────────────────────

/**
 * Solve seam constraints for one substep using XPBD projection.
 *
 * Applies distance constraints between paired vertices, gradually shrinking
 * rest lengths toward zero to "sew" pieces together.
 *
 * Uses the same XPBD distance constraint math as the stretching solver:
 * `Δx = -C / (w0 + w1 + α) * w_i * gradient`
 *
 * @param positions - Current particle positions (modified in place)
 * @param invMass - Inverse mass per particle
 * @param seamSet - The seam constraint set
 * @param sdt - Substep delta time
 */
export function solveSeamConstraints(
  positions: Float32Array,
  invMass: Float32Array,
  seamSet: SeamConstraintSet,
  sdt: number,
): void {
  // Shrink rest lengths
  for (let i = 0; i < seamSet.count; i++) {
    if (seamSet.restLengths[i] > seamSet.config.sewedThreshold) {
      seamSet.restLengths[i] *= seamSet.config.shrinkFactor;
      if (seamSet.restLengths[i] < seamSet.config.sewedThreshold) {
        seamSet.restLengths[i] = 0;
      }
    }
  }

  // Solve distance constraints
  for (let i = 0; i < seamSet.count; i++) {
    const id0 = seamSet.ids[2 * i];
    const id1 = seamSet.ids[2 * i + 1];

    const w0 = invMass[id0];
    const w1 = invMass[id1];
    const w = w0 + w1;
    if (w === 0) continue;

    const alpha = seamSet.compliances[i] / (sdt * sdt);

    const i0 = id0 * 3;
    const i1 = id1 * 3;
    const dx = positions[i0] - positions[i1];
    const dy = positions[i0 + 1] - positions[i1 + 1];
    const dz = positions[i0 + 2] - positions[i1 + 2];
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len === 0) continue;

    const restLen = seamSet.restLengths[i];
    const C = len - restLen;
    const s = -C / (w + alpha);
    const nx = dx / len;
    const ny = dy / len;
    const nz = dz / len;

    positions[i0] += s * w0 * nx;
    positions[i0 + 1] += s * w0 * ny;
    positions[i0 + 2] += s * w0 * nz;
    positions[i1] -= s * w1 * nx;
    positions[i1 + 1] -= s * w1 * ny;
    positions[i1 + 2] -= s * w1 * nz;
  }
}

/**
 * Check if all seam constraints are fully sewn (rest length ≈ 0).
 *
 * @param seamSet - The seam constraint set
 * @returns true if all constraints have rest length below threshold
 */
export function isFullySewn(seamSet: SeamConstraintSet): boolean {
  for (let i = 0; i < seamSet.count; i++) {
    if (seamSet.restLengths[i] > seamSet.config.sewedThreshold) {
      return false;
    }
  }
  return true;
}
