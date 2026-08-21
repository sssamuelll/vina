// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PatternPiece, PathCommand } from '../../../types/types';
import { useTransformTool } from '../useTransformTool';

afterEach(cleanup);

/**
 * maria-198: "si arrastro un punto o un lado necesito que se mueva solo lo
 * arrastrado. Además la pieza se mueve de sitio teniendo que ajustar el zoom e
 * ir a buscarla".
 *
 * El arreglo de entonces puso el ancla en el lado OPUESTO al tirador, pero
 * dejó además el ajuste de `position` que venía de antes. Son dos
 * compensaciones para el mismo efecto: escalar el contorno alrededor del ancla
 * LOCAL ya deja ese punto quieto, así que mover la posición encima lo corre.
 *
 * Sólo se nota en `w`/`n`/`nw`. En `e`/`s`/`se` el ancla coincide con el
 * origen del contorno y el error se cancela — por eso los dos casos del E2E de
 * maria-198 pasaban en verde con el fallo dentro.
 */

const L_SHAPE: PathCommand[] = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [60, 0] },
  { type: 'L', values: [60, 20] },
  { type: 'L', values: [20, 20] },
  { type: 'L', values: [20, 80] },
  { type: 'L', values: [0, 80] },
  { type: 'Z', values: [] },
];

function piece(): PatternPiece {
  return {
    id: 'p', name: 'L', position: { x: 0, y: 0 }, rotation: 0,
    outline: L_SHAPE.map(c => ({ ...c, values: [...c.values] })),
    internals: [], mirrored: false, seamAllowance: 0, active: true,
  } as unknown as PatternPiece;
}

type Update = {
  outline: PathCommand[];
  position: { x: number; y: number };
};

function pointer(x: number, y: number) {
  return {
    button: 0, shiftKey: false, clientX: x, clientY: y,
    currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0 }) },
  } as unknown as React.MouseEvent<SVGSVGElement>;
}

function estirar(from: [number, number], to: [number, number]): Update {
  const onTransform = vi.fn();
  const hook = renderHook(() =>
    useTransformTool(1, { x: 0, y: 0 }, [piece()], ['p'], onTransform));
  act(() => { hook.result.current.handleMouseDown(pointer(...from)); });
  act(() => { hook.result.current.handleMouseMove(pointer(...to)); });
  act(() => { hook.result.current.handleMouseUp(); });
  return (onTransform.mock.calls[0][0] as Update[])[0];
}

/** Franja en X de la pieza ya emplazada. */
function franjaX(u: Update): [number, number] {
  const xs: number[] = [];
  for (const cmd of u.outline) {
    for (let i = 0; i + 1 < cmd.values.length; i += 2) xs.push(cmd.values[i] + u.position.x);
  }
  return [Math.min(...xs), Math.max(...xs)];
}

describe('maria-198 — lo que no arrastras no se mueve', () => {
  // Caja de la L: x 0..60, y 0..80. Tirador `w` en (0,40).
  it('el tirador oeste deja el borde este clavado donde estaba', () => {
    const u = estirar([0, 40], [20, 40]);
    const [oeste, este] = franjaX(u);
    // Antes: la pieza salía en 40..80 — encogía 20 Y se corría 20, dejando el
    // borde este en 80 en vez de en 60.
    expect(este).toBeCloseTo(60);
    expect(oeste).toBeCloseTo(20);
  });

  it('no mueve la pieza de sitio al estirar', () => {
    expect(estirar([0, 40], [20, 40]).position).toEqual({ x: 0, y: 0 });
  });

  it('el tirador norte deja el borde sur clavado', () => {
    const u = estirar([30, 0], [30, 20]);
    const ys: number[] = [];
    for (const cmd of u.outline) {
      for (let i = 0; i + 1 < cmd.values.length; i += 2) ys.push(cmd.values[i + 1] + u.position.y);
    }
    expect(Math.max(...ys)).toBeCloseTo(80);
    expect(Math.min(...ys)).toBeCloseTo(20);
  });

  it('el tirador este sigue comportándose igual que siempre', () => {
    // Este caso ya era correcto — el ancla coincide con el origen del contorno
    // y las dos compensaciones se cancelaban. Guarda contra regresión.
    const u = estirar([60, 40], [80, 40]);
    const [oeste, este] = franjaX(u);
    expect(oeste).toBeCloseTo(0);
    expect(este).toBeCloseTo(80);
  });
});
