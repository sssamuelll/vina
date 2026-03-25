import { describe, it, expect } from 'vitest';
import {
  offsetEdge,
  lineIntersection,
  interiorAngle,
  bisectorDirection,
} from '../cornerTypes';
import type { Line2D } from '../cornerTypes';

// ─── offsetEdge ──────────────────────────────────────────────────────────────

describe('offsetEdge', () => {
  it('offsets horizontal edge upward (negative y) by saWidth', () => {
    // Edge going right: (0,0)→(100,0). Perpendicular to the left is (0,-1).
    const edge: Line2D = { start: { x: 0, y: 0 }, end: { x: 100, y: 0 } };
    const result = offsetEdge(edge, 10);
    expect(result.start.x).toBeCloseTo(0);
    expect(result.start.y).toBeCloseTo(-10);
    expect(result.end.x).toBeCloseTo(100);
    expect(result.end.y).toBeCloseTo(-10);
  });

  it('offsets vertical edge rightward by saWidth', () => {
    // Edge going up: (0,0)→(0,100). Perpendicular to the left is (1,0).
    const edge: Line2D = { start: { x: 0, y: 0 }, end: { x: 0, y: 100 } };
    const result = offsetEdge(edge, 10);
    expect(result.start.x).toBeCloseTo(10);
    expect(result.start.y).toBeCloseTo(0);
    expect(result.end.x).toBeCloseTo(10);
    expect(result.end.y).toBeCloseTo(100);
  });

  it('zero-length edge returns same edge', () => {
    const edge: Line2D = { start: { x: 5, y: 5 }, end: { x: 5, y: 5 } };
    const result = offsetEdge(edge, 10);
    expect(result.start.x).toBeCloseTo(5);
    expect(result.start.y).toBeCloseTo(5);
    expect(result.end.x).toBeCloseTo(5);
    expect(result.end.y).toBeCloseTo(5);
  });
});

// ─── lineIntersection ────────────────────────────────────────────────────────

describe('lineIntersection', () => {
  it('finds intersection of perpendicular lines', () => {
    // Horizontal line through y=5 and vertical line through x=5 meet at (5,5)
    const horiz: Line2D = { start: { x: 0, y: 5 }, end: { x: 10, y: 5 } };
    const vert: Line2D = { start: { x: 5, y: 0 }, end: { x: 5, y: 10 } };
    const result = lineIntersection(horiz, vert);
    expect(result).not.toBeNull();
    expect(result!.x).toBeCloseTo(5);
    expect(result!.y).toBeCloseTo(5);
  });

  it('returns null for parallel lines', () => {
    const a: Line2D = { start: { x: 0, y: 0 }, end: { x: 10, y: 0 } };
    const b: Line2D = { start: { x: 0, y: 5 }, end: { x: 10, y: 5 } };
    expect(lineIntersection(a, b)).toBeNull();
  });

  it('handles diagonal lines', () => {
    // y=x and y=-x+2 intersect at (1,1)
    const a: Line2D = { start: { x: 0, y: 0 }, end: { x: 2, y: 2 } };
    const b: Line2D = { start: { x: 0, y: 2 }, end: { x: 2, y: 0 } };
    const result = lineIntersection(a, b);
    expect(result).not.toBeNull();
    expect(result!.x).toBeCloseTo(1);
    expect(result!.y).toBeCloseTo(1);
  });
});

// ─── interiorAngle ────────────────────────────────────────────────────────────

describe('interiorAngle', () => {
  it('returns PI/2 for right angle', () => {
    // prev: going right, next: going up — 90° between directions
    const prev: Line2D = { start: { x: 0, y: 0 }, end: { x: 10, y: 0 } };
    const next: Line2D = { start: { x: 10, y: 0 }, end: { x: 10, y: 10 } };
    expect(interiorAngle(prev, next)).toBeCloseTo(Math.PI / 2);
  });

  it('returns PI/4 for 45-degree angle', () => {
    // prev: going right (1,0), next: going at 45° (1,1) normalized
    const prev: Line2D = { start: { x: 0, y: 0 }, end: { x: 10, y: 0 } };
    const next: Line2D = { start: { x: 10, y: 0 }, end: { x: 20, y: 10 } };
    expect(interiorAngle(prev, next)).toBeCloseTo(Math.PI / 4);
  });

  it('returns PI for antiparallel edges (180 degrees between direction vectors)', () => {
    // prev going right (1,0) and next going left (-1,0) → angle between directions = PI
    const prev: Line2D = { start: { x: 0, y: 0 }, end: { x: 10, y: 0 } };
    const next: Line2D = { start: { x: 10, y: 0 }, end: { x: 0, y: 0 } };
    expect(interiorAngle(prev, next)).toBeCloseTo(Math.PI);
  });
});

// ─── bisectorDirection ────────────────────────────────────────────────────────

describe('bisectorDirection', () => {
  it('returns unit vector along bisector for right angle', () => {
    // prev going right (1,0), next going up (0,1) — bisector is (1,1)/sqrt(2)
    const prev: Line2D = { start: { x: 0, y: 0 }, end: { x: 10, y: 0 } };
    const next: Line2D = { start: { x: 10, y: 0 }, end: { x: 10, y: 10 } };
    const result = bisectorDirection(prev, next);
    expect(result.x).toBeCloseTo(1 / Math.SQRT2);
    expect(result.y).toBeCloseTo(1 / Math.SQRT2);
  });

  it('length is approximately 1', () => {
    const prev: Line2D = { start: { x: 0, y: 0 }, end: { x: 10, y: 5 } };
    const next: Line2D = { start: { x: 10, y: 5 }, end: { x: 20, y: 0 } };
    const result = bisectorDirection(prev, next);
    const len = Math.sqrt(result.x * result.x + result.y * result.y);
    expect(len).toBeCloseTo(1);
  });
});
