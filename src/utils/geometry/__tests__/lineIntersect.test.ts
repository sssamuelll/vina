import { describe, it, expect } from 'vitest';
import {
  lineSegmentIntersection,
  linePolylineIntersections,
} from '../lineIntersect';

describe('lineSegmentIntersection', () => {
  it('returns intersection point for crossing segments', () => {
    const result = lineSegmentIntersection(
      { x: 0, y: 5 }, { x: 10, y: 5 },
      { x: 5, y: 0 }, { x: 5, y: 10 },
    );
    expect(result).not.toBeNull();
    expect(result!.point.x).toBeCloseTo(5);
    expect(result!.point.y).toBeCloseTo(5);
    expect(result!.t).toBeCloseTo(0.5);
  });

  it('returns null for parallel segments', () => {
    const result = lineSegmentIntersection(
      { x: 0, y: 0 }, { x: 10, y: 0 },
      { x: 0, y: 5 }, { x: 10, y: 5 },
    );
    expect(result).toBeNull();
  });

  it('returns null for non-crossing segments', () => {
    const result = lineSegmentIntersection(
      { x: 0, y: 0 }, { x: 1, y: 0 },
      { x: 5, y: 5 }, { x: 5, y: 10 },
    );
    expect(result).toBeNull();
  });

  it('returns correct t parameter along the segment', () => {
    const result = lineSegmentIntersection(
      { x: 0, y: 2.5 }, { x: 10, y: 2.5 },
      { x: 5, y: 0 }, { x: 5, y: 10 },
    );
    expect(result).not.toBeNull();
    expect(result!.t).toBeCloseTo(0.25);
  });

  it('handles diagonal lines', () => {
    const result = lineSegmentIntersection(
      { x: 0, y: 0 }, { x: 10, y: 10 },
      { x: 0, y: 10 }, { x: 10, y: 0 },
    );
    expect(result).not.toBeNull();
    expect(result!.point.x).toBeCloseTo(5);
    expect(result!.point.y).toBeCloseTo(5);
  });
});

describe('linePolylineIntersections', () => {
  it('finds two intersections through a square', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 0, y: 0 },
    ];
    const hits = linePolylineIntersections(
      { x: -5, y: 5 }, { x: 15, y: 5 },
      square,
    );
    expect(hits).toHaveLength(2);
    expect(hits[0].point.x).toBeCloseTo(0);
    expect(hits[0].point.y).toBeCloseTo(5);
    expect(hits[1].point.x).toBeCloseTo(10);
    expect(hits[1].point.y).toBeCloseTo(5);
  });

  it('returns segment indices', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 0, y: 0 },
    ];
    const hits = linePolylineIntersections(
      { x: -5, y: 5 }, { x: 15, y: 5 },
      square,
    );
    expect(hits.map(h => h.segmentIndex).sort()).toEqual([1, 3]);
  });

  it('returns empty for line that misses polygon', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 0, y: 0 },
    ];
    const hits = linePolylineIntersections(
      { x: -5, y: 15 }, { x: 15, y: 15 },
      square,
    );
    expect(hits).toHaveLength(0);
  });

  it('handles triangle', () => {
    const triangle = [
      { x: 5, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 5, y: 0 },
    ];
    const hits = linePolylineIntersections(
      { x: -5, y: 5 }, { x: 15, y: 5 },
      triangle,
    );
    expect(hits).toHaveLength(2);
  });
});
