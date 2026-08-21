// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InternalLine, PatternPiece, PathCommand } from '../../../types/types';
import { useTransformTool } from '../useTransformTool';

afterEach(cleanup);

/**
 * El tirador de giro deja de hornear el ángulo dentro de las coordenadas del
 * contorno y pasa a escribir `piece.rotation` — el mismo canal que ya usa el
 * menú del clic derecho (`actionCuration.ts:161` → `rotatePiece`).
 *
 * Lo que eso compra, medido en #1033 antes del cambio: girar +30° y luego −30°
 * dejaba la pieza a 5.176 unidades de donde estaba, porque el pivote salía del
 * AABB y el AABB se muda al girar una forma no rectangular. Con el contorno
 * quieto, el pivote no se puede mudar.
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

const GRAINLINE: InternalLine = {
  id: 'g1', type: 'grainline',
  path: [{ type: 'M', values: [30, 10] }, { type: 'L', values: [30, 70] }],
};

function piece(rotation: number): PatternPiece {
  return {
    id: 'p', name: 'L', position: { x: 0, y: 0 }, rotation,
    outline: L_SHAPE.map(c => ({ ...c, values: [...c.values] })),
    internals: [{ ...GRAINLINE, path: GRAINLINE.path.map(c => ({ ...c, values: [...c.values] })) }],
    mirrored: false, seamAllowance: 0, active: true,
  } as unknown as PatternPiece;
}

type Update = {
  id: string;
  outline: PathCommand[];
  position: { x: number; y: number };
  internals: InternalLine[];
  rotation: number;
};

function pointer(x: number, y: number, shiftKey = false) {
  return {
    button: 0, shiftKey, clientX: x, clientY: y,
    currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0 }) },
  } as unknown as React.MouseEvent<SVGSVGElement>;
}

function girar(rotacionInicial: number, from: [number, number], to: [number, number]): Update {
  const onTransform = vi.fn();
  const hook = renderHook(() =>
    useTransformTool(1, { x: 0, y: 0 }, [piece(rotacionInicial)], ['p'], onTransform));
  act(() => { hook.result.current.handleMouseDown(pointer(...from)); });
  act(() => { hook.result.current.handleMouseMove(pointer(...to)); });
  act(() => { hook.result.current.handleMouseUp(); });
  expect(onTransform).toHaveBeenCalledTimes(1);
  return (onTransform.mock.calls[0][0] as Update[])[0];
}

// Caja sin girar de la L: x 0..60, y 0..80. Pivote (30,40). Brazo = 25/zoom.
// El tirador de giro en reposo cae en (30,-25); girado 90° sobre el pivote,
// en (95,40).
const TIRADOR_0 = [30, -25] as [number, number];
const TIRADOR_90 = [95, 40] as [number, number];

describe('el tirador de giro escribe el ángulo, no las coordenadas', () => {
  it('emite la rotación nueva en el update', () => {
    const u = girar(0, TIRADOR_0, [95, 40]);
    expect(u.rotation).toBeCloseTo(90);
  });

  it('deja el contorno intacto', () => {
    const u = girar(0, TIRADOR_0, [95, 40]);
    expect(u.outline).toEqual(L_SHAPE);
  });

  it('deja las internas intactas — el grupo entero gira en el renderizador', () => {
    // Antes el giro reescribía las internas junto al contorno. Con el giro
    // declarativo eso sería girarlas DOS veces: una acá y otra en el
    // `rotate(piece.rotation, cx, cy)` del grupo.
    const u = girar(0, TIRADOR_0, [95, 40]);
    expect(u.internals[0].path).toEqual(GRAINLINE.path);
  });

  it('no mueve la pieza de sitio con una sola pieza seleccionada', () => {
    const u = girar(0, TIRADOR_0, [95, 40]);
    expect(u.position).toEqual({ x: 0, y: 0 });
  });

  it('acumula sobre el ángulo que la pieza ya traía', () => {
    // La pieza ya viene a 90°; otro cuarto de vuelta la deja en 180°.
    const u = girar(90, TIRADOR_90, [30, 105]);
    expect(u.rotation).toBeCloseTo(180);
  });

  it('ida y vuelta devuelve la pieza EXACTAMENTE a su sitio', () => {
    // La queja de Samuel, medida: antes esto dejaba la pieza 5.176 unidades
    // más allá. Con el contorno quieto el pivote no se muda, así que el
    // regreso es exacto y no aproximado.
    const ida = girar(0, TIRADOR_0, [95, 40]);
    expect(ida.rotation).toBeCloseTo(90);
    const vuelta = girar(90, TIRADOR_90, [30, -25]);
    expect(vuelta.rotation).toBeCloseTo(0);
    expect(vuelta.outline).toEqual(L_SHAPE);
    expect(vuelta.position).toEqual({ x: 0, y: 0 });
  });
});
