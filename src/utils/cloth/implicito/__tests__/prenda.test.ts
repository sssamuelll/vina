import { describe, expect, it } from 'vitest';
import { armarPrenda, type PiezaDeTela } from '../prenda';
import { mallaDeContorno } from '../malla';
import { SistemaTela } from '../sistema';
import { telaSI } from '../tela';
import { rectangulo, TELA_DE_LABORATORIO } from '../banco/escenas';

/** Un cuadrado de 100 mm mallado a 10 mm, corrido dx metros en x. */
function cuadrado(id: string, dx: number, hilo?: readonly [number, number]): PiezaDeTela {
  const m = mallaDeContorno(rectangulo(0, 0, 100, 100), 10);
  return { id, x: Float64Array.from(m.x, (q, k) => (k % 3 === 0 ? q + dx : q)), patron: m.patron, tris: m.tris, hilo };
}

describe('la prenda: varias piezas, cada una con su hilo', () => {
  it('junta las piezas corriendo sus índices', () => {
    const a = cuadrado('a', 0), b = cuadrado('b', 0.2);
    const p = armarPrenda([a, b]);
    const na = a.x.length / 3, ta = a.tris.length / 3;
    expect(p.piezas.map((q) => [q.id, q.v0, q.nv, q.t0, q.nt])).toEqual([
      ['a', 0, na, 0, ta],
      ['b', na, b.x.length / 3, ta, b.tris.length / 3],
    ]);
    expect(p.malla.tris[3 * ta]).toBe(b.tris[0] + na);
    expect(p.malla.piezaDeTri![0]).toBe(0);
    expect(p.malla.piezaDeTri![ta]).toBe(1);
    expect(p.malla.x[3 * na]).toBeCloseTo(b.x[0], 12);
  });

  it('cada pieza estira según su hilo: el mismo 1 % en x pide kTrama a una y kUrdimbre a la otra', () => {
    const t = telaSI(TELA_DE_LABORATORIO), A = 0.1 * 0.1, eps = 0.01;
    const energia = (hilo?: readonly [number, number]) => {
      const s = new SistemaTela(armarPrenda([cuadrado('p', 0, hilo)]).malla, TELA_DE_LABORATORIO);
      return s.membrana.energia(Float64Array.from(s.x, (q, k) => (k % 3 === 0 ? q * (1 + eps) : q)));
    };
    // hilo vertical: x va a lo ancho; hilo horizontal: x va a lo largo de la urdimbre
    expect(energia() / (A * 0.5 * t.kTrama * eps * eps)).toBeCloseTo(1, 3);
    expect(energia([1, 0]) / (A * 0.5 * t.kUrdimbre * eps * eps)).toBeCloseTo(1, 3);
  });

  it('una pieza espejada entra junto a las otras: el sentido del reposo se revisa por pieza', () => {
    const a = cuadrado('a', 0), b = cuadrado('b', 0.2);
    const espejada: PiezaDeTela = { ...b, patron: Float64Array.from(b.patron, (q, k) => (k % 2 === 0 ? -q : q)) };
    const prenda = armarPrenda([a, espejada]);
    const s = new SistemaTela(prenda.malla, TELA_DE_LABORATORIO);
    // en la posición del dibujo ninguna pieza está deformada: el espejo no estira
    expect(s.membrana.energia(s.x)).toBeLessThan(1e-12);
    // la misma malla sin decir de qué pieza es cada triángulo sigue rechazando el sentido mezclado
    expect(() => new SistemaTela({ ...prenda.malla, piezaDeTri: undefined }, TELA_DE_LABORATORIO)).toThrow(/al revés/);
  });
});
