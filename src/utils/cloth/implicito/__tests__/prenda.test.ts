import { describe, expect, it } from 'vitest';
import { armarPrenda, costurasDePrenda, type PiezaDeTela } from '../prenda';
import { mallaDeContorno } from '../malla';
import { SistemaTela } from '../sistema';
import { telaSI } from '../tela';
import { rectangulo, TELA_DE_LABORATORIO } from '../banco/escenas';
import type { LocalVertexIndex, SeamPair } from '../../seamPairs';
import { borde } from './ayudas';

/** Una costura de A con B por sus lados (índices de cada pieza tal como llegó). */
const costuraAB = (a: number[], b: number[]): SeamPair => ({
  pieceAId: 'A', pieceBId: 'B', vertexPairs: [], compliance: 0, tensionFactor: 1, lados: { a: a as LocalVertexIndex[], b: b as LocalVertexIndex[] },
});

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

  it('quita los vértices que ningún triángulo usa, y las costuras los saltan sin correrse', () => {
    const A = mallaDeContorno(rectangulo(0, 0, 50, 30), 10), B = mallaDeContorno(rectangulo(0, 0, 50, 30), 10);
    const nA = A.x.length / 3;
    // un punto suelto al final de A, como los que deja una línea interna que sale del contorno
    const conSuelto: PiezaDeTela = { id: 'A', x: Float64Array.from([...A.x, 0.2, 0, 0.2]), patron: Float64Array.from([...A.patron, 0.2, 0.2]), tris: A.tris };
    const prenda = armarPrenda([conSuelto, { id: 'B', ...B, x: Float64Array.from(B.x, (q, k) => (k % 3 === 0 ? q + 0.08 : q)) }]);
    expect(prenda.piezas.map((p) => [p.v0, p.nv])).toEqual([[0, nA], [nA, B.x.length / 3]]);
    expect(prenda.piezas[0].local[nA]).toBe(-1);
    expect(() => new SistemaTela(prenda.malla, TELA_DE_LABORATORIO)).not.toThrow();
    expect(costurasDePrenda(prenda, [costuraAB(borde(A, 0.05), borde(B, 0))]).lados[0]).toEqual({ a: borde(A, 0.05), b: borde(B, 0, nA) });
  });

  it('suelda los vértices que coinciden en el patrón y quita los triángulos sin área (las copias del mallador)', () => {
    const A = mallaDeContorno(rectangulo(0, 0, 50, 30), 10), nA = A.x.length / 3, ntA = A.tris.length / 3;
    // una copia exacta del vértice a y una astilla sin área entre él, el vértice b y la copia
    const a = A.tris[0], b = A.tris[1];
    const conCopia: PiezaDeTela = {
      id: 'A',
      x: Float64Array.from([...A.x, A.x[3 * a], A.x[3 * a + 1], A.x[3 * a + 2]]),
      patron: Float64Array.from([...A.patron, A.patron[2 * a], A.patron[2 * a + 1]]),
      tris: Uint32Array.from([...A.tris, a, b, nA]),
    };
    const prenda = armarPrenda([conCopia, { id: 'B', ...A }]);
    const r = prenda.piezas[0];
    expect([r.nv, r.nt]).toEqual([nA, ntA]);
    expect(r.local[nA]).toBe(r.local[a]);
    expect(() => new SistemaTela(prenda.malla, TELA_DE_LABORATORIO)).not.toThrow();
    // en el lado de una costura, la copia no repite su vértice
    expect(costurasDePrenda(prenda, [costuraAB([b, a, nA], [0, 1])]).lados[0].a).toEqual([r.local[b], r.local[a]]);
  });

  it('una costura salta el vértice quitado (no es tela) y rechaza el que la pieza no tiene', () => {
    const A = mallaDeContorno(rectangulo(0, 0, 50, 30), 10), nA = A.x.length / 3;
    const prenda = armarPrenda([
      { id: 'A', x: Float64Array.from([...A.x, 0.2, 0, 0.2]), patron: Float64Array.from([...A.patron, 0.2, 0.2]), tris: A.tris },
      { id: 'B', ...A },
    ]);
    expect(costurasDePrenda(prenda, [costuraAB([0, nA, 1], [0, 1])]).lados[0].a).toEqual([0, 1]);
    expect(() => costurasDePrenda(prenda, [costuraAB([nA + 5], [0])])).toThrow(new RegExp(`vértice ${nA + 5}`));
  });
});
