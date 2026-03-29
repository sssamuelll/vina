import { describe, it, expect } from 'vitest';
import type { PatternPiece } from '../../../types/types';
import type { Trim } from '../../../types/trim';
import { extractTrims } from '../trimExtractor';

// ─── Test helpers ───────────────────────────────────────────────────────────

/** Rectangular piece 100mm x 200mm with two named edges */
function makeRectPiece(id: string): PatternPiece {
  return {
    id,
    name: `Piece ${id}`,
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 200] },
      { type: 'L', values: [0, 200] },
      { type: 'Z', values: [] },
    ],
    internals: [],
    position: { x: 0, y: 0 },
    rotation: 0,
    mirrored: false,
    seamAllowance: 0,
    active: true,
    edges: [
      // "side" edge: point 0 (0,0) -> point 1 (100,0) = 100mm top edge
      { id: 'e1', name: 'side', segmentRange: [0, 1] as [number, number], edgeType: 'seam' as const },
      // "bottom" edge: point 1 (100,0) -> point 2 (100,200) = 200mm right edge
      { id: 'e2', name: 'bottom', segmentRange: [1, 2] as [number, number], edgeType: 'seam' as const },
    ],
  } as unknown as PatternPiece;
}

function makeTrim(overrides: Partial<Trim> & { id: string; pieceId: string }): Trim {
  return {
    type: 'button',
    name: 'Trim',
    description: '',
    material: 'plastic',
    color: '#333333',
    size: 15,
    unitCost: 0,
    active: true,
    placement: { mode: 'count', quantity: 1 },
    ...overrides,
  } as Trim;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('extractTrims', () => {
  it('returns empty array when no trims', () => {
    const pieces = [makeRectPiece('p1')];
    expect(extractTrims([], pieces)).toEqual([]);
  });

  it('skips inactive trims', () => {
    const pieces = [makeRectPiece('p1')];
    const trims: Trim[] = [
      makeTrim({ id: 't1', pieceId: 'p1', active: false, placement: { mode: 'count', quantity: 5 } }),
    ];
    expect(extractTrims(trims, pieces)).toEqual([]);
  });

  it('groups count-mode trims by type+name and sums quantities', () => {
    const pieces = [makeRectPiece('p1'), makeRectPiece('p2')];
    const trims: Trim[] = [
      makeTrim({ id: 't1', pieceId: 'p1', type: 'button', name: 'Flat 15mm', unitCost: 0.15, placement: { mode: 'count', quantity: 4 } }),
      makeTrim({ id: 't2', pieceId: 'p2', type: 'button', name: 'Flat 15mm', unitCost: 0.15, placement: { mode: 'count', quantity: 3 } }),
    ];

    const result = extractTrims(trims, pieces);
    expect(result).toHaveLength(1);
    expect(result[0].quantity).toBe(7);
    expect(result[0].unit).toBe('pieces');
    expect(result[0].name).toBe('button \u2014 Flat 15mm');
    expect(result[0].sourcePieceIds).toContain('p1');
    expect(result[0].sourcePieceIds).toContain('p2');
  });

  it('groups edge-mode trims by type+name and sums lengths', () => {
    const pieces = [makeRectPiece('p1'), makeRectPiece('p2')];
    const trims: Trim[] = [
      // "side" edge on p1: points[0]->(0,0) to points[1]->(100,0) = 100mm, full range
      makeTrim({ id: 't1', pieceId: 'p1', type: 'zipper', name: 'Invisible', unitCost: 1.0, placement: { mode: 'edge', edgeName: 'side', tStart: 0, tEnd: 1 } }),
      // same edge on p2
      makeTrim({ id: 't2', pieceId: 'p2', type: 'zipper', name: 'Invisible', unitCost: 1.0, placement: { mode: 'edge', edgeName: 'side', tStart: 0, tEnd: 1 } }),
    ];

    const result = extractTrims(trims, pieces);
    expect(result).toHaveLength(1);
    expect(result[0].unit).toBe('meters');
    // 100mm + 100mm = 200mm = 0.2m
    expect(result[0].quantity).toBe(0.2);
    expect(result[0].name).toBe('zipper \u2014 Invisible');
    expect(result[0].sourcePieceIds).toContain('p1');
    expect(result[0].sourcePieceIds).toContain('p2');
  });

  it('separates different trim types into different entries', () => {
    const pieces = [makeRectPiece('p1')];
    const trims: Trim[] = [
      makeTrim({ id: 't1', pieceId: 'p1', type: 'button', name: 'Flat', unitCost: 0.15, placement: { mode: 'count', quantity: 4 } }),
      makeTrim({ id: 't2', pieceId: 'p1', type: 'snap', name: 'Prong', unitCost: 0.25, placement: { mode: 'count', quantity: 2 } }),
    ];

    const result = extractTrims(trims, pieces);
    expect(result).toHaveLength(2);
    const names = result.map(e => e.name);
    expect(names).toContain('button \u2014 Flat');
    expect(names).toContain('snap \u2014 Prong');
  });

  it('includes unitCost from trim data', () => {
    const pieces = [makeRectPiece('p1')];
    const trims: Trim[] = [
      makeTrim({ id: 't1', pieceId: 'p1', type: 'button', name: 'Horn', unitCost: 1.20, placement: { mode: 'count', quantity: 6 } }),
    ];

    const result = extractTrims(trims, pieces);
    expect(result).toHaveLength(1);
    expect(result[0].unitCost).toBe(1.20);
    expect(result[0].currency).toBe('USD');
    expect(result[0].autoPopulated).toBe(true);
  });

  it('handles mixed count and edge trims', () => {
    const pieces = [makeRectPiece('p1')];
    const trims: Trim[] = [
      makeTrim({ id: 't1', pieceId: 'p1', type: 'button', name: 'Flat', unitCost: 0.15, placement: { mode: 'count', quantity: 5 } }),
      makeTrim({ id: 't2', pieceId: 'p1', type: 'zipper', name: 'Metal', unitCost: 2.50, placement: { mode: 'edge', edgeName: 'bottom', tStart: 0, tEnd: 1 } }),
    ];

    const result = extractTrims(trims, pieces);
    expect(result).toHaveLength(2);

    const countEntry = result.find(e => e.unit === 'pieces')!;
    expect(countEntry.quantity).toBe(5);
    expect(countEntry.name).toBe('button \u2014 Flat');

    const edgeEntry = result.find(e => e.unit === 'meters')!;
    // "bottom" edge: points[1]->(100,0) to points[2]->(100,200) = 200mm = 0.2m
    expect(edgeEntry.quantity).toBe(0.2);
    expect(edgeEntry.name).toBe('zipper \u2014 Metal');
    expect(edgeEntry.unitCost).toBe(2.50);
  });

  it('handles partial edge range via tStart/tEnd', () => {
    const pieces = [makeRectPiece('p1')];
    const trims: Trim[] = [
      // "bottom" edge is 200mm, but only half range
      makeTrim({ id: 't1', pieceId: 'p1', type: 'zipper', name: 'Coil', unitCost: 0.80, placement: { mode: 'edge', edgeName: 'bottom', tStart: 0, tEnd: 0.5 } }),
    ];

    const result = extractTrims(trims, pieces);
    expect(result).toHaveLength(1);
    // 200mm * 0.5 = 100mm = 0.1m
    expect(result[0].quantity).toBe(0.1);
  });

  it('groups point-mode trims by type+name and sums position counts', () => {
    const pieces = [makeRectPiece('p1'), makeRectPiece('p2')];
    const trims: Trim[] = [
      makeTrim({ id: 't1', pieceId: 'p1', type: 'rivet', name: 'Copper Rivet', unitCost: 0.05, placement: { mode: 'point', positions: [{ x: 10, y: 20 }, { x: 30, y: 40 }, { x: 50, y: 60 }] } }),
      makeTrim({ id: 't2', pieceId: 'p2', type: 'rivet', name: 'Copper Rivet', unitCost: 0.05, placement: { mode: 'point', positions: [{ x: 5, y: 5 }, { x: 15, y: 15 }, { x: 25, y: 25 }, { x: 35, y: 35 }] } }),
    ];

    const result = extractTrims(trims, pieces);
    expect(result).toHaveLength(1);
    // 3 positions + 4 positions = 7
    expect(result[0].quantity).toBe(7);
    expect(result[0].unit).toBe('pieces');
    expect(result[0].name).toBe('rivet \u2014 Copper Rivet');
    expect(result[0].sourcePieceIds).toContain('p1');
    expect(result[0].sourcePieceIds).toContain('p2');
  });

  it('handles mixed count, edge, and point trims', () => {
    const pieces = [makeRectPiece('p1')];
    const trims: Trim[] = [
      makeTrim({ id: 't1', pieceId: 'p1', type: 'button', name: 'Flat', unitCost: 0.15, placement: { mode: 'count', quantity: 5 } }),
      makeTrim({ id: 't2', pieceId: 'p1', type: 'zipper', name: 'Metal', unitCost: 2.50, placement: { mode: 'edge', edgeName: 'bottom', tStart: 0, tEnd: 1 } }),
      makeTrim({ id: 't3', pieceId: 'p1', type: 'rivet', name: 'Brass', unitCost: 0.10, placement: { mode: 'point', positions: [{ x: 10, y: 10 }, { x: 20, y: 20 }] } }),
    ];

    const result = extractTrims(trims, pieces);
    expect(result).toHaveLength(3);

    const countEntry = result.find(e => e.name === 'button \u2014 Flat')!;
    expect(countEntry.unit).toBe('pieces');
    expect(countEntry.quantity).toBe(5);

    const edgeEntry = result.find(e => e.name === 'zipper \u2014 Metal')!;
    expect(edgeEntry.unit).toBe('meters');

    const pointEntry = result.find(e => e.name === 'rivet \u2014 Brass')!;
    expect(pointEntry.unit).toBe('pieces');
    expect(pointEntry.quantity).toBe(2);
  });
});
