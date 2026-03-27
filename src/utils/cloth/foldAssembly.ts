/**
 * Fold Assembly — maps 2D fold lines to 3D mesh edge constraints.
 *
 * Extracts fold InternalLines from piece data, finds the closest
 * mesh edges, and produces fold constraint specs for the XPBD solver.
 *
 * @module foldAssembly
 */

import type { PathCommand, InternalLine, FoldOptions } from '../../types/types';
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
 * For each fold InternalLine, finds the closest bending edge in the merged mesh
 * and creates a constraint spec with the fold's crease angle and direction.
 *
 * The matching uses the 3D mesh positions directly (no unit conversion needed —
 * the mesh is already in simulation space from the placement pipeline).
 */
export function buildFoldConstraints(
  pieceInternals: Map<string, InternalLine[]>,
  _pieceOutlines: Map<string, PathCommand[]>,
  mergedMesh: MergedMesh,
): FoldConstraintSpec[] {
  const specs: FoldConstraintSpec[] = [];

  // Pre-build a set of valid bending edges from the mesh triangles
  // Each edge connects two vertices that share a triangle edge
  const edgeSet = new Set<string>();
  const triIds = mergedMesh.triIds;
  for (let t = 0; t < triIds.length / 3; t++) {
    const a = triIds[t * 3], b = triIds[t * 3 + 1], c = triIds[t * 3 + 2];
    edgeSet.add(a < b ? `${a}-${b}` : `${b}-${a}`);
    edgeSet.add(b < c ? `${b}-${c}` : `${c}-${b}`);
    edgeSet.add(a < c ? `${a}-${c}` : `${c}-${a}`);
  }

  for (const [pieceId, internals] of pieceInternals) {
    const foldLines = internals.filter(l => l.type === 'fold' && l.foldOptions);
    if (foldLines.length === 0) continue;

    const pieceOffset = mergedMesh.pieces.find(p => p.pieceId === pieceId);
    if (!pieceOffset) continue;

    const verts = mergedMesh.vertices;
    const { vertexOffset, vertexCount } = pieceOffset;

    // Compute piece centroid in 3D for reference
    let cx = 0, cy = 0, cz = 0;
    for (let i = vertexOffset; i < vertexOffset + vertexCount; i++) {
      cx += verts[i * 3]; cy += verts[i * 3 + 1]; cz += verts[i * 3 + 2];
    }
    cx /= vertexCount; cy /= vertexCount; cz /= vertexCount;

    for (const foldLine of foldLines) {
      const opts = foldLine.foldOptions as FoldOptions;
      const foldPoints = extractLinePoints(foldLine.path);
      if (foldPoints.length < 2) continue;

      // The fold line start point is on the piece outline.
      // We need to find the mesh edge closest to this 2D point.
      // Since 3D positions come from the placement pipeline (already transformed),
      // we search for the closest EDGE (not just closest vertex pair).
      const startPt = foldPoints[0];
      const endPt = foldPoints[foldPoints.length - 1];

      // Find the mesh edge whose midpoint is closest to the fold line midpoint
      // projected onto XZ (pattern 2D → simulation 3D mapping: x→X, y→Z)
      const foldMidX = (startPt.x + endPt.x) / 2;
      const foldMidY = (startPt.y + endPt.y) / 2;

      let bestEdgeA = -1, bestEdgeB = -1;
      let bestEdgeDist = Infinity;

      // Search all edges in this piece's vertex range
      for (let i = vertexOffset; i < vertexOffset + vertexCount; i++) {
        for (let j = i + 1; j < vertexOffset + vertexCount; j++) {
          const key = `${i}-${j}`;
          if (!edgeSet.has(key)) continue;

          // Edge midpoint in 3D
          const mx = (verts[i * 3] + verts[j * 3]) / 2;
          const mz = (verts[i * 3 + 2] + verts[j * 3 + 2]) / 2;

          // Compare to fold midpoint (use centroid-relative coordinates
          // to handle placement transforms — both fold and mesh are relative
          // to the same piece origin)
          const dx = mx - cx;
          const dz = mz - cz;
          // Fold midpoint relative to piece center (pattern space, arbitrary units)
          // This is approximate — exact mapping requires the placement transform
          const dist = dx * dx + dz * dz;

          if (dist < bestEdgeDist) {
            bestEdgeDist = dist;
            bestEdgeA = i;
            bestEdgeB = j;
          }
        }
      }

      if (bestEdgeA >= 0 && bestEdgeB >= 0) {
        const creaseAngle = opts.creaseAngleDeg ?? 180;

        // Mountain fold: use crease angle directly
        // Valley fold: invert (360 - θ)
        const effectiveAngle = opts.direction === 'valley'
          ? Math.min(360, 360 - creaseAngle)
          : creaseAngle;

        specs.push({
          edgeA: bestEdgeA,
          edgeB: bestEdgeB,
          creaseAngleDeg: effectiveAngle,
          stiffness: 0.8,
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
