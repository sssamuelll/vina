import { describe, it, expect } from 'vitest';
import { classifySegment, extractSegments, calculateRatios, calculateCurvatureDensity, detectLandmarks, type SegmentInfo } from '../geometryClassifier';
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

describe('Geometry Classifier - Edge Cases', () => {
  describe('Empty outlines', () => {
    it('should return empty array for empty outline', () => {
      const segments = extractSegments([]);
      expect(segments).toHaveLength(0);
    });

    it('should return empty array for outline with only M command', () => {
      const outline: PathCommand[] = [{ type: 'M', values: [0, 0] }];
      const segments = extractSegments(outline);
      expect(segments).toHaveLength(0);
    });

    it('should return empty array for outline with only M and Z commands at same point', () => {
      const outline: PathCommand[] = [
        { type: 'M', values: [10, 10] },
        { type: 'Z', values: [] },
      ];
      const segments = extractSegments(outline);
      expect(segments).toHaveLength(0); // Z at same point creates no segment
    });
  });

  describe('Degenerate curves (zero-length segments)', () => {
    it('should handle zero-length line segment', () => {
      const segment: PathCommand = { type: 'L', values: [0, 0] };
      const prevPoint = { x: 0, y: 0 };
      const result = classifySegment(segment, prevPoint);
      expect(result.type).toBe('straight');
      expect(result.length).toBe(0);
    });

    it('should handle zero-length cubic bezier (all points coincident)', () => {
      const segment: PathCommand = { type: 'C', values: [5, 5, 5, 5, 5, 5] };
      const prevPoint = { x: 5, y: 5 };
      const result = classifySegment(segment, prevPoint);
      expect(result.type).toBe('straight'); // Degenerate curve = straight
      expect(result.length).toBeCloseTo(0); // Use toBeCloseTo for floating point
    });

    it('should handle zero-length quadratic bezier (all points coincident)', () => {
      const segment: PathCommand = { type: 'Q', values: [10, 10, 10, 10] };
      const prevPoint = { x: 10, y: 10 };
      const result = classifySegment(segment, prevPoint);
      expect(result.type).toBe('straight');
      expect(result.length).toBeCloseTo(0); // Use toBeCloseTo for floating point
    });

    it('should handle zero-length horizontal line', () => {
      const segment: PathCommand = { type: 'H', values: [50] };
      const prevPoint = { x: 50, y: 25 };
      const result = classifySegment(segment, prevPoint);
      expect(result.type).toBe('straight');
      expect(result.length).toBe(0);
    });

    it('should handle zero-length vertical line', () => {
      const segment: PathCommand = { type: 'V', values: [25] };
      const prevPoint = { x: 50, y: 25 };
      const result = classifySegment(segment, prevPoint);
      expect(result.type).toBe('straight');
      expect(result.length).toBe(0);
    });
  });

  describe('Array bounds checking', () => {
    it('should handle L command with insufficient values', () => {
      const segment: PathCommand = { type: 'L', values: [100] }; // Missing y
      const prevPoint = { x: 0, y: 0 };
      const result = classifySegment(segment, prevPoint);
      expect(result.type).toBe('straight');
      expect(result.length).toBe(0);
      expect(result.end).toEqual(prevPoint);
    });

    it('should handle C command with insufficient values', () => {
      const segment: PathCommand = { type: 'C', values: [25, -20, 75] }; // Missing 3 values
      const prevPoint = { x: 0, y: 0 };
      const result = classifySegment(segment, prevPoint);
      expect(result.type).toBe('straight');
      expect(result.length).toBe(0);
    });

    it('should handle Q command with insufficient values', () => {
      const segment: PathCommand = { type: 'Q', values: [25, 20] }; // Missing end point
      const prevPoint = { x: 0, y: 0 };
      const result = classifySegment(segment, prevPoint);
      expect(result.type).toBe('straight');
      expect(result.length).toBe(0);
    });

    it('should handle M command with insufficient values in extractSegments', () => {
      const outline: PathCommand[] = [
        { type: 'M', values: [] }, // Missing coordinates
        { type: 'L', values: [100, 0] },
      ];
      const segments = extractSegments(outline);
      // Should still process L command with default start point (0,0)
      expect(segments).toHaveLength(1);
    });

    it('should handle empty values array', () => {
      const segment: PathCommand = { type: 'L', values: [] };
      const prevPoint = { x: 10, y: 20 };
      const result = classifySegment(segment, prevPoint);
      expect(result.type).toBe('straight');
      expect(result.length).toBe(0);
      expect(result.end).toEqual(prevPoint);
    });
  });
});

describe('Geometry Classifier - Ratio Analysis', () => {
  it('should calculate segment length ratios', () => {
    const segments: SegmentInfo[] = [
      { type: 'straight', length: 100, start: { x: 0, y: 0 }, end: { x: 100, y: 0 } },
      { type: 'concave', length: 50, start: { x: 100, y: 0 }, end: { x: 100, y: 50 } },
      { type: 'straight', length: 100, start: { x: 100, y: 50 }, end: { x: 0, y: 50 } },
      { type: 'straight', length: 50, start: { x: 0, y: 50 }, end: { x: 0, y: 0 } },
    ];

    const ratios = calculateRatios(segments);

    // Longest to total perimeter
    expect(ratios.longestToPerimeter).toBeCloseTo(100 / 300);
    // First to second segment
    expect(ratios.seg0ToSeg1).toBeCloseTo(100 / 50);
  });

  it('should calculate curvature density', () => {
    const segments: SegmentInfo[] = [
      { type: 'straight', length: 100, start: { x: 0, y: 0 }, end: { x: 100, y: 0 } },
      { type: 'convex', length: 50, start: { x: 100, y: 0 }, end: { x: 100, y: 50 } },
      { type: 'straight', length: 100, start: { x: 100, y: 50 }, end: { x: 0, y: 50 } },
      { type: 'concave', length: 50, start: { x: 0, y: 50 }, end: { x: 0, y: 0 } },
    ];

    const density = calculateCurvatureDensity(segments);
    // 100 curved out of 300 total = 0.333
    expect(density).toBeCloseTo(100 / 300, 1);
  });
});

describe('Geometry Classifier - Landmark Detection', () => {
  it('should detect neckline from concave curve at top', () => {
    // Simulated bodice front shape: neckline is concave at top-center
    const segments: SegmentInfo[] = [
      { type: 'straight', length: 30, start: { x: 0, y: 100 }, end: { x: 0, y: 70 }, commandIndex: 1 },  // center front
      { type: 'concave', length: 20, start: { x: 0, y: 70 }, end: { x: 20, y: 60 }, commandIndex: 2 },   // neckline
      { type: 'straight', length: 15, start: { x: 20, y: 60 }, end: { x: 35, y: 55 }, commandIndex: 3 }, // shoulder
      { type: 'concave', length: 25, start: { x: 35, y: 55 }, end: { x: 40, y: 80 }, commandIndex: 4 },  // armhole
      { type: 'straight', length: 50, start: { x: 40, y: 80 }, end: { x: 35, y: 130 }, commandIndex: 5 },// side seam
      { type: 'straight', length: 35, start: { x: 35, y: 130 }, end: { x: 0, y: 130 }, commandIndex: 6 }, // hemline
    ];

    const landmarks = detectLandmarks(segments);

    // Should detect neckline
    const neckline = landmarks.find(l => l.label === 'neckline');
    expect(neckline).toBeDefined();
    expect(neckline?.edgeIndex).toBe(2); // The concave curve at top
    expect(neckline?.confidence).toBeGreaterThan(0.5);
  });

  it('should detect armhole from concave curve on side', () => {
    const segments: SegmentInfo[] = [
      { type: 'straight', length: 30, start: { x: 0, y: 100 }, end: { x: 0, y: 70 }, commandIndex: 1 },
      { type: 'concave', length: 20, start: { x: 0, y: 70 }, end: { x: 20, y: 60 }, commandIndex: 2 },
      { type: 'straight', length: 15, start: { x: 20, y: 60 }, end: { x: 35, y: 55 }, commandIndex: 3 },
      { type: 'concave', length: 25, start: { x: 35, y: 55 }, end: { x: 40, y: 80 }, commandIndex: 4 },
      { type: 'straight', length: 50, start: { x: 40, y: 80 }, end: { x: 35, y: 130 }, commandIndex: 5 },
      { type: 'straight', length: 35, start: { x: 35, y: 130 }, end: { x: 0, y: 130 }, commandIndex: 6 },
    ];

    const landmarks = detectLandmarks(segments);

    const armhole = landmarks.find(l => l.label === 'armhole');
    expect(armhole).toBeDefined();
    expect(armhole?.edgeIndex).toBe(4); // The concave curve on side
  });
});
