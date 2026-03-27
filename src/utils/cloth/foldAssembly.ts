/**
 * Fold Assembly — maps 2D fold lines to 3D mesh edge constraints.
 *
 * Extracts fold InternalLines from piece data, finds the closest
 * mesh edges, and produces fold constraint specs for the XPBD solver.
 *
 * @module foldAssembly
 */

import type { PathCommand, InternalLine, FoldOptions } from '../../types/types';
import { flattenPath } from '../seam/index';
import type { MergedMesh } from './seamAssembly';

export interface FoldConstraintSpec {
  edgeA: number;
  edgeB: number;
  creaseAngleDeg: number;
  stiffness: number;
}

/**
 * Build fold constraints from piece internals containing fold lines.
 *
 * For each fold InternalLine, finds the closest mesh edge in the merged mesh
 * and creates a constraint spec with the fold's crease angle and direction.
 *
 * @param pieceInternals Map of pieceId → InternalLine[] (only 'fold' type used)
 * @param pieceOutlines Map of pieceId → PathCommand[]
 * @param mergedMesh Merged mesh with piece offsets
 * @returns Array of fold constraint specs for the solver
 */
export function buildFoldConstraints(
  pieceInternals: Map<string, InternalLine[]>,
  pieceOutlines: Map<string, PathCommand[]>,
  mergedMesh: MergedMesh,
): FoldConstraintSpec[] {
  const specs: FoldConstraintSpec[] = [];

  for (const [pieceId, internals] of pieceInternals) {
    const foldLines = internals.filter(l => l.type === 'fold' && l.foldOptions);
    if (foldLines.length === 0) continue;

    const outline = pieceOutlines.get(pieceId);
    if (!outline) continue;

    const pieceOffset = mergedMesh.pieces.find(p => p.pieceId === pieceId);
    if (!pieceOffset) continue;

    const flatOutline = flattenPath(outline);
    if (flatOutline.length === 0) continue;

    for (const foldLine of foldLines) {
      const opts = foldLine.foldOptions as FoldOptions;
      const foldPoints = extractLinePoints(foldLine.path);
      if (foldPoints.length < 2) continue;

      // Find the mesh edge closest to the fold line start point
      // The fold line goes from edge inward, so the start point is on the outline
      const startPt = foldPoints[0];

      // Find two closest outline vertices to the fold line start
      const verts = mergedMesh.vertices;
      const { vertexOffset, vertexCount } = pieceOffset;

      let bestA = -1, bestB = -1;
      let bestDistA = Infinity, bestDistB = Infinity;

      for (let i = vertexOffset; i < vertexOffset + vertexCount; i++) {
        const dx = verts[i * 3] - startPt.x * 0.001; // mm → m (approximate)
        const dy = verts[i * 3 + 1]; // Y is up in 3D
        const dz = verts[i * 3 + 2] - startPt.y * 0.001;
        // Use XZ distance (2D pattern maps to XZ plane in 3D)
        const dist = dx * dx + dz * dz;
        if (dist < bestDistA) {
          bestDistB = bestDistA; bestB = bestA;
          bestDistA = dist; bestA = i;
        } else if (dist < bestDistB) {
          bestDistB = dist; bestB = i;
        }
      }

      if (bestA >= 0 && bestB >= 0 && bestA !== bestB) {
        // Direction affects which way the fold goes
        // Mountain = fold outward (away from body), Valley = fold inward
        const directionMultiplier = opts.direction === 'valley' ? -1 : 1;
        const creaseAngle = opts.creaseAngleDeg ?? 180;

        // For mountain fold: use the crease angle directly
        // For valley fold: use 360 - creaseAngle (fold the other way)
        const effectiveAngle = opts.direction === 'valley'
          ? Math.min(360, 360 - creaseAngle)
          : creaseAngle;

        specs.push({
          edgeA: bestA,
          edgeB: bestB,
          creaseAngleDeg: effectiveAngle,
          stiffness: 0.8, // Default crisp fold
        });
      }
    }
  }

  return specs;
}

/** Extract 2D points from a fold line path. */
function extractLinePoints(path: PathCommand[]): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];
  for (const cmd of path) {
    if (cmd.type === 'M' || cmd.type === 'L') {
      points.push({ x: cmd.values[0], y: cmd.values[1] });
    }
  }
  return points;
}
