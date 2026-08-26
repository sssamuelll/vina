import { describe, it, expect } from 'vitest';
import { toPieceLocalPath } from '../internalShapePath';
import type { PathCommand, PatternPiece } from '../../../types/types';

/** Sin girar: estos casos fijan la aritmética base, no el transform (#1068). */
const EN_100_100 = {
  position: { x: 100, y: 100 },
  outline: [] as PathCommand[],
  rotation: 0,
} as Pick<PatternPiece, 'position' | 'outline' | 'rotation'>;

describe('toPieceLocalPath', () => {
  it('subtracts the piece origin from M and L points', () => {
    const path: PathCommand[] = [
      { type: 'M', values: [110, 120] },
      { type: 'L', values: [150, 120] },
    ];
    expect(toPieceLocalPath(path, EN_100_100)).toEqual([
      { type: 'M', values: [10, 20] },
      { type: 'L', values: [50, 20] },
    ]);
  });

  it('shifts all six control values of a cubic curve', () => {
    const path: PathCommand[] = [{ type: 'C', values: [110, 120, 130, 140, 150, 160] }];
    expect(toPieceLocalPath(path, EN_100_100)).toEqual([
      { type: 'C', values: [10, 20, 30, 40, 50, 60] },
    ]);
  });

  it('leaves a Z command untouched and shifts the rest', () => {
    const path: PathCommand[] = [
      { type: 'M', values: [110, 120] },
      { type: 'L', values: [150, 120] },
      { type: 'L', values: [150, 160] },
      { type: 'Z', values: [] },
    ];
    const out = toPieceLocalPath(path, EN_100_100);
    expect(out[3]).toEqual({ type: 'Z', values: [] });
    expect(out[0].values).toEqual([10, 20]);
    expect(out[2].values).toEqual([50, 60]);
  });
});
