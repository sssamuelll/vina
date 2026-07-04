/**
 * collarSplit — sonda del escote cosido de verdad (cosido de mundo real,
 * 2026-07-04; espejo de sisaSplit.maria.test.ts).
 *
 * El DXF de María trae el neck edge del collar partido en DOS mitades de
 * 228mm (junction en centro-front del tubo, extremos libres en centro-back).
 * El pipeline cosía cada mitad ENTERA a un neckline entero — pero el
 * neckline delantero mide 299.7mm (déficit 24% imposible de cerrar) y nada
 * anclaba la banda (los collarEnds no se cosían) → el escote quedaba medio
 * abierto (max 13.3cm de piel medido @10s).
 *
 * Fix: split por arc-length con cortes en los HOMBROS (f = FN/(FN+BN) ≈
 * 0.578 en María) → 4 medias costuras cubriendo AMBOS necklines completos,
 * + self-close de collarEnds (ancla la banda — el residual nombrado
 * "collar short-end closure").
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
import type { BodyMeasurements, PatternPiece, Seam } from '../../../types/types';

const FIXTURE = resolve(__dirname, '../../../../tests/fixtures/garments/maria_patrones_samuel_2M.dxf');
const MEAS = { height: 180, chest: 96, waist: 82, hips: 96, shoulder: 44, armLength: 64, inseam: 82 } as BodyMeasurements;

const root = (n: string) => n.toLowerCase().replace(/-\d+$/, '');

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

const isCollarSeam = (s: Seam) =>
  [s.pieceA.edgeName, s.pieceB.edgeName].some(n => root(n) === 'collarneckedge')
  && [s.pieceA.edgeName, s.pieceB.edgeName].some(n => root(n) === 'neckline');

function neckHalf(s: Seam): Seam['pieceA'] {
  return root(s.pieceA.edgeName) === 'neckline' ? s.pieceA : s.pieceB;
}
function collarHalfOf(s: Seam): Seam['pieceA'] {
  return root(s.pieceA.edgeName) === 'collarneckedge' ? s.pieceA : s.pieceB;
}

/** Rango físico (dirección outline) de un half — des-espeja si es un pieceB reversed. */
function physRange(s: Seam, h: Seam['pieceA']): [number, number] {
  const stored: [number, number] = [h.tStart ?? 0, h.tEnd ?? 1];
  const rev = h === s.pieceB && s.pieceB.reversed === true;
  return rev ? [1 - stored[1], 1 - stored[0]] : stored;
}

describe('collarSplit — el collar reparte su arco entre AMBOS necklines con cortes en los hombros', () => {
  it('María: 4 medias costuras collar↔neckline cubriendo ambos escotes completos', () => {
    const pieces = importMariaClassified();
    const refined = refineSeamsInWorld(
      autoSew(pieces, { minConfidence: 0.3 }).seams.map(s => s.seam),
      pieces,
      resolveArrangementWithFrames(pieces, MEAS, undefined),
    );

    const collarSeams = refined.filter(isCollarSeam);
    expect(
      collarSeams.length,
      `costuras de collar: ${collarSeams.map(s => `${s.pieceA.edgeName}[${s.pieceA.tStart}-${s.pieceA.tEnd}]↔${s.pieceB.edgeName}`).join(', ')}`,
    ).toBe(4);

    // Cada NECKLINE (delantero y trasero) queda cubierto completo: sus dos
    // medias [0,0.5]+[0.5,1] en rango físico.
    const byNeckPiece = new Map<string, Array<[number, number]>>();
    for (const s of collarSeams) {
      const n = neckHalf(s);
      const list = byNeckPiece.get(n.pieceId) ?? [];
      list.push(physRange(s, n));
      byNeckPiece.set(n.pieceId, list);
    }
    expect(byNeckPiece.size, 'dos piezas de torso cosidas al collar').toBe(2);
    for (const [pieceId, ranges] of byNeckPiece) {
      expect(ranges.length, `${pieceId}: dos medias de neckline`).toBe(2);
      const sorted = ranges.sort((a, b) => a[0] - b[0]);
      expect(sorted[0][0], `${pieceId} cubre desde 0`).toBeCloseTo(0, 5);
      expect(sorted[0][1]).toBeCloseTo(0.5, 5);
      expect(sorted[1][0]).toBeCloseTo(0.5, 5);
      expect(sorted[1][1], `${pieceId} cubre hasta 1`).toBeCloseTo(1, 5);
    }

    // Cada MITAD del collar reparte su arco completo entre los dos escotes:
    // porciones complementarias que unen [0,1], con el corte en f∈(0.5, 0.7)
    // (María: FN/(FN+BN) = 299.7/518.2 ≈ 0.578 medido del DXF).
    const byCollarEdge = new Map<string, Array<[number, number]>>();
    for (const s of collarSeams) {
      const c = collarHalfOf(s);
      const list = byCollarEdge.get(c.edgeName) ?? [];
      list.push(physRange(s, c));
      byCollarEdge.set(c.edgeName, list);
    }
    expect(byCollarEdge.size, 'dos mitades de collar').toBe(2);
    for (const [edgeName, ranges] of byCollarEdge) {
      expect(ranges.length, `${edgeName}: dos porciones`).toBe(2);
      const sorted = ranges.sort((a, b) => a[0] - b[0]);
      expect(sorted[0][0], `${edgeName} arranca en 0`).toBeCloseTo(0, 5);
      expect(sorted[1][1], `${edgeName} termina en 1`).toBeCloseTo(1, 5);
      expect(sorted[0][1], `${edgeName} porciones contiguas`).toBeCloseTo(sorted[1][0], 5);
      const cut = sorted[0][1];
      const frac = Math.max(cut, 1 - cut); // f puede caer en cualquiera de las dos puntas
      expect(frac).toBeGreaterThan(0.5);
      expect(frac).toBeLessThan(0.7);
    }
  });

  it('los collarEnds se cierran entre sí (self-close — ancla la banda)', () => {
    const pieces = importMariaClassified();
    const seams = autoSew(pieces, { minConfidence: 0.3 }).seams.map(s => s.seam);
    const selfClose = seams.filter(s =>
      s.pieceA.pieceId === s.pieceB.pieceId
      && root(s.pieceA.edgeName) === 'collarend'
      && root(s.pieceB.edgeName) === 'collarend');
    expect(selfClose.length, 'un cierre de extremos de collar').toBe(1);
  });
});
