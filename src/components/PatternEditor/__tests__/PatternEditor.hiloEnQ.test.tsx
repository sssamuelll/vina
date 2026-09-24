// @vitest-environment jsdom
/**
 * El hilo en Q no se curva (spec 2026-09-24 § 3.2: «dos puntos»; revisión
 * final de la frontera, M-1): el clic derecho sobre su tramo no ofrece los
 * verbos de convertir. Ofrecerlos y que no hicieran nada sería una puerta
 * muerta; que lo curvaran, un hilo cuyo asta del DXF y su flecha no coinciden.
 *
 * El andamio sigue `PatternEditor.moverExactoOtraPieza.test.tsx`.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import projectReducer, { loadProject } from '../../../store/projectSlice';
import editorReducer from '../../../store/editorSlice';
import toolReducer from '../../../store/toolSlice';
import simulationReducer from '../../../store/simulationSlice';
import constructionReducer from '../../../store/constructionSlice';
import inputSchemeReducer from '../../../store/inputSchemeSlice';
import workflowReducer from '../../../store/workflowSlice';
import type { PatternPiece } from '../../../types/types';
import { ShortcutProvider } from '../../../shortcuts/ShortcutProvider';
import { useKeyboardShortcuts } from '../../../hooks/useKeyboardShortcuts';
import PatternEditor from '../PatternEditor';

afterEach(cleanup);

function pieza(): PatternPiece {
  return {
    id: 'p', name: 'P',
    outline: [
      { type: 'M', values: [0, 0] }, { type: 'L', values: [200, 0] },
      { type: 'L', values: [200, 150] }, { type: 'L', values: [0, 150] }, { type: 'Z', values: [] },
    ],
    internals: [
      { id: 'H', type: 'grainline', path: [{ type: 'M', values: [20, 100] }, { type: 'L', values: [180, 100] }] },
      { id: 'L', type: 'reference', path: [{ type: 'M', values: [20, 20] }, { type: 'L', values: [120, 20] }] },
    ],
    position: { x: 0, y: 0 }, rotation: 0,
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

/** Q, dentro de la pieza, con nada elegido. */
function enQ() {
  const store = configureStore({
    reducer: {
      project: projectReducer, editor: editorReducer, tools: toolReducer, simulation: simulationReducer,
      construction: constructionReducer, inputScheme: inputSchemeReducer, workflow: workflowReducer,
    },
    middleware: getDefault => getDefault({ serializableCheck: false }),
  });
  store.dispatch(loadProject({
    ...store.getState().project,
    id: 'test', name: 'Test', pieces: [pieza()],
    seams: [], fabrics: [], createdAt: 0, updatedAt: 0,
  }));
  const view = render(
    <Provider store={store}>
      <ShortcutProvider><ShortcutEnabledPatternEditor /></ShortcutProvider>
    </Provider>,
  );
  const shortcutHost = view.getByTestId('shortcut-host');
  shortcutHost.focus();
  fireEvent.keyDown(shortcutHost, { key: 'q' });
  // (100,60): a 40 mm de las dos internas y lejos del contorno, nada que agarrar.
  const relleno = view.container.querySelector<SVGPathElement>('[data-piece-id="p"] .piece-fill')!;
  fireEvent.mouseDown(relleno, { button: 0, buttons: 1, clientX: 100, clientY: 60 });
  fireEvent.mouseUp(window, { button: 0, buttons: 0, clientX: 100, clientY: 60 });
  expect(store.getState().tools.activeTool2D).toBe('editPattern');
  return { store, svg: view.container.querySelector<SVGSVGElement>('svg.pattern-svg')! };
}

describe('Q: el clic derecho sobre el tramo del hilo no ofrece curvarlo (§ 3.2)', () => {
  it('sobre el hilo: ningún verbo de convertir', () => {
    const { svg } = enQ();
    fireEvent.contextMenu(svg, { clientX: 100, clientY: 100 });
    expect(screen.queryByText('Convertir en curva')).toBeNull();
    expect(screen.queryByText('Convertir en curva por puntos')).toBeNull();
  });

  it('control: sobre el tramo de una referencia, sí', () => {
    const { svg } = enQ();
    fireEvent.contextMenu(svg, { clientX: 70, clientY: 20 });
    expect(screen.getByText('Convertir en curva')).toBeTruthy();
    expect(screen.getByText('Convertir en curva por puntos')).toBeTruthy();
  });
});
