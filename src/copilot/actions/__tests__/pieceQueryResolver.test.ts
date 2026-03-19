/**
 * Tests for pieceQueryResolver
 */

import { describe, it, expect } from 'vitest';
import { resolvePieceQuery, resolvePieceQueryOrId } from '../pieceQueryResolver';
import type { PatternPiece } from '../../../types/types';

const mockPieces: PatternPiece[] = [
  {
    id: 'front-bodice',
    name: 'Front Bodice',
    outline: [{ type: 'M', values: [0, 0] }, { type: 'Z', values: [] }],
    internals: [{ id: 'dart-1', type: 'dart', path: [] }],
    mirrored: false,
    seamAllowance: 10,
    position: { x: 0, y: 0 },
    rotation: 0,
    layer: 1,
    sublayer: 0,
    active: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'back-bodice',
    name: 'Back Bodice',
    outline: [{ type: 'M', values: [0, 0] }, { type: 'Z', values: [] }],
    internals: [{ id: 'dart-2', type: 'dart', path: [] }],
    mirrored: false,
    seamAllowance: 10,
    position: { x: 150, y: 0 },
    rotation: 0,
    layer: 1,
    sublayer: 0,
    active: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'left-sleeve',
    name: 'Left Sleeve',
    outline: [{ type: 'M', values: [0, 0] }, { type: 'Z', values: [] }],
    internals: [],
    mirrored: false,
    seamAllowance: 10,
    position: { x: 300, y: 0 },
    rotation: 0,
    layer: 1,
    sublayer: 0,
    active: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'right-sleeve',
    name: 'Right Sleeve',
    outline: [{ type: 'M', values: [0, 0] }, { type: 'Z', values: [] }],
    internals: [],
    mirrored: false,
    seamAllowance: 10,
    position: { x: 450, y: 0 },
    rotation: 0,
    layer: 1,
    sublayer: 0,
    active: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'collar-1',
    name: 'Collar Stand',
    outline: [{ type: 'M', values: [0, 0] }, { type: 'Z', values: [] }],
    internals: [],
    mirrored: false,
    seamAllowance: 10,
    position: { x: 0, y: 300 },
    rotation: 0,
    layer: 1,
    sublayer: 0,
    active: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
];

describe('resolvePieceQuery', () => {
  describe('All pieces queries', () => {
    it('should match "all pieces"', () => {
      const result = resolvePieceQuery('all pieces', mockPieces);
      expect(result.pieceIds).toHaveLength(5);
      expect(result.confidence).toBe(1.0);
    });

    it('should match "all"', () => {
      const result = resolvePieceQuery('all', mockPieces);
      expect(result.pieceIds).toHaveLength(5);
    });

    it('should match "todas las piezas" (Spanish)', () => {
      const result = resolvePieceQuery('todas las piezas', mockPieces);
      expect(result.pieceIds).toHaveLength(5);
    });
  });

  describe('Type-based queries', () => {
    it('should match "sleeve pieces"', () => {
      const result = resolvePieceQuery('sleeve pieces', mockPieces);
      expect(result.pieceIds).toContain('left-sleeve');
      expect(result.pieceIds).toContain('right-sleeve');
      expect(result.pieceIds).toHaveLength(2);
    });

    it('should match "all sleeves"', () => {
      const result = resolvePieceQuery('all sleeves', mockPieces);
      expect(result.pieceIds).toHaveLength(2);
    });

    it('should match "bodice" pieces', () => {
      const result = resolvePieceQuery('bodice', mockPieces);
      expect(result.pieceIds).toContain('front-bodice');
      expect(result.pieceIds).toContain('back-bodice');
    });

    it('should match "collar"', () => {
      const result = resolvePieceQuery('collar', mockPieces);
      expect(result.pieceIds).toContain('collar-1');
    });
  });

  describe('Modifier-based queries', () => {
    it('should match "left sleeve"', () => {
      const result = resolvePieceQuery('left sleeve', mockPieces);
      expect(result.pieceIds).toContain('left-sleeve');
      // Should prefer left over right
    });

    it('should match "front bodice"', () => {
      const result = resolvePieceQuery('front bodice', mockPieces);
      expect(result.pieceIds).toContain('front-bodice');
    });

    it('should match "back bodice"', () => {
      const result = resolvePieceQuery('back bodice', mockPieces);
      expect(result.pieceIds).toContain('back-bodice');
    });
  });

  describe('Feature-based queries', () => {
    it('should match "pieces with darts"', () => {
      const result = resolvePieceQuery('pieces with darts', mockPieces);
      expect(result.pieceIds).toContain('front-bodice');
      expect(result.pieceIds).toContain('back-bodice');
      expect(result.pieceIds).not.toContain('left-sleeve');
    });
  });

  describe('Direct name matching', () => {
    it('should match exact piece name', () => {
      const result = resolvePieceQuery('Collar Stand', mockPieces);
      expect(result.pieceIds).toContain('collar-1');
    });

    it('should match partial piece name', () => {
      const result = resolvePieceQuery('Stand', mockPieces);
      expect(result.pieceIds).toContain('collar-1');
    });
  });

  describe('Selected pieces queries', () => {
    it('should return selected pieces', () => {
      const result = resolvePieceQuery('selected', mockPieces, ['front-bodice', 'back-bodice']);
      expect(result.pieceIds).toEqual(['front-bodice', 'back-bodice']);
    });

    it('should return empty for no selection', () => {
      const result = resolvePieceQuery('selected', mockPieces, []);
      expect(result.pieceIds).toHaveLength(0);
    });
  });

  describe('Clear/none queries', () => {
    it('should return empty for "none"', () => {
      const result = resolvePieceQuery('none', mockPieces);
      expect(result.pieceIds).toHaveLength(0);
    });

    it('should return empty for "clear"', () => {
      const result = resolvePieceQuery('clear', mockPieces);
      expect(result.pieceIds).toHaveLength(0);
    });
  });

  describe('No match', () => {
    it('should return empty for unmatched query', () => {
      const result = resolvePieceQuery('nonexistent xyz', mockPieces);
      expect(result.pieceIds).toHaveLength(0);
      expect(result.explanation).toContain('No pieces matching');
    });
  });
});

describe('resolvePieceQueryOrId', () => {
  it('should return array as-is (filtered)', () => {
    const result = resolvePieceQueryOrId(['front-bodice', 'invalid'], mockPieces);
    expect(result).toEqual(['front-bodice']);
  });

  it('should return direct ID match', () => {
    const result = resolvePieceQueryOrId('front-bodice', mockPieces);
    expect(result).toEqual(['front-bodice']);
  });

  it('should fall back to query resolution', () => {
    const result = resolvePieceQueryOrId('all sleeves', mockPieces);
    expect(result).toContain('left-sleeve');
    expect(result).toContain('right-sleeve');
  });
});
