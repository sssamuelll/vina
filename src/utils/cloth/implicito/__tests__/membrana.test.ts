import { describe, expect, it } from 'vitest';
import { aMarcoDelHilo } from '../malla';
import { prepararReposo } from '../reposo';
import { AREA_MINIMA, barreraDeArea, ley, Membrana } from '../membrana';
import { telaSI, TOPE_DE_PANDEO } from '../tela';
import { escenaAplastada, laminaPlana, TELA_DE_LABORATORIO } from '../banco/escenas';
import { SistemaTela } from '../sistema';
import { pasoImplicito } from '../paso';
import { azar, errorDeHessiana, errorDelGradiente } from './ayudas';

function membranaDeLamina(pandeo: number, topePandeo?: number) {
  const m = laminaPlana(20);
  const tela = telaSI({ ...TELA_DE_LABORATORIO, pandeo, topePandeo });
  const { coef } = prepararReposo(aMarcoDelHilo(m.patron), m.tris, tela.densidad);
  return { m, mem: new Membrana(m.tris, coef, tela) };
}

describe('la membrana', () => {
  it('la ley: lineal al estirar, igual al encoger hasta la carga de pandeo y plana después', () => {
    const k = 600, pcr = 3, ecr = pcr / k;
    const antes = ley(-ecr, k, pcr), despues = ley(-ecr - 1e-12, k, pcr);
    expect(despues[0]).toBeCloseTo(antes[0], 9);
    expect(despues[1]).toBeCloseTo(antes[1], 6);
    const estira = ley(0.01, k, pcr);
    expect(estira[0]).toBeCloseTo(0.03, 12);
    expect(estira[1]).toBeCloseTo(6, 12);
    expect(estira[2]).toBe(k);
    expect(ley(-0.1, k, pcr)[1]).toBe(-pcr);
    expect(ley(-0.1, k, pcr)[2]).toBe(0);
  });

  it('con tope, la meseta termina: pasado el encogimiento del tope, la tela vuelve a resistir como al estirar', () => {
    const k = 600, pcr = 3, tope = 0.2;
    // en la meseta, igual que sin tope
    expect(ley(-0.1, k, pcr, tope)).toEqual(ley(-0.1, k, pcr));
    // en el tope, la energía y la fuerza siguen sin salto
    const antes = ley(-tope, k, pcr, tope), despues = ley(-tope - 1e-12, k, pcr, tope);
    expect(despues[0]).toBeCloseTo(antes[0], 9);
    expect(despues[1]).toBeCloseTo(antes[1], 6);
    // más allá, la fuerza crece con k: −pcr + k·(ε + tope)
    const pasado = ley(-0.25, k, pcr, tope);
    expect(pasado[1]).toBeCloseTo(-pcr - 0.05 * k, 9);
    expect(pasado[2]).toBe(k);
    expect(pasado[0]).toBeCloseTo(ley(-0.25, k, pcr)[0] + 0.5 * k * 0.05 * 0.05, 9);
  });

  it('una tela sin tope de pandeo toma el de por defecto (E9): la meseta termina al 10 %', () => {
    expect(TOPE_DE_PANDEO).toBe(0.1);
    expect(telaSI(TELA_DE_LABORATORIO).topePandeo).toBe(TOPE_DE_PANDEO);
    expect(telaSI({ ...TELA_DE_LABORATORIO, topePandeo: Infinity }).topePandeo).toBe(Infinity);
  });

  it('sin pandeo o con compresión gratis la ley queda finita', () => {
    const libre = ley(-0.1, 600, 0);
    expect(libre[0]).toBe(0);
    expect(Math.abs(libre[1])).toBe(0);
    expect(libre[2]).toBe(0);
    const rigida = ley(-0.1, 600, Infinity);
    expect(rigida[0]).toBeCloseTo(3, 12);
    expect(rigida[1]).toBeCloseTo(-60, 12);
    expect(rigida[2]).toBe(600);
  });

  for (const [pandeo, tope] of [[Infinity, undefined], [1, undefined], [0, undefined], [1, 0.05]] as const) {
    it(`fuerza = −∂E/∂x por diferencias finitas (pandeo ${pandeo}, tope ${tope ?? 'ninguno'})`, () => {
      const { m, mem } = membranaDeLamina(pandeo, tope);
      const r = azar(7), x = Float64Array.from(m.x, (q) => q + 0.004 * r());
      mem.linealizar(x);
      const g = new Float64Array(x.length);
      mem.gradiente(g);
      expect(errorDelGradiente((y) => mem.energia(y), g, x)).toBeLessThan(1e-4);
    });
  }

  it('en tracción pura la hessiana de Gauss-Newton es la exacta', () => {
    const { m, mem } = membranaDeLamina(1);
    // 5 % a lo ancho (x) y 2 % a lo largo (z): sin cizalla y en tracción
    const x = Float64Array.from(m.x, (q, k) => (k % 3 === 0 ? 1.05 * q : k % 3 === 2 ? 1.02 * q : q));
    const r = azar(11), p = Float64Array.from(x, () => r());
    mem.linealizar(x);
    const Hp = new Float64Array(x.length);
    mem.hessianaPor(p, Hp);
    const gradiente = (y: Float64Array, out: Float64Array) => {
      out.fill(0);
      mem.linealizar(y);
      mem.gradiente(out);
    };
    expect(errorDeHessiana(gradiente, Hp, x, p)).toBeLessThan(1e-5);
  });

  it('la hessiana de Gauss-Newton nunca es negativa (pᵀHp ≥ 0)', () => {
    const { m, mem } = membranaDeLamina(1);
    const r = azar(5), x = Float64Array.from(m.x, (q) => q + 0.004 * r());
    mem.linealizar(x);
    const Hp = new Float64Array(x.length);
    for (let caso = 0; caso < 20; caso++) {
      const p = Float64Array.from(x, () => r());
      Hp.fill(0);
      mem.hessianaPor(p, Hp);
      expect(p.reduce((s, q, k) => s + q * Hp[k], 0)).toBeGreaterThanOrEqual(0);
    }
  });

  it('los bloques diagonales son los de H·p', () => {
    const { m, mem } = membranaDeLamina(1);
    const r = azar(3), x = Float64Array.from(m.x, (q) => q + 0.003 * r());
    mem.linealizar(x);
    const n = x.length / 3, B = new Float64Array(9 * n), e = new Float64Array(3 * n), col = new Float64Array(3 * n);
    mem.sumarBloquesDiagonales(B);
    for (const i of [0, Math.floor(n / 2), n - 1]) {
      for (let d = 0; d < 3; d++) {
        e.fill(0);
        e[3 * i + d] = 1;
        col.fill(0);
        mem.hessianaPor(e, col);
        for (let a = 0; a < 3; a++) expect(B[9 * i + 3 * a + d]).toBeCloseTo(col[3 * i + a], 6);
      }
    }
  });

  describe('la barrera de área (E13)', () => {
    /** la lámina con el triángulo 0 aplastado a `J` de su área: su vértice c baja hacia el borde a-b */
    const conAplastado = (J: number) => {
      const { m, mem } = membranaDeLamina(1);
      const x = Float64Array.from(m.x);
      const [a, b, c] = [m.tris[0], m.tris[1], m.tris[2]];
      for (let d = 0; d < 3; d++) {
        const medio = 0.5 * (x[3 * a + d] + x[3 * b + d]);
        x[3 * c + d] = medio + J * (x[3 * c + d] - medio);
      }
      return { m, mem, x };
    };

    it('nada hasta un quinto del área; desde ahí crece sin tope al aplastar, suave en el borde', () => {
      expect(barreraDeArea(1)).toEqual([0, 0, 0]);
      expect(barreraDeArea(0.3)).toEqual([0, 0, 0]);
      expect(barreraDeArea(AREA_MINIMA)).toEqual([0, 0, 0]);
      const [b1, d1, h1] = barreraDeArea(0.1), [b2, d2] = barreraDeArea(0.05);
      expect(b1).toBeGreaterThan(0);
      expect(b2).toBeGreaterThan(b1);
      expect(d1).toBeLessThan(0);
      expect(d2).toBeLessThan(d1);
      expect(h1).toBeGreaterThan(0);
      // C²: la derivada y la segunda se apagan al llegar a la mitad
      const [, dBorde, hBorde] = barreraDeArea(AREA_MINIMA - 1e-6);
      expect(Math.abs(dBorde)).toBeLessThan(1e-9);
      expect(Math.abs(hBorde)).toBeLessThan(1e-4);
      expect(Number.isFinite(barreraDeArea(0)[0])).toBe(true);
    });

    it('fuerza = −∂E/∂x con un triángulo aplastado a 0,1 de su área (diferencias finitas)', () => {
      const { mem, x } = conAplastado(0.1);
      mem.linealizar(x);
      const g = new Float64Array(x.length);
      mem.gradiente(g);
      expect(errorDelGradiente((y) => mem.energia(y), g, x)).toBeLessThan(1e-4);
    });

    it('la fuerza que abre el triángulo aplastado crece sin tope: a 0,01 de su área, más de cinco veces la de 0,1', () => {
      const fuerza = (J: number) => {
        const { m, mem, x } = conAplastado(J);
        mem.linealizar(x);
        const g = new Float64Array(x.length);
        mem.gradiente(g);
        const c = m.tris[2];
        return Math.hypot(g[3 * c], g[3 * c + 1], g[3 * c + 2]);
      };
      expect(fuerza(0.01)).toBeGreaterThan(5 * fuerza(0.1));
    });

    it('la tela abre el triángulo aplastado: en 20 cuadros sin gravedad pasa de un quinto de su área', () => {
      const e = escenaAplastada();
      const s = new SistemaTela(e.malla, TELA_DE_LABORATORIO, { ajustes: { gravedad: 0 } });
      for (let c = 0; c < 20; c++) pasoImplicito(s);
      s.membrana.linealizar(s.x);
      expect(s.membrana.estado[14]).toBeGreaterThan(AREA_MINIMA);
    });

    it('con un triángulo aplastado, la hessiana no es negativa y sus bloques diagonales son los de H·p', () => {
      const { mem, x } = conAplastado(0.1);
      mem.linealizar(x);
      const r = azar(9), n = x.length / 3, Hp = new Float64Array(x.length);
      for (let caso = 0; caso < 10; caso++) {
        const p = Float64Array.from(x, () => r());
        Hp.fill(0);
        mem.hessianaPor(p, Hp);
        expect(p.reduce((s, q, k) => s + q * Hp[k], 0)).toBeGreaterThanOrEqual(0);
      }
      const B = new Float64Array(9 * n), e = new Float64Array(3 * n), col = new Float64Array(3 * n);
      mem.sumarBloquesDiagonales(B);
      for (let d = 0; d < 3; d++) {
        e.fill(0);
        e[3 * mem.tris[2] + d] = 1;
        col.fill(0);
        mem.hessianaPor(e, col);
        for (let a = 0; a < 3; a++) expect(B[9 * mem.tris[2] + 3 * a + d]).toBeCloseTo(col[3 * mem.tris[2] + a], 6);
      }
    });
  });

  it('un triángulo aplastado hasta un punto no da NaN', () => {
    const { m, mem } = membranaDeLamina(1);
    const x = Float64Array.from(m.x);
    const [a, b, c] = [m.tris[0], m.tris[1], m.tris[2]];
    for (const v of [b, c]) for (let d = 0; d < 3; d++) x[3 * v + d] = x[3 * a + d];
    mem.linealizar(x);
    const g = new Float64Array(x.length), Hp = new Float64Array(x.length);
    mem.gradiente(g);
    mem.hessianaPor(Float64Array.from(x, () => 1), Hp);
    expect(g.every(Number.isFinite)).toBe(true);
    expect(Hp.every(Number.isFinite)).toBe(true);
    expect(Number.isFinite(mem.energia(x))).toBe(true);
  });
});
