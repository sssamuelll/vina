import { describe, expect, it } from 'vitest';
import { dihedralAngle } from '../../dihedral';
import { aMarcoDelHilo } from '../malla';
import { anguloYGradiente, Placa } from '../placa';
import { telaSI } from '../tela';
import { laminaPlana, TELA_DE_LABORATORIO } from '../banco/escenas';
import { azar, curvar, errorDeHessiana, errorDelGradiente } from './ayudas';

const R = 0.05;
const tela = telaSI(TELA_DE_LABORATORIO);

describe('la placa', () => {
  it('el gradiente del ángulo coincide con diferencias finitas', () => {
    const r = azar(7), g = new Float64Array(12), g2 = new Float64Array(12);
    let peor = 0;
    for (let caso = 0; caso < 50; caso++) {
      const x = Float64Array.from({ length: 12 }, () => r());
      const th = anguloYGradiente(x, 0, 1, 2, 3, g);
      if (th === null || Math.abs(Math.abs(th) - Math.PI) < 0.2) continue;
      for (let k = 0; k < 12; k++) {
        const h = 1e-6, xp = Float64Array.from(x), xm = Float64Array.from(x);
        xp[k] += h;
        xm[k] -= h;
        const num = ((anguloYGradiente(xp, 0, 1, 2, 3, g2) ?? 0) - (anguloYGradiente(xm, 0, 1, 2, 3, g2) ?? 0)) / (2 * h);
        peor = Math.max(peor, Math.abs(num - g[k]) / (1 + Math.abs(num)));
      }
    }
    expect(peor).toBeLessThan(1e-5);
  });

  it('el ángulo es el de dihedral.ts, con la misma convención de signo', () => {
    const r = azar(9), g = new Float64Array(12);
    let comparados = 0;
    for (let caso = 0; caso < 20; caso++) {
      const x = Float64Array.from({ length: 12 }, () => r());
      const a = anguloYGradiente(x, 0, 1, 2, 3, g), b = dihedralAngle(Float32Array.from(x), 0, 1, 2, 3);
      if (a === null || b === null || Math.abs(a) > Math.PI - 0.1) continue;
      expect(a).toBeCloseTo(b, 4);
      comparados++;
    }
    expect(comparados).toBeGreaterThan(10);
  });

  const casos = [
    ['a lo ancho', [1, 0], tela.bTrama],
    ['a lo largo', [0, 1], tela.bUrdimbre],
    ['al bies', [Math.SQRT1_2, Math.SQRT1_2], tela.bBies],
  ] as const;
  for (const [nombre, dir, B] of casos) {
    for (const arista of [2.5, 5, 10]) {
      it(`lámina sobre un cilindro, curvatura ${nombre}, malla de ${arista} mm: entre 0,85 y 1,05 de la energía exacta`, () => {
        const m = laminaPlana(arista);
        const placa = new Placa(aMarcoDelHilo(m.patron), m.tris, tela);
        const razon = placa.energia(curvar(m, dir, R)) / (0.5 * B * (1 / R) ** 2 * 0.12 * 0.12);
        expect(razon).toBeGreaterThan(0.85);
        expect(razon).toBeLessThan(1.05);
      });
    }
  }

  it('con la urdimbre a lo largo del eje x del dibujo, curvar a lo largo de x pide bUrdimbre', () => {
    const m = laminaPlana(5);
    const placa = new Placa(aMarcoDelHilo(m.patron, [1, 0]), m.tris, tela);
    const razon = placa.energia(curvar(m, [1, 0], R)) / (0.5 * tela.bUrdimbre * (1 / R) ** 2 * 0.12 * 0.12);
    expect(razon).toBeGreaterThan(0.85);
    expect(razon).toBeLessThan(1.05);
  });

  it('fuerza de flexión = −∂E/∂x por diferencias finitas', () => {
    const m = laminaPlana(20);
    const placa = new Placa(aMarcoDelHilo(m.patron), m.tris, tela);
    const r = azar(13), x = Float64Array.from(m.x, (q, k) => (k % 3 === 1 ? q + 0.004 * r() : q));
    placa.linealizar(x);
    const g = new Float64Array(x.length);
    placa.gradiente(g);
    expect(errorDelGradiente((y) => placa.energia(y), g, x)).toBeLessThan(1e-4);
  });

  it('en la lámina plana la hessiana de Gauss-Newton es la exacta', () => {
    const m = laminaPlana(20);
    const placa = new Placa(aMarcoDelHilo(m.patron), m.tris, tela);
    const x = Float64Array.from(m.x);
    const r = azar(17), p = Float64Array.from(x, () => r());
    placa.linealizar(x);
    const Hp = new Float64Array(x.length);
    placa.hessianaPor(p, Hp);
    const gradiente = (y: Float64Array, out: Float64Array) => {
      out.fill(0);
      placa.linealizar(y);
      placa.gradiente(out);
    };
    expect(errorDeHessiana(gradiente, Hp, x, p)).toBeLessThan(1e-4);
  });

  it('la hessiana no es negativa y sus bloques diagonales son los de H·p', () => {
    const m = laminaPlana(20);
    const placa = new Placa(aMarcoDelHilo(m.patron), m.tris, tela);
    const r = azar(19), x = Float64Array.from(m.x, (q, k) => (k % 3 === 1 ? q + 0.004 * r() : q));
    placa.linealizar(x);
    const n = x.length / 3, Hp = new Float64Array(3 * n);
    for (let caso = 0; caso < 10; caso++) {
      const p = Float64Array.from(x, () => r());
      Hp.fill(0);
      placa.hessianaPor(p, Hp);
      expect(p.reduce((s, q, k) => s + q * Hp[k], 0)).toBeGreaterThanOrEqual(0);
    }
    const B = new Float64Array(9 * n), e = new Float64Array(3 * n), col = new Float64Array(3 * n);
    placa.sumarBloquesDiagonales(B);
    for (const i of [0, Math.floor(n / 2), n - 1]) {
      for (let d = 0; d < 3; d++) {
        e.fill(0);
        e[3 * i + d] = 1;
        col.fill(0);
        placa.hessianaPor(e, col);
        for (let a = 0; a < 3; a++) expect(B[9 * i + 3 * a + d]).toBeCloseTo(col[3 * i + a], 9);
      }
    }
  });
});
