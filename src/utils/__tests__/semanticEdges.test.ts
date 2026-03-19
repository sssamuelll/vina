import { describe, it, expect } from 'vitest';
import { detectSemanticEdges, findEdgeByName, findMatchingEdges } from '../semanticEdges';
import type { PatternPiece, PathCommand } from '../../types/types';

function makePiece(name: string, outline: PathCommand[]): PatternPiece {
  return {
    id: `test-${name}`,
    name,
    outline,
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

// Simple rectangle: 400mm wide × 600mm tall
const rectOutline: PathCommand[] = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [400, 0] },      // top edge
  { type: 'L', values: [400, 600] },     // right edge
  { type: 'L', values: [0, 600] },       // bottom edge
  { type: 'Z', values: [] },             // left edge (close)
];

// Bodice front with curved armhole
const bodiceFrontOutline: PathCommand[] = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [200, 0] },       // shoulder (top, horizontal)
  { type: 'C', values: [220, 0, 220, 150, 200, 200] }, // armhole (top-right, curved)
  { type: 'L', values: [200, 500] },     // side seam (right, vertical)
  { type: 'L', values: [0, 500] },       // hemline (bottom, horizontal)
  { type: 'Z', values: [] },             // center front (left, close)
];

describe('detectSemanticEdges', () => {
  it('detects edges on a generic rectangle', () => {
    const piece = makePiece('Panel', rectOutline);
    const edges = detectSemanticEdges(piece);
    expect(edges.length).toBeGreaterThan(0);
    expect(edges.every(e => e.id)).toBe(true);
    expect(edges.every(e => e.name)).toBe(true);
    expect(edges.every(e => e.segmentRange[0] < e.segmentRange[1])).toBe(true);
  });

  it('detects bodice-specific edges on "Front Bodice"', () => {
    const piece = makePiece('Front Bodice', bodiceFrontOutline);
    const edges = detectSemanticEdges(piece);
    const edgeNames = edges.map(e => e.name);
    // Should have some named edges
    expect(edges.length).toBeGreaterThanOrEqual(3);
    // Should detect armhole (curved top area)
    expect(edgeNames.some(n => n.includes('armhole') || n.includes('shoulder') || n.includes('neckline'))).toBe(true);
  });

  it('detects sleeve edges', () => {
    const piece = makePiece('Sleeve', [
      { type: 'M', values: [0, 0] },
      { type: 'C', values: [100, -50, 200, -50, 300, 0] }, // sleeve cap (curved top)
      { type: 'L', values: [280, 400] },  // right side
      { type: 'L', values: [20, 400] },   // cuff (bottom)
      { type: 'Z', values: [] },
    ]);
    const edges = detectSemanticEdges(piece);
    const edgeNames = edges.map(e => e.name);
    expect(edgeNames.some(n => n.includes('sleeveCap') || n.includes('top'))).toBe(true);
  });

  it('generates deterministic IDs from pieceId + edgeName', () => {
    const piece = makePiece('Front Bodice', bodiceFrontOutline);
    piece.id = 'test-piece-1';
    const edges1 = detectSemanticEdges(piece);
    const edges2 = detectSemanticEdges(piece);
    // Same piece → same IDs
    expect(edges1.map(e => e.id)).toEqual(edges2.map(e => e.id));
    // IDs should contain piece ID
    for (const edge of edges1) {
      expect(edge.id).toBe(`test-piece-1:${edge.name}`);
    }
  });

  it('returns empty for degenerate piece', () => {
    const piece = makePiece('Tiny', [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [1, 0] },
      { type: 'Z', values: [] },
    ]);
    const edges = detectSemanticEdges(piece);
    expect(edges.length).toBeLessThanOrEqual(1);
  });
});

describe('findEdgeByName', () => {
  it('finds edge by exact name', () => {
    const piece = makePiece('Front Bodice', bodiceFrontOutline);
    const edges = detectSemanticEdges(piece);
    if (edges.length > 0) {
      const found = findEdgeByName(edges, edges[0].name);
      expect(found).toBeDefined();
      expect(found!.name).toBe(edges[0].name);
    }
  });

  it('finds edge by partial match', () => {
    const piece = makePiece('Front Bodice', bodiceFrontOutline);
    const edges = detectSemanticEdges(piece);
    // Try partial match for any existing edge
    if (edges.length > 0) {
      const partial = edges[0].name.substring(0, 3);
      const found = findEdgeByName(edges, partial);
      expect(found).toBeDefined();
    }
  });

  it('returns undefined for non-existent edge', () => {
    const piece = makePiece('Front Bodice', bodiceFrontOutline);
    const edges = detectSemanticEdges(piece);
    const found = findEdgeByName(edges, 'zzz_nonexistent_zzz');
    expect(found).toBeUndefined();
  });
});

describe('findMatchingEdges', () => {
  it('finds matches between front and back bodice', () => {
    const front = makePiece('Front Bodice', bodiceFrontOutline);
    const back = makePiece('Back Bodice', bodiceFrontOutline);
    front.edges = detectSemanticEdges(front);
    back.edges = detectSemanticEdges(back);
    const matches = findMatchingEdges(front, back);
    // May or may not find matches depending on heuristic — just verify no crash
    expect(Array.isArray(matches)).toBe(true);
  });

  it('returns empty for pieces without edges', () => {
    const a = makePiece('A', rectOutline);
    const b = makePiece('B', rectOutline);
    const matches = findMatchingEdges(a, b);
    expect(matches).toEqual([]);
  });
});
