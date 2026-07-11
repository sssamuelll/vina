/**
 * Tests for foldAssembly.buildFoldConstraints.
 *
 * Covers semantic parity against the original O(N²) implementation
 * (kept here as `legacyImpl`, intentionally NOT exported from the product
 * module), edge cases, and a scalability test that the old all-pairs scan
 * cannot satisfy.
 */

import { describe, it, expect } from 'vitest';
import { buildFoldConstraints, type FoldConstraintSpec } from '../foldAssembly';
import type { MergedMesh, PieceOffset } from '../seamAssembly';
import type { InternalLine, PathCommand, FoldOptions } from '../../../types/types';

// ─── Legacy implementation (the pre-refactor O(N²) version) ──────────────────
// Reproduced verbatim from the original module for parity comparison only.
// Deliberately not exported from foldAssembly.ts — it lives here so the new
// implementation can be checked output-for-output against it.
function legacyImpl(
  pieceInternals: Map<string, InternalLine[]>,
  _pieceOutlines: Map<string, PathCommand[]>,
  mergedMesh: MergedMesh,
): FoldConstraintSpec[] {
  const specs: FoldConstraintSpec[] = [];

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

    let cx = 0, _cy = 0, cz = 0;
    for (let i = vertexOffset; i < vertexOffset + vertexCount; i++) {
      cx += verts[i * 3]; _cy += verts[i * 3 + 1]; cz += verts[i * 3 + 2];
    }
    cx /= vertexCount; _cy /= vertexCount; cz /= vertexCount;

    for (const foldLine of foldLines) {
      const opts = foldLine.foldOptions as FoldOptions;
      const foldPoints: Array<{ x: number; y: number }> = [];
      for (const cmd of foldLine.path) {
        if (cmd.type === 'M' || cmd.type === 'L') {
          foldPoints.push({ x: cmd.values[0], y: cmd.values[1] });
        }
      }
      if (foldPoints.length < 2) continue;

      let bestEdgeA = -1, bestEdgeB = -1;
      let bestEdgeDist = Infinity;

      for (let i = vertexOffset; i < vertexOffset + vertexCount; i++) {
        for (let j = i + 1; j < vertexOffset + vertexCount; j++) {
          const key = `${i}-${j}`;
          if (!edgeSet.has(key)) continue;

          const mx = (verts[i * 3] + verts[j * 3]) / 2;
          const mz = (verts[i * 3 + 2] + verts[j * 3 + 2]) / 2;
          const dx = mx - cx;
          const dz = mz - cz;
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

// ─── Mesh construction helpers ───────────────────────────────────────────────

interface GridPiece {
  vertices: number[];
  triIds: number[];
  vertexCount: number;
}

/**
 * Build a triangulated R×C grid in the XZ plane (Y=0) starting at vertex index
 * `base`. Vertices laid row-major; two triangles per cell. Cell size `cell`.
 */
function makeGrid(rows: number, cols: number, cell: number, base: number, originX = 0, originZ = 0): GridPiece {
  const vertices: number[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      vertices.push(originX + c * cell, 0, originZ + r * cell);
    }
  }
  const triIds: number[] = [];
  const at = (r: number, c: number) => base + r * cols + c;
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const v00 = at(r, c), v01 = at(r, c + 1), v10 = at(r + 1, c), v11 = at(r + 1, c + 1);
      triIds.push(v00, v01, v11);
      triIds.push(v00, v11, v10);
    }
  }
  return { vertices, triIds, vertexCount: rows * cols };
}

function foldLine(id: string, points: Array<[number, number]>, options: FoldOptions): InternalLine {
  const path: PathCommand[] = points.map((p, idx) => ({
    type: idx === 0 ? 'M' : 'L',
    values: [p[0], p[1]],
  }));
  return { id, type: 'fold', path, foldOptions: options };
}

const MOUNTAIN: FoldOptions = { direction: 'mountain', creaseAngleDeg: 90 };
const VALLEY: FoldOptions = { direction: 'valley', creaseAngleDeg: 120 };

/** Build a single-piece MergedMesh from one grid. */
function singlePieceMesh(grid: GridPiece, pieceId = 'p1'): MergedMesh {
  const piece: PieceOffset = {
    pieceId,
    vertexOffset: 0,
    vertexCount: grid.vertexCount,
    triangleOffset: 0,
    triangleCount: grid.triIds.length / 3,
  };
  return {
    vertices: new Float32Array(grid.vertices),
    triIds: new Int32Array(grid.triIds),
    pieces: [piece],
  };
}

// Deterministic PRNG (mulberry32) so "random" inputs are reproducible.
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Parity ──────────────────────────────────────────────────────────────────

describe('buildFoldConstraints — parity with legacy O(N²) implementation', () => {
  it('matches legacy output for a fixed single-piece grid with one fold', () => {
    const grid = makeGrid(5, 5, 10, 0);
    const mesh = singlePieceMesh(grid);
    const internals = new Map<string, InternalLine[]>([
      ['p1', [foldLine('f1', [[20, 20], [30, 20]], MOUNTAIN)]],
    ]);
    const outlines = new Map<string, PathCommand[]>();

    const next = buildFoldConstraints(internals, outlines, mesh);
    const prev = legacyImpl(internals, outlines, mesh);
    expect(next).toEqual(prev);
    expect(next.length).toBe(1);
  });

  it('matches legacy across 10 seeded random meshes/folds', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const rng = makeRng(seed);
      const rows = 3 + Math.floor(rng() * 6);
      const cols = 3 + Math.floor(rng() * 6);
      const grid = makeGrid(rows, cols, 5 + rng() * 10, 0, rng() * 50, rng() * 50);
      const mesh = singlePieceMesh(grid);
      // Perturb Y slightly so centroids/midpoints are non-trivial.
      for (let i = 0; i < mesh.vertices.length; i += 3) {
        mesh.vertices[i + 1] = rng() * 2;
      }
      const folds: InternalLine[] = [];
      const nFolds = 1 + Math.floor(rng() * 3);
      for (let k = 0; k < nFolds; k++) {
        folds.push(
          foldLine(`f${k}`, [[rng() * 50, rng() * 50], [rng() * 50, rng() * 50]],
            rng() > 0.5 ? MOUNTAIN : VALLEY),
        );
      }
      const internals = new Map<string, InternalLine[]>([['p1', folds]]);
      const outlines = new Map<string, PathCommand[]>();

      const next = buildFoldConstraints(internals, outlines, mesh);
      const prev = legacyImpl(internals, outlines, mesh);
      expect(next, `seed ${seed}`).toEqual(prev);
    }
  });

  it('matches legacy with multiple pieces, only some carrying folds', () => {
    const g1 = makeGrid(4, 4, 10, 0, 0, 0);
    const g2 = makeGrid(3, 5, 8, g1.vertexCount, 100, 0);
    const g3 = makeGrid(4, 3, 12, g1.vertexCount + g2.vertexCount, 0, 100);
    const verts = [...g1.vertices, ...g2.vertices, ...g3.vertices];
    const tris = [...g1.triIds, ...g2.triIds, ...g3.triIds];
    const mesh: MergedMesh = {
      vertices: new Float32Array(verts),
      triIds: new Int32Array(tris),
      pieces: [
        { pieceId: 'a', vertexOffset: 0, vertexCount: g1.vertexCount, triangleOffset: 0, triangleCount: g1.triIds.length / 3 },
        { pieceId: 'b', vertexOffset: g1.vertexCount, vertexCount: g2.vertexCount, triangleOffset: g1.triIds.length / 3, triangleCount: g2.triIds.length / 3 },
        { pieceId: 'c', vertexOffset: g1.vertexCount + g2.vertexCount, vertexCount: g3.vertexCount, triangleOffset: (g1.triIds.length + g2.triIds.length) / 3, triangleCount: g3.triIds.length / 3 },
      ],
    };
    const internals = new Map<string, InternalLine[]>([
      ['a', [foldLine('fa', [[10, 10], [20, 10]], MOUNTAIN)]],
      // 'b' has no folds at all
      ['c', [foldLine('fc', [[5, 105], [15, 105]], VALLEY)]],
    ]);
    const outlines = new Map<string, PathCommand[]>();

    const next = buildFoldConstraints(internals, outlines, mesh);
    const prev = legacyImpl(internals, outlines, mesh);
    expect(next).toEqual(prev);
    expect(next.length).toBe(2);
  });
});

// ─── Edge cases ──────────────────────────────────────────────────────────────

describe('buildFoldConstraints — edge cases', () => {
  it('empty mesh / no internals yields no specs (and matches legacy)', () => {
    const mesh: MergedMesh = { vertices: new Float32Array([]), triIds: new Int32Array([]), pieces: [] };
    const internals = new Map<string, InternalLine[]>();
    const outlines = new Map<string, PathCommand[]>();
    expect(buildFoldConstraints(internals, outlines, mesh)).toEqual([]);
    expect(buildFoldConstraints(internals, outlines, mesh)).toEqual(legacyImpl(internals, outlines, mesh));
  });

  it('piece with a fold but N=1 vertex (no edges) yields no spec', () => {
    const mesh: MergedMesh = {
      vertices: new Float32Array([0, 0, 0]),
      triIds: new Int32Array([]),
      pieces: [{ pieceId: 'p1', vertexOffset: 0, vertexCount: 1, triangleOffset: 0, triangleCount: 0 }],
    };
    const internals = new Map<string, InternalLine[]>([
      ['p1', [foldLine('f1', [[0, 0], [1, 0]], MOUNTAIN)]],
    ]);
    const outlines = new Map<string, PathCommand[]>();
    const next = buildFoldConstraints(internals, outlines, mesh);
    expect(next).toEqual([]);
    expect(next).toEqual(legacyImpl(internals, outlines, mesh));
  });

  it('fold line with < 2 path points is skipped', () => {
    const grid = makeGrid(4, 4, 10, 0);
    const mesh = singlePieceMesh(grid);
    const internals = new Map<string, InternalLine[]>([
      ['p1', [{ id: 'f1', type: 'fold', path: [{ type: 'M', values: [10, 10] }], foldOptions: MOUNTAIN }]],
    ]);
    const outlines = new Map<string, PathCommand[]>();
    expect(buildFoldConstraints(internals, outlines, mesh)).toEqual([]);
  });

  it('duplicate triangle edges (shared by two triangles) are deduped and still match legacy', () => {
    // A 2x2 grid: interior edges are shared by two triangles → exercises dedup.
    const grid = makeGrid(3, 3, 10, 0);
    const mesh = singlePieceMesh(grid);
    const internals = new Map<string, InternalLine[]>([
      ['p1', [foldLine('f1', [[10, 10], [20, 10]], VALLEY)]],
    ]);
    const outlines = new Map<string, PathCommand[]>();
    expect(buildFoldConstraints(internals, outlines, mesh))
      .toEqual(legacyImpl(internals, outlines, mesh));
  });

  it('degenerate triangle with a duplicated vertex id adds no self-edge (matches legacy)', () => {
    // 5x5 grid (cell 10): centroid is exactly vertex index 12 at (20,0,20).
    // A self-edge (12,12) would have midpoint == centroid → distance 0, so it
    // WOULD be selected as "closest" if not excluded — but the legacy i<j loop
    // never considers self-edges. This guards that exact parity divergence.
    const grid = makeGrid(5, 5, 10, 0);
    const mesh = singlePieceMesh(grid);
    const tris = [...Array.from(mesh.triIds), 12, 12, 13];
    mesh.triIds = new Int32Array(tris);
    const internals = new Map<string, InternalLine[]>([
      ['p1', [foldLine('f1', [[0, 0], [5, 0]], MOUNTAIN)]],
    ]);
    const outlines = new Map<string, PathCommand[]>();
    const next = buildFoldConstraints(internals, outlines, mesh);
    expect(next).toEqual(legacyImpl(internals, outlines, mesh));
    // A self-edge would surface as edgeA === edgeB; legacy never emits that.
    for (const s of next) expect(s.edgeA).not.toBe(s.edgeB);
  });

  it('reverse-ordered triangle winding still matches legacy', () => {
    const grid = makeGrid(4, 4, 10, 0);
    // Reverse each triangle's winding (c, b, a) — exercises non-ascending corners.
    const rev: number[] = [];
    for (let t = 0; t < grid.triIds.length / 3; t++) {
      rev.push(grid.triIds[t * 3 + 2], grid.triIds[t * 3 + 1], grid.triIds[t * 3]);
    }
    const mesh = singlePieceMesh({ ...grid, triIds: rev });
    const internals = new Map<string, InternalLine[]>([
      ['p1', [foldLine('f1', [[10, 10], [20, 10]], MOUNTAIN)]],
    ]);
    const outlines = new Map<string, PathCommand[]>();
    expect(buildFoldConstraints(internals, outlines, mesh))
      .toEqual(legacyImpl(internals, outlines, mesh));
  });

  it('NaN vertex positions produce no spurious selection (matches legacy)', () => {
    const grid = makeGrid(4, 4, 10, 0);
    const mesh = singlePieceMesh(grid);
    // Poison one vertex with NaN.
    mesh.vertices[0] = NaN;
    mesh.vertices[2] = NaN;
    const internals = new Map<string, InternalLine[]>([
      ['p1', [foldLine('f1', [[10, 10], [20, 10]], MOUNTAIN)]],
    ]);
    const outlines = new Map<string, PathCommand[]>();
    expect(buildFoldConstraints(internals, outlines, mesh))
      .toEqual(legacyImpl(internals, outlines, mesh));
  });

  it('tie-break: equal-distance edges select the same (a,b)-lex-first edge as legacy', () => {
    // Symmetric grid so several edges are equidistant from the centroid.
    const grid = makeGrid(5, 5, 10, 0);
    const mesh = singlePieceMesh(grid);
    const internals = new Map<string, InternalLine[]>([
      ['p1', [foldLine('f1', [[0, 0], [40, 40]], MOUNTAIN)]],
    ]);
    const outlines = new Map<string, PathCommand[]>();
    const next = buildFoldConstraints(internals, outlines, mesh);
    expect(next).toEqual(legacyImpl(internals, outlines, mesh));
  });

  it('input arrays are not mutated', () => {
    const grid = makeGrid(4, 4, 10, 0);
    const mesh = singlePieceMesh(grid);
    const vertsCopy = Float32Array.from(mesh.vertices);
    const triCopy = Int32Array.from(mesh.triIds);
    const piecesSnapshot = JSON.stringify(mesh.pieces);
    const internals = new Map<string, InternalLine[]>([
      ['p1', [foldLine('f1', [[10, 10], [20, 10]], MOUNTAIN)]],
    ]);
    const internalsSnapshot = JSON.stringify([...internals]);

    buildFoldConstraints(internals, new Map(), mesh);

    expect(mesh.vertices).toEqual(vertsCopy);
    expect(mesh.triIds).toEqual(triCopy);
    expect(JSON.stringify(mesh.pieces)).toBe(piecesSnapshot);
    expect(JSON.stringify([...internals])).toBe(internalsSnapshot);
  });

  it('valley vs mountain crease angles are emitted correctly', () => {
    const grid = makeGrid(4, 4, 10, 0);
    const mesh = singlePieceMesh(grid);
    const internalsM = new Map<string, InternalLine[]>([
      ['p1', [foldLine('f1', [[10, 10], [20, 10]], { direction: 'mountain', creaseAngleDeg: 90 })]],
    ]);
    const internalsV = new Map<string, InternalLine[]>([
      ['p1', [foldLine('f1', [[10, 10], [20, 10]], { direction: 'valley', creaseAngleDeg: 120 })]],
    ]);
    expect(buildFoldConstraints(internalsM, new Map(), mesh)[0].creaseAngleDeg).toBe(90);
    expect(buildFoldConstraints(internalsV, new Map(), mesh)[0].creaseAngleDeg).toBe(240);
  });
});

// ─── Scalability (fails against the legacy O(N²) implementation) ─────────────

describe('buildFoldConstraints — scalability', () => {
  it('handles a large single-piece mesh well under the legacy O(N²) cost', () => {
    // ~80x80 grid = 6400 vertices in one piece, one fold line.
    // Legacy all-pairs scan: ~6400²/2 ≈ 20M string-keyed Set lookups → seconds.
    // Refactored O(N log N): tens of ms. Budget cleanly separates the two.
    const grid = makeGrid(80, 80, 5, 0);
    const mesh = singlePieceMesh(grid);
    const internals = new Map<string, InternalLine[]>([
      ['p1', [foldLine('f1', [[100, 100], [200, 100]], MOUNTAIN)]],
    ]);
    const outlines = new Map<string, PathCommand[]>();

    const start = performance.now();
    const next = buildFoldConstraints(internals, outlines, mesh);
    const elapsed = performance.now() - start;

    expect(next.length).toBe(1);
    // Legacy needs hundreds of ms→seconds here; the refactor is comfortably
    // under 150ms even on slow CI. This assertion fails against legacyImpl.
    expect(elapsed).toBeLessThan(150);
  });

  it('large-mesh output still matches legacy (correctness preserved at scale)', () => {
    const grid = makeGrid(40, 40, 5, 0); // 1600 verts — legacy is tolerable here
    const mesh = singlePieceMesh(grid);
    const internals = new Map<string, InternalLine[]>([
      ['p1', [foldLine('f1', [[80, 80], [120, 80]], VALLEY)]],
    ]);
    const outlines = new Map<string, PathCommand[]>();
    expect(buildFoldConstraints(internals, outlines, mesh))
      .toEqual(legacyImpl(internals, outlines, mesh));
  });
});
