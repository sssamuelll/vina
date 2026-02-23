/**
 * Arc-Length Matcher — Hungarian algorithm for optimal edge matching by length.
 * 
 * Edges that are sewn together must have compatible arc lengths. This module
 * uses the Hungarian (Munkres) algorithm to find the globally optimal assignment
 * of edges between two pieces based on length similarity.
 *
 * @module autoSew/arcLengthMatcher
 */

import type { Edge } from './edgeExtractor';

// ─── Hungarian Algorithm (Munkres) ──────────────────────────────────────────

/**
 * Solve the assignment problem: given an n×m cost matrix, find the assignment
 * of rows to columns that minimizes total cost.
 * 
 * Returns array of [row, col] pairs.
 * Handles non-square matrices by padding.
 */
export function hungarian(costMatrix: number[][]): Array<[number, number]> {
  const n = costMatrix.length;
  if (n === 0) return [];
  const m = costMatrix[0].length;
  if (m === 0) return [];

  // Pad to square
  const size = Math.max(n, m);
  const C: number[][] = Array.from({ length: size }, (_, i) =>
    Array.from({ length: size }, (_, j) =>
      i < n && j < m ? costMatrix[i][j] : 0
    )
  );

  // u[i], v[j] — potentials
  const u = new Float64Array(size + 1);
  const v = new Float64Array(size + 1);
  // p[j] — row assigned to column j
  const p = new Int32Array(size + 1).fill(-1);
  // way[j] — used for path reconstruction
  const way = new Int32Array(size + 1);

  for (let i = 1; i <= size; i++) {
    // Temporarily assign row i-1 to column 0
    p[0] = i - 1;
    let j0 = 0;
    const minv = new Float64Array(size + 1).fill(Infinity);
    const used = new Uint8Array(size + 1);

    do {
      used[j0] = 1;
      const i0 = p[j0];
      let delta = Infinity;
      let j1 = -1;

      for (let j = 1; j <= size; j++) {
        if (used[j]) continue;
        const cur = C[i0][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) {
          minv[j] = cur;
          way[j] = j0;
        }
        if (minv[j] < delta) {
          delta = minv[j];
          j1 = j;
        }
      }

      for (let j = 0; j <= size; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }

      j0 = j1;
    } while (p[j0] !== -1);

    // Reconstruct path
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0 !== 0);
  }

  // Extract assignments (only real rows/cols)
  const result: Array<[number, number]> = [];
  for (let j = 1; j <= size; j++) {
    if (p[j] < n && j - 1 < m) {
      result.push([p[j], j - 1]);
    }
  }

  return result;
}

// ─── Edge length matching ───────────────────────────────────────────────────

export interface LengthMatch {
  edgeA: Edge;
  edgeB: Edge;
  /** 0-1 similarity score (1 = identical length) */
  similarity: number;
  /** Absolute length difference in mm */
  lengthDiff: number;
}

/**
 * Compute length similarity between two edges.
 * Uses a Gaussian-like falloff: identical = 1.0, diverging = 0.0.
 * Tolerance controls how quickly the score drops (in mm).
 */
export function lengthSimilarity(lenA: number, lenB: number, tolerance = 5): number {
  const diff = Math.abs(lenA - lenB);
  // Also penalize large relative differences
  const maxLen = Math.max(lenA, lenB);
  const relDiff = maxLen > 0 ? diff / maxLen : 0;

  // Gaussian: exp(-(diff/tolerance)^2)
  const absSim = Math.exp(-((diff / tolerance) ** 2));
  // Relative penalty: edges with 50%+ length mismatch are unlikely matches
  const relPenalty = relDiff > 0.5 ? 0.1 : 1 - relDiff * 0.5;

  return absSim * relPenalty;
}

/**
 * Build a cost matrix for matching edges from piece A to edges from piece B.
 * Cost = 1 - similarity (so lower = better match).
 */
function buildCostMatrix(edgesA: Edge[], edgesB: Edge[], tolerance: number): number[][] {
  return edgesA.map(eA =>
    edgesB.map(eB => 1 - lengthSimilarity(eA.arcLength, eB.arcLength, tolerance))
  );
}

/**
 * Find optimal edge matches between two pieces using the Hungarian algorithm.
 * 
 * @param edgesA - Edges from piece A
 * @param edgesB - Edges from piece B
 * @param tolerance - Arc length tolerance in mm (default 5mm)
 * @param minSimilarity - Minimum similarity threshold (default 0.3)
 */
export function matchEdgesByLength(
  edgesA: Edge[],
  edgesB: Edge[],
  tolerance = 5,
  minSimilarity = 0.3
): LengthMatch[] {
  if (edgesA.length === 0 || edgesB.length === 0) return [];

  const costMatrix = buildCostMatrix(edgesA, edgesB, tolerance);
  const assignments = hungarian(costMatrix);

  const matches: LengthMatch[] = [];
  for (const [i, j] of assignments) {
    const sim = lengthSimilarity(edgesA[i].arcLength, edgesB[j].arcLength, tolerance);
    if (sim >= minSimilarity) {
      matches.push({
        edgeA: edgesA[i],
        edgeB: edgesB[j],
        similarity: sim,
        lengthDiff: Math.abs(edgesA[i].arcLength - edgesB[j].arcLength),
      });
    }
  }

  return matches.sort((a, b) => b.similarity - a.similarity);
}
