// @vitest-environment jsdom
/**
 * Enter y Espacio sobre un botón de una botonera (la línea al pie, su menú
 * «Más») son del botón: lo pulsan. Lo cazó la revisión final de P2b: con el
 * foco en una alternativa, Espacio arrancaba la simulación (`sim.toggle` es de
 * contexto global y hace `preventDefault`, así que el botón no se pulsaba), y
 * Enter llegaba además a la herramienta del lienzo. Las letras siguen siendo
 * atajos. Lo del lienzo, que aquí no se monta, lo mide
 * `tests/e2e/linea-al-pie.spec.ts`.
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

function montar() {
  const store = configureStore({
    reducer: { editor: editorReducer, project: projectReducer, simulation: simulationReducer, tools: toolReducer },
  });
  function Hooked() {
    useKeyboardShortcuts();
    return (
      <div data-shortcut-context="2d">
        <div data-botonera><button type="button">Hacia adentro</button></div>
        <button type="button">Fuera de la botonera</button>
      </div>
    );
  }
  const view = render(
    <Provider store={store}>
      <ShortcutProvider><Hooked /></ShortcutProvider>
    </Provider>,
  );
  return { store, dentro: view.getByText('Hacia adentro'), fuera: view.getByText('Fuera de la botonera') };
}

const pulsar = (target: Element, key: string) => {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  act(() => { target.dispatchEvent(e); });
  return e;
};

describe('Enter y Espacio son del botón de la botonera', () => {
  it('CONTROL: fuera de una botonera, Espacio es la simulación y el botón no se pulsa', () => {
    const { fuera } = montar();
    expect(pulsar(fuera, ' ').defaultPrevented, 'el caso no se ejerce: Espacio no es un atajo').toBe(true);
  });

  it('en la botonera, Espacio pulsa el botón: ningún atajo se lo quita', () => {
    const { dentro } = montar();
    expect(pulsar(dentro, ' ').defaultPrevented, 'Espacio se fue a la simulación').toBe(false);
  });

  it('las letras siguen siendo atajos con el foco en la botonera', () => {
    const { store, dentro } = montar();
    pulsar(dentro, 'q');
    expect(store.getState().editor.activeTool).toBe('editPattern');
  });
});
