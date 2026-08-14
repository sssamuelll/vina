import { describe, it, expect } from 'vitest';
import type { PathCommand, Seam, Elastic, Fabric, PatternPiece } from '../../../types/types';
import {
  extractFabrics,
  extractInterfacing,
  extractThread,
  extractSeamTape,
  extractElastics,
  extractAll,
} from '../bomExtractor';

// ─── Helpers ───

/** 100mm x 200mm rectangle = 20000 mm² = 0.02 m² */
const RECT_OUTLINE: PathCommand[] = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [100, 0] },
  { type: 'L', values: [100, 200] },
  { type: 'L', values: [0, 200] },
  { type: 'Z', values: [] },
];

function makePiece(overrides: Partial<PatternPiece> = {}): PatternPiece {
  return {
    id: 'p1',
    name: 'Front Bodice',
    outline: RECT_OUTLINE,
    internals: [],
    position: { x: 0, y: 0 },
    rotation: 0,
    mirrored: false,
    seamAllowance: 10,
    active: true,
    fabricCode: 'SELF',
    fabricId: 'f1',
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  } as PatternPiece;
}

function makeSeam(overrides: Partial<Seam> = {}): Seam {
  return {
    id: 's1',
    pieceA: { pieceId: 'p1', edgeName: 'sideSeam' },
    pieceB: { pieceId: 'p2', edgeName: 'sideSeam' },
    type: 'standard',
    tension: 100,
    strength: 1,
    active: true,
    taped: false,
    tapeWidth: 10,
    ...overrides,
  };
}

function makeElastic(overrides: Partial<Elastic> = {}): Elastic {
  return {
    id: 'e1',
    pieceId: 'p1',
    edgeName: 'waistline',
    stretchRatio: 0.5,
    width: 12,
    type: 'band',
    tStart: 0,
    tEnd: 1,
    active: true,
    ...overrides,
  };
}

function makeFabric(overrides: Partial<Fabric> = {}): Fabric {
  return {
    id: 'f1',
    name: 'Cotton Twill',
    color: '#ffffff',
    weight: 200,
    stretch: 0,
    stiffness: 0.5,
    friction: 0.5,
    ...overrides,
  };
}

// ─── extractFabrics ───

describe('extractFabrics', () => {
  it('groups pieces by fabricCode and sums area in m²', () => {
    const pieces = [
      makePiece({ id: 'p1', fabricCode: 'SELF' }),
      makePiece({ id: 'p2', fabricCode: 'SELF' }),
    ];
    const fabrics = [makeFabric()];
    const entries = extractFabrics(pieces, fabrics);

    expect(entries).toHaveLength(1);
    expect(entries[0].category).toBe('fabric');
    expect(entries[0].name).toContain('SELF');
    // Two 100x200mm pieces = 2 * 20000mm² = 40000mm² = 0.04m²
    expect(entries[0].quantity).toBeCloseTo(0.04, 4);
    expect(entries[0].unit).toBe('meters');
    expect(entries[0].sourcePieceIds).toEqual(['p1', 'p2']);
  });

  it('accounts for mirrored pieces (x2 area)', () => {
    const pieces = [makePiece({ id: 'p1', mirrored: true })];
    const entries = extractFabrics(pieces, [makeFabric()]);

    // 20000mm² * 2 = 40000mm² = 0.04m²
    expect(entries[0].quantity).toBeCloseTo(0.04, 4);
  });

  it('separates different fabricCodes into separate entries', () => {
    const pieces = [
      makePiece({ id: 'p1', fabricCode: 'SELF' }),
      makePiece({ id: 'p2', fabricCode: 'LINING' }),
    ];
    const entries = extractFabrics(pieces, [makeFabric()]);

    expect(entries).toHaveLength(2);
    const names = entries.map((e) => e.name);
    expect(names).toContain('Tela — SELF');
    expect(names).toContain('Tela — LINING');
  });

  it('handles pieces with no fabricCode', () => {
    const pieces = [makePiece({ id: 'p1', fabricCode: undefined })];
    const entries = extractFabrics(pieces, [makeFabric()]);

    expect(entries).toHaveLength(1);
    expect(entries[0].name).toContain('Sin asignar');
  });

  it('returns empty array for no pieces', () => {
    expect(extractFabrics([], [])).toEqual([]);
  });
});

// ─── extractInterfacing ───

describe('extractInterfacing', () => {
  it('groups pieces by interfacingType and sums area', () => {
    const pieces = [
      makePiece({ id: 'p1', interfacingType: 'fusible-medium' }),
      makePiece({ id: 'p2', interfacingType: 'fusible-medium' }),
    ];
    const entries = extractInterfacing(pieces);

    expect(entries).toHaveLength(1);
    expect(entries[0].category).toBe('interfacing');
    expect(entries[0].name).toContain('fusible media');
    // 2 * 0.02 m²
    expect(entries[0].quantity).toBeCloseTo(0.04, 4);
  });

  it('skips pieces with no interfacingType', () => {
    const pieces = [makePiece({ id: 'p1', interfacingType: undefined })];
    expect(extractInterfacing(pieces)).toEqual([]);
  });

  it('skips pieces with interfacingType = "none"', () => {
    const pieces = [makePiece({ id: 'p1', interfacingType: 'none' })];
    expect(extractInterfacing(pieces)).toEqual([]);
  });

  it('accounts for mirrored pieces', () => {
    const pieces = [
      makePiece({ id: 'p1', interfacingType: 'fusible-light', mirrored: true }),
    ];
    const entries = extractInterfacing(pieces);
    // 0.02 * 2 = 0.04 m²
    expect(entries[0].quantity).toBeCloseTo(0.04, 4);
  });
});

// ─── extractThread ───

describe('extractThread', () => {
  it('calculates thread with standard multiplier (2.5x)', () => {
    const pieces = [
      makePiece({ id: 'p1', edges: [{ id: 'e1', name: 'sideSeam', segmentRange: [0, 2], edgeType: 'seam' }] }),
      makePiece({ id: 'p2', edges: [{ id: 'e2', name: 'sideSeam', segmentRange: [0, 2], edgeType: 'seam' }] }),
    ];
    const seams = [makeSeam({ type: 'standard' })];
    const entries = extractThread(seams, pieces);

    expect(entries).toHaveLength(1);
    expect(entries[0].category).toBe('thread');
    // Edge from index 0 to 2 on rect: (0,0)->(100,0)->(100,200) = 100+200=300mm
    // Thread = 300mm * 2.5 = 750mm = 0.75m
    expect(entries[0].quantity).toBeCloseTo(0.75, 2);
  });

  it('applies french seam multiplier (5x)', () => {
    const pieces = [
      makePiece({ id: 'p1', edges: [{ id: 'e1', name: 'sideSeam', segmentRange: [0, 2], edgeType: 'seam' }] }),
      makePiece({ id: 'p2', edges: [{ id: 'e2', name: 'sideSeam', segmentRange: [0, 2], edgeType: 'seam' }] }),
    ];
    const seams = [makeSeam({ type: 'french' })];
    const entries = extractThread(seams, pieces);

    // 300mm * 5.0 = 1500mm = 1.5m
    expect(entries[0].quantity).toBeCloseTo(1.5, 2);
  });

  it('applies overlock multiplier (4x)', () => {
    const pieces = [
      makePiece({ id: 'p1', edges: [{ id: 'e1', name: 'sideSeam', segmentRange: [0, 2], edgeType: 'seam' }] }),
      makePiece({ id: 'p2', edges: [{ id: 'e2', name: 'sideSeam', segmentRange: [0, 2], edgeType: 'seam' }] }),
    ];
    const seams = [makeSeam({ type: 'overlock' })];
    const entries = extractThread(seams, pieces);

    // 300mm * 4.0 = 1200mm = 1.2m
    expect(entries[0].quantity).toBeCloseTo(1.2, 2);
  });

  it('skips inactive seams', () => {
    const pieces = [makePiece({ id: 'p1' }), makePiece({ id: 'p2' })];
    const seams = [makeSeam({ active: false })];
    const entries = extractThread(seams, pieces);

    expect(entries).toEqual([]);
  });

  it('falls back to 1/4 perimeter when edge not found', () => {
    const pieces = [
      makePiece({ id: 'p1', edges: [] }),
      makePiece({ id: 'p2', edges: [] }),
    ];
    const seams = [makeSeam({ type: 'standard' })];
    const entries = extractThread(seams, pieces);

    // Fallback: 1/4 perimeter = 600/4 = 150mm, * 2.5 = 375mm = 0.375m
    expect(entries[0].quantity).toBeCloseTo(0.375, 2);
  });
});

// ─── extractSeamTape ───

describe('extractSeamTape', () => {
  it('filters taped seams and groups by tapeWidth', () => {
    const pieces = [
      makePiece({ id: 'p1', edges: [{ id: 'e1', name: 'sideSeam', segmentRange: [0, 2], edgeType: 'seam' }] }),
      makePiece({ id: 'p2', edges: [{ id: 'e2', name: 'sideSeam', segmentRange: [0, 2], edgeType: 'seam' }] }),
    ];
    const seams = [makeSeam({ taped: true, tapeWidth: 10 })];
    const entries = extractSeamTape(seams, pieces);

    expect(entries).toHaveLength(1);
    expect(entries[0].category).toBe('seam-tape');
    expect(entries[0].name).toContain('10 mm');
    // Edge length 300mm = 0.3m
    expect(entries[0].quantity).toBeCloseTo(0.3, 2);
  });

  it('skips non-taped seams', () => {
    const pieces = [makePiece({ id: 'p1' }), makePiece({ id: 'p2' })];
    const seams = [makeSeam({ taped: false })];
    expect(extractSeamTape(seams, pieces)).toEqual([]);
  });

  it('groups by different tape widths', () => {
    const pieces = [
      makePiece({ id: 'p1', edges: [{ id: 'e1', name: 'sideSeam', segmentRange: [0, 2], edgeType: 'seam' }] }),
      makePiece({ id: 'p2', edges: [{ id: 'e2', name: 'sideSeam', segmentRange: [0, 2], edgeType: 'seam' }] }),
    ];
    const seams = [
      makeSeam({ id: 's1', taped: true, tapeWidth: 10 }),
      makeSeam({ id: 's2', taped: true, tapeWidth: 15 }),
    ];
    const entries = extractSeamTape(seams, pieces);
    expect(entries).toHaveLength(2);
  });
});

// ─── extractElastics ───

describe('extractElastics', () => {
  it('groups by elastic type and estimates length', () => {
    const pieces = [
      makePiece({
        id: 'p1',
        edges: [{ id: 'e1', name: 'waistline', segmentRange: [0, 1], edgeType: 'seam' }],
      }),
    ];
    const elastics = [makeElastic({ type: 'band', tStart: 0, tEnd: 1 })];
    const entries = extractElastics(elastics, pieces);

    expect(entries).toHaveLength(1);
    expect(entries[0].category).toBe('elastic');
    expect(entries[0].name).toContain('band');
  });

  it('skips inactive elastics', () => {
    const pieces = [makePiece({ id: 'p1' })];
    const elastics = [makeElastic({ active: false })];
    expect(extractElastics(elastics, pieces)).toEqual([]);
  });

  it('separates different elastic types', () => {
    const pieces = [
      makePiece({
        id: 'p1',
        edges: [
          { id: 'e1', name: 'waistline', segmentRange: [0, 1], edgeType: 'seam' },
          { id: 'e2', name: 'cuff', segmentRange: [2, 3], edgeType: 'seam' },
        ],
      }),
    ];
    const elastics = [
      makeElastic({ id: 'e1', type: 'band', edgeName: 'waistline' }),
      makeElastic({ id: 'e2', type: 'shirring', edgeName: 'cuff' }),
    ];
    const entries = extractElastics(elastics, pieces);

    expect(entries).toHaveLength(2);
    const types = entries.map((e) => e.name);
    expect(types.some((t) => t.includes('banda'))).toBe(true);
    expect(types.some((t) => t.includes('fruncidor'))).toBe(true);
  });
});

// ─── extractAll ───

describe('extractAll', () => {
  it('combines all categories', () => {
    const pieces = [
      makePiece({
        id: 'p1',
        fabricCode: 'SELF',
        interfacingType: 'fusible-light',
        edges: [{ id: 'e1', name: 'sideSeam', segmentRange: [0, 2], edgeType: 'seam' }],
      }),
      makePiece({
        id: 'p2',
        fabricCode: 'SELF',
        edges: [{ id: 'e2', name: 'sideSeam', segmentRange: [0, 2], edgeType: 'seam' }],
      }),
    ];
    const fabrics = [makeFabric()];
    const seams = [makeSeam({ taped: true })];
    const elastics = [makeElastic()];

    const entries = extractAll(pieces, fabrics, seams, elastics);

    const categories = new Set(entries.map((e) => e.category));
    expect(categories.has('fabric')).toBe(true);
    expect(categories.has('interfacing')).toBe(true);
    expect(categories.has('thread')).toBe(true);
    expect(categories.has('seam-tape')).toBe(true);
    expect(categories.has('elastic')).toBe(true);
  });

  it('returns only fabric entries when no seams or elastics', () => {
    const pieces = [makePiece({ id: 'p1', fabricCode: 'SELF' })];
    const fabrics = [makeFabric()];

    const entries = extractAll(pieces, fabrics, [], []);

    expect(entries.every((e) => e.category === 'fabric')).toBe(true);
  });

  it('handles empty inputs', () => {
    const entries = extractAll([], [], [], []);
    expect(entries).toEqual([]);
  });
});
