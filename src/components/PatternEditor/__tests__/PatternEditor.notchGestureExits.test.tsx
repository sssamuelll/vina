// @vitest-environment jsdom
/**
 * Salidas del gesto de piquete en el host real. El andamio sigue
 * `PatternEditor.externalRelease.test.tsx`: el bug vive entre el hook, el
 * enrutador y el SVG, así que probar solo uno de esos niveles dejaría el cable
 * roto sin detectar.
 */
import { cleanup, fireEvent, render } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it } from 'vitest';
import { useKeyboardShortcuts } from '../../../hooks/useKeyboardShortcuts';
import { ShortcutProvider } from '../../../shortcuts/ShortcutProvider';
import constructionReducer from '../../../store/constructionSlice';
import editorReducer, { selectPiece, setActiveTool } from '../../../store/editorSlice';
import inputSchemeReducer from '../../../store/inputSchemeSlice';
import projectReducer, { loadProject } from '../../../store/projectSlice';
import simulationReducer from '../../../store/simulationSlice';
import toolReducer, { setActiveTool2D } from '../../../store/toolSlice';
import workflowReducer from '../../../store/workflowSlice';
import type { PatternPiece } from '../../../types/types';
import PatternEditor from '../PatternEditor';
import { clearJournal, getJournal } from '../../../utils/telemetry/journal';

afterEach(cleanup);

function squarePiece(): PatternPiece {
  return {
    id: 'p',
    name: 'Delantero',
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 100] },
      { type: 'L', values: [0, 100] },
      { type: 'Z', values: [] },
    ],
    internals: [],
    position: { x: 0, y: 0 },
    rotation: 0,
    mirrored: false,
    seamAllowance: 0,
    active: true,
    createdAt: 0,
    updatedAt: 0,
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

function setup() {
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
    middleware: getDefault => getDefault({ serializableCheck: false }),
  });
  store.dispatch(loadProject({
    ...store.getState().project,
    id: 'test',
    name: 'Test',
    pieces: [squarePiece()],
    seams: [],
    fabrics: [],
    createdAt: 0,
    updatedAt: 0,
  }));
  store.dispatch(setActiveTool('notch'));
  store.dispatch(setActiveTool2D('notch'));
  store.dispatch(selectPiece('p'));

  const view = render(
    <Provider store={store}>
      <ShortcutProvider><ShortcutEnabledPatternEditor /></ShortcutProvider>
    </Provider>,
  );
  const shortcutHost = view.getByTestId('shortcut-host');
  shortcutHost.focus();
  const svg = view.container.querySelector<SVGSVGElement>('svg.pattern-svg')!;
  const notchCount = () => store.getState().project.pieces[0].internals
    .filter(line => line.type === 'notch').length;
  return { store, view, shortcutHost, svg, notchCount };
}

function armNotch(svg: SVGSVGElement) {
  fireEvent.mouseDown(svg, {
    button: 0,
    buttons: 1,
    clientX: 10,
    clientY: 0,
  });
}

function releaseNotch(svg: SVGSVGElement) {
  fireEvent.mouseUp(svg, {
    button: 0,
    buttons: 0,
    clientX: 10,
    clientY: 0,
  });
}

describe('PatternEditor — salidas del gesto de piquete', () => {
  it('Escape cancela el piquete armado sin caer hasta deseleccionar', () => {
    const { store, shortcutHost, svg, notchCount } = setup();
    armNotch(svg);

    fireEvent.keyDown(shortcutHost, { key: 'Escape' });
    releaseNotch(svg);

    expect(notchCount()).toBe(0);
    expect(store.getState().editor.selectedPieceIds).toEqual(['p']);
  });

  it('clic derecho cancela el gesto y suprime el menú contextual', () => {
    const { view, svg, notchCount } = setup();
    armNotch(svg);
    clearJournal();

    fireEvent.contextMenu(svg, { clientX: 50, clientY: 50 });
    releaseNotch(svg);

    expect(view.container.querySelector('.context-menu')).toBeNull();
    expect(notchCount()).toBe(0);
    // La supresión es muda para Redux: la bitácora es su único rastro.
    expect(getJournal().events.filter((e) => e.kind === 'ui')).toEqual([
      expect.objectContaining({ name: 'contextmenu', data: { tool: 'notch', opened: false } }),
    ]);
  });

  it('pointercancel resetea el gesto para que un mouseup tardío no commitee', () => {
    const { svg, notchCount } = setup();
    armNotch(svg);

    fireEvent.pointerCancel(svg, { pointerId: 1 });
    releaseNotch(svg);

    expect(notchCount()).toBe(0);
  });
});
