// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider, useSelector } from 'react-redux';
import { afterEach, describe, expect, it } from 'vitest';
import projectReducer, { restoreState } from '../../../store/projectSlice';
import type { PatternPiece } from '../../../types/types';
import { rotatePoint } from '../../../utils/geometry/transform';
import NodeEditorOverlay from '../renderers/overlays/NodeEditorOverlay';
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

function InteractiveEditor() {
  const editor = useEditCurve(1, { x: 0, y: 0 });
  const pieces = useSelector((state: { project: { pieces: PatternPiece[] } }) => state.project.pieces);

  return (
    <>
      <button type="button" onClick={() => editor.enterEdit('p')}>Edit</button>
      <svg
        data-testid="editor"
        onMouseDown={editor.handleMouseDown}
        onMouseMove={editor.handleMouseMove}
        onMouseUp={editor.handleMouseUp}
      >
        {editor.editingPieceId && (
          <NodeEditorOverlay
            zoom2D={1}
            units="mm"
            pieces={pieces}
            nodeEditorEditingPieceId={editor.editingPieceId}
            nodeEditorNodes={editor.nodes}
            selectedNode={editor.selectedNode}
            hoveredNode={editor.hoveredNode}
          />
        )}
      </svg>
    </>
  );
}

function renderInteractive(piece: PatternPiece) {
  const store = configureStore({ reducer: { project: projectReducer } });
  store.dispatch(restoreState({ ...store.getState().project, pieces: [piece] }));
  const view = render(
    <Provider store={store}>
      <InteractiveEditor />
    </Provider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
  return { store, view, svg: screen.getByTestId('editor') };
}

function renderedPoint(local: { x: number; y: number }): { x: number; y: number } {
  const group = document.querySelector<SVGGElement>('g.node-editor');
  expect(group).not.toBeNull();
  const transform = group!.getAttribute('transform') ?? '';
  const match = transform.match(
    /^translate\(([-\d.]+), ([-\d.]+)\)(?: rotate\(([-\d.]+), ([-\d.]+), ([-\d.]+)\))?$/,
  );
  expect(match).not.toBeNull();
  const [, tx, ty, angle, cx, cy] = match!;
  const rotated = angle
    ? rotatePoint(
        local,
        { x: Number(cx), y: Number(cy) },
        Number(angle) * Math.PI / 180,
      )
    : local;
  return { x: rotated.x + Number(tx), y: rotated.y + Number(ty) };
}

function renderedAnchorPosition(commandIndex: number) {
  const glyph = document.querySelector<SVGGElement>(
    `[data-command-index="${commandIndex}"] [data-anchor-role]`,
  );
  expect(glyph).not.toBeNull();
  const match = (glyph!.getAttribute('transform') ?? '').match(
    /^translate\(([-\d.]+) ([-\d.]+)\)$/,
  );
  expect(match).not.toBeNull();
  return renderedPoint({ x: Number(match![1]), y: Number(match![2]) });
}

function renderedHandlePosition(commandIndex: number) {
  const handle = document.querySelector<SVGRectElement>(
    `[data-command-index="${commandIndex}"] .node-editor__control-handle`,
  );
  expect(handle).not.toBeNull();
  const x = Number(handle!.getAttribute('x')) + Number(handle!.getAttribute('width')) / 2;
  const y = Number(handle!.getAttribute('y')) + Number(handle!.getAttribute('height')) / 2;
  return renderedPoint({ x, y });
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

  it('keeps a rotated anchor glyph under the cursor when its drag changes the outline bbox', () => {
    const { svg } = renderInteractive(squarePiece());

    fireEvent.mouseDown(svg, { button: 0, clientX: 210, clientY: 220 });
    fireEvent.mouseMove(svg, { clientX: 220, clientY: 220 });

    const rendered = renderedAnchorPosition(1);
    expect(rendered.x).toBeCloseTo(220);
    expect(rendered.y).toBeCloseTo(220);
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

  it('keeps a rotated Bezier handle under the cursor when its drag changes the outline bbox', () => {
    const { svg } = renderInteractive(curvedPiece());

    fireEvent.mouseDown(svg, { button: 0, clientX: 110, clientY: 120 });
    fireEvent.mouseMove(svg, { clientX: 120, clientY: 120 });

    const rendered = renderedHandlePosition(1);
    expect(rendered.x).toBeCloseTo(120);
    expect(rendered.y).toBeCloseTo(120);
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
