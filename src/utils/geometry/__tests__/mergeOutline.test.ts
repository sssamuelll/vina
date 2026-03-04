import { describe, it, expect } from 'vitest';
import type { PathCommand, Point2D } from '../../../types/types';
import { findSharedEdge, mergeOutlines } from '../mergeOutline';

// Two adjacent 10x5 rectangles (stacked vertically, sharing bottom/top edge)
const RECT_TOP: PathCommand[] = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [10, 0] },
  { type: 'L', values: [10, 5] },
  { type: 'L', values: [0, 5] },
  { type: 'Z', values: [] },
];

const RECT_BOTTOM: PathCommand[] = [
  { type: 'M', values: [0, 5] },
  { type: 'L', values: [10, 5] },
  { type: 'L', values: [10, 10] },
  { type: 'L', values: [0, 10] },
  { type: 'Z', values: [] },
];

describe('findSharedEdge', () => {
  it('detects shared edge between adjacent rectangles', () => {
    const posA: Point2D = { x: 0, y: 0 };
    const posB: Point2D = { x: 0, y: 0 };
    const result = findSharedEdge(RECT_TOP, posA, RECT_BOTTOM, posB, 2);
    expect(result).not.toBeNull();
  });

  it('returns null for non-adjacent pieces', () => {
    const posA: Point2D = { x: 0, y: 0 };
    const posB: Point2D = { x: 100, y: 100 };
    const result = findSharedEdge(RECT_TOP, posA, RECT_BOTTOM, posB, 2);
    expect(result).toBeNull();
  });

  it('returns edge indices for both pieces', () => {
    const posA: Point2D = { x: 0, y: 0 };
    const posB: Point2D = { x: 0, y: 0 };
    const result = findSharedEdge(RECT_TOP, posA, RECT_BOTTOM, posB, 2);
    expect(result).not.toBeNull();
    expect(result).toHaveProperty('edgeA');
    expect(result).toHaveProperty('edgeB');
  });

  it('handles pieces offset by position', () => {
    // RECT_TOP at position (20, 30) and a bottom rect at local (0,0) but
    // positioned so that it aligns with RECT_TOP's bottom edge
    const localBottom: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [10, 0] },
      { type: 'L', values: [10, 5] },
      { type: 'L', values: [0, 5] },
      { type: 'Z', values: [] },
    ];
    const posA: Point2D = { x: 20, y: 30 };
    const posB: Point2D = { x: 20, y: 35 };
    const result = findSharedEdge(RECT_TOP, posA, localBottom, posB, 2);
    expect(result).not.toBeNull();
  });

  it('finds shared edge for side-by-side rectangles', () => {
    const rectLeft: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [5, 0] },
      { type: 'L', values: [5, 10] },
      { type: 'L', values: [0, 10] },
      { type: 'Z', values: [] },
    ];
    const rectRight: PathCommand[] = [
      { type: 'M', values: [5, 0] },
      { type: 'L', values: [10, 0] },
      { type: 'L', values: [10, 10] },
      { type: 'L', values: [5, 10] },
      { type: 'Z', values: [] },
    ];
    const pos: Point2D = { x: 0, y: 0 };
    const result = findSharedEdge(rectLeft, pos, rectRight, pos, 2);
    expect(result).not.toBeNull();
  });
});

describe('mergeOutlines', () => {
  it('merges two adjacent rectangles into one larger rectangle', () => {
    const posA: Point2D = { x: 0, y: 0 };
    const posB: Point2D = { x: 0, y: 0 };
    const shared = findSharedEdge(RECT_TOP, posA, RECT_BOTTOM, posB, 2);
    expect(shared).not.toBeNull();

    const merged = mergeOutlines(RECT_TOP, posA, RECT_BOTTOM, posB, shared!);
    expect(merged[0].type).toBe('M');
    expect(merged[merged.length - 1].type).toBe('Z');
  });

  it('preserves curves on non-shared edges', () => {
    const curvedTop: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'C', values: [3, -3, 7, -3, 10, 0] },
      { type: 'L', values: [10, 5] },
      { type: 'L', values: [0, 5] },
      { type: 'Z', values: [] },
    ];
    const posA: Point2D = { x: 0, y: 0 };
    const posB: Point2D = { x: 0, y: 0 };
    const shared = findSharedEdge(curvedTop, posA, RECT_BOTTOM, posB, 2);
    expect(shared).not.toBeNull();

    const merged = mergeOutlines(curvedTop, posA, RECT_BOTTOM, posB, shared!);
    const hasCurve = merged.some(c => c.type === 'C');
    expect(hasCurve).toBe(true);
  });

  it('merged outline has fewer commands than both originals combined', () => {
    const posA: Point2D = { x: 0, y: 0 };
    const posB: Point2D = { x: 0, y: 0 };
    const shared = findSharedEdge(RECT_TOP, posA, RECT_BOTTOM, posB, 2);
    const merged = mergeOutlines(RECT_TOP, posA, RECT_BOTTOM, posB, shared!);
    const origTotal = RECT_TOP.length + RECT_BOTTOM.length;
    expect(merged.length).toBeLessThan(origTotal);
  });

  it('applies position offsets to all coordinates', () => {
    const localRect: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [10, 0] },
      { type: 'L', values: [10, 5] },
      { type: 'L', values: [0, 5] },
      { type: 'Z', values: [] },
    ];
    const localBottom: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [10, 0] },
      { type: 'L', values: [10, 5] },
      { type: 'L', values: [0, 5] },
      { type: 'Z', values: [] },
    ];
    const posA: Point2D = { x: 20, y: 30 };
    const posB: Point2D = { x: 20, y: 35 };
    const shared = findSharedEdge(localRect, posA, localBottom, posB, 2);
    expect(shared).not.toBeNull();

    const merged = mergeOutlines(localRect, posA, localBottom, posB, shared!);
    // M command should have offset coordinates
    expect(merged[0].values[0]).toBeGreaterThanOrEqual(20);
    expect(merged[0].values[1]).toBeGreaterThanOrEqual(30);
  });

  it('merged rectangle contains all 4 corners of the combined shape', () => {
    const posA: Point2D = { x: 0, y: 0 };
    const posB: Point2D = { x: 0, y: 0 };
    const shared = findSharedEdge(RECT_TOP, posA, RECT_BOTTOM, posB, 2);
    expect(shared).not.toBeNull();

    const merged = mergeOutlines(RECT_TOP, posA, RECT_BOTTOM, posB, shared!);
    // Extract all L/M endpoint coordinates
    const points = merged
      .filter(c => c.type === 'M' || c.type === 'L')
      .map(c => ({ x: c.values[0], y: c.values[1] }));
    // The combined rectangle spans (0,0) to (10,10)
    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);
    expect(Math.min(...xs)).toBeCloseTo(0, 5);
    expect(Math.max(...xs)).toBeCloseTo(10, 5);
    expect(Math.min(...ys)).toBeCloseTo(0, 5);
    expect(Math.max(...ys)).toBeCloseTo(10, 5);
  });

  it('produces a valid closed path for side-by-side rectangles', () => {
    const rectLeft: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [5, 0] },
      { type: 'L', values: [5, 10] },
      { type: 'L', values: [0, 10] },
      { type: 'Z', values: [] },
    ];
    const rectRight: PathCommand[] = [
      { type: 'M', values: [5, 0] },
      { type: 'L', values: [10, 0] },
      { type: 'L', values: [10, 10] },
      { type: 'L', values: [5, 10] },
      { type: 'Z', values: [] },
    ];
    const pos: Point2D = { x: 0, y: 0 };
    const shared = findSharedEdge(rectLeft, pos, rectRight, pos, 2);
    expect(shared).not.toBeNull();

    const merged = mergeOutlines(rectLeft, pos, rectRight, pos, shared!);
    expect(merged[0].type).toBe('M');
    expect(merged[merged.length - 1].type).toBe('Z');
    // Should have fewer commands than combined
    expect(merged.length).toBeLessThan(rectLeft.length + rectRight.length);
  });
});
