/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import toolReducer from '../../../store/toolSlice';
import editorReducer, { setActiveTool } from '../../../store/editorSlice';
import { toolRegistry } from '../../../tools';
import type { ToolDefinition } from '../../../tools/types';
import type { Tool2D } from '../../../types/types';
import SeccionDelPatron from '../SeccionDelPatron';
import { ShortcutProvider } from '../../../shortcuts/ShortcutProvider';
import { HOLGURA_PX } from '../anchoDelPie';

/**
 * El ancho de la sección del patrón en la línea al pie (spec 2026-10-02 § 5.3,
 * P5): la ranura mide lo que la sección necesita (`flex: 0 1 auto`), así que si lo
 * que necesita depende de lo que está plegado en «Más», plegar una opción encoge la
 * ranura, la ranura encogida pliega otra, y así hasta cero (medido en el navegador:
 * Desplazar contorno a 1100 px perdía sus cuatro opciones y su frase quedaba en
 * 173 px). La sección tiene que publicar lo que necesita para mostrarlo TODO y
 * pedir ese ancho, venga lo que venga de lo plegado.
 *
 * jsdom no mide, y aquí el bucle ES la medida: la maqueta de abajo hace lo que
 * hace el flex de la ranura (la sección mide lo que pide —su `width`, y si no lo
 * tiene, su contenido— hasta lo que la línea le deja). Con medidas fijas el bucle
 * no se vería. El navegador de verdad lo mide `linea-al-pie.spec.ts`.
 */
const IconoVacio: React.FC<{ size?: number }> = () => null;
const CUATRO: ToolDefinition = {
  id: '__pie_cuatro',
  name: 'Herramienta de cuatro',
  context: '2d',
  icon: IconoVacio,
  options: [
    { id: 'a', label: 'Una', type: 'number', value: 1, min: 0, max: 10, step: 1 },
    { id: 'b', label: 'Dos', type: 'number', value: 2, min: 0, max: 10, step: 1 },
    { id: 'c', label: 'Tres', type: 'number', value: 3, min: 0, max: 10, step: 1 },
    { id: 'd', label: 'Cuatro', type: 'number', value: 4, min: 0, max: 10, step: 1 },
  ],
};
const NINGUNA: ToolDefinition = { id: '__pie_ninguna', name: 'Herramienta sin opciones', context: '2d', icon: IconoVacio, options: [] };
toolRegistry.registerTool(CUATRO);
toolRegistry.registerTool(NINGUNA);

const QUIEN = 100;
const OPCION = 150;
/** Lo que «Más» ocupa de verdad. El plegado le reserva 64: sobra, a propósito. */
const MAS = 58;
let linea = 600;
let fraseNatural = 173;

const offsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
const scrollWidth = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollWidth');
const clientWidth = Object.getOwnPropertyDescriptor(Element.prototype, 'clientWidth');
const RO = (globalThis as { ResizeObserver?: unknown }).ResizeObserver;

beforeEach(() => {
  linea = 600;
  fraseNatural = 173;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get(this: HTMLElement) {
      if (this.classList.contains('opcion-del-pie')) return OPCION;
      if (this.classList.contains('seccion-del-patron__quien')) return QUIEN;
      return 0;
    },
  });
  Object.defineProperty(Element.prototype, 'scrollWidth', {
    configurable: true,
    get(this: Element) { return this.classList.contains('seccion-del-patron__texto') ? fraseNatural : 0; },
  });
  Object.defineProperty(Element.prototype, 'clientWidth', {
    configurable: true,
    get(this: Element) {
      if (!this.classList.contains('seccion-del-patron')) return 0;
      const visibles = this.querySelectorAll('.seccion-del-patron__opciones > .opcion-del-pie').length;
      const mas = this.querySelector('.seccion-del-patron__mas') ? MAS : 0;
      const contenido = QUIEN + OPCION * visibles + mas + fraseNatural;
      const pide = parseFloat((this as HTMLElement).style.width);
      return Math.min(Number.isNaN(pide) ? contenido : pide, linea);
    },
  });
});

afterEach(() => {
  cleanup();
  if (offsetWidth) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', offsetWidth);
  if (scrollWidth) Object.defineProperty(Element.prototype, 'scrollWidth', scrollWidth);
  if (clientWidth) Object.defineProperty(Element.prototype, 'clientWidth', clientWidth);
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = RO;
});

function arbol(store: ReturnType<typeof crearStore>, texto: string, tipo: 'fase' | 'falta' | 'desenlace' = 'fase') {
  return (
    <Provider store={store}>
      <ShortcutProvider><SeccionDelPatron frase={{ texto, tipo }} /></ShortcutProvider>
    </Provider>
  );
}
function crearStore(herramienta: string) {
  const store = configureStore({ reducer: { tools: toolReducer, editor: editorReducer } });
  store.dispatch(setActiveTool(herramienta as Tool2D));
  return store;
}
const montar = (herramienta = '__pie_cuatro', texto = 'La frase de la fase') => {
  const store = crearStore(herramienta);
  const vista = render(arbol(store, texto));
  return { store, ...vista, texto };
};
const seccion = () => document.querySelector<HTMLElement>('.seccion-del-patron')!;
const aLaVista = () => document.querySelectorAll('.seccion-del-patron__opciones > .opcion-del-pie').length;

// Hueco para las opciones = línea − «quién» (100) − 200 de la frase. Con «Más»
// (64) caben las que quepan en lo que sobra; el resto, a un clic.
describe('la sección pide lo que necesita, no lo que se ve', () => {
  it.each([
    // frase de 173 (< 200): hueco 600 − 100 − 200 = 300 → 64 + 150 ≤ 300, + 150 no.
    { caso: 'una frase de menos de 200 px', linea: 600, frase: 173, visibles: 1 },
    // frase de 204 (≥ 200): hueco 700 − 100 − 200 = 400 → 64 + 150 + 150 ≤ 400, + 150 no.
    { caso: 'una frase de más de 200 px', linea: 700, frase: 204, visibles: 2 },
  ])('$caso: lo que cabe se queda a la vista y no se pliega en cascada hasta cero', ({ linea: l, frase, visibles }) => {
    linea = l;
    fraseNatural = frase;
    montar();
    expect(aLaVista(), 'plegar encogió la ranura y la ranura plegó otra').toBe(visibles);
    expect(document.querySelector('.seccion-del-patron__mas')).not.toBeNull();
  });

  it('pide, de ancho, lo que necesita para mostrarlo todo: «quién», las cuatro opciones y la frase (200 como mínimo) con su holgura', () => {
    montar();
    // 100 + 4×150 + max(173, 200) + holgura; las separaciones valen 0 en jsdom.
    expect(seccion().style.width).toBe(`${QUIEN + 4 * OPCION + 200 + HOLGURA_PX}px`);
  });

  it('pide lo mismo plegada o no: lo plegado no cambia lo que necesita', () => {
    linea = 600;
    montar();
    const plegada = seccion().style.width;
    expect(aLaVista(), 'el caso no se ejerce: no hay nada plegado').toBeLessThan(4);
    cleanup();
    linea = 5000;
    montar();
    expect(aLaVista(), 'el caso no se ejerce: no se pliega nada').toBe(4);
    expect(seccion().style.width).toBe(plegada);
  });

  it('una frase más larga pide más ancho', () => {
    fraseNatural = 564;
    montar();
    expect(seccion().style.width).toBe(`${QUIEN + 4 * OPCION + 564 + HOLGURA_PX}px`);
  });

  it('cuando la frase cambia, el ancho que pide cambia con ella', () => {
    const { store, rerender } = montar('__pie_cuatro', 'Una frase corta');
    expect(seccion().style.width).toBe(`${QUIEN + 4 * OPCION + 200 + HOLGURA_PX}px`);
    fraseNatural = 564;
    rerender(arbol(store, 'Una frase mucho más larga que la de antes'));
    expect(seccion().style.width).toBe(`${QUIEN + 4 * OPCION + 564 + HOLGURA_PX}px`);
  });

  it('si solo cambia el tipo de la frase (otro relleno, el mismo texto), el ancho que pide cambia', () => {
    // «Lo que falta» lleva `padding: 2px 8px`: 16 px más con el mismo texto.
    fraseNatural = 300;
    const { store, rerender } = montar('__pie_cuatro', 'Falta la pieza');
    expect(seccion().style.width).toBe(`${QUIEN + 4 * OPCION + 300 + HOLGURA_PX}px`);
    fraseNatural = 316;
    rerender(arbol(store, 'Falta la pieza', 'falta'));
    expect(seccion().style.width).toBe(`${QUIEN + 4 * OPCION + 316 + HOLGURA_PX}px`);
  });

  it('otra herramienta, otra medida: sin opciones no pide ancho', () => {
    const { store } = montar();
    expect(seccion().style.width).not.toBe('');
    act(() => { store.dispatch(setActiveTool('__pie_ninguna' as Tool2D)); });
    expect(seccion().style.width, 'se quedó con el ancho de la herramienta de antes').toBe('');
  });

  it('no se mide lo que no se pinta: con la ranura escondida (la vista 3D sola) no se pide ancho ni se pliega nada', () => {
    linea = 0;
    montar();
    expect(aLaVista(), 'escondida, la sección plegó todo por un hueco negativo').toBe(4);
    expect(seccion().style.width).toBe('');
  });
});
