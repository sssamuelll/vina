// @vitest-environment jsdom
/**
 * Rectángulo por medidas (spec 2026-08-29 § 6, María #191): un clic suelto
 * crea el rectángulo con el Ancho y el Alto de la barra, esquina superior
 * izquierda en el clic; el arrastre dibuja lo dibujado y lo escribe en la
 * barra. Medido antes: la barra pintaba Ancho/Alto y la herramienta los
 * ignoraba, y el clic suelto no hacía nada.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { renderHook, act, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import toolReducer, { setToolOption } from '../../../store/toolSlice';
import { useRectangleTool } from '../useRectangleTool';
import { clearJournal, getJournal } from '../../../utils/telemetry/journal';

afterEach(cleanup);

describe('useRectangleTool — bitácora de salidas mudas', () => {
  const releases = () => getJournal().events.filter((e) => e.name === 'rectangle:release').map((e) => e.data);

  it('el release del botón derecho y un tamaño de barra en cero quedan registrados; crear no (ya es una acción)', () => {
    clearJournal();
    const { store, tool, press, move, release, onComplete } = setup();
    press(100, 100); move(180, 160);
    act(() => tool().handleMouseUp(ev(180, 160, 2)));
    release(180, 160);
    act(() => { store.dispatch(setToolOption({ toolId: 'rectangle', optionId: 'width', value: 0 })); });
    press(400, 300); release(400, 300);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(releases()).toEqual([
      { outcome: 'ignoredButton', button: 2 },
      // el arrastre anterior dejó Alto 60 en la barra; Ancho 0 es lo que la anula
      { outcome: 'tooSmall', width: 0, height: 60, source: 'bar' },
    ]);
  });
});

const ev = (x: number, y: number, button = 0) => ({
  button, clientX: x, clientY: y,
  currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0 }) },
}) as unknown as React.MouseEvent<SVGSVGElement>;

function setup() {
  const store = configureStore({ reducer: { tools: toolReducer } });
  const onComplete = vi.fn();
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
  const hook = renderHook(() => useRectangleTool(1, { x: 0, y: 0 }, onComplete), { wrapper });
  const tool = () => hook.result.current;
  const press = (x: number, y: number, button = 0) => act(() => tool().handleMouseDown(ev(x, y, button)));
  const move = (x: number, y: number) => act(() => tool().handleMouseMove(ev(x, y)));
  const release = (x: number, y: number) => act(() => tool().handleMouseUp(ev(x, y)));
  return { store, tool, press, move, release, onComplete };
}

const bbox = (outline: Array<{ type: string; values: number[] }>) => {
  const xs = outline.flatMap(c => c.values.filter((_, i) => i % 2 === 0));
  const ys = outline.flatMap(c => c.values.filter((_, i) => i % 2 === 1));
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
};

describe('useRectangleTool — clic crea con la barra', () => {
  it('sin nada escrito, el clic crea 100×100 con la esquina en el clic', () => {
    const { press, release, onComplete } = setup();
    press(400, 300); release(400, 300);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(bbox(onComplete.mock.calls[0][0].outline)).toEqual({ x: 400, y: 300, w: 100, h: 100 });
  });

  it('con Ancho 300 y Alto 150 en la barra, el clic crea 300×150', () => {
    const { store, press, release, onComplete } = setup();
    act(() => {
      store.dispatch(setToolOption({ toolId: 'rectangle', optionId: 'width', value: 300 }));
      store.dispatch(setToolOption({ toolId: 'rectangle', optionId: 'height', value: 150 }));
    });
    press(400, 300); release(400, 300);
    expect(bbox(onComplete.mock.calls[0][0].outline)).toEqual({ x: 400, y: 300, w: 300, h: 150 });
  });

  it('un arrastre de 3 px sigue siendo un clic', () => {
    const { press, move, release, onComplete } = setup();
    press(400, 300); move(402, 302); release(402, 302);
    expect(bbox(onComplete.mock.calls[0][0].outline)).toEqual({ x: 400, y: 300, w: 100, h: 100 });
  });
});

describe('useRectangleTool — el arrastre dibuja y escribe en la barra', () => {
  it('crea lo dibujado y deja Ancho/Alto en la barra', () => {
    const { store, press, move, release, onComplete } = setup();
    press(100, 100); move(140, 130); move(180, 160); release(180, 160);
    expect(bbox(onComplete.mock.calls[0][0].outline)).toEqual({ x: 100, y: 100, w: 80, h: 60 });
    expect(store.getState().tools.toolOptions.rectangle).toEqual({ width: 80, height: 60 });
  });

  it('el botón derecho no arma', () => {
    const { press, release, onComplete } = setup();
    press(100, 100, 2); release(100, 100);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('el release del botón derecho a mitad de arrastre no crea nada y el press sigue vivo', () => {
    const { tool, press, move, onComplete } = setup();
    press(100, 100); move(180, 160);
    act(() => tool().handleMouseUp(ev(180, 160, 2)));
    expect(onComplete).not.toHaveBeenCalled();
    expect(tool().isArmed()).toBe(true);
  });

  it('Escape con press vivo cancela y se consume; el release ya no crea', () => {
    const { tool, press, release, onComplete } = setup();
    press(100, 100);
    expect(tool().isArmed()).toBe(true);
    let consumed = false;
    act(() => { consumed = tool().handleKeyDown(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(consumed).toBe(true);
    release(150, 150);
    expect(onComplete).not.toHaveBeenCalled();
    expect(tool().isArmed()).toBe(false);
  });

  it('sin press vivo, Escape no se consume', () => {
    const { tool } = setup();
    let consumed = true;
    act(() => { consumed = tool().handleKeyDown(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(consumed).toBe(false);
  });
});

describe('useRectangleTool — creación caliente (cotas vivas, spec 2026-08-30 § 3.1)', () => {
  it('tras crear, hotId es el id que devolvió onComplete; enfriar lo borra y un clic nuevo lo vuelve a poner', () => {
    const { tool, press, release, onComplete } = setup();
    onComplete.mockReturnValueOnce('id-1').mockReturnValueOnce('id-2');
    expect(tool().hotId).toBeNull();
    press(400, 300); release(400, 300);
    expect(tool().hotId).toBe('id-1');
    act(() => tool().enfriar());
    expect(tool().hotId).toBeNull();
    press(600, 300); release(600, 300);
    expect(tool().hotId).toBe('id-2');
  });
});
