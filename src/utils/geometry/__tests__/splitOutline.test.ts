import { describe, it, expect } from 'vitest';
import type { PathCommand } from '../../../types/types';
import {
  findOutlineIntersections,
  splitOutlineAtPoints,
} from '../splitOutline';

// Helper: simple 10x10 square outline
const square: PathCommand[] = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [10, 0] },
  { type: 'L', values: [10, 10] },
  { type: 'L', values: [0, 10] },
  { type: 'Z', values: [] },
];

// Helper: square with curved top edge (cubic bezier from (0,0) to (10,0))
const squareWithCurvedTop: PathCommand[] = [
  { type: 'M', values: [0, 0] },
  { type: 'C', values: [3, -3, 7, -3, 10, 0] },
  { type: 'L', values: [10, 10] },
  { type: 'L', values: [0, 10] },
  { type: 'Z', values: [] },
];

// Helper: rectangle with curved right edge
const rectWithCurvedRight: PathCommand[] = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [10, 0] },
  { type: 'C', values: [13, 3, 13, 7, 10, 10] },
  { type: 'L', values: [0, 10] },
  { type: 'Z', values: [] },
];

describe('findOutlineIntersections', () => {
  it('finds 2 hits for a horizontal cut through a 10x10 square', () => {
    const hits = findOutlineIntersections(
      square,
      { x: -5, y: 5 },
      { x: 15, y: 5 },
    );
    expect(hits).toHaveLength(2);
    // Hits should be on the left edge (x=0,y=5) and right edge (x=10,y=5)
    const xs = hits.map(h => h.point.x).sort((a, b) => a - b);
    expect(xs[0]).toBeCloseTo(0, 1);
    expect(xs[1]).toBeCloseTo(10, 1);
    hits.forEach(h => {
      expect(h.point.y).toBeCloseTo(5, 1);
    });
  });

  it('each hit has commandIndex, t, and point properties', () => {
    const hits = findOutlineIntersections(
      square,
      { x: -5, y: 5 },
      { x: 15, y: 5 },
    );
    expect(hits).toHaveLength(2);
    for (const hit of hits) {
      expect(hit).toHaveProperty('commandIndex');
      expect(hit).toHaveProperty('t');
      expect(hit).toHaveProperty('point');
      expect(typeof hit.commandIndex).toBe('number');
      expect(typeof hit.t).toBe('number');
      expect(hit.t).toBeGreaterThanOrEqual(0);
      expect(hit.t).toBeLessThanOrEqual(1);
      expect(hit.point).toHaveProperty('x');
      expect(hit.point).toHaveProperty('y');
    }
  });

  it('returns empty for a line that misses the outline', () => {
    const hits = findOutlineIntersections(
      square,
      { x: -5, y: 15 },
      { x: 15, y: 15 },
    );
    expect(hits).toHaveLength(0);
  });
});

describe('splitOutlineAtPoints', () => {
  it('splits a square into two valid closed outlines', () => {
    const hits = findOutlineIntersections(
      square,
      { x: -5, y: 5 },
      { x: 15, y: 5 },
    );
    expect(hits).toHaveLength(2);

    const [outlineA, outlineB] = splitOutlineAtPoints(square, hits[0], hits[1]);

    // Both outlines must start with M and end with Z
    expect(outlineA[0].type).toBe('M');
    expect(outlineA[outlineA.length - 1].type).toBe('Z');
    expect(outlineB[0].type).toBe('M');
    expect(outlineB[outlineB.length - 1].type).toBe('Z');

    // Both outlines should have more than just M and Z
    expect(outlineA.length).toBeGreaterThan(2);
    expect(outlineB.length).toBeGreaterThan(2);
  });

  it('preserves L commands on non-cut edges', () => {
    const hits = findOutlineIntersections(
      square,
      { x: -5, y: 5 },
      { x: 15, y: 5 },
    );
    expect(hits).toHaveLength(2);

    const [outlineA, outlineB] = splitOutlineAtPoints(square, hits[0], hits[1]);

    // Both outlines should contain L commands (not just the cut line)
    const aTypes = outlineA.map(c => c.type);
    const bTypes = outlineB.map(c => c.type);
    expect(aTypes.filter(t => t === 'L').length).toBeGreaterThanOrEqual(1);
    expect(bTypes.filter(t => t === 'L').length).toBeGreaterThanOrEqual(1);

    // All non-M/Z commands should be L for this square split
    for (const cmd of outlineA.slice(1, -1)) {
      expect(cmd.type).toBe('L');
    }
    for (const cmd of outlineB.slice(1, -1)) {
      expect(cmd.type).toBe('L');
    }
  });

  it('preserves C commands on non-cut edges', () => {
    // Square with curved top edge, cut at y=5 (horizontal through middle)
    const hits = findOutlineIntersections(
      squareWithCurvedTop,
      { x: -5, y: 5 },
      { x: 15, y: 5 },
    );
    expect(hits).toHaveLength(2);

    const [outlineA, outlineB] = splitOutlineAtPoints(
      squareWithCurvedTop,
      hits[0],
      hits[1],
    );

    // One of the outlines should contain the curved top edge (C command)
    const allCommands = [...outlineA, ...outlineB];
    const cCommands = allCommands.filter(c => c.type === 'C');
    expect(cCommands.length).toBeGreaterThanOrEqual(1);

    // Both outlines should be valid closed paths
    expect(outlineA[0].type).toBe('M');
    expect(outlineA[outlineA.length - 1].type).toBe('Z');
    expect(outlineB[0].type).toBe('M');
    expect(outlineB[outlineB.length - 1].type).toBe('Z');
  });

  it('handles splitting through a curve command', () => {
    // Rectangle with curved right edge, cut at y=5
    const hits = findOutlineIntersections(
      rectWithCurvedRight,
      { x: -5, y: 5 },
      { x: 20, y: 5 },
    );
    expect(hits).toHaveLength(2);

    const [outlineA, outlineB] = splitOutlineAtPoints(
      rectWithCurvedRight,
      hits[0],
      hits[1],
    );

    // Both outlines should be valid closed paths
    expect(outlineA[0].type).toBe('M');
    expect(outlineA[outlineA.length - 1].type).toBe('Z');
    expect(outlineB[0].type).toBe('M');
    expect(outlineB[outlineB.length - 1].type).toBe('Z');

    // The curve was split, so both outlines should contain C commands
    // (each gets one half of the split cubic bezier)
    const aCurves = outlineA.filter(c => c.type === 'C');
    const bCurves = outlineB.filter(c => c.type === 'C');
    expect(aCurves.length + bCurves.length).toBeGreaterThanOrEqual(2);

    // Both should have more than just M, L(cut), Z
    expect(outlineA.length).toBeGreaterThan(2);
    expect(outlineB.length).toBeGreaterThan(2);
  });
});
