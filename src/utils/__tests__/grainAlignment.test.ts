import { describe, it, expect } from 'vitest';
import { grainAlignmentRotation } from '../grainLine';
import type { InternalLine, PatternPiece } from '../../types/types';

// A grainline internal line from (0,0) along (dx,dy), in render (y-down) coords.
const grain = (dx: number, dy: number): InternalLine => ({
  id: 'gl',
  type: 'grainline',
  path: [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [dx, dy] },
  ],
});

const withInternals = (...internals: InternalLine[]): Pick<PatternPiece, 'internals'> => ({ internals });

const deg = (d: number) => ({ dx: Math.sin((d * Math.PI) / 180), dy: Math.cos((d * Math.PI) / 180) });

describe('grainAlignmentRotation', () => {
  it('returns 0 when the piece has no grainline (nothing to align to)', () => {
    expect(grainAlignmentRotation(withInternals())).toBe(0);
    expect(grainAlignmentRotation(withInternals({ id: 'd', type: 'dart', path: [{ type: 'M', values: [0, 0] }, { type: 'L', values: [1, 1] }] }))).toBe(0);
  });

  it('returns 0 for a degenerate grainline (no length)', () => {
    expect(grainAlignmentRotation(withInternals(grain(0, 0)))).toBe(0);
  });

  it('returns 0 for an already-vertical grainline (either direction)', () => {
    expect(grainAlignmentRotation(withInternals(grain(0, 10)))).toBeCloseTo(0, 5);
    expect(grainAlignmentRotation(withInternals(grain(0, -10)))).toBeCloseTo(0, 5); // pointing up — still vertical
  });

  it('rotates a horizontal grainline by 90° to make it vertical', () => {
    expect(grainAlignmentRotation(withInternals(grain(10, 0)))).toBeCloseTo(90, 4);
  });

  it('makes a grainline tilted 10° vertical with a 10° turn (signed)', () => {
    const a = deg(10);
    expect(grainAlignmentRotation(withInternals(grain(a.dx, a.dy)))).toBeCloseTo(10, 3);
    const b = deg(-10);
    expect(grainAlignmentRotation(withInternals(grain(b.dx, b.dy)))).toBeCloseTo(-10, 3);
  });

  it('aligns a 45° bias grainline to vertical', () => {
    expect(grainAlignmentRotation(withInternals(grain(7.07, 7.07)))).toBeCloseTo(45, 2);
  });

  it('actually verticalizes the grainline (rotating its vector by the result yields dx≈0)', () => {
    for (const d of [7, -23, 61, -88, 130]) {
      const { dx, dy } = deg(d);
      const R = (grainAlignmentRotation(withInternals(grain(dx, dy))) * Math.PI) / 180;
      const dxRot = dx * Math.cos(R) - dy * Math.sin(R); // SVG rotate(R) applied to the vector
      expect(dxRot).toBeCloseTo(0, 5);
    }
  });

  it('keeps the rotation minimal — within (-90, 90]', () => {
    for (const d of [-179, -120, -91, 91, 150, 179]) {
      const { dx, dy } = deg(d);
      const R = grainAlignmentRotation(withInternals(grain(dx, dy)));
      expect(R).toBeGreaterThan(-90);
      expect(R).toBeLessThanOrEqual(90);
    }
  });
});
