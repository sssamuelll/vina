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
});
