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
    // Both pieces have identical outline; the GPU client adds vertex offsets
    // internally per-piece. If this helper accidentally returned global
    // merged-mesh indices, pieceB's indices would all be ≥ pieceA's vertex
    // count instead of starting at the same range.
    const seams = [makeSeam()];
    const pieces = [makeSquarePiece('A'), makeSquarePiece('B')];

    const { vertexPairs } = seamInitDataToPairs(seams, pieces)[0];

    for (const [a, b] of vertexPairs) {
      expect(a).toBeGreaterThanOrEqual(0);
      expect(b).toBeGreaterThanOrEqual(0);
    }

    const maxA = Math.max(...vertexPairs.map(([a]) => a));
    const maxB = Math.max(...vertexPairs.map(([, b]) => b));
    // For identical 100x100 squares with maxEdgeLength=15, each side flattens
    // to a small bounded number of vertices; both must stay piece-local.
    expect(maxA).toBeLessThan(100);
    expect(maxB).toBeLessThan(100);
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

  it('produces independent entries for a 3-piece T-junction', () => {
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
