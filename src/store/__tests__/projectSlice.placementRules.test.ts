import { describe, it, expect } from 'vitest';
import reducer, { addPlacementRule, removePlacementRule } from '../projectSlice';
import type { PatternPiece } from '../../types/types';

function basePiece(overrides?: Partial<PatternPiece>): PatternPiece {
  return {
    id: 'p1',
    name: 'Test Piece',
    outline: [],
    internals: [],
    position: { x: 0, y: 0 },
    rotation: 0,
    mirrored: false,
    seamAllowance: 10,
    layer: 1,
    sublayer: 0,
    active: true,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

function emptyState() {
  return {
    id: 'test',
    name: 'Test',
    pieces: [] as PatternPiece[],
    seams: [],
    pleats: [],
    elastics: [],
    trims: [],
    fabrics: [],
    avatar: { id: 'a', name: 'A', modelUrl: '', measurements: { height: 170, chest: 88, waist: 72, hips: 96, shoulder: 40, armLength: 60, inseam: 80 } },
    avatarMode: 'model' as const,
    avatarModelUrl: null,
    isDirty: false,
    groups: [],
    seamGroups: [],
    arrangementOverrides: {},
    poms: [],
    referenceImages: [],
    trazos: [],
    layerNames: {},
    layerLocked: {},
    loadDiagnostics: [],
    loadQuarantine: { pieces: [], seams: [], poms: [], seamGroups: [] },
    colorways: [],
    activeColorwayId: null,
  };
}

describe('projectSlice placement rules', () => {
  it('adds a placement rule and initializes the array when missing', () => {
    const state = { ...emptyState(), pieces: [basePiece({ id: 'p1', placementRules: undefined })] };
    const next = reducer(state, addPlacementRule({ pieceId: 'p1', rule: { type: 'priority', value: 1 } }));

    expect(next.pieces[0].placementRules).toEqual([{ type: 'priority', value: 1 }]);
    expect(next.pieces[0].updatedAt).not.toBe(1000);
    expect(next.isDirty).toBe(true);
  });

  it('removes a placement rule by index', () => {
    const state = {
      ...emptyState(),
      pieces: [basePiece({ id: 'p1', placementRules: [{ type: 'priority', value: 1 }, { type: 'atEdge', edge: 'left' }] })],
    };
    const next = reducer(state, removePlacementRule({ pieceId: 'p1', ruleIndex: 0 }));

    expect(next.pieces[0].placementRules).toEqual([{ type: 'atEdge', edge: 'left' }]);
    expect(next.isDirty).toBe(true);
  });

  it('does nothing when adding a rule to a missing piece', () => {
    const state = { ...emptyState(), pieces: [basePiece({ id: 'p1' })] };
    const next = reducer(state, addPlacementRule({ pieceId: 'missing', rule: { type: 'atFold' } }));

    expect(next).toEqual(state);
  });

  it('does nothing when removing from a piece without placement rules', () => {
    const state = { ...emptyState(), pieces: [basePiece({ id: 'p1', placementRules: undefined })] };
    const next = reducer(state, removePlacementRule({ pieceId: 'p1', ruleIndex: 0 }));

    expect(next.pieces[0].placementRules).toBeUndefined();
    expect(next.isDirty).toBe(false);
  });

  it('does nothing when removing from a missing piece', () => {
    const state = { ...emptyState(), pieces: [basePiece({ id: 'p1', placementRules: [{ type: 'atFold' }] })] };
    const next = reducer(state, removePlacementRule({ pieceId: 'missing', ruleIndex: 0 }));

    expect(next).toEqual(state);
  });
});
