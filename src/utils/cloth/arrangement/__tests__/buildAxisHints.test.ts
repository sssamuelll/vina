import { describe, it, expect, vi } from 'vitest';
import { buildAxisHints } from '../buildAxisHints';
import type { PatternPiece } from '../../../../types/types';
import type { BodyRegion } from '../../garmentPlacement';
import * as gp from '../../garmentPlacement';

describe('buildAxisHints', () => {
  it('maps left/right sleeves to their arm directions, omits torso', () => {
    const pieces: PatternPiece[] = [{ id: 'L' } as PatternPiece, { id: 'R' } as PatternPiece, { id: 'F' } as PatternPiece];
    vi.spyOn(gp, 'computeEffectiveRegions').mockReturnValue(['left-sleeve', 'right-sleeve', 'front-torso'] as BodyRegion[]);
    const hints = buildAxisHints(pieces, { left: [-0.9, -0.4, 0], right: [0.9, -0.4, 0], ready: true });
    expect(hints).toEqual({ L: [-0.9, -0.4, 0], R: [0.9, -0.4, 0] });
  });
  it('omits a side whose direction is null', () => {
    const pieces: PatternPiece[] = [{ id: 'L' } as PatternPiece, { id: 'R' } as PatternPiece];
    vi.spyOn(gp, 'computeEffectiveRegions').mockReturnValue(['left-sleeve', 'right-sleeve'] as BodyRegion[]);
    const hints = buildAxisHints(pieces, { left: null, right: [1, 0, 0], ready: true });
    expect(hints).toEqual({ R: [1, 0, 0] });
  });
});
