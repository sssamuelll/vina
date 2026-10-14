import { describe, expect, it } from 'vitest';
import { colocarDesdeObj } from '../banco/colocacion';
import { mallaDeContorno } from '../malla';
import type { Obj } from '../banco/obj';

/** Una L de 120 × 80 mm: no tiene simetría, así que un espejo equivocado no pasa. */
const ELE: Array<[number, number]> = [[0, 0], [120, 0], [120, 30], [40, 30], [40, 80], [0, 80]];

/** El patrón (m) envuelto en un cilindro de 20 cm de radio alrededor del eje y, sin estirarlo. */
const envolver = (px: number, py: number): [number, number, number] => [0.2 * Math.sin(px / 0.2), -py, 0.2 * Math.cos(px / 0.2)];

/** La otra malla (7 mm): sus coordenadas de textura son el patrón centrado en su caja, a `porMm` por mm y con el eje v al revés. */
function otraMalla(porMm: number): Obj {
  const m = mallaDeContorno(ELE, 7);
  const n = m.x.length / 3;
  const v = new Float64Array(3 * n), vt = new Float64Array(2 * n);
  for (let i = 0; i < n; i++) {
    const [x, y, z] = envolver(m.patron[2 * i], m.patron[2 * i + 1]);
    v.set([1000 * x, 1000 * y, 1000 * z], 3 * i);
    vt[2 * i] = (1000 * m.patron[2 * i] - 60) * porMm;
    vt[2 * i + 1] = -(1000 * m.patron[2 * i + 1] - 40) * porMm;
  }
  return { v, vt, tris: m.tris, trisT: m.tris, grupos: [{ nombre: 'L', t0: 0, nt: m.tris.length / 3 }] };
}

describe('la colocación de otra malla, llevada a la de Vina por el patrón (E5)', () => {
  it('cada vértice de Vina cae donde la otra malla tenía ese punto del patrón', () => {
    const vina = mallaDeContorno(ELE, 10);
    const r = colocarDesdeObj([{ patron: vina.patron, tris: vina.tris }], otraMalla(1 / 123.4), [0]);
    expect(r.mmPorVt).toBeCloseTo(123.4, 0);
    // la otra malla trae el eje v al revés: el espejo que encaja invierte solo ese eje
    expect(r.espejo[0]).toEqual([1, -1]);
    expect(r.error[0]).toBeLessThan(0.5);
    let peor = 0;
    for (let i = 0; i < vina.x.length / 3; i++) {
      const [x, y, z] = envolver(vina.patron[2 * i], vina.patron[2 * i + 1]);
      peor = Math.max(peor, Math.hypot(r.x[0][3 * i] - x, r.x[0][3 * i + 1] - y, r.x[0][3 * i + 2] - z));
    }
    // la cuerda de un triángulo de 7 mm sobre un radio de 20 cm se aparta 0,03 mm del cilindro
    expect(peor).toBeLessThan(2e-4);
  });

  it('una pieza simétrica toma el espejo de las demás: todas vienen del mismo DXF', () => {
    // un rectángulo (le encajan los cuatro espejos) junto a la L, en dos grupos del mismo OBJ
    const RECT: Array<[number, number]> = [[0, 0], [100, 0], [100, 20], [0, 20]];
    const l = otraMalla(1 / 123.4), r = mallaDeContorno(RECT, 7), nl = l.v.length / 3, ntl = l.tris.length / 3, nr = r.x.length / 3;
    const v = new Float64Array(3 * (nl + nr)), vt = new Float64Array(2 * (nl + nr));
    v.set(l.v);
    vt.set(l.vt);
    for (let i = 0; i < nr; i++) {
      const [x, y, z] = envolver(r.patron[2 * i], r.patron[2 * i + 1] + 0.1);
      v.set([1000 * x, 1000 * y, 1000 * z], 3 * (nl + i));
      vt[2 * (nl + i)] = (1000 * r.patron[2 * i] - 50) / 123.4;
      vt[2 * (nl + i) + 1] = -(1000 * r.patron[2 * i + 1] - 10) / 123.4;
    }
    const tris = Uint32Array.from([...l.tris, ...Array.from(r.tris, (q) => q + nl)]);
    const obj: Obj = { v, vt, tris, trisT: tris, grupos: [{ nombre: 'L', t0: 0, nt: ntl }, { nombre: 'R', t0: ntl, nt: r.tris.length / 3 }] };
    const vl = mallaDeContorno(ELE, 10), vr = mallaDeContorno(RECT, 10);
    const c = colocarDesdeObj([{ patron: vl.patron, tris: vl.tris }, { patron: vr.patron, tris: vr.tris }], obj, [0, 1]);
    expect(c.espejo).toEqual([[1, -1], [1, -1]]);
    let peor = 0;
    for (let i = 0; i < vr.x.length / 3; i++) {
      const [x, y, z] = envolver(vr.patron[2 * i], vr.patron[2 * i + 1] + 0.1);
      peor = Math.max(peor, Math.hypot(c.x[1][3 * i] - x, c.x[1][3 * i + 1] - y, c.x[1][3 * i + 2] - z));
    }
    expect(peor).toBeLessThan(2e-4);
  });

  it('con el espejo dado, una pieza gemela asignada a la otra queda con un error grande', () => {
    // dos L espejadas, como las dos mangas; asignadas al revés, con el espejo de las demás piezas no encajan
    const espejada = (m: Obj): Obj => ({ ...m, vt: Float64Array.from(m.vt, (q, k) => (k % 2 === 0 ? -q : q)) });
    const izq = otraMalla(1 / 123.4), der = espejada(otraMalla(1 / 123.4)), ni = izq.v.length / 3, nti = izq.tris.length / 3;
    const tris = Uint32Array.from([...izq.tris, ...Array.from(der.tris, (q) => q + ni)]);
    const v = new Float64Array([...izq.v, ...der.v]), vt = new Float64Array([...izq.vt, ...der.vt]);
    const obj: Obj = { v, vt, tris, trisT: tris, grupos: [{ nombre: 'izq', t0: 0, nt: nti }, { nombre: 'der', t0: nti, nt: der.tris.length / 3 }] };
    const L = mallaDeContorno(ELE, 10), Lesp = mallaDeContorno(ELE.map(([x, y]) => [120 - x, y] as [number, number]), 10);
    const piezas = [{ patron: L.patron, tris: L.tris }, { patron: Lesp.patron, tris: Lesp.tris }];
    expect(Math.max(...colocarDesdeObj(piezas, obj, [0, 1], [1, -1]).error)).toBeLessThan(0.5);
    expect(Math.max(...colocarDesdeObj(piezas, obj, [1, 0], [1, -1]).error)).toBeGreaterThan(10);
  });

  it('se niega si las piezas no tienen el mismo tamaño', () => {
    const vina = mallaDeContorno(ELE.map(([x, y]) => [1.1 * x, y] as [number, number]), 10);
    expect(() => colocarDesdeObj([{ patron: vina.patron, tris: vina.tris }], otraMalla(1 / 123.4), [0])).toThrow(/tamaño/);
  });
});
