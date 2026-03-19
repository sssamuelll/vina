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

  it('has xref table', () => {
    const pdf = generatePDF([makePiece()]);
    expect(pdf).toContain('xref');
    expect(pdf).toContain('startxref');
  });
});
