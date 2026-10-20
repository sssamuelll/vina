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

/** Los vértices del borde x = x0 del dibujo (vive en las escenas del banco, que también lo usan). */
export { bordeDelDibujo as borde } from '../banco/escenas';

/** Enrolla la lámina sobre un cilindro de radio R, sin estirarla; la curvatura va en la dirección `dir` del dibujo. */
export function curvar(m: MallaDeTela, dir: readonly [number, number], R: number): Float64Array {
  const x = new Float64Array(m.x.length);
  for (let i = 0; i < m.patron.length / 2; i++) {
    const u = m.patron[2 * i], v = m.patron[2 * i + 1];
    const s = u * dir[0] + v * dir[1], w = -u * dir[1] + v * dir[0];
    const X = R * Math.sin(s / R), Y = R * (1 - Math.cos(s / R));
    x[3 * i] = X * dir[0] - w * dir[1];
    x[3 * i + 1] = Y;
    x[3 * i + 2] = X * dir[1] + w * dir[0];
  }
  return x;
}
