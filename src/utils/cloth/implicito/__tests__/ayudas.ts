/** Ayudas de las pruebas del motor implícito. */
import type { MallaDeTela } from '../malla';

/** Generador determinista (Park-Miller) en [−0,5, 0,5). */
export function azar(semilla: number): () => number {
  let s = semilla;
  return () => (s = (s * 16807) % 2147483647) / 2147483647 - 0.5;
}

/** Peor error relativo entre el gradiente g y las diferencias finitas centradas de E en x. */
export function errorDelGradiente(E: (x: Float64Array) => number, g: Float64Array, x: Float64Array): number {
  const escala = g.reduce((s, q) => Math.max(s, Math.abs(q)), 0);
  let peor = 0;
  for (let q = 0; q < x.length; q++) {
    const h = 1e-7, x0 = x[q];
    x[q] = x0 + h;
    const Ep = E(x);
    x[q] = x0 - h;
    const Em = E(x);
    x[q] = x0;
    const num = (Ep - Em) / (2 * h);
    peor = Math.max(peor, Math.abs(num - g[q]) / (1e-3 * escala + Math.abs(num)));
  }
  return peor;
}

/**
 * Error relativo (norma 2) entre H·p y la derivada del gradiente a lo largo de p, por diferencias
 * finitas centradas. `gradiente(x, out)` escribe el gradiente en x.
 */
export function errorDeHessiana(
  gradiente: (x: Float64Array, out: Float64Array) => void,
  Hp: Float64Array,
  x: Float64Array,
  p: Float64Array,
): number {
  const h = 1e-6, gp = new Float64Array(x.length), gm = new Float64Array(x.length);
  gradiente(Float64Array.from(x, (q, k) => q + h * p[k]), gp);
  gradiente(Float64Array.from(x, (q, k) => q - h * p[k]), gm);
  let num = 0, den = 0;
  for (let q = 0; q < x.length; q++) {
    const fd = (gp[q] - gm[q]) / (2 * h);
    num += (fd - Hp[q]) ** 2;
    den += fd ** 2;
  }
  return Math.sqrt(num / den);
}

/** Los vértices del borde x = x0 del dibujo, de abajo hacia arriba, corridos v0. */
export function borde(m: MallaDeTela, x0: number, v0 = 0): number[] {
  const n = m.x.length / 3, vs: number[] = [];
  for (let i = 0; i < n; i++) if (Math.abs(m.patron[2 * i] - x0) < 1e-9) vs.push(i);
  return vs.sort((i, j) => m.patron[2 * i + 1] - m.patron[2 * j + 1]).map((i) => i + v0);
}
