// @vitest-environment jsdom
/**
 * El modo de Shift: suelto, una vez (la hoja) o dos veces (el borde).
 *
 * Shift dos veces (spec 2026-09-23 § 3.1): un toque —pulsar y soltar en menos
 * de 300 ms, sin ratón entre medias— seguido de otra pulsación antes de 400 ms
 * es el borde mientras se mantiene. Es la segunda tecla porque es la única que
 * está en todos los teclados sin ser atajo de sistema en ninguno (§ 3.5).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useShiftSostenido, type ModoShift } from '../useShiftSostenido';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  document.body.replaceChildren();
});

const tecla = (
  type: 'keydown' | 'keyup',
  o: { shiftKey?: boolean; repeat?: boolean; target?: EventTarget } = {},
) => act(() => {
  const e = new KeyboardEvent(type, {
    key: 'Shift', bubbles: true, shiftKey: o.shiftKey ?? type === 'keydown', repeat: o.repeat ?? false,
  });
  (o.target ?? window).dispatchEvent(e);
});
const esperar = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

function montar() {
  const avisos: ModoShift[] = [];
  const hook = renderHook(() => useShiftSostenido(m => avisos.push(m)));
  return {
    modo: () => hook.result.current.modoRef.current,
    sincronizar: (shiftKey: boolean) => hook.result.current.sincronizar(shiftKey),
    avisos,
  };
}

describe('useShiftSostenido — el modo', () => {
  it('Shift una vez es la hoja, y soltar lo suelta', () => {
    const { modo, avisos } = montar();
    tecla('keydown');
    expect(modo()).toBe('hoja');
    tecla('keyup');
    expect(modo()).toBe('suelto');
    expect(avisos).toEqual(['hoja', 'suelto']);
  });

  it('un toque y otra pulsación enseguida es el borde, mientras se mantenga', () => {
    const { modo } = montar();
    tecla('keydown'); esperar(80); tecla('keyup'); esperar(150);
    tecla('keydown');
    expect(modo()).toBe('borde');
    tecla('keyup');
    expect(modo()).toBe('suelto');
  });

  it('una pulsación larga no es un toque', () => {
    const { modo } = montar();
    tecla('keydown'); esperar(800); tecla('keyup'); esperar(100);
    tecla('keydown');
    expect(modo()).toBe('hoja');
  });

  it('un Shift+clic no es un toque', () => {
    const { modo } = montar();
    tecla('keydown');
    act(() => { window.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
    esperar(60); tecla('keyup'); esperar(100);
    tecla('keydown');
    expect(modo()).toBe('hoja');
  });

  it('pasado el plazo, la segunda pulsación vuelve a ser la hoja', () => {
    const { modo } = montar();
    tecla('keydown'); esperar(80); tecla('keyup'); esperar(401);
    tecla('keydown');
    expect(modo()).toBe('hoja');
  });

  it('la autorrepetición no es otra pulsación', () => {
    const { modo, avisos } = montar();
    tecla('keydown'); esperar(50);
    tecla('keydown', { repeat: true });
    tecla('keydown', { repeat: true });
    expect(modo()).toBe('hoja');
    expect(avisos).toEqual(['hoja']);
  });

  it('soltar una Shift con la otra pulsada no suelta', () => {
    const { modo } = montar();
    tecla('keydown');
    tecla('keyup', { shiftKey: true });
    expect(modo()).toBe('hoja');
  });

  it('perder el foco olvida sin avisar, y el toque de antes ya no cuenta', () => {
    const { modo, avisos } = montar();
    tecla('keydown'); esperar(80); tecla('keyup');
    act(() => { window.dispatchEvent(new Event('blur')); });
    esperar(50);
    tecla('keydown');
    expect(modo()).toBe('hoja');
    expect(avisos).toEqual(['hoja', 'suelto', 'hoja']);
  });

  it('perder el foco con Shift pulsado lo suelta sin avisar', () => {
    const { modo, avisos } = montar();
    tecla('keydown');
    act(() => { window.dispatchEvent(new Event('blur')); });
    expect(modo()).toBe('suelto');
    expect(avisos).toEqual(['hoja']);
  });

  it('un toque dentro de un campo no arma el doble', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    const { modo } = montar();
    tecla('keydown', { target: input }); esperar(80); tecla('keyup', { target: input }); esperar(100);
    tecla('keydown');
    expect(modo()).toBe('hoja');
  });

  it('con un modal delante el lienzo no escucha', () => {
    const modal = document.createElement('div');
    modal.setAttribute('aria-modal', 'true');
    document.body.appendChild(modal);
    const { modo } = montar();
    tecla('keydown');
    expect(modo()).toBe('suelto');
  });

  it('sincronizar con el ratón: Shift que el teclado no vio es la hoja, y nunca el borde', () => {
    const { modo, sincronizar, avisos } = montar();
    act(() => sincronizar(true));
    expect(modo()).toBe('hoja');
    act(() => sincronizar(false));
    expect(modo()).toBe('suelto');
    expect(avisos).toEqual([]);
  });

  it('una pulsación que el ratón corrigió no cuenta como toque', () => {
    const { modo, sincronizar } = montar();
    act(() => sincronizar(true));
    tecla('keyup'); esperar(50);
    tecla('keydown');
    expect(modo()).toBe('hoja');
  });
});

describe('useShiftSostenido — soltar se atiende siempre (revisión final)', () => {
  it('soltar Shift dentro de un campo lo suelta: la pulsación siguiente es la hoja, no el borde pegado', () => {
    // El flujo de la spec § 3.3: con el borde activo, Tab lleva el foco al chip
    // y ella suelta Shift para escribir; el keyup nace en el campo.
    const input = document.createElement('input');
    document.body.appendChild(input);
    const { modo } = montar();
    tecla('keydown'); tecla('keyup'); tecla('keydown');
    expect(modo()).toBe('borde');
    tecla('keyup', { target: input });
    expect(modo()).toBe('suelto');
    esperar(2000);
    tecla('keydown');
    expect(modo()).toBe('hoja');
  });

  it('soltar dentro de un campo no cuenta como toque', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    const { modo } = montar();
    tecla('keydown'); esperar(50);
    tecla('keyup', { target: input }); esperar(50);
    tecla('keydown');
    expect(modo()).toBe('hoja');
  });

  it('un atajo con Shift (Ctrl+Shift+Z, Shift+Tab…) no es un toque', () => {
    const { modo } = montar();
    tecla('keydown');
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', shiftKey: true, ctrlKey: true }));
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'z', shiftKey: true, ctrlKey: true }));
    });
    esperar(60); tecla('keyup'); esperar(100);
    tecla('keydown');
    expect(modo()).toBe('hoja');
  });
});
