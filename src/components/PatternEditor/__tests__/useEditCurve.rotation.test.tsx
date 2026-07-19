// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it } from 'vitest';
import projectReducer, { restoreState } from '../../../store/projectSlice';
import type { PatternPiece } from '../../../types/types';
import { useEditCurve } from '../useEditCurve';

afterEach(cleanup);

function squarePiece(rotation = 90): PatternPiece {
  return {
    id: 'p',
    name: 'P',
    position: { x: 10, y: 20 },
    rotation,
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [200, 0] },
      { type: 'L', values: [200, 200] },
      { type: 'L', values: [0, 200] },
      { type: 'Z', values: [] },
    ],
    internals: [],
    mirrored: false,
    seamAllowance: 0,
    active: true,
  } as unknown as PatternPiece;
}

function curvedPiece(): PatternPiece {
  return {
    ...squarePiece(90),
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'C', values: [0, 0, 100, 0, 100, 100] },
      { type: 'Z', values: [] },
    ],
  } as PatternPiece;
}

function setup(piece: PatternPiece) {
  const store = configureStore({ reducer: { project: projectReducer } });
  store.dispatch(restoreState({ ...store.getState().project, pieces: [piece] }));
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
  const hook = renderHook(() => useEditCurve(1, { x: 0, y: 0 }), { wrapper });
  return { store, hook };
}

function pointer(x: number, y: number) {
  return {
    button: 0,
    clientX: x,
    clientY: y,
    currentTarget: {
      getBoundingClientRect: () => ({ left: 0, top: 0 }),
    },
  } as unknown as React.MouseEvent<SVGSVGElement>;
}

function storedOutline(store: ReturnType<typeof setup>['store']) {
  return store.getState().project.pieces[0].outline;
}

describe('useEditCurve rotation-aware interaction', () => {
  it('hovers the anchor at its rotated visible position', () => {
    const { hook } = setup(squarePiece());
    act(() => hook.result.current.enterEdit('p'));

    // Local (200,0) rotates around (100,100) to pattern (210,220).
    act(() => { hook.result.current.handleMouseMove(pointer(210, 220)); });

    expect(hook.result.current.hoveredNode?.commandIndex).toBe(1);
  });

  it('selects the anchor at its rotated visible position without exiting edit', () => {
    const { hook } = setup(squarePiece());
    act(() => hook.result.current.enterEdit('p'));

    let handled = false;
    act(() => { handled = hook.result.current.handleMouseDown(pointer(210, 220)); });

    expect(handled).toBe(true);
    expect(hook.result.current.isEditing).toBe(true);
    expect(hook.result.current.selectedNode?.commandIndex).toBe(1);
  });

  it('rotates an anchor drag delta back into piece-local space', () => {
    const { store, hook } = setup(squarePiece());
    act(() => hook.result.current.enterEdit('p'));
    act(() => { hook.result.current.handleMouseDown(pointer(210, 220)); });
    act(() => { hook.result.current.handleMouseMove(pointer(220, 220)); });
    act(() => hook.result.current.handleMouseUp());

    expect(storedOutline(store)[1].values[0]).toBeCloseTo(200);
    expect(storedOutline(store)[1].values[1]).toBeCloseTo(-10);
  });

  it('hit-tests and drags a rotated Bezier handle in piece-local space', () => {
    const { store, hook } = setup(curvedPiece());
    act(() => hook.result.current.enterEdit('p'));

    // Incoming handle local (100,0) rotates around (50,50) to (110,120).
    act(() => { hook.result.current.handleMouseDown(pointer(110, 120)); });
    expect(hook.result.current.selectedNode?.pointType).toBe('cp2');

    act(() => { hook.result.current.handleMouseMove(pointer(120, 120)); });
    act(() => hook.result.current.handleMouseUp());
    expect(storedOutline(store)[1].values[2]).toBeCloseTo(100);
    expect(storedOutline(store)[1].values[3]).toBeCloseTo(-10);
  });

  it('preserves unrotated hit-testing and drag direction', () => {
    const unrotated = {
      ...squarePiece(0),
      position: { x: 0, y: 0 },
    } as PatternPiece;
    const { store, hook } = setup(unrotated);
    act(() => hook.result.current.enterEdit('p'));
    act(() => { hook.result.current.handleMouseDown(pointer(200, 0)); });
    act(() => { hook.result.current.handleMouseMove(pointer(210, 0)); });
    act(() => hook.result.current.handleMouseUp());

    expect(storedOutline(store)[1].values).toEqual([210, 0]);
  });
});
