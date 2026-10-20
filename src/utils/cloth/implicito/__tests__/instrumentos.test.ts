import { describe, expect, it } from 'vitest';
import { costurasPorClase, ladoDeCara, LadosDeLosPares } from '../banco/instrumentos';

// la cara (0, 0, 0)-(1, 0, 0)-(0, 1, 0), normal +z, y el vértice 3 encima o debajo
const conVertice = (x: number, y: number, z: number) => Float64Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0, x, y, z]);
/** un par de la lista de la GPU: [i, ia, ib, ic, w (4), n (3), p0, kt, activo] */
const par = (v: number[]) => Float32Array.from([...v, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1]);

describe('el lado de un vértice frente a una cara', () => {
  it('encima +1, debajo −1', () => {
    expect(ladoDeCara(conVertice(0.2, 0.2, 0.003), 3, 0, 1, 2)).toBe(1);
    expect(ladoDeCara(conVertice(0.2, 0.2, -0.003), 3, 0, 1, 2)).toBe(-1);
  });

  it('no se juzga si cae fuera de la cara, si está más lejos que el alcance o si está sobre su plano', () => {
    expect(ladoDeCara(conVertice(0.8, 0.8, 0.003), 3, 0, 1, 2)).toBe(0);
    expect(ladoDeCara(conVertice(0.2, 0.2, 0.05), 3, 0, 1, 2)).toBe(0);
    expect(ladoDeCara(conVertice(0.2, 0.2, 0), 3, 0, 1, 2)).toBe(0);
  });
});

describe('los pares del lado malo', () => {
  it('el vértice que atraviesa la cara de su par queda del lado malo hasta que vuelve', () => {
    const lados = new LadosDeLosPares();
    lados.anotar(par([3, 0, 1, 2]), 1, conVertice(0.2, 0.2, 0.003));
    expect(lados.revisar(conVertice(0.2, 0.2, 0.001))).toEqual({ pares: 0, vertices: 0 });
    expect(lados.revisar(conVertice(0.2, 0.2, -0.001))).toEqual({ pares: 1, vertices: 1 });
    expect(lados.revisar(conVertice(0.2, 0.2, 0.002))).toEqual({ pares: 0, vertices: 0 });
  });

  it('el lado es el de la primera vez que se vio el par, aunque después la lista ya no lo traiga', () => {
    const lados = new LadosDeLosPares();
    lados.anotar(par([3, 0, 1, 2]), 1, conVertice(0.2, 0.2, 0.003));
    // el par vuelve a la lista ya cruzado: no se reanota
    lados.anotar(par([3, 0, 1, 2]), 1, conVertice(0.2, 0.2, -0.003));
    expect(lados.revisar(conVertice(0.2, 0.2, -0.003)).pares).toBe(1);
  });

  it('un par que no se pudo juzgar se anota la próxima vez que llega a la lista', () => {
    const lados = new LadosDeLosPares();
    lados.anotar(par([3, 0, 1, 2]), 1, conVertice(0.2, 0.2, 0));
    lados.anotar(par([3, 0, 1, 2]), 1, conVertice(0.2, 0.2, -0.003));
    expect(lados.revisar(conVertice(0.2, 0.2, -0.002)).pares).toBe(0);
    expect(lados.revisar(conVertice(0.2, 0.2, 0.002)).pares).toBe(1);
  });

  it('los cruces de hoy, por vértice según toquen una costura, y por hondura del par', () => {
    // el vértice 3 contra la cara 0-1-2 y el vértice 4 contra la cara 1-2-5; la costura pasa por el vértice 5
    const x = Float64Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0, 0.2, 0.2, 0.003, 0.7, 0.6, 0.003, 1, 1, 0]);
    const lados = new LadosDeLosPares();
    lados.anotar(Float32Array.from([...par([3, 0, 1, 2]), ...par([4, 1, 2, 5])]), 2, x);
    x[11] = -0.00005;
    x[14] = -0.002;
    expect(lados.cruces(x, new Set([5]))).toEqual({ enCostura: 1, lejos: 1, porHondura: [0, 1, 0, 1] });
    x[11] = 0.001;
    expect(lados.cruces(x, new Set([5]))).toEqual({ enCostura: 1, lejos: 0, porHondura: [0, 0, 0, 1] });
  });

  it('las puntas del cuerpo (cuarto vértice −1) y los pares de más allá de `cuantos` no cuentan', () => {
    const lados = new LadosDeLosPares();
    const dos = Float32Array.from([...par([0, 1, 2, -1]), ...par([3, 0, 1, 2])]);
    lados.anotar(dos, 1, conVertice(0.2, 0.2, 0.003));
    expect(lados.revisar(conVertice(0.2, 0.2, -0.003)).pares).toBe(0);
  });
});

describe('la separación de las costuras por clase de punto', () => {
  // el punto e cose el vértice a sobre el punto medio de b0-b1; cada punto lleva su separación en z
  const costuras = { n: 4, a: Uint32Array.from([0, 3, 6, 9]), b0: Uint32Array.from([1, 4, 7, 10]), b1: Uint32Array.from([2, 5, 8, 11]), s: Float64Array.from([0.5, 0.5, 0.5, 0.5]) };
  const x = new Float64Array(3 * 12);
  [0.001, 0.002, 0.004, 0.008].forEach((z, e) => (x[3 * 3 * e + 2] = z));

  it('el cuerpo entre los lados manda sobre la esquina, la esquina sobre cosido, y cosido sobre resorte', () => {
    // el punto 0 cruza el cuerpo; el 1 tiene su vértice en dos puntos (esquina); el 2 está cosido; el 3 es resorte
    const conEsquina = { ...costuras, n: 5, a: Uint32Array.from([0, 3, 6, 9, 3]), b0: Uint32Array.from([1, 4, 7, 10, 10]), b1: Uint32Array.from([2, 5, 8, 11, 11]), s: Float64Array.from([0.5, 0.5, 0.5, 0.5, 0.5]) };
    const c = costurasPorClase(x, conEsquina, [1, 0, 1, 0, 0], (e) => e === 0);
    expect(c.cuerpo).toEqual({ puntos: 1, mediana: 0.001, maxima: 0.001 });
    expect(c.esquina.puntos).toBe(2);
    expect(c.esquina.maxima).toBeCloseTo(0.002, 12);
    expect(c.cosido).toEqual({ puntos: 1, mediana: 0.004, maxima: 0.004 });
    expect(c.resorte).toEqual({ puntos: 1, mediana: 0.008, maxima: 0.008 });
  });

  it('`cruza` recibe la separación x_a − (1 − s)·x_b0 − s·x_b1', () => {
    const vistas: number[][] = [];
    costurasPorClase(x, costuras, [0, 0, 0, 0], (_e, d) => (vistas.push([...d]), false));
    expect(vistas[3]).toEqual([0, 0, 0.008]);
  });
});
