// @vitest-environment jsdom
/**
 * #1173 — con un diálogo modal abierto, los atajos globales se retiran.
 *
 * `ShortcutProvider` ya se retiraba ante un campo editable, y por la razón
 * correcta: la tecla es de quien tiene la atención. Un modal tapa MÁS que un
 * campo de texto, no menos — y sin embargo pasaba entera, así que Supr se
 * llevaba la pieza de detrás mientras María leía la pregunta.
 *
 * El detector es `[aria-modal="true"]`, que es justo la pregunta que ARIA
 * responde, y no una marca inventada. Eso deja fuera —a propósito— a los
 * diálogos NO modales: `NotchPrecisionModal` declara `role="dialog"` pero no
 * tiene velo, se abre junto a la pieza y el lienzo sigue vivo detrás. Un
 * detector por `role="dialog"` lo habría barrido con los demás; el caso de
 * abajo es lo que lo impide.
 *
 * El duelo de orden entre oyentes no se puede medir aquí (jsdom no lo
 * reproduce) y lo mide `tests/e2e/supr-con-algo-delante.spec.ts`. Lo de aquí
 * es la otra mitad: a quién deja pasar la guarda.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { ShortcutProvider } from '../ShortcutProvider';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import editorReducer from '../../store/editorSlice';
import projectReducer from '../../store/projectSlice';
import simulationReducer from '../../store/simulationSlice';
import toolReducer from '../../store/toolSlice';

afterEach(cleanup);

function makeStore() {
  return configureStore({
    reducer: { editor: editorReducer, project: projectReducer, simulation: simulationReducer, tools: toolReducer },
  });
}

/** `superficie` se pinta al lado del lienzo, como lo hace un modal del shell. */
function montar(superficie: React.ReactNode = null) {
  const store = makeStore();
  function Hooked() {
    useKeyboardShortcuts();
    return <div data-shortcut-context="2d" tabIndex={0} data-testid="lienzo" />;
  }
  const view = render(
    <Provider store={store}>
      <ShortcutProvider><Hooked />{superficie}</ShortcutProvider>
    </Provider>,
  );
  const lienzo = view.getByTestId('lienzo');
  lienzo.focus();
  return { store, lienzo };
}

const pulsar = (target: Element, key: string) =>
  act(() => { target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })); });

const MODAL = <div role="dialog" aria-modal="true" aria-label="¿Unir las piezas?" />;
/** Como `NotchPrecisionModal`: diálogo, pero sin velo — el lienzo sigue vivo. */
const NO_MODAL = <div role="dialog" aria-label="Colocación de piquete" />;

describe('#1173 — la tecla es de quien tiene la atención', () => {
  it('CONTROL: sin nada delante, el atajo llega y cambia de herramienta', () => {
    const { store, lienzo } = montar();
    pulsar(lienzo, 'q');
    expect(store.getState().editor.activeTool).toBe('editPattern');
  });

  it('con un modal abierto, el atajo no llega', () => {
    const { store, lienzo } = montar(MODAL);
    const antes = store.getState().editor.activeTool;
    pulsar(lienzo, 'q');
    expect(store.getState().editor.activeTool, 'un atajo se coló detrás del modal').toBe(antes);
  });

  it('un diálogo NO modal no retira nada: el lienzo sigue vivo detrás', () => {
    // El caso que refuta el detector fácil. `role="dialog"` habría apagado
    // los atajos con el popover del piquete abierto, que se usa justo para
    // seguir trabajando sobre la pieza.
    const { store, lienzo } = montar(NO_MODAL);
    pulsar(lienzo, 'q');
    expect(store.getState().editor.activeTool, 'un popover apagó los atajos').toBe('editPattern');
  });

  it('Escape es la excepción: sigue pasando con el modal abierto', () => {
    // Misma excepción que la guarda de campos que ya estaba arriba. Sin ella
    // un modal sin Escape propio dejaría a María encerrada dentro de él.
    //
    // Se mide por su EFECTO (`selection.deselect` vacía la selección) y no
    // espiando el evento en `document`: ahí la tecla llega igual haga lo que
    // haga la guarda, así que ese espía pasaba en verde siempre.
    const { store, lienzo } = montar(MODAL);
    store.dispatch({ type: 'editor/selectPiece', payload: 'p1' });
    expect(store.getState().editor.selectedPieceIds, 'el caso no se ejerce').toEqual(['p1']);

    pulsar(lienzo, 'Escape');

    expect(store.getState().editor.selectedPieceIds, 'Escape dejó de llegar').toEqual([]);
  });
});
