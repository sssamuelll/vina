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
    // soldadas (E17): unos 3,3 m de costura, un punto cada 20 mm o menos y ninguno de vuelta
    expect(c.costuras.puntos.length).toBeGreaterThan(150);
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

  it.each([10, 20])('a %i mm, las costuras se sueldan (E17): cada punto cae en un vértice del otro lado y ninguno vuelve', (mm) => {
    const c = camisetaDeMaria(DXF, mm, TELA_DE_LABORATORIO, enFila);
    expect(c.lados.length).toBeGreaterThanOrEqual(15);
    expect(c.costuras.puntos.every((p) => p.b0 === p.b1 && p.s === 0 && !p.inversa)).toBe(true);
    // los dos lados de cada costura con los mismos vértices, y a menos de una arista y media (patrón en m)
    const { patron } = c.prenda.malla;
    for (const l of c.lados) {
      expect(l.b).toHaveLength(l.a.length);
      for (const lado of [l.a, l.b]) {
        for (let k = 1; k < lado.length; k++) {
          const p = lado[k - 1], q = lado[k];
          expect(Math.hypot(patron[2 * q] - patron[2 * p], patron[2 * q + 1] - patron[2 * p + 1])).toBeLessThan(0.0015 * mm);
        }
      }
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
