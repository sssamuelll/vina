/**
 * DXF-AAMA import integration test.
 * Uses real industrial pattern file (model 5000) to verify full pipeline.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parseDXF } from '../parser';
import { dxfToPatternPieces } from '../converter';

const DXF_PATH = join(process.env.HOME ?? '', 'Downloads/CAD/DXF AAMA/5000.dxf');
const hasTestFile = existsSync(DXF_PATH);

describe.skipIf(!hasTestFile)('DXF-AAMA Import (model 5000)', () => {
  const dxf = hasTestFile ? readFileSync(DXF_PATH, 'utf-8') : '';
  const doc = hasTestFile ? parseDXF(dxf) : null;
  const pieces = doc ? dxfToPatternPieces(doc) : [];

  it('parses 4 blocks from DXF', () => {
    expect(doc!.blocks.size).toBe(4);
  });

  it('extracts 4 pattern pieces', () => {
    expect(pieces.length).toBe(4);
  });

  it('extracts correct piece names from AAMA "Piece Name:" text', () => {
    const names = pieces.map(p => p.name).sort();
    expect(names).toEqual(['Back', 'Front', 'Neck binding', 'Sleeve']);
  });

  it('each piece has a closed outline', () => {
    for (const p of pieces) {
      expect(p.outline.length).toBeGreaterThan(2);
      const hasMove = p.outline.some(c => c.type === 'M');
      const hasClose = p.outline.some(c => c.type === 'Z');
      expect(hasMove).toBe(true);
      expect(hasClose).toBe(true);
    }
  });

  it('extracts grainlines (layer 7)', () => {
    for (const p of pieces) {
      const grainlines = p.internals.filter(i => i.type === 'grainline');
      expect(grainlines.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('extracts notches from layer 4', () => {
    const front = pieces.find(p => p.name === 'Front')!;
    const notches = front.internals.filter(i => i.type === 'notch');
    expect(notches.length).toBeGreaterThan(0);
  });

  it('Front piece has draw/internal lines (layer 8)', () => {
    const front = pieces.find(p => p.name === 'Front')!;
    const darts = front.internals.filter(i => i.type === 'dart');
    expect(darts.length).toBeGreaterThan(0);
  });

  it('outline coordinates are reasonable (not all zeros)', () => {
    for (const p of pieces) {
      const allValues = p.outline.flatMap(c => c.values);
      const nonZero = allValues.filter(v => Math.abs(v) > 1);
      expect(nonZero.length).toBeGreaterThan(10);
    }
  });
});
