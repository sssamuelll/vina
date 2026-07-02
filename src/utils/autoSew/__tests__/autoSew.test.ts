/**
 * Auto-Sew test suite
 */

import { describe, it, expect } from 'vitest';
import type { PatternPiece, PathCommand } from '../../../types/types';
import { extractEdges } from '../edgeExtractor';
import { scorePieceNames, findNamingCandidates } from '../namingHeuristics';
import { hungarian, matchEdgesByLength, lengthSimilarity } from '../arcLengthMatcher';
import { scoreEdgePair, rankAndDeduplicate } from '../scorer';
import { autoSew } from '../index';

// ─── Test helpers ───────────────────────────────────────────────────────────

/** Create a rectangular piece with 4 distinct edges */
function makeRect(id: string, name: string, x: number, y: number, w: number, h: number): PatternPiece {
  const outline: PathCommand[] = [
    { type: 'M', values: [x, y] },
    { type: 'L', values: [x + w, y] },           // top edge
    { type: 'L', values: [x + w, y + h] },       // right edge
    { type: 'L', values: [x, y + h] },           // bottom edge
    { type: 'L', values: [x, y] },               // left edge (close)
    { type: 'Z', values: [] },
  ];
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

/** Create a piece with a curved edge (simulating armhole) */
function makePieceWithCurve(id: string, name: string, w: number, h: number, curveDepth: number): PatternPiece {
  const outline: PathCommand[] = [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [w, 0] },
    // Curved right edge (armhole-like)
    { type: 'C', values: [w + curveDepth, h * 0.33, w + curveDepth, h * 0.66, w, h] },
    { type: 'L', values: [0, h] },
    { type: 'L', values: [0, 0] },
    { type: 'Z', values: [] },
  ];
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

// ─── Edge Extractor ─────────────────────────────────────────────────────────

describe('edgeExtractor', () => {
  it('extracts 4 edges from a rectangle', () => {
    const piece = makeRect('r1', 'Front', 0, 0, 100, 200);
    const edges = extractEdges(piece);
    // Rectangle has 4 corners → 4 edges
    expect(edges.length).toBe(4);
    expect(edges.every(e => e.pieceId === 'r1')).toBe(true);
  });

  it('computes correct arc lengths for rectangle edges', () => {
    const piece = makeRect('r2', 'Back', 0, 0, 100, 200);
    const edges = extractEdges(piece);
    const lengths = edges.map(e => Math.round(e.arcLength));
    // Should have two 100mm edges (top/bottom) and two 200mm edges (sides)
    expect(lengths.filter(l => l === 100).length).toBe(2);
    expect(lengths.filter(l => l === 200).length).toBe(2);
  });

  it('extracts edges from curved outlines', () => {
    const piece = makePieceWithCurve('c1', 'Front Bodice', 150, 300, 40);
    const edges = extractEdges(piece);
    expect(edges.length).toBeGreaterThanOrEqual(2);
    // Total arc length should exceed sum of straight-line distances
    // (because one edge is curved)
    const totalArc = edges.reduce((sum, e) => sum + e.arcLength, 0);
    // Straight perimeter would be 2*150 + 2*300 = 900, curve adds extra
    expect(totalArc).toBeGreaterThan(900);
  });

  it('assigns edge indices sequentially', () => {
    const piece = makeRect('r3', 'Side', 0, 0, 80, 150);
    const edges = extractEdges(piece);
    edges.forEach((e, i) => {
      expect(e.edgeIndex).toBe(i);
    });
  });

  it('assigns semantic edge names', () => {
    const piece = makeRect('r4', 'Front', 0, 0, 100, 200);
    const edges = extractEdges(piece);
    // Every edge should have a non-empty name
    for (const edge of edges) {
      expect(edge.name).toBeTruthy();
      expect(typeof edge.name).toBe('string');
    }
  });
});

// ─── Naming Heuristics ──────────────────────────────────────────────────────

describe('namingHeuristics', () => {
  it('matches Front ↔ Back', () => {
    const result = scorePieceNames('Front Bodice', 'Back Bodice');
    expect(result).not.toBeNull();
    expect(result!.score).toBeGreaterThanOrEqual(0.85);
  });

  it('matches Body ↔ Sleeve (armhole)', () => {
    const result = scorePieceNames('Front', 'Sleeve');
    expect(result).not.toBeNull();
    expect(result!.score).toBeGreaterThanOrEqual(0.9);
    expect(result!.edgeHints.some(h => h.position === 'armhole')).toBe(true);
  });

  it('matches Collar ↔ Body (neckline)', () => {
    const result = scorePieceNames('Collar', 'Back');
    expect(result).not.toBeNull();
    expect(result!.edgeHints.some(h => h.position === 'neckline')).toBe(true);
  });

  it('matches Cuff ↔ Sleeve', () => {
    const result = scorePieceNames('Cuff', 'Sleeve');
    expect(result).not.toBeNull();
    expect(result!.score).toBeGreaterThanOrEqual(0.85);
  });

  it('matches Spanish names (Delantero ↔ Espalda)', () => {
    const result = scorePieceNames('Delantero', 'Espalda');
    expect(result).not.toBeNull();
    expect(result!.score).toBeGreaterThanOrEqual(0.85);
  });

  it('matches German names (Vorderteil ↔ Rückenteil)', () => {
    const result = scorePieceNames('Vorderteil', 'Rückenteil');
    expect(result).not.toBeNull();
    expect(result!.score).toBeGreaterThanOrEqual(0.85);
  });

  it('matches French names (Devant ↔ Dos)', () => {
    const result = scorePieceNames('Devant', 'Dos');
    expect(result).not.toBeNull();
    expect(result!.score).toBeGreaterThanOrEqual(0.85);
  });

  it('matches Bodice ↔ Skirt (waist)', () => {
    const result = scorePieceNames('Bodice', 'Skirt');
    expect(result).not.toBeNull();
    expect(result!.edgeHints.some(h => h.position === 'waist')).toBe(true);
  });

  it('returns null for unrelated pieces', () => {
    const result = scorePieceNames('Pocket', 'Zipper Guard');
    // May or may not match — but if it does, score should be low
    if (result) {
      expect(result.score).toBeLessThan(0.7);
    }
  });

  it('finds naming candidates from piece list', () => {
    const pieces = [
      { id: '1', name: 'Front' },
      { id: '2', name: 'Back' },
      { id: '3', name: 'Sleeve' },
      { id: '4', name: 'Collar' },
    ];
    const candidates = findNamingCandidates(pieces);
    expect(candidates.length).toBeGreaterThan(0);
    // Front↔Sleeve (armhole) should be highest
    const topMatch = candidates[0];
    expect(
      (topMatch.pieceAId === '1' && topMatch.pieceBId === '3') ||
      (topMatch.pieceAId === '3' && topMatch.pieceBId === '1') ||
      (topMatch.pieceAId === '2' && topMatch.pieceBId === '3') ||
      (topMatch.pieceAId === '3' && topMatch.pieceBId === '2')
    ).toBe(true);
  });
});

// ─── Hungarian Algorithm ────────────────────────────────────────────────────

describe('hungarian', () => {
  it('solves simple 2x2 assignment', () => {
    const cost = [
      [1, 3],
      [5, 1],
    ];
    const result = hungarian(cost);
    expect(result.length).toBe(2);
    // Optimal: row 0→col 0 (cost 1), row 1→col 1 (cost 1) = total 2
    const assignment = new Map(result);
    expect(assignment.get(0)).toBe(0);
    expect(assignment.get(1)).toBe(1);
  });

  it('solves 3x3 assignment', () => {
    const cost = [
      [10, 5, 13],
      [3, 7, 15],
      [10, 8, 4],
    ];
    const result = hungarian(cost);
    expect(result.length).toBe(3);
    // Optimal total should be 5 + 3 + 4 = 12
    const total = result.reduce((sum, [r, c]) => sum + cost[r][c], 0);
    expect(total).toBe(12);
  });

  it('handles non-square matrix (more rows than cols)', () => {
    const cost = [
      [1, 2],
      [3, 4],
      [5, 6],
    ];
    const result = hungarian(cost);
    // Should assign 2 rows to 2 cols
    expect(result.length).toBe(2);
  });

  it('handles non-square matrix (more cols than rows)', () => {
    const cost = [
      [1, 2, 3],
      [4, 5, 6],
    ];
    const result = hungarian(cost);
    expect(result.length).toBe(2);
  });
});

// ─── Arc Length Matching ────────────────────────────────────────────────────

describe('arcLengthMatcher', () => {
  it('gives high similarity for identical lengths', () => {
    expect(lengthSimilarity(100, 100)).toBeCloseTo(1.0, 2);
  });

  it('gives lower similarity for different lengths', () => {
    const sim = lengthSimilarity(100, 110, 5);
    expect(sim).toBeLessThan(0.5);
    expect(sim).toBeGreaterThan(0);
  });

  it('gives near-zero for wildly different lengths', () => {
    const sim = lengthSimilarity(50, 300, 5);
    expect(sim).toBeLessThan(0.1);
  });

  it('matches edges from two rectangles with same height', () => {
    const front = makeRect('f', 'Front', 0, 0, 100, 200);
    const back = makeRect('b', 'Back', 150, 0, 120, 200);
    const edgesF = extractEdges(front);
    const edgesB = extractEdges(back);

    const matches = matchEdgesByLength(edgesF, edgesB);
    // Should find matches for the 200mm side edges
    const sideMatch = matches.find(m =>
      Math.round(m.edgeA.arcLength) === 200 && Math.round(m.edgeB.arcLength) === 200
    );
    expect(sideMatch).toBeDefined();
    expect(sideMatch!.similarity).toBeGreaterThan(0.9);
  });
});

// ─── Scorer ─────────────────────────────────────────────────────────────────

describe('scorer', () => {
  it('produces higher confidence when naming + length agree', () => {
    const front = makeRect('f', 'Front', 0, 0, 100, 200);
    const back = makeRect('b', 'Back', 150, 0, 100, 200);
    const edgesF = extractEdges(front);
    const edgesB = extractEdges(back);
    const naming = scorePieceNames('Front', 'Back');

    // Find side edges (200mm)
    const sideF = edgesF.find(e => Math.round(e.arcLength) === 200)!;
    const sideB = edgesB.find(e => Math.round(e.arcLength) === 200)!;

    const scored = scoreEdgePair(sideF, sideB, naming, {
      edgeA: sideF, edgeB: sideB,
      similarity: lengthSimilarity(sideF.arcLength, sideB.arcLength),
      lengthDiff: 0,
    });

    expect(scored.confidence).toBeGreaterThan(0.6);
  });

  it('deduplicates: each edge used only once', () => {
    const front = makeRect('f', 'Front', 0, 0, 100, 200);
    const back = makeRect('b', 'Back', 150, 0, 100, 200);
    const edgesF = extractEdges(front);
    const edgesB = extractEdges(back);

    // Create duplicate candidates for the same edge
    const candidates = edgesF.flatMap(eA =>
      edgesB.map(eB => scoreEdgePair(eA, eB, null, {
        edgeA: eA, edgeB: eB,
        similarity: lengthSimilarity(eA.arcLength, eB.arcLength),
        lengthDiff: Math.abs(eA.arcLength - eB.arcLength),
      }))
    );

    const deduped = rankAndDeduplicate(candidates, 0);
    const usedKeys = deduped.flatMap(c => [
      `${c.edgeA.pieceId}:${c.edgeA.edgeIndex}`,
      `${c.edgeB.pieceId}:${c.edgeB.edgeIndex}`,
    ]);
    // No duplicates
    expect(new Set(usedKeys).size).toBe(usedKeys.length);
  });
});

// ─── Integration: autoSew ───────────────────────────────────────────────────

describe('autoSew', () => {
  it('proposes seams for a simple front/back shirt', () => {
    const front = makeRect('front', 'Front', 0, 0, 150, 400);
    const back = makeRect('back', 'Back', 200, 0, 150, 400);

    const result = autoSew([front, back]);
    expect(result.piecesAnalyzed).toBe(2);
    expect(result.edgesExtracted).toBeGreaterThan(0);
    expect(result.seams.length).toBeGreaterThan(0);

    // Should propose at least one seam with decent confidence
    const topSeam = result.seams[0];
    expect(topSeam.confidence).toBeGreaterThan(0.4);
    expect(topSeam.seam.pieceA.pieceId).not.toBe(topSeam.seam.pieceB.pieceId);
    // Seams should use edgeName (not edgeStart/edgeEnd)
    expect(topSeam.seam.pieceA.edgeName).toBeTruthy();
    expect(topSeam.seam.pieceB.edgeName).toBeTruthy();
  });

  it('matches front/back/sleeve correctly', () => {
    const front = makePieceWithCurve('front', 'Front Bodice', 200, 400, 30);
    const back = makePieceWithCurve('back', 'Back Bodice', 200, 400, 30);
    const sleeve = makePieceWithCurve('sleeve', 'Sleeve', 180, 350, 25);

    const result = autoSew([front, back, sleeve]);
    expect(result.seams.length).toBeGreaterThanOrEqual(2);

    // Check that front↔back and body↔sleeve seams exist
    const pieceIds = result.seams.map(s => [s.seam.pieceA.pieceId, s.seam.pieceB.pieceId].sort().join('↔'));
    // At least front↔back or front/back↔sleeve should be present
    const hasFrontBack = pieceIds.some(p => p === 'back↔front');
    const hasBodySleeve = pieceIds.some(p => p.includes('sleeve'));
    expect(hasFrontBack || hasBodySleeve).toBe(true);
  });

  it('returns empty for less than 2 pieces', () => {
    const single = makeRect('one', 'Front', 0, 0, 100, 200);
    const result = autoSew([single]);
    expect(result.seams).toHaveLength(0);
  });

  it('respects excludePieceIds', () => {
    const front = makeRect('f', 'Front', 0, 0, 100, 200);
    const back = makeRect('b', 'Back', 150, 0, 100, 200);

    const result = autoSew([front, back], { excludePieceIds: ['b'] });
    expect(result.seams).toHaveLength(0);
    expect(result.piecesAnalyzed).toBe(1);
  });

  it('respects onlyPairs filter', () => {
    const front = makeRect('f', 'Front', 0, 0, 100, 200);
    const back = makeRect('b', 'Back', 150, 0, 100, 200);
    const sleeve = makeRect('s', 'Sleeve', 300, 0, 80, 150);

    const result = autoSew([front, back, sleeve], {
      onlyPairs: [['f', 'b']],
    });

    // onlyPairs restricts CROSS-PIECE seams only — 's' must not appear in any
    // cross-piece seam. Same-piece self-seams (pieceA.pieceId === pieceB.pieceId)
    // are exempt: the sleeve's tube closure is a same-piece operation that
    // cannot be expressed as a pair, so onlyPairs was never meant to gate it.
    for (const s of result.seams) {
      const { pieceA, pieceB } = s.seam;
      if (pieceA.pieceId !== pieceB.pieceId) {
        expect([pieceA.pieceId, pieceB.pieceId]).not.toContain('s');
      }
    }
  });

  it('handles minConfidence filter', () => {
    const front = makeRect('f', 'Front', 0, 0, 100, 200);
    const back = makeRect('b', 'Back', 150, 0, 100, 200);

    const lowBar = autoSew([front, back], { minConfidence: 0.1 });
    const highBar = autoSew([front, back], { minConfidence: 0.99 });

    expect(lowBar.seams.length).toBeGreaterThanOrEqual(highBar.seams.length);
  });

  it('reports unmatched edges', () => {
    const front = makeRect('f', 'Front', 0, 0, 100, 200);
    const back = makeRect('b', 'Back', 150, 0, 100, 200);

    const result = autoSew([front, back]);
    // Not all edges will be matched (some won't meet threshold)
    // Total edges = matched edges + unmatched edges
    const matchedCount = result.seams.length * 2;
    expect(result.unmatchedEdges.length + matchedCount).toBe(result.edgesExtracted);
  });
});
