// @vitest-environment jsdom
/**
 * useSeamAllowanceTool — left-click disambiguation. With the seamAllowance tool
 * active, left-click selects a vertex (corner editing) or an edge (per-edge
 * width), or applies the editor default to the whole piece on a body click.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { renderHook, cleanup, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import editorReducer, { setDefaultSAWidth } from '../../../store/editorSlice';
import { useSeamAllowanceTool } from '../useSeamAllowanceTool';
import type { PatternPiece, SemanticEdge } from '../../../types/types';

afterEach(cleanup);

const square = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [200, 0] },
  { type: 'L', values: [200, 200] },
  { type: 'L', values: [0, 200] },
  { type: 'Z', values: [] },
] as PatternPiece['outline'];

const edges: SemanticEdge[] = [
  { id: 'p:top', name: 'top', segmentRange: [1, 2], edgeType: 'seam' },
  { id: 'p:right', name: 'right', segmentRange: [2, 3], edgeType: 'seam' },
  { id: 'p:bottom', name: 'bottom', segmentRange: [3, 4], edgeType: 'hem' },
];

function piece(seamAllowance = 0): PatternPiece {
  return {
    id: 'p', name: 'Square', outline: square, position: { x: 0, y: 0 },
    rotation: 0, mirrored: false, active: true, seamAllowance, internals: [], edges,
  } as unknown as PatternPiece;
}

// A second square offset to the right (bbox 300..500), id 'q' — for drag-to-all.
function pieceQ(seamAllowance = 0): PatternPiece {
  return {
    id: 'q', name: 'Square 2', outline: square, position: { x: 300, y: 0 },
    rotation: 0, mirrored: false, active: true, seamAllowance, internals: [], edges: [],
  } as unknown as PatternPiece;
}

function makeStore() {
  return configureStore({ reducer: { editor: editorReducer } });
}

function setup(pieces: PatternPiece[] = [piece()]) {
  const store = makeStore();
  const onApply = vi.fn();
  const onApplyAll = vi.fn();
  const onSelectEdge = vi.fn();
  const onSelectVertex = vi.fn();
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
  const hook = renderHook(
    () => useSeamAllowanceTool(pieces, 1, { x: 0, y: 0 }, { onApply, onApplyAll, onSelectEdge, onSelectVertex }),
    { wrapper },
  );
  return { store, onApply, onApplyAll, onSelectEdge, onSelectVertex, hook };
}

// zoom=1, pan=0, rect at origin → pattern point === client point.
function clickAt(x: number, y: number, button = 0, shiftKey = false) {
  return {
    button,
    shiftKey,
    clientX: x,
    clientY: y,
    currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0 }) },
  } as unknown as React.MouseEvent<SVGSVGElement>;
}

describe('useSeamAllowanceTool left-click', () => {
  it('clicking near a corner selects that vertex', () => {
    const { onSelectVertex, onApply, hook } = setup();
    act(() => hook.result.current.handleMouseDown(clickAt(2, 2)));
    expect(onSelectVertex).toHaveBeenCalledWith('p', 0);
    expect(onApply).not.toHaveBeenCalled();
  });

  it('selecting a vertex does not arm a drag — a later mouseUp is a no-op', () => {
    const { onSelectVertex, onApply, onApplyAll, hook } = setup();
    act(() => hook.result.current.handleMouseDown(clickAt(2, 2)));
    act(() => hook.result.current.handleMouseUp());
    expect(onSelectVertex).toHaveBeenCalledWith('p', 0);
    expect(onApply).not.toHaveBeenCalled();
    expect(onApplyAll).not.toHaveBeenCalled();
  });

  it('clicking near an edge midpoint selects that edge (non-additive)', () => {
    const { onSelectEdge, onApply, hook } = setup();
    act(() => hook.result.current.handleMouseDown(clickAt(100, 2)));
    expect(onSelectEdge).toHaveBeenCalledWith('p', 'p:top', false);
    expect(onApply).not.toHaveBeenCalled();
  });

  it('Shift+click on an edge selects it additively', () => {
    const { onSelectEdge, hook } = setup();
    act(() => hook.result.current.handleMouseDown(clickAt(100, 2, 0, true)));
    expect(onSelectEdge).toHaveBeenCalledWith('p', 'p:top', true);
  });

  it('press+release on the piece body (no drag) applies the default width to the whole piece', () => {
    const { onApply, onApplyAll, onSelectEdge, hook } = setup([piece(8)]);
    act(() => hook.result.current.handleMouseDown(clickAt(100, 100)));
    act(() => hook.result.current.handleMouseUp());
    expect(onApply).toHaveBeenCalledWith('p', 9.5, 8); // default 9.5, prev 8
    expect(onApplyAll).not.toHaveBeenCalled();
    expect(onSelectEdge).not.toHaveBeenCalled();
  });

  it('applies the current editor default, not a frozen value', () => {
    const { store, onApply, hook } = setup();
    act(() => store.dispatch(setDefaultSAWidth(25)));
    act(() => hook.result.current.handleMouseDown(clickAt(100, 100)));
    act(() => hook.result.current.handleMouseUp());
    expect(onApply).toHaveBeenCalledWith('p', 25, 0);
  });

  it('dragging across pieces applies the default to all touched pieces (one bulk call)', () => {
    const { onApply, onApplyAll, hook } = setup([piece(0), pieceQ(0)]);
    // Press on piece p body, drag right across to piece q body, release.
    act(() => hook.result.current.handleMouseDown(clickAt(100, 100)));
    act(() => hook.result.current.handleMouseMove(clickAt(400, 100)));
    act(() => hook.result.current.handleMouseUp());
    expect(onApplyAll).toHaveBeenCalledTimes(1);
    const [ids, width] = onApplyAll.mock.calls[0];
    expect(new Set(ids)).toEqual(new Set(['p', 'q']));
    expect(width).toBe(9.5);
    expect(onApply).not.toHaveBeenCalled(); // a real drag is not a single-click
  });

  it('a sub-threshold jitter on the body is still a single click, not a drag', () => {
    const { onApply, onApplyAll, hook } = setup([piece(0)]);
    act(() => hook.result.current.handleMouseDown(clickAt(100, 100)));
    act(() => hook.result.current.handleMouseMove(clickAt(101, 101))); // <4px (SM_CXDRAG de Windows)
    act(() => hook.result.current.handleMouseUp());
    expect(onApply).toHaveBeenCalledWith('p', 9.5, 0);
    expect(onApplyAll).not.toHaveBeenCalled();
  });

  it('clicking empty canvas does nothing', () => {
    const { onApply, onSelectEdge, onSelectVertex, hook } = setup();
    act(() => hook.result.current.handleMouseDown(clickAt(999, 999)));
    expect(onApply).not.toHaveBeenCalled();
    expect(onSelectEdge).not.toHaveBeenCalled();
    expect(onSelectVertex).not.toHaveBeenCalled();
  });

  it('ignores non-left buttons', () => {
    const { onApply, onSelectEdge, onSelectVertex, hook } = setup();
    act(() => hook.result.current.handleMouseDown(clickAt(100, 100, 2)));
    expect(onApply).not.toHaveBeenCalled();
    expect(onSelectEdge).not.toHaveBeenCalled();
    expect(onSelectVertex).not.toHaveBeenCalled();
  });

  it('exposes the effective width for the HintText', () => {
    const { store, hook } = setup();
    expect(hook.result.current.widthMm).toBe(9.5);
    act(() => store.dispatch(setDefaultSAWidth(15)));
    expect(hook.result.current.widthMm).toBe(15);
  });
});
