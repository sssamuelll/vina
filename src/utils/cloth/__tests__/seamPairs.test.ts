import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { seamInitDataToPairs, summarizeSeamResolution, type PieceWithOutline } from '../seamPairs';
import { SEAM_MAX_EDGE_LENGTH } from '../seamAssembly';
import type { SeamInitData } from '../clothWorker';
import type { PathCommand } from '../../../types/types';

// Cierre con L explícito: el lado izquierdo es un comando real (el producer
// detectSemanticEdges nunca emite edges sobre el cierre implícito del Z).
// La secuencia aplanada es idéntica a la versión Z-cerrada (5 puntos).
const squareOutline: Array<{ type: string; values: number[] }> = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [100, 0] }, // 1: top
  { type: 'L', values: [100, 100] }, // 2: right
  { type: 'L', values: [0, 100] }, // 3: bottom
  { type: 'L', values: [0, 0] }, // 4: left
  { type: 'Z', values: [] },
] satisfies PathCommand[];

function makeSquarePiece(pieceId: string): PieceWithOutline {
  return {
    pieceId,
    outline: squareOutline,
    // segmentRange en espacio de COMANDOS ([start, end) sobre PathCommand[]),
    // el contrato del producer — la conversión a espacio aplanado ocurre en
    // la frontera del consumidor (commandRangeToFlattened, Fase 3 / BP-3).
    edges: [
      { name: 'top', segmentRange: [1, 2] },
      { name: 'right', segmentRange: [2, 3] },
      { name: 'bottom', segmentRange: [3, 4] },
      { name: 'left', segmentRange: [4, 5] },
    ],
  };
}

function makeSeam(overrides: Partial<SeamInitData> = {}): SeamInitData {
  return {
    id: 'seam-1',
    pieceAId: 'A',
    pieceAEdgeName: 'top',
    pieceBId: 'B',
    pieceBEdgeName: 'bottom',
    type: 'standard',
    tension: 100,
    strength: 1,
    active: true,
    taped: false,
    ...overrides,
  };
}

let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  warnSpy.mockRestore();
});

describe('seamInitDataToPairs', () => {
  it('returns empty array for empty seam input', () => {
    expect(seamInitDataToPairs([], [makeSquarePiece('A'), makeSquarePiece('B')])).toEqual([]);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('returns empty array for empty piece input', () => {
    expect(seamInitDataToPairs([makeSeam()], [])).toEqual([]);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('builds vertex pairs for a single seam between two pieces (semantic edge names)', () => {
    const seams = [makeSeam()];
    const pieces = [makeSquarePiece('A'), makeSquarePiece('B')];

    const result = seamInitDataToPairs(seams, pieces);

    expect(result).toHaveLength(1);
    expect(result[0].pieceAId).toBe('A');
    expect(result[0].pieceBId).toBe('B');
    expect(result[0].vertexPairs.length).toBeGreaterThan(0);
  });

  it('emits LOCAL piece-relative vertex indices, not global merged-mesh indices', () => {
    // Two probes against the local-index contract:
    //
    // (1) Same edge on both pieces (top↔top): identical outlines → identical
    //     parameterizeEdge output → matchVertices pairs index-by-index. Every
    //     pair must be [i, i]. If the helper had accidentally added a global
    //     vertex offset to either side, `a === b` would fail.
    //
    // (2) Different edges (top↔bottom): pair indices land in different
    //     per-edge ranges, but BOTH must stay below a single piece's full
    //     flattened-outline vertex count. For a 100×100 square with
    //     maxEdgeLength=15, each side flattens to 7 verts × 4 edges = 28.
    //     A regression that returned global indices for piece B (offset by
    //     piece A's vertex count) would push maxB to ~50 and trip the bound.
    //
    // 100×100 square: 4 edges of length 100. Each edge subdivides into
    // ceil(100 / SEAM_MAX_EDGE_LENGTH) segments → that many vertices per
    // edge (the +1 endpoint of one edge IS the start vertex of the next,
    // so total = numSegments × 4, not (numSegments + 1) × 4).
    const VERTS_PER_EDGE = Math.ceil(100 / SEAM_MAX_EDGE_LENGTH);
    const SINGLE_PIECE_VERTEX_BOUND = VERTS_PER_EDGE * 4;
    const pieces = [makeSquarePiece('A'), makeSquarePiece('B')];

    const sameEdge = seamInitDataToPairs(
      [makeSeam({ pieceBEdgeName: 'top' })],
      pieces,
    )[0];
    expect(sameEdge.vertexPairs.length).toBeGreaterThan(0);
    for (const [a, b] of sameEdge.vertexPairs) {
      expect(a).toBe(b);
    }

    const crossEdge = seamInitDataToPairs([makeSeam()], pieces)[0];
    const maxA = Math.max(...crossEdge.vertexPairs.map(([a]) => a));
    const maxB = Math.max(...crossEdge.vertexPairs.map(([, b]) => b));
    expect(maxA).toBeLessThan(SINGLE_PIECE_VERTEX_BOUND);
    expect(maxB).toBeLessThan(SINGLE_PIECE_VERTEX_BOUND);
  });

  it('produces same pair count via "edge-N" fallback as via semantic edge names', () => {
    const semanticPieces = [makeSquarePiece('A'), makeSquarePiece('B')];
    const fallbackPieces: PieceWithOutline[] = [
      { pieceId: 'A', outline: squareOutline },
      { pieceId: 'B', outline: squareOutline },
    ];

    const seamSemantic = makeSeam();
    const seamFallback = makeSeam({ pieceAEdgeName: 'edge-0', pieceBEdgeName: 'edge-2' });

    const semantic = seamInitDataToPairs([seamSemantic], semanticPieces);
    const fallback = seamInitDataToPairs([seamFallback], fallbackPieces);

    expect(fallback[0].vertexPairs.length).toBe(semantic[0].vertexPairs.length);
  });

  it('applies tStart/tEnd filtering on both sides', () => {
    const fullSeam = makeSeam();
    const halfSeam = makeSeam({ pieceARange: [0, 0.5], pieceBRange: [0, 0.5] });
    const pieces = [makeSquarePiece('A'), makeSquarePiece('B')];

    const full = seamInitDataToPairs([fullSeam], pieces)[0];
    const half = seamInitDataToPairs([halfSeam], pieces)[0];

    expect(half.vertexPairs.length).toBeGreaterThan(0);
    expect(half.vertexPairs.length).toBeLessThan(full.vertexPairs.length);
  });

  it('skips seams whose match resolves to zero pairs and warns loudly', () => {
    // 10x10 outline is shorter than MAX_EDGE_LENGTH (15), so each edge has
    // only its two endpoint vertices (t=0, t=1) — no subdivisions. A
    // tStart/tEnd range that excludes both endpoints leaves the side empty,
    // matchVertices returns [], and the empty-match branch fires.
    const tinyOutline: Array<{ type: string; values: number[] }> = [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [10, 0] },
      { type: 'L', values: [10, 10] },
      { type: 'L', values: [0, 10] },
      { type: 'Z', values: [] },
    ];
    const tinyPieces: PieceWithOutline[] = [
      { pieceId: 'A', outline: tinyOutline, edges: [{ name: 'top', segmentRange: [1, 2] }] },
      { pieceId: 'B', outline: tinyOutline, edges: [{ name: 'bottom', segmentRange: [3, 4] }] },
    ];

    const result = seamInitDataToPairs(
      [makeSeam({ pieceARange: [0.4, 0.6], pieceBRange: [0.4, 0.6] })],
      tinyPieces,
    );

    expect(result).toEqual([]);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain('empty match');
  });

  it('skips inactive seams without warning', () => {
    const result = seamInitDataToPairs(
      [makeSeam({ active: false })],
      [makeSquarePiece('A'), makeSquarePiece('B')],
    );
    expect(result).toEqual([]);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('skips seams referencing missing pieces and warns loudly', () => {
    const result = seamInitDataToPairs(
      [makeSeam({ pieceBId: 'C' })],
      [makeSquarePiece('A'), makeSquarePiece('B')],
    );
    expect(result).toEqual([]);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain('[seamPairs]');
    expect(warnSpy.mock.calls[0][0]).toContain('missing piece');
  });

  it('skips seams with unresolvable edge names and warns loudly', () => {
    const fallbackPieces: PieceWithOutline[] = [
      { pieceId: 'A', outline: squareOutline },
      { pieceId: 'B', outline: squareOutline },
    ];
    const result = seamInitDataToPairs(
      [makeSeam({ pieceAEdgeName: 'nonsense', pieceBEdgeName: 'edge-2' })],
      fallbackPieces,
    );
    expect(result).toEqual([]);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain('unknown edge');
  });

  it('skips out-of-range "edge-N" patterns and warns loudly', () => {
    const fallbackPieces: PieceWithOutline[] = [
      { pieceId: 'A', outline: squareOutline },
      { pieceId: 'B', outline: squareOutline },
    ];
    const result = seamInitDataToPairs(
      [makeSeam({ pieceAEdgeName: 'edge-99', pieceBEdgeName: 'edge-2' })],
      fallbackPieces,
    );
    expect(result).toEqual([]);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('unknown edge'));
  });

  it('builds independent entries for multiple seams between the same piece pair', () => {
    const pieces = [makeSquarePiece('A'), makeSquarePiece('B')];
    const seams = [
      makeSeam({ id: 's1', pieceAEdgeName: 'top', pieceBEdgeName: 'bottom' }),
      makeSeam({ id: 's2', pieceAEdgeName: 'left', pieceBEdgeName: 'right' }),
    ];

    const result = seamInitDataToPairs(seams, pieces);

    expect(result).toHaveLength(2);
    expect(result[0].vertexPairs).not.toEqual(result[1].vertexPairs);
  });

  // A true geometric T-junction (3 pieces sharing a world-space vertex)
  // is tracked separately in #741.
  it('produces independent entries for multiple seams between disjoint piece pairs', () => {
    const pieces = [makeSquarePiece('A'), makeSquarePiece('B'), makeSquarePiece('C')];
    const seams = [
      makeSeam({ id: 's1', pieceAId: 'A', pieceBId: 'B' }),
      makeSeam({ id: 's2', pieceAId: 'B', pieceBId: 'C' }),
      makeSeam({ id: 's3', pieceAId: 'A', pieceBId: 'C' }),
    ];

    const result = seamInitDataToPairs(seams, pieces);

    expect(result).toHaveLength(3);
    expect(result.map(r => `${r.pieceAId}-${r.pieceBId}`)).toEqual([
      'A-B',
      'B-C',
      'A-C',
    ]);
  });

  // ─── Defensive guards (#736) ──────────────────────────────────────────

  it('resolves self-seam (pieceAId === pieceBId) to real vertex pairs — sleeve tube closure', () => {
    // Same-piece seams (e.g. underarmSeam↔underarmSeam-2) are now valid on the
    // GPU tier. The piece has both 'top' and 'bottom' edges; they pair like a
    // cross-piece seam, just with both halves coming from the same piece object.
    const result = seamInitDataToPairs(
      [makeSeam({ pieceBId: 'A', pieceBEdgeName: 'bottom' })],
      [makeSquarePiece('A'), makeSquarePiece('B')],
    );
    expect(result).toHaveLength(1);
    expect(result[0].pieceAId).toBe('A');
    expect(result[0].pieceBId).toBe('A');
    expect(result[0].vertexPairs.length).toBeGreaterThan(0);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('warns on duplicate pieceId in input array (last entry wins)', () => {
    const result = seamInitDataToPairs(
      [makeSeam()],
      [makeSquarePiece('A'), makeSquarePiece('A'), makeSquarePiece('B')],
    );
    // Duplicate warn fires once; seam still resolves because last A wins.
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('duplicate pieceId'));
    expect(result).toHaveLength(1);
  });

  it('skips seams with non-finite outline values and warns', () => {
    const badOutline: Array<{ type: string; values: number[] }> = [
      { type: 'M', values: [NaN, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 100] },
      { type: 'L', values: [0, 100] },
      { type: 'Z', values: [] },
    ];
    const pieces: PieceWithOutline[] = [
      {
        pieceId: 'A',
        outline: badOutline,
        edges: [{ name: 'top', segmentRange: [1, 2] }],
      },
      makeSquarePiece('B'),
    ];
    const result = seamInitDataToPairs([makeSeam()], pieces);
    expect(result).toEqual([]);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain('non-finite outline');
  });

  // ─── Per-seam physics (#897 F1 — GPU compliance/tension parity) ────────

  it('computes per-seam compliance and tension factor mirroring buildSeamConstraints', () => {
    const seams = [makeSeam({ type: 'french', strength: 0.5, taped: true, tension: 80 })];
    const pieces = [makeSquarePiece('A'), makeSquarePiece('B')];

    const pairs = seamInitDataToPairs(seams, pieces);

    // french base 0.00001 / strength 0.5 × taped 0.1 = 0.000002
    expect(pairs[0].compliance).toBeCloseTo(0.000002, 9);
    // tension 80 / 100 = 0.8
    expect(pairs[0].tensionFactor).toBeCloseTo(0.8, 6);
  });

  it('defaults: standard type, strength 1, no tape, tension 100', () => {
    // makeSeam() defaults: type 'standard', strength 1, taped false, tension 100.
    const pairs = seamInitDataToPairs(
      [makeSeam()],
      [makeSquarePiece('A'), makeSquarePiece('B')],
    );

    expect(pairs[0].compliance).toBeCloseTo(0.0001, 9); // standard base, unmodified
    expect(pairs[0].tensionFactor).toBe(1);
  });

  // ─── Branded type (#738) ──────────────────────────────────────────────

  it('returns vertexPairs typed as LocalVertexIndex tuples', () => {
    const pairs = seamInitDataToPairs(
      [makeSeam()],
      [makeSquarePiece('A'), makeSquarePiece('B')],
    );
    // Compile-time check — accessing pair[0] should produce a LocalVertexIndex.
    // Value-level: branded types are still numbers at runtime, so the only
    // structural assertion we can make here is that the tuple holds numbers.
    expect(typeof pairs[0].vertexPairs[0][0]).toBe('number');
    expect(typeof pairs[0].vertexPairs[0][1]).toBe('number');
  });
});

// ─── summarizeSeamResolution (parity plan Fase 4 — observability) ────────────

describe('summarizeSeamResolution', () => {
  it('returns one entry per ACTIVE seam with its constraint count', () => {
    const pieces = [makeSquarePiece('A'), makeSquarePiece('B')];
    const entries = summarizeSeamResolution(
      [makeSeam(), makeSeam({ id: 'seam-2', active: false })],
      pieces,
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].seamId).toBe('seam-1');
    expect(entries[0].constraintCount).toBeGreaterThan(0);
    expect(entries[0].failure).toBeNull();
  });

  it('matches the pair count seamInitDataToPairs produces (shared resolution core)', () => {
    const pieces = [makeSquarePiece('A'), makeSquarePiece('B')];
    const seams = [makeSeam()];
    const pairs = seamInitDataToPairs(seams, pieces);
    const entries = summarizeSeamResolution(seams, pieces);
    expect(entries[0].constraintCount).toBe(pairs[0].vertexPairs.length);
  });

  it('reports unknown-edge failure with zero constraints', () => {
    const pieces = [makeSquarePiece('A'), makeSquarePiece('B')];
    const entries = summarizeSeamResolution(
      [makeSeam({ pieceAEdgeName: 'noSuchEdge' })],
      pieces,
    );
    expect(entries).toEqual([
      { seamId: 'seam-1', constraintCount: 0, failure: 'unknown-edge' },
    ]);
  });

  it('reports missing-piece failure; self-seam now resolves successfully', () => {
    // Since same-piece seams are valid (sleeve tube closure), the 's-self' case
    // resolves to real constraints rather than failing with 'self-seam'.
    const pieces = [makeSquarePiece('A'), makeSquarePiece('B')];
    const entries = summarizeSeamResolution(
      [
        makeSeam({ id: 's-missing', pieceBId: 'ghost' }),
        makeSeam({ id: 's-self', pieceBId: 'A', pieceBEdgeName: 'bottom' }),
      ],
      pieces,
    );
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({ seamId: 's-missing', constraintCount: 0, failure: 'missing-piece' });
    expect(entries[1].seamId).toBe('s-self');
    expect(entries[1].constraintCount).toBeGreaterThan(0);
    expect(entries[1].failure).toBeNull();
  });

  it('is silent on console — failures surface via toast/inspector, not warns', () => {
    const pieces = [makeSquarePiece('A'), makeSquarePiece('B')];
    summarizeSeamResolution([makeSeam({ pieceAEdgeName: 'noSuchEdge' })], pieces);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('returns [] when every seam is inactive or the list is empty', () => {
    const pieces = [makeSquarePiece('A')];
    expect(summarizeSeamResolution([], pieces)).toEqual([]);
    expect(summarizeSeamResolution([makeSeam({ active: false })], pieces)).toEqual([]);
  });
});

// ─── pieceBReversed (parity plan Fase 5 — direction) ─────────────────────────

describe('seamInitDataToPairs — pieceBReversed', () => {
  it('reverses the B side of every pair; the A side is untouched', () => {
    const pieces = [makeSquarePiece('A'), makeSquarePiece('B')];
    // top↔top en outlines idénticos: forward empareja índice a índice.
    const fwd = seamInitDataToPairs([makeSeam({ pieceBEdgeName: 'top' })], pieces)[0];
    const rev = seamInitDataToPairs(
      [makeSeam({ pieceBEdgeName: 'top', pieceBReversed: true })],
      pieces,
    )[0];

    expect(rev.vertexPairs.length).toBe(fwd.vertexPairs.length);
    expect(rev.vertexPairs.map(([a]) => a)).toEqual(fwd.vertexPairs.map(([a]) => a));
    // La mitad B se recorre end→start: la secuencia de índices B es la
    // del forward invertida.
    expect(rev.vertexPairs.map(([, b]) => b)).toEqual(
      fwd.vertexPairs.map(([, b]) => b).reverse(),
    );
  });

  it('summarizeSeamResolution: reversal never changes the constraint count', () => {
    const pieces = [makeSquarePiece('A'), makeSquarePiece('B')];
    const fwd = summarizeSeamResolution([makeSeam()], pieces);
    const rev = summarizeSeamResolution([makeSeam({ pieceBReversed: true })], pieces);
    expect(rev[0].constraintCount).toBe(fwd[0].constraintCount);
    expect(rev[0].failure).toBeNull();
  });
});
