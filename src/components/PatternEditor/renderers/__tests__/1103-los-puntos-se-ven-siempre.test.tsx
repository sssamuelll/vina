// @vitest-environment jsdom
import { describe, expect, it, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import type { PatternPiece } from '../../../../types/types';
import PuntosDelContorno from '../PuntosDelContorno';

afterEach(cleanup);

/**
 * #1103 — los puntos del contorno se ven siempre.
 *
 * María, [11:38]: *«los puntos aquí en el cuadrado solo aparecen una vez que
 * clico el cuadrado, pero yo creo que siempre en los extremos los puntos
 * deberían aparecer»*, y la otra mitad: *«y los de curva igual no, porque son
 * muchos puntos… solo deberían verse cuando uno clica como el menú curva»*.
 *
 * Contar glifos no basta como oráculo: hay que mirar el ROL de cada uno, que
 * es lo que decide su forma — y la forma es literalmente la pregunta que ella
 * hizo en [34:24] («por qué este punto es redondo y este cuadrado»).
 */

const base = {
  id: 'p1',
  name: 'Delantero',
  internals: [],
  position: { x: 0, y: 0 },
  rotation: 0,
  mirrored: false,
  seamAllowance: 0,
  active: true,
  createdAt: 0,
  updatedAt: 0,
};

/** Cuadrado normal: cuatro esquinas, anclas únicas. */
const CUADRADO: PatternPiece = {
  ...base,
  outline: [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [200, 0] },
    { type: 'L', values: [200, 200] },
    { type: 'L', values: [0, 200] },
    { type: 'Z', values: [] },
  ],
} as PatternPiece;

/**
 * El mismo, como lo emite CLO: la esquina de arriba a la derecha viene
 * repetida. Es la forma normal del DXF de María, no un caso raro.
 */
const CON_GEMELO: PatternPiece = {
  ...base,
  outline: [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [200, 0] },
    { type: 'L', values: [200, 0] },
    { type: 'L', values: [200, 200] },
    { type: 'L', values: [0, 200] },
    { type: 'Z', values: [] },
  ],
} as PatternPiece;

/**
 * Dos curvas que se encuentran SIN quiebre en (200,0): la tangente de salida
 * de la primera y la de entrada de la segunda apuntan igual, así que
 * `detectCorners` no ve esquina ahí y el ancla queda como punto de curva.
 *
 * El fixture obvio —una curva entre dos rectas— no sirve: sus extremos SÍ son
 * esquinas por ángulo, y el test habría dado verde vacío buscando un rol que
 * nunca iba a aparecer.
 */
const CON_CURVA: PatternPiece = {
  ...base,
  outline: [
    { type: 'M', values: [0, 0] },
    { type: 'C', values: [50, -50, 150, -50, 200, 0] },
    { type: 'C', values: [250, 50, 250, 150, 200, 200] },
    { type: 'L', values: [0, 200] },
    { type: 'Z', values: [] },
  ],
} as PatternPiece;

function pintar(piece: PatternPiece, opts: { isSelected?: boolean; curva?: boolean } = {}) {
  const { container } = render(
    <svg>
      <PuntosDelContorno
        piece={piece}
        zoom2D={1}
        isSelected={opts.isSelected ?? false}
        mostrarPuntosDeCurva={opts.curva ?? false}
      />
    </svg>,
  );
  return [...container.querySelectorAll('[data-anchor-role]')]
    .map(g => g.getAttribute('data-anchor-role')!);
}

describe('#1103 — los extremos se ven aunque la pieza no esté elegida', () => {
  it('sin elegir la pieza ya se pintan sus cuatro esquinas', () => {
    const roles = pintar(CUADRADO, { isSelected: false });

    expect(roles).toHaveLength(4);
    expect(new Set(roles)).toEqual(new Set(['corner']));
  });

  it('elegirla no cambia CUÁNTOS puntos hay, solo su tamaño', () => {
    expect(pintar(CUADRADO, { isSelected: true })).toEqual(
      pintar(CUADRADO, { isSelected: false }),
    );
  });

  it('la esquina duplicada del DXF de María se pinta UNA vez', () => {
    // Sin deduplicar salen dos glifos idénticos superpuestos: se ven más
    // gordos y más oscuros que los otros tres, sin ningún motivo visible.
    const roles = pintar(CON_GEMELO);

    expect(roles).toHaveLength(4);
  });
});

describe('#1103 — los de curva solo con el menú de curva', () => {
  it('sin herramienta de curva, las anclas de bezier no salen', () => {
    const roles = pintar(CON_CURVA, { curva: false });

    expect(roles).not.toContain('bezierAnchor');
  });

  it('con la herramienta de curva activa, sí', () => {
    const roles = pintar(CON_CURVA, { curva: true });

    expect(roles).toContain('bezierAnchor');
  });

  it('y encender la curva nunca QUITA un extremo', () => {
    const sin = pintar(CON_CURVA, { curva: false });
    const con = pintar(CON_CURVA, { curva: true });

    for (const rol of sin) expect(con).toContain(rol);
    expect(con.length).toBeGreaterThanOrEqual(sin.length);
  });
});
