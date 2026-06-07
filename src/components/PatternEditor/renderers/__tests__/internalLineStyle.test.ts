import { describe, it, expect } from 'vitest';
import { dartApexPoint, internalLineColor } from '../internalLineStyle';
import type { InternalLine, PathCommand } from '../../../../types/types';

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

describe('internalLineColor', () => {
  const make = (partial: Partial<InternalLine>): InternalLine => ({
    id: 'l1',
    type: 'dart',
    path: [{ type: 'M', values: [0, 0] }, { type: 'L', values: [10, 0] }],
    ...partial,
  });

  it('selection always wins, regardless of line type', () => {
    expect(internalLineColor(make({ type: 'notch' }), true)).toBe('var(--accent-2d)');
    expect(internalLineColor(make({ type: 'topstitch' }), true)).toBe('var(--accent-2d)');
  });

  it('notch gets its own token, distinct from the cut-line ink (requirement: piquetes con color propio)', () => {
    expect(internalLineColor(make({ type: 'notch' }), false)).toBe('var(--notch-2d)');
  });

  it('topstitch uses the thread color when set, token fallback otherwise', () => {
    expect(internalLineColor(make({ type: 'topstitch', topstitchOptions: { threadColor: '#aa3344' } as InternalLine['topstitchOptions'] }), false))
      .toBe('#aa3344');
    expect(internalLineColor(make({ type: 'topstitch' }), false)).toBe('var(--topstitch-2d)');
  });

  it('reference and pleat recede to the lightest ink', () => {
    expect(internalLineColor(make({ type: 'reference' }), false)).toBe('var(--ink-on-light-3)');
    expect(internalLineColor(make({ type: 'pleat' }), false)).toBe('var(--ink-on-light-3)');
  });

  it('grainline, dart, fold default to the mid ink', () => {
    expect(internalLineColor(make({ type: 'grainline' }), false)).toBe('var(--ink-on-light-2)');
    expect(internalLineColor(make({ type: 'dart' }), false)).toBe('var(--ink-on-light-2)');
    expect(internalLineColor(make({ type: 'fold' }), false)).toBe('var(--ink-on-light-2)');
  });
});
