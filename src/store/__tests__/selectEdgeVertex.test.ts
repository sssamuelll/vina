import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import editorReducer, {
  selectSaEdges, selectSaVertices, clearSaSelection, selectPiece, selectSeam, clearSelection,
} from '../editorSlice';

function makeStore() {
  return configureStore({ reducer: { editor: editorReducer } });
}

describe('saSelection (seamAllowance-tool selection)', () => {
  it('selectSaEdges sets the edge set and clears every other selection', () => {
    const store = makeStore();
    store.dispatch(selectPiece('p1'));                                   // some prior selection
    store.dispatch(selectSaVertices({ pieceId: 'p1', vertexIndex: 2 }));
    store.dispatch(selectSaEdges({ items: [{ pieceId: 'p1', edgeId: 'p1:hem' }] }));
    const s = store.getState().editor;
    expect(s.saSelection).toEqual({ kind: 'edge', items: [{ pieceId: 'p1', edgeId: 'p1:hem' }] });
    expect(s.selectedPieceIds).toEqual([]);
    expect(s.selectedSeamId).toBeNull();
  });

  it('switching from vertex to edge replaces the set (kinds never mix)', () => {
    const store = makeStore();
    store.dispatch(selectSaVertices({ pieceId: 'p1', vertexIndex: 3 }));
    store.dispatch(selectSaEdges({ items: [{ pieceId: 'p1', edgeId: 'p1:hem' }] }));
    const s = store.getState().editor;
    expect(s.saSelection).toEqual({ kind: 'edge', items: [{ pieceId: 'p1', edgeId: 'p1:hem' }] });
  });

  it('additive (Shift) accumulates edges into the set', () => {
    const store = makeStore();
    store.dispatch(selectSaEdges({ items: [{ pieceId: 'p1', edgeId: 'a' }] }));
    store.dispatch(selectSaEdges({ items: [{ pieceId: 'p1', edgeId: 'b' }], additive: true }));
    expect(store.getState().editor.saSelection).toEqual({
      kind: 'edge', items: [{ pieceId: 'p1', edgeId: 'a' }, { pieceId: 'p1', edgeId: 'b' }],
    });
  });

  it('additive re-click toggles an edge out of the set; emptying clears to null', () => {
    const store = makeStore();
    store.dispatch(selectSaEdges({ items: [{ pieceId: 'p1', edgeId: 'a' }] }));
    store.dispatch(selectSaEdges({ items: [{ pieceId: 'p1', edgeId: 'b' }], additive: true }));
    store.dispatch(selectSaEdges({ items: [{ pieceId: 'p1', edgeId: 'a' }], additive: true })); // toggle a out
    expect(store.getState().editor.saSelection).toEqual({ kind: 'edge', items: [{ pieceId: 'p1', edgeId: 'b' }] });
    store.dispatch(selectSaEdges({ items: [{ pieceId: 'p1', edgeId: 'b' }], additive: true })); // toggle b out → empty
    expect(store.getState().editor.saSelection).toBeNull();
  });

  it('additive after a vertex selection does NOT mix kinds — it replaces with the edge set', () => {
    const store = makeStore();
    store.dispatch(selectSaVertices({ pieceId: 'p1', vertexIndex: 1 }));
    store.dispatch(selectSaEdges({ items: [{ pieceId: 'p1', edgeId: 'a' }], additive: true }));
    expect(store.getState().editor.saSelection).toEqual({ kind: 'edge', items: [{ pieceId: 'p1', edgeId: 'a' }] });
  });

  it('selecting a piece clears any SA selection (mutual exclusivity)', () => {
    const store = makeStore();
    store.dispatch(selectSaEdges({ items: [{ pieceId: 'p1', edgeId: 'p1:hem' }] }));
    store.dispatch(selectPiece('p2'));
    const s = store.getState().editor;
    expect(s.saSelection).toBeNull();
    expect(s.selectedPieceIds).toEqual(['p2']);
  });

  it('selecting a seam clears any SA selection', () => {
    const store = makeStore();
    store.dispatch(selectSaVertices({ pieceId: 'p1', vertexIndex: 1 }));
    store.dispatch(selectSeam('s1'));
    expect(store.getState().editor.saSelection).toBeNull();
  });

  it('clearSelection and clearSaSelection both clear the SA selection', () => {
    const store = makeStore();
    store.dispatch(selectSaEdges({ items: [{ pieceId: 'p1', edgeId: 'p1:hem' }] }));
    store.dispatch(clearSelection());
    expect(store.getState().editor.saSelection).toBeNull();

    store.dispatch(selectSaVertices({ pieceId: 'p1', vertexIndex: 0 }));
    store.dispatch(clearSaSelection());
    expect(store.getState().editor.saSelection).toBeNull();
  });
});
