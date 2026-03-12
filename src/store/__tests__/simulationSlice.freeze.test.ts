import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import simulationReducer, {
  toggleFreezePiece,
  unfreezeAllPieces,
} from '../simulationSlice';

function createStore() {
  return configureStore({ reducer: { simulation: simulationReducer } });
}

describe('frozenPieceIds state', () => {
  it('starts with empty frozenPieceIds', () => {
    const store = createStore();
    expect(store.getState().simulation.frozenPieceIds).toEqual([]);
  });

  it('toggleFreezePiece adds piece to frozenPieceIds', () => {
    const store = createStore();
    store.dispatch(toggleFreezePiece('piece-1'));
    expect(store.getState().simulation.frozenPieceIds).toEqual(['piece-1']);
  });

  it('toggleFreezePiece removes piece if already frozen', () => {
    const store = createStore();
    store.dispatch(toggleFreezePiece('piece-1'));
    store.dispatch(toggleFreezePiece('piece-1'));
    expect(store.getState().simulation.frozenPieceIds).toEqual([]);
  });

  it('toggleFreezePiece handles multiple pieces', () => {
    const store = createStore();
    store.dispatch(toggleFreezePiece('piece-1'));
    store.dispatch(toggleFreezePiece('piece-2'));
    expect(store.getState().simulation.frozenPieceIds).toEqual(['piece-1', 'piece-2']);
  });

  it('unfreezeAllPieces clears all frozen pieces', () => {
    const store = createStore();
    store.dispatch(toggleFreezePiece('piece-1'));
    store.dispatch(toggleFreezePiece('piece-2'));
    store.dispatch(unfreezeAllPieces());
    expect(store.getState().simulation.frozenPieceIds).toEqual([]);
  });
});
