import { describe, it, expect } from 'vitest';
import reducer, { addPiece, setLayer, setSublayer, cloneToLayer, superimposePiece } from '../projectSlice';
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
    fabrics: [],
    avatar: { id: 'a', name: 'A', modelUrl: '', measurements: { height: 170, chest: 88, waist: 72, hips: 96, shoulder: 40, armLength: 60, inseam: 80 } },
    avatarMode: 'model' as const,
    avatarModelUrl: null,
    isDirty: false,
    groups: [],
    arrangementOverrides: {},
    poms: [],
  };
}

describe('PatternPiece layer auto-detection', () => {
  it('assigns layer 0 for lining', () => {
    const state = emptyState();
    const piece = basePiece({ id: 'p1', category: 'lining', layer: undefined as unknown as number });
    const next = reducer(state, addPiece(piece));
    expect(next.pieces[0].layer).toBe(0);
  });

  it('assigns layer 0 for facing', () => {
    const state = emptyState();
    const piece = basePiece({ id: 'p1', category: 'facing', layer: undefined as unknown as number });
    const next = reducer(state, addPiece(piece));
    expect(next.pieces[0].layer).toBe(0);
  });

  it('assigns layer 1 for bodice', () => {
    const state = emptyState();
    const piece = basePiece({ id: 'p1', category: 'bodice', layer: undefined as unknown as number });
    const next = reducer(state, addPiece(piece));
    expect(next.pieces[0].layer).toBe(1);
  });

  it('assigns layer 2 for collar', () => {
    const state = emptyState();
    const piece = basePiece({ id: 'p1', category: 'collar', layer: undefined as unknown as number });
    const next = reducer(state, addPiece(piece));
    expect(next.pieces[0].layer).toBe(2);
  });

  it('assigns layer 1 for undefined category', () => {
    const state = emptyState();
    const piece = basePiece({ id: 'p1', category: undefined, layer: undefined as unknown as number });
    const next = reducer(state, addPiece(piece));
    expect(next.pieces[0].layer).toBe(1);
  });

  it('preserves explicitly provided layer', () => {
    const state = emptyState();
    const piece = basePiece({ id: 'p1', category: 'collar', layer: 5 });
    const next = reducer(state, addPiece(piece));
    expect(next.pieces[0].layer).toBe(5);
  });

  it('defaults sublayer to 0', () => {
    const state = emptyState();
    const piece = basePiece({ id: 'p1', sublayer: undefined as unknown as number });
    const next = reducer(state, addPiece(piece));
    expect(next.pieces[0].sublayer).toBe(0);
  });
});

describe('setLayer reducer', () => {
  it('sets layer on piece', () => {
    const state = { ...emptyState(), pieces: [basePiece({ id: 'p1', layer: 1 })] };
    const next = reducer(state, setLayer({ pieceId: 'p1', layer: 3 }));
    expect(next.pieces[0].layer).toBe(3);
  });

  it('clamps layer to minimum 0', () => {
    const state = { ...emptyState(), pieces: [basePiece({ id: 'p1', layer: 1 })] };
    const next = reducer(state, setLayer({ pieceId: 'p1', layer: -2 }));
    expect(next.pieces[0].layer).toBe(0);
  });

  it('does nothing if piece not found', () => {
    const state = { ...emptyState(), pieces: [basePiece({ id: 'p1', layer: 1 })] };
    const next = reducer(state, setLayer({ pieceId: 'nonexistent', layer: 5 }));
    expect(next.pieces[0].layer).toBe(1);
  });
});

describe('setSublayer reducer', () => {
  it('sets sublayer on piece', () => {
    const state = { ...emptyState(), pieces: [basePiece({ id: 'p1', sublayer: 0 })] };
    const next = reducer(state, setSublayer({ pieceId: 'p1', sublayer: 7 }));
    expect(next.pieces[0].sublayer).toBe(7);
  });

  it('does nothing if piece not found', () => {
    const state = { ...emptyState(), pieces: [basePiece({ id: 'p1', sublayer: 3 })] };
    const next = reducer(state, setSublayer({ pieceId: 'nonexistent', sublayer: 10 }));
    expect(next.pieces[0].sublayer).toBe(3);
  });

  it('clamps sublayer to minimum 0', () => {
    const state = { ...emptyState(), pieces: [basePiece({ id: 'p1', sublayer: 3 })] };
    const next = reducer(state, setSublayer({ pieceId: 'p1', sublayer: -5 }));
    expect(next.pieces[0].sublayer).toBe(0);
  });
});

describe('cloneToLayer reducer', () => {
  it('sets isDirty when cloning', () => {
    const state = { ...emptyState(), pieces: [basePiece({ id: 'p1', layer: 1 })] };
    const next = reducer(state, cloneToLayer({ pieceId: 'p1', direction: 'over' }));
    expect(next.isDirty).toBe(true);
  });

  it('creates clone one layer above with direction=over', () => {
    const state = { ...emptyState(), pieces: [basePiece({ id: 'p1', layer: 1 })] };
    const next = reducer(state, cloneToLayer({ pieceId: 'p1', direction: 'over' }));
    expect(next.pieces).toHaveLength(2);
    expect(next.pieces[1].layer).toBe(2);
    expect(next.pieces[1].name).toBe('Test Piece (clone)');
  });

  it('creates clone one layer below with direction=under', () => {
    const state = { ...emptyState(), pieces: [basePiece({ id: 'p1', layer: 2 })] };
    const next = reducer(state, cloneToLayer({ pieceId: 'p1', direction: 'under' }));
    expect(next.pieces).toHaveLength(2);
    expect(next.pieces[1].layer).toBe(1);
  });

  it('clamps clone layer to 0 when cloning under from layer 0', () => {
    const state = { ...emptyState(), pieces: [basePiece({ id: 'p1', layer: 0 })] };
    const next = reducer(state, cloneToLayer({ pieceId: 'p1', direction: 'under' }));
    expect(next.pieces).toHaveLength(2);
    expect(next.pieces[1].layer).toBe(0);
  });

  it('copies arrangement override to clone', () => {
    const state = {
      ...emptyState(),
      pieces: [basePiece({ id: 'p1', layer: 1 })],
      arrangementOverrides: { p1: [0.5, 1.0, 0.2] as [number, number, number] },
    };
    const next = reducer(state, cloneToLayer({ pieceId: 'p1', direction: 'over' }));
    const cloneId = next.pieces[1].id;
    expect(next.arrangementOverrides[cloneId]).toEqual([0.5, 1.0, 0.2]);
  });

  it('does nothing if piece not found', () => {
    const state = { ...emptyState(), pieces: [basePiece({ id: 'p1' })] };
    const next = reducer(state, cloneToLayer({ pieceId: 'nonexistent', direction: 'over' }));
    expect(next.pieces).toHaveLength(1);
  });
});

describe('superimposePiece reducer', () => {
  it('sets isDirty when superimposing', () => {
    const state = {
      ...emptyState(),
      pieces: [basePiece({ id: 'p1', layer: 1 }), basePiece({ id: 'p2', layer: 2 })],
      arrangementOverrides: { p2: [0, 0.5, 0] as [number, number, number] },
    };
    const next = reducer(state, superimposePiece({ pieceId: 'p1', targetPieceId: 'p2', mode: 'over' }));
    expect(next.isDirty).toBe(true);
  });

  it('copies target position and sets layer above for mode=over', () => {
    const state = {
      ...emptyState(),
      pieces: [basePiece({ id: 'p1', layer: 1 }), basePiece({ id: 'p2', layer: 2 })],
      arrangementOverrides: { p2: [1, 2, 3] as [number, number, number] },
    };
    const next = reducer(state, superimposePiece({ pieceId: 'p1', targetPieceId: 'p2', mode: 'over' }));
    expect(next.pieces[0].layer).toBe(3);
    expect(next.arrangementOverrides.p1).toEqual([1, 2, 3]);
  });

  it('copies target position and sets layer below for mode=under', () => {
    const state = {
      ...emptyState(),
      pieces: [basePiece({ id: 'p1', layer: 3 }), basePiece({ id: 'p2', layer: 2 })],
      arrangementOverrides: { p2: [1, 2, 3] as [number, number, number] },
    };
    const next = reducer(state, superimposePiece({ pieceId: 'p1', targetPieceId: 'p2', mode: 'under' }));
    expect(next.pieces[0].layer).toBe(1);
    expect(next.arrangementOverrides.p1).toEqual([1, 2, 3]);
  });

  it('applies side offset for mode=side without changing layer', () => {
    const state = {
      ...emptyState(),
      pieces: [basePiece({ id: 'p1', layer: 1 }), basePiece({ id: 'p2', layer: 2 })],
      arrangementOverrides: { p2: [1, 2, 3] as [number, number, number] },
    };
    const next = reducer(state, superimposePiece({ pieceId: 'p1', targetPieceId: 'p2', mode: 'side' }));
    expect(next.pieces[0].layer).toBe(1); // unchanged
    expect(next.arrangementOverrides.p1).toEqual([1.1, 2, 3]);
  });

  it('clamps layer to 0 when superimposing under target at layer 0', () => {
    const state = {
      ...emptyState(),
      pieces: [basePiece({ id: 'p1', layer: 2 }), basePiece({ id: 'p2', layer: 0 })],
      arrangementOverrides: { p2: [0, 0, 0] as [number, number, number] },
    };
    const next = reducer(state, superimposePiece({ pieceId: 'p1', targetPieceId: 'p2', mode: 'under' }));
    expect(next.pieces[0].layer).toBe(0);
  });

  it('does not copy position when target has no arrangement override', () => {
    const state = {
      ...emptyState(),
      pieces: [basePiece({ id: 'p1', layer: 1 }), basePiece({ id: 'p2', layer: 2 })],
    };
    const next = reducer(state, superimposePiece({ pieceId: 'p1', targetPieceId: 'p2', mode: 'over' }));
    expect(next.pieces[0].layer).toBe(3); // layer still updated
    expect(next.arrangementOverrides.p1).toBeUndefined(); // no position set
  });

  it('does nothing if piece not found', () => {
    const state = { ...emptyState(), pieces: [basePiece({ id: 'p1', layer: 1 })] };
    const next = reducer(state, superimposePiece({ pieceId: 'ghost', targetPieceId: 'p1', mode: 'over' }));
    expect(next.pieces[0].layer).toBe(1);
  });

  it('does nothing if target not found', () => {
    const state = { ...emptyState(), pieces: [basePiece({ id: 'p1', layer: 1 })] };
    const next = reducer(state, superimposePiece({ pieceId: 'p1', targetPieceId: 'ghost', mode: 'over' }));
    expect(next.pieces[0].layer).toBe(1);
  });
});
