/**
 * Fase 5 (paridad CLO3D) — superficies de escritura de dirección/rango:
 * - `reverseSeam`: tool del registry para Reverse Sewing (Ctrl+B), con
 *   rollback de tipo toggle.
 * - `setSeamRange`: extents de costura estilo CLO3D — rangos en % (0–100)
 *   por mitad, mapeados a tStart/tEnd (fracciones) vía applyPctRange.
 *   Rango completo → campos ausentes (nunca 0/1 redundante). La antigua
 *   mitigación full-range-only fue levantada al abrir la superficie de
 *   sub-rangos (control "cuánto de la curva coso").
 */
import { describe, it, expect, vi } from 'vitest';
import type { RootState, AppDispatch } from '../../../../../store';
import type { Seam } from '../../../../../types/types';
import { validateToolParams, SetSeamRangeSchema } from '../../validation';

function makeSeam(overrides: Partial<Seam> = {}): Seam {
  return {
    id: 's1',
    pieceA: { pieceId: 'p1', edgeName: 'sideSeam' },
    pieceB: { pieceId: 'p2', edgeName: 'sideSeam' },
    type: 'standard',
    tension: 100,
    strength: 1.0,
    active: true,
    taped: false,
    tapeWidth: 10,
    ...overrides,
  };
}

function mockStore(seams: Seam[]) {
  // Reducer mínimo: solo necesitamos que reverseSeam mute pieceB.reversed
  // para que el tool lea el estado post-dispatch.
  const state = { project: { seams } } as unknown as RootState;
  const dispatch = vi.fn((action: { type: string; payload?: unknown }) => {
    if (action.type === 'project/reverseSeam') {
      const seam = seams.find(s => s.id === action.payload);
      if (seam) seam.pieceB.reversed = seam.pieceB.reversed !== true;
    }
    return action;
  }) as unknown as AppDispatch;
  return { dispatch, getState: () => state };
}

describe('reverseSeam tool', () => {
  it('toggles direction, reports the new state, and rolls back by toggling again', async () => {
    const { tools } = await import('../sewingEnhancementTools');
    const tool = tools.find(t => t.name === 'reverseSeam');
    expect(tool).toBeDefined();

    const seam = makeSeam();
    const { dispatch, getState } = mockStore([seam]);

    const result = await tool!.execute({ seamId: 's1' }, dispatch, getState);
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ seamId: 's1', reversed: true });
    expect(result.rollback).toBeInstanceOf(Function);

    // Rollback = toggle de vuelta (convención de simulationTools).
    await result.rollback!();
    expect(seam.pieceB.reversed).toBe(false);
  });

  it('returns error for unknown seam ids', async () => {
    const { tools } = await import('../sewingEnhancementTools');
    const tool = tools.find(t => t.name === 'reverseSeam');
    const { dispatch, getState } = mockStore([makeSeam()]);

    const result = await tool!.execute({ seamId: 'ghost' }, dispatch, getState);
    expect(result.success).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe('setSeamRange tool — sewn-range extents (% → tStart/tEnd)', () => {
  async function getTool() {
    const { tools } = await import('../sewingEnhancementTools');
    return tools.find(t => t.name === 'setSeamRange')!;
  }

  it('maps percent ranges to fractions and dispatches ONE updateSeam', async () => {
    const tool = await getTool();
    const seam = makeSeam();
    const { dispatch, getState } = mockStore([seam]);

    const result = await tool.execute(
      { seamId: 's1', rangeA: [30, 70], rangeB: [0, 50] },
      dispatch,
      getState,
    );
    expect(result.success).toBe(true);
    expect(dispatch).toHaveBeenCalledTimes(1);
    const action = (dispatch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(action.type).toBe('project/updateSeam');
    expect(action.payload.pieceA).toMatchObject({ tStart: 0.3, tEnd: 0.7 });
    expect(action.payload.pieceB).toMatchObject({ tStart: 0, tEnd: 0.5 });
  });

  it('leaves an omitted half untouched', async () => {
    const tool = await getTool();
    const seam = makeSeam({ pieceB: { pieceId: 'p2', edgeName: 'sideSeam', tStart: 0.1, tEnd: 0.9 } });
    const { dispatch, getState } = mockStore([seam]);

    await tool.execute({ seamId: 's1', rangeA: [20, 80] }, dispatch, getState);
    const action = (dispatch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(action.payload.pieceB).toEqual({ pieceId: 'p2', edgeName: 'sideSeam', tStart: 0.1, tEnd: 0.9 });
  });

  it('full range [0, 100] normalizes to ABSENT tStart/tEnd (cleans legacy 0/1)', async () => {
    const tool = await getTool();
    const seam = makeSeam({ pieceA: { pieceId: 'p1', edgeName: 'sideSeam', tStart: 0.3, tEnd: 0.7 } });
    const { dispatch, getState } = mockStore([seam]);

    await tool.execute({ seamId: 's1', rangeA: [0, 100] }, dispatch, getState);
    const action = (dispatch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect('tStart' in action.payload.pieceA).toBe(false);
    expect('tEnd' in action.payload.pieceA).toBe(false);
  });

  it('rollback restores the pre-dispatch seam snapshot', async () => {
    const tool = await getTool();
    const seam = makeSeam();
    const { dispatch, getState } = mockStore([seam]);

    const result = await tool.execute({ seamId: 's1', rangeA: [30, 70] }, dispatch, getState);
    expect(result.rollback).toBeInstanceOf(Function);
    await result.rollback!();
    const mock = dispatch as unknown as ReturnType<typeof vi.fn>;
    expect(mock).toHaveBeenCalledTimes(2);
    const rollbackAction = mock.mock.calls[1][0];
    expect(rollbackAction.type).toBe('project/updateSeam');
    expect(rollbackAction.payload).toBe(seam); // exact previous snapshot
  });

  it('returns error for unknown seam ids (no dispatch)', async () => {
    const tool = await getTool();
    const { dispatch, getState } = mockStore([makeSeam()]);

    const result = await tool.execute({ seamId: 'ghost', rangeA: [0, 50] }, dispatch, getState);
    expect(result.success).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('errors when both ranges are omitted (defensive twin of the zod refine)', async () => {
    const tool = await getTool();
    const { dispatch, getState } = mockStore([makeSeam()]);

    const result = await tool.execute({ seamId: 's1' }, dispatch, getState);
    expect(result.success).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe('SetSeamRangeSchema (D3: tool args son scope de zod)', () => {
  it('rejects start >= end', () => {
    expect(validateToolParams(SetSeamRangeSchema, { seamId: 's1', rangeA: [70, 30] }).success).toBe(false);
    expect(validateToolParams(SetSeamRangeSchema, { seamId: 's1', rangeA: [50, 50] }).success).toBe(false);
  });

  it('rejects percents outside 0–100', () => {
    expect(validateToolParams(SetSeamRangeSchema, { seamId: 's1', rangeA: [-5, 50] }).success).toBe(false);
    expect(validateToolParams(SetSeamRangeSchema, { seamId: 's1', rangeB: [0, 120] }).success).toBe(false);
  });

  it('requires at least one range', () => {
    expect(validateToolParams(SetSeamRangeSchema, { seamId: 's1' }).success).toBe(false);
  });

  it('accepts decimal percents and a single side', () => {
    expect(validateToolParams(SetSeamRangeSchema, { seamId: 's1', rangeB: [12.5, 87.5] }).success).toBe(true);
  });
});
