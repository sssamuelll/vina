// @vitest-environment jsdom
/**
 * «Mover exacto…» solo sobre el punto elegido de la PIEZA EN EDICIÓN, también
 * con otra pieza debajo del clic derecho (frontera, fase 2, ronda 1 de
 * revisión sobre la tarea 11).
 *
 * `hitPiece` (el menú) sale de `hitTestPieceBBox` sobre TODAS las piezas;
 * `agarreQ` (lo que decide `derechoSobreElPuntoElegido`) sale de
 * `editPatternTool.agarreEn`, escopeado a `editingPieceId` — nunca mira
 * `hitPiece`. Sin el guardián `hitPiece?.id === editingPieceId`, un clic
 * derecho cuya CAJA resuelve a otra pieza B, pero que cae —en el marco local
 * de la pieza A que Q edita— sobre el punto ya elegido de A, hacía pasar la
 * pregunta igual: el menú de B ofrecía «Mover exacto…» sobre el punto de A.
 *
 * El andamio de activar Q, entrar en una pieza con un clic sobre su relleno y
 * elegir un punto con un clic sin arrastre sigue
 * `PatternEditor.externalRelease.test.tsx` (su `setupHost`, el primer clic).
 * El de disparar el menú contextual sobre un `PatternEditor` real y leer el
 * texto del menú sigue `PatternEditor.notchExactDistance.test.tsx`.
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

/** La pieza que Q edita. Su vértice (100,0) — commandIndex 1 — es el punto elegido. */
function pieceA(): PatternPiece {
  return {
    id: 'a', name: 'A',
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

/**
 * Otra pieza, sin relación con A. Su caja [50,150]×[-50,10] SÍ cubre (100,0)
 * — el punto elegido de A — pero no el relleno donde entra A (50,50). Va
 * PRIMERA en `pieces`: `hitTestPieceBBox` devuelve la primera caja que
 * contenga el punto, así que gana ella.
 */
function pieceB(): PatternPiece {
  return {
    id: 'b', name: 'B',
    outline: [
      { type: 'M', values: [50, -50] },
      { type: 'L', values: [150, -50] },
      { type: 'L', values: [150, 10] },
      { type: 'L', values: [50, 10] },
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

/** `withB`: si la caja de B convive con la de A (el caso del hallazgo) o A es la única pieza (control). */
function setup(withB: boolean) {
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
    id: 'test', name: 'Test',
    pieces: withB ? [pieceB(), pieceA()] : [pieceA()],
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

  const svg = view.container.querySelector<SVGSVGElement>('svg.pattern-svg')!;
  const pieceAFill = view.container.querySelector<SVGPathElement>('[data-piece-id="a"] .piece-fill')!;

  // Entra en A con un clic sobre su relleno — lejos de la caja de B.
  fireEvent.mouseDown(pieceAFill, { button: 0, buttons: 1, clientX: 50, clientY: 50 });
  fireEvent.mouseUp(window, { button: 0, buttons: 0, clientX: 50, clientY: 50 });
  expect(view.container.querySelector('[data-anchor-role]')).not.toBeNull();

  // Elige el vértice (100,0) de A: un clic sin arrastre lo deja seleccionado
  // (el gesto de nodo no escribe nada al soltar sin mover, spec § 4.7).
  fireEvent.mouseDown(svg, { button: 0, buttons: 1, clientX: 100, clientY: 0 });
  fireEvent.mouseUp(window, { button: 0, buttons: 0, clientX: 100, clientY: 0 });

  return svg;
}

describe('«Mover exacto…» y la pieza en edición, con otra pieza debajo del clic', () => {
  it('control: clic derecho sobre el punto elegido, pieza única, sí lo ofrece', () => {
    const svg = setup(false);

    fireEvent.contextMenu(svg, { clientX: 100, clientY: 0 });

    expect(screen.getByText('Mover exacto…')).toBeTruthy();
  });

  it('el mismo clic, pero cuya caja resuelve a OTRA pieza, no lo ofrece', () => {
    const svg = setup(true);

    // (100,0) es a la vez el punto elegido de A y un punto interior de la
    // caja de B. `hitPiece` es B (primera en el array); `agarreQ` sigue
    // viendo el vértice de A, porque está escopeado a `editingPieceId`.
    fireEvent.contextMenu(svg, { clientX: 100, clientY: 0 });

    expect(screen.queryByText('Mover exacto…')).toBeNull();
  });
});
