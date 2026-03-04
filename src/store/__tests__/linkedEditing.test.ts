import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import projectReducer, {
  addPiece,
  linkPieces,
  unlinkPieces,
  cloneAsLinked,
} from '../projectSlice';
import type { PatternPiece } from '../../types/types';

describe('PatternPiece linked editing fields', () => {
  it('supports optional linkedPieceId and linkMode', () => {
    const piece: PatternPiece = {
      id: 'p1',
      name: 'Front Left',
      outline: [{ type: 'M', values: [0, 0] }, { type: 'L', values: [100, 0] }, { type: 'L', values: [100, 200] }, { type: 'L', values: [0, 200] }, { type: 'Z', values: [] }],
      internals: [],
      position: { x: 0, y: 0 },
      rotation: 0,
      mirrored: false,
      seamAllowance: 10,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      linkedPieceId: 'p2',
      linkMode: 'symmetry',
    };
    expect(piece.linkedPieceId).toBe('p2');
    expect(piece.linkMode).toBe('symmetry');
  });

  it('allows omitting linked fields', () => {
    const piece: PatternPiece = {
      id: 'p1',
      name: 'Collar',
      outline: [{ type: 'M', values: [0, 0] }, { type: 'L', values: [50, 0] }, { type: 'Z', values: [] }],
      internals: [],
      position: { x: 0, y: 0 },
      rotation: 0,
      mirrored: false,
      seamAllowance: 10,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    expect(piece.linkedPieceId).toBeUndefined();
    expect(piece.linkMode).toBeUndefined();
  });
});

function makePiece(id: string, name: string): PatternPiece {
  return {
    id, name,
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 200] },
      { type: 'L', values: [0, 200] },
      { type: 'Z', values: [] },
    ],
    internals: [],
    position: { x: 0, y: 0 },
    rotation: 0,
    mirrored: false,
    seamAllowance: 10,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function createStore() {
  return configureStore({ reducer: { project: projectReducer } });
}

describe('linkPieces reducer', () => {
  it('sets linkedPieceId and linkMode on both pieces', () => {
    const store = createStore();
    store.dispatch(addPiece(makePiece('a', 'Left')));
    store.dispatch(addPiece(makePiece('b', 'Right')));
    store.dispatch(linkPieces({ pieceIdA: 'a', pieceIdB: 'b', mode: 'symmetry' }));

    const pieces = store.getState().project.pieces;
    const a = pieces.find(p => p.id === 'a')!;
    const b = pieces.find(p => p.id === 'b')!;
    expect(a.linkedPieceId).toBe('b');
    expect(a.linkMode).toBe('symmetry');
    expect(b.linkedPieceId).toBe('a');
    expect(b.linkMode).toBe('symmetry');
  });
});

describe('unlinkPieces reducer', () => {
  it('clears linkedPieceId and linkMode on both pieces', () => {
    const store = createStore();
    store.dispatch(addPiece(makePiece('a', 'Left')));
    store.dispatch(addPiece(makePiece('b', 'Right')));
    store.dispatch(linkPieces({ pieceIdA: 'a', pieceIdB: 'b', mode: 'instance' }));
    store.dispatch(unlinkPieces({ pieceId: 'a' }));

    const pieces = store.getState().project.pieces;
    expect(pieces.find(p => p.id === 'a')!.linkedPieceId).toBeUndefined();
    expect(pieces.find(p => p.id === 'b')!.linkedPieceId).toBeUndefined();
  });
});

describe('cloneAsLinked reducer', () => {
  it('duplicates piece and links both', () => {
    const store = createStore();
    store.dispatch(addPiece(makePiece('a', 'Left Sleeve')));
    store.dispatch(cloneAsLinked({ pieceId: 'a', mode: 'symmetry' }));

    const pieces = store.getState().project.pieces;
    expect(pieces).toHaveLength(2);
    const original = pieces.find(p => p.id === 'a')!;
    const clone = pieces.find(p => p.id !== 'a')!;
    expect(original.linkedPieceId).toBe(clone.id);
    expect(clone.linkedPieceId).toBe('a');
    expect(clone.linkMode).toBe('symmetry');
  });
});
