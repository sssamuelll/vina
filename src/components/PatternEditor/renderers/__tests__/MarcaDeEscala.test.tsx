// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import type { ComponentProps } from 'react';
import MarcaDeEscala from '../MarcaDeEscala';

afterEach(cleanup);

type Props = ComponentProps<typeof MarcaDeEscala>;
const base: Props = {
  zoom2D: 0.48, pan2D: { x: 100, y: 60 }, gridSize: 10, units: 'mm', izquierda: 74,
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

  it('va arriba, en la franja que dejó la regla: la base a 16 px y el corchete, 5 más arriba', () => {
    const c = pinta();
    const p = corchete(c);
    expect(p.map((q) => q.y)).toEqual([11, 16, 16, 11]);
    expect(c.querySelector('.marca-de-escala text')!.getAttribute('y')).toBe('16');
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
