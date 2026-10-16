/** Los lados de cada costura, en orden de cosido: los que cose el motor implícito (implicito/costuras.ts). */
import { describe, expect, it } from 'vitest';
import { seamInitDataToPairs } from '../seamPairs';
import { aInitData, costurasDeMaria, importarMariaClasificada, mallarParaCoser } from './camisaDeMaria';

describe('los lados de una costura', () => {
  it('María: cada par trae sus dos lados, con los mismos vértices que sus pares y seguidos por el borde', { timeout: 120_000 }, () => {
    const piezas = importarMariaClasificada();
    const malladas = mallarParaCoser(piezas, 10);
    const pares = seamInitDataToPairs(aInitData(costurasDeMaria(piezas)), malladas);
    expect(pares.length).toBeGreaterThan(10);
    for (const par of pares) {
      expect(par.lados).toBeDefined();
      const { a, b } = par.lados!;
      expect(new Set(a)).toEqual(new Set(par.vertexPairs.map((p) => p[0])));
      expect(new Set(b)).toEqual(new Set(par.vertexPairs.map((p) => p[1])));
      // dos vértices seguidos de un lado son vecinos en el borde: a menos de una arista y media (uvs en mm/100)
      for (const [lado, pieza] of [[a, par.pieceAId], [b, par.pieceBId]] as const) {
        const uv = malladas.find((m) => m.pieceId === pieza)!.uvs!;
        for (let k = 1; k < lado.length; k++) {
          const p = lado[k - 1], q = lado[k];
          expect(Math.hypot(uv[2 * q] - uv[2 * p], uv[2 * q + 1] - uv[2 * p + 1]) * 100).toBeLessThan(15);
        }
      }
    }
  });

  it('María a 20 mm: cada lado trae el t de sus vértices en el tramo del patrón, y en el cuello no llegan a las puntas', { timeout: 120_000 }, () => {
    const piezas = importarMariaClasificada();
    const pares = seamInitDataToPairs(aInitData(costurasDeMaria(piezas)), mallarParaCoser(piezas, 20));
    let sinPunta = 0;
    for (const par of pares) {
      const { a, b, ta, tb } = par.lados!;
      expect(ta).toHaveLength(a.length);
      expect(tb).toHaveLength(b.length);
      for (const t of [ta!, tb!]) {
        for (let k = 0; k < t.length; k++) {
          expect(t[k]).toBeGreaterThanOrEqual(-1e-9);
          expect(t[k]).toBeLessThanOrEqual(1 + 1e-9);
          if (k > 0) expect(t[k]).toBeGreaterThanOrEqual(t[k - 1]);
        }
      }
      if (tb![0] > 0.05 || tb![tb!.length - 1] < 0.95) sinPunta++;
    }
    // las costuras parciales del cuello: el filtro del tramo deja vértices lejos de las puntas, y el t lo dice
    expect(sinPunta).toBeGreaterThan(0);
  });
});
