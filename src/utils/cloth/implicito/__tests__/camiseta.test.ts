import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { camisetaDeMaria, hiloDe, piezasDeMaria, type Colocacion } from '../banco/camiseta';
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
    // la tira y las dos mangas traían vértices sueltos (Tarea 1 del plan de la parte 2)
    expect(c.prenda.piezas.filter((p) => p.local.some((j) => j < 0)).length).toBeGreaterThanOrEqual(1);
    expect(c.lados.length).toBeGreaterThanOrEqual(15);
    expect(c.costuras.puntos.length).toBeGreaterThan(400);
    expect(c.costuras.bisagras.length).toBeGreaterThan(100);
    expect(c.franja.some((f) => f === 1)).toBe(true);
    const s = new SistemaTela(c.prenda.malla, TELA_DE_LABORATORIO, { costuras: c.costuras, franja: c.franja, ajustes: { gravedad: 0 } });
    const info = pasoImplicito(s);
    expect(info.G1).toBeLessThanOrEqual(info.G0);
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
