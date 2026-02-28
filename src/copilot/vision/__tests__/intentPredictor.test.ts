import { describe, it, expect } from 'vitest';
import { checkAreaIntegrity } from '../intentPredictor';
import type { PathCommand } from '../../../types/types';

describe('Intent Predictor - Area Integrity', () => {
  const validSquare: PathCommand[] = [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [100, 0] },
    { type: 'L', values: [100, 100] },
    { type: 'L', values: [0, 100] },
    { type: 'Z', values: [] },
  ];

  const degenerateSquare: PathCommand[] = [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [100, 0] },
    { type: 'L', values: [100, 0] }, // Collinear points
    { type: 'L', values: [0, 0] },
    { type: 'Z', values: [] },
  ];

  it('should pass for valid polygon with positive area', () => {
    const result = checkAreaIntegrity({ outline: validSquare });

    expect(result.passed).toBe(true);
    expect(result.rule).toBe('area_integrity');
    expect(result.area).toBeGreaterThan(0);
  });

  it('should fail for degenerate polygon with zero area', () => {
    const result = checkAreaIntegrity({ outline: degenerateSquare });

    expect(result.passed).toBe(false);
    expect(result.rule).toBe('area_integrity');
    expect(result.message).toContain('zero');
  });

  it('should fail for polygon below minimum area threshold', () => {
    const tinySquare: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [0.5, 0] },
      { type: 'L', values: [0.5, 0.5] },
      { type: 'L', values: [0, 0.5] },
      { type: 'Z', values: [] },
    ];

    const result = checkAreaIntegrity({ outline: tinySquare, minArea: 1 });

    expect(result.passed).toBe(false);
    expect(result.message).toContain('below minimum');
  });

  it('should handle empty outline', () => {
    const result = checkAreaIntegrity({ outline: [] });

    expect(result.passed).toBe(false);
    expect(result.message).toContain('empty');
  });
});
