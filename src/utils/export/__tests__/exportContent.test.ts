/**
 * Content-level acceptance proof for the three flat-pattern exports.
 * The DXF round-trip is the spine: we own both the AAMA exporter and the
 * importer, so we export and re-import and assert the pattern survives usable.
 */
import { describe, it, expect } from 'vitest';
import { generateDXFAAMA } from '../../dxf/exportAAMA';
import { parseDXF, dxfToPatternPieces } from '../../dxf';
import { generateBOM } from '../bomExport';
import { generatePDF } from '../../exportPDF';
import type { PatternPiece } from '../../../types/types';

function makePiece(overrides?: Partial<PatternPiece>): PatternPiece {
  return {
    id: 'p1',
    name: 'Front',
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 150] },
      { type: 'L', values: [0, 150] },
      { type: 'Z', values: [] },
    ],
    position: { x: 0, y: 0 },
    rotation: 0,
    mirrored: false,
    seamAllowance: 10,
    internals: [],
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  } as PatternPiece;
}

function bboxOf(pieces: { outline: PatternPiece['outline'] }[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pieces) {
    for (const cmd of p.outline) {
      for (let i = 0; i < cmd.values.length; i += 2) {
        const x = cmd.values[i], y = cmd.values[i + 1];
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  return { w: maxX - minX, h: maxY - minY };
}

describe('DXF export round-trips through the importer (the spine)', () => {
  it('preserves piece count and overall geometry within tolerance', () => {
    const pieces = [
      makePiece({ id: 'p1', name: 'Front' }),
      makePiece({
        id: 'p2', name: 'Back',
        outline: [
          { type: 'M', values: [0, 0] },
          { type: 'L', values: [120, 0] },
          { type: 'L', values: [120, 160] },
          { type: 'L', values: [0, 160] },
          { type: 'Z', values: [] },
        ],
      }),
    ];

    const dxf = generateDXFAAMA(pieces);
    const doc = parseDXF(dxf);
    const reimported = dxfToPatternPieces(doc);

    expect(reimported.length).toBe(pieces.length);
    for (const p of reimported) {
      expect(p.outline.length).toBeGreaterThan(0);
    }
    // AAMA export may re-segment; assert overall geometry survives, not bytes.
    const before = bboxOf(pieces);
    const after = bboxOf(reimported);
    expect(Math.abs(after.w - before.w)).toBeLessThan(1); // mm
    expect(Math.abs(after.h - before.h)).toBeLessThan(1);
    // AAMA CUT layer present (layer "1").
    expect(dxf).toContain('8\n1\n');
  });
});

describe('BOM export content', () => {
  it('has a header, one row per piece, and a TOTAL summary', () => {
    const csv = generateBOM([makePiece({ id: 'p1' }), makePiece({ id: 'p2' })], [], []);
    const lines = csv.trim().split('\n');
    expect(lines.length).toBe(4);               // header + 2 pieces + TOTAL
    expect(lines[0]).toContain(',');            // header row
    expect(lines[lines.length - 1].startsWith('TOTAL')).toBe(true);
  });
});

describe('PDF export content', () => {
  it('produces non-empty raw PDF bytes (1:1 physical scale verified manually)', () => {
    const pdf = generatePDF([makePiece()]);
    expect(pdf.startsWith('%PDF')).toBe(true);
    expect(pdf.length).toBeGreaterThan(500);
  });
});
