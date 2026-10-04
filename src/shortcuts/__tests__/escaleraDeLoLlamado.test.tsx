// @vitest-environment jsdom
/**
 * La escalera de lo que se llama (spec 2026-10-02 § 6.2): un menú, la barra de
 * IA y un panel se cierran con Esc antes que la selección. Un Escape, un
 * peldaño. ShortcutProvider la consulta antes de su atajo global de
 * deseleccionar; un modal encima se queda su Esc.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { useState } from 'react';
import { ShortcutProvider } from '../ShortcutProvider';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import editorReducer from '../../store/editorSlice';
import projectReducer from '../../store/projectSlice';
import simulationReducer from '../../store/simulationSlice';
import toolReducer from '../../store/toolSlice';
import { bajarLaEscalera, subirPeldano, usePeldanoDeEscape } from '../escaleraDeLoLlamado';

afterEach(cleanup);

describe('el orden de los peldaños', () => {
  it('menú antes que IA antes que panel; a igual prioridad, el último que se abrió', () => {
    const orden: string[] = [];
    const bajar = [
      subirPeldano('panel', 'panel', () => orden.push('panel')),
      subirPeldano('ia', 'ia', () => orden.push('ia')),
      subirPeldano('mostrar', 'menu', () => orden.push('mostrar')),
      subirPeldano('mas', 'menu', () => orden.push('mas')),
    ];
    expect(bajarLaEscalera()).toBe('mas');
    bajar[3]();
    expect(bajarLaEscalera()).toBe('mostrar');
    bajar[2]();
    expect(bajarLaEscalera()).toBe('ia');
    bajar[1]();
    expect(bajarLaEscalera()).toBe('panel');
    bajar[0]();
    expect(bajarLaEscalera()).toBeNull();
    expect(orden).toEqual(['mas', 'mostrar', 'ia', 'panel']);
  });
});

function montar(conModal = false) {
  const store = configureStore({ reducer: { editor: editorReducer, project: projectReducer, simulation: simulationReducer, tools: toolReducer } });
  let abrir!: () => void;
  function Menu() {
    const [abierto, setAbierto] = useState(false);
    abrir = () => setAbierto(true);
    usePeldanoDeEscape('menu-de-prueba', 'menu', abierto, () => setAbierto(false));
    return abierto ? <div role="menu" aria-label="Menú de prueba" /> : null;
  }
  function Lienzo() {
    useKeyboardShortcuts();
    return <div data-shortcut-context="2d" tabIndex={0} data-testid="lienzo" />;
  }
  const view = render(
    <Provider store={store}>
      <ShortcutProvider>
        <Lienzo />
        <Menu />
        {conModal && <div role="dialog" aria-modal="true" aria-label="¿Unir las piezas?" />}
      </ShortcutProvider>
    </Provider>,
  );
  const lienzo = view.getByTestId('lienzo');
  lienzo.focus();
  act(() => { store.dispatch({ type: 'editor/selectPiece', payload: 'p1' }); });
  act(() => abrir());
  const escape = () => act(() => { lienzo.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); });
  return { store, view, escape };
}

describe('con ShortcutProvider', () => {
  it('el primer Escape cierra el menú y la pieza sigue seleccionada; el segundo la suelta', () => {
    const { store, view, escape } = montar();
    expect(view.queryByRole('menu'), 'el caso no se ejerce').not.toBeNull();
    expect(store.getState().editor.selectedPieceIds, 'el caso no se ejerce').toEqual(['p1']);
    escape();
    expect(view.queryByRole('menu')).toBeNull();
    expect(store.getState().editor.selectedPieceIds, 'el Escape del menú deseleccionó también').toEqual(['p1']);
    escape();
    expect(store.getState().editor.selectedPieceIds).toEqual([]);
  });

  it('con un modal delante, el menú no se lleva el Escape: es del modal', () => {
    const { view, escape } = montar(true);
    escape();
    expect(view.queryByRole('menu'), 'el Escape se fue al menú de detrás del modal').not.toBeNull();
  });
});
