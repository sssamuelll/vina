/**
 * createSeam — optional sewn-range extents (rangeA/rangeB in %, CLO3D-style).
 * Full-range halves must carry NO tStart/tEnd (Seam convention: sub-range
 * fields only when a real sub-range exists).
 */
import { describe, it, expect, vi } from 'vitest';
import type { RootState, AppDispatch } from '../../../../../store';
import { validateToolParams, CreateSeamSchema } from '../../validation';

function mockStore() {
  const edges = [{ id: 'e1', name: 'sideSeam', segmentRange: [0, 1] as [number, number], edgeType: 'seam' }];
  const state = {
    project: {
      pieces: [
        { id: 'p1', name: 'Front', edges },
        { id: 'p2', name: 'Back', edges },
      ],
      seams: [],
    },
  } as unknown as RootState;
  const dispatch = vi.fn() as unknown as AppDispatch;
  return { dispatch, getState: () => state };
}

async function getTool() {
  const { tools } = await import('../seamTools');
  return tools.find(t => t.name === 'createSeam')!;
}

describe('createSeam tool — sewn ranges', () => {
  const baseParams = { pieceAId: 'p1', edgeAName: 'sideSeam', pieceBId: 'p2', edgeBName: 'sideSeam' };

  it('without ranges, halves carry NO tStart/tEnd', async () => {
    const tool = await getTool();
    const { dispatch, getState } = mockStore();

    const result = await tool.execute(baseParams, dispatch, getState);
    expect(result.success).toBe(true);
    const action = (dispatch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(action.type).toBe('project/addSeam');
    expect('tStart' in action.payload.pieceA).toBe(false);
    expect('tEnd' in action.payload.pieceA).toBe(false);
    expect('tStart' in action.payload.pieceB).toBe(false);
  });

  it('maps rangeA/rangeB percents to tStart/tEnd fractions', async () => {
    const tool = await getTool();
    const { dispatch, getState } = mockStore();

    const result = await tool.execute(
      { ...baseParams, rangeA: [20, 80], rangeB: [0, 60] },
      dispatch,
      getState,
    );
    expect(result.success).toBe(true);
    const action = (dispatch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(action.payload.pieceA).toMatchObject({ tStart: 0.2, tEnd: 0.8 });
    expect(action.payload.pieceB).toMatchObject({ tStart: 0, tEnd: 0.6 });
  });

  it('explicit full range [0, 100] stays clean (no redundant 0/1)', async () => {
    const tool = await getTool();
    const { dispatch, getState } = mockStore();

    await tool.execute({ ...baseParams, rangeA: [0, 100] }, dispatch, getState);
    const action = (dispatch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect('tStart' in action.payload.pieceA).toBe(false);
  });
});

describe('CreateSeamSchema', () => {
  const baseParams = { pieceAId: 'p1', edgeAName: 'sideSeam', pieceBId: 'p2', edgeBName: 'sideSeam' };

  it('accepts params without ranges', () => {
    expect(validateToolParams(CreateSeamSchema, baseParams).success).toBe(true);
  });

  it('rejects start >= end and out-of-bounds percents', () => {
    expect(validateToolParams(CreateSeamSchema, { ...baseParams, rangeA: [80, 20] }).success).toBe(false);
    expect(validateToolParams(CreateSeamSchema, { ...baseParams, rangeB: [0, 101] }).success).toBe(false);
  });

  it('accepts valid ranges', () => {
    expect(validateToolParams(CreateSeamSchema, { ...baseParams, rangeA: [20, 80], rangeB: [0, 100] }).success).toBe(true);
  });
});
