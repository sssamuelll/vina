// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import type { ComponentProps } from 'react';
import MarcaDeEscala from '../MarcaDeEscala';

afterEach(cleanup);

type Props = ComponentProps<typeof MarcaDeEscala>;
const base: Props = {
  zoom2D: 0.48, pan2D: { x: 100, y: 60 }, gridSize: 10, units: 'mm', izquierda: 74, alto: 600,
};
const pinta = (props: Partial<Props> = {}) =>
  render(<svg><MarcaDeEscala {...base} {...props} /></svg>).container;

/** Los cuatro puntos del corchete, leídos de su `d`. */
function corchete(c: HTMLElement): Array<{ x: number; y: number }> {
  const n = c.querySelector('.marca-de-escala path')!.getAttribute('d')!.match(/-?\d+(\.\d+)?/g)!.map(Number);
  return [0, 2, 4, 6].map((i) => ({ x: n[i], y: n[i + 1] }));
}

describe('MarcaDeEscala (spec 2026-10-02 § 4.4)', () => {
  it('dice cuánto mide un cuadro', () => {
    expect(pinta().querySelector('.marca-de-escala text')!.textContent).toBe('50 mm');
  });

  it('el corchete mide exactamente un cuadro', () => {
    const p = corchete(pinta());
    expect(p[2].x - p[1].x).toBeCloseTo(24);
    expect(p[0].x).toBe(p[1].x);
    expect(p[3].x).toBe(p[2].x);
  });

  it('se apoya en una línea de la cuadrícula, a la derecha del cromo', () => {
    const x = corchete(pinta())[1].x;
    expect(x).toBeGreaterThanOrEqual(74);
    expect(x - 74).toBeLessThan(24);
    const pasos = (x - 100) / 24;
    expect(Math.abs(pasos - Math.round(pasos))).toBeLessThan(1e-9);
  });

  it('va abajo a la izquierda: la base en la última línea de la cuadrícula que deja 24 px al pie de la hoja', () => {
    const c = pinta();
    // Un cuadro de 24 px desde y = 60: la última línea que no pasa de 600 − 24 es la 564.
    expect(corchete(c).map((q) => q.y)).toEqual([559, 564, 564, 559]);
    expect(c.querySelector('.marca-de-escala text')!.getAttribute('y')).toBe('564');
    for (const y of [61, 70, 72]) {
      const base = Math.max(...corchete(pinta({ pan2D: { x: 100, y } })).map((q) => q.y));
      expect(600 - base, `con pan.y = ${y}`).toBeGreaterThanOrEqual(24);
      expect(600 - base, `con pan.y = ${y}`).toBeLessThan(24 + 24);
      expect((base - y) % 24, 'no se apoya en una línea de la cuadrícula').toBe(0);
    }
  });

  it('es documento y no recibe el ratón', () => {
    const g = pinta().querySelector('.marca-de-escala')!;
    expect(g.getAttribute('data-superficie')).toBe('documento');
    expect(g.getAttribute('pointer-events')).toBe('none');
  });

  it('la tinta y la fuente salen de tokens', () => {
    const c = pinta();
    expect(c.querySelector('.marca-de-escala path')!.getAttribute('style') ?? '').toContain('var(--ink-hint)');
    const texto = c.querySelector('.marca-de-escala text')!.getAttribute('style') ?? '';
    expect(texto).toContain('var(--ink-hint)');
    expect(texto).toContain('var(--font-mono-2d)');
  });

  it('se anuncia en español', () => {
    expect(pinta().querySelector('.marca-de-escala')!.getAttribute('aria-label')).toBe('Escala: un cuadro mide 50 mm');
  });

  it('en pulgadas habla en pulgadas', () => {
    expect(pinta({ zoom2D: 1, units: 'inches' }).querySelector('.marca-de-escala text')!.textContent).toBe('1 in');
  });

  it('con una cuadrícula imposible no se pinta', () => {
    expect(pinta({ gridSize: 0 }).querySelector('.marca-de-escala')).toBeNull();
  });
});
