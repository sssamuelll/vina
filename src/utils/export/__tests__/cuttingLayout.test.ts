import { describe, it, expect } from 'vitest';
import {
  PAPER_SIZES,
  computeCuttingLayout,
  tileToA4,
  DEFAULT_CONFIG,
} from '../cuttingLayout';
import type { CuttingLayoutConfig, LayoutResult, LayoutPage } from '../cuttingLayout';
import type { PatternPiece } from '../../../types/types';

// ─── Helpers ───

function makePiece(id: string, w: number, h: number, sa = 0): PatternPiece {
  return {
    id,
    name: `Piece ${id}`,
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [w, 0] },
      { type: 'L', values: [w, h] },
      { type: 'L', values: [0, h] },
      { type: 'Z', values: [] },
    ],
    internals: [],
    position: { x: 0, y: 0 },
    rotation: 0,
    mirrored: false,
    seamAllowance: sa,
    layer: 1,
    sublayer: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function makeConfig(overrides: Partial<CuttingLayoutConfig> = {}): CuttingLayoutConfig {
  return { ...DEFAULT_CONFIG, ...overrides };
}

// ─── Tests ───

describe('PAPER_SIZES', () => {
  it('has correct A0 dimensions', () => {
    expect(PAPER_SIZES.A0).toEqual({ width: 841, height: 1189 });
  });

  it('has correct A1 dimensions', () => {
    expect(PAPER_SIZES.A1).toEqual({ width: 594, height: 841 });
  });

  it('has correct A4 dimensions', () => {
    expect(PAPER_SIZES.A4).toEqual({ width: 210, height: 297 });
  });

  it('CUSTOM is null', () => {
    expect(PAPER_SIZES.CUSTOM).toBeNull();
  });
});

describe('computeCuttingLayout', () => {
  it('returns empty result for no pieces', () => {
    const result = computeCuttingLayout([], [], makeConfig());
    expect(result.pages).toHaveLength(0);
    expect(result.fabricUtilization).toBe(0);
    expect(result.totalPieceArea).toBe(0);
  });

  it('places a single piece on one page', () => {
    const piece = makePiece('p1', 200, 300);
    const result = computeCuttingLayout([piece], [], makeConfig());

    expect(result.pages.length).toBeGreaterThanOrEqual(1);
    expect(result.pages[0].pieces).toHaveLength(1);
    expect(result.pages[0].pieces[0].pieceId).toBe('p1');
    expect(result.pages[0].pieces[0].pieceName).toBe('Piece p1');
  });

  it('places multiple pieces with nesting', () => {
    const pieces = [
      makePiece('p1', 200, 300),
      makePiece('p2', 150, 200),
      makePiece('p3', 100, 150),
    ];
    const result = computeCuttingLayout(pieces, [], makeConfig());

    const totalPlaced = result.pages.reduce((sum, p) => sum + p.pieces.length, 0);
    expect(totalPlaced).toBe(3);
  });

  it('computes fabric utilization > 0', () => {
    const piece = makePiece('p1', 200, 300);
    const result = computeCuttingLayout([piece], [], makeConfig());

    expect(result.fabricUtilization).toBeGreaterThan(0);
    expect(result.fabricUtilization).toBeLessThanOrEqual(1);
    expect(result.totalPieceArea).toBeGreaterThan(0);
    expect(result.totalFabricArea).toBeGreaterThan(0);
  });

  it('includes seam allowance when configured', () => {
    const piece = makePiece('p1', 200, 300, 10);
    const result = computeCuttingLayout([piece], [], makeConfig({ includeSeamAllowance: true }));

    const placed = result.pages[0].pieces[0];
    expect(placed.seamAllowance).toBeDefined();
    expect(placed.seamAllowance!.length).toBeGreaterThan(0);
  });

  it('omits seam allowance when disabled', () => {
    const piece = makePiece('p1', 200, 300, 10);
    const result = computeCuttingLayout([piece], [], makeConfig({ includeSeamAllowance: false }));

    const placed = result.pages[0].pieces[0];
    expect(placed.seamAllowance).toBeUndefined();
  });

  it('seam allowance outline is larger than base outline', () => {
    const piece = makePiece('p1', 200, 300, 10);
    const result = computeCuttingLayout([piece], [], makeConfig({ includeSeamAllowance: true }));

    const placed = result.pages[0].pieces[0];
    if (placed.seamAllowance && placed.seamAllowance.length >= 4) {
      // SA bounding box should be wider than base outline
      let saMinX = Infinity, saMaxX = -Infinity;
      for (let i = 0; i < placed.seamAllowance.length; i += 2) {
        saMinX = Math.min(saMinX, placed.seamAllowance[i]);
        saMaxX = Math.max(saMaxX, placed.seamAllowance[i]);
      }
      let outMinX = Infinity, outMaxX = -Infinity;
      for (let i = 0; i < placed.outline.length; i += 2) {
        outMinX = Math.min(outMinX, placed.outline[i]);
        outMaxX = Math.max(outMaxX, placed.outline[i]);
      }
      expect(saMaxX - saMinX).toBeGreaterThan(outMaxX - outMinX);
    }
  });

  it('scale factor affects output dimensions', () => {
    const piece = makePiece('p1', 200, 300);
    const result1 = computeCuttingLayout([piece], [], makeConfig({ scale: 1.0 }));
    const result05 = computeCuttingLayout([piece], [], makeConfig({ scale: 0.5 }));

    // At scale 0.5, the outline coords should be roughly half
    const outline1 = result1.pages[0].pieces[0].outline;
    const outline05 = result05.pages[0].pieces[0].outline;

    // Compute widths
    let max1 = -Infinity, min1 = Infinity;
    for (let i = 0; i < outline1.length; i += 2) {
      max1 = Math.max(max1, outline1[i]);
      min1 = Math.min(min1, outline1[i]);
    }
    let max05 = -Infinity, min05 = Infinity;
    for (let i = 0; i < outline05.length; i += 2) {
      max05 = Math.max(max05, outline05[i]);
      min05 = Math.min(min05, outline05[i]);
    }

    const width1 = max1 - min1;
    const width05 = max05 - min05;
    expect(width05).toBeCloseTo(width1 * 0.5, 0);
  });

  it('pages have correct paper dimensions', () => {
    const piece = makePiece('p1', 200, 300);
    const result = computeCuttingLayout([piece], [], makeConfig({ paperSize: 'A1' }));

    expect(result.pages[0].width).toBe(594);
    expect(result.pages[0].height).toBe(841);
  });
});

describe('A4 tiling', () => {
  it('splits A0 into correct number of A4 tiles', () => {
    // A0: 841 x 1189, A4: 210 x 297, overlap 10
    // effective A4: 200 x 287
    // cols = ceil(841/200) = 5, rows = ceil(1189/287) = 5 → ~25 tiles
    const page: LayoutPage = {
      pageNumber: 1,
      width: 841,
      height: 1189,
      pieces: [],
    };
    const layout: LayoutResult = {
      pages: [page],
      fabricUtilization: 0.5,
      totalFabricArea: 841 * 1189,
      totalPieceArea: 841 * 1189 * 0.5,
    };

    const config = makeConfig({ paperSize: 'A0', tileToA4: true });
    const tiled = tileToA4(layout, config);

    const effectiveW = 210 - 10;
    const effectiveH = 297 - 10;
    const expectedCols = Math.ceil(841 / effectiveW);
    const expectedRows = Math.ceil(1189 / effectiveH);

    expect(tiled.pages).toHaveLength(expectedCols * expectedRows);
  });

  it('tiled pages have A4 dimensions', () => {
    const page: LayoutPage = {
      pageNumber: 1,
      width: 594,
      height: 841,
      pieces: [],
    };
    const layout: LayoutResult = {
      pages: [page],
      fabricUtilization: 0,
      totalFabricArea: 0,
      totalPieceArea: 0,
    };

    const tiled = tileToA4(layout, makeConfig({ paperSize: 'A1', tileToA4: true }));

    for (const tp of tiled.pages) {
      expect(tp.width).toBe(210);
      expect(tp.height).toBe(297);
    }
  });

  it('tiles have row/col coordinates', () => {
    const page: LayoutPage = {
      pageNumber: 1,
      width: 420,
      height: 594,
      pieces: [],
    };
    const layout: LayoutResult = {
      pages: [page],
      fabricUtilization: 0,
      totalFabricArea: 0,
      totalPieceArea: 0,
    };

    const tiled = tileToA4(layout, makeConfig({ tileToA4: true }));

    for (const tp of tiled.pages) {
      expect(tp.tileRow).toBeDefined();
      expect(tp.tileCol).toBeDefined();
      expect(typeof tp.tileRow).toBe('number');
      expect(typeof tp.tileCol).toBe('number');
    }
  });

  it('computeCuttingLayout with tileToA4 produces A4 pages', () => {
    const piece = makePiece('p1', 200, 300);
    const result = computeCuttingLayout([piece], [], makeConfig({
      paperSize: 'A0',
      tileToA4: true,
    }));

    expect(result.pages.length).toBeGreaterThan(1);
    for (const page of result.pages) {
      expect(page.width).toBe(210);
      expect(page.height).toBe(297);
    }
  });
});
