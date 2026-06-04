import { describe, it, expect } from 'vitest';
import { dartApexPoint } from '../internalLineStyle';
import type { PathCommand } from '../../../../types/types';

describe('dartApexPoint', () => {
  it('finds the apex of a simple V dart (the farthest-from-chord vertex)', () => {
    // base1 (0,0) → apex (5,20) → base2 (10,0); chord is the x-axis
    const dart: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [5, 20] },
      { type: 'L', values: [10, 0] },
    ];
    expect(dartApexPoint(dart)).toEqual({ x: 5, y: 20 });
  });

  it('handles a curved-cap dart (uses the curve endpoint)', () => {
    const dart: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'C', values: [2, 10, 4, 18, 5, 22] }, // endpoint (5,22) is the apex
      { type: 'L', values: [10, 0] },
    ];
    expect(dartApexPoint(dart)).toEqual({ x: 5, y: 22 });
  });

  it('returns null for a degenerate two-point path', () => {
    const line: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [10, 0] },
    ];
    expect(dartApexPoint(line)).toBeNull();
  });
});
