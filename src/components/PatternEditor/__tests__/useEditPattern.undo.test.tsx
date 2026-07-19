// @vitest-environment jsdom
import React, { forwardRef, useImperativeHandle } from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { Provider, useSelector } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import projectReducer, { loadProject, updatePiece } from '../../../store/projectSlice';
import { canRedo, getUndoLength, undoMiddleware } from '../../../store/undoMiddleware';
import type { PatternPiece, Point2D } from '../../../types/types';
import { importDXFContent } from '../../../utils/dxf';
import { classifyEditableAnchors } from '../anchorRoles';
import { extractNodes, getAnchor } from '../nodeEditorUtils';
import { pieceLocalToPattern, useEditPattern } from '../useEditPattern';
import EditPatternOverlay from '../renderers/overlays/EditPatternOverlay';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

type EditorApi = ReturnType<typeof useEditPattern>;
type TestState = { project: ReturnType<typeof projectReducer> };

const Harness = forwardRef<EditorApi>(function Harness(_, ref) {
  const editor = useEditPattern(1, { x: 0, y: 0 });
  const pieces = useSelector((state: TestState) => state.project.pieces);
  useImperativeHandle(ref, () => editor, [editor]);
  return (
    <svg>
      {editor.isEditing && editor.editingPieceId && (
        <EditPatternOverlay
          zoom2D={1} pieces={pieces} editingPieceId={editor.editingPieceId}
          nodes={editor.nodes} selectedNodes={editor.selectedNodes}
          selectedSegments={editor.selectedSegments} hoveredNode={editor.hoveredNode}
          hoveredSegment={editor.hoveredSegment} addPointPreview={editor.addPointPreview}
          marquee={editor.marquee}
        />
      )}
    </svg>
  );
});

function squarePiece(): PatternPiece {
  return {
    id: 'p', name: 'Square',
    outline: [
      { type: 'M', values: [0, 0] }, { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 100] }, { type: 'L', values: [0, 100] },
      { type: 'Z', values: [] },
    ],
    internals: [], position: { x: 0, y: 0 }, rotation: 0,
    mirrored: false, seamAllowance: 0, active: true,
    createdAt: 0, updatedAt: 0,
  };
}

function setup(piece: PatternPiece) {
  const store = configureStore({
    reducer: { project: projectReducer },
    middleware: (getDefault) => getDefault({ serializableCheck: false })
      .concat(undoMiddleware),
  });
  const base = store.getState().project;
  store.dispatch(loadProject({
    ...base, id: 'test', name: 'Test', pieces: [piece], seams: [], fabrics: [],
    createdAt: 0, updatedAt: 0,
  }));
  const ref = React.createRef<EditorApi>();
  const view = render(<Provider store={store}><Harness ref={ref} /></Provider>);
  act(() => ref.current!.enterEdit(piece.id));
  return { store, ref, view };
}

function mouseAt(point: Point2D): React.MouseEvent<SVGSVGElement> {
  return {
    button: 0, shiftKey: false, clientX: point.x, clientY: point.y,
    currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0 }) },
  } as unknown as React.MouseEvent<SVGSVGElement>;
}

function roleList(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('[data-anchor-role]'))
    .map((node) => node.getAttribute('data-anchor-role')!);
}

function maxCoincidentMultiplicity(outline: PatternPiece['outline']): number {
  const counts = new Map<string, number>();
  for (const command of outline) {
    const anchor = getAnchor(command);
    if (!anchor) continue;
    const key = `${anchor.x.toFixed(6)}:${anchor.y.toFixed(6)}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Math.max(0, ...counts.values());
}

describe('useEditPattern undo gesture integration', () => {
  it('turns a drag longer than 500ms into one undo/redo step and resyncs glyphs', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const { store, ref, view } = setup(squarePiece());
    const outline = () => store.getState().project.pieces[0].outline;
    const original = structuredClone(outline());
    const originalRoles = roleList(view.container);
    const historyBefore = getUndoLength();

    act(() => { ref.current!.handleMouseDown(mouseAt({ x: 100, y: 0 })); });
    act(() => { ref.current!.handleMouseMove(mouseAt({ x: 110, y: 0 })); });
    act(() => { vi.advanceTimersByTime(750); });
    act(() => { ref.current!.handleMouseMove(mouseAt({ x: 120, y: 0 })); });
    act(() => { ref.current!.handleMouseUp(); });

    const moved = structuredClone(outline());
    expect(moved[1].values).toEqual([120, 0]);
    expect(getUndoLength()).toBe(historyBefore + 1);
    act(() => { store.dispatch({ type: 'editor/undo' }); });
    expect(outline()).toEqual(original);
    expect(ref.current!.nodes[1].position).toEqual({ x: 100, y: 0 });
    expect(ref.current!.selectedNodes.size).toBe(0);
    expect(roleList(view.container)).toEqual(originalRoles);
    act(() => { store.dispatch({ type: 'editor/redo' }); });
    expect(outline()).toEqual(moved);
  });

  it('does not add history for mouse down/up without movement', () => {
    const { ref } = setup(squarePiece());
    const historyBefore = getUndoLength();
    act(() => { ref.current!.handleMouseDown(mouseAt({ x: 100, y: 0 })); });
    act(() => { ref.current!.handleMouseUp(); });
    expect(getUndoLength()).toBe(historyBefore);
  });

  it('lets Ctrl+Z close and revert an in-flight drag before mouseup', () => {
    const { store, ref } = setup(squarePiece());
    const outline = () => store.getState().project.pieces[0].outline;
    const original = structuredClone(outline());
    act(() => { ref.current!.handleMouseDown(mouseAt({ x: 100, y: 0 })); });
    act(() => { ref.current!.handleMouseMove(mouseAt({ x: 115, y: 0 })); });
    act(() => { store.dispatch({ type: 'editor/undo' }); });
    expect(outline()).toEqual(original);
    expect(canRedo()).toBe(true);
    act(() => { ref.current!.handleMouseMove(mouseAt({ x: 130, y: 0 })); });
    expect(outline()).toEqual(original);
  });

  it('groups a segment drag under the same single-entry contract', () => {
    const { store, ref } = setup(squarePiece());
    const original = structuredClone(store.getState().project.pieces[0].outline);
    const historyBefore = getUndoLength();
    act(() => { ref.current!.handleMouseDown(mouseAt({ x: 50, y: 0 })); });
    act(() => { ref.current!.handleMouseMove(mouseAt({ x: 60, y: 5 })); });
    act(() => { ref.current!.handleMouseUp(); });
    expect(getUndoLength()).toBe(historyBefore + 1);
    act(() => { store.dispatch({ type: 'editor/undo' }); });
    expect(store.getState().project.pieces[0].outline).toEqual(original);
  });

  it('closes an open gesture when the editor unmounts', () => {
    const { store, ref, view } = setup(squarePiece());
    act(() => { ref.current!.handleMouseDown(mouseAt({ x: 100, y: 0 })); });
    act(() => { ref.current!.handleMouseMove(mouseAt({ x: 110, y: 0 })); });
    const beforeUnmount = getUndoLength();
    act(() => { view.unmount(); });
    expect(getUndoLength()).toBe(beforeUnmount + 1);
    const afterGesture = getUndoLength();
    store.dispatch(updatePiece({
      ...store.getState().project.pieces[0],
      name: 'Independent action',
    }));
    expect(getUndoLength()).toBe(afterGesture + 1);
  });

  it('closes on Escape and ignores late movement or mouseup without duplicating history', () => {
    const { store, ref } = setup(squarePiece());
    const historyBefore = getUndoLength();
    act(() => { ref.current!.handleMouseDown(mouseAt({ x: 100, y: 0 })); });
    act(() => { ref.current!.handleMouseMove(mouseAt({ x: 110, y: 0 })); });
    expect(getUndoLength()).toBe(historyBefore);

    act(() => { ref.current!.handleKeyDown(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(getUndoLength()).toBe(historyBefore + 1);
    const outlineAfterCancel = structuredClone(store.getState().project.pieces[0].outline);

    act(() => { ref.current!.handleMouseMove(mouseAt({ x: 130, y: 0 })); });
    act(() => { ref.current!.handleMouseUp(); });
    expect(store.getState().project.pieces[0].outline).toEqual(outlineAfterCancel);
    expect(getUndoLength()).toBe(historyBefore + 1);
  });
});

const MARIA_FIXTURE = resolve(
  __dirname,
  '../../../../tests/fixtures/garments/maria_patrones_samuel_2M.dxf',
);

describe('useEditPattern — DXF real de María', () => {
  it.each(['corner', 'smoothSample'] as const)(
    'moves and undoes one %s without adding commands or coincident anchors',
    (role) => {
      const pieces = importDXFContent(readFileSync(MARIA_FIXTURE, 'utf8'), {
        unit: 'auto', autoDetect: true,
      }).pieces;
      const piece = pieces.find((item) => item.outline.length > 100)!;
      const classified = classifyEditableAnchors(piece, extractNodes(piece));
      const candidates = classified.filter((item) => item.role === role);
      // The fixture's first smooth sample is coincident with an earlier node;
      // choose a unique sample so the existing nearest-node hit-test exercises
      // the requested role instead of resolving the equal-distance predecessor.
      const target = role === 'corner' ? candidates[0] : candidates.find((item) =>
        classified.every((other) =>
          other.node.ref.commandIndex === item.node.ref.commandIndex ||
          Math.hypot(
            other.node.position.x - item.node.position.x,
            other.node.position.y - item.node.position.y,
          ) > 1e-6,
        ));
      expect(target).toBeDefined();
      const { store, ref, view } = setup(piece);
      const outline = () => store.getState().project.pieces[0].outline;
      const original = structuredClone(outline());
      const originalRoles = roleList(view.container);
      const originalMultiplicity = maxCoincidentMultiplicity(original);
      const start = pieceLocalToPattern(target!.node.position, piece);

      act(() => { ref.current!.handleMouseDown(mouseAt(start)); });
      act(() => {
        ref.current!.handleMouseMove(mouseAt({ x: start.x + 12, y: start.y + 4 }));
      });
      act(() => { ref.current!.handleMouseUp(); });

      const moved = outline();
      const changedIndices = original
        .map((command, index) =>
          JSON.stringify(command) === JSON.stringify(moved[index]) ? null : index)
        .filter((index): index is number => index !== null);
      expect(moved).toHaveLength(original.length);
      expect(changedIndices).toEqual([target!.node.ref.commandIndex]);
      expect(maxCoincidentMultiplicity(moved)).toBeLessThanOrEqual(originalMultiplicity);
      act(() => { store.dispatch({ type: 'editor/undo' }); });
      expect(outline()).toEqual(original);
      expect(roleList(view.container)).toEqual(originalRoles);
    },
  );
});
