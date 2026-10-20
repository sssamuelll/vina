/**
 * Física exacta (spec 2026-10-13 §4.4.1): la tira en voladizo empotrada converge a la elástica exacta al
 * afinar la malla. Es la prueba más lenta del motor: unos segundos por malla.
 */
import { describe, expect, it } from 'vitest';
import { SistemaTela } from '../sistema';
import { pasoImplicito } from '../paso';
import { escenaVoladizo } from '../banco/escenas';
import { puntaDelVoladizo } from '../banco/medidas';
import { elasticaExacta } from '../banco/elastica';
import type { TelaFisica } from '../tela';

// la misma flexión en las tres direcciones: la tira es una viga y la elástica es exacta
const TELA: TelaFisica = { gramaje: 200, grosor: 0.5, kTrama: 600, kUrdimbre: 600, kCizalla: 50, pandeo: Infinity, bTrama: 5, bUrdimbre: 5, bBies: 5, friccionCuerpo: 0, friccionTela: 0 };

function yDeLaPunta(aristaMm: number): number {
  const e = escenaVoladizo(15, 'urdimbre', aristaMm);
  const s = new SistemaTela(e.malla, TELA, { hilo: e.hilo, ajustes: { aire: 2, maxCG: 200, tolCG: 1e-5 } });
  for (let k = 0; k < 120; k++) pasoImplicito(s);
  return puntaDelVoladizo(s.x, e.malla, 0.015).y;
}

describe('la tira en voladizo', () => {
  it('converge a la elástica exacta: de 2,5 a 1,25 mm el error queda en 0,6 o menos', () => {
    const exacta = elasticaExacta(5e-6, 0.2 * 9.81, 0.015).y;
    const e25 = Math.abs(yDeLaPunta(2.5) - exacta), e125 = Math.abs(yDeLaPunta(1.25) - exacta);
    console.log(`voladizo: exacta ${(exacta * 1000).toFixed(2)} mm · error con 2,5 mm ${(e25 * 1000).toFixed(2)} mm · con 1,25 mm ${(e125 * 1000).toFixed(2)} mm`);
    expect(e125).toBeLessThanOrEqual(0.6 * e25);
  }, 180_000);
});
