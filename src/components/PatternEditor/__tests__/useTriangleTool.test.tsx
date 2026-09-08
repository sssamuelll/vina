// @vitest-environment jsdom
/**
 * Triángulo por medidas (#1111, tanda 8 — María pidió «círculo y triángulo»):
 * un clic suelto crea con la Base y la Altura de la barra, esquina del press
 * en la caja — el mismo "clicas con el izquierdo y lo crea" de Rectángulo y
 * Círculo. El arrastre dibuja lo dibujado y lo escribe en la barra.
 *
 * Calcado de `useRectangleTool.test.tsx`, con dos añadidos que ese archivo no
 * necesita: cuál de las DOS figuras salió (isósceles / rectángulo) y DÓNDE
 * cae cada vértice — un assert que solo cuenta vértices pasa en verde con la
 * figura equivocada dentro.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { renderHook, act, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import toolReducer, { setToolOption } from '../../../store/toolSlice';
import { useTriangleTool } from '../useTriangleTool';
import { suscribirNoPasoNada } from '../noPasoNada';
import { clearJournal, getJournal } from '../../../utils/telemetry/journal';

afterEach(cleanup);

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
  const hook = renderHook(() => useTriangleTool(1, { x: 0, y: 0 }, onComplete), { wrapper });
  const tool = () => hook.result.current;
  const press = (x: number, y: number, button = 0) => act(() => tool().handleMouseDown(ev(x, y, button)));
  const move = (x: number, y: number) => act(() => tool().handleMouseMove(ev(x, y)));
  const release = (x: number, y: number, button = 0) => act(() => tool().handleMouseUp(ev(x, y, button)));
  return { store, tool, press, move, release, onComplete };
}

/** Los tres puntos dibujados (sin el Z de cierre), en orden de outline. */
const puntos = (outline: Array<{ type: string; values: number[] }>) =>
  outline.filter((c) => c.type !== 'Z').map((c) => ({ x: c.values[0], y: c.values[1] }));

describe('useTriangleTool — clic crea con la barra (isósceles por defecto)', () => {
  it('sin nada escrito, el clic inscribe el isósceles 100×100 con la esquina en el clic', () => {
    const { press, release, onComplete } = setup();
    press(400, 300); release(400, 300);
    expect(onComplete).toHaveBeenCalledTimes(1);
    // Ápice arriba-centro, base abajo: exactamente lo que decide la figura por
    // defecto, no "son tres puntos".
    expect(puntos(onComplete.mock.calls[0][0].outline)).toEqual([
      { x: 450, y: 300 },
      { x: 500, y: 400 },
      { x: 400, y: 400 },
    ]);
  });

  it('con Base 300 y Altura 150 en la barra, el clic inscribe 300×150', () => {
    const { store, press, release, onComplete } = setup();
    act(() => {
      store.dispatch(setToolOption({ toolId: 'triangle', optionId: 'base', value: 300 }));
      store.dispatch(setToolOption({ toolId: 'triangle', optionId: 'altura', value: 150 }));
    });
    press(400, 300); release(400, 300);
    expect(puntos(onComplete.mock.calls[0][0].outline)).toEqual([
      { x: 550, y: 300 },
      { x: 700, y: 450 },
      { x: 400, y: 450 },
    ]);
  });

  it('un arrastre de 3 px sigue siendo un clic', () => {
    const { press, move, release, onComplete } = setup();
    press(400, 300); move(402, 302); release(402, 302);
    expect(puntos(onComplete.mock.calls[0][0].outline)).toEqual([
      { x: 450, y: 300 },
      { x: 500, y: 400 },
      { x: 400, y: 400 },
    ]);
  });
});

describe('useTriangleTool — el arrastre dibuja el isósceles inscrito y escribe en la barra', () => {
  it('crea lo dibujado (ápice arriba-centro) y deja la barra como estaba', () => {
    const { store, press, move, release, onComplete } = setup();
    const antes = store.getState().tools.toolOptions.triangle;
    press(100, 100); move(140, 130); move(180, 160); release(180, 160);
    expect(puntos(onComplete.mock.calls[0][0].outline)).toEqual([
      { x: 140, y: 100 },
      { x: 180, y: 160 },
      { x: 100, y: 160 },
    ]);
    // Dibujar no reescribe la barra (reunión María 07-09): igual que su
    // hermano el rectángulo, cada pieza es de un tamaño distinto.
    expect(store.getState().tools.toolOptions.triangle).toEqual(antes);
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

describe('useTriangleTool — el rectángulo: el ángulo recto cae en la esquina del press', () => {
  it('arrastre derecha-abajo: el recto queda en el press (esquina superior izquierda de la caja)', () => {
    const { store, press, move, release, onComplete } = setup();
    act(() => { store.dispatch(setToolOption({ toolId: 'triangle', optionId: 'shapeType', value: 'right' })); });
    press(100, 100); move(140, 130); move(180, 160); release(180, 160);
    expect(puntos(onComplete.mock.calls[0][0].outline)).toEqual([
      { x: 100, y: 100 }, // el recto: exactamente el punto del press
      { x: 180, y: 100 },
      { x: 100, y: 160 },
    ]);
  });

  it('arrastre izquierda-arriba: el recto sigue en el press, ahora la esquina opuesta de la MISMA caja', () => {
    const { store, press, move, release, onComplete } = setup();
    act(() => { store.dispatch(setToolOption({ toolId: 'triangle', optionId: 'shapeType', value: 'right' })); });
    press(180, 160); move(140, 130); move(100, 100); release(100, 100);
    expect(puntos(onComplete.mock.calls[0][0].outline)).toEqual([
      { x: 180, y: 160 }, // el recto: otra vez el punto del press, no la esquina fija de la caja
      { x: 100, y: 160 },
      { x: 180, y: 100 },
    ]);
  });

  it('clic suelto (sin arrastre): el recto cae en la esquina del clic, como el rectángulo', () => {
    const { store, press, release, onComplete } = setup();
    act(() => { store.dispatch(setToolOption({ toolId: 'triangle', optionId: 'shapeType', value: 'right' })); });
    press(400, 300); release(400, 300);
    expect(puntos(onComplete.mock.calls[0][0].outline)).toEqual([
      { x: 400, y: 300 },
      { x: 500, y: 300 },
      { x: 400, y: 400 },
    ]);
  });
});

describe('useTriangleTool — arrastrar con medida cero no crea nada y deja el aviso', () => {
  const releases = () => getJournal().events.filter((e) => e.name === 'triangle:release').map((e) => e.data);

  it('clic suelto con Base en cero: no crea pieza y noPasoNada avisa con su razón', () => {
    clearJournal();
    const { store, press, release, onComplete } = setup();
    const avisos: Array<{ razon: string; texto: string }> = [];
    const cancelar = suscribirNoPasoNada((a) => avisos.push({ razon: a.razon, texto: a.texto }));
    act(() => { store.dispatch(setToolOption({ toolId: 'triangle', optionId: 'base', value: 0 })); });
    press(400, 300); release(400, 300);
    cancelar();
    expect(onComplete).not.toHaveBeenCalled();
    expect(avisos).toHaveLength(1);
    expect(avisos[0].razon).toBe('triangulo:medida-en-cero');
    expect(avisos[0].texto).toMatch(/base/i);
    expect(avisos[0].texto).toMatch(/altura/i);
    expect(releases()).toEqual([{ outcome: 'tooSmall', base: 0, altura: 100, source: 'bar' }]);
  });

  it('arrastre colapsado a una línea (alto 0): no crea pieza y queda en la bitácora', () => {
    clearJournal();
    const { press, move, release, onComplete } = setup();
    press(100, 100); move(180, 100); release(180, 100); // dx=80, dy=0: es arrastre, no clic
    expect(onComplete).not.toHaveBeenCalled();
    expect(releases()).toEqual([{ outcome: 'tooSmall', base: 80, altura: 0, source: 'drag' }]);
  });
});

describe('useTriangleTool — creación caliente (cotas vivas, spec 2026-08-30 § 3.1)', () => {
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
