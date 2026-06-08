import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import editorReducer, {
  selectEdge, selectVertex, selectPiece, selectSeam, clearSelection,
} from '../editorSlice';

function makeStore() {
  return configureStore({ reducer: { editor: editorReducer } });
}

describe('selectEdge / selectVertex (per-edge SA selection)', () => {
  it('selectEdge sets the focused edge and clears every other selection', () => {
    const store = makeStore();
    store.dispatch(selectPiece('p1'));            // some prior selection
    store.dispatch(selectVertex({ pieceId: 'p1', vertexIndex: 2 }));
    store.dispatch(selectEdge({ pieceId: 'p1', edgeId: 'p1:hem' }));
    const s = store.getState().editor;
    expect(s.selectedEdge).toEqual({ pieceId: 'p1', edgeId: 'p1:hem' });
    expect(s.selectedVertex).toBeNull();
    expect(s.selectedPieceIds).toEqual([]);
    expect(s.selectedSeamId).toBeNull();
  });

  it('selectVertex sets the focused vertex and clears every other selection', () => {
    const store = makeStore();
    store.dispatch(selectEdge({ pieceId: 'p1', edgeId: 'p1:hem' }));
    store.dispatch(selectVertex({ pieceId: 'p1', vertexIndex: 3 }));
    const s = store.getState().editor;
    expect(s.selectedVertex).toEqual({ pieceId: 'p1', vertexIndex: 3 });
    expect(s.selectedEdge).toBeNull();
  });

  it('selecting a piece clears any edge/vertex selection (mutual exclusivity)', () => {
    const store = makeStore();
    store.dispatch(selectEdge({ pieceId: 'p1', edgeId: 'p1:hem' }));
    store.dispatch(selectPiece('p2'));
    const s = store.getState().editor;
    expect(s.selectedEdge).toBeNull();
    expect(s.selectedVertex).toBeNull();
    expect(s.selectedPieceIds).toEqual(['p2']);
  });

  it('selecting a seam clears any edge/vertex selection', () => {
    const store = makeStore();
    store.dispatch(selectVertex({ pieceId: 'p1', vertexIndex: 1 }));
    store.dispatch(selectSeam('s1'));
    expect(store.getState().editor.selectedVertex).toBeNull();
  });

  it('clearSelection clears edge/vertex too', () => {
    const store = makeStore();
    store.dispatch(selectEdge({ pieceId: 'p1', edgeId: 'p1:hem' }));
    store.dispatch(clearSelection());
    const s = store.getState().editor;
    expect(s.selectedEdge).toBeNull();
    expect(s.selectedVertex).toBeNull();
  });
});
