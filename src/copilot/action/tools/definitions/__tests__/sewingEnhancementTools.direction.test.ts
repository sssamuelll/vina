/**
 * Fase 5 (paridad CLO3D) — superficies de escritura de dirección/rango:
 * - `reverseSeam`: tool del registry para Reverse Sewing (Ctrl+B), con
 *   rollback de tipo toggle.
 * - `setSeamRange`: mitigación § 5 — rechaza sub-rangos (el solver no
 *   renormaliza t filtrados; despacharlos cose vértices equivocados).
 */
import { describe, it, expect, vi } from 'vitest';
import type { RootState, AppDispatch } from '../../../../../store';
import type { Seam } from '../../../../../types/types';

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

describe('setSeamRange tool — full-segment mitigation (plan § 5)', () => {
  it('refuses sub-ranges with an actionable error (no dispatch)', async () => {
    const { tools } = await import('../sewingEnhancementTools');
    const tool = tools.find(t => t.name === 'setSeamRange');
    const { dispatch, getState } = mockStore([makeSeam()]);

    const result = await tool!.execute(
      { seamId: 's1', side: 'A', tStart: 0.3, tEnd: 0.7 },
      dispatch,
      getState,
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/renormaliz/i);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('still accepts the full range [0, 1]', async () => {
    const { tools } = await import('../sewingEnhancementTools');
    const tool = tools.find(t => t.name === 'setSeamRange');
    const { dispatch, getState } = mockStore([makeSeam()]);

    const result = await tool!.execute(
      { seamId: 's1', side: 'B', tStart: 0, tEnd: 1 },
      dispatch,
      getState,
    );
    expect(result.success).toBe(true);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });
});
