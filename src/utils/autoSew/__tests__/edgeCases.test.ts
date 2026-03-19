/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * Auto-Sew edge case tests — tricky inputs, multilingual naming,
 * degenerate geometry, and full pipeline integration.
 */

import { describe, it, expect } from 'vitest';
import type { PatternPiece, PathCommand } from '../../../types/types';
import { extractEdges } from '../edgeExtractor';
import { scorePieceNames } from '../namingHeuristics';
import { hungarian, lengthSimilarity } from '../arcLengthMatcher';
import { autoSew } from '../index';

function makePiece(id: string, name: string, outline: PathCommand[]): PatternPiece {
  return {
    id, name, outline,
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
  };
}

function rect(x: number, y: number, w: number, h: number): PathCommand[] {
  return [
    { type: 'M', values: [x, y] },
    { type: 'L', values: [x + w, y] },
    { type: 'L', values: [x + w, y + h] },
    { type: 'L', values: [x, y + h] },
    { type: 'L', values: [x, y] },
    { type: 'Z', values: [] },
  ];
}

// ─── Edge extraction edge cases ─────────────────────────────────────────────

describe('edgeExtractor edge cases', () => {
  it('handles empty outline', () => {
    const piece = makePiece('e1', 'Empty', []);
    const edges = extractEdges(piece);
    expect(edges).toHaveLength(0);
  });

  it('handles outline with only M command', () => {
    const piece = makePiece('e2', 'Point', [{ type: 'M', values: [10, 20] }]);
    const edges = extractEdges(piece);
    expect(edges).toHaveLength(0);
  });

  it('handles single line segment', () => {
    const piece = makePiece('e3', 'Line', [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
    ]);
    const edges = extractEdges(piece);
    expect(edges.length).toBeGreaterThanOrEqual(1);
    expect(edges[0].arcLength).toBeCloseTo(100, 0);
  });

  it('handles triangle (3 corners)', () => {
    const piece = makePiece('t1', 'Triangle', [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [50, 86.6] },
      { type: 'L', values: [0, 0] },
      { type: 'Z', values: [] },
    ]);
    const edges = extractEdges(piece);
    expect(edges.length).toBe(3);
  });

  it('handles zero-length segment gracefully', () => {
    const piece = makePiece('z1', 'Degenerate', [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [0, 0] }, // zero length
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 100] },
      { type: 'L', values: [0, 0] },
      { type: 'Z', values: [] },
    ]);
    const edges = extractEdges(piece);
    // Should not crash
    expect(edges.length).toBeGreaterThanOrEqual(1);
  });

  it('handles all-curves outline', () => {
    const piece = makePiece('c1', 'AllCurves', [
      { type: 'M', values: [0, 0] },
      { type: 'C', values: [50, -30, 100, -30, 150, 0] },
      { type: 'C', values: [180, 50, 180, 100, 150, 150] },
      { type: 'C', values: [100, 180, 50, 180, 0, 150] },
      { type: 'C', values: [-30, 100, -30, 50, 0, 0] },
      { type: 'Z', values: [] },
    ]);
    const edges = extractEdges(piece);
    expect(edges.length).toBeGreaterThanOrEqual(1);
    // Total perimeter should be reasonable
    const total = edges.reduce((s, e) => s + e.arcLength, 0);
    expect(total).toBeGreaterThan(400);
  });

  it('edge normals are unit vectors', () => {
    const piece = makePiece('n1', 'Rect', rect(0, 0, 100, 200));
    const edges = extractEdges(piece);
    for (const edge of edges) {
      const mag = Math.sqrt(edge.normal.x ** 2 + edge.normal.y ** 2);
      expect(mag).toBeCloseTo(1.0, 1);
    }
  });
});

// ─── Naming heuristics edge cases ───────────────────────────────────────────

describe('namingHeuristics edge cases', () => {
  it('handles empty names', () => {
    const result = scorePieceNames('', '');
    expect(result).toBeNull();
  });

  it('handles numeric-only names', () => {
    const result = scorePieceNames('Piece 1', 'Piece 2');
    expect(result).toBeNull();
  });

  it('matches Italian names (Davanti ↔ Dietro)', () => {
    const result = scorePieceNames('Davanti', 'Dietro');
    expect(result).not.toBeNull();
    expect(result!.score).toBeGreaterThanOrEqual(0.85);
  });

  it('matches mixed-case names', () => {
    const result = scorePieceNames('FRONT BODICE', 'back bodice');
    expect(result).not.toBeNull();
  });

  it('matches names with underscores and dashes', () => {
    const result = scorePieceNames('front-bodice', 'back_bodice');
    expect(result).not.toBeNull();
  });

  it('matches left/right pair', () => {
    const result = scorePieceNames('Front Left', 'Front Right');
    expect(result).not.toBeNull();
    expect(result!.edgeHints.some(h => h.position === 'center')).toBe(true);
  });

  it('matches izquierdo/derecho pair', () => {
    const result = scorePieceNames('Manga Izquierdo', 'Manga Derecho');
    expect(result).not.toBeNull();
  });

  it('trouser front↔back matches', () => {
    const result = scorePieceNames('Trouser Front', 'Trouser Back');
    expect(result).not.toBeNull();
    expect(result!.score).toBeGreaterThanOrEqual(0.85);
  });

  it('yoke ↔ body match', () => {
    const result = scorePieceNames('Back Yoke', 'Back');
    expect(result).not.toBeNull();
  });

  it('facing ↔ body match', () => {
    const result = scorePieceNames('Front Facing', 'Front');
    expect(result).not.toBeNull();
  });

  it('lining ↔ shell match with shared base name', () => {
    const result = scorePieceNames('Sleeve Lining', 'Sleeve');
    expect(result).not.toBeNull();
  });
});

// ─── Hungarian edge cases ───────────────────────────────────────────────────

describe('hungarian edge cases', () => {
  it('handles 1x1 matrix', () => {
    const result = hungarian([[5]]);
    expect(result).toEqual([[0, 0]]);
  });

  it('handles empty matrix', () => {
    const result = hungarian([]);
    expect(result).toEqual([]);
  });

  it('handles matrix with identical costs', () => {
    const result = hungarian([
      [1, 1, 1],
      [1, 1, 1],
      [1, 1, 1],
    ]);
    expect(result.length).toBe(3);
    // Each row assigned to unique column
    const cols = result.map(([_, c]) => c);
    expect(new Set(cols).size).toBe(3);
  });

  it('handles large cost differences', () => {
    const result = hungarian([
      [0, 1000000],
      [1000000, 0],
    ]);
    const assignment = new Map(result);
    expect(assignment.get(0)).toBe(0);
    expect(assignment.get(1)).toBe(1);
  });
});

// ─── Length similarity edge cases ───────────────────────────────────────────

describe('lengthSimilarity edge cases', () => {
  it('zero-length edges', () => {
    const sim = lengthSimilarity(0, 0);
    expect(sim).toBe(1.0);
  });

  it('one zero-length edge', () => {
    const sim = lengthSimilarity(0, 100);
    expect(sim).toBeLessThan(0.1);
  });

  it('very close lengths get high score', () => {
    const sim = lengthSimilarity(200, 201, 5);
    expect(sim).toBeGreaterThan(0.95);
  });

  it('is symmetric', () => {
    expect(lengthSimilarity(100, 200)).toBeCloseTo(lengthSimilarity(200, 100), 10);
  });
});

// ─── Full pipeline edge cases ───────────────────────────────────────────────

describe('autoSew pipeline edge cases', () => {
  it('handles pieces with identical outlines', () => {
    const a = makePiece('a', 'Front', rect(0, 0, 100, 200));
    const b = makePiece('b', 'Back', rect(0, 0, 100, 200));
    const result = autoSew([a, b]);
    // Should find matches (identical edge lengths)
    expect(result.seams.length).toBeGreaterThan(0);
  });

  it('handles pieces with very different sizes', () => {
    const big = makePiece('big', 'Front', rect(0, 0, 500, 800));
    const small = makePiece('small', 'Back', rect(0, 0, 50, 80));
    const result = autoSew([big, small]);
    // Low confidence matches due to size mismatch
    const highConf = result.seams.filter(s => s.confidence > 0.8);
    expect(highConf.length).toBe(0);
  });

  it('handles 5+ pieces', () => {
    const pieces = [
      makePiece('f', 'Front', rect(0, 0, 200, 400)),
      makePiece('b', 'Back', rect(250, 0, 200, 400)),
      makePiece('s', 'Sleeve', rect(500, 0, 150, 300)),
      makePiece('c', 'Collar', rect(700, 0, 100, 50)),
      makePiece('cu', 'Cuff', rect(850, 0, 80, 40)),
    ];
    const result = autoSew(pieces);
    expect(result.piecesAnalyzed).toBe(5);
    expect(result.seams.length).toBeGreaterThan(0);
    // Body↔Sleeve should appear
    const hasSleeve = result.seams.some(s =>
      s.seam.pieceA.pieceId === 's' || s.seam.pieceB.pieceId === 's'
    );
    expect(hasSleeve).toBe(true);
  });

  it('custom weights emphasize naming over length', () => {
    const a = makePiece('a', 'Front', rect(0, 0, 100, 200));
    const b = makePiece('b', 'Back', rect(0, 0, 150, 300)); // different dimensions
    const result = autoSew([a, b], {
      weights: { naming: 0.8, length: 0.1, proximity: 0.05, edgePosition: 0.05 },
      minConfidence: 0.3,
    });
    // Should still propose seams due to high naming weight
    expect(result.seams.length).toBeGreaterThan(0);
  });
});
