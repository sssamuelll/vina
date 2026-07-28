// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it } from 'vitest';
import projectReducer, { restoreState } from '../../../store/projectSlice';
import type { InternalLine, PatternPiece } from '../../../types/types';
import { computeNotchAnchor } from '../../../utils/notchAnchor';
import { DEFAULT_NOTCH_OPTIONS, generateNotchPath } from '../../../utils/notches';
import { useEditCurve } from '../useEditCurve';

afterEach(cleanup);

// Nota de María #171. The "Editar patrón" tool re-anchored notches from the
// start; this node editor — the one you reach from the select tool — did not,
// so whether a piquete stayed on its edge depended on which surface you used.

const OUTLINE = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [200, 0] },
  { type: 'L', values: [200, 200] },
  { type: 'L', values: [0, 200] },
  { type: 'Z', values: [] },
] as PatternPiece['outline'];

/** Square piece with one notch at (100,0), anchored 100 from the (0,0) corner. */
function notchedPiece(): PatternPiece {
  const notch: InternalLine = {
    id: 'n1',
    type: 'notch',
    path: generateNotchPath({ x: 100, y: 0 }, { x: 0, y: 1 }, DEFAULT_NOTCH_OPTIONS),
    notchOptions: DEFAULT_NOTCH_OPTIONS,
    notchAnchor: computeNotchAnchor(OUTLINE, { x: 100, y: 0 })!,
  };
  return {
    id: 'p', name: 'P', position: { x: 0, y: 0 }, rotation: 0,
    outline: OUTLINE, internals: [notch],
    mirrored: false, seamAllowance: 0, active: true,
  } as unknown as PatternPiece;
}

function setup() {
  const store = configureStore({ reducer: { project: projectReducer } });
  store.dispatch(restoreState({ ...store.getState().project, pieces: [notchedPiece()] }));
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
  const hook = renderHook(() => useEditCurve(1, { x: 0, y: 0 }), { wrapper });
  return { store, hook };
}

function pointer(x: number, y: number) {
  return {
    button: 0, clientX: x, clientY: y,
    currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0 }) },
  } as unknown as React.MouseEvent<SVGSVGElement>;
}

const storedNotch = (store: ReturnType<typeof setup>['store']) =>
  store.getState().project.pieces[0].internals[0];

describe('useEditCurve re-anchors notches (nota de María #171)', () => {
  it('moves the notch along the edge when a plain node is dragged', () => {
    const { store, hook } = setup();
    const before = JSON.stringify(storedNotch(store).path);
    act(() => hook.result.current.enterEdit('p'));
    act(() => { hook.result.current.handleMouseDown(pointer(200, 0)); });
    act(() => { hook.result.current.handleMouseMove(pointer(200, -50)); });
    act(() => hook.result.current.handleMouseUp());

    expect(store.getState().project.pieces[0].outline[1].values).toEqual([200, -50]);
    expect(JSON.stringify(storedNotch(store).path)).not.toEqual(before);
  });

  it('follows the notch when the dragged node IS its reference corner', () => {
    const { store, hook } = setup();
    act(() => hook.result.current.enterEdit('p'));
    act(() => { hook.result.current.handleMouseDown(pointer(0, 0)); });
    act(() => { hook.result.current.handleMouseMove(pointer(-40, -40)); });
    act(() => hook.result.current.handleMouseUp());

    const notch = storedNotch(store);
    expect(notch.notchAnchor!.refPoint).toEqual({ x: -40, y: -40 });
    const edgeLen = Math.hypot(240, 40);
    expect(notch.path[0].values[0]).toBeCloseTo(-40 + (100 / edgeLen) * 240);
    expect(notch.path[0].values[1]).toBeCloseTo(-40 + (100 / edgeLen) * 40);
  });

  it('leaves a notch without an anchor exactly where it was drawn', () => {
    const { store, hook } = setup();
    const piece = store.getState().project.pieces[0];
    const anchorless = { ...piece.internals[0], notchAnchor: undefined };
    act(() => {
      store.dispatch(restoreState({
        ...store.getState().project,
        pieces: [{ ...piece, internals: [anchorless] }],
      }));
    });
    const before = JSON.stringify(storedNotch(store).path);

    act(() => hook.result.current.enterEdit('p'));
    act(() => { hook.result.current.handleMouseDown(pointer(200, 0)); });
    act(() => { hook.result.current.handleMouseMove(pointer(200, -50)); });
    act(() => hook.result.current.handleMouseUp());

    expect(JSON.stringify(storedNotch(store).path)).toEqual(before);
  });
});
