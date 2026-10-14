/**
 * La dirección de las medias costuras de cuello (#1250 C2). Medidas por largo de arco, como mide el solver,
 * las cuatro salen con margen (spec de #1250: 305 contra 351 mm las delanteras, sin invertir; 307 contra 264
 * las traseras, invertidas). Por índice de punto, en back.neckline[0,5; 1] ~ collarNeckEdge[0,578; 1] las dos
 * puntas de la tira caían en el mismo punto (recto 226 = cruzado 226 mm) y quedaba sin invertir.
 */
import { describe, expect, it } from 'vitest';
import { edgeWorld } from '../worldRefine';
import { esMediaDeCollar, esMitadDeCopa } from '../repartoDeCopa';
import { isStaleAiSeam, SEAM_ENGINE_VERSION } from '../index';
import { resolveArrangementWithFrames } from '../../cloth/arrangement/arrangementBinding';
import { mirrorPctRange } from '../../seam/seamRange';
import { costurasDeMaria, importarMariaClasificada, MEDIDAS_DE_MARIA } from '../../cloth/__tests__/camisaDeMaria';
import type { Seam } from '../../../types/types';

type V3 = [number, number, number];
const dist = (p: V3, q: V3) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);

describe('la dirección de las medias costuras de cuello (#1250 C2)', () => {
  it('María: las cuatro medias de la tira se invierten según su geometría, con margen', { timeout: 60_000 }, () => {
    const piezas = importarMariaClasificada();
    const pwf = resolveArrangementWithFrames(piezas, MEDIDAS_DE_MARIA, undefined);
    const medias = costurasDeMaria(piezas).filter(esMediaDeCollar);
    expect(medias.length).toBe(4);
    for (const s of medias) {
      const ia = piezas.findIndex((p) => p.id === s.pieceA.pieceId), ib = piezas.findIndex((p) => p.id === s.pieceB.pieceId);
      // rangos FÍSICOS: el de B se guarda en dirección de cosido y se des-espeja si va al revés
      const rA: [number, number] = [s.pieceA.tStart ?? 0, s.pieceA.tEnd ?? 1];
      const rB0: [number, number] = [s.pieceB.tStart ?? 0, s.pieceB.tEnd ?? 1];
      const rB = s.pieceB.reversed === true ? mirrorPctRange(rB0) : rB0;
      const a = edgeWorld(piezas[ia], pwf[ia], s.pieceA.edgeName, rA)!;
      const b = edgeWorld(piezas[ib], pwf[ib], s.pieceB.edgeName, rB)!;
      const recto = dist(a.first, b.first) + dist(a.last, b.last);
      const cruzado = dist(a.first, b.last) + dist(a.last, b.first);
      expect(s.pieceB.reversed === true, `${s.pieceA.edgeName}↔${s.pieceB.edgeName}`).toBe(cruzado < recto);
      expect(Math.abs(recto - cruzado), `${s.pieceA.edgeName}↔${s.pieceB.edgeName}: margen`).toBeGreaterThan(0.03);
    }
  });

  it('isStaleAiSeam: el motor 2 dejó viejas las medias de cuello, no las de copa', () => {
    expect(SEAM_ENGINE_VERSION).toBe(3);
    const media = (a: string, b: string, motor: number): Seam => ({
      id: 'auto-seam-x', type: 'standard', sewEngine: motor,
      pieceA: { pieceId: 'p', edgeName: a, tStart: 0.578, tEnd: 1 },
      pieceB: { pieceId: 'q', edgeName: b },
    } as unknown as Seam);
    const cuello = media('collarNeckEdge', 'neckline', 2), copa = media('sleeveCap', 'armhole', 2);
    expect(esMediaDeCollar(cuello)).toBe(true);
    expect(esMitadDeCopa(copa)).toBe(true);
    expect(isStaleAiSeam(cuello)).toBe(true);
    expect(isStaleAiSeam(copa)).toBe(false);
    expect(isStaleAiSeam(media('collarNeckEdge', 'neckline', 3))).toBe(false);
  });
});
