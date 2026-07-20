import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import editorReducer from '../editorSlice';
import projectReducer, { loadProject, updatePiece } from '../projectSlice';
import simulationReducer, { startSimulation } from '../simulationSlice';
import {
  beginUndoBatch,
  endUndoBatch,
  getUndoLength,
  registerSimulationCallbacks,
  undoMiddleware,
  withUndoBatchToken,
} from '../undoMiddleware';
import type { PatternPiece } from '../../types/types';

let unregisterSimulationCallbacks: (() => void) | null = null;

afterEach(() => {
  unregisterSimulationCallbacks?.();
  unregisterSimulationCallbacks = null;
  vi.useRealTimers();
});

function squarePiece(): PatternPiece {
  return {
    id: 'p', name: 'Square',
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 100] },
      { type: 'L', values: [0, 100] },
      { type: 'Z', values: [] },
    ],
    internals: [], position: { x: 0, y: 0 }, rotation: 0,
    mirrored: false, seamAllowance: 0, active: true,
    createdAt: 0, updatedAt: 0,
  };
}

function setup() {
  const store = configureStore({
    reducer: {
      project: projectReducer,
      editor: editorReducer,
      simulation: simulationReducer,
    },
    middleware: (getDefault) => getDefault({ serializableCheck: false })
      .concat(undoMiddleware),
  });
  const base = store.getState().project;
  store.dispatch(loadProject({
    ...base,
    id: 'test',
    name: 'Test',
    pieces: [squarePiece()],
    seams: [],
    fabrics: [],
    createdAt: 0,
    updatedAt: 0,
  }));
  return store;
}

describe('identified undo batch ownership', () => {
  it('snapshots active simulation on the first owned mutation despite recent coalescing', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const store = setup();
    const save = vi.fn();
    unregisterSimulationCallbacks = registerSimulationCallbacks(save, vi.fn());
    store.dispatch(startSimulation());

    store.dispatch(updatePiece({ ...store.getState().project.pieces[0], name: 'Before gesture' }));
    expect(save).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(100);

    const token = beginUndoBatch(store.dispatch, 'Gesture');
    store.dispatch(withUndoBatchToken(
      updatePiece({ ...store.getState().project.pieces[0], name: 'First owned' }),
      token,
    ));
    expect(save).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(750);
    store.dispatch(withUndoBatchToken(
      updatePiece({ ...store.getState().project.pieces[0], name: 'Second owned' }),
      token,
    ));
    expect(save).toHaveBeenCalledTimes(2);
    endUndoBatch(store.dispatch, token);
  });

  it('ignores a late end for A after undo invalidates A and B has started', () => {
    const store = setup();
    const tokenA = beginUndoBatch(store.dispatch, 'A');
    store.dispatch(withUndoBatchToken(
      updatePiece({ ...store.getState().project.pieces[0], name: 'A changed' }),
      tokenA,
    ));
    store.dispatch({ type: 'editor/undo' });
    expect(store.getState().project.pieces[0].name).toBe('Square');

    const historyBeforeB = getUndoLength();
    const tokenB = beginUndoBatch(store.dispatch, 'B');
    store.dispatch(withUndoBatchToken(
      updatePiece({ ...store.getState().project.pieces[0], name: 'B first' }),
      tokenB,
    ));
    endUndoBatch(store.dispatch, tokenA);
    store.dispatch(withUndoBatchToken(
      updatePiece({ ...store.getState().project.pieces[0], name: 'B second' }),
      tokenB,
    ));
    endUndoBatch(store.dispatch, tokenB);

    expect(getUndoLength()).toBe(historyBeforeB + 1);
    store.dispatch({ type: 'editor/undo' });
    expect(store.getState().project.pieces[0].name).toBe('Square');
  });

  it('finalizes a tokenized gesture before an unowned project action', () => {
    const store = setup();
    const historyBefore = getUndoLength();
    const token = beginUndoBatch(store.dispatch, 'Gesture');
    store.dispatch(withUndoBatchToken(
      updatePiece({ ...store.getState().project.pieces[0], name: 'Owned' }),
      token,
    ));
    store.dispatch(updatePiece({ ...store.getState().project.pieces[0], name: 'Foreign' }));
    endUndoBatch(store.dispatch, token);

    expect(getUndoLength()).toBe(historyBefore + 2);
    store.dispatch({ type: 'editor/undo' });
    expect(store.getState().project.pieces[0].name).toBe('Owned');
    store.dispatch({ type: 'editor/undo' });
    expect(store.getState().project.pieces[0].name).toBe('Square');
  });
});
