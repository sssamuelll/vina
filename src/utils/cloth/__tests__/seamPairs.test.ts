import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { seamInitDataToPairs, type PieceWithOutline } from '../seamPairs';
import type { SeamInitData } from '../clothWorker';
import type { PathCommand } from '../../../types/types';

const squareOutline: Array<{ type: string; values: number[] }> = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [100, 0] },
  { type: 'L', values: [100, 100] },
  { type: 'L', values: [0, 100] },
  { type: 'Z', values: [] },
] satisfies PathCommand[];

function makeSquarePiece(pieceId: string): PieceWithOutline {
  return {
    pieceId,
    outline: squareOutline,
    edges: [
      { name: 'top', segmentRange: [0, 1] },
      { name: 'right', segmentRange: [1, 2] },
      { name: 'bottom', segmentRange: [2, 3] },
      { name: 'left', segmentRange: [3, 0] },
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
    const SINGLE_PIECE_VERTEX_BOUND = 28;
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
      { pieceId: 'A', outline: tinyOutline, edges: [{ name: 'top', segmentRange: [0, 1] }] },
      { pieceId: 'B', outline: tinyOutline, edges: [{ name: 'bottom', segmentRange: [2, 3] }] },
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
});
