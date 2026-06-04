import { describe, it, expect } from 'vitest';
import { formatPieceLabel, pieceNumberLabel, pieceCutQuantity } from '../pieceLabel';

describe('pieceLabel', () => {
  describe('pieceNumberLabel', () => {
    it('pads to two digits, 1-based', () => {
      expect(pieceNumberLabel(0)).toBe('01');
      expect(pieceNumberLabel(3)).toBe('04');
      expect(pieceNumberLabel(11)).toBe('12');
    });
  });

  describe('pieceCutQuantity', () => {
    it('is 2 when mirrored', () => {
      expect(pieceCutQuantity({ mirrored: true, linkMode: undefined })).toBe(2);
    });
    it('is 2 when symmetry-linked', () => {
      expect(pieceCutQuantity({ mirrored: false, linkMode: 'symmetry' })).toBe(2);
    });
    it('is 1 for a plain single piece', () => {
      expect(pieceCutQuantity({ mirrored: false, linkMode: undefined })).toBe(1);
    });
    it('is 1 for an instance link (a copy, not a mirror)', () => {
      expect(pieceCutQuantity({ mirrored: false, linkMode: 'instance' })).toBe(1);
    });
  });

  describe('formatPieceLabel', () => {
    const base = { name: 'Front', mirrored: false, linkMode: undefined, gradedSize: undefined, fabricCode: undefined } as const;

    it('headline is uppercase name + two-digit number', () => {
      expect(formatPieceLabel(base, 0).name).toBe('FRONT · 01');
    });

    it('always includes a CUT quantity line', () => {
      expect(formatPieceLabel(base, 0).meta[0]).toBe('CUT ×1');
      expect(formatPieceLabel({ ...base, mirrored: true }, 1).meta[0]).toBe('CUT ×2');
    });

    it('includes size when graded, fabric name when resolved, and mirror note', () => {
      const lines = formatPieceLabel(
        { name: 'Back', mirrored: false, linkMode: 'symmetry', gradedSize: 'M', fabricCode: 'SELF' },
        1,
        'Jersey 180',
      );
      expect(lines.name).toBe('BACK · 02');
      expect(lines.meta).toEqual(['CUT ×2', 'M', 'JERSEY 180', 'MIRROR PAIR']);
    });

    it('falls back to fabricCode when no fabric name is resolved', () => {
      const lines = formatPieceLabel({ ...base, fabricCode: 'lining' }, 0);
      expect(lines.meta).toContain('LINING');
    });

    it('omits empty optional lines', () => {
      const lines = formatPieceLabel(base, 0);
      expect(lines.meta).toEqual(['CUT ×1']);
    });

    it('tolerates an empty name', () => {
      expect(formatPieceLabel({ ...base, name: '' }, 4).name).toBe('PIECE · 05');
    });
  });
});
