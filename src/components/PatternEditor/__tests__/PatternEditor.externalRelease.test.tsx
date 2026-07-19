// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import projectReducer, { loadProject, updatePiece } from '../../../store/projectSlice';
import editorReducer from '../../../store/editorSlice';
import toolReducer from '../../../store/toolSlice';
import simulationReducer from '../../../store/simulationSlice';
import constructionReducer from '../../../store/constructionSlice';
import inputSchemeReducer from '../../../store/inputSchemeSlice';
import workflowReducer from '../../../store/workflowSlice';
import { getUndoLength, undoMiddleware } from '../../../store/undoMiddleware';
import type { PatternPiece } from '../../../types/types';
import { ShortcutProvider } from '../../../shortcuts/ShortcutProvider';
import { useKeyboardShortcuts } from '../../../hooks/useKeyboardShortcuts';
import PatternEditor from '../PatternEditor';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
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

function ShortcutEnabledPatternEditor() {
  useKeyboardShortcuts();
  return (
    <div data-shortcut-context="2d" data-testid="shortcut-host" tabIndex={0}>
      <PatternEditor />
    </div>
  );
}

function setupHost() {
  const store = configureStore({
    reducer: {
      project: projectReducer,
      editor: editorReducer,
      tools: toolReducer,
      simulation: simulationReducer,
      construction: constructionReducer,
      inputScheme: inputSchemeReducer,
      workflow: workflowReducer,
    },
    middleware: (getDefault) => getDefault({ serializableCheck: false })
      .concat(undoMiddleware),
  });
  const base = store.getState().project;
  store.dispatch(loadProject({
    ...base, id: 'test', name: 'Test', pieces: [squarePiece()], seams: [], fabrics: [],
    createdAt: 0, updatedAt: 0,
  }));
  const view = render(
    <Provider store={store}>
      <ShortcutProvider><ShortcutEnabledPatternEditor /></ShortcutProvider>
    </Provider>,
  );
  const shortcutHost = view.getByTestId('shortcut-host');
  shortcutHost.focus();
  fireEvent.keyDown(shortcutHost, { key: 'q' });
  expect(store.getState().editor.activeTool).toBe('editPattern');
  expect(store.getState().tools.activeTool2D).toBe('editPattern');

  const svg = view.container.querySelector<SVGSVGElement>('svg.pattern-svg')!;
  const pieceFill = view.container.querySelector<SVGPathElement>('[data-piece-id="p"] .piece-fill')!;

  // First click enters edit mode through the actual PatternEditor host.
  fireEvent.mouseDown(pieceFill, { button: 0, buttons: 1, clientX: 50, clientY: 50 });
  fireEvent.mouseUp(window, { button: 0, buttons: 0, clientX: 50, clientY: 50 });
  expect(view.container.querySelector('[data-anchor-role]')).not.toBeNull();

  return { store, svg, view, shortcutHost };
}

function beginNodeDrag(svg: SVGSVGElement) {
  fireEvent.mouseDown(svg, { button: 0, buttons: 1, clientX: 100, clientY: 0 });
  fireEvent.mouseMove(svg, { buttons: 1, clientX: 110, clientY: 0 });
}

describe('PatternEditor external drag release', () => {
  it('closes a node gesture released outside and keeps the next action independent', () => {
    const { store, svg } = setupHost();
    const outline = () => store.getState().project.pieces[0].outline;
    const historyBefore = getUndoLength();
    beginNodeDrag(svg);
    expect(outline()[1].values).toEqual([110, 0]);

    fireEvent.mouseUp(window, { button: 0, buttons: 0, clientX: 500, clientY: 500 });
    const afterRelease = structuredClone(outline());
    const historyAfterGesture = getUndoLength();

    // A mousemove can arrive when the pointer re-enters after an external release.
    fireEvent.mouseMove(svg, { buttons: 0, clientX: 130, clientY: 0 });
    store.dispatch(updatePiece({
      ...store.getState().project.pieces[0],
      name: 'Independent action',
    }));

    expect.soft(historyAfterGesture).toBe(historyBefore + 1);
    expect.soft(outline()).toEqual(afterRelease);
    expect.soft(getUndoLength()).toBe(historyAfterGesture + 1);
  });

  it('cancels on window blur and unregisters the global release listeners on cleanup', () => {
    const removeListener = vi.spyOn(window, 'removeEventListener');
    const { store, svg, view } = setupHost();
    const outline = () => store.getState().project.pieces[0].outline;
    const historyBefore = getUndoLength();
    beginNodeDrag(svg);

    fireEvent(window, new Event('blur'));
    const afterCancel = structuredClone(outline());
    fireEvent.mouseMove(svg, { buttons: 0, clientX: 140, clientY: 0 });

    expect.soft(getUndoLength()).toBe(historyBefore + 1);
    expect.soft(outline()).toEqual(afterCancel);

    view.unmount();
    expect(removeListener).toHaveBeenCalledWith('mouseup', expect.any(Function));
    expect(removeListener).toHaveBeenCalledWith('blur', expect.any(Function));
  });

  it.each(['mouseup', 'blur'] as const)(
    'closes the captured edit gesture on %s after the Select shortcut changes activeTool',
    (releaseKind) => {
      const { store, svg, shortcutHost } = setupHost();
      const outline = () => store.getState().project.pieces[0].outline;
      const historyBefore = getUndoLength();
      beginNodeDrag(svg);
      expect(outline()[1].values).toEqual([110, 0]);

      // Z is the real 2D Select shortcut and updates both tool authorities.
      fireEvent.keyDown(shortcutHost, { key: 'z' });
      expect(store.getState().editor.activeTool).toBe('select');
      expect(store.getState().tools.activeTool2D).toBe('select');

      if (releaseKind === 'mouseup') {
        fireEvent.mouseUp(window, { button: 0, buttons: 0, clientX: 500, clientY: 500 });
      } else {
        fireEvent(window, new Event('blur'));
      }
      const afterRelease = structuredClone(outline());
      const historyAfterGesture = getUndoLength();

      // Re-enable Edit Pattern: a stale drag would otherwise replay here.
      fireEvent.keyDown(shortcutHost, { key: 'q' });
      fireEvent.mouseMove(svg, { buttons: 1, clientX: 130, clientY: 0 });
      store.dispatch(updatePiece({
        ...store.getState().project.pieces[0],
        name: 'Independent after tool switch',
      }));

      expect.soft(historyAfterGesture).toBe(historyBefore + 1);
      expect.soft(outline()).toEqual(afterRelease);
      expect.soft(getUndoLength()).toBe(historyAfterGesture + 1);
    },
  );
});
