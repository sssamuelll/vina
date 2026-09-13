// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it, vi } from 'vitest';
import projectReducer, { loadProject, setLayerLocked, updatePiece } from '../../../store/projectSlice';
import copilotUIReducer from '../../../store/copilotUISlice';
import { undoMiddleware, getUndoLength } from '../../../store/undoMiddleware';
import type { PatternPiece } from '../../../types/types';
import { applyNodeMove, type NodeRef } from '../nodeEditorUtils';
import {
  convertSegmentToSpline,
  isSplineManaged,
  resmoothAfterMove,
  toManualBezier,
} from '../splineSegment';
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

function splinePiece(): PatternPiece {
  const base = squarePiece();
  const straight = convertSegmentToSpline(base.outline, 1, 4);
  const moved = applyNodeMove(straight, 2, 'anchor', { x: 50, y: 60 });
  return { ...base, outline: resmoothAfterMove(straight, moved, 2) };
}

function setup(piece: PatternPiece | PatternPiece[]) {
  const store = configureStore({
    reducer: { project: projectReducer, copilotUI: copilotUIReducer },
    middleware: (getDefault) => getDefault({ serializableCheck: false })
      .concat(undoMiddleware),
  });
  const base = store.getState().project;
  const pieces = Array.isArray(piece) ? piece : [piece];
  store.dispatch(loadProject({
    ...base, id: 'test', name: 'Test', pieces, seams: [], fabrics: [],
    createdAt: 0, updatedAt: 0,
  }));
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
  const hook = renderHook(() => useEditCurve(1, { x: 0, y: 0 }), { wrapper });
  return { store, hook };
}

function pointer(x: number, y: number, pieceId: string | null = null): React.MouseEvent<SVGSVGElement> {
  return {
    button: 0,
    clientX: x,
    clientY: y,
    target: {
      closest: () => (pieceId ? { getAttribute: () => pieceId } : null),
    },
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

  it('keeps the move cursor while the fused first drag is armed', () => {
    const { hook } = setup(squarePiece());
    act(() => {
      expect(hook.result.current.enterEditActuando('p', pointer(100, 0))).toBe(true);
    });

    expect(hook.result.current.getCursor()).toBe('move');

    act(() => { hook.result.current.handleMouseUp(); });
    expect(hook.result.current.getCursor()).toBe('move');

    act(() => { hook.result.current.handleMouseMove(pointer(300, 300)); });
    expect(hook.result.current.getCursor()).toBe('default');
  });

  it('does not promise or start editing through a locked layer', () => {
    const lockedLayerPiece = { ...squarePiece(), layer: 3 } as PatternPiece;
    const { hook, store } = setup(lockedLayerPiece);

    act(() => { hook.result.current.handleMouseMove(pointer(100, 0)); });
    expect(hook.result.current.hoveredPieceId).toBe('p');

    act(() => { store.dispatch(setLayerLocked({ layer: 3, locked: true })); });
    expect(hook.result.current.hoveredPieceId).toBeNull();
    expect(hook.result.current.hoveredNode).toBeNull();

    act(() => {
      expect(hook.result.current.enterEditActuando('p', pointer(100, 0))).toBe(true);
    });
    expect(hook.result.current.isEditing).toBe(false);
  });

  it('keeps the piece overlay while crossing from an anchor toward its handle', () => {
    const { hook } = setup(squarePiece());

    act(() => { hook.result.current.handleMouseMove(pointer(100, 0, 'p')); });
    expect(hook.result.current.hoveredNode).not.toBeNull();

    act(() => { hook.result.current.handleMouseMove(pointer(50, 50, 'p')); });
    expect(hook.result.current.hoveredPieceId).toBe('p');
    expect(hook.result.current.hoveredNode).toBeNull();
    expect(hook.result.current.nodes).not.toHaveLength(0);
  });

  it('resolves equal zOrder in the same topmost order as the renderer', () => {
    const below = squarePiece();
    const above = { ...squarePiece(), id: 'p2', name: 'P2' } as PatternPiece;
    const { hook } = setup([below, above]);

    act(() => { hook.result.current.handleMouseMove(pointer(100, 0)); });
    expect(hook.result.current.hoveredPieceId).toBe('p2');
  });

  it('does not see an anchor through a locked DOM-owned piece', () => {
    const lower = squarePiece();
    const upper = {
      ...squarePiece(),
      id: 'p2',
      name: 'Upper',
      locked: true,
      outline: [
        { type: 'M', values: [-50, -50] },
        { type: 'L', values: [150, -50] },
        { type: 'L', values: [150, 150] },
        { type: 'L', values: [-50, 150] },
        { type: 'Z', values: [] },
      ],
    } as PatternPiece;
    const { hook } = setup([lower, upper]);

    act(() => { hook.result.current.handleMouseMove(pointer(0, 0, 'p2')); });

    expect(hook.result.current.hoveredPieceId).toBeNull();
    expect(hook.result.current.hoveredNode).toBeNull();
  });

  it('clears the pre-entry overlay when the pointer leaves the canvas', () => {
    const { hook } = setup(squarePiece());

    act(() => { hook.result.current.handleMouseMove(pointer(100, 0)); });
    expect(hook.result.current.hoveredPieceId).toBe('p');

    act(() => { hook.result.current.limpiarHover(); });
    expect(hook.result.current.hoveredPieceId).toBeNull();
    expect(hook.result.current.hoveredNode).toBeNull();
    expect(hook.result.current.nodes).toHaveLength(0);
  });

  it('una curva por puntos no deja hit-testear sus handles derivados', () => {
    const piece = splinePiece();
    const hiddenHandle = piece.outline[2].values.slice(0, 2);
    const { hook } = setup(piece);
    act(() => { hook.result.current.enterEdit('p'); });
    expect(hook.result.current.nodes.some(node => node.cp1 || node.cp2)).toBe(false);

    let handled = true;
    act(() => {
      handled = hook.result.current.handleMouseDown(pointer(hiddenHandle[0], hiddenHandle[1]));
    });
    expect(handled).toBe(false);
    expect(hook.result.current.selectedNode).toBeNull();
  });

  it('arrastrar un ancla re-suaviza la cadena gestionada', () => {
    const { store, hook } = setup(splinePiece());
    const anchor = store.getState().project.pieces[0].outline[2].values.slice(4, 6);
    act(() => { hook.result.current.enterEdit('p'); });
    act(() => { hook.result.current.handleMouseDown(pointer(anchor[0], anchor[1])); });
    act(() => { hook.result.current.handleMouseMove(pointer(anchor[0], anchor[1] + 30)); });
    act(() => { hook.result.current.handleMouseUp(); });

    const outline = store.getState().project.pieces[0].outline;
    expect(isSplineManaged(outline, { start: 1, end: 4 })).toBe(true);
  });

  it('al convertir y deshacer, el refresh vuelve a ocultar los handles', () => {
    const { store, hook } = setup(splinePiece());
    act(() => { hook.result.current.enterEdit('p'); });
    expect(hook.result.current.nodes.some(node => node.cp1 || node.cp2)).toBe(false);

    const current = store.getState().project.pieces[0];
    act(() => {
      store.dispatch(updatePiece({ ...current, outline: toManualBezier(current.outline, 2)! }));
    });
    expect(hook.result.current.nodes.some(node => node.cp1 || node.cp2)).toBe(true);

    act(() => { store.dispatch({ type: 'editor/undo' }); });
    expect(hook.result.current.nodes.some(node => node.cp1 || node.cp2)).toBe(false);
  });
});
