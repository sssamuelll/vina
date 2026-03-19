import { describe, it, expect } from 'vitest';
import { standardGradeTable, scaleOutline, gradePiece, gradePoints } from '../utils/grading';
import type { GradedPoint, GradingOptions } from '../utils/grading';
import type { PathCommand, PatternPiece } from '../types/types';

describe('Grading System', () => {
  it('standardGradeTable returns all 6 sizes', () => {
    const table = standardGradeTable();
    const sizes = Object.keys(table.sizes);
    expect(sizes).toEqual(['XS', 'S', 'M', 'L', 'XL', 'XXL']);
    expect(table.sizes['M']!.chest).toBe(88);
  });

  it('scaleOutline scales correctly (2x)', () => {
    const outline: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 100] },
      { type: 'Z', values: [] },
    ];
    const scaled = scaleOutline(outline, 2);
    expect(scaled[1].values[0]).toBe(200);
    expect(scaled[1].values[1]).toBe(0);
    expect(scaled[2].values[0]).toBe(200);
    expect(scaled[2].values[1]).toBe(200);
  });

  it('scaleOutline with center point', () => {
    const outline: PathCommand[] = [
      { type: 'M', values: [10, 10] },
      { type: 'L', values: [20, 10] },
    ];
    const scaled = scaleOutline(outline, 2, { x: 10, y: 10 });
    expect(scaled[0].values[0]).toBe(10);
    expect(scaled[0].values[1]).toBe(10);
    expect(scaled[1].values[0]).toBe(30);
    expect(scaled[1].values[1]).toBe(10);
  });

  it('gradePiece scales proportionally based on chest ratio', () => {
    const piece: PatternPiece = {
      id: '1', name: 'Test', outline: [
        { type: 'M', values: [0, 0] },
        { type: 'L', values: [100, 0] },
        { type: 'L', values: [100, 100] },
        { type: 'Z', values: [] },
      ],
      internals: [], position: { x: 0, y: 0 }, rotation: 0,
      mirrored: false, seamAllowance: 0, layer: 1, sublayer: 0, createdAt: Date.now(), updatedAt: Date.now(),
    };
    const graded = gradePiece(piece, { chest: 88 }, { chest: 96 });
    const ratio = 96 / 88;
    // Scaling is now from centroid, not origin — verify piece grew proportionally
    const baseWidth = 100; // L(100,0) - M(0,0)
    const gradedWidth = graded.outline[1].values[0] - graded.outline[0].values[0];
    expect(gradedWidth).toBeCloseTo(baseWidth * ratio);
  });

  it('gradePoints applies delta rules correctly', () => {
    const points: GradedPoint[] = [
      { x: 0, y: 0, rules: [{ measurement: 'chest', deltaX: 2.5, deltaY: 0 }] },
      { x: 100, y: 0, rules: [{ measurement: 'chest', deltaX: 2.5, deltaY: 0 }] },
    ];
    const options: GradingOptions = {
      baseSize: 'M',
      targetSize: 'L',
      gradeTable: standardGradeTable(),
      baseMeasurements: { chest: 88 },
    };
    const result = gradePoints(points, options);
    // L chest=92, delta=4cm, dx=2.5*4=10
    expect(result[0].x).toBeCloseTo(10);
    expect(result[1].x).toBeCloseTo(110);
  });

  it('same base and target size → no change', () => {
    const points: GradedPoint[] = [
      { x: 50, y: 50, rules: [{ measurement: 'chest', deltaX: 2, deltaY: 1 }] },
    ];
    const options: GradingOptions = {
      baseSize: 'M',
      targetSize: 'M',
      gradeTable: standardGradeTable(),
      baseMeasurements: { chest: 88 },
    };
    const result = gradePoints(points, options);
    expect(result[0].x).toBe(50);
    expect(result[0].y).toBe(50);
  });
});
