// @vitest-environment jsdom
/**
 * «Mover exacto…» solo sobre el punto elegido de la PIEZA EN EDICIÓN, también
 * con otra pieza debajo del clic derecho (frontera, fase 2, ronda 1 de
 * revisión sobre la tarea 11).
 *
 * `agarreQ` (lo que decide `derechoSobreElPuntoElegido`) sale de
 * `editPatternTool.agarreEn`, escopeado a `editingPieceId`. `hitPiece` (el
 * menú) sale de `hitTestPieceBBox` sobre TODAS las piezas —salvo cuando ese
 * press agarraría algo de la pieza en edición: entonces es ella—. Sin el
 * guardián `hitPiece?.id === editingPieceId`, un clic derecho cuya CAJA
 * resolvía a otra pieza B, pero que caía —en el marco local de la pieza A que
 * Q edita— sobre el punto ya elegido de A, hacía pasar la pregunta igual: el
 * menú de B ofrecía «Mover exacto…» sobre el punto de A.
 *
 * La revisión final de la frontera (I-3) cambió lo que ese clic abre: en Q
 * gana la pieza en edición también con el botón derecho (spec 2026-09-24
 * § 3.4, fila 5, la misma regla que ya sigue el izquierdo). El menú es el de
 * A y ofrece «Mover exacto…» sobre su punto; si el press no agarra nada de A,
 * el menú es el de B y no lo ofrece.
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

/** La cabecera del menú abierto: el nombre de la pieza de la que habla. */
const cabecera = () => document.querySelector('.context-menu .context-menu__header')?.textContent ?? null;

describe('«Mover exacto…» y la pieza en edición, con otra pieza debajo del clic', () => {
  it('control: clic derecho sobre el punto elegido, pieza única, sí lo ofrece', () => {
    const svg = setup(false);

    fireEvent.contextMenu(svg, { clientX: 100, clientY: 0 });

    expect(screen.getByText('Mover exacto…')).toBeTruthy();
  });

  it('el mismo clic, con la caja de OTRA pieza encima: gana la pieza en edición, y el menú lo ofrece (§ 3.4, fila 5)', () => {
    const svg = setup(true);

    // (100,0) es a la vez el punto elegido de A y un punto interior de la
    // caja de B, que va primera en el array. `agarreQ` ve el vértice de A,
    // así que el menú es el de A, no el de la caja.
    fireEvent.contextMenu(svg, { clientX: 100, clientY: 0 });

    expect(cabecera()).toBe('A');
    expect(screen.getByText('Mover exacto…')).toBeTruthy();
  });

  it('un clic derecho que no agarra nada de A, dentro de la caja de B: el menú es de B y no lo ofrece', () => {
    const svg = setup(true);

    // (145,-20): a 5 mm del lado derecho de B y a más de 40 de todo lo de A.
    fireEvent.contextMenu(svg, { clientX: 145, clientY: -20 });

    expect(cabecera()).toBe('B');
    expect(screen.queryByText('Mover exacto…')).toBeNull();
  });
});

/**
 * Lo mismo con un TRAMO de interna de A bajo la caja de B: los verbos de
 * convertir aparecen, y convierten la línea de A (spec § 4.4). Antes, con la
 * caja de B, no aparecía ninguno —y el menú, sin verbos, ni se abría—.
 */
describe('clic derecho sobre un tramo de interna de la pieza en edición, con la caja de otra encima', () => {
  it('ofrece convertir, y convierte la línea de la pieza en edición', () => {
    const conInterna: PatternPiece = {
      ...pieceA(),
      internals: [{ id: 'L', type: 'reference', path: [{ type: 'M', values: [20, 50] }, { type: 'L', values: [80, 50] }] }],
    };
    // Su caja [40,160]×[30,70] cubre el tramo de A en (50,50), lejos de sus lados (más de 8 mm).
    const encima: PatternPiece = {
      ...pieceB(),
      outline: [
        { type: 'M', values: [40, 30] }, { type: 'L', values: [160, 30] },
        { type: 'L', values: [160, 70] }, { type: 'L', values: [40, 70] }, { type: 'Z', values: [] },
      ],
    };
    const store = configureStore({
      reducer: {
        project: projectReducer, editor: editorReducer, tools: toolReducer, simulation: simulationReducer,
        construction: constructionReducer, inputScheme: inputSchemeReducer, workflow: workflowReducer,
      },
      middleware: getDefault => getDefault({ serializableCheck: false }),
    });
    store.dispatch(loadProject({
      ...store.getState().project,
      id: 'test', name: 'Test', pieces: [encima, conInterna],
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
    const svg = view.container.querySelector<SVGSVGElement>('svg.pattern-svg')!;
    // Entra en A por un punto de su relleno sin nada que agarrar, fuera de la caja de B.
    const relleno = view.container.querySelector<SVGPathElement>('[data-piece-id="a"] .piece-fill')!;
    fireEvent.mouseDown(relleno, { button: 0, buttons: 1, clientX: 10, clientY: 90 });
    fireEvent.mouseUp(window, { button: 0, buttons: 0, clientX: 10, clientY: 90 });

    fireEvent.contextMenu(svg, { clientX: 50, clientY: 50 });

    expect(cabecera()).toBe('A');
    expect(screen.getByText('Convertir en curva por puntos')).toBeTruthy();
    fireEvent.click(screen.getByText('Convertir en curva'));
    const piezas = store.getState().project.pieces;
    expect(piezas.find(p => p.id === 'a')!.internals[0].path[1].type).toBe('C');
    expect(piezas.find(p => p.id === 'b')!.outline).toEqual(encima.outline);
  });
});
