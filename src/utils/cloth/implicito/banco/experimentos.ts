/** Experimentos del banco: cambian el motor solo cuando una medida los pide, nunca por defecto. */
import type { Placa } from '../placa';

/**
 * Baja la rigidez de placa de cada triángulo que pasa de `veces` la mediana hasta ese techo, escalando su K entera
 * (sigue siendo semidefinida), y devuelve cuántos triángulos tocó. Mide cuánto pesan en la camiseta los triángulos de
 * borde que la placa mide mal; no es una corrección.
 */
export function toparPlaca(placa: Placa, veces: number): number {
  const nt = placa.K.length / 9;
  const maximo = (t: number) => Math.max(Math.abs(placa.K[9 * t]), Math.abs(placa.K[9 * t + 4]), Math.abs(placa.K[9 * t + 8]));
  const k = Array.from({ length: nt }, (_, t) => maximo(t)).filter((v) => v > 0).sort((a, b) => a - b);
  const techo = veces * k[k.length >> 1];
  let tocados = 0;
  for (let t = 0; t < nt; t++) {
    const m = maximo(t);
    if (m <= techo) continue;
    for (let q = 0; q < 9; q++) placa.K[9 * t + q] *= techo / m;
    tocados++;
  }
  return tocados;
}
