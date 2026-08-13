// @vitest-environment jsdom
/**
 * El piquete entra en el gesto unificado (#1029, tanda 2b).
 *
 * La ley del spec § 2: **el press manda el OBJETO, el release manda el VALOR**.
 * Para el piquete eso significa que deja de nacer en el `mousedown` y nace en
 * el `mouseup`; si hubo arrastre, nace a la distancia arrastrada y sin modal,
 * porque ella ya dijo la cantidad con la mano.
 *
 * Los números de la curva salen de un oráculo independiente (4M muestras de
 * longitud de arco sobre la cúbica), no de correr la implementación y copiar
 * lo que dio. Van escritos en los comentarios de cada test.
 *
 * Spec: docs/superpowers/specs/2026-08-11-arrastre-unificado-2d-design.md
 * § 3.2 (la referencia y el valor), § 3.4 (soltar fuera del borde).
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createElement } from 'react';
import type React from 'react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import toolReducer from '../../../store/toolSlice';
import { useNotchTool } from '../useNotchTool';
import type { InternalLine, NotchAnchor, PatternPiece } from '../../../types/types';

/**
 * Recta de 100 arriba, costado curvo, recta de vuelta y cierre.
 * Perímetro medido: 604,8816 mm — la curva sola mide 204,8816.
 * La pieza no trae `edges`, así que cada comando ES su borde semántico
 * (`edgeRangeForCommand` cae a `[i, i+1]`): el borde de arriba es [0, 100] de
 * arco y el costado curvo [100, 304,8816].
 */
const OUTLINE: PatternPiece['outline'] = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [100, 0] },
  { type: 'C', values: [130, 60, 120, 140, 100, 200] },
  { type: 'L', values: [0, 200] },
  { type: 'Z', values: [] },
];

function pieza(internals: InternalLine[] = []): PatternPiece {
  return {
    id: 'p1',
    name: 'Delantero',
    outline: OUTLINE,
    position: { x: 0, y: 0 },
    rotation: 0,
    mirrored: false,
    seamAllowance: 0,
    internals,
    active: true,
    createdAt: 0,
    updatedAt: 0,
  };
}

/** Un piquete guardado a 60 mm del origen, sobre el borde de arriba. */
const PIQUETE_EN_60: InternalLine = {
  id: 'n-60',
  type: 'notch',
  path: [{ type: 'M', values: [60, 0] }, { type: 'L', values: [60, 8] }],
};

// Con zoom 1, pan (0,0) y el lienzo en el origen, pantalla y patrón coinciden.
const ev = (x: number, y: number) =>
  ({
    button: 0,
    clientX: x,
    clientY: y,
    currentTarget: {
      getBoundingClientRect: () => ({
        left: 0, top: 0, width: 800, height: 600,
        right: 800, bottom: 600, x: 0, y: 0, toJSON: () => ({}),
      }),
    },
  }) as unknown as React.MouseEvent<SVGSVGElement>;

function setup(internals: InternalLine[] = []) {
  const store = configureStore({ reducer: { tools: toolReducer } });
  const onAddNotch = vi.fn();
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    createElement(Provider, { store, children });
  const { result } = renderHook(
    () => useNotchTool(1, { x: 0, y: 0 }, [pieza(internals)], onAddNotch),
    { wrapper },
  );
  return { result, onAddNotch };
}

/** El gesto completo. Sin `hasta` es un clic: se suelta donde se apretó. */
function gesto(
  h: ReturnType<typeof setup>,
  desde: [number, number],
  hasta?: [number, number],
) {
  act(() => { h.result.current.handleMouseDown(ev(...desde)); });
  if (hasta) {
    act(() => { h.result.current.handleMouseMove(ev(...hasta)); });
    act(() => { h.result.current.handleMouseUp(ev(...hasta)); });
  } else {
    act(() => { h.result.current.handleMouseUp(ev(...desde)); });
  }
}

const lineaCreada = (h: ReturnType<typeof setup>): InternalLine =>
  h.onAddNotch.mock.calls[0][1];

const anclaCreada = (h: ReturnType<typeof setup>): NotchAnchor => {
  const ancla = lineaCreada(h).notchAnchor;
  if (!ancla) throw new Error('el piquete salió sin ancla');
  return ancla;
};

/** Dónde entra el piquete: el primer punto de su path. */
const entrada = (h: ReturnType<typeof setup>) => {
  const [x, y] = lineaCreada(h).path[0].values;
  return { x, y };
};

describe('useNotchTool — el piquete entra en el gesto de borde', () => {
  it('el piquete NO nace en el mousedown', () => {
    // La ley: el press solo arma. Antes de esta tanda el piquete se creaba
    // aquí mismo, y por eso arrastrar no podía significar nada.
    const h = setup();
    act(() => { h.result.current.handleMouseDown(ev(30, 0)); });
    expect(h.onAddNotch).not.toHaveBeenCalled();
  });

  it('un clic sigue poniendo el piquete donde se clica, y sigue abriendo el modal', () => {
    // Contrato de compatibilidad (spec § 5): la ruta de clic no cambia de
    // significado, solo de momento — ahora cierra en el mouseup.
    const h = setup();
    gesto(h, [30, 0]);

    expect(h.onAddNotch).toHaveBeenCalledTimes(1);
    expect(entrada(h).x).toBeCloseTo(30, 3);
    expect(entrada(h).y).toBeCloseTo(0, 3);
    expect(anclaCreada(h).distanceMm).toBeCloseTo(30, 3);
    expect(h.result.current.refining).not.toBeNull();
  });

  it('un arrastre pone el piquete a la distancia arrastrada, medida por ARCO', () => {
    // Press 5 mm dentro de la curva —donde la esquina (100,0) queda a tiro del
    // radio de enganche— y release 190 mm de arco más allá.
    //
    // Oráculo (4M muestras sobre la cúbica):
    //   arco   5 → (102.1622,   4.5081)
    //   arco 190 → (104.4308, 185.7944), a 185,8472 mm EN LÍNEA RECTA de (100,0)
    //
    // Los 4,15 mm entre 190 y 185,85 son justo lo que separa medir el arco de
    // medir la cuerda. En una sisa esa diferencia es un piquete mal puesto.
    const h = setup();
    gesto(h, [102.1622, 4.5081], [104.4308, 185.7944]);

    expect(h.onAddNotch).toHaveBeenCalledTimes(1);
    const ancla = anclaCreada(h);
    // La referencia es la esquina NOMBRABLE, no el punto anónimo del press.
    expect(ancla.refPoint.x).toBeCloseTo(100, 2);
    expect(ancla.refPoint.y).toBeCloseTo(0, 2);
    expect(ancla.metric).toBe(2);
    expect(Math.abs(ancla.distanceMm - 190)).toBeLessThan(1);

    const p = entrada(h);
    const cuerda = Math.hypot(p.x - 100, p.y - 0);
    expect(cuerda).toBeCloseTo(185.85, 0);
    expect(ancla.distanceMm - cuerda).toBeGreaterThan(3);
  });

  it('tras un arrastre NO se abre el modal', () => {
    // Spec § 3.2: "el modal se abre solo en la ruta de clic, donde la posición
    // fue una adivinanza". Tras arrastrar ella ya dijo la distancia con la
    // mano; volver a preguntársela es desconfiar del gesto.
    const h = setup();
    gesto(h, [102.1622, 4.5081], [104.4308, 185.7944]);
    expect(h.onAddNotch).toHaveBeenCalledTimes(1);
    expect(h.result.current.refining).toBeNull();
  });

  it('el sentido del arrastre fija la dirección del ancla', () => {
    // La referencia va a mitad del borde a propósito: desde un extremo no hay
    // dos lados hacia los que arrancar y el test no probaría nada. El piquete
    // guardado en (60,0) es el punto nombrable que gana el press de (62,0).
    const derecha = setup([PIQUETE_EN_60]);
    gesto(derecha, [62, 0], [80, 0]);
    const izquierda = setup([PIQUETE_EN_60]);
    gesto(izquierda, [62, 0], [40, 0]);

    expect(anclaCreada(derecha).refPoint.x).toBeCloseTo(60, 3);
    expect(anclaCreada(izquierda).refPoint.x).toBeCloseTo(60, 3);
    expect(anclaCreada(derecha).direction).not.toBe(anclaCreada(izquierda).direction);
    // El valor es el mismo en los dos: el sentido no cambia cuánto se midió.
    expect(anclaCreada(derecha).distanceMm).toBeCloseTo(20, 2);
    expect(anclaCreada(izquierda).distanceMm).toBeCloseTo(20, 2);
    expect(entrada(derecha).x).toBeCloseTo(80, 2);
    expect(entrada(izquierda).x).toBeCloseTo(40, 2);
  });

  it('soltar pasada la esquina se queda en el borde del press', () => {
    // Spec § 3.4 y The Cut #1. Press en (30,0) —el borde de arriba, sin nada
    // nombrable a tiro, así que la referencia cae a su extremo (0,0)— y
    // release en (110,0), que está 10 mm más allá de la esquina pero todavía
    // dentro del radio de enganche del mismo borde. El gesto se clampea a la
    // esquina: 100 mm. Si cruzara al costado curvo saldrían 110.
    const h = setup();
    gesto(h, [30, 0], [110, 0]);

    const ancla = anclaCreada(h);
    expect(ancla.refPoint.x).toBeCloseTo(0, 3);
    expect(ancla.refPoint.y).toBeCloseTo(0, 3);
    expect(ancla.distanceMm).toBeCloseTo(100, 2);
    expect(entrada(h).x).toBeCloseTo(100, 2);
    expect(entrada(h).y).toBeCloseTo(0, 2);
  });

  it('sobre el borde de CIERRE la referencia no queda al otro lado del anillo', () => {
    // Toda pieza cerrada tiene un tramo de cierre, y es el único cuyo final
    // coincide con el origen del anillo. Ese punto se puede nombrar de dos
    // maneras —0 mm o 604,8816 mm— y son la misma esquina. Si la referencia
    // vuelve como 0 y el borde se lee como [404,88 … 604,88], la resta da
    // casi el perímetro entero en vez de los cinco milímetros que hay.
    //
    // El cierre va de (0,200) a (0,0), así que sobre él mm = 404,8816 + (200 − y).
    // Press en (0,5): a 5 mm de la esquina (0,0), que es la referencia.
    // Release en (0,60): 60 mm de esa esquina.
    const h = setup();
    gesto(h, [0, 5], [0, 60]);

    const ancla = anclaCreada(h);
    expect(ancla.refPoint.x).toBeCloseTo(0, 3);
    expect(ancla.refPoint.y).toBeCloseTo(0, 3);
    expect(ancla.distanceMm).toBeCloseTo(60, 2);
    expect(entrada(h).x).toBeCloseTo(0, 2);
    expect(entrada(h).y).toBeCloseTo(60, 2);
  });

  it('un clic sobre la curva cae SOBRE la curva, no sobre su cuerda', () => {
    // El hit-test viejo (`closestPointOnOutline`) proyectaba contra la cuerda
    // entre los extremos del comando: para esta `C` la cuerda es la vertical
    // x = 100, así que un clic a la altura de la panza ponía el piquete a 18
    // mm de la tela. Es el mismo fallo que el #213 tenía en las tijeras de
    // coser, y ya se arregló allí midiendo contra el trazo aplanado.
    //
    // Oráculo: el punto de la curva más cercano a (120,100) es
    // (118.7516, 99.9556), a 1,2492 mm.
    const h = setup();
    gesto(h, [120, 100]);

    expect(h.onAddNotch).toHaveBeenCalledTimes(1);
    expect(entrada(h).x).toBeCloseTo(118.75, 0);
    expect(entrada(h).y).toBeCloseTo(99.96, 0);
  });
});
