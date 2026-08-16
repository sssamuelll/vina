/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import toolReducer from '../../../store/toolSlice';
import { toolRegistry } from '../../../tools';
import type { ToolDefinition } from '../../../tools/types';
import { ShortcutProvider, DEFAULT_SHORTCUTS } from '../../../shortcuts';
import { displayShortcutBinding } from '../shortcutDisplay';
import ToolOptionsBar2D from '../ToolOptionsBar2D';

/**
 * Unitario de la canaleta de opciones (#1049).
 *
 * Mide LA BARRA, no el catálogo real de herramientas: registra dos
 * herramientas de prueba propias. Si afirmara sobre `notch` o `point`
 * dependería de que las tareas de idioma ya hubieran corrido, y entonces un
 * fallo aquí no diría si lo roto es la barra o una traducción.
 *
 * Lo que la barra hace en la app con las herramientas de verdad lo mide el
 * e2e, que es el único que puede: jsdom no calcula layout.
 */

const IconoVacio: React.FC<{ size?: number }> = () => null;

const CON_OPCIONES: ToolDefinition = {
  id: '__prueba_con_opciones',
  name: 'Herramienta de prueba',
  context: '2d',
  icon: IconoVacio,
  options: [
    { id: 'numero', label: 'Un número', type: 'number', value: 5, min: 0, max: 10, step: 1 },
    {
      id: 'lista',
      label: 'Una lista',
      type: 'select',
      value: 'a',
      choices: [
        { label: 'Opción A', value: 'a' },
        { label: 'Opción B', value: 'b' },
      ],
    },
    { id: 'interruptor', label: 'Un interruptor', type: 'toggle', value: false },
    { id: 'color', label: 'Un color', type: 'color', value: '#334455' },
  ],
};

const SIN_OPCIONES: ToolDefinition = {
  id: '__prueba_sin_opciones',
  name: 'Herramienta pelada',
  context: '2d',
  icon: IconoVacio,
};

toolRegistry.registerTool(CON_OPCIONES);
toolRegistry.registerTool(SIN_OPCIONES);

// Convención del repo (ContextPanel.test.tsx:10). Sin esto el render anterior
// sobrevive y `getByRole` encuentra dos.
afterEach(cleanup);

function crearStore(activeTool2D: string) {
  return configureStore({
    reducer: { tools: toolReducer },
    preloadedState: {
      tools: {
        activeTool2D,
        activeTool3D: 'camera',
        toolOptions: {},
        recentTools: [],
      },
    },
  });
}

function montar(activeTool2D: string) {
  const store = crearStore(activeTool2D);
  const utils = render(
    <Provider store={store}>
      <ToolOptionsBar2D />
    </Provider>,
  );
  return { store, ...utils };
}

describe('ToolOptionsBar2D', () => {
  it('pinta un control por cada opción declarada, de cada tipo', () => {
    montar('__prueba_con_opciones');

    // Aserciones planas: el repo no carga los matchers de jest-dom en ningún
    // setup global, así que `toHaveAttribute` no existe aquí.
    expect(screen.getByLabelText('Un número').getAttribute('type')).toBe('range');
    expect(screen.getByLabelText('Una lista').tagName).toBe('SELECT');
    expect(
      screen.getByRole('button', { name: 'Un interruptor' }).getAttribute('aria-pressed'),
    ).toBe('false');
    expect(screen.getByLabelText('Un color').getAttribute('type')).toBe('color');
  });

  it('despacha setToolOption al cambiar un desplegable', () => {
    const { store } = montar('__prueba_con_opciones');

    fireEvent.change(screen.getByLabelText('Una lista'), { target: { value: 'b' } });

    expect(store.getState().tools.toolOptions.__prueba_con_opciones.lista).toBe('b');
  });

  it('coerce a número al mover un deslizador', () => {
    // `Number(e.target.value)` es lo único que separa un 7 de un "7" en el
    // store, y los consumidores leen el valor sin volver a convertirlo.
    const { store } = montar('__prueba_con_opciones');

    fireEvent.change(screen.getByLabelText('Un número'), { target: { value: '7' } });

    expect(store.getState().tools.toolOptions.__prueba_con_opciones.numero).toBe(7);
  });

  it('muestra el atajo efectivo cuando la herramienta tiene uno', () => {
    // Sin ShortcutProvider, `useShortcutRegistry()` devuelve null y la rama
    // del <kbd> no corre NUNCA: el atajo es una de las tres razones de ser de
    // esta barra y se quedaba sin red. `notch` es real y trae atajo.
    const store = crearStore('notch');
    render(
      <Provider store={store}>
        <ShortcutProvider>
          <ToolOptionsBar2D />
        </ShortcutProvider>
      </Provider>,
    );

    const def = DEFAULT_SHORTCUTS.find((s) => s.id === 'tool.notch')!;
    const esperado = displayShortcutBinding({
      key: def.key,
      ctrl: def.ctrl,
      shift: def.shift,
      alt: def.alt,
    });

    expect(esperado).not.toBe('');
    expect(screen.getByText(esperado).tagName).toBe('KBD');
  });

  it('despacha setToolOption al pulsar un interruptor', () => {
    const { store } = montar('__prueba_con_opciones');

    fireEvent.click(screen.getByRole('button', { name: 'Un interruptor' }));

    expect(store.getState().tools.toolOptions.__prueba_con_opciones.interruptor).toBe(true);
  });

  it('sin opciones el canal sigue presente y muestra el nombre', () => {
    montar('__prueba_sin_opciones');

    // El canal NO desaparece: acoplado, desaparecer hace saltar el patrón.
    expect(
      screen.getByRole('toolbar', { name: 'Opciones de la herramienta' }),
    ).toBeTruthy();
    expect(screen.getByText('Herramienta pelada')).toBeTruthy();
  });

  it('el selector devuelve una referencia estable cuando no hay valores guardados', () => {
    // react-redux avisa por consola cuando un selector devuelve un objeto
    // distinto con el mismo estado. Es lo que pasa con `?? {}` dentro del
    // selector — el componente borrado en f4c5e92c lo tenía — y eso es un
    // bucle de renders, no un detalle de estilo.
    const avisos: string[] = [];
    const spy = vi
      .spyOn(console, 'warn')
      .mockImplementation((...a: unknown[]) => { avisos.push(String(a)); });

    const { store, rerender } = montar('__prueba_sin_opciones');
    rerender(
      <Provider store={store}>
        <ToolOptionsBar2D />
      </Provider>,
    );

    const deSelector = avisos.filter((a) =>
      a.includes('returned a different result when called with the same parameters'),
    );
    expect(deSelector).toEqual([]);
    spy.mockRestore();
  });
});
