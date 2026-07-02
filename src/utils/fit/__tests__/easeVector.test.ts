/**
 * ease-vector v0 (consejo drape profesional 2026-07-02) — TDD:
 * (a) synthetic arithmetic exactness, (b) the REAL number against María's
 * shirt DXF, (c) guard: no bodices → [].
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { importDXFContent } from '../../dxf';
import { classifyPiecesGeometric } from '../../geometricClassifier';
import { detectSemanticEdges } from '../../semanticEdges';
import { computeEaseVector } from '../easeVector';
import type { PatternPiece, PathCommand } from '../../../types/types';

const FIXTURE = resolve(
  __dirname,
  '../../../../tests/fixtures/garments/maria_patrones_samuel_2M.dxf',
);

const MEASUREMENTS = {
  height: 180, chest: 96, waist: 82, hips: 96, shoulder: 44, armLength: 64, inseam: 82,
};

function rect(widthMm: number, heightMm: number): PathCommand[] {
  return [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [widthMm, 0] },
    { type: 'L', values: [widthMm, heightMm] },
    { type: 'L', values: [0, heightMm] },
    { type: 'Z', values: [] },
  ];
}

function bodice(id: string, outline: PathCommand[]): PatternPiece {
  return {
    id,
    name: id,
    outline,
    internals: [],
    position: { x: 0, y: 0 },
    rotation: 0,
    mirrored: false,
    seamAllowance: 0,
    category: 'bodice',
    active: true,
    createdAt: 0,
    updatedAt: 0,
  };
}

describe('computeEaseVector', () => {
  it('(a) synthetic: two 50cm rectangular bodices + chest 96 → ease exactly 4', () => {
    const pieces = [bodice('front', rect(500, 700)), bodice('back', rect(500, 700))];
    const vector = computeEaseVector(pieces, MEASUREMENTS);

    expect(vector.map(e => e.section)).toEqual(['chest', 'waist', 'hips']);
    const chest = vector.find(e => e.section === 'chest')!;
    expect(chest.garmentCm).toBeCloseTo(100, 5); // 2 × 500mm = 100cm
    expect(chest.bodyCm).toBe(96);
    expect(chest.easeCm).toBeCloseTo(4, 5);
    // Rectangles carry no armhole edges → chest height is the 25% guess.
    expect(chest.confidence).toBe('estimated');

    // Rectangle width is constant, so every section reads the same garmentCm.
    const waist = vector.find(e => e.section === 'waist')!;
    expect(waist.garmentCm).toBeCloseTo(100, 5);
    expect(waist.easeCm).toBeCloseTo(100 - 82, 5);
    const hips = vector.find(e => e.section === 'hips')!;
    expect(hips.easeCm).toBeCloseTo(100 - 96, 5);
  });

  it('(a2) seam allowance known to the domain is subtracted (2×SA per piece)', () => {
    const pieces = [bodice('front', rect(500, 700)), bodice('back', rect(500, 700))];
    for (const p of pieces) p.seamAllowance = 10; // mm
    const chest = computeEaseVector(pieces, MEASUREMENTS).find(e => e.section === 'chest')!;
    // 2 × (500 − 2×10) mm = 96cm → ease 0
    expect(chest.garmentCm).toBeCloseTo(96, 5);
    expect(chest.easeCm).toBeCloseTo(0, 5);
  });

  it("(b) REAL: María's shirt DXF → chest ease lands in the honest band [2, 14] cm", { timeout: 120_000 }, () => {
    // Same import+classification path as production / the M4 probe.
    const pieces = importDXFContent(readFileSync(FIXTURE, 'utf-8'), {
      unit: 'auto', autoDetect: true,
    }).pieces;
    const map = classifyPiecesGeometric(pieces);
    for (const p of pieces) {
      const c = map.get(p.id)!;
      if (c.category !== 'other') {
        p.category = c.category;
        if (c.side) p.side = c.side;
      }
      p.edges = detectSemanticEdges(p);
    }

    const vector = computeEaseVector(pieces, MEASUREMENTS);
    for (const e of vector) {
      console.log(
        `[ease] section=${e.section} garment=${e.garmentCm}cm body=${e.bodyCm}cm ` +
        `ease=${e.easeCm}cm confidence=${e.confidence}`,
      );
    }

    const chest = vector.find(e => e.section === 'chest');
    expect(chest).toBeDefined();
    // Probe 2026-07-02: ~104cm garment vs 96cm chest → +6-8cm with raw bbox.
    // Slice-at-underarm may differ some; the band is deliberately generous.
    expect(chest!.easeCm).toBeGreaterThanOrEqual(2);
    expect(chest!.easeCm).toBeLessThanOrEqual(14);
    // María's shirt has exactly front+back bodices with detected armholes.
    expect(chest!.confidence).toBe('measured');

    // The other sections exist and read something sane for a shirt.
    expect(vector.map(e => e.section)).toEqual(['chest', 'waist', 'hips']);
  });

  it('(c) guards: no bodices / unclassified pieces → []', () => {
    expect(computeEaseVector([], MEASUREMENTS)).toEqual([]);
    const sleeve = bodice('sleeve', rect(300, 600));
    sleeve.category = 'sleeve';
    const unclassified = bodice('mystery', rect(300, 600));
    unclassified.category = undefined;
    expect(computeEaseVector([sleeve, unclassified], MEASUREMENTS)).toEqual([]);
  });
});
