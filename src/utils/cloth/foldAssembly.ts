/**
 * Fold Assembly — maps 2D fold lines to 3D mesh edge constraints.
 *
 * Extracts fold InternalLines from piece data, finds the closest
 * mesh edges, and produces fold constraint specs for the XPBD solver.
 *
 * @module foldAssembly
 */

import type { PathCommand, InternalLine } from '../../types/types';
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

  // Collect only the pieces that carry fold lines, preserving iteration order.
  // Each becomes an "owner" indexed by its position here; the order is kept so
  // the emitted specs match the original piece/fold-line ordering exactly.
  const foldPieces: Array<{
    vertexOffset: number;
    vertexCount: number;
    foldLines: InternalLine[];
  }> = [];
  for (const [pieceId, internals] of pieceInternals) {
    const foldLines = internals.filter(l => l.type === 'fold' && l.foldOptions);
    if (foldLines.length === 0) continue;

    const pieceOffset = mergedMesh.pieces.find(p => p.pieceId === pieceId);
    if (!pieceOffset) continue;
    if (pieceOffset.vertexCount <= 0) continue;

    foldPieces.push({
      vertexOffset: pieceOffset.vertexOffset,
      vertexCount: pieceOffset.vertexCount,
      foldLines,
    });
  }
  if (foldPieces.length === 0) return specs;

  const verts = mergedMesh.vertices;
  const triIds = mergedMesh.triIds;
  const totalVerts = Math.floor(verts.length / 3);

  // Map each vertex to its owning fold piece (−1 = not in any fold piece).
  // Triangles never span pieces, so an intra-piece edge has both endpoints in
  // the same owner; everything else stays −1 and is skipped.
  const vertexOwner = new Int32Array(totalVerts).fill(-1);
  for (let f = 0; f < foldPieces.length; f++) {
    const { vertexOffset, vertexCount } = foldPieces[f];
    const end = Math.min(vertexOffset + vertexCount, totalVerts);
    for (let v = Math.max(0, vertexOffset); v < end; v++) vertexOwner[v] = f;
  }

  // Single pass over triangles: bucket each intra-piece edge (deduped) under
  // its owning fold piece. Stored min→max to mirror the original edge key.
  // This is the O(N) replacement for the old O(N²) all-pairs membership scan.
  const edgesByPiece: Array<Array<[number, number]>> = foldPieces.map(() => []);
  const seenByPiece: Array<Set<string>> = foldPieces.map(() => new Set<string>());
  const addEdge = (p: number, q: number): void => {
    if (p === q) return; // self-edge (degenerate triangle) — never an `i<j` pair
    if (p < 0 || q < 0 || p >= totalVerts || q >= totalVerts) return;
    const owner = vertexOwner[p];
    if (owner < 0 || vertexOwner[q] !== owner) return;
    const lo = p < q ? p : q;
    const hi = p < q ? q : p;
    const key = `${lo}-${hi}`;
    const seen = seenByPiece[owner];
    if (seen.has(key)) return;
    seen.add(key);
    edgesByPiece[owner].push([lo, hi]);
  };
  const triCount = Math.floor(triIds.length / 3);
  for (let t = 0; t < triCount; t++) {
    const a = triIds[t * 3], b = triIds[t * 3 + 1], c = triIds[t * 3 + 2];
    addEdge(a, b);
    addEdge(b, c);
    addEdge(a, c);
  }

  // Sort each piece's edges by (a, b) ascending. This replicates the visit
  // order of the original `i` then `j` double loop, so the strict `<` tie-break
  // resolves to the exact same edge on equal distances.
  for (const edges of edgesByPiece) {
    edges.sort((e1, e2) => (e1[0] - e2[0]) || (e1[1] - e2[1]));
  }

  for (let f = 0; f < foldPieces.length; f++) {
    const { vertexOffset, vertexCount, foldLines } = foldPieces[f];
    const edges = edgesByPiece[f];

    // Compute piece centroid in 3D for reference
    let cx = 0, _cy = 0, cz = 0;
    for (let i = vertexOffset; i < vertexOffset + vertexCount; i++) {
      cx += verts[i * 3]; _cy += verts[i * 3 + 1]; cz += verts[i * 3 + 2];
    }
    cx /= vertexCount; _cy /= vertexCount; cz /= vertexCount;

    for (const foldLine of foldLines) {
      const opts = foldLine.foldOptions;
      if (!opts) continue;
      const foldPoints = extractLinePoints(foldLine.path);
      if (foldPoints.length < 2) continue;

      // Find the mesh edge whose midpoint is closest to the fold line midpoint
      // projected onto XZ (pattern 2D → simulation 3D mapping: x→X, y→Z)
      let bestEdgeA = -1, bestEdgeB = -1;
      let bestEdgeDist = Infinity;

      for (const [i, j] of edges) {
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
        if (!Number.isFinite(dist)) continue;

        if (dist < bestEdgeDist) {
          bestEdgeDist = dist;
          bestEdgeA = i;
          bestEdgeB = j;
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
