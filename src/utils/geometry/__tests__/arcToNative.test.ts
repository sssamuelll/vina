/**
 * La conversión que la tanda 2a dejó dicha y sin resolver, a propósito.
 *
 * En `outlineRing` el `tLocal` es siempre **fracción de ARCO** del comando, y
 * el plan de la 2a dejó escrito que convertirlo al parámetro nativo "es
 * responsabilidad de quien llame a De Casteljau"
 * (`docs/superpowers/plans/2026-08-12-tanda-2a-cimientos-de-medicion.md:136`).
 *
 * La herramienta de Punto es exactamente ese llamador: despacha
 * `addPointOnSegment(commandIndex, t)` (`usePointTool.ts:158`), que termina en
 * `splitSegmentAt(piece.outline, commandIndex, t)` (`useEditPattern.ts:744`)
 * — un corte de De Casteljau, o sea parámetro nativo.
 *
 * Pasarle la fracción de arco sin convertir pone el punto en el sitio
 * equivocado sobre cualquier curva. Y el error es traicionero: sobre una recta
 * los dos números coinciden, así que no se ve en un rectángulo de prueba y sí
 * en una sisa.
 */
import { describe, it, expect } from 'vitest';
import type { PathCommand, Point2D } from '../../../types/types';
import { arcToNativeT } from '../arcToNative';
import { gaussLegendreCubicBezierLength } from '../arcLength';

const O: Point2D = { x: 0, y: 0 };

/** La sisa suave del plan de la 2a. Arco real medido: 175,559 mm. */
const SISA: PathCommand = { type: 'C', values: [20, 60, 60, 110, 110, 130] };

/** Longitud de arco de una cúbica desde 0 hasta `t`, por sub-Bézier. */
function arcoHasta(start: Point2D, cmd: PathCommand, t: number): number {
  const [c1x, c1y, c2x, c2y, ex, ey] = cmd.values;
  const lerp = (a: Point2D, b: Point2D): Point2D =>
    ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  const p0 = start, p1 = { x: c1x, y: c1y }, p2 = { x: c2x, y: c2y }, p3 = { x: ex, y: ey };
  const a = lerp(p0, p1), b = lerp(p1, p2), c = lerp(p2, p3);
  const d = lerp(a, b), e = lerp(b, c);
  return gaussLegendreCubicBezierLength(p0, a, d, lerp(d, e));
}

describe('arcToNativeT', () => {
  it('sobre una recta el arco y el parámetro son el mismo número', () => {
    const L: PathCommand = { type: 'L', values: [100, 0] };
    for (const t of [0, 0.25, 0.5, 0.731, 1]) {
      expect(arcToNativeT(L, O, t)).toBe(t);
    }
  });

  it('sobre una curva NO son el mismo número', () => {
    // Si esto empatara, la conversión no estaría haciendo nada y el test de
    // abajo pasaría por casualidad.
    expect(arcToNativeT(SISA, O, 0.5)).not.toBeCloseTo(0.5, 3);
  });

  it('la mitad del arco parte la curva en dos mitades de igual longitud', () => {
    const t = arcToNativeT(SISA, O, 0.5);
    const [c1x, c1y, c2x, c2y, ex, ey] = SISA.values;
    const total = gaussLegendreCubicBezierLength(
      O, { x: c1x, y: c1y }, { x: c2x, y: c2y }, { x: ex, y: ey },
    );
    expect(arcoHasta(O, SISA, t)).toBeCloseTo(total / 2, 3);
  });

  it('acierta en varias fracciones, no solo en la mitad', () => {
    const [c1x, c1y, c2x, c2y, ex, ey] = SISA.values;
    const total = gaussLegendreCubicBezierLength(
      O, { x: c1x, y: c1y }, { x: c2x, y: c2y }, { x: ex, y: ey },
    );
    for (const frac of [0.1, 0.25, 0.75, 0.9]) {
      const t = arcToNativeT(SISA, O, frac);
      expect(arcoHasta(O, SISA, t), `fracción ${frac}`).toBeCloseTo(total * frac, 3);
    }
  });

  it('los extremos son exactos y no se van por bisección', () => {
    expect(arcToNativeT(SISA, O, 0)).toBe(0);
    expect(arcToNativeT(SISA, O, 1)).toBe(1);
  });

  it('clampea fuera de rango en vez de extrapolar', () => {
    expect(arcToNativeT(SISA, O, -0.3)).toBe(0);
    expect(arcToNativeT(SISA, O, 1.7)).toBe(1);
  });

  it('clampea TAMBIÉN sobre una recta, no solo sobre la curva', () => {
    // El agujero que dejó la primera versión: salía por la vía rápida de las
    // rectas antes de clampear, así que un 1.7 sobre una `L` salía tal cual y
    // `splitSegmentAt` partiría fuera del segmento. Un contrato que solo se
    // cumple en la mitad de los comandos no es un contrato.
    const L: PathCommand = { type: 'L', values: [100, 0] };
    expect(arcToNativeT(L, O, -0.3)).toBe(0);
    expect(arcToNativeT(L, O, 1.7)).toBe(1);
  });

  it('un comando degenerado devuelve tArc sin inventar nada', () => {
    const nulo: PathCommand = { type: 'C', values: [0, 0, 0, 0, 0, 0] };
    expect(arcToNativeT(nulo, O, 0.42)).toBe(0.42);
  });

  it('la cuadrática también se invierte, no solo la cúbica', () => {
    const Q: PathCommand = { type: 'Q', values: [80, 10, 0, 100] };
    const t = arcToNativeT(Q, O, 0.5);
    expect(t).toBeGreaterThan(0);
    expect(t).toBeLessThan(1);
    expect(t).not.toBeCloseTo(0.5, 3);
  });

  it('es monótona: más arco pedido, más parámetro devuelto', () => {
    // Una inversión que se desordenara pondría los puntos en otro orden que
    // el del dedo, que es el fallo que nadie diagnostica mirando un número.
    let prev = -1;
    for (const frac of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
      const t = arcToNativeT(SISA, O, frac);
      expect(t, `fracción ${frac}`).toBeGreaterThan(prev);
      prev = t;
    }
  });
});
