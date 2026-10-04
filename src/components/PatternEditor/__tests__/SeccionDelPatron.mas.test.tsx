/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import toolReducer from '../../../store/toolSlice';
import editorReducer, { setActiveTool } from '../../../store/editorSlice';
import { toolRegistry } from '../../../tools';
import type { ToolDefinition } from '../../../tools/types';
import type { Tool2D } from '../../../types/types';
import { clearJournal, getJournal } from '../../../utils/telemetry/journal';
import SeccionDelPatron from '../SeccionDelPatron';

/**
 * «Más» (spec 2026-10-02 § 5.3): con la frase en sus 200 px, las opciones que
 * no caben pasan a un botón al final, y desde ahí siguen a un clic. jsdom no
 * mide: aquí se le dan medidas de mentira (cada control 150 px, «quién» 100,
 * la sección 600) y un `ResizeObserver` que existe. El navegador de verdad lo
 * mide `linea-al-pie.spec.ts`.
 */
const IconoVacio: React.FC<{ size?: number }> = () => null;
const TRES: ToolDefinition = {
  id: '__pie_tres',
  name: 'Herramienta ancha',
  context: '2d',
  icon: IconoVacio,
  options: [
    { id: 'numero', label: 'Un número', type: 'number', value: 5, min: 0, max: 10, step: 1 },
    { id: 'lista', label: 'Una lista', type: 'select', value: 'a', choices: [{ label: 'Opción A', value: 'a' }, { label: 'Opción B', value: 'b' }] },
    { id: 'interruptor', label: 'Un interruptor', type: 'toggle', value: false },
  ],
};
toolRegistry.registerTool(TRES);

const ancho = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
const hueco = Object.getOwnPropertyDescriptor(Element.prototype, 'clientWidth');
const RO = (globalThis as { ResizeObserver?: unknown }).ResizeObserver;

beforeEach(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get(this: HTMLElement) {
      if (this.classList.contains('opcion-del-pie')) return 150;
      if (this.classList.contains('seccion-del-patron__quien')) return 100;
      if (this.classList.contains('seccion-del-patron__menu')) return 400;
      return 0;
    },
  });
  Object.defineProperty(Element.prototype, 'clientWidth', {
    configurable: true,
    get(this: Element) { return this.classList.contains('seccion-del-patron') ? 600 : 0; },
  });
  clearJournal();
});

afterEach(() => {
  cleanup();
  if (ancho) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', ancho);
  if (hueco) Object.defineProperty(Element.prototype, 'clientWidth', hueco);
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = RO;
});

function montar() {
  const store = configureStore({ reducer: { tools: toolReducer, editor: editorReducer } });
  store.dispatch(setActiveTool('__pie_tres' as Tool2D));
  render(<Provider store={store}><SeccionDelPatron frase={null} /></Provider>);
  return store;
}

// Hueco para las opciones: 600 − 100 de «quién» − 200 de la frase = 300. Con
// «Más» (64) cabe una de 150; las otras dos se pliegan.
describe('lo que no cabe pasa a «Más»', () => {
  it('a la vista, la primera y «Más»; las otras dos, a un clic', () => {
    const store = montar();
    expect(screen.getByLabelText('Un número')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Opción B' })).toBeNull();
    const mas = screen.getByRole('button', { name: 'Más' });
    expect(mas.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(mas);
    const menu = screen.getByRole('group', { name: 'Más opciones de Herramienta ancha' });
    expect(menu.parentElement, 'el menú cuelga de <body>').toBe(document.body);
    expect(menu.getAttribute('data-material')).toBe('papel');
    expect(menu.getAttribute('data-superficie')).toBe('menu');
    fireEvent.click(within(menu).getByRole('button', { name: 'Opción B' }));
    expect(store.getState().tools.toolOptions.__pie_tres.lista).toBe('b');
    expect(within(menu).getByRole('button', { name: 'Un interruptor' })).toBeTruthy();
  });

  it('abierto con el teclado, el foco entra al menú; Escape lo cierra y vuelve a «Más»', () => {
    montar();
    const mas = screen.getByRole('button', { name: 'Más' });
    // Un clic que viene del teclado (Enter o Espacio) llega con `detail` 0.
    fireEvent.click(mas, { detail: 0 });
    const menu = screen.getByRole('group', { name: /^Más opciones de/ });
    expect(menu.contains(document.activeElement), 'el foco se quedó fuera del menú').toBe(true);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('group', { name: /^Más opciones de/ })).toBeNull();
    expect(document.activeElement).toBe(mas);
  });

  it('abierto con el ratón, el foco se queda donde estaba: Enter sigue siendo de la herramienta', () => {
    // Con el foco dentro del menú, el Enter de «aplica el desplazamiento»
    // volvía a pulsar la primera alternativa del menú.
    montar();
    const antes = document.activeElement;
    fireEvent.click(screen.getByRole('button', { name: 'Más' }), { detail: 1 });
    expect(screen.getByRole('group', { name: /^Más opciones de/ })).toBeTruthy();
    expect(document.activeElement, 'abrir con el ratón movió el foco al menú').toBe(antes);
  });

  it('con el ratón, sus botones no se quedan con el foco; los campos sí', () => {
    montar();
    expect(document.querySelector('.seccion-del-patron')?.hasAttribute('data-botonera')).toBe(true);
    const mas = screen.getByRole('button', { name: 'Más' });
    // `fireEvent` devuelve false cuando alguien llamó a `preventDefault`.
    expect(fireEvent.mouseDown(mas), '«Más» se queda con el foco').toBe(false);
    fireEvent.click(mas, { detail: 1 });
    const menu = screen.getByRole('group', { name: /^Más opciones de/ });
    expect(menu.hasAttribute('data-botonera')).toBe(true);
    expect(fireEvent.mouseDown(within(menu).getByRole('button', { name: 'Opción B' })), 'un botón del menú se queda con el foco').toBe(false);
    expect(fireEvent.mouseDown(screen.getByLabelText('Un número')), 'un campo tiene que poder recibir el foco').toBe(true);
  });

  it('un clic suelta el foco que el teclado dejó en otro botón de la botonera', () => {
    // Si no, el Enter siguiente volvería a pulsar ESE botón, el que ya no
    // es el que María acaba de elegir.
    montar();
    const mas = screen.getByRole('button', { name: 'Más' });
    fireEvent.click(mas, { detail: 0 });
    const menu = screen.getByRole('group', { name: /^Más opciones de/ });
    expect(menu.contains(document.activeElement), 'el caso no se ejerce').toBe(true);
    fireEvent.mouseDown(within(menu).getByRole('button', { name: 'Un interruptor' }));
    expect(menu.contains(document.activeElement), 'el foco se quedó en el botón de antes').toBe(false);
  });

  it('no se sale por la derecha: con «Más» cerca del borde, el menú se corre a la izquierda', () => {
    const rect = Element.prototype.getBoundingClientRect;
    const ventana = Object.getOwnPropertyDescriptor(window, 'innerWidth');
    Element.prototype.getBoundingClientRect = function (this: Element) {
      if (this.classList.contains('seccion-del-patron__mas')) {
        return { left: 600, right: 664, top: 600, bottom: 624, width: 64, height: 24, x: 600, y: 600, toJSON() { return this; } } as DOMRect;
      }
      return rect.call(this);
    };
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 });
    try {
      montar();
      fireEvent.click(screen.getByRole('button', { name: 'Más' }), { detail: 1 });
      const menu = screen.getByRole('group', { name: /^Más opciones de/ });
      // 400 de ancho en una ventana de 800: empieza, como mucho, en 384.
      expect(parseFloat(menu.style.left), 'el menú se sale por la derecha').toBeLessThanOrEqual(800 - 400 - 16);
      expect(parseFloat(menu.style.left)).toBeGreaterThanOrEqual(16);
    } finally {
      Element.prototype.getBoundingClientRect = rect;
      if (ventana) Object.defineProperty(window, 'innerWidth', ventana);
    }
  });

  it('deja rastro en la bitácora: cuántas quedaron a la vista, y el menú al abrir y cerrar', () => {
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'Más' }));
    fireEvent.click(screen.getByRole('button', { name: 'Más' }));
    const ui = getJournal().events.filter((e) => e.kind === 'ui').map((e) => [e.name, e.data]);
    expect(ui).toContainEqual(['linea-al-pie', { herramienta: '__pie_tres', aLaVista: 1, total: 3, hueco: 300 }]);
    expect(ui).toContainEqual(['mas', { abierto: true, herramienta: '__pie_tres' }]);
    expect(ui).toContainEqual(['mas', { abierto: false, herramienta: '__pie_tres' }]);
  });

  it('con un modal encima, el menú se cierra (#1125)', () => {
    const store = configureStore({ reducer: { tools: toolReducer, editor: editorReducer } });
    store.dispatch(setActiveTool('__pie_tres' as Tool2D));
    const { rerender } = render(<Provider store={store}><SeccionDelPatron frase={null} /></Provider>);
    fireEvent.click(screen.getByRole('button', { name: 'Más' }));
    expect(screen.getByRole('group', { name: /^Más opciones de/ })).toBeTruthy();
    rerender(<Provider store={store}><SeccionDelPatron frase={null} inerte /></Provider>);
    expect(screen.queryByRole('group', { name: /^Más opciones de/ })).toBeNull();
  });
});
