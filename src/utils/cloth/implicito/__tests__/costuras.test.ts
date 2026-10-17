import { describe, expect, it } from 'vitest';
import { CIERRE_POR_CUADRO, Costuras, LARGO_CERRADO, puntosDeCostura, type PuntoDeCostura } from '../costuras';
import { armarPrenda } from '../prenda';
import { mallaDeContorno } from '../malla';
import { AJUSTES_IMPLICITO, SistemaTela } from '../sistema';
import { pasoImplicito } from '../paso';
import { aplastados } from '../banco/medidas';
import { rectangulo, TELA_DE_LABORATORIO } from '../banco/escenas';
import { azar, borde, errorDeHessiana, errorDelGradiente } from './ayudas';

/** A (100 × 60 mm, malla de 5 mm) y B (lo mismo con malla de 7 mm, 30 mm a la derecha): la orilla x = 100 de A se cose a la x = 0 de B. */
function dosPiezas() {
  const A = mallaDeContorno(rectangulo(0, 0, 100, 60), 5), B = mallaDeContorno(rectangulo(0, 0, 100, 60), 7);
  const prenda = armarPrenda([
    { id: 'A', x: A.x, patron: A.patron, tris: A.tris },
    { id: 'B', x: Float64Array.from(B.x, (q, k) => (k % 3 === 0 ? q + 0.13 : q)), patron: B.patron, tris: B.tris },
  ]);
  return { prenda, ladoA: borde(A, 0.1), ladoB: borde(B, 0, A.x.length / 3) };
}

/** La separación más grande entre un vértice cosido y su punto, en m. */
function peorSeparacion(s: SistemaTela): number {
  let peor = 0;
  const d = [0, 0, 0];
  for (let e = 0; e < s.costuras.n; e++) {
    s.costuras.separacion(e, s.x, d);
    peor = Math.max(peor, Math.hypot(d[0], d[1], d[2]));
  }
  return peor;
}

describe('las costuras', () => {
  it('cada vértice de A va al punto de B que le toca por largo de arco, y cada vértice de B que no cae en uno de A, a A', () => {
    // A: tres vértices en x = 0 (y = 0; 0,5; 1); B: cuatro en x = 1 (y = 0; ⅓; ⅔; 1)
    const patron = [0, 0, 0, 0.5, 0, 1, 1, 0, 1, 1 / 3, 1, 2 / 3, 1, 1];
    const p = puntosDeCostura(patron, [0, 1, 2], [3, 4, 5, 6]);
    const esperado: PuntoDeCostura[] = [
      { a: 0, b0: 3, b1: 4, s: 0 },
      { a: 1, b0: 4, b1: 5, s: 0.5 },
      { a: 2, b0: 5, b1: 6, s: 1 },
      { a: 4, b0: 0, b1: 1, s: 2 / 3 },
      { a: 5, b0: 1, b1: 2, s: 1 / 3 },
    ];
    expect(p.length).toBe(esperado.length);
    p.forEach((q, k) => {
      expect([q.a, q.b0, q.b1]).toEqual([esperado[k].a, esperado[k].b0, esperado[k].b1]);
      expect(q.s).toBeCloseTo(esperado[k].s, 12);
    });
    // los de B sobre A van de vuelta: con A cosido sobre B, sobran (E8)
    expect(p.map((q) => q.inversa === true)).toEqual([false, false, false, true, true]);
  });

  it('un vértice nunca se cose a un segmento suyo', () => {
    // los dos lados comparten la punta 0: ese punto no es costura
    const patron = [0, 0, 1, 0, 0, 1];
    expect(puntosDeCostura(patron, [0, 1], [0, 2]).some((q) => q.a === q.b0 || q.a === q.b1)).toBe(false);
  });

  it('fuerza = −∂E/∂x y H·p por diferencias finitas, con el largo abierto y cerrado', () => {
    const r = azar(41), x = Float64Array.from({ length: 18 }, () => 0.05 * r());
    const c = new Costuras([{ a: 0, b0: 1, b1: 2, s: 0.3 }, { a: 3, b0: 4, b1: 5, s: 0.8 }], x, 1000);
    c.L[0] = 0.4 * c.L0[0]; // abierta: |d| > L
    c.L[1] = 0; // cerrada
    c.linealizar(x);
    const g = new Float64Array(18);
    c.gradiente(g);
    expect(errorDelGradiente((y) => c.energia(y), g, x)).toBeLessThan(1e-4);
    const p = Float64Array.from({ length: 18 }, () => r()), Hp = new Float64Array(18);
    c.hessianaPor(p, Hp);
    const gradiente = (y: Float64Array, out: Float64Array) => {
      out.fill(0);
      c.linealizar(y);
      c.gradiente(out);
    };
    expect(errorDeHessiana(gradiente, Hp, x, p)).toBeLessThan(1e-4);
  });

  it('el largo de reposo se cierra ×0,97 por subpaso de 15 hasta quedar en 0', () => {
    const c = new Costuras([{ a: 0, b0: 1, b1: 1, s: 0 }], [0, 0, 0, 0.03, 0, 0], 1000);
    expect(c.L0[0]).toBeCloseTo(0.03, 12);
    c.avanzarCierre();
    expect(c.L[0]).toBeCloseTo(0.03 * CIERRE_POR_CUADRO, 12);
    for (let k = 0; k < 40 && !c.cerradas(); k++) c.avanzarCierre();
    expect(c.cerradas()).toBe(true);
    expect(0.03 * CIERRE_POR_CUADRO ** (c.cuadros - 1)).toBeGreaterThanOrEqual(LARGO_CERRADO);
  });

  it('con tope, una costura muy abierta baja a lo sumo el tope por cuadro, y cerca de cerrar manda el cierre de hoy', () => {
    const c = new Costuras([{ a: 0, b0: 1, b1: 1, s: 0 }], [0, 0, 0, 0.03, 0, 0], 1000, 0.005);
    for (const esperado of [0.025, 0.02, 0.015, 0.01]) {
      c.avanzarCierre();
      expect(c.L[0]).toBeCloseTo(esperado, 12);
    }
    // a 10 mm, el cierre de hoy baja 3,7 mm, menos que el tope
    c.avanzarCierre();
    expect(c.L[0]).toBeCloseTo(0.01 * CIERRE_POR_CUADRO, 12);
    for (let k = 0; k < 40 && !c.cerradas(); k++) c.avanzarCierre();
    expect(c.cerradas()).toBe(true);
  });

  it('el sistema le pasa a sus costuras el tope de los ajustes', () => {
    const { prenda, ladoA, ladoB } = dosPiezas();
    const costuras = { puntos: puntosDeCostura(prenda.malla.patron, ladoA, ladoB) };
    expect(new SistemaTela(prenda.malla, TELA_DE_LABORATORIO, { costuras }).costuras.cierreMaximo).toBe(AJUSTES_IMPLICITO.cierreMaximo);
    expect(new SistemaTela(prenda.malla, TELA_DE_LABORATORIO, { costuras, ajustes: { cierreMaximo: 0.002 } }).costuras.cierreMaximo).toBe(0.002);
  });

  it('un tope que no es positivo se rechaza: con 0 las costuras no cerrarían nunca, y con NaN la tela se llenaría de NaN', () => {
    const { prenda } = dosPiezas();
    for (const cierreMaximo of [0, -0.001, Number.NaN]) {
      expect(() => new SistemaTela(prenda.malla, TELA_DE_LABORATORIO, { ajustes: { cierreMaximo } })).toThrow(/cierreMaximo/);
    }
  });

  it('en una costura parcial, cada vértice se cose por su t en el tramo del patrón y no por lo que abarcan los vértices que quedaron', () => {
    // A cubre su tramo entero (t 0, 0,5 y 1); el último vértice de B está en t = 0,8: el filtro del tramo dejó fuera la punta
    const patron = [0, 0, 0.05, 0, 0.1, 0, 0, 1, 0.08, 1];
    const [, medio] = puntosDeCostura(patron, [0, 1, 2], [3, 4], [0, 0.5, 1], [0, 0.8]);
    expect(medio).toMatchObject({ a: 1, b0: 3, b1: 4 });
    expect(medio.s).toBeCloseTo(0.625, 12);
  });

  it('en las puntas de una costura parcial, el punto que cae fuera de los vértices de adentro se cose en el segmento que cruza la punta del tramo', () => {
    // B: dos vértices adentro (t 0,2 y 0,8) y sus vecinos de afuera (5 en t −0,2, 6 en t 1,2)
    const patron = [0, 0, 0.05, 0, 0.1, 0, 0, 1, 0.08, 1, -0.02, 1, 0.1, 1];
    const p = puntosDeCostura(patron, [0, 1, 2], [3, 4], [0, 0.5, 1], [0.2, 0.8], undefined, { antes: { v: 5, t: -0.2 }, despues: { v: 6, t: 1.2 } });
    expect(p[0]).toMatchObject({ a: 0, b0: 5, b1: 3 });
    expect(p[0].s).toBeCloseTo(0.5, 12);
    expect(p[2]).toMatchObject({ a: 2, b0: 4, b1: 6 });
    expect(p[2].s).toBeCloseTo(0.5, 12);
  });

  it('dos piezas de distinta malla se cosen sin aplastar la orilla', () => {
    const { prenda, ladoA, ladoB } = dosPiezas();
    expect(ladoA.length).not.toBe(ladoB.length);
    const s = new SistemaTela(prenda.malla, TELA_DE_LABORATORIO, {
      costuras: { puntos: puntosDeCostura(prenda.malla.patron, ladoA, ladoB) },
      ajustes: { gravedad: 0 },
    });
    for (let c = 0; c < 60; c++) pasoImplicito(s);
    expect(peorSeparacion(s)).toBeLessThan(1e-4);
    expect(aplastados(s.x, prenda.malla)).toBe(0);
  });

  it('cosidas vértice con vértice, las mismas piezas aplastan la orilla (por qué E1)', () => {
    const { prenda, ladoA, ladoB } = dosPiezas();
    // cada vértice de cada lado a su vecino más cercano del otro lado por largo de arco, como matchVertices
    const tDe = (lado: number[]) => lado.map((_, k) => k / (lado.length - 1));
    const tA = tDe(ladoA), tB = tDe(ladoB);
    const cercano = (t: number, ts: number[]) => ts.reduce((m, q, k) => (Math.abs(q - t) < Math.abs(ts[m] - t) ? k : m), 0);
    const puntos: PuntoDeCostura[] = [
      ...ladoA.map((a, k) => ({ a, b0: ladoB[cercano(tA[k], tB)], b1: ladoB[cercano(tA[k], tB)], s: 0 })),
      ...ladoB.map((b, k) => ({ a: b, b0: ladoA[cercano(tB[k], tA)], b1: ladoA[cercano(tB[k], tA)], s: 0 })),
    ];
    const s = new SistemaTela(prenda.malla, TELA_DE_LABORATORIO, { costuras: { puntos }, ajustes: { gravedad: 0 } });
    for (let c = 0; c < 60; c++) pasoImplicito(s);
    expect(aplastados(s.x, prenda.malla)).toBeGreaterThan(0);
  });
});

describe('la puntada (E8)', () => {
  it('se cose en cadena hasta tres niveles: nunca un punto de vuelta, ni un vértice que ya depende, ni un ciclo', () => {
    const puntos: PuntoDeCostura[] = [
      { a: 0, b0: 1, b1: 1, s: 0 },
      // 1 sostiene a 0: se cose igual, y 0 baja un nivel
      { a: 1, b0: 2, b1: 2, s: 0 },
      // 0 depende de 1, que depende de 2: un ciclo
      { a: 2, b0: 0, b1: 0, s: 0 },
      { a: 3, b0: 0, b1: 0, s: 0 },
      // 3 ya está en el nivel 3: un cuarto nivel no
      { a: 4, b0: 3, b1: 3, s: 0 },
      { a: 5, b0: 6, b1: 6, s: 0, inversa: true },
      // 0 ya depende de un punto
      { a: 0, b0: 7, b1: 7, s: 0 },
    ];
    const c = new Costuras(puntos, new Float64Array(3 * 8), 1000, 0.005);
    expect(Array.from(c.soldable)).toEqual([1, 1, 0, 1, 0, 0, 0]);
    expect(Array.from(c.nivel)).toEqual([2, 1, 0, 3, 0, 0, 0]);
  });

  it('en cadena, cada vértice cosido va a su punto en orden de nivel, y restringir sigue siendo la traspuesta de expandir', () => {
    const r = azar(47);
    // 0 sobre el segmento 1-2, y 1 sobre el 3-4: la cadena 0 → 1 → (3, 4)
    const puntos: PuntoDeCostura[] = [{ a: 0, b0: 1, b1: 2, s: 0.25 }, { a: 1, b0: 3, b1: 4, s: 0.5 }];
    const x = Float64Array.from({ length: 15 }, () => r());
    const c = new Costuras(puntos, x, 1000, 0.005);
    c.cosido.fill(1);
    c.avanzarPuntadas(x);
    for (let k = 0; k < 3; k++) {
      expect(x[3 + k]).toBeCloseTo(0.5 * x[9 + k] + 0.5 * x[12 + k], 12);
      expect(x[k]).toBeCloseTo(0.75 * x[3 + k] + 0.25 * x[6 + k], 12);
    }
    const u = Float64Array.from({ length: 15 }, (_, k) => (k < 6 ? 0 : r()));
    const v = Float64Array.from({ length: 15 }, () => r());
    const Pu = Float64Array.from(u), Ptv = Float64Array.from(v);
    c.expandir(Pu);
    c.restringir(Ptv);
    let izq = 0, der = 0;
    for (let k = 0; k < 15; k++) {
      izq += Pu[k] * v[k];
      der += u[k] * Ptv[k];
    }
    expect(izq).toBeCloseTo(der, 12);
    expect(Array.from(Ptv.subarray(0, 6))).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('a menos de cinco cuadros de cierre se cose, y el desfase baja con la ley de E7 hasta 0', () => {
    // el vértice 0 a 20 mm de su punto (el 1); el 2 a 30 mm del 3
    const x = Float64Array.from([0, 0, 0, 0.02, 0, 0, 0, 0, 0, 0.03, 0, 0]);
    const c = new Costuras([{ a: 0, b0: 1, b1: 1, s: 0 }, { a: 2, b0: 3, b1: 3, s: 0 }], x, 1000, 0.005);
    c.coser(x);
    expect(Array.from(c.cosido)).toEqual([1, 0]);
    for (const esperado of [0.005, 0.01]) {
      c.avanzarPuntadas(x);
      expect(x[0]).toBeCloseTo(esperado, 12);
    }
    // a 10 mm, el cierre de hoy baja menos que el tope
    c.avanzarPuntadas(x);
    expect(x[0]).toBeCloseTo(0.02 - 0.01 * CIERRE_POR_CUADRO, 12);
    for (let k = 0; k < 60; k++) c.avanzarPuntadas(x);
    expect(x[0]).toBe(0.02);
    // el que no se cosió no se mueve
    expect(x[6]).toBe(0);
  });

  it('no se cose a través de un obstáculo: con el tramo hasta su punto por dentro de él, sigue el resorte', () => {
    // la orilla de A sobre el piso y la de B, cosida a ella, 20 mm por debajo: el tramo que las une entra en el piso
    const A = mallaDeContorno(rectangulo(0, 0, 100, 60), 10), B = mallaDeContorno(rectangulo(0, 0, 100, 60), 10);
    const prenda = armarPrenda([
      { id: 'A', x: Float64Array.from(A.x, (q, k) => (k % 3 === 1 ? q + 0.005 : q)), patron: A.patron, tris: A.tris },
      { id: 'B', x: Float64Array.from(B.x, (q, k) => (k % 3 === 0 ? q + 0.1 : k % 3 === 1 ? q - 0.015 : q)), patron: B.patron, tris: B.tris },
    ]);
    const puntos = puntosDeCostura(prenda.malla.patron, borde(A, 0.1), borde(B, 0, A.x.length / 3));
    const s = new SistemaTela(prenda.malla, TELA_DE_LABORATORIO, { costuras: { puntos }, obstaculos: [{ tipo: 'plano', altura: 0 }], ajustes: { gravedad: 0 } });
    s.alTerminarCuadro();
    expect(Array.from(s.costuras.cosido).some((c) => c === 1)).toBe(false);
    // sin el piso, las mismas orillas se cosen
    const libre = new SistemaTela(prenda.malla, TELA_DE_LABORATORIO, { costuras: { puntos }, ajustes: { gravedad: 0 } });
    libre.alTerminarCuadro();
    expect(Array.from(libre.costuras.cosido).some((c) => c === 1)).toBe(true);
  });

  it('lo que empuja a un vértice cosido lo cargan sus dos vértices del otro lado: restringir es la traspuesta de expandir', () => {
    const r = azar(43);
    const puntos: PuntoDeCostura[] = [{ a: 0, b0: 2, b1: 3, s: 0.3 }, { a: 1, b0: 3, b1: 4, s: 0.8 }];
    const c = new Costuras(puntos, new Float64Array(3 * 5), 1000, 0.005);
    c.coser(new Float64Array(3 * 5));
    const u = Float64Array.from({ length: 15 }, (_, k) => (k < 6 ? 0 : r()));
    const v = Float64Array.from({ length: 15 }, () => r());
    const Pu = Float64Array.from(u), Ptv = Float64Array.from(v);
    c.expandir(Pu);
    c.restringir(Ptv);
    let izq = 0, der = 0;
    for (let k = 0; k < 15; k++) {
      izq += Pu[k] * v[k];
      der += u[k] * Ptv[k];
    }
    expect(izq).toBeCloseTo(der, 12);
    expect(Array.from(Ptv.subarray(0, 6))).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('cosida, la costura no cede: la pieza que cuelga de ella no la abre aunque el resorte sea blando', () => {
    // A empotrada por su orilla x = 0 y B a continuación, desde x = 100 mm: B cuelga de la costura
    const A = mallaDeContorno(rectangulo(0, 0, 100, 60), 10), B = mallaDeContorno(rectangulo(0, 0, 100, 60), 10);
    const prenda = armarPrenda([
      { id: 'A', x: A.x, patron: A.patron, tris: A.tris },
      { id: 'B', x: Float64Array.from(B.x, (q, k) => (k % 3 === 0 ? q + 0.1 : q)), patron: B.patron, tris: B.tris },
    ]);
    const n = prenda.malla.x.length / 3;
    prenda.malla.fijos = Uint8Array.from({ length: n }, (_, i) => (prenda.malla.x[3 * i] <= 1e-9 ? 1 : 0));
    const puntos = puntosDeCostura(prenda.malla.patron, borde(A, 0.1), borde(B, 0, A.x.length / 3));
    // con 1 N/m, el peso de B abre la costura más de un milímetro
    const s = new SistemaTela(prenda.malla, TELA_DE_LABORATORIO, { costuras: { puntos }, ajustes: { kCostura: 1 } });
    for (let c = 0; c < 30; c++) pasoImplicito(s);
    expect(peorSeparacion(s)).toBeLessThan(1e-6);
  });
});
