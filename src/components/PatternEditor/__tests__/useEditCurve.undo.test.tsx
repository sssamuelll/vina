// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it, vi } from 'vitest';
import projectReducer, { loadProject } from '../../../store/projectSlice';
import copilotUIReducer from '../../../store/copilotUISlice';
import { undoMiddleware, getUndoLength } from '../../../store/undoMiddleware';
import type { PatternPiece } from '../../../types/types';
import type { NodeRef } from '../nodeEditorUtils';
import { useEditCurve } from '../useEditCurve';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function squarePiece(): PatternPiece {
  return {
    id: 'p', name: 'P', position: { x: 0, y: 0 }, rotation: 0, mirrored: false,
    seamAllowance: 0, active: true, createdAt: 0, updatedAt: 0, internals: [],
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 100] },
      { type: 'L', values: [0, 100] },
      { type: 'Z', values: [] },
    ],
  } as PatternPiece;
}

function setup(piece: PatternPiece) {
  const store = configureStore({
    reducer: { project: projectReducer, copilotUI: copilotUIReducer },
    middleware: (getDefault) => getDefault({ serializableCheck: false })
      .concat(undoMiddleware),
  });
  const base = store.getState().project;
  store.dispatch(loadProject({
    ...base, id: 'test', name: 'Test', pieces: [piece], seams: [], fabrics: [],
    createdAt: 0, updatedAt: 0,
  }));
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
  const hook = renderHook(() => useEditCurve(1, { x: 0, y: 0 }), { wrapper });
  return { store, hook };
}

function pointer(x: number, y: number): React.MouseEvent<SVGSVGElement> {
  return {
    button: 0,
    clientX: x,
    clientY: y,
    currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0 }) },
  } as unknown as React.MouseEvent<SVGSVGElement>;
}

describe('useEditCurve resync y undo por gesto', () => {
  it('reattaches the overlay nodes to the reverted outline', () => {
    const { store, hook } = setup(squarePiece());
    act(() => { hook.result.current.enterEdit('p'); });
    act(() => { hook.result.current.handleMouseDown(pointer(100, 0)); });
    act(() => { hook.result.current.handleMouseMove(pointer(140, 0)); });
    act(() => { hook.result.current.handleMouseUp(); });

    expect(store.getState().project.pieces[0].outline[1].values).toEqual([140, 0]);

    act(() => { store.dispatch({ type: 'editor/undo' }); });

    expect(store.getState().project.pieces[0].outline[1].values).toEqual([100, 0]);
    expect(hook.result.current.nodes[1].position).toEqual({ x: 100, y: 0 });
  });

  it('turns a drag longer than 500ms into a single undo entry', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const { store, hook } = setup(squarePiece());
    const original = structuredClone(store.getState().project.pieces[0].outline);
    act(() => { hook.result.current.enterEdit('p'); });
    act(() => { hook.result.current.handleMouseDown(pointer(100, 0)); });
    act(() => { hook.result.current.handleMouseMove(pointer(110, 0)); });
    act(() => { vi.advanceTimersByTime(750); });
    act(() => { hook.result.current.handleMouseMove(pointer(120, 0)); });
    act(() => { hook.result.current.handleMouseUp(); });

    act(() => { store.dispatch({ type: 'editor/undo' }); });
    expect(store.getState().project.pieces[0].outline).toEqual(original);
  });

  it('does not add history for a click without movement', () => {
    const { hook } = setup(squarePiece());
    act(() => { hook.result.current.enterEdit('p'); });
    const before = getUndoLength();
    act(() => { hook.result.current.handleMouseDown(pointer(100, 0)); });
    act(() => { hook.result.current.handleMouseUp(); });
    expect(getUndoLength()).toBe(before);
  });

  it('keeps the node passed to enterEdit selected', () => {
    const { hook } = setup(squarePiece());
    const ref: NodeRef = { pieceId: 'p', commandIndex: 1, pointType: 'anchor' };
    act(() => { hook.result.current.enterEdit('p', ref); });
    expect(hook.result.current.selectedNode).toEqual(ref);
  });
});
