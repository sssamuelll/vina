/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';
import reducer, { addPiece, updatePiece } from '../projectSlice';
import type { PatternPiece, CornerType } from '../../types/types';

function baseState(overrides: Partial<any> = {}): any {
  return {
    id: 'test', name: 'Test',
    pieces: [],
    seams: [],
    fabrics: [],
    avatar: { id: 'a', name: 'A', modelUrl: '', measurements: {} } as any,
    avatarMode: 'model' as const,
    avatarModelUrl: null,
    isDirty: false,
    groups: [],
    seamGroups: [],
    arrangementOverrides: {},
    poms: [],
    layerNames: {},
    layerLocked: {},
    loadDiagnostics: [],
    loadQuarantine: { pieces: [], seams: [], poms: [], seamGroups: [] },
    ...overrides,
  };
}

function makePiece(id: string, overrides: Partial<PatternPiece> = {}): PatternPiece {
  return {
    id,
    name: id,
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 100] },
      { type: 'L', values: [0, 100] },
      { type: 'Z', values: [] },
    ],
    internals: [],
    position: { x: 0, y: 0 },
    rotation: 0,
    mirrored: false,
    seamAllowance: 10,
    active: true,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe('projectSlice — cornerTypes', () => {
  it('updatePiece stores cornerTypes on piece', () => {
    const piece = makePiece('p1');
    const state = baseState({ pieces: [piece] });

    const cornerTypes: Record<number, CornerType> = {
      1: 'squared',
      3: 'envelope',
    };

    const updated = { ...piece, cornerTypes };
    const next = reducer(state, updatePiece(updated));

    expect(next.pieces[0].cornerTypes).toEqual({ 1: 'squared', 3: 'envelope' });
    expect(next.isDirty).toBe(true);
  });

  it('updatePiece stores defaultCornerType', () => {
    const piece = makePiece('p1');
    const state = baseState({ pieces: [piece] });

    const updated = { ...piece, defaultCornerType: 'doubleMitered' as CornerType };
    const next = reducer(state, updatePiece(updated));

    expect(next.pieces[0].defaultCornerType).toBe('doubleMitered');
    expect(next.isDirty).toBe(true);
  });

  it('cornerTypes defaults to undefined when not set', () => {
    const piece = makePiece('p1');
    const state = baseState();
    const next = reducer(state, addPiece(piece));

    expect(next.pieces[0].cornerTypes).toBeUndefined();
    expect(next.pieces[0].defaultCornerType).toBeUndefined();
  });
});
