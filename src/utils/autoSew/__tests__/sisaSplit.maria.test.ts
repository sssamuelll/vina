/**
 * sisaSplit — sonda del cosido real de la sisa (proceso María-style, 2026-07-04).
 *
 * Una camisa real cose el CAP de la manga a AMBOS armholes (delantero Y
 * espalda) — la sisa es una curva continua una vez cerrados hombros y
 * costados. El dedup greedy de autoSew era 1:1 (cada edge una sola costura),
 * así que cada cap reclamaba UN armhole y los de la otra pieza del torso
 * quedaban huérfanos. La sonda seam-gap lo midió en vivo: el centro del cap
 * cerraba a 1.3cm y los extremos quedaban clavados a 12-16cm — media manga
 * sin quién la sostuviera ("chaleco + brazaletes").
 *
 * El fix: pase de SPLIT — cada costura cap↔armhole se parte en DOS medias
 * costuras con rango parcial en el lado del cap (la maquinaria de rangos +
 * renormalizeFilteredT es de Fase 5), apuntando a los armholes de las DOS
 * piezas del torso. worldRefine decide en pose MUNDO qué mitad va a cuál
 * armhole (permutación de grupo) y la dirección.
 *
 * Dónde se corta la copa (2026-10-06): donde cada mitad mide, en proporción,
 * lo que su sisa (`repartirCopas`). Partida en t = 0,5, las sisas de María
 * (230,6 y 219,9 mm) dejaban sus cuatro medias costuras a 5,2 y 5,5 mm, y el
 * lienzo las marcaba con «⚠» sobre un patrón con 0,4 mm de embebido.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { importDXFContent } from '../../dxf';
import { classifyPiecesGeometric } from '../../geometricClassifier';
import { detectSemanticEdges } from '../../semanticEdges';
import { autoSew } from '../index';
import { refineSeamsInWorld } from '../worldRefine';
import { resolveArrangementWithFrames } from '../../cloth/arrangement/arrangementBinding';
import { largosDeCostura } from '../../seam/largoCosido';
import { SEAM_MISMATCH_THRESHOLD_MM } from '../../../components/PatternEditor/renderers/seamVisuals';
import { auditNotches } from '../../../copilot/reasoning/proactiveAnalysis';
import type { BodyMeasurements, PatternPiece, Seam } from '../../../types/types';

const FIXTURE = resolve(__dirname, '../../../../tests/fixtures/garments/maria_patrones_samuel_2M.dxf');
const MEAS = { height: 180, chest: 96, waist: 82, hips: 96, shoulder: 44, armLength: 64, inseam: 82 } as BodyMeasurements;

function importMariaClassified(): PatternPiece[] {
  const pieces = importDXFContent(readFileSync(FIXTURE, 'utf-8'), { unit: 'auto', autoDetect: true }).pieces;
  const map = classifyPiecesGeometric(pieces);
  for (const p of pieces) {
    const c = map.get(p.id)!;
    if (c.category !== 'other') { p.category = c.category; if (c.side) p.side = c.side; }
    p.edges = detectSemanticEdges(p);
  }
  return pieces;
}

const isSisa = (s: Seam) =>
  /^sleevecap/i.test(s.pieceA.edgeName.replace(/-\d+$/, '')) !== /^sleevecap/i.test(s.pieceB.edgeName.replace(/-\d+$/, ''))
  && [s.pieceA.edgeName, s.pieceB.edgeName].some(n => /^armhole/i.test(n.replace(/-\d+$/, '')));

/** La mitad del seam que es el CAP (por nombre de edge). */
function capHalf(s: Seam): Seam['pieceA'] {
  return /^sleevecap/i.test(s.pieceA.edgeName.replace(/-\d+$/, '')) ? s.pieceA : s.pieceB;
}
function armholeHalf(s: Seam): Seam['pieceA'] {
  return /^armhole/i.test(s.pieceA.edgeName.replace(/-\d+$/, '')) ? s.pieceA : s.pieceB;
}

/**
 * Rango FÍSICO (dirección del outline) del lado cap: el almacenado del half B
 * va en dirección de COSIDO (seamRange header) — si el cap quedó como pieceB
 * con reversed=true, hay que des-espejarlo. La versión anterior de este test
 * asertaba lo ALMACENADO y era ciega al bug reversed×rango (las dos medias
 * cosían la misma mitad física del cap).
 */
function capPhysicalRange(s: Seam): [number, number] {
  const cap = capHalf(s);
  const stored: [number, number] = [cap.tStart ?? 0, cap.tEnd ?? 1];
  const rev = cap === s.pieceB && s.pieceB.reversed === true;
  return rev ? [1 - stored[1], 1 - stored[0]] : stored;
}

describe('sisaSplit — el cap de cada manga se cose a los DOS armholes (delantero + espalda)', () => {
  it('María: 4 medias costuras de sisa (2 por manga), con rangos complementarios y armholes en piezas distintas', () => {
    const pieces = importMariaClassified();
    const result = autoSew(pieces, { minConfidence: 0.3 });
    const refined = refineSeamsInWorld(
      result.seams.map(s => s.seam),
      pieces,
      resolveArrangementWithFrames(pieces, MEAS, undefined),
    );

    const sisas = refined.filter(isSisa);
    expect(sisas.length, `costuras de sisa: ${sisas.map(s => `${s.pieceA.edgeName}↔${s.pieceB.edgeName}`).join(', ')}`).toBe(4);

    // Agrupar por manga (pieceId del lado cap)
    const bySleeve = new Map<string, Seam[]>();
    for (const s of sisas) {
      const cap = capHalf(s);
      const list = bySleeve.get(cap.pieceId) ?? [];
      list.push(s);
      bySleeve.set(cap.pieceId, list);
    }
    expect(bySleeve.size, 'dos mangas').toBe(2);

    for (const [sleeveId, seams] of bySleeve) {
      expect(seams.length, `manga ${sleeveId}: dos medias costuras`).toBe(2);

      // Rangos FÍSICOS complementarios en el lado del cap: [0, corte] +
      // [corte, 1] (la unión debe ser el anillo COMPLETO — con el bug
      // reversed×rango ambas medias daban la misma mitad física y esto fallaba).
      const ranges = seams
        .map(capPhysicalRange)
        .sort((a, b) => a[0] - b[0]);
      expect(ranges[0][0]).toBeCloseTo(0, 5);
      expect(ranges[0][1]).toBeCloseTo(ranges[1][0], 9);
      expect(ranges[1][1]).toBeCloseTo(1, 5);

      // Los dos armholes viven en piezas DISTINTAS del torso (delantero + espalda)
      const armPieces = new Set(seams.map(s => armholeHalf(s).pieceId));
      expect(armPieces.size, `manga ${sleeveId}: armholes en dos piezas del torso`).toBe(2);
      expect(armPieces.has(sleeveId)).toBe(false);

      // Cada mitad de la copa mide lo que su sisa, con la medida del lienzo:
      // ninguna media costura llega a su aviso «⚠ N mm de diferencia».
      for (const s of seams) {
        const { a, b } = largosDeCostura(s, pieces);
        expect(Math.abs(a! - b!), `${s.pieceA.edgeName} ↔ ${s.pieceB.edgeName}: ${a} contra ${b} mm`)
          .toBeLessThan(SEAM_MISMATCH_THRESHOLD_MM);
      }
    }

    // Y los dos piquetes de la copa caen sobre los de la sisa delantera: la
    // mitad que los lleva va a la sisa que también los lleva.
    expect(auditNotches(pieces, sisas).filter(w => /line up/i.test(w.message))).toEqual([]);
  });

  it('sin pose mundo (carga generativa, motor paramétrico), cada mitad de la copa mide lo que la sisa que eligió autoSew', () => {
    const pieces = importMariaClassified();
    const sisas = autoSew(pieces, { minConfidence: 0.3 }).seams.map(s => s.seam).filter(isSisa);
    expect(sisas).toHaveLength(4);
    for (const s of sisas) {
      const { a, b } = largosDeCostura(s, pieces);
      expect(Math.abs(a! - b!), `${s.pieceA.edgeName} ↔ ${s.pieceB.edgeName}: ${a} contra ${b} mm`)
        .toBeLessThan(SEAM_MISMATCH_THRESHOLD_MM);
    }
  });

  it('los armholes de AMBAS piezas del torso quedan cosidos (ninguno huérfano)', () => {
    const pieces = importMariaClassified();
    const result = autoSew(pieces, { minConfidence: 0.3 });
    const seams = result.seams.map(s => s.seam);

    // Piezas bodice con edges armhole detectados
    const bodices = pieces.filter(p => p.category === 'bodice');
    expect(bodices.length).toBe(2);
    for (const b of bodices) {
      const armEdges = (b.edges ?? []).filter(e => /^armhole/i.test(e.name.replace(/-\d+$/, '')));
      expect(armEdges.length, `${b.name} tiene 2 armholes detectados`).toBe(2);
      for (const e of armEdges) {
        const sewn = seams.some(s =>
          (s.pieceA.pieceId === b.id && s.pieceA.edgeName === e.name)
          || (s.pieceB.pieceId === b.id && s.pieceB.edgeName === e.name));
        expect(sewn, `${b.name}.${e.name} cosido`).toBe(true);
      }
    }
  });
});
