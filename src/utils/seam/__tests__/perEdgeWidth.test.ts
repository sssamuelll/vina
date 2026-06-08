import { describe, it, expect } from 'vitest';
import { perEdgeWidths, generateSeamAllowanceWithCorners } from '../cornerTypes';
import type { PathCommand, SemanticEdge } from '../../../types/types';

// ─── Per-edge seam allowance width (step 3) ──────────────────────────────────
//
// Per-edge SA width is stored on SemanticEdge.seamAllowanceWidth (stable id,
// auto-populated by detectSemanticEdges). The generator resolves each outline
// edge to its owning SemanticEdge (via segmentRange in command space, matched
// against the flattened vertices' source command) and offsets it by that width,
// falling back to the piece-level width. When no edge sets a width the result
// is uniform — identical to the single-width path (zero regression).

const square: PathCommand[] = [
  { type: 'M', values: [0, 0] },     // cmd 0
  { type: 'L', values: [100, 0] },   // cmd 1 → TOP edge (0,0)→(100,0)
  { type: 'L', values: [100, 100] }, // cmd 2 → RIGHT edge
  { type: 'L', values: [0, 100] },   // cmd 3 → BOTTOM edge
  { type: 'Z', values: [] },         // closing/LEFT edge owned by cmd 0
];

function edge(name: string, range: [number, number], width?: number): SemanticEdge {
  return { id: `p:${name}`, name, segmentRange: range, edgeType: 'seam', seamAllowanceWidth: width };
}

describe('perEdgeWidths', () => {
  // For the square, flattened vertices carry cmds [0,1,2,3]; edge i ends at
  // vertex (i+1)%4, so edge0→cmd1, edge1→cmd2, edge2→cmd3, edge3→cmd0.
  const cmds = [0, 1, 2, 3];

  it('returns all-fallback when no semantic edges are given', () => {
    expect(perEdgeWidths(cmds, undefined, 10)).toEqual([10, 10, 10, 10]);
  });

  it('returns all-fallback when no semantic edge sets a width', () => {
    const edges = [edge('top', [1, 2]), edge('right', [2, 3])]; // widths undefined
    expect(perEdgeWidths(cmds, edges, 10)).toEqual([10, 10, 10, 10]);
  });

  it('applies a per-edge width to the edge whose owning command it covers', () => {
    // top edge (cmd 1) = 40; everything else inherits the fallback 10.
    const edges = [edge('top', [1, 2], 40)];
    // edge0 ends at vertex cmd1 → 40; edges 1,2,3 → fallback.
    expect(perEdgeWidths(cmds, edges, 10)).toEqual([40, 10, 10, 10]);
  });

  it('resolves multiple per-edge widths independently', () => {
    const edges = [edge('top', [1, 2], 40), edge('bottom', [3, 4], 25)];
    // edge0→cmd1=40, edge2→cmd3=25, rest fallback.
    expect(perEdgeWidths(cmds, edges, 10)).toEqual([40, 10, 25, 10]);
  });

  it('honors a per-edge width of 0 (fold edge, no allowance)', () => {
    const edges = [edge('top', [1, 2], 0)];
    expect(perEdgeWidths(cmds, edges, 10)).toEqual([0, 10, 10, 10]);
  });
});

describe('generateSeamAllowanceWithCorners with per-edge widths', () => {
  const minMax = (cmds: PathCommand[]) => {
    const pts = cmds.filter(c => c.type === 'M' || c.type === 'L').map(c => ({ x: c.values[0], y: c.values[1] }));
    return {
      minY: Math.min(...pts.map(p => p.y)),
      maxX: Math.max(...pts.map(p => p.x)),
    };
  };

  it('offsets the top edge by its per-edge width while the rest use the fallback', () => {
    // Top edge gets 40mm; the piece fallback (saWidth) is 10mm.
    const topEdge = edge('top', [1, 2], 40);
    const sa = generateSeamAllowanceWithCorners(square, 10, 'mitered', {}, [topEdge]);
    const { minY, maxX } = minMax(sa);
    // Top edge offset outward (screen Y-down) → minY ≈ -40 (not -10).
    expect(minY).toBeCloseTo(-40, 0);
    // Right edge still at the fallback 10 → maxX ≈ 110.
    expect(maxX).toBeCloseTo(110, 0);
  });

  it('is identical to the single-width path when no edge sets a width (zero regression)', () => {
    const withoutEdges = generateSeamAllowanceWithCorners(square, 10, 'mitered', {});
    const withInertEdges = generateSeamAllowanceWithCorners(square, 10, 'mitered', {}, [edge('top', [1, 2])]);
    expect(withInertEdges).toEqual(withoutEdges);
    // And the uniform 10 baseline offsets the top edge by only 10.
    expect(minMax(withoutEdges).minY).toBeCloseTo(-10, 0);
  });
});
