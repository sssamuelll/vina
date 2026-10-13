import { describe, expect, it } from 'vitest';
import { aMarcoDelHilo } from '../malla';
import { prepararReposo } from '../reposo';
import { laminaPlana } from '../banco/escenas';

/** f_u y f_v del triángulo t en las posiciones x. */
function columnas(coef: Float64Array, tris: Uint32Array, x: Float64Array, t: number): number[] {
  const f = [0, 0, 0, 0, 0, 0];
  for (let k = 0; k < 3; k++) {
    for (let d = 0; d < 3; d++) {
      f[d] += coef[7 * t + k] * x[3 * tris[3 * t + k] + d];
      f[3 + d] += coef[7 * t + 3 + k] * x[3 * tris[3 * t + k] + d];
    }
  }
  return f;
}

describe('el reposo en el patrón', () => {
  for (const hilo of [[0, 1], [1, 0], [Math.SQRT1_2, Math.SQRT1_2]] as const) {
    it(`en reposo f_u y f_v son unitarias y perpendiculares (hilo ${hilo[0].toFixed(2)}, ${hilo[1].toFixed(2)})`, () => {
      const m = laminaPlana(10);
      const { coef } = prepararReposo(aMarcoDelHilo(m.patron, hilo), m.tris, 0.2);
      for (let t = 0; t < m.tris.length / 3; t++) {
        const f = columnas(coef, m.tris, m.x, t);
        expect(Math.hypot(f[0], f[1], f[2])).toBeCloseTo(1, 9);
        expect(Math.hypot(f[3], f[4], f[5])).toBeCloseTo(1, 9);
        expect(f[0] * f[3] + f[1] * f[4] + f[2] * f[5]).toBeCloseTo(0, 9);
      }
    });
  }

  it('con el hilo vertical, f_u sigue el eje x del dibujo y f_v su eje y (z en 3D)', () => {
    const m = laminaPlana(10);
    const { coef } = prepararReposo(aMarcoDelHilo(m.patron), m.tris, 0.2);
    const f = columnas(coef, m.tris, m.x, 0);
    expect(f[0]).toBeCloseTo(1, 9);
    expect(f[5]).toBeCloseTo(1, 9);
  });

  it('la masa total es la densidad por el área de la pieza', () => {
    const m = laminaPlana(10);
    const { masa } = prepararReposo(aMarcoDelHilo(m.patron), m.tris, 0.2);
    expect(masa.reduce((s, q) => s + q, 0)).toBeCloseTo(0.2 * 0.12 * 0.12, 8);
  });

  it('un triángulo sin área en el patrón falla diciendo cuál', () => {
    expect(() => prepararReposo(Float64Array.from([0, 0, 1, 0, 2, 0]), Uint32Array.from([0, 1, 2]), 0.2)).toThrow(/triángulo 0/);
  });

  it('un triángulo dado vuelta falla', () => {
    expect(() => prepararReposo(Float64Array.from([0, 0, 1, 0, 0, 1, 1, 1]), Uint32Array.from([0, 1, 2, 1, 2, 3]), 0.2)).toThrow(/al revés/);
  });

  it('un vértice suelto falla diciendo cuál', () => {
    expect(() => prepararReposo(Float64Array.from([0, 0, 1, 0, 0, 1, 5, 5]), Uint32Array.from([0, 1, 2]), 0.2)).toThrow(/vértice 3/);
  });
});
