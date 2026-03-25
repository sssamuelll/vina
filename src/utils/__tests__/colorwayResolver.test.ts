import { describe, it, expect } from 'vitest';
import { resolveColorway } from '../colorwayResolver';
import type { Colorway } from '../../types/types';

// ─── Shared fixtures ────────────────────────────────────────────────────────

const baseFabrics = {
  SELF: { color: '#ffffff', fabricId: 'cotton-poplin' },
  LINING: { color: '#eeeeee', fabricId: 'silk-lining', textureUrl: 'https://cdn.test/lining.png' },
};

const fabricLibraryIds = new Set(['cotton-poplin', 'silk-lining', 'denim-heavy', 'velvet-crush']);

const colorways: Colorway[] = [
  {
    id: 'cw-red',
    name: 'Red Edition',
    overrides: {
      SELF: { color: '#ff0000' },
      LINING: { color: '#cc0000', fabricId: 'silk-lining', textureUrl: 'https://cdn.test/red-lining.png' },
    },
  },
  {
    id: 'cw-fabric',
    name: 'Denim Edition',
    overrides: {
      SELF: { fabricId: 'denim-heavy' },
    },
  },
  {
    id: 'cw-bad-fabric',
    name: 'Bad Fabric Edition',
    overrides: {
      SELF: { fabricId: 'non-existent-fabric' },
    },
  },
  {
    id: 'cw-texture',
    name: 'Texture Edition',
    overrides: {
      SELF: { textureUrl: 'https://cdn.test/texture.png' },
    },
  },
  {
    id: 'cw-combined',
    name: 'Combined Edition',
    overrides: {
      SELF: { color: '#00ff00', fabricId: 'velvet-crush', textureUrl: 'https://cdn.test/velvet.png' },
    },
  },
  {
    id: 'cw-null-override',
    name: 'Null Override Edition',
    overrides: {
      SELF: null,
    },
  },
  {
    id: 'cw-no-self',
    name: 'No SELF Override',
    overrides: {
      LINING: { color: '#abcdef' },
    },
  },
];

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('resolveColorway', () => {
  // 1. No active colorway → base material
  it('returns base material when activeColorwayId is null', () => {
    const result = resolveColorway(
      { fabricCode: 'SELF' },
      colorways,
      null,
      baseFabrics,
      fabricLibraryIds,
    );
    expect(result).toEqual({
      color: '#ffffff',
      fabricId: 'cotton-poplin',
      textureUrl: undefined,
      isOverridden: false,
    });
  });

  // 2. Active colorway not found → base material
  it('returns base material when active colorway id does not exist in colorways', () => {
    const result = resolveColorway(
      { fabricCode: 'SELF' },
      colorways,
      'cw-does-not-exist',
      baseFabrics,
      fabricLibraryIds,
    );
    expect(result).toEqual({
      color: '#ffffff',
      fabricId: 'cotton-poplin',
      textureUrl: undefined,
      isOverridden: false,
    });
  });

  // 3. Piece has no fabricCode → treated as 'SELF'
  it('defaults fabricCode to SELF when piece has no fabricCode', () => {
    const result = resolveColorway(
      {},
      colorways,
      'cw-red',
      baseFabrics,
      fabricLibraryIds,
    );
    expect(result.color).toBe('#ff0000');
    expect(result.isOverridden).toBe(true);
  });

  // 4. Color-only override
  it('applies color-only override', () => {
    const result = resolveColorway(
      { fabricCode: 'SELF' },
      colorways,
      'cw-red',
      baseFabrics,
      fabricLibraryIds,
    );
    expect(result.color).toBe('#ff0000');
    expect(result.fabricId).toBe('cotton-poplin'); // unchanged
    expect(result.textureUrl).toBeUndefined();
    expect(result.isOverridden).toBe(true);
  });

  // 5. fabricId override with valid ID in library
  it('applies fabricId override when fabricId exists in fabricLibraryIds', () => {
    const result = resolveColorway(
      { fabricCode: 'SELF' },
      colorways,
      'cw-fabric',
      baseFabrics,
      fabricLibraryIds,
    );
    expect(result.fabricId).toBe('denim-heavy');
    expect(result.color).toBe('#ffffff'); // base color unchanged
    expect(result.isOverridden).toBe(true);
  });

  // 6. fabricId override with unknown ID → ignored, base fabricId used
  it('ignores fabricId override when fabricId is not in fabricLibraryIds', () => {
    const result = resolveColorway(
      { fabricCode: 'SELF' },
      colorways,
      'cw-bad-fabric',
      baseFabrics,
      fabricLibraryIds,
    );
    expect(result.fabricId).toBe('cotton-poplin'); // base fabricId preserved
    expect(result.isOverridden).toBe(true); // override was found and applied (minus invalid fabricId)
  });

  // 7. textureUrl override
  it('applies textureUrl override', () => {
    const result = resolveColorway(
      { fabricCode: 'SELF' },
      colorways,
      'cw-texture',
      baseFabrics,
      fabricLibraryIds,
    );
    expect(result.textureUrl).toBe('https://cdn.test/texture.png');
    expect(result.color).toBe('#ffffff'); // base unchanged
    expect(result.isOverridden).toBe(true);
  });

  // 8. Combined override (all three fields)
  it('applies combined override with color, fabricId, and textureUrl', () => {
    const result = resolveColorway(
      { fabricCode: 'SELF' },
      colorways,
      'cw-combined',
      baseFabrics,
      fabricLibraryIds,
    );
    expect(result.color).toBe('#00ff00');
    expect(result.fabricId).toBe('velvet-crush');
    expect(result.textureUrl).toBe('https://cdn.test/velvet.png');
    expect(result.isOverridden).toBe(true);
  });

  // 9. fabricCode not in overrides → base material
  it('returns base material when fabricCode has no entry in colorway overrides', () => {
    const result = resolveColorway(
      { fabricCode: 'SELF' },
      colorways,
      'cw-no-self',
      baseFabrics,
      fabricLibraryIds,
    );
    expect(result).toEqual({
      color: '#ffffff',
      fabricId: 'cotton-poplin',
      textureUrl: undefined,
      isOverridden: false,
    });
  });

  // 10. Override set to null → base material (deleted override)
  it('returns base material when override entry is null', () => {
    const result = resolveColorway(
      { fabricCode: 'SELF' },
      colorways,
      'cw-null-override',
      baseFabrics,
      fabricLibraryIds,
    );
    expect(result).toEqual({
      color: '#ffffff',
      fabricId: 'cotton-poplin',
      textureUrl: undefined,
      isOverridden: false,
    });
  });

  // 11. isOverridden flag — false when no override applies
  it('sets isOverridden to false when returning base material (null colorway)', () => {
    const result = resolveColorway(
      { fabricCode: 'SELF' },
      colorways,
      null,
      baseFabrics,
      fabricLibraryIds,
    );
    expect(result.isOverridden).toBe(false);
  });

  // 12. isOverridden flag — true when override applies
  it('sets isOverridden to true when an override is applied', () => {
    const result = resolveColorway(
      { fabricCode: 'SELF' },
      colorways,
      'cw-red',
      baseFabrics,
      fabricLibraryIds,
    );
    expect(result.isOverridden).toBe(true);
  });

  // 13. fabricCode not in baseFabrics → fallback defaults
  it('uses fallback defaults when fabricCode is not in baseFabrics', () => {
    const result = resolveColorway(
      { fabricCode: 'INTERLINING', fabricId: 'fusible-web' },
      colorways,
      null,
      baseFabrics,
      fabricLibraryIds,
    );
    expect(result.color).toBe('#cccccc');
    expect(result.fabricId).toBe('fusible-web');
    expect(result.isOverridden).toBe(false);
  });

  // 14. fabricCode not in baseFabrics, no piece.fabricId → fallback to cotton-poplin
  it('uses cotton-poplin as fallback fabricId when fabricCode not in baseFabrics and no piece.fabricId', () => {
    const result = resolveColorway(
      { fabricCode: 'UNKNOWN' },
      colorways,
      null,
      baseFabrics,
      fabricLibraryIds,
    );
    expect(result.color).toBe('#cccccc');
    expect(result.fabricId).toBe('cotton-poplin');
    expect(result.isOverridden).toBe(false);
  });

  // 15. LINING piece with combined colorway override
  it('correctly resolves LINING piece with full override in colorway', () => {
    const result = resolveColorway(
      { fabricCode: 'LINING' },
      colorways,
      'cw-red',
      baseFabrics,
      fabricLibraryIds,
    );
    expect(result.color).toBe('#cc0000');
    expect(result.fabricId).toBe('silk-lining');
    expect(result.textureUrl).toBe('https://cdn.test/red-lining.png');
    expect(result.isOverridden).toBe(true);
  });

  // 16. Base material includes textureUrl from baseFabrics
  it('includes textureUrl from baseFabrics in base result', () => {
    const result = resolveColorway(
      { fabricCode: 'LINING' },
      colorways,
      null,
      baseFabrics,
      fabricLibraryIds,
    );
    expect(result.textureUrl).toBe('https://cdn.test/lining.png');
    expect(result.isOverridden).toBe(false);
  });
});
