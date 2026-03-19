import { describe, it, expect } from 'vitest';
import type { PatternPiece, PathCommand } from '../types/types';
import type { NestingOptions, SkylineSegment } from '../utils/nesting';
import { nestPieces, computeArea, computeBBox, updateSkyline, findBestPosition } from '../utils/nesting';
import { flattenPath } from '../utils/seam';

function makeRect(x: number, y: number, w: number, h: number): PathCommand[] {
  return [
    { type: 'M', values: [x, y] },
    { type: 'L', values: [x + w, y] },
    { type: 'L', values: [x + w, y + h] },
    { type: 'L', values: [x, y + h] },
    { type: 'Z', values: [] },
  ];
}

function makePiece(id: string, outline: PathCommand[], name?: string): PatternPiece {
  return {
    id,
    name: name || id,
    outline,
    internals: [],
    position: { x: 0, y: 0 },
    rotation: 0,
    mirrored: false,
    seamAllowance: 0,
    layer: 1,
    sublayer: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

const defaultOptions: NestingOptions = {
  sheet: { width: 1000, height: 1000, margin: 10 },
  gap: 5,
  rotationStep: 90,
  allowMirror: false,
  sortStrategy: 'area-desc',
};

describe('Nesting Engine', () => {
  it('1. Single piece — places at top-left with margin', () => {
    const piece = makePiece('a', makeRect(0, 0, 100, 50));
    const result = nestPieces([piece], defaultOptions);

    expect(result.placements).toHaveLength(1);
    expect(result.sheetsUsed).toBe(1);
    expect(result.unplaced).toHaveLength(0);
    const p = result.placements[0];
    expect(p.sheetIndex).toBe(0);
    expect(p.x).toBe(10); // margin
    expect(p.y).toBeCloseTo(15, 0); // margin + gap
  });

  it('2. Two identical squares — placed on same sheet', () => {
    const pieces = [
      makePiece('a', makeRect(0, 0, 100, 100)),
      makePiece('b', makeRect(0, 0, 100, 100)),
    ];
    const result = nestPieces(pieces, defaultOptions);

    expect(result.placements).toHaveLength(2);
    expect(result.sheetsUsed).toBe(1);
    expect(result.unplaced).toHaveLength(0);
    // Both on sheet 0
    expect(result.placements[0].sheetIndex).toBe(0);
    expect(result.placements[1].sheetIndex).toBe(0);
  });

  it('3. Piece too large for sheet — goes to unplaced', () => {
    const piece = makePiece('big', makeRect(0, 0, 2000, 2000));
    const result = nestPieces([piece], defaultOptions);

    expect(result.placements).toHaveLength(0);
    expect(result.unplaced).toEqual(['big']);
    expect(result.sheetsUsed).toBe(0);
  });

  it('4. Area-desc sorting — largest piece placed first', () => {
    const small = makePiece('small', makeRect(0, 0, 50, 50));
    const large = makePiece('large', makeRect(0, 0, 200, 200));
    // Pass small first, but large should be placed first due to sorting
    const result = nestPieces([small, large], defaultOptions);

    expect(result.placements[0].pieceId).toBe('large');
    expect(result.placements[1].pieceId).toBe('small');
  });

  it('5. Rotation — piece that only fits rotated 90° gets rotated', () => {
    // Sheet is 200 wide (usable 180), piece is 150x50
    // But make it 190x50 so it only fits one way on a 200-wide sheet (usable 180)
    // Actually let's use a narrow sheet
    const opts: NestingOptions = {
      sheet: { width: 100, height: 500, margin: 5 },
      gap: 5,
      rotationStep: 90,
      allowMirror: false,
      sortStrategy: 'area-desc',
    };
    // Piece is 80x30 — fits at 0° (80 < 90 usable) and at 90° (30 < 90)
    // Make piece 120x30 — doesn't fit at 0° (120 > 90 usable) but fits at 90° (30 < 90)
    const piece = makePiece('tall', makeRect(0, 0, 120, 30));
    const result = nestPieces([piece], opts);

    expect(result.placements).toHaveLength(1);
    expect(result.unplaced).toHaveLength(0);
    // Should be rotated 90° to fit
    expect(result.placements[0].rotation).toBe(90);
  });

  it('6. Multiple sheets — when first sheet is full, spills to second', () => {
    const opts: NestingOptions = {
      sheet: { width: 120, height: 120, margin: 5 },
      gap: 5,
      rotationStep: 90,
      allowMirror: false,
      sortStrategy: 'area-desc',
    };
    // Usable: 110x110. Each piece 100x100. One fits, second doesn't.
    const pieces = [
      makePiece('a', makeRect(0, 0, 100, 100)),
      makePiece('b', makeRect(0, 0, 100, 100)),
    ];
    const result = nestPieces(pieces, opts);

    expect(result.placements).toHaveLength(2);
    expect(result.sheetsUsed).toBe(2);
    expect(result.placements[0].sheetIndex).toBe(0);
    expect(result.placements[1].sheetIndex).toBe(1);
  });

  it('7. Gap respected — pieces are at least gap mm apart', () => {
    const opts: NestingOptions = {
      sheet: { width: 1000, height: 1000, margin: 0 },
      gap: 20,
      rotationStep: 0, // no rotation
      allowMirror: false,
      sortStrategy: 'area-desc',
    };
    const pieces = [
      makePiece('a', makeRect(0, 0, 100, 100)),
      makePiece('b', makeRect(0, 0, 100, 100)),
    ];
    const result = nestPieces(pieces, opts);

    expect(result.placements).toHaveLength(2);
    const [p1, p2] = result.placements;
    // They're same size so one should be placed after the other
    // Either horizontally or vertically separated by at least gap
    if (Math.abs(p1.x - p2.x) < 1) {
      // Stacked vertically
      const topOfFirst = p1.y + 100;
      expect(p2.y).toBeGreaterThanOrEqual(topOfFirst + 20 - 1);
    } else {
      // Side by side — x gap
      const rightOfFirst = p1.x + 100;
      expect(p2.x).toBeGreaterThanOrEqual(rightOfFirst);
    }
  });

  it('8. Utilization — correct ratio calculation', () => {
    const opts: NestingOptions = {
      sheet: { width: 100, height: 100, margin: 0 },
      gap: 0,
      rotationStep: 0,
      allowMirror: false,
      sortStrategy: 'area-desc',
    };
    // Single piece 50x50 = 2500 area, sheet = 10000
    const piece = makePiece('a', makeRect(0, 0, 50, 50));
    const result = nestPieces([piece], opts);

    expect(result.utilization).toBeCloseTo(0.25, 2);
  });

  it('9. Empty input — returns empty result', () => {
    const result = nestPieces([], defaultOptions);

    expect(result.placements).toHaveLength(0);
    expect(result.sheetsUsed).toBe(0);
    expect(result.utilization).toBe(0);
    expect(result.unplaced).toHaveLength(0);
  });

  it('10. Mirror — when allowMirror=true, mirrored placement possible', () => {
    const opts: NestingOptions = {
      ...defaultOptions,
      allowMirror: true,
    };
    const piece = makePiece('a', makeRect(0, 0, 100, 50));
    const result = nestPieces([piece], opts);

    expect(result.placements).toHaveLength(1);
    // It should place successfully (mirrored or not)
    expect(result.unplaced).toHaveLength(0);
  });

  it('11. Skyline update — segments are correct after placement', () => {
    const skyline: SkylineSegment[] = [{ x: 0, width: 100, y: 0 }];
    const updated = updateSkyline(skyline, 0, 40, 50);

    // Should have two segments: [0,40] at y=50 and [40,60] at y=0
    expect(updated).toHaveLength(2);
    const left = updated.find(s => s.x === 0)!;
    const right = updated.find(s => s.x === 40)!;
    expect(left.y).toBe(50);
    expect(left.width).toBe(40);
    expect(right.y).toBe(0);
    expect(right.width).toBe(60);
  });

  it('computeArea — returns correct area for rectangle', () => {
    const outline = makeRect(0, 0, 100, 50);
    const area = computeArea(outline);
    expect(area).toBeCloseTo(5000, 0);
  });

  it('computeBBox — returns correct bounding box', () => {
    const points = flattenPath(makeRect(10, 20, 100, 50));
    const bbox = computeBBox(points);
    expect(bbox.minX).toBe(10);
    expect(bbox.minY).toBe(20);
    expect(bbox.width).toBeCloseTo(100, 0);
    expect(bbox.height).toBeCloseTo(50, 0);
  });

  it('findBestPosition — returns null when piece does not fit', () => {
    const skyline: SkylineSegment[] = [{ x: 0, width: 50, y: 0 }];
    const pos = findBestPosition(skyline, 100, 100, 50, 50, 0, 0);
    expect(pos).toBeNull();
  });
});
