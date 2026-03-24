import { describe, it, expect } from 'vitest';
import type { PathCommand } from '../../../types/types';
import {
  findSlashIntersections,
  splitOutlineAtSlash,
} from '../slashAndSpread';

// 100x150 rectangle: corners at (0,0), (100,0), (100,150), (0,150)
const rect100x150: PathCommand[] = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [100, 0] },
  { type: 'L', values: [100, 150] },
  { type: 'L', values: [0, 150] },
  { type: 'Z', values: [] },
];

describe('findSlashIntersections', () => {
  it('vertical line through 100x150 rectangle finds exactly 2 intersections at x=50', () => {
    const [hit1, hit2] = findSlashIntersections(
      rect100x150,
      { x: 50, y: -10 },
      { x: 50, y: 160 },
    );
    expect(hit1).toBeDefined();
    expect(hit2).toBeDefined();

    const points = [hit1.point, hit2.point];
    points.forEach(p => {
      expect(p.x).toBeCloseTo(50, 1);
    });

    // One hit near y=0, one near y=150
    const ys = points.map(p => p.y).sort((a, b) => a - b);
    expect(ys[0]).toBeCloseTo(0, 1);
    expect(ys[1]).toBeCloseTo(150, 1);
  });

  it('horizontal line through 100x150 rectangle finds exactly 2 intersections', () => {
    const [hit1, hit2] = findSlashIntersections(
      rect100x150,
      { x: -10, y: 75 },
      { x: 110, y: 75 },
    );
    expect(hit1).toBeDefined();
    expect(hit2).toBeDefined();

    const points = [hit1.point, hit2.point];
    points.forEach(p => {
      expect(p.y).toBeCloseTo(75, 1);
    });

    // One hit near x=0, one near x=100
    const xs = points.map(p => p.x).sort((a, b) => a - b);
    expect(xs[0]).toBeCloseTo(0, 1);
    expect(xs[1]).toBeCloseTo(100, 1);
  });

  it('returns tuple of exactly two OutlineHit objects with correct shape', () => {
    const result = findSlashIntersections(
      rect100x150,
      { x: 50, y: -10 },
      { x: 50, y: 160 },
    );
    expect(result).toHaveLength(2);
    for (const hit of result) {
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

  it('line that misses piece entirely throws', () => {
    expect(() =>
      findSlashIntersections(
        rect100x150,
        { x: 200, y: -10 },
        { x: 200, y: 160 },
      ),
    ).toThrow();
  });

  it('tangent line (not exactly 2 intersections) throws', () => {
    // A line that passes through exactly one corner of the rectangle produces
    // only 1 intersection hit (the corner point), not 2.
    // Line from (-5, 5) to (5, -5) crosses only the top-left corner (0, 0).
    expect(() =>
      findSlashIntersections(
        rect100x150,
        { x: -5, y: 5 },
        { x: 5, y: -5 },
      ),
    ).toThrow();
  });
});

describe('splitOutlineAtSlash', () => {
  it('splitting rectangle at vertical line produces two valid closed sub-paths', () => {
    const [hit1, hit2] = findSlashIntersections(
      rect100x150,
      { x: 50, y: -10 },
      { x: 50, y: 160 },
    );
    const { halfA, halfB } = splitOutlineAtSlash(rect100x150, hit1, hit2);

    // Both halves must be arrays of PathCommands
    expect(Array.isArray(halfA)).toBe(true);
    expect(Array.isArray(halfB)).toBe(true);

    // Both halves must have content
    expect(halfA.length).toBeGreaterThan(2);
    expect(halfB.length).toBeGreaterThan(2);
  });

  it('each half starts with M and ends with Z', () => {
    const [hit1, hit2] = findSlashIntersections(
      rect100x150,
      { x: 50, y: -10 },
      { x: 50, y: 160 },
    );
    const { halfA, halfB } = splitOutlineAtSlash(rect100x150, hit1, hit2);

    expect(halfA[0].type).toBe('M');
    expect(halfA[halfA.length - 1].type).toBe('Z');
    expect(halfB[0].type).toBe('M');
    expect(halfB[halfB.length - 1].type).toBe('Z');
  });

  it('returns a splitMap object with halfAIndices, halfBIndices, hit1, hit2', () => {
    const [hit1, hit2] = findSlashIntersections(
      rect100x150,
      { x: 50, y: -10 },
      { x: 50, y: 160 },
    );
    const result = splitOutlineAtSlash(rect100x150, hit1, hit2);

    expect(result).toHaveProperty('splitMap');
    const { splitMap } = result;

    expect(splitMap).toHaveProperty('halfAIndices');
    expect(splitMap).toHaveProperty('halfBIndices');
    expect(splitMap).toHaveProperty('hit1');
    expect(splitMap).toHaveProperty('hit2');

    expect(Array.isArray(splitMap.halfAIndices)).toBe(true);
    expect(Array.isArray(splitMap.halfBIndices)).toBe(true);
  });

  it('splitMap indices array length matches corresponding half command count', () => {
    const [hit1, hit2] = findSlashIntersections(
      rect100x150,
      { x: 50, y: -10 },
      { x: 50, y: 160 },
    );
    const { halfA, halfB, splitMap } = splitOutlineAtSlash(rect100x150, hit1, hit2);

    expect(splitMap.halfAIndices).toHaveLength(halfA.length);
    expect(splitMap.halfBIndices).toHaveLength(halfB.length);
  });

  it('splitMap indices use -1 for inserted commands (cut points)', () => {
    const [hit1, hit2] = findSlashIntersections(
      rect100x150,
      { x: 50, y: -10 },
      { x: 50, y: 160 },
    );
    const { splitMap } = splitOutlineAtSlash(rect100x150, hit1, hit2);

    // M commands at split points and the closing L commands are inserted (-1)
    const allIndices = [...splitMap.halfAIndices, ...splitMap.halfBIndices];
    expect(allIndices.some(i => i === -1)).toBe(true);
  });
});
