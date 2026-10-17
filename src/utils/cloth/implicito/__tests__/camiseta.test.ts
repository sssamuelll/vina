import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { camisetaDeMaria, costurasDeMaria, hiloDe, piezasDeMaria, type Colocacion } from '../banco/camiseta';
import { TELA_DE_LABORATORIO } from '../banco/escenas';
import { SistemaTela } from '../sistema';
import { pasoImplicito } from '../paso';

const DXF = readFileSync(resolve(__dirname, '../../../../../tests/fixtures/garments/maria_patrones_samuel_2M.dxf'), 'utf-8');

/** Cada pieza acostada en y = 1 m, una al lado de la otra: para armarla, la colocación no importa. */
const enFila: Colocacion = (_piezas, mallas) => mallas.map((m, k) => Float64Array.from(m.vertices, (q, j) => (j % 3 === 0 ? q + 0.7 * k : j % 3 === 1 ? 1 : q)));

describe('la camiseta de María para el motor implícito', () => {
  it('a 20 mm se arma: cinco piezas sin vértices sueltos, sus costuras, sus bisagras, su margen y un paso que no sube G', () => {
    const c = camisetaDeMaria(DXF, 20, TELA_DE_LABORATORIO, enFila);
    expect(c.prenda.piezas).toHaveLength(5);
    // sin las líneas de dibujo, el mallador no deja puntos fuera de la pieza
    expect(c.prenda.piezas.every((p) => p.local.every((j) => j >= 0))).toBe(true);
    expect(c.lados.length).toBeGreaterThanOrEqual(15);
    expect(c.costuras.puntos.length).toBeGreaterThan(400);
    expect(c.costuras.bisagras.length).toBeGreaterThan(100);
    expect(c.franja.some((f) => f === 1)).toBe(true);
    const s = new SistemaTela(c.prenda.malla, TELA_DE_LABORATORIO, { costuras: c.costuras, franja: c.franja, ajustes: { gravedad: 0 } });
    const info = pasoImplicito(s);
    expect(info.G1).toBeLessThanOrEqual(info.G0);
  }, 120_000);

  it('la malla del motor no trae astillas: la flexión de cada triángulo queda cerca de la de los demás', () => {
    const c = camisetaDeMaria(DXF, 20, TELA_DE_LABORATORIO, enFila);
    const s = new SistemaTela(c.prenda.malla, TELA_DE_LABORATORIO);
    const k: number[] = [];
    for (let t = 0; t < s.tris.length / 3; t++) {
      let m = 0;
      for (let q = 0; q < 9; q++) m = Math.max(m, Math.abs(s.placa.K[9 * t + q]));
      k.push(m);
    }
    const mediana = [...k].sort((a, b) => a - b)[Math.floor(k.length / 2)];
    // con las líneas de dibujo como restricción, el mallador dejaba astillas con K 1e16 veces la mediana; sin ellas, lo
    // más alto (unas 6e5 veces) son triángulos de borde con sus dos bordes interiores casi alineados, que la placa mide mal
    expect(Math.max(...k)).toBeLessThan(1e8 * mediana);
  }, 120_000);

  it('a 20 mm, la punta del escote se cose en el segmento de la tira que cruza la punta del tramo', () => {
    const c = camisetaDeMaria(DXF, 20, TELA_DE_LABORATORIO, enFila);
    const { patron } = c.prenda.malla;
    const cortos = c.lados.filter((l) => l.ta && l.tb && l.tb[0] > 0.05 && l.ta[0] < l.tb[0]);
    expect(cortos.length).toBeGreaterThan(0);
    for (const l of cortos) {
      const vecino = l.vecinosB?.antes;
      expect(vecino).toBeDefined();
      // el vecino es el vértice de la tira que sigue: de la misma pieza y a menos de una arista y media del primero de adentro
      const r = c.prenda.piezas.find((p) => l.b[0] >= p.v0 && l.b[0] < p.v0 + p.nv)!;
      expect(vecino!.v).toBeGreaterThanOrEqual(r.v0);
      expect(vecino!.v).toBeLessThan(r.v0 + r.nv);
      expect(Math.hypot(patron[2 * vecino!.v] - patron[2 * l.b[0]], patron[2 * vecino!.v + 1] - patron[2 * l.b[0] + 1])).toBeLessThan(0.03);
      const punta = c.costuras.puntos.find((p) => p.a === l.a[0] && p.b1 === l.b[0]);
      expect(punta).toMatchObject({ b0: vecino!.v });
      expect(punta!.s).toBeGreaterThan(0);
      expect(punta!.s).toBeLessThan(1);
    }
  }, 120_000);

  it('dos importaciones del DXF dan las mismas piezas y las mismas costuras, en el mismo sentido', () => {
    // autoSew orienta algunas costuras según los ids de las piezas: con ids al azar, el banco no se repetía
    const forma = () => {
      const piezas = piezasDeMaria(DXF);
      const costuras = costurasDeMaria(piezas).map((s) => `${s.pieceA.pieceId}:${s.pieceA.edgeName}-${s.pieceB.pieceId}:${s.pieceB.edgeName}`);
      return { ids: piezas.map((p) => p.id), costuras };
    };
    expect(forma()).toEqual(forma());
  }, 120_000);

  it('cada pieza toma la urdimbre de su línea de grano', () => {
    for (const p of piezasDeMaria(DXF)) {
      const h = hiloDe(p);
      expect(h).toBeDefined();
      // en el DXF de María todas las líneas de grano van verticales
      expect(Math.abs(h![0]) / Math.hypot(h![0], h![1])).toBeLessThan(1e-3);
    }
  });
});
