// src/copilot/reasoning/bridge/meta-tools/__tests__/metaTools.test.ts
import { describe, it, expect } from 'vitest';
import { getGarmentStateTool } from '../getGarmentState';
import { getPieceDetailsTool } from '../getPieceDetails';
import { measureEdgeTool } from '../measureEdge';
import { searchPiecesTool } from '../searchPieces';
import { measureAlongCurveTool } from '../measureAlongCurve';
import { compareCurvesMetaTool } from '../compareCurves';
import { getAllMetaTools } from '../index';

// Minimal mock state
function mockState(pieces: unknown[] = [], seams: unknown[] = []) {
  return () => ({
    project: {
      pieces,
      seams,
      avatar: { measurements: { chest: 90, waist: 70, hips: 95 } },
    },
  }) as never;
}

const mockPiece = {
  id: 'front-bodice',
  name: 'Front Bodice',
  category: 'bodice',
  side: 'front',
  outline: [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [300, 0] },
    { type: 'L', values: [300, 400] },
    { type: 'L', values: [0, 400] },
    { type: 'Z', values: [] },
  ],
  internals: [],
  edges: [
    { id: 'e1', name: 'neckline', segmentRange: [0, 1], edgeType: 'seam', length: 125 },
    { id: 'e2', name: 'shoulder', segmentRange: [1, 2], edgeType: 'seam', length: 140 },
  ],
  position: { x: 0, y: 0 },
  rotation: 0,
  mirrored: false,
  seamAllowance: 10,
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

describe('getGarmentState', () => {
  it('returns all pieces with edges', async () => {
    const result = await getGarmentStateTool.execute({}, mockState([mockPiece]));
    expect(result.success).toBe(true);
    expect(result.data?.pieces).toHaveLength(1);
    const p = (result.data?.pieces as unknown[])[0] as Record<string, unknown>;
    expect(p.id).toBe('front-bodice');
    expect(p.edges).toContain('neckline');
  });

  it('returns empty array when no pieces', async () => {
    const result = await getGarmentStateTool.execute({}, mockState());
    expect(result.success).toBe(true);
    expect(result.data?.pieceCount).toBe(0);
  });
});

describe('getPieceDetails', () => {
  it('returns detailed edge info for a piece', async () => {
    const result = await getPieceDetailsTool.execute(
      { pieceId: 'front-bodice' },
      mockState([mockPiece]),
    );
    expect(result.success).toBe(true);
    const edges = result.data?.edges as Array<{ name: string; length: number }>;
    expect(edges).toBeDefined();
    expect(edges.find(e => e.name === 'neckline')?.length).toBe(125);
  });

  it('returns error for unknown piece', async () => {
    const result = await getPieceDetailsTool.execute(
      { pieceId: 'nonexistent' },
      mockState([mockPiece]),
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });
});

describe('measureEdge', () => {
  it('returns length of a named edge', async () => {
    const result = await measureEdgeTool.execute(
      { pieceId: 'front-bodice', edgeName: 'neckline' },
      mockState([mockPiece]),
    );
    expect(result.success).toBe(true);
    expect(result.data?.length).toBe(125);
    expect(result.data?.unit).toBe('mm');
  });

  it('returns error for unknown edge', async () => {
    const result = await measureEdgeTool.execute(
      { pieceId: 'front-bodice', edgeName: 'nonexistent' },
      mockState([mockPiece]),
    );
    expect(result.success).toBe(false);
  });
});

describe('searchPieces', () => {
  it('finds pieces by name substring', async () => {
    const result = await searchPiecesTool.execute(
      { query: 'bodice' },
      mockState([mockPiece]),
    );
    expect(result.success).toBe(true);
    const matches = result.data?.matches as Array<{ pieceId: string }>;
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].pieceId).toBe('front-bodice');
  });

  it('finds pieces by category', async () => {
    const result = await searchPiecesTool.execute(
      { query: 'front' },
      mockState([mockPiece]),
    );
    expect(result.success).toBe(true);
    const matches = result.data?.matches as Array<{ pieceId: string }>;
    expect(matches.length).toBeGreaterThan(0);
  });
});

describe('measureAlongCurve', () => {
  it('returns arc-length of a named edge', async () => {
    const result = await measureAlongCurveTool.execute(
      { pieceId: 'front-bodice', edgeName: 'shoulder' },
      mockState([mockPiece]),
    );
    expect(result.success).toBe(true);
    expect(result.data?.length).toBeDefined();
    expect(result.data?.unit).toBe('mm');
    expect(result.data?.samplePoints).toBeDefined();
  });

  it('returns error for unknown piece', async () => {
    const result = await measureAlongCurveTool.execute(
      { pieceId: 'nonexistent', edgeName: 'shoulder' },
      mockState([mockPiece]),
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('returns error for unknown edge', async () => {
    const result = await measureAlongCurveTool.execute(
      { pieceId: 'front-bodice', edgeName: 'nonexistent' },
      mockState([mockPiece]),
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });
});

describe('compareCurves', () => {
  it('returns delta and ease for two edges', async () => {
    const result = await compareCurvesMetaTool.execute(
      { pieceIdA: 'front-bodice', edgeNameA: 'neckline', pieceIdB: 'front-bodice', edgeNameB: 'shoulder' },
      mockState([mockPiece]),
    );
    expect(result.success).toBe(true);
    expect(result.data?.delta).toBeDefined();
    expect(result.data?.easePercent).toBeDefined();
    expect(result.data?.unit).toBe('mm');
  });

  it('returns error for unknown piece', async () => {
    const result = await compareCurvesMetaTool.execute(
      { pieceIdA: 'nonexistent', edgeNameA: 'neckline', pieceIdB: 'front-bodice', edgeNameB: 'shoulder' },
      mockState([mockPiece]),
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('returns error for unknown edge', async () => {
    const result = await compareCurvesMetaTool.execute(
      { pieceIdA: 'front-bodice', edgeNameA: 'neckline', pieceIdB: 'front-bodice', edgeNameB: 'nonexistent' },
      mockState([mockPiece]),
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });
});

describe('getAllMetaTools', () => {
  it('returns 8 meta-tools', () => {
    const tools = getAllMetaTools();
    expect(tools).toHaveLength(8);
    expect(tools.map((t: { name: string }) => t.name)).toEqual(
      expect.arrayContaining(['getGarmentState', 'getPieceDetails', 'measureEdge', 'searchPieces', 'getFitMapStats', 'getFitMapByPiece', 'measureAlongCurve', 'compareCurves']),
    );
  });
});
