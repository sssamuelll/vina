// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import type { ComponentProps } from 'react';
import GridLayer from '../GridLayer';

afterEach(cleanup);

const pinta = (props: Partial<ComponentProps<typeof GridLayer>> = {}) =>
  render(
    <svg><GridLayer zoom2D={0.48} pan2D={{ x: 100, y: 60 }} gridSize={10} units="mm" {...props} /></svg>,
  ).container;

describe('GridLayer — un solo paso de cuadrícula (spec 2026-10-02 § 4.4)', () => {
  it('pinta un único patrón, del tamaño del cuadro', () => {
    const patrones = pinta().querySelectorAll('pattern');
    expect(patrones).toHaveLength(1);
    expect(patrones[0].getAttribute('id')).toBe('grid-cuadro');
    expect(Number(patrones[0].getAttribute('width'))).toBeCloseTo(24);
    expect(Number(patrones[0].getAttribute('height'))).toBeCloseTo(24);
  });

  it('la línea sale del token de la cuadrícula, a 1 px y sin apagarse', () => {
    const linea = pinta().querySelector('pattern path')!;
    expect(linea.getAttribute('style') ?? '').toContain('var(--grid-2d)');
    expect(linea.getAttribute('stroke-width')).toBe('1');
    expect(linea.hasAttribute('opacity')).toBe(false);
  });

  it('el papel va debajo y la cuadrícula encima', () => {
    const rects = pinta().querySelectorAll('svg > rect');
    expect(rects).toHaveLength(2);
    expect(rects[0].getAttribute('style') ?? '').toContain('var(--canvas-2d)');
    expect(rects[1].getAttribute('fill')).toBe('url(#grid-cuadro)');
  });

  it('no hay cruz del origen', () => {
    const c = pinta();
    expect(c.querySelector('circle')).toBeNull();
    expect(c.querySelectorAll('line')).toHaveLength(0);
  });

  it('la cuadrícula sigue al paneo', () => {
    // Cuadro de 24 px: 130 = 5 × 24 + 10 y 85 = 3 × 24 + 13. (Con 100 y 60 este
    // caso pasaba también contra el paso de 48 px de antes: 100 mod 48 = 4.)
    const patron = pinta({ pan2D: { x: 130, y: 85 } }).querySelector('pattern')!;
    expect(Number(patron.getAttribute('x'))).toBeCloseTo(10);
    expect(Number(patron.getAttribute('y'))).toBeCloseTo(13);
  });

  it('en pulgadas el cuadro es de una pulgada a zoom 1', () => {
    const patron = pinta({ zoom2D: 1, units: 'inches' }).querySelector('pattern')!;
    expect(Number(patron.getAttribute('width'))).toBeCloseTo(25.4);
  });

  it('con una cuadrícula imposible queda el papel solo, sin romperse', () => {
    const c = pinta({ gridSize: 0 });
    expect(c.querySelectorAll('pattern')).toHaveLength(0);
    expect(c.querySelectorAll('svg > rect')).toHaveLength(1);
  });
});
