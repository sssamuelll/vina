// @vitest-environment jsdom
/**
 * La cota de un tramo de interna, escrita en Q (spec 2026-09-24 § 4.5; revisión
 * final de la frontera, I-2).
 *
 * El chip del tramo es una caja con dos campos, Largo y Ángulo, y Tab confirma
 * el primero antes de pasar al segundo (`CotaChip`, `confirmar('tab')`). Si la
 * escritura va por la línea (`updateInternalLine`), Q la lee como un cambio de
 * fuera: suelta el tramo, suelta la interna elegida, el sujeto se queda sin
 * cotas y el campo Ángulo desaparece bajo el Tab. Por eso en Q escribe por el
 * punto (`moveNodeTo`), como el lado del contorno.
 *
 * El andamio de activar Q con la tecla y entrar con un press sobre la pieza
 * sigue `PatternEditor.moverExactoOtraPieza.test.tsx`; el de abrir y confirmar
 * un chip, `PatternEditor.margenEnElBorde.test.tsx`.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
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
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [200, 0] },
      { type: 'L', values: [200, 150] },
      { type: 'L', values: [0, 150] },
      { type: 'Z', values: [] },
    ],
    internals: [{
      id: 'L', type: 'reference',
      path: [{ type: 'M', values: [20, 20] }, { type: 'L', values: [120, 20] }, { type: 'L', values: [120, 120] }],
    }],
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
  expect(store.getState().tools.activeTool2D).toBe('editPattern');
  return { store, view };
}

describe('Q: la cota del tramo de una interna escribe sin soltar el tramo', () => {
  it('Largo con Tab: la línea cambia, el tramo sigue elegido (en Q y en la global) y el campo Ángulo sigue ahí', () => {
    const { store, view } = setup();
    // El primer press entra en la pieza y ya elige el tramo (20,20)→(120,20).
    const relleno = view.container.querySelector<SVGPathElement>('[data-piece-id="p"] .piece-fill')!;
    fireEvent.mouseDown(relleno, { button: 0, buttons: 1, clientX: 70, clientY: 20 });
    fireEvent.mouseUp(window, { button: 0, buttons: 0, clientX: 70, clientY: 20 });
    expect(store.getState().editor.selectedInternalLine).toEqual({ pieceId: 'p', lineId: 'L', segmentIndex: 1 });

    const chip = view.container.querySelector<HTMLButtonElement>('button.cota')!;
    expect(chip.getAttribute('aria-label')).toContain('Largo');
    fireEvent.click(chip);
    const largo = view.getByLabelText('Largo') as HTMLInputElement;
    fireEvent.change(largo, { target: { value: '150' } });
    fireEvent.keyDown(largo, { key: 'Tab' });

    const linea = store.getState().project.pieces[0].internals.find(l => l.id === 'L')!;
    expect(linea.path[1].values[0]).toBeCloseTo(170, 9);
    expect(linea.path[1].values[1]).toBeCloseTo(20, 9);
    expect(store.getState().editor.selectedInternalLine).toEqual({ pieceId: 'p', lineId: 'L', segmentIndex: 1 });
    // El tramo elegido de Q: su resalte a opacidad plena en el overlay.
    expect(view.container.querySelector('[data-interna="L"] path[opacity="1"]')).not.toBeNull();
    expect(view.queryByLabelText('Ángulo')).not.toBeNull();
  });
});
