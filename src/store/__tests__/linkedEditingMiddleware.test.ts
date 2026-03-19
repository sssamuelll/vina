import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import projectReducer, { addPiece, linkPieces, updatePiece, movePiece } from '../projectSlice';
import { linkedEditingMiddleware } from '../linkedEditingMiddleware';
import type { PatternPiece } from '../../types/types';

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
    layer: 1,
    sublayer: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function createStore() {
  return configureStore({
    reducer: { project: projectReducer },
    middleware: (getDefault) => getDefault().concat(linkedEditingMiddleware),
  });
}

describe('linkedEditingMiddleware', () => {
  it('syncs updatePiece to instance-linked partner (same outline)', () => {
    const store = createStore();
    store.dispatch(addPiece(makePiece('a', 'Left')));
    store.dispatch(addPiece(makePiece('b', 'Right')));
    store.dispatch(linkPieces({ pieceIdA: 'a', pieceIdB: 'b', mode: 'instance' }));

    const a = store.getState().project.pieces.find(p => p.id === 'a')!;
    const edited = {
      ...a,
      outline: [
        { type: 'M' as const, values: [0, 0] },
        { type: 'L' as const, values: [150, 0] },
        { type: 'L' as const, values: [150, 200] },
        { type: 'L' as const, values: [0, 200] },
        { type: 'Z' as const, values: [] },
      ],
      updatedAt: Date.now(),
    };
    store.dispatch(updatePiece(edited));

    const b = store.getState().project.pieces.find(p => p.id === 'b')!;
    expect(b.outline[1].values[0]).toBe(150);
  });

  it('syncs updatePiece to symmetry-linked partner (mirrored outline)', () => {
    const store = createStore();
    store.dispatch(addPiece(makePiece('a', 'Left')));
    store.dispatch(addPiece(makePiece('b', 'Right')));
    store.dispatch(linkPieces({ pieceIdA: 'a', pieceIdB: 'b', mode: 'symmetry' }));

    const a = store.getState().project.pieces.find(p => p.id === 'a')!;
    const edited = {
      ...a,
      outline: [
        { type: 'M' as const, values: [10, 0] },
        { type: 'L' as const, values: [100, 0] },
        { type: 'L' as const, values: [100, 200] },
        { type: 'L' as const, values: [10, 200] },
        { type: 'Z' as const, values: [] },
      ],
      updatedAt: Date.now(),
    };
    store.dispatch(updatePiece(edited));

    const b = store.getState().project.pieces.find(p => p.id === 'b')!;
    // Symmetry: X mirrored around center (55). M(10) -> M(100), L(100) -> L(10)
    expect(b.outline[0].values[0]).toBe(100);
    expect(b.outline[1].values[0]).toBe(10);
  });

  it('does not sync movePiece (positions are independent)', () => {
    const store = createStore();
    store.dispatch(addPiece(makePiece('a', 'Left')));
    store.dispatch(addPiece(makePiece('b', 'Right')));
    store.dispatch(linkPieces({ pieceIdA: 'a', pieceIdB: 'b', mode: 'symmetry' }));

    store.dispatch(movePiece({ id: 'a', x: 200, y: 100 }));

    const b = store.getState().project.pieces.find(p => p.id === 'b')!;
    expect(b.position.x).toBe(0);
  });

  it('does not infinite loop (synced dispatch does not re-trigger)', () => {
    const store = createStore();
    store.dispatch(addPiece(makePiece('a', 'Left')));
    store.dispatch(addPiece(makePiece('b', 'Right')));
    store.dispatch(linkPieces({ pieceIdA: 'a', pieceIdB: 'b', mode: 'instance' }));

    const a = store.getState().project.pieces.find(p => p.id === 'a')!;
    store.dispatch(updatePiece({ ...a, name: 'Edited', updatedAt: Date.now() }));

    const pieces = store.getState().project.pieces;
    expect(pieces.find(p => p.id === 'a')!.name).toBe('Edited');
  });
});
