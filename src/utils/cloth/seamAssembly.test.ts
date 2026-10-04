import { describe, it, expect } from 'vitest';
import {
  computeArcLengthParams,
  parameterizeEdge,
  matchVertices,
  mergeMeshes,
  buildSeamConstraints,
  solveSeamConstraints,
  isFullySewn,
  DEFAULT_SEAM_CONFIG,
  SEAM_REST_LENGTH_FLOOR_MIN_M,
  computeSeamRestLengthFloor,
  seamInitDataToSeams,
  type ParameterizedVertex,
  type SeamConstraintSet,
  type SeamInitData,
} from './seamAssembly';
import type { PathCommand, Seam } from '../../types/types';

// ─── Arc-length Parameterization ────────────────────────────────────────────

describe('computeArcLengthParams', () => {
  it('returns empty for empty input', () => {
    expect(computeArcLengthParams([])).toEqual([]);
  });

  it('returns [0] for single point', () => {
    expect(computeArcLengthParams([{ x: 5, y: 5 }])).toEqual([0]);
  });

  it('parameterizes a straight horizontal line', () => {
    const points = [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }];
    const params = computeArcLengthParams(points);
    expect(params).toEqual([0, 0.5, 1]);
  });

  it('parameterizes an L-shape correctly', () => {
    // L-shape: go right 3, then up 4 → total length 7
    const points = [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 4 }];
    const params = computeArcLengthParams(points);
    expect(params[0]).toBeCloseTo(0);
    expect(params[1]).toBeCloseTo(3 / 7);
    expect(params[2]).toBeCloseTo(1);
  });

  it('handles coincident points (zero length)', () => {
    const points = [{ x: 1, y: 1 }, { x: 1, y: 1 }];
    const params = computeArcLengthParams(points);
    expect(params).toEqual([0, 0]);
  });
});

// ─── Edge Parameterization ──────────────────────────────────────────────────

describe('parameterizeEdge', () => {
  const squareOutline: PathCommand[] = [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [10, 0] },
    { type: 'L', values: [10, 10] },
    { type: 'L', values: [0, 10] },
    { type: 'Z', values: [] },
  ];

  it('parameterizes a straight edge segment', () => {
    // Edge from vertex 0 to vertex 1 (bottom edge of square)
    const result = parameterizeEdge(squareOutline, 0, 1);
    expect(result.length).toBe(2);
    expect(result[0].t).toBeCloseTo(0);
    expect(result[1].t).toBeCloseTo(1);
  });

  it('applies global offset to indices', () => {
    const result = parameterizeEdge(squareOutline, 0, 1, 100);
    expect(result[0].index).toBe(100);
    expect(result[1].index).toBe(101);
  });

  it('handles multi-vertex edge (corner)', () => {
    // Vertices 0→1→2 = bottom + right edge
    const result = parameterizeEdge(squareOutline, 0, 2);
    expect(result.length).toBe(3);
    expect(result[0].t).toBeCloseTo(0);
    expect(result[2].t).toBeCloseTo(1);
  });

  it('subdivides edges longer than maxEdgeLength', () => {
    // Edge 0→1 is 10 units long. If maxEdgeLength is 4, it should split into 3 segments
    // and produce 4 vertices. The T parameters will be uniform (0, 0.33, 0.66, 1.0).
    const result = parameterizeEdge(squareOutline, 0, 1, 0, 12, 4);
    expect(result.length).toBe(4);
    expect(result[0].t).toBeCloseTo(0);
    expect(result[1].t).toBeCloseTo(1/3); 
    expect(result[2].t).toBeCloseTo(2/3);
    expect(result[3].t).toBeCloseTo(1.0);
  });
});

// ─── Vertex Matching ────────────────────────────────────────────────────────

describe('matchVertices', () => {
  it('returns empty for empty inputs', () => {
    expect(matchVertices([], [])).toEqual([]);
    expect(matchVertices([{ index: 0, t: 0 }], [])).toEqual([]);
  });

  it('matches equal-count edges 1:1', () => {
    const a: ParameterizedVertex[] = [
      { index: 0, t: 0 }, { index: 1, t: 0.5 }, { index: 2, t: 1 },
    ];
    const b: ParameterizedVertex[] = [
      { index: 10, t: 0 }, { index: 11, t: 0.5 }, { index: 12, t: 1 },
    ];
    const pairs = matchVertices(a, b);
    expect(pairs).toEqual([[0, 10], [1, 11], [2, 12]]);
  });

  it('handles unequal vertex counts (fewer on A) — every B vertex gets a stitch', () => {
    const a: ParameterizedVertex[] = [
      { index: 0, t: 0 }, { index: 1, t: 1 },
    ];
    const b: ParameterizedVertex[] = [
      { index: 10, t: 0 }, { index: 11, t: 0.5 }, { index: 12, t: 1 },
    ];
    const pairs = matchVertices(a, b);
    // Bidirectional (F2 costura real): A-driven gives (0,10),(1,12); B-driven
    // adds (0,11) — b11 (t=0.5) ties to a0/a1, lower index wins. No skipped
    // stitches: b11 no longer floats unconstrained. Sorted by (tA, tB).
    expect(pairs).toEqual([[0, 10], [0, 11], [1, 12]]);
  });

  it('handles unequal vertex counts (fewer on B) — every A vertex gets a stitch', () => {
    const a: ParameterizedVertex[] = [
      { index: 0, t: 0 }, { index: 1, t: 0.5 }, { index: 2, t: 1 },
    ];
    const b: ParameterizedVertex[] = [
      { index: 10, t: 0 }, { index: 11, t: 1 },
    ];
    const pairs = matchVertices(a, b);
    // B-driven: (0,10),(2,11); A-driven adds (1,10) — a1 (t=0.5) ties, lower wins.
    expect(pairs).toEqual([[0, 10], [1, 10], [2, 11]]);
  });

  it('handles single-vertex target (fan: every driver maps to the only target)', () => {
    const a: ParameterizedVertex[] = [
      { index: 0, t: 0 }, { index: 1, t: 0.3 }, { index: 2, t: 1 },
    ];
    const b: ParameterizedVertex[] = [{ index: 99, t: 0.5 }];
    const pairs = matchVertices(a, b);
    // B-driven: 99→a1 (t=0.3 closest to 0.5). A-driven: all three fan onto 99 —
    // like a real gathered seam, no A vertex is left unstitched.
    expect(pairs).toEqual([[0, 99], [1, 99], [2, 99]]);
  });

  it('picks the lower target index on exact distance ties', () => {
    // dv.t = 0.5 is equidistant to t=0 and t=1. Strict `<` in the walk, so j=0 wins
    // for the A-driven pass; the B-driven pass then pairs both b's back to a0.
    const driver: ParameterizedVertex[] = [{ index: 0, t: 0.5 }];
    const target: ParameterizedVertex[] = [
      { index: 10, t: 0 },
      { index: 11, t: 1 },
    ];
    const pairs = matchVertices(driver, target);
    expect(pairs).toEqual([[0, 10], [0, 11]]);
  });

  it('handles duplicate t values on target (lowest index on tie, full coverage)', () => {
    const driver: ParameterizedVertex[] = [{ index: 0, t: 0.5 }];
    const target: ParameterizedVertex[] = [
      { index: 10, t: 0.5 },
      { index: 11, t: 0.5 },
      { index: 12, t: 0.5 },
    ];
    const pairs = matchVertices(driver, target);
    expect(pairs).toEqual([[0, 10], [0, 11], [0, 12]]);
  });

  it('covers every vertex on BOTH edges (no skipped stitches) and stays t-sorted', () => {
    // The almendra-slit class of bug: one-directional matching leaves the long
    // side's surplus vertices with zero constraints. Property: after F2, every
    // index of edgeA and edgeB appears in ≥1 pair, and pairs are non-decreasing
    // in tA (buildCrossSeamBendQuads consumes consecutive-in-t pairs).
    const a: ParameterizedVertex[] = Array.from({ length: 7 }, (_, i) => ({
      index: i, t: i / 6,
    }));
    const b: ParameterizedVertex[] = Array.from({ length: 19 }, (_, i) => ({
      index: 100 + i, t: i / 18,
    }));
    const pairs = matchVertices(a, b);
    const seenA = new Set(pairs.map(p => p[0]));
    const seenB = new Set(pairs.map(p => p[1]));
    for (const v of a) expect(seenA.has(v.index)).toBe(true);
    for (const v of b) expect(seenB.has(v.index)).toBe(true);
    // No duplicate (a,b) pairs.
    expect(new Set(pairs.map(p => `${p[0]},${p[1]}`)).size).toBe(pairs.length);
    // Sorted by tA (index maps monotonically to t here).
    for (let i = 1; i < pairs.length; i++) {
      expect(pairs[i][0]).toBeGreaterThanOrEqual(pairs[i - 1][0]);
    }
  });

  it('does not mutate the input arrays', () => {
    const a: ParameterizedVertex[] = Object.freeze([
      Object.freeze({ index: 0, t: 0 }),
      Object.freeze({ index: 1, t: 0.5 }),
      Object.freeze({ index: 2, t: 1 }),
    ]) as unknown as ParameterizedVertex[];
    const b: ParameterizedVertex[] = Object.freeze([
      Object.freeze({ index: 10, t: 0 }),
      Object.freeze({ index: 11, t: 1 }),
    ]) as unknown as ParameterizedVertex[];
    // Under strict mode + frozen arrays, any mutation throws.
    expect(() => matchVertices(a, b)).not.toThrow();
    expect(a.length).toBe(3);
    expect(b.length).toBe(2);
  });

  it('matches legacy O(n²) implementation on 10 seeded random sorted inputs', () => {
    // Legacy implementation — kept here for parity verification only.
    function legacyMatchVertices(
      edgeA: ParameterizedVertex[],
      edgeB: ParameterizedVertex[],
    ): Array<[number, number]> {
      if (edgeA.length === 0 || edgeB.length === 0) return [];
      const pairs: Array<[number, number]> = [];
      const driverIsA = edgeA.length <= edgeB.length;
      const driver = driverIsA ? edgeA : edgeB;
      const target = driverIsA ? edgeB : edgeA;
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
        if (driverIsA) pairs.push([dv.index, target[bestIdx].index]);
        else pairs.push([target[bestIdx].index, dv.index]);
      }
      return pairs;
    }

    // Deterministic PRNG (mulberry32) so the test is fully reproducible.
    function makePrng(seed: number): () => number {
      let s = seed >>> 0;
      return () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }

    function makeSortedEdge(rng: () => number, n: number, offset: number): ParameterizedVertex[] {
      if (n === 0) return [];
      const ts: number[] = [];
      for (let i = 0; i < n; i++) ts.push(rng());
      ts.sort((x, y) => x - y);
      ts[0] = 0;
      ts[n - 1] = 1;
      return ts.map((t, i) => ({ index: offset + i, t }));
    }

    const rng = makePrng(0xC0FFEE);
    for (let run = 0; run < 10; run++) {
      const nA = 2 + Math.floor(rng() * 120);
      const nB = 2 + Math.floor(rng() * 120);
      const a = makeSortedEdge(rng, nA, 0);
      const b = makeSortedEdge(rng, nB, 1000);
      // Bidirectional output is a SUPERSET of the legacy one-directional
      // matching (same walk, same tie-breaks — plus the reverse pass).
      const pairs = matchVertices(a, b);
      const got = new Set(pairs.map(p => `${p[0]},${p[1]}`));
      for (const [pa, pb] of legacyMatchVertices(a, b)) {
        expect(got.has(`${pa},${pb}`)).toBe(true);
      }
      // And it covers every vertex on both edges (the legacy one does not).
      const seenA = new Set(pairs.map(p => p[0]));
      const seenB = new Set(pairs.map(p => p[1]));
      expect(seenA.size).toBe(nA);
      expect(seenB.size).toBe(nB);
    }
  });

  it('pairs 20000×20000 vertices in under 100 ms (legacy O(n²) needs ≈ 700 ms)', () => {
    const N = 20000;
    const a: ParameterizedVertex[] = new Array(N);
    const b: ParameterizedVertex[] = new Array(N);
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      a[i] = { index: i, t };
      b[i] = { index: i + N, t };
    }
    // Best of three: under the full parallel suite a single cold measurement
    // reached 119-160 ms on a machine where it takes ~23 ms alone, and the
    // deploy gate runs it without retries. The minimum measures the algorithm,
    // not the load; the legacy O(n²) still needs ≈ 700 ms on every run.
    let elapsed = Infinity;
    let pairs: ReturnType<typeof matchVertices> = [];
    for (let k = 0; k < 3; k++) {
      const t0 = performance.now();
      pairs = matchVertices(a, b);
      elapsed = Math.min(elapsed, performance.now() - t0);
    }
    expect(pairs.length).toBe(N);
    expect(pairs[0]).toEqual([0, N]);
    expect(pairs[N - 1]).toEqual([N - 1, 2 * N - 1]);
    expect(elapsed).toBeLessThan(100);
  });
});

// ─── Mesh Merging ───────────────────────────────────────────────────────────

describe('mergeMeshes', () => {
  it('merges two simple meshes', () => {
    const p1 = {
      pieceId: 'a',
      vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      triIds: new Int32Array([0, 1, 2]),
    };
    const p2 = {
      pieceId: 'b',
      vertices: new Float32Array([2, 0, 0, 3, 0, 0, 2, 1, 0]),
      triIds: new Int32Array([0, 1, 2]),
    };

    const merged = mergeMeshes([p1, p2]);

    expect(merged.vertices.length).toBe(18); // 6 verts * 3
    expect(merged.triIds.length).toBe(6); // 2 tris * 3

    // Second piece triangle indices should be offset by 3
    expect(merged.triIds[3]).toBe(3);
    expect(merged.triIds[4]).toBe(4);
    expect(merged.triIds[5]).toBe(5);

    expect(merged.pieces.length).toBe(2);
    expect(merged.pieces[0]).toEqual({
      pieceId: 'a', vertexOffset: 0, vertexCount: 3, triangleOffset: 0, triangleCount: 1,
    });
    expect(merged.pieces[1]).toEqual({
      pieceId: 'b', vertexOffset: 3, vertexCount: 3, triangleOffset: 1, triangleCount: 1,
    });
  });

  it('preserves vertex positions', () => {
    const p1 = {
      pieceId: 'x',
      vertices: new Float32Array([1.5, 2.5, 3.5]),
      triIds: new Int32Array([]),
    };
    const merged = mergeMeshes([p1]);
    expect(merged.vertices[0]).toBeCloseTo(1.5);
    expect(merged.vertices[1]).toBeCloseTo(2.5);
    expect(merged.vertices[2]).toBeCloseTo(3.5);
  });

  it('handles empty input', () => {
    const merged = mergeMeshes([]);
    expect(merged.vertices.length).toBe(0);
    expect(merged.triIds.length).toBe(0);
    expect(merged.pieces.length).toBe(0);
  });
});

// ─── Seam Constraint Building ───────────────────────────────────────────────

describe('buildSeamConstraints', () => {
  // Two square pieces side by side. Outlines close with an EXPLICIT L (the
  // producer never emits edges over the implicit Z close); the flattened
  // sequence is identical to the Z-closed version (5 points each).
  const outlineA: PathCommand[] = [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [10, 0] }, // 1: top
    { type: 'L', values: [10, 10] }, // 2: right
    { type: 'L', values: [0, 10] }, // 3: bottom
    { type: 'L', values: [0, 0] }, // 4: left
    { type: 'Z', values: [] },
  ];
  const outlineB: PathCommand[] = [
    { type: 'M', values: [20, 0] },
    { type: 'L', values: [30, 0] }, // 1: top
    { type: 'L', values: [30, 10] }, // 2: right
    { type: 'L', values: [20, 10] }, // 3: bottom
    { type: 'L', values: [20, 0] }, // 4: left
    { type: 'Z', values: [] },
  ];

  it('generates constraints for matching edges', () => {
    // Sew right edge of A (command 2) to left edge of B (command 4).
    // segmentRange is COMMAND-space — buildSeamConstraints converts at the
    // boundary via commandRangeToFlattened (Fase 3 / BP-3).
    const seam: Seam = {
      id: 's1',
      pieceA: { pieceId: 'a', edgeName: 'rightEdge' },
      pieceB: { pieceId: 'b', edgeName: 'leftEdge' },
      type: 'standard',
      tension: 100, strength: 1.0, active: true, taped: false, tapeWidth: 10,
    };

    const merged = mergeMeshes([
      { pieceId: 'a', vertices: new Float32Array([0,1,0, 10,1,0, 10,1,10, 0,1,10, 0,1,0]), triIds: new Int32Array([0,1,2]) },
      { pieceId: 'b', vertices: new Float32Array([20,1,0, 30,1,0, 30,1,10, 20,1,10, 20,1,0]), triIds: new Int32Array([0,1,2]) },
    ]);

    const outlines = new Map<string, PathCommand[]>();
    outlines.set('a', outlineA);
    outlines.set('b', outlineB);

    const pieces = new Map<string, { edges?: Array<{ name: string; segmentRange: [number, number] }> }>();
    pieces.set('a', { edges: [{ name: 'rightEdge', segmentRange: [2, 3] }] });
    pieces.set('b', { edges: [{ name: 'leftEdge', segmentRange: [4, 5] }] });

    const result = buildSeamConstraints([seam], outlines, merged, pieces);
    expect(result.count).toBe(2); // 2 vertices on shorter edge
    expect(result.ids.length).toBe(4);
    expect(result.restLengths.length).toBe(2);
    // Rest lengths should be > 0 (pieces are apart)
    for (let i = 0; i < result.count; i++) {
      expect(result.restLengths[i]).toBeGreaterThan(0);
    }
  });


  it('resolves piece offsets correctly even when merged piece metadata is unsorted', () => {
    const seam: Seam = {
      id: 's-unsorted',
      pieceA: { pieceId: 'a', edgeName: 'rightEdge' },
      pieceB: { pieceId: 'b', edgeName: 'leftEdge' },
      type: 'standard',
      tension: 100, strength: 1.0, active: true, taped: false, tapeWidth: 10,
    };

    const merged = {
      vertices: new Float32Array([
        20, 1, 0, 30, 1, 0, 30, 1, 10, 20, 1, 10, 20, 1, 0,
        0, 1, 0, 10, 1, 0, 10, 1, 10, 0, 1, 10, 0, 1, 0,
      ]),
      triIds: new Int32Array([0, 1, 2, 5, 6, 7]),
      pieces: [
        { pieceId: 'b', vertexOffset: 0, vertexCount: 5, triangleOffset: 0, triangleCount: 1 },
        { pieceId: 'a', vertexOffset: 5, vertexCount: 5, triangleOffset: 1, triangleCount: 1 },
      ],
    };

    const outlines = new Map<string, PathCommand[]>();
    outlines.set('a', outlineA);
    outlines.set('b', outlineB);

    const pieces = new Map<string, { edges?: Array<{ name: string; segmentRange: [number, number] }> }>();
    pieces.set('a', { edges: [{ name: 'rightEdge', segmentRange: [2, 3] }] });
    pieces.set('b', { edges: [{ name: 'leftEdge', segmentRange: [4, 5] }] });

    const result = buildSeamConstraints([seam], outlines, merged, pieces);
    expect(result.count).toBe(2);
    expect(result.restLengths[0]).toBeGreaterThan(0);
  });

  it('skips seams with missing outlines', () => {
    const seam: Seam = {
      id: 's1',
      pieceA: { pieceId: 'missing', edgeName: 'edge1' },
      pieceB: { pieceId: 'b', edgeName: 'edge2' },
      type: 'standard',
      tension: 100, strength: 1.0, active: true, taped: false, tapeWidth: 10,
    };
    const merged = mergeMeshes([]);
    const result = buildSeamConstraints([seam], new Map(), merged);
    expect(result.count).toBe(0);
  });
});

// ─── Solver ─────────────────────────────────────────────────────────────────

describe('solveSeamConstraints', () => {
  function makeSimpleConstraintSet(): { positions: Float32Array; invMass: Float32Array; seamSet: SeamConstraintSet } {
    // Two particles: 0 at origin, 1 at (1,0,0)
    const positions = new Float32Array([0, 0, 0, 1, 0, 0]);
    const invMass = new Float32Array([1, 1]);
    const seamSet: SeamConstraintSet = {
      ids: new Int32Array([0, 1]),
      restLengths: new Float32Array([1.0]),
      compliances: new Float32Array([0.0001]),
      count: 1,
      config: { ...DEFAULT_SEAM_CONFIG, shrinkFactor: 0.9 },
    };
    return { positions, invMass, seamSet };
  }

  it('shrinks rest lengths each step', () => {
    const { positions, invMass, seamSet } = makeSimpleConstraintSet();
    const initialRL = seamSet.restLengths[0];
    solveSeamConstraints(positions, invMass, seamSet, 1 / 60 / 15);
    expect(seamSet.restLengths[0]).toBeLessThan(initialRL);
    expect(seamSet.restLengths[0]).toBeCloseTo(initialRL * 0.9);
  });

  it('pulls particles closer over iterations', () => {
    const { positions, invMass, seamSet } = makeSimpleConstraintSet();
    const sdt = 1 / 60 / 15;
    for (let i = 0; i < 100; i++) {
      solveSeamConstraints(positions, invMass, seamSet, sdt);
    }
    // Particles should be much closer
    const dx = positions[0] - positions[3];
    const dy = positions[1] - positions[4];
    const dz = positions[2] - positions[5];
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    expect(dist).toBeLessThan(0.5);
  });

  it('reaches fully sewn state', () => {
    const { positions, invMass, seamSet } = makeSimpleConstraintSet();
    seamSet.config.shrinkFactor = 0.5; // aggressive
    const sdt = 1 / 60 / 15;
    for (let i = 0; i < 200; i++) {
      solveSeamConstraints(positions, invMass, seamSet, sdt);
    }
    expect(isFullySewn(seamSet)).toBe(true);
  });

  it('respects pinned particles (invMass=0)', () => {
    const { positions, invMass, seamSet } = makeSimpleConstraintSet();
    invMass[0] = 0; // pin first particle
    const origX = positions[0];
    const sdt = 1 / 60 / 15;
    for (let i = 0; i < 50; i++) {
      solveSeamConstraints(positions, invMass, seamSet, sdt);
    }
    expect(positions[0]).toBeCloseTo(origX);
    // Second particle should have moved toward first
    expect(positions[3]).toBeLessThan(1);
  });
});

// ─── isFullySewn ────────────────────────────────────────────────────────────

describe('isFullySewn', () => {
  it('returns true when all rest lengths are zero', () => {
    const seamSet: SeamConstraintSet = {
      ids: new Int32Array([0, 1]),
      restLengths: new Float32Array([0]),
      compliances: new Float32Array([0]),
      count: 1,
      config: DEFAULT_SEAM_CONFIG,
    };
    expect(isFullySewn(seamSet)).toBe(true);
  });

  it('returns false when any rest length is above threshold', () => {
    const seamSet: SeamConstraintSet = {
      ids: new Int32Array([0, 1, 2, 3]),
      restLengths: new Float32Array([0, 0.01]),
      compliances: new Float32Array([0, 0]),
      count: 2,
      config: DEFAULT_SEAM_CONFIG,
    };
    expect(isFullySewn(seamSet)).toBe(false);
  });
});

// ─── Rest-length floor (borrow-plan A3) ─────────────────────────────────────
//
// Seams used to shrink restLength to LITERAL 0 — at the armscye over the
// convex shoulder that drags the seam midpoint THROUGH the body (mechanism 2
// of the skin-poke diagnosis, 2026-06-26). The terminal target is now a
// scalar floor (fabric-thickness spacing, min 2mm), NOT a claim that this
// alone fixes the poke — the measurement gate is penetrationCount (A1).

describe('seam rest-length floor (A3)', () => {
  it('DEFAULT_SEAM_CONFIG pins restLengthFloor at the 2mm minimum', () => {
    expect(SEAM_REST_LENGTH_FLOOR_MIN_M).toBe(0.002);
    expect(DEFAULT_SEAM_CONFIG.restLengthFloor).toBe(0.002);
  });

  it('decay clamps at the floor instead of snapping to 0', () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0]);
    const invMass = new Float32Array([1, 1]);
    const seamSet: SeamConstraintSet = {
      ids: new Int32Array([0, 1]),
      restLengths: new Float32Array([1.0]),
      compliances: new Float32Array([0]),
      count: 1,
      config: { ...DEFAULT_SEAM_CONFIG, shrinkFactor: 0.5 },
    };
    const sdt = 1 / 60 / 15;
    for (let i = 0; i < 50; i++) {
      solveSeamConstraints(positions, invMass, seamSet, sdt);
    }
    // 1.0 × 0.5^n crosses 0.002 at n=9; the multiply must clamp AT the
    // floor exactly (snap-to-floor, f32-quantized by the Float32Array),
    // never below and never to 0.
    expect(seamSet.restLengths[0]).toBe(Math.fround(DEFAULT_SEAM_CONFIG.restLengthFloor));
  });

  it('honors a custom (thick-fabric) floor', () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0]);
    const invMass = new Float32Array([1, 1]);
    const seamSet: SeamConstraintSet = {
      ids: new Int32Array([0, 1]),
      restLengths: new Float32Array([1.0]),
      compliances: new Float32Array([0]),
      count: 1,
      config: { ...DEFAULT_SEAM_CONFIG, shrinkFactor: 0.5, restLengthFloor: 0.1 },
    };
    const sdt = 1 / 60 / 15;
    for (let i = 0; i < 50; i++) {
      solveSeamConstraints(positions, invMass, seamSet, sdt);
    }
    expect(seamSet.restLengths[0]).toBe(Math.fround(0.1));
    // The rigid solve tracks the floored target: pair distance ≈ 0.1, not 0.
    const dist = Math.abs(positions[3] - positions[0]);
    expect(dist).toBeCloseTo(0.1, 3);
  });

  it('isFullySewn treats restLength at (or below) the floor as sewn', () => {
    const atFloor: SeamConstraintSet = {
      ids: new Int32Array([0, 1]),
      restLengths: new Float32Array([DEFAULT_SEAM_CONFIG.restLengthFloor]),
      compliances: new Float32Array([0]),
      count: 1,
      config: DEFAULT_SEAM_CONFIG,
    };
    expect(isFullySewn(atFloor)).toBe(true);

    const aboveFloor: SeamConstraintSet = {
      ...atFloor,
      restLengths: new Float32Array([DEFAULT_SEAM_CONFIG.restLengthFloor + 0.001]),
    };
    expect(isFullySewn(aboveFloor)).toBe(false);
  });
});

describe('computeSeamRestLengthFloor (A3)', () => {
  const seam = (a: string, b: string, active = true) =>
    ({ pieceAId: a, pieceBId: b, active }) as Pick<SeamInitData, 'pieceAId' | 'pieceBId' | 'active'>;

  it('returns the 2mm minimum when fabrics are thin (today: 0.1-1.2mm)', () => {
    const thickness = new Map([['a', 0.3], ['b', 0.9]]);
    // (0.3 + 0.9) / 2 = 0.6mm → 0.0006m < 0.002m minimum
    expect(computeSeamRestLengthFloor([seam('a', 'b')], thickness)).toBe(0.002);
  });

  it('scales with fabric thickness above the minimum (the thick-fabric knob)', () => {
    const thickness = new Map([['a', 5], ['b', 3]]);
    // (5 + 3) / 2 = 4mm → 0.004m > 0.002m
    expect(computeSeamRestLengthFloor([seam('a', 'b')], thickness)).toBeCloseTo(0.004, 9);
  });

  it('is scalar v1: the MAX over all active seams wins', () => {
    const thickness = new Map([['a', 5], ['b', 3], ['c', 0.2]]);
    expect(
      computeSeamRestLengthFloor([seam('a', 'c'), seam('a', 'b')], thickness),
    ).toBeCloseTo(0.004, 9);
  });

  it('ignores inactive seams and unknown pieces (falls back to the minimum)', () => {
    const thickness = new Map([['a', 50], ['b', 50]]);
    expect(computeSeamRestLengthFloor([seam('a', 'b', false)], thickness)).toBe(0.002);
    expect(computeSeamRestLengthFloor([seam('x', 'y')], thickness)).toBe(0.002);
    expect(computeSeamRestLengthFloor([], thickness)).toBe(0.002);
  });
});

// ─── Direction / reversal (parity plan Fase 5) ──────────────────────────────

describe('parameterizeEdge — reverse (Fase 5)', () => {
  // Rectángulo 10×20: el tramo 0→2 (bottom 10 + right 20) tiene arc-length
  // ASIMÉTRICO, así el espejo t→1−t es observable (en tramos uniformes el
  // conjunto de t espejado coincide con el original y el test no probaría nada).
  const rectOutline: PathCommand[] = [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [10, 0] },
    { type: 'L', values: [10, 20] },
    { type: 'L', values: [0, 20] },
    { type: 'Z', values: [] },
  ];

  it('flips vertex order and mirrors t, preserving the ascending-t invariant', () => {
    const fwd = parameterizeEdge(rectOutline, 0, 2, 0, 12, 1000);
    const rev = parameterizeEdge(rectOutline, 0, 2, 0, 12, 1000, true);

    // fwd: indices [0,1,2], t [0, 1/3, 1] (10 de 30, luego 20 de 30)
    expect(fwd.map(v => v.index)).toEqual([0, 1, 2]);
    expect(fwd[1].t).toBeCloseTo(1 / 3);

    // rev: mismos vértices en orden inverso, t espejada → [0, 2/3, 1]
    expect(rev.map(v => v.index)).toEqual([2, 1, 0]);
    expect(rev[0].t).toBeCloseTo(0);
    expect(rev[1].t).toBeCloseTo(2 / 3);
    expect(rev[2].t).toBeCloseTo(1);

    // Invariante que matchVertices exige: t ascendente.
    for (let i = 1; i < rev.length; i++) {
      expect(rev[i].t).toBeGreaterThanOrEqual(rev[i - 1].t);
    }
  });

  it('reverse=false (default) is byte-identical to the previous behavior', () => {
    expect(parameterizeEdge(rectOutline, 0, 2, 0, 12, 1000)).toEqual(
      parameterizeEdge(rectOutline, 0, 2, 0, 12, 1000, false),
    );
  });
});

describe('buildSeamConstraints — pieceB.reversed (Fase 5)', () => {
  const outlineA: PathCommand[] = [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [10, 0] },
    { type: 'L', values: [10, 10] }, // 2: right
    { type: 'L', values: [0, 10] },
    { type: 'L', values: [0, 0] },
    { type: 'Z', values: [] },
  ];
  const outlineB: PathCommand[] = [
    { type: 'M', values: [20, 0] },
    { type: 'L', values: [30, 0] },
    { type: 'L', values: [30, 10] },
    { type: 'L', values: [20, 10] },
    { type: 'L', values: [20, 0] }, // 4: left
    { type: 'Z', values: [] },
  ];

  function makeFixture(reversed: boolean) {
    const seam: Seam = {
      id: 's-dir',
      pieceA: { pieceId: 'a', edgeName: 'rightEdge' },
      pieceB: { pieceId: 'b', edgeName: 'leftEdge', reversed },
      type: 'standard',
      tension: 100, strength: 1.0, active: true, taped: false, tapeWidth: 10,
    };
    const merged = mergeMeshes([
      { pieceId: 'a', vertices: new Float32Array([0,1,0, 10,1,0, 10,1,10, 0,1,10, 0,1,0]), triIds: new Int32Array([0,1,2]) },
      { pieceId: 'b', vertices: new Float32Array([20,1,0, 30,1,0, 30,1,10, 20,1,10, 20,1,0]), triIds: new Int32Array([0,1,2]) },
    ]);
    const outlines = new Map<string, PathCommand[]>([['a', outlineA], ['b', outlineB]]);
    const pieces = new Map<string, { edges?: Array<{ name: string; segmentRange: [number, number] }> }>([
      ['a', { edges: [{ name: 'rightEdge', segmentRange: [2, 3] }] }],
      ['b', { edges: [{ name: 'leftEdge', segmentRange: [4, 5] }] }],
    ]);
    return buildSeamConstraints([seam], outlines, merged, pieces);
  }

  it('reversed=true pairs A:t=0 with B:t=1 — the ids flip on the B side only', () => {
    const fwd = makeFixture(false);
    const rev = makeFixture(true);

    // Mismo número de constraints — la dirección no cambia el count.
    expect(rev.count).toBe(fwd.count);
    expect(fwd.count).toBe(2);

    // rightEdge = comando 2 → rango aplanado [1,2] (anchor en el endpoint
    // del comando 1); leftEdge = comando 4 → [3,4] → globales 8,9.
    // Forward: [a1↔b8, a2↔b9]. Reversed: la mitad B se recorre al revés →
    // [a1↔b9, a2↔b8].
    expect(Array.from(fwd.ids)).toEqual([1, 8, 2, 9]);
    expect(Array.from(rev.ids)).toEqual([1, 9, 2, 8]);
  });
});

describe('seamInitDataToSeams (Fase 5 — shared worker mapping)', () => {
  const init: SeamInitData = {
    id: 's1',
    pieceAId: 'a', pieceAEdgeName: 'top',
    pieceBId: 'b', pieceBEdgeName: 'bottom',
    type: 'french',
    pieceARange: [0.1, 0.9],
    pieceBReversed: true,
    tension: 80, strength: 0.5, active: true, taped: true,
  };

  it('maps the flat worker shape to the nested domain shape, reversed included', () => {
    const [seam] = seamInitDataToSeams([init]);
    expect(seam).toEqual({
      id: 's1',
      pieceA: { pieceId: 'a', edgeName: 'top', tStart: 0.1, tEnd: 0.9 },
      pieceB: { pieceId: 'b', edgeName: 'bottom', tStart: undefined, tEnd: undefined, reversed: true },
      type: 'french',
      tension: 80, strength: 0.5, active: true, taped: true, tapeWidth: 10,
    });
  });

  it('filters inactive seams and defaults missing numerics', () => {
    const seams = seamInitDataToSeams([
      { ...init, id: 'off', active: false },
      { ...init, id: 'bare', tension: undefined as never, strength: undefined as never, taped: undefined as never, pieceBReversed: undefined },
    ]);
    expect(seams).toHaveLength(1);
    expect(seams[0]).toMatchObject({ id: 'bare', tension: 100, strength: 1.0, taped: false });
    expect(seams[0].pieceB.reversed).toBe(false);
  });

  it('REGRESSION (wasm worker): raw SeamInitData into buildSeamConstraints throws — the conversion is mandatory', () => {
    // Pre-Fase-5, wasmSolverWorker pasaba msg.seams (SeamInitData[]) sin
    // convertir: buildSeamConstraints lee seam.pieceA.pieceId sobre
    // undefined → TypeError → init reventaba → caída silenciosa a CPU.
    const merged = mergeMeshes([
      { pieceId: 'a', vertices: new Float32Array([0, 0, 0]), triIds: new Int32Array([]) },
    ]);
    expect(() =>
      buildSeamConstraints([init as never], new Map([['a', [] as PathCommand[]]]), merged),
    ).toThrow(TypeError);
    // Y con la conversión, el mismo input es seguro.
    expect(() =>
      buildSeamConstraints(seamInitDataToSeams([init]), new Map([['a', [] as PathCommand[]]]), merged),
    ).not.toThrow();
  });
});
