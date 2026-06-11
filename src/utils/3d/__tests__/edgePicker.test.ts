import { describe, it, expect } from 'vitest';
import type { PathCommand, SemanticEdge } from '../../../types/types';
import { pickEdge, outlineToLocal3D, pieceHighlightRotation, edgeMidpointLocal3D } from '../edgePicker';

// ─── Test Fixtures ──────────────────────────────────────────────────────────

// Simple rectangle: 100mm wide × 200mm tall. Left edge closes with an
// EXPLICIT L (the producer never emits edges over the implicit Z close);
// the flattened sequence is identical to the Z-closed version (5 points).
const outline: PathCommand[] = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [100, 0] },     // 1: top edge
  { type: 'L', values: [100, 200] },   // 2: right edge
  { type: 'L', values: [0, 200] },     // 3: bottom edge
  { type: 'L', values: [0, 0] },       // 4: left edge
  { type: 'Z', values: [] },
];

// segmentRange in COMMAND space ([start, end) over PathCommand[]) — the
// detectSemanticEdges contract. The picker converts at the boundary via
// commandRangeToFlattened (Fase 3 / BP-3).
const edges: SemanticEdge[] = [
  { id: 'e0', name: 'top', segmentRange: [1, 2], edgeType: 'seam' },
  { id: 'e1', name: 'right', segmentRange: [2, 3], edgeType: 'seam' },
  { id: 'e2', name: 'bottom', segmentRange: [3, 4], edgeType: 'seam' },
  { id: 'e3', name: 'left', segmentRange: [4, 5], edgeType: 'seam' },
];

// After flattening: points (0,0), (100,0), (100,200), (0,200), (0,0)
// After local 3D (×0.001, negate Y): (0,0), (0.1,0), (0.1,-0.2), (0,-0.2), (0,0)
// Bounding box: x [0, 0.1], z [−0.2, 0]  → center (0.05, −0.1)
// After centering:
//   pt0 (−0.05, 0.1), pt1 (0.05, 0.1), pt2 (0.05, −0.1), pt3 (−0.05, −0.1), pt4 (−0.05, 0.1)

// ─── outlineToLocal3D ───────────────────────────────────────────────────────

describe('pieceHighlightRotation', () => {
  it('returns yaw-only rotation when no base rotation is given', () => {
    const r0 = pieceHighlightRotation(0);
    expect(r0[0]).toBeCloseTo(0, 6);
    expect(r0[1]).toBeCloseTo(0, 6); // -0 is fine
    expect(r0[2]).toBeCloseTo(0, 6);
    const r = pieceHighlightRotation(90);
    expect(r[0]).toBeCloseTo(0, 6);
    expect(r[1]).toBeCloseTo(-Math.PI / 2, 6);
    expect(r[2]).toBeCloseTo(0, 6);
  });
  it('adds the piece yaw onto a base rotation', () => {
    const r = pieceHighlightRotation(90, [0.1, 0.2, 0.3]);
    expect(r[0]).toBeCloseTo(0.1, 6);
    expect(r[1]).toBeCloseTo(0.2 - Math.PI / 2, 6);
    expect(r[2]).toBeCloseTo(0.3, 6);
  });
  it('treats undefined rotation as 0', () => {
    const r = pieceHighlightRotation(undefined);
    expect(r[1]).toBeCloseTo(0, 6);
  });
});

describe('edgeMidpointLocal3D', () => {
  // Rectangle local points (after centering): see comment above.
  it('computes the midpoint of the top edge', () => {
    const mid = edgeMidpointLocal3D(outline, edges[0]); // top: pts 0,1 → (-0.05,0.1),(0.05,0.1)
    expect(mid).not.toBeNull();
    expect(mid!.x).toBeCloseTo(0, 6);
    expect(mid!.z).toBeCloseTo(0.1, 6);
  });
  it('computes the midpoint of the right edge', () => {
    const mid = edgeMidpointLocal3D(outline, edges[1]); // right: pts 1,2 → (0.05,0.1),(0.05,-0.1)
    expect(mid).not.toBeNull();
    expect(mid!.x).toBeCloseTo(0.05, 6);
    expect(mid!.z).toBeCloseTo(0, 6);
  });
  it('returns null for an empty outline', () => {
    expect(edgeMidpointLocal3D([], edges[0])).toBeNull();
  });
});

describe('outlineToLocal3D', () => {
  it('converts outline to centered local 3D points', () => {
    const pts = outlineToLocal3D(outline);
    expect(pts).toHaveLength(5);

    // Check first point (after centering)
    expect(pts[0].x).toBeCloseTo(-0.05, 6);
    expect(pts[0].z).toBeCloseTo(0.1, 6);

    // Check second point
    expect(pts[1].x).toBeCloseTo(0.05, 6);
    expect(pts[1].z).toBeCloseTo(0.1, 6);

    // Check third point
    expect(pts[2].x).toBeCloseTo(0.05, 6);
    expect(pts[2].z).toBeCloseTo(-0.1, 6);

    // Check fourth point
    expect(pts[3].x).toBeCloseTo(-0.05, 6);
    expect(pts[3].z).toBeCloseTo(-0.1, 6);

    // Closing point = first point
    expect(pts[4].x).toBeCloseTo(-0.05, 6);
    expect(pts[4].z).toBeCloseTo(0.1, 6);
  });

  it('returns empty array for empty outline', () => {
    expect(outlineToLocal3D([])).toEqual([]);
  });
});

// ─── pickEdge ───────────────────────────────────────────────────────────────

describe('pickEdge', () => {
  it('picks the top edge when hit is near top center', () => {
    // Top edge center in centered local 3D: midpoint of (−0.05,0.1) and (0.05,0.1)
    // = (0, 0.1) — hit slightly below at z=0.095
    const result = pickEdge(0, 0.095, outline, edges);
    expect(result).not.toBeNull();
    expect(result!.edge.name).toBe('top');
    expect(result!.distance).toBeLessThan(0.015);
  });

  it('picks the right edge when hit is near right center', () => {
    // Right edge center: midpoint of (0.05,0.1) and (0.05,−0.1) = (0.05, 0)
    const result = pickEdge(0.045, 0, outline, edges);
    expect(result).not.toBeNull();
    expect(result!.edge.name).toBe('right');
    expect(result!.distance).toBeLessThan(0.015);
  });

  it('picks the bottom edge when hit is near bottom center', () => {
    // Bottom edge center: midpoint of (0.05,−0.1) and (−0.05,−0.1) = (0, −0.1)
    const result = pickEdge(0, -0.095, outline, edges);
    expect(result).not.toBeNull();
    expect(result!.edge.name).toBe('bottom');
    expect(result!.distance).toBeLessThan(0.015);
  });

  it('picks the left edge when hit is near left center', () => {
    // Left edge center: midpoint of (−0.05,−0.1) and (−0.05,0.1) = (−0.05, 0)
    const result = pickEdge(-0.045, 0, outline, edges);
    expect(result).not.toBeNull();
    expect(result!.edge.name).toBe('left');
    expect(result!.distance).toBeLessThan(0.015);
  });

  it('returns null when no edges are provided', () => {
    expect(pickEdge(0, 0, outline, undefined)).toBeNull();
    expect(pickEdge(0, 0, outline, [])).toBeNull();
  });

  it('returns null for empty outline', () => {
    expect(pickEdge(0, 0, [], edges)).toBeNull();
  });

  it('returns null when hit is too far from all edges', () => {
    // Center of rectangle is equidistant from all edges at ~0.05m (50mm)
    // Default threshold is 0.015m (15mm) — center should be too far
    const result = pickEdge(0, 0, outline, edges);
    expect(result).toBeNull();
  });

  it('respects custom threshold', () => {
    // Center is ~0.05m from nearest edge — use large threshold
    const result = pickEdge(0, 0, outline, edges, 0.06);
    expect(result).not.toBeNull();

    // With very small threshold, nothing matches even near an edge
    const result2 = pickEdge(0, 0.095, outline, edges, 0.001);
    expect(result2).toBeNull();
  });

  it('picks the closest edge at a corner', () => {
    // Near top-right corner, slightly closer to top edge
    const result = pickEdge(0.04, 0.098, outline, edges);
    expect(result).not.toBeNull();
    expect(result!.edge.name).toBe('top');
  });

  it('returns distance in meters', () => {
    const result = pickEdge(0, 0.095, outline, edges);
    expect(result).not.toBeNull();
    // Distance should be ~0.005m (5mm offset from z=0.1)
    expect(result!.distance).toBeCloseTo(0.005, 3);
  });

  it('handles single-point edges gracefully', () => {
    const degenerateEdges: SemanticEdge[] = [
      { id: 'e0', name: 'point', segmentRange: [0, 0], edgeType: 'seam' },
    ];
    // segmentRange [0, 0] → no line segments, should be handled without crash
    const result = pickEdge(0, 0.1, outline, degenerateEdges);
    // With [0,0], there are no segments to measure — should return null or a point distance
    // Either behavior is acceptable, but it should not throw
    expect(result === null || typeof result.distance === 'number').toBe(true);
  });

  it('handles segmentRange beyond flattened array bounds', () => {
    const overflowEdges: SemanticEdge[] = [
      { id: 'e0', name: 'overflow', segmentRange: [0, 100], edgeType: 'seam' },
    ];
    // Should clamp and not throw
    const result = pickEdge(0, 0.095, outline, overflowEdges);
    expect(result).not.toBeNull();
  });
});
