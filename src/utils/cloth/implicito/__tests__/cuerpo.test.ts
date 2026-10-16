import { describe, expect, it } from 'vitest';
import { buildLinearBVH } from '../../gpu/bvh';
import { CuerpoRigido, puntoMasCercano, type PuntoEnTriangulo } from '../cuerpo';
import { distancia } from '../obstaculos';
import { esferaDeColision } from '../banco/escenas';
import { azar } from './ayudas';

const R = 0.1;
const malla = esferaDeColision(R, 4);
const cuerpo = new CuerpoRigido(buildLinearBVH(malla));

/** Un punto al azar a una distancia entre −2 y +5 cm de la esfera. */
function puntos(semilla: number, cuantos: number): Array<[number, number, number]> {
  const r = azar(semilla);
  return Array.from({ length: cuantos }, () => {
    const d = [r(), r(), r()], l = Math.hypot(d[0], d[1], d[2]), rho = R - 0.02 + 0.07 * (r() + 0.5);
    return [(rho * d[0]) / l, (rho * d[1]) / l, (rho * d[2]) / l];
  });
}

describe('el cuerpo rígido', () => {
  it('sobre la esfera: la distancia con signo, la normal hacia afuera y el punto', () => {
    for (const [x, y, z] of puntos(51, 200)) {
      const c = cuerpo.cercano(x, y, z)!;
      const rho = Math.hypot(x, y, z);
      // las caras de la esfera de 5120 triángulos quedan a menos de 0,1 mm de la esfera exacta
      expect(Math.abs(c.d - (rho - R))).toBeLessThan(5e-4);
      expect((c.nx * x + c.ny * y + c.nz * z) / rho).toBeGreaterThan(0.99);
      expect(Math.hypot(x - c.cx, y - c.cy, z - c.cz)).toBeCloseTo(Math.abs(c.d), 12);
    }
  });

  it('da lo mismo que mirar todos los triángulos', () => {
    const p: PuntoEnTriangulo = { x: 0, y: 0, z: 0, wa: 0, wb: 0, wc: 0, rasgo: 0 };
    const v = malla.vertices;
    for (const [x, y, z] of puntos(53, 60)) {
      let mejor = Infinity;
      for (let t = 0; t < malla.triCount; t++) {
        const o = 9 * t;
        puntoMasCercano(x, y, z, v[o], v[o + 1], v[o + 2], v[o + 3], v[o + 4], v[o + 5], v[o + 6], v[o + 7], v[o + 8], p);
        mejor = Math.min(mejor, Math.hypot(x - p.x, y - p.y, z - p.z));
      }
      expect(Math.abs(cuerpo.cercano(x, y, z)!.d)).toBeCloseTo(mejor, 12);
    }
  });

  it('el punto más cercano: cara, aristas y vértices, con sus pesos', () => {
    const p: PuntoEnTriangulo = { x: 0, y: 0, z: 0, wa: 0, wb: 0, wc: 0, rasgo: 0 };
    const tri = [0, 0, 0, 1, 0, 0, 0, 1, 0] as const;
    const casos: Array<[[number, number, number], number, [number, number, number]]> = [
      [[0.25, 0.25, 1], 0, [0.25, 0.25, 0]],
      [[0.5, -1, 0], 1, [0.5, 0, 0]],
      [[1, 1, 0], 2, [0.5, 0.5, 0]],
      [[-1, 0.5, 0], 3, [0, 0.5, 0]],
      [[-1, -1, 0], 4, [0, 0, 0]],
      [[2, -1, 0], 5, [1, 0, 0]],
      [[-1, 2, 0], 6, [0, 1, 0]],
    ];
    for (const [q, rasgo, esperado] of casos) {
      puntoMasCercano(q[0], q[1], q[2], ...tri, p);
      expect(p.rasgo).toBe(rasgo);
      expect([p.x, p.y, p.z].map((v) => Math.round(v * 1e9) / 1e9)).toEqual(esperado);
      expect(p.wa * tri[0] + p.wb * tri[3] + p.wc * tri[6]).toBeCloseTo(p.x, 12);
      expect(p.wa + p.wb + p.wc).toBeCloseTo(1, 12);
    }
  });

  it('más lejos que el radio, no hay cuerpo', () => {
    expect(cuerpo.cercano(0, 0.4, 0, 0.05)).toBeNull();
    expect(cuerpo.cercano(0, 0.12, 0, 0.05)).not.toBeNull();
  });

  it('los vértices del cuerpo sin repetir, con su normal', () => {
    expect(cuerpo.vertices.length / 3).toBe(2562);
    for (let i = 0; i < cuerpo.vertices.length / 3; i++) {
      const x = cuerpo.vertices[3 * i], y = cuerpo.vertices[3 * i + 1], z = cuerpo.vertices[3 * i + 2];
      const n = cuerpo.normales;
      expect((n[3 * i] * x + n[3 * i + 1] * y + n[3 * i + 2] * z) / Math.hypot(x, y, z)).toBeGreaterThan(0.999);
    }
  });

  it('el obstáculo cuerpo mide lo mismo que el cuerpo', () => {
    const c = distancia({ tipo: 'cuerpo', cuerpo }, 0, 0.13, 0);
    expect(c.d).toBeCloseTo(cuerpo.cercano(0, 0.13, 0)!.d, 15);
    expect(distancia({ tipo: 'cuerpo', cuerpo }, 0, 0.4, 0, 0.05).d).toBe(Infinity);
  });
});
