import { describe, expect, it } from 'vitest';
import { separarEtiquetas, SEPARACION_MINIMA_M } from '../separarEtiquetas';

/**
 * #1108 — las etiquetas de medida del avatar se cruzan.
 *
 * jsdom es ciego al apilamiento y `getBoundingClientRect` devuelve cero, así
 * que el solape en pantalla no se puede medir aquí. Lo que sí se puede fijar
 * —y es donde vive la decisión— es la regla: dadas N alturas, ninguna pareja
 * de etiquetas queda a menos de la separación mínima.
 */

const pares = (ys: number[]) =>
  ys.flatMap((a, i) => ys.slice(i + 1).map(b => Math.abs(a - b)));

describe('#1108 — ninguna etiqueta escribe encima de otra', () => {
  it('dos cintas a 5 cm se separan hasta la mínima', () => {
    const salida = separarEtiquetas([1.0, 1.05]);

    expect(Math.min(...pares(salida))).toBeGreaterThanOrEqual(SEPARACION_MINIMA_M - 1e-9);
  });

  it('un montón de cintas casi a la misma altura se reparten todas', () => {
    const salida = separarEtiquetas([1.0, 1.001, 1.002, 1.003, 1.004]);

    expect(Math.min(...pares(salida))).toBeGreaterThanOrEqual(SEPARACION_MINIMA_M - 1e-9);
  });

  it('las que ya estaban lejas no se tocan', () => {
    const lejos = [0.8, 1.0, 1.3];

    expect(separarEtiquetas(lejos)).toEqual(lejos);
  });

  it('devuelve en el orden que llegaron, no ordenado', () => {
    // Si devolviera ordenado, el llamador pintaría cada etiqueta en la altura
    // de otra cinta — que es peor que el solape, porque miente en silencio.
    const salida = separarEtiquetas([1.3, 0.8, 1.0]);

    expect(salida[1]).toBeLessThan(salida[2]);
    expect(salida[2]).toBeLessThan(salida[0]);
  });

  it('la de más abajo se queda donde está: el empujón va hacia arriba', () => {
    const salida = separarEtiquetas([1.0, 1.01]);

    expect(salida[0]).toBe(1.0);
    expect(salida[1]).toBeGreaterThan(1.01);
  });

  it('sin cintas y con una sola no hace nada raro', () => {
    expect(separarEtiquetas([])).toEqual([]);
    expect(separarEtiquetas([1.2])).toEqual([1.2]);
  });
});
