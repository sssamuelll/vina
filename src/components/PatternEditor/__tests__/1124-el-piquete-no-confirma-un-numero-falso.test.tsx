// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { createElement } from 'react';
import type React from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';
import toolReducer from '../../../store/toolSlice';
import type { InternalLine, PatternPiece } from '../../../types/types';
import { useNotchTool } from '../useNotchTool';
import { suscribirNoPasoNada, type AvisoMudo } from '../noPasoNada';

/**
 * #1124 — el modal de precisión puede confirmar una distancia que no coincide
 * con la geometría resuelta.
 *
 * Dos mitades del mismo defecto, y las dos nacen de la misma frase que ya está
 * escrita en `notchAnchor.ts:98`: *«el modal usa el perímetro como techo — una
 * distancia mayor envolvería en silencio (`resolveNotchAnchor` envuelve A
 * PROPÓSITO para llamadores programáticos como las anclas escaladas del
 * grading)»*. O sea: el envolvimiento no es el bug. El bug es que el techo que
 * debía impedirle a una persona llegar hasta él **se toma una foto al abrir**
 * (`useNotchTool.ts:337` y `:391`) y nadie la vuelve a mirar.
 *
 * 1. Si el contorno encoge con el modal abierto (un Ctrl+Z mientras el input
 *    está desenfocado), el techo sigue siendo el viejo: el input deja teclear
 *    un número imposible, la pista dice un perímetro que ya no existe y
 *    `disabled={!valid}` aprueba el botón.
 * 2. Y aunque se llegue ahí por cualquier otra vía, `confirmRefine` guarda
 *    `distanceMm` CRUDO mientras `resolveNotchAnchor` coloca el piquete en el
 *    valor ENVUELTO. El registro y la geometría quedan en desacuerdo, y ese
 *    desacuerdo se le anuncia a María como un hecho: el toast de la tanda 3
 *    (`notchPlacedMessage`) lee `notchAnchor.distanceMm`, o sea el crudo.
 *
 * El sujeto del test 2 es **el argumento del callback**, no el toast: el toast
 * se despacha en `PatternEditor.tsx:230` con ese mismo valor, así que fijar el
 * argumento fija el toast un salto más allá — y sin montar el editor entero.
 */

const anchor = {
  refPoint: { x: 0, y: 0 },
  direction: 'cw' as const,
  distanceMm: 42,
  metric: 2 as const,
};

const notch: InternalLine = {
  id: 'notch-42',
  type: 'notch',
  path: [
    { type: 'M', values: [42, 0] },
    { type: 'L', values: [42, 8] },
  ],
  notchAnchor: anchor,
};

/** Cuadrado de 100×100 → perímetro 400 mm. */
const pieza: PatternPiece = {
  id: 'piece-1',
  name: 'Delantero',
  outline: [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [100, 0] },
    { type: 'L', values: [100, 100] },
    { type: 'L', values: [0, 100] },
    { type: 'Z', values: [] },
  ],
  internals: [notch],
  position: { x: 10, y: 20 },
  rotation: 0,
  mirrored: false,
  seamAllowance: 0,
  active: true,
  createdAt: 0,
  updatedAt: 0,
};

/** El mismo, encogido a 100×50 → perímetro 300 mm. Es lo que deja un Ctrl+Z. */
const piezaEncogida: PatternPiece = {
  ...pieza,
  outline: [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [100, 0] },
    { type: 'L', values: [100, 50] },
    { type: 'L', values: [0, 50] },
    { type: 'Z', values: [] },
  ],
};

function montar(piezasIniciales: PatternPiece[], onUpdate = vi.fn()) {
  const store = configureStore({ reducer: { tools: toolReducer } });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    createElement(Provider, { store, children });
  const hook = renderHook(
    ({ piezas }: { piezas: PatternPiece[] }) =>
      useNotchTool(1, { x: 0, y: 0 }, piezas, vi.fn(), undefined, onUpdate),
    { wrapper, initialProps: { piezas: piezasIniciales } },
  );
  return { ...hook, onUpdate };
}

describe('#1124 — el techo del piquete se mide, no se recuerda', () => {
  it('recalcula el techo cuando el contorno encoge con la cota abierta', () => {
    const { result, rerender } = montar([pieza]);

    act(() => { result.current.refineExisting(pieza.id, notch); });
    expect(result.current.refining?.maxDistanceMm).toBe(400);

    // Ctrl+Z mientras el modal sigue abierto: la pieza encoge bajo él.
    rerender({ piezas: [piezaEncogida] });

    // Hoy sigue diciendo 400 — y con eso el input acepta 350, la pista
    // anuncia un perímetro que ya no existe y el botón se queda habilitado.
    expect(result.current.refining?.maxDistanceMm).toBe(300);
  });

  it('confirmar guarda la distancia que la geometría usó, no la que se tecleó', () => {
    const onUpdate = vi.fn();
    const { result } = montar([pieza], onUpdate);

    act(() => { result.current.refineExisting(pieza.id, notch); });
    // 450 sobre un anillo de 400 envuelve a 50. La geometría va a 50.
    act(() => { result.current.confirmRefine(450, 8); });

    expect(onUpdate).toHaveBeenCalledTimes(1);
    const anclaGuardada = onUpdate.mock.calls[0][3];
    // El registro tiene que decir lo mismo que la geometría hizo. Si guarda
    // 450, el toast anuncia «Piquete colocado a 450 mm» sobre un contorno de
    // 400 — una confirmación explícitamente falsa.
    expect(anclaGuardada.distanceMm).toBe(50);
  });

  it('control: sin envolvimiento, guarda exactamente lo tecleado', () => {
    const onUpdate = vi.fn();
    const { result } = montar([pieza], onUpdate);

    act(() => { result.current.refineExisting(pieza.id, notch); });
    act(() => { result.current.confirmRefine(120, 8); });

    expect(onUpdate.mock.calls[0][3].distanceMm).toBe(120);
  });
});

describe('#1124 hermano — confirmar sin ancla no puede cerrar en silencio', () => {
  it('avisa cuando el contorno cambió tanto que la esquina de referencia ya no existe', () => {
    const avisos: AvisoMudo[] = [];
    const cancelar = suscribirNoPasoNada(a => { avisos.push(a); });
    try {
      const onUpdate = vi.fn();
      const { result, rerender } = montar([pieza], onUpdate);

      act(() => { result.current.refineExisting(pieza.id, notch); });

      // La pieza se mueve entera: el refPoint guardado (0,0) deja de caer
      // sobre el contorno, y `resolveNotchAnchor` devuelve null.
      const movida: PatternPiece = {
        ...pieza,
        outline: [
          { type: 'M', values: [500, 500] },
          { type: 'L', values: [600, 500] },
          { type: 'L', values: [600, 600] },
          { type: 'L', values: [500, 600] },
          { type: 'Z', values: [] },
        ],
      };
      rerender({ piezas: [movida] });

      act(() => { result.current.confirmRefine(42, 8); });

      // Sin colocar nada: eso ya pasaba. Lo que no podía pasar es que además
      // se cerrara mudo — «Colocar exacto» que no coloca tiene que decirlo.
      expect(onUpdate).not.toHaveBeenCalled();
      expect(avisos.map(a => a.razon)).toContain('notch:ancla-perdida');
      // Dice qué hacer: volver a ponerlo (el texto se acortó en P2b para caber
      // junto a las cuatro opciones del piquete en la línea al pie).
      expect(avisos[0].texto).toMatch(/otra vez con un clic/i);
    } finally {
      cancelar();
    }
  });
});
