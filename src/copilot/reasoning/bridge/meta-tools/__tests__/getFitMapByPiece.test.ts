/**
 * Tests for getFitMapByPiece meta-tool.
 *
 * Verifies that the tool returns per-piece fit map breakdowns from Redux state
 * and returns appropriate errors when no fit map is active or no pieces exist.
 */

import { describe, it, expect } from 'vitest';
import { getFitMapByPieceTool } from '../getFitMapByPiece';

const baseMock = {
  simulation: {
    fitMapMode: 'fit',
    fitMapStats: {
      min: 0,
      max: 1.2,
      mean: 0.4,
      cantWearPct: 10,
      tightPct: 25,
      pressurePointCount: 3,
    },
  },
  project: {
    pieces: [
      { id: 'p1', name: 'Bodice Front', category: 'bodice', side: 'front' },
      { id: 'p2', name: 'Bodice Back', category: 'bodice', side: 'back' },
    ],
  },
};

/** Helper: wrap a mock state object as a getState function typed for execute. */
function getState(override?: Partial<typeof baseMock>) {
  const state = override ? { ...baseMock, ...override } : baseMock;
  return (() => state) as never;
}

describe('getFitMapByPiece meta-tool', () => {
  it('has correct name and description', () => {
    expect(getFitMapByPieceTool.name).toBe('getFitMapByPiece');
    expect(getFitMapByPieceTool.description).toBeTruthy();
  });

  it('requires no parameters', () => {
    expect(getFitMapByPieceTool.parameters.required).toBeUndefined();
  });

  it('returns per-piece breakdown with correct structure', async () => {
    const result = await getFitMapByPieceTool.execute({}, getState());
    expect(result.success).toBe(true);
    expect(result.data?.pieces).toBeInstanceOf(Array);
    expect(result.data?.pieceCount).toBe(2);

    const pieces = result.data?.pieces as Array<Record<string, unknown>>;
    expect(pieces.length).toBe(2);
    expect(pieces[0]).toHaveProperty('id', 'p1');
    expect(pieces[0]).toHaveProperty('name', 'Bodice Front');
    expect(pieces[0]).toHaveProperty('category', 'bodice');
    expect(pieces[0]).toHaveProperty('side', 'front');
    expect(pieces[0]).toHaveProperty('max');
    expect(pieces[0]).toHaveProperty('mean');
    expect(pieces[0]).toHaveProperty('tightPct');
    expect(pieces[0]).toHaveProperty('cantWearPct');
  });

  it('returns active fit map mode', async () => {
    const result = await getFitMapByPieceTool.execute({}, getState());
    expect(result.success).toBe(true);
    expect(result.data?.mode).toBe('fit');
  });

  it('attributes global stats to each piece', async () => {
    const result = await getFitMapByPieceTool.execute({}, getState());
    const pieces = result.data?.pieces as Array<Record<string, unknown>>;
    expect(pieces[0].max).toBe(1.2);
    expect(pieces[0].mean).toBe(0.4);
    expect(pieces[0].tightPct).toBe(25);
    expect(pieces[0].cantWearPct).toBe(10);
    // Second piece also gets global stats
    expect(pieces[1].max).toBe(1.2);
    expect(pieces[1].mean).toBe(0.4);
  });

  it('includes global summary', async () => {
    const result = await getFitMapByPieceTool.execute({}, getState());
    const summary = result.data?.summary as Record<string, unknown>;
    expect(summary).toBeDefined();
    expect(summary.globalMax).toBe(1.2);
    expect(summary.globalMean).toBe(0.4);
    expect(summary.globalMin).toBe(0);
    expect(summary.tightPct).toBe(25);
    expect(summary.cantWearPct).toBe(10);
    expect(summary.pressurePointCount).toBe(3);
  });

  it('returns error when fit map mode is none', async () => {
    const result = await getFitMapByPieceTool.execute(
      {},
      getState({
        simulation: {
          ...baseMock.simulation,
          fitMapMode: 'none',
          fitMapStats: null as never,
        },
      }),
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/no fit map/i);
  });

  it('returns error when fitMapStats is null even if mode is set', async () => {
    const result = await getFitMapByPieceTool.execute(
      {},
      getState({
        simulation: {
          ...baseMock.simulation,
          fitMapMode: 'strain',
          fitMapStats: null as never,
        },
      }),
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/no fit map/i);
  });

  it('returns error when no pieces exist', async () => {
    const result = await getFitMapByPieceTool.execute(
      {},
      getState({ project: { pieces: [] } }),
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/no pattern pieces/i);
  });

  it('handles pieces without optional category/side', async () => {
    const result = await getFitMapByPieceTool.execute(
      {},
      getState({
        project: {
          pieces: [{ id: 'px', name: 'Custom Piece' }] as typeof baseMock.project.pieces,
        },
      }),
    );
    expect(result.success).toBe(true);
    const pieces = result.data?.pieces as Array<Record<string, unknown>>;
    expect(pieces.length).toBe(1);
    expect(pieces[0].id).toBe('px');
    expect(pieces[0].name).toBe('Custom Piece');
    expect(pieces[0].category).toBeUndefined();
    expect(pieces[0].side).toBeUndefined();
  });
});
