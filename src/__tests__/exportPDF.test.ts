import { describe, it, expect } from 'vitest';
import { generatePDF } from '../utils/exportPDF';
import { PatternPiece } from '../types/types';

function makePiece(overrides: Partial<PatternPiece> = {}): PatternPiece {
  return {
    id: 'test-piece',
    name: 'Test',
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [200, 0] },
      { type: 'L', values: [200, 300] },
      { type: 'L', values: [0, 300] },
      { type: 'Z', values: [] },
    ],
    internals: [],
    position: { x: 0, y: 0 },
    rotation: 0,
    mirrored: false,
    seamAllowance: 10,
    layer: 1,
    sublayer: 0,
    active: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe('exportPDF', () => {
  it('generates valid PDF structure', () => {
    const pdf = generatePDF([makePiece()]);
    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    expect(pdf).toContain('%%EOF');
  });

  it('contains page catalog and pages', () => {
    const pdf = generatePDF([makePiece()]);
    expect(pdf).toContain('/Type /Catalog');
    expect(pdf).toContain('/Type /Pages');
    expect(pdf).toContain('/Type /Page');
  });

  it('includes content stream with path operators', () => {
    const pdf = generatePDF([makePiece()]);
    // PDF move and line operators
    expect(pdf).toMatch(/\d+\.\d+ \d+\.\d+ m/);
    expect(pdf).toMatch(/\d+\.\d+ \d+\.\d+ l/);
    // Stroke
    expect(pdf).toContain('S\n');
  });

  it('includes piece label', () => {
    const pdf = generatePDF([makePiece({ name: 'Sleeve' })]);
    expect(pdf).toContain('(Sleeve)');
  });

  it('includes Helvetica font', () => {
    const pdf = generatePDF([makePiece()]);
    expect(pdf).toContain('/BaseFont /Helvetica');
  });

  it('handles bezier curves', () => {
    const piece = makePiece({
      outline: [
        { type: 'M', values: [0, 0] },
        { type: 'C', values: [10, 20, 30, 40, 50, 60] },
        { type: 'Z', values: [] },
      ],
    });
    const pdf = generatePDF([piece]);
    // PDF cubic bezier operator
    expect(pdf).toMatch(/c\n/);
  });

  it('handles quadratic curves (converted to cubic)', () => {
    const piece = makePiece({
      outline: [
        { type: 'M', values: [0, 0] },
        { type: 'Q', values: [50, 50, 100, 0] },
        { type: 'Z', values: [] },
      ],
    });
    const pdf = generatePDF([piece]);
    expect(pdf).toMatch(/c\n/);
  });

  it('draws grainline internals in green', () => {
    const piece = makePiece({
      internals: [{
        id: 'gl-1',
        type: 'grainline',
        path: [
          { type: 'M', values: [100, 10] },
          { type: 'L', values: [100, 290] },
        ],
      }],
    });
    const pdf = generatePDF([piece]);
    // Green color: 0 0.6 0 RG
    expect(pdf).toContain('0 0.6 0 RG');
  });

  // The stroke of an internal that is neither notch nor grainline: black, 0.3 pt, solid.
  const plainInternalStroke = (pdf: string) => {
    const start = pdf.indexOf('0 0 0 RG\n0.3 w\n[] 0 d\n');
    return pdf.slice(start, pdf.indexOf('S\n', start));
  };

  it('draws every segment of a multi-vertex internal (both legs of a V dart)', () => {
    const piece = makePiece({
      internals: [{
        id: 'dart-1',
        type: 'dart',
        path: [
          { type: 'M', values: [80, 0] },
          { type: 'L', values: [100, 120] },
          { type: 'L', values: [120, 0] },
        ],
      }],
    });
    const stroke = plainInternalStroke(generatePDF([piece]));
    expect(stroke.match(/ l\n/g)).toHaveLength(2);
  });

  it('runs a multi-vertex grainline end to end with the arrow at its end', () => {
    const piece = makePiece({
      internals: [{
        id: 'gl-2',
        type: 'grainline',
        path: [
          { type: 'M', values: [100, 10] },
          { type: 'L', values: [100, 150] },
          { type: 'L', values: [100, 290] },
        ],
      }],
    });
    const pdf = generatePDF([piece]);
    const grain = pdf.slice(pdf.indexOf('0 0.6 0 RG\n0.4 w\n[] 0 d\n'));
    const shaft = grain.slice(0, grain.indexOf('S\n'));
    const shaftEnds = [...shaft.matchAll(/(\S+) (\S+) l\n/g)];
    expect(shaftEnds).toHaveLength(1);
    const tip = grain.slice(grain.indexOf('S\n')).match(/(\S+) (\S+) m\n/);
    expect(tip?.slice(1)).toEqual(shaftEnds[0].slice(1));
  });

  it('draws curved internals instead of dropping them', () => {
    const piece = makePiece({
      internals: [{
        id: 'ref-1',
        type: 'reference',
        path: [
          { type: 'M', values: [40, 100] },
          { type: 'C', values: [60, 80, 140, 80, 160, 100] },
        ],
      }],
    });
    const stroke = plainInternalStroke(generatePDF([piece]));
    expect(stroke).toMatch(/ c\n/);
  });

  it('keeps the seam allowance of the rightmost piece inside the page', () => {
    const pdf = generatePDF([makePiece({ seamAllowance: 10 })]);
    const pageW = Number(pdf.match(/MediaBox \[0 0 ([\d.]+) /)![1]);
    const xs = [...pdf.matchAll(/(-?[\d.]+) -?[\d.]+ [ml]\n/g)].map((m) => Number(m[1]));
    expect(Math.max(...xs)).toBeLessThan(pageW);
  });

  it('keeps a seam allowance wider than the page margin inside the page on every side', () => {
    const pdf = generatePDF([makePiece({ seamAllowance: 40 })]);
    const [pageW, pageH] = pdf.match(/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/)!.slice(1).map(Number);
    const pts = [...pdf.matchAll(/(-?[\d.]+) (-?[\d.]+) [ml]\n/g)].map((m) => [Number(m[1]), Number(m[2])]);
    const xs = pts.map(([x]) => x);
    const ys = pts.map(([, y]) => y);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThanOrEqual(pageW);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...ys)).toBeLessThanOrEqual(pageH);
  });

  it('has xref table', () => {
    const pdf = generatePDF([makePiece()]);
    expect(pdf).toContain('xref');
    expect(pdf).toContain('startxref');
  });
});
