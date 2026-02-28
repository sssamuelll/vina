import { describe, it, expect } from 'vitest';
import { classifySegment, extractSegments } from '../geometryClassifier';
import type { PathCommand } from '../../../types/types';

describe('Geometry Classifier - Segment Analysis', () => {
  it('should classify a straight line segment', () => {
    // L command = straight line
    const segment: PathCommand = { type: 'L', values: [100, 0] };
    const prevPoint = { x: 0, y: 0 };
    const result = classifySegment(segment, prevPoint);
    expect(result.type).toBe('straight');
    expect(result.length).toBeCloseTo(100);
  });

  it('should classify a convex curve (bulging outward)', () => {
    // C command with control points above the line = convex (viewed from outside)
    const segment: PathCommand = { type: 'C', values: [25, -20, 75, -20, 100, 0] };
    const prevPoint = { x: 0, y: 0 };
    const result = classifySegment(segment, prevPoint);
    expect(result.type).toBe('convex');
  });

  it('should classify a concave curve (bulging inward)', () => {
    // C command with control points below the line = concave
    const segment: PathCommand = { type: 'C', values: [25, 20, 75, 20, 100, 0] };
    const prevPoint = { x: 0, y: 0 };
    const result = classifySegment(segment, prevPoint);
    expect(result.type).toBe('concave');
  });

  it('should extract all segments from an outline', () => {
    const outline: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 50] },
      { type: 'L', values: [0, 50] },
      { type: 'Z', values: [] },
    ];
    const segments = extractSegments(outline);
    expect(segments).toHaveLength(4); // 3 L commands + closing Z
    expect(segments[0].type).toBe('straight');
    expect(segments[1].type).toBe('straight');
  });
});
