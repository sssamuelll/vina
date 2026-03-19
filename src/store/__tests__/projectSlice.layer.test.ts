import { describe, it, expect } from 'vitest';
import reducer, { addPiece, setLayer, setSublayer } from '../projectSlice';
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
});
