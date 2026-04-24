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
  type ParameterizedVertex,
  type SeamConstraintSet,
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

  it('handles unequal vertex counts (fewer on A)', () => {
    const a: ParameterizedVertex[] = [
      { index: 0, t: 0 }, { index: 1, t: 1 },
    ];
    const b: ParameterizedVertex[] = [
      { index: 10, t: 0 }, { index: 11, t: 0.5 }, { index: 12, t: 1 },
    ];
    const pairs = matchVertices(a, b);
    // A is shorter → drives. vertex 0 (t=0) → 10 (t=0), vertex 1 (t=1) → 12 (t=1)
    expect(pairs).toEqual([[0, 10], [1, 12]]);
  });

  it('handles unequal vertex counts (fewer on B)', () => {
    const a: ParameterizedVertex[] = [
      { index: 0, t: 0 }, { index: 1, t: 0.5 }, { index: 2, t: 1 },
    ];
    const b: ParameterizedVertex[] = [
      { index: 10, t: 0 }, { index: 11, t: 1 },
    ];
    const pairs = matchVertices(a, b);
    // B is shorter → drives. 10(t=0)→0(t=0), 11(t=1)→2(t=1)
    expect(pairs).toEqual([[0, 10], [2, 11]]);
  });

  it('handles single-vertex target (every driver maps to the only target)', () => {
    const a: ParameterizedVertex[] = [
      { index: 0, t: 0 }, { index: 1, t: 0.3 }, { index: 2, t: 1 },
    ];
    const b: ParameterizedVertex[] = [{ index: 99, t: 0.5 }];
    // B is shorter (length 1) → drives. Only one b vertex to emit.
    const pairs = matchVertices(a, b);
    // Closest to 0.5 is a[1] (t=0.3, dist=0.2) — tied? 0.3 vs 1 → |0.5-0.3|=0.2, |0.5-1|=0.5, |0.5-0|=0.5.
    expect(pairs).toEqual([[1, 99]]);
  });

  it('picks the lower target index on exact distance ties', () => {
    // dv.t = 0.5 is equidistant to t=0 and t=1. Legacy uses strict `<`, so j=0 wins.
    const driver: ParameterizedVertex[] = [{ index: 0, t: 0.5 }];
    const target: ParameterizedVertex[] = [
      { index: 10, t: 0 },
      { index: 11, t: 1 },
    ];
    const pairs = matchVertices(driver, target);
    expect(pairs).toEqual([[0, 10]]);
  });

  it('handles duplicate t values on target (picks lowest index on tie)', () => {
    const driver: ParameterizedVertex[] = [{ index: 0, t: 0.5 }];
    const target: ParameterizedVertex[] = [
      { index: 10, t: 0.5 },
      { index: 11, t: 0.5 },
      { index: 12, t: 0.5 },
    ];
    const pairs = matchVertices(driver, target);
    expect(pairs).toEqual([[0, 10]]);
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
      expect(matchVertices(a, b)).toEqual(legacyMatchVertices(a, b));
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
    const t0 = performance.now();
    const pairs = matchVertices(a, b);
    const elapsed = performance.now() - t0;
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
  // Two square pieces side by side
  const outlineA: PathCommand[] = [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [10, 0] },
    { type: 'L', values: [10, 10] },
    { type: 'L', values: [0, 10] },
    { type: 'Z', values: [] },
  ];
  const outlineB: PathCommand[] = [
    { type: 'M', values: [20, 0] },
    { type: 'L', values: [30, 0] },
    { type: 'L', values: [30, 10] },
    { type: 'L', values: [20, 10] },
    { type: 'Z', values: [] },
  ];

  it('generates constraints for matching edges', () => {
    // Sew right edge of A (vertices 1→2) to left edge of B (vertices 0→3)
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
    pieces.set('a', { edges: [{ name: 'rightEdge', segmentRange: [1, 2] }] });
    pieces.set('b', { edges: [{ name: 'leftEdge', segmentRange: [0, 3] }] });

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
    pieces.set('a', { edges: [{ name: 'rightEdge', segmentRange: [1, 2] }] });
    pieces.set('b', { edges: [{ name: 'leftEdge', segmentRange: [0, 3] }] });

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
