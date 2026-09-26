// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import PuntosDelContorno from '../PuntosDelContorno';
import type { PatternPiece } from '../../../../types/types';

afterEach(cleanup);

/**
 * Spec 2026-09-24 «cromo callado» § 4.6: en reposo los puntos del contorno son
 * referencia, no mando, y van en TINTA; elegida la pieza, en el acento del
 * lienzo. Siguen siempre visibles (#1103, María [11:38]): cambia el color, no
 * la regla. Antes del 26-09 el patrón en reposo llevaba puesta la joyería de la
 * selección (#4A9EFF a mano en cada esquina de cada pieza).
 */
const pieza = {
  id: 'p', name: 'p', position: { x: 0, y: 0 }, rotation: 0, mirrored: false, seamAllowance: 0,
  layer: 1, sublayer: 0, active: true, createdAt: 1, updatedAt: 1, internals: [],
  outline: [
    { type: 'M', values: [0, 0] }, { type: 'L', values: [100, 0] },
    { type: 'L', values: [100, 100] }, { type: 'L', values: [0, 100] }, { type: 'Z', values: [] },
  ],
} as unknown as PatternPiece;

function pintar(isSelected: boolean) {
  return render(
    <svg><PuntosDelContorno piece={pieza} zoom2D={1} isSelected={isSelected} mostrarPuntosDeCurva={false} /></svg>,
  );
}

describe('los puntos del contorno: tinta en reposo, acento al elegir', () => {
  it('sin elegir la pieza, se ven las cuatro esquinas (#1103) y van en tinta', () => {
    const { container } = pintar(false);
    const rects = container.querySelectorAll('[data-anchor-role="corner"] rect');
    expect(rects.length).toBe(4);
    for (const r of rects) expect(r.getAttribute('fill')).toBe('var(--ink-on-light-2)');
  });

  it('elegida la pieza, pasan al acento del lienzo', () => {
    const { container } = pintar(true);
    const rects = container.querySelectorAll('[data-anchor-role="corner"] rect');
    expect(rects.length).toBe(4);
    for (const r of rects) expect(r.getAttribute('fill')).toBe('var(--accent-2d)');
  });

  it('el halo del glifo es el blanco de la pieza, no un #fff suelto', () => {
    const { container } = pintar(false);
    expect(container.querySelector('[data-anchor-role="corner"] rect')?.getAttribute('stroke')).toBe('var(--piece-fill-2d)');
  });
});
