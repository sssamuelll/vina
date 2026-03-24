import { describe, it, expect } from 'vitest';
import { generatePleatFoldLines } from '../pleatGeometry';
import type { Pleat, PatternPiece, SemanticEdge } from '../../types/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build a simple 100×100 square piece with one named edge on the top side.
 * Outline: M(0,0) → L(100,0) → L(100,100) → L(0,100) → Z
 * The "top" edge runs from index 0 (M) to index 1 (L 100,0).
 */
function makeSquarePiece(edges: SemanticEdge[] = []): PatternPiece {
  return {
    id: 'test-piece',
    name: 'Test Square',
    outline: [
      { type: 'M', values: [0, 0] },     // 0 — start
      { type: 'L', values: [100, 0] },   // 1 — top edge end
      { type: 'L', values: [100, 100] }, // 2 — right edge end
      { type: 'L', values: [0, 100] },   // 3 — bottom edge end
      { type: 'Z', values: [] },          // 4 — close
    ],
    internals: [],
    position: { x: 0, y: 0 },
    rotation: 0,
    mirrored: false,
    seamAllowance: 10,
    layer: 1,
    sublayer: 0,
    active: true,
    edges,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/** The "top" edge: indices 0–1 in the outline (M→L along y=0) */
const topEdge: SemanticEdge = {
  id: 'edge-top',
  name: 'top',
  segmentRange: [0, 2], // commands 0 (M 0,0) and 1 (L 100,0)
  edgeType: 'seam',
};

function makePleat(overrides: Partial<Pleat> = {}): Pleat {
  return {
    id: 'pleat-1',
    pieceId: 'test-piece',
    edgeName: 'top',
    type: 'knife',
    depth: 15,
    spacing: 20,
    count: 3,
    direction: 'left',
    tStart: 0,
    tEnd: 1,
    generatedLineIds: [],
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('generatePleatFoldLines', () => {
  describe('edge not found', () => {
    it('returns empty array when edge name does not exist on piece', () => {
      const piece = makeSquarePiece([topEdge]);
      const pleat = makePleat({ edgeName: 'nonexistent' });
      const lines = generatePleatFoldLines(pleat, piece);
      expect(lines).toEqual([]);
    });

    it('returns empty array when piece has no edges array', () => {
      const piece = makeSquarePiece();
      const pleat = makePleat();
      const lines = generatePleatFoldLines(pleat, piece);
      expect(lines).toEqual([]);
    });
  });

  describe('count = 0', () => {
    it('returns empty array when count is 0', () => {
      const piece = makeSquarePiece([topEdge]);
      const pleat = makePleat({ count: 0 });
      const lines = generatePleatFoldLines(pleat, piece);
      expect(lines).toEqual([]);
    });
  });

  describe('knife pleat', () => {
    it('generates exactly count lines', () => {
      const piece = makeSquarePiece([topEdge]);
      const pleat = makePleat({ type: 'knife', count: 3 });
      const lines = generatePleatFoldLines(pleat, piece);
      expect(lines).toHaveLength(3);
    });

    it('all lines are type fold', () => {
      const piece = makeSquarePiece([topEdge]);
      const pleat = makePleat({ type: 'knife', count: 4 });
      const lines = generatePleatFoldLines(pleat, piece);
      expect(lines.every(l => l.type === 'fold')).toBe(true);
    });

    it('all lines are mountain direction', () => {
      const piece = makeSquarePiece([topEdge]);
      const pleat = makePleat({ type: 'knife', count: 4 });
      const lines = generatePleatFoldLines(pleat, piece);
      expect(lines.every(l => l.foldOptions?.direction === 'mountain')).toBe(true);
    });

    it('all lines have pleatId set', () => {
      const piece = makeSquarePiece([topEdge]);
      const pleat = makePleat({ type: 'knife', count: 2 });
      const lines = generatePleatFoldLines(pleat, piece);
      expect(lines.every(l => l.foldOptions?.pleatId === pleat.id)).toBe(true);
    });

    it('all lines have creaseAngleDeg = 180', () => {
      const piece = makeSquarePiece([topEdge]);
      const pleat = makePleat({ type: 'knife', count: 2 });
      const lines = generatePleatFoldLines(pleat, piece);
      expect(lines.every(l => l.foldOptions?.creaseAngleDeg === 180)).toBe(true);
    });

    it('each line has a path with M and L commands', () => {
      const piece = makeSquarePiece([topEdge]);
      const pleat = makePleat({ type: 'knife', count: 2 });
      const lines = generatePleatFoldLines(pleat, piece);
      for (const line of lines) {
        const types = line.path.map(c => c.type);
        expect(types).toContain('M');
        expect(types).toContain('L');
      }
    });

    it('each line has a unique id', () => {
      const piece = makeSquarePiece([topEdge]);
      const pleat = makePleat({ type: 'knife', count: 5 });
      const lines = generatePleatFoldLines(pleat, piece);
      const ids = lines.map(l => l.id);
      const unique = new Set(ids);
      expect(unique.size).toBe(ids.length);
    });
  });

  describe('box pleat', () => {
    it('generates count * 2 lines', () => {
      const piece = makeSquarePiece([topEdge]);
      const pleat = makePleat({ type: 'box', count: 3 });
      const lines = generatePleatFoldLines(pleat, piece);
      expect(lines).toHaveLength(6);
    });

    it('all lines are mountain direction', () => {
      const piece = makeSquarePiece([topEdge]);
      const pleat = makePleat({ type: 'box', count: 3 });
      const lines = generatePleatFoldLines(pleat, piece);
      expect(lines.every(l => l.foldOptions?.direction === 'mountain')).toBe(true);
    });
  });

  describe('accordion pleat', () => {
    it('generates count * 2 lines', () => {
      const piece = makeSquarePiece([topEdge]);
      const pleat = makePleat({ type: 'accordion', count: 3 });
      const lines = generatePleatFoldLines(pleat, piece);
      expect(lines).toHaveLength(6);
    });

    it('alternates mountain and valley directions', () => {
      const piece = makeSquarePiece([topEdge]);
      const pleat = makePleat({ type: 'accordion', count: 3 });
      const lines = generatePleatFoldLines(pleat, piece);
      const directions = lines.map(l => l.foldOptions?.direction);
      // First line is mountain, then alternates
      expect(directions[0]).toBe('mountain');
      expect(directions[1]).toBe('valley');
      expect(directions[2]).toBe('mountain');
      expect(directions[3]).toBe('valley');
      expect(directions[4]).toBe('mountain');
      expect(directions[5]).toBe('valley');
    });
  });

  describe('inverted box pleat', () => {
    it('generates count * 2 lines', () => {
      const piece = makeSquarePiece([topEdge]);
      const pleat = makePleat({ type: 'invertedBox', count: 3 });
      const lines = generatePleatFoldLines(pleat, piece);
      expect(lines).toHaveLength(6);
    });

    it('all lines are valley direction', () => {
      const piece = makeSquarePiece([topEdge]);
      const pleat = makePleat({ type: 'invertedBox', count: 3 });
      const lines = generatePleatFoldLines(pleat, piece);
      expect(lines.every(l => l.foldOptions?.direction === 'valley')).toBe(true);
    });
  });

  describe('count clamping', () => {
    it('clamps count > 50 (MAX_PLEAT_COUNT) to 50', () => {
      const piece = makeSquarePiece([topEdge]);
      const pleat = makePleat({ type: 'knife', count: 200 });
      const lines = generatePleatFoldLines(pleat, piece);
      // knife: 1 line per repeat, so max 50
      expect(lines).toHaveLength(50);
    });

    it('clamps count > 50 for box to produce 100 lines', () => {
      const piece = makeSquarePiece([topEdge]);
      const pleat = makePleat({ type: 'box', count: 100 });
      const lines = generatePleatFoldLines(pleat, piece);
      // box: 2 lines per repeat, max 50 repeats → 100 lines
      expect(lines).toHaveLength(100);
    });
  });

  describe('geometry correctness', () => {
    it('fold lines start on the edge (y ≈ 0 for top edge)', () => {
      const piece = makeSquarePiece([topEdge]);
      const pleat = makePleat({ type: 'knife', count: 3 });
      const lines = generatePleatFoldLines(pleat, piece);
      for (const line of lines) {
        const moveCmd = line.path.find(c => c.type === 'M');
        expect(moveCmd).toBeDefined();
        // The top edge is y=0, so start point should be at y≈0
        expect(Math.abs(moveCmd!.values[1])).toBeLessThan(1);
      }
    });

    it('fold lines extend inward (positive y for top edge)', () => {
      const piece = makeSquarePiece([topEdge]);
      const pleat = makePleat({ type: 'knife', count: 3, depth: 15 });
      const lines = generatePleatFoldLines(pleat, piece);
      for (const line of lines) {
        const lineCmd = line.path.find(c => c.type === 'L');
        expect(lineCmd).toBeDefined();
        // Extending inward from y=0 → y should be > 0
        expect(lineCmd!.values[1]).toBeGreaterThan(0);
      }
    });
  });
});
