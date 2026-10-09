// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePanelHost, conElPanel, ranurasPara, ANCHO_PARA_DOS_RANURAS } from '../usePanelHost';
import { bajarLaEscalera } from '../../shortcuts/escaleraDeLoLlamado';
import { clearJournal, getJournal } from '../../utils/telemetry/journal';

const anchoOriginal = Object.getOwnPropertyDescriptor(window, 'innerWidth');

/** Cambia el ancho de la ventana y avisa, como lo haría el navegador. */
function anchoDeVentana(px: number) {
  Object.defineProperty(window, 'innerWidth', { value: px, writable: true, configurable: true });
  window.dispatchEvent(new Event('resize'));
}

beforeEach(() => anchoDeVentana(1366));
afterEach(() => {
  if (anchoOriginal) Object.defineProperty(window, 'innerWidth', anchoOriginal);
});

describe('conElPanel', () => {
  it('con una ranura, el panel que se pide reemplaza al que estaba', () => {
    expect(conElPanel(['Layers'], 'Properties', 1)).toEqual(['Properties']);
  });

  it('con dos ranuras, el segundo se suma a la izquierda del primero', () => {
    expect(conElPanel(['Layers'], 'Properties', 2)).toEqual(['Layers', 'Properties']);
  });

  it('con las dos llenas, el tercero reemplaza al último que se abrió y el primero no se mueve', () => {
    expect(conElPanel(['Layers', 'Properties'], 'Grading', 2)).toEqual(['Layers', 'Grading']);
  });

  it('pedir uno que ya está abierto no cambia nada', () => {
    expect(conElPanel(['Layers', 'Properties'], 'Layers', 2)).toEqual(['Layers', 'Properties']);
  });
});

describe('ranurasPara', () => {
  it('una por debajo de 1600 px y dos a partir de 1600', () => {
    expect(ranurasPara(ANCHO_PARA_DOS_RANURAS - 1)).toBe(1);
    expect(ranurasPara(ANCHO_PARA_DOS_RANURAS)).toBe(2);
  });
});

describe('usePanelHost', () => {
  it('arranca sin paneles', () => {
    const { result } = renderHook(() => usePanelHost());
    expect(result.current.paneles).toEqual([]);
  });

  it('por debajo de 1600 px, Propiedades reemplaza a Capas: no hay lado izquierdo', () => {
    const { result } = renderHook(() => usePanelHost());
    act(() => result.current.togglePanel('Layers'));
    act(() => result.current.openPanel('Properties'));
    expect(result.current.paneles).toEqual(['Properties']);
  });

  it('a partir de 1600 px caben dos, uno junto al otro', () => {
    anchoDeVentana(1680);
    const { result } = renderHook(() => usePanelHost());
    act(() => result.current.togglePanel('Layers'));
    act(() => result.current.openPanel('Properties'));
    expect(result.current.paneles).toEqual(['Layers', 'Properties']);
  });

  it('al estrechar la ventana por debajo de 1600 se queda el último que se abrió, y al ensancharla no vuelve el otro', () => {
    anchoDeVentana(1680);
    const { result } = renderHook(() => usePanelHost());
    act(() => result.current.togglePanel('Layers'));
    act(() => result.current.togglePanel('Grading'));
    act(() => anchoDeVentana(1366));
    expect(result.current.paneles).toEqual(['Grading']);
    act(() => anchoDeVentana(1680));
    expect(result.current.paneles).toEqual(['Grading']);
  });

  it('openPanel nunca cierra: pedir dos veces el mismo lo deja abierto', () => {
    const { result } = renderHook(() => usePanelHost());
    act(() => result.current.openPanel('Properties'));
    act(() => result.current.openPanel('Properties'));
    expect(result.current.paneles).toEqual(['Properties']);
  });

  it('togglePanel cierra el que ya estaba abierto', () => {
    const { result } = renderHook(() => usePanelHost());
    act(() => result.current.togglePanel('Avatar'));
    act(() => result.current.togglePanel('Avatar'));
    expect(result.current.paneles).toEqual([]);
  });

  it('closePanel cierra solo ese, y el otro pasa al borde', () => {
    anchoDeVentana(1680);
    const { result } = renderHook(() => usePanelHost());
    act(() => result.current.togglePanel('Layers'));
    act(() => result.current.togglePanel('Properties'));
    act(() => result.current.closePanel('Layers'));
    expect(result.current.paneles).toEqual(['Properties']);
  });

  it('Escape cierra todos a la vez: un solo peldaño, el de los paneles', () => {
    anchoDeVentana(1680);
    const { result } = renderHook(() => usePanelHost());
    act(() => { result.current.openPanel('Properties'); result.current.openPanel('Layers'); });
    expect(result.current.paneles).toEqual(['Properties', 'Layers']);
    act(() => { expect(bajarLaEscalera()).toBe('paneles'); });
    expect(result.current.paneles).toEqual([]);
  });

  it('la caja negra ve abrir, reemplazar y cerrar', () => {
    clearJournal();
    const { result } = renderHook(() => usePanelHost());
    act(() => result.current.togglePanel('Layers'));
    act(() => result.current.openPanel('Properties'));
    act(() => result.current.closePanel('Properties'));
    const eventos = getJournal().events
      .filter((e) => e.kind === 'ui' && e.name === 'panel')
      .map((e) => [e.data?.panel, e.data?.abierto]);
    expect(eventos).toEqual([
      ['Layers', true],
      ['Properties', true],
      ['Layers', false],
      ['Properties', false],
    ]);
  });
});
