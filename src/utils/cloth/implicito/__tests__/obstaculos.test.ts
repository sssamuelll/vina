import { describe, expect, it } from 'vitest';
import { distancia, masCercano, type Obstaculo } from '../obstaculos';

const PEDESTAL: Obstaculo = { tipo: 'pedestal', radio: 0.09, tapa: 0.5 };

describe('obstáculos de los ensayos', () => {
  it('el plano: la distancia es la altura sobre él y la normal va hacia arriba', () => {
    const c = distancia({ tipo: 'plano', altura: 0.1 }, 3, 0.25, -2);
    expect(c.d).toBeCloseTo(0.15, 12);
    expect([c.nx, c.ny, c.nz]).toEqual([0, 1, 0]);
  });

  it('el pedestal: tapa, costado, canto y adentro', () => {
    const casos: Array<[[number, number, number], number, [number, number, number]]> = [
      [[0.03, 0.52, 0.04], 0.02, [0, 1, 0]], // sobre la tapa
      [[0.12, 0.4, 0], 0.03, [1, 0, 0]], // al costado
      [[0, 0.53, 0.13], 0.05, [0, 0.6, 0.8]], // junto al canto
      [[0.08, 0.495, 0], -0.005, [0, 1, 0]], // adentro, más cerca de la tapa
      [[0.088, 0.45, 0], -0.002, [1, 0, 0]], // adentro, más cerca del costado
    ];
    for (const [[x, y, z], d, n] of casos) {
      const c = distancia(PEDESTAL, x, y, z);
      expect(c.d).toBeCloseTo(d, 12);
      expect(c.nx).toBeCloseTo(n[0], 12);
      expect(c.ny).toBeCloseTo(n[1], 12);
      expect(c.nz).toBeCloseTo(n[2], 12);
    }
  });

  it('la normal es el gradiente de la distancia (diferencias finitas)', () => {
    const puntos: Array<[number, number, number]> = [
      [0.03, 0.52, 0.04], [0.12, 0.4, -0.05], [0.07, 0.56, 0.1], [0.05, 0.49, 0.02], [0, 0.3, 0.0895],
    ];
    const h = 1e-7;
    const d = (x: number, y: number, z: number) => distancia(PEDESTAL, x, y, z).d;
    for (const [x, y, z] of puntos) {
      const c = distancia(PEDESTAL, x, y, z);
      expect((d(x + h, y, z) - d(x - h, y, z)) / (2 * h)).toBeCloseTo(c.nx, 5);
      expect((d(x, y + h, z) - d(x, y - h, z)) / (2 * h)).toBeCloseTo(c.ny, 5);
      expect((d(x, y, z + h) - d(x, y, z - h)) / (2 * h)).toBeCloseTo(c.nz, 5);
    }
  });

  it('gana el más cercano, con su índice; sin obstáculos no hay ninguno', () => {
    const obs: Obstaculo[] = [{ tipo: 'plano', altura: 0.45 }, PEDESTAL];
    expect(masCercano(obs, 0.2, 0.46, 0)?.k).toBe(0);
    expect(masCercano(obs, 0.1, 0.6, 0)?.k).toBe(1);
    expect(masCercano([], 0, 0, 0)).toBeNull();
  });
});
