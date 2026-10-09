import { describe, it, expect } from 'vitest';
import { estaAsentada, MINIMO_DE_CUADROS, movimientoP95, UMBRAL_MM_POR_CUADRO } from '../asentamiento';

/** 100 vértices en el origen, y los mismos movidos en x: los primeros `n` por `a` metros, el resto por `b`. */
function lecturas(n: number, a: number, b: number) {
  const antes = new Float32Array(300);
  const despues = new Float32Array(300);
  for (let i = 0; i < 100; i++) despues[3 * i] = i < n ? a : b;
  return { antes, despues };
}

describe('movimientoP95', () => {
  it('es el percentil 95 del desplazamiento, en mm por cuadro: los pocos que tiemblan no cuentan', () => {
    // 96 vértices se movieron 1 mm y 4 tiemblan 10 mm, en 10 cuadros.
    const { antes, despues } = lecturas(96, 0.001, 0.01);
    expect(movimientoP95(antes, despues, 10)).toBeCloseTo(0.1, 6);
  });

  it('con más de un 5 % moviéndose, sí cuenta', () => {
    const { antes, despues } = lecturas(90, 0.001, 0.01);
    expect(movimientoP95(antes, despues, 10)).toBeCloseTo(1, 6);
  });
});

describe('estaAsentada', () => {
  const quieta = UMBRAL_MM_POR_CUADRO / 2;
  it('tres lecturas seguidas bajo el umbral, pasados los cuadros mínimos', () => {
    expect(estaAsentada([1, quieta, quieta, quieta], MINIMO_DE_CUADROS)).toBe(true);
  });
  it('antes de los cuadros mínimos, no: la tela todavía no tocó el cuerpo', () => {
    expect(estaAsentada([quieta, quieta, quieta], MINIMO_DE_CUADROS - 1)).toBe(false);
  });
  it('una lectura que se mueve rompe la racha', () => {
    expect(estaAsentada([quieta, quieta, UMBRAL_MM_POR_CUADRO * 2, quieta, quieta], 1000)).toBe(false);
  });
});
