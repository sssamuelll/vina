import { describe, it, expect, vi } from 'vitest';
import { buildAxisHints } from '../buildAxisHints';
import type { PatternPiece } from '../../../../types/types';
import type { BodyRegion } from '../../garmentPlacement';
import * as gp from '../../garmentPlacement';

describe('buildAxisHints', () => {
  it('cross-maps each sleeve to the arm on the body SIDE surfaceFrame places it', () => {
    const pieces: PatternPiece[] = [{ id: 'L' } as PatternPiece, { id: 'R' } as PatternPiece, { id: 'F' } as PatternPiece];
    vi.spyOn(gp, 'computeEffectiveRegions').mockReturnValue(['left-sleeve', 'right-sleeve', 'front-torso'] as BodyRegion[]);
    // Realistic avatar (faces +Z): anatomical-left arm points +X, right arm −X.
    // surfaceFrame places `left-sleeve` on the −X side, so it must take the −X arm
    // (armAxis.right); `right-sleeve` (+X side) takes armAxis.left. See HANDEDNESS
    // in buildAxisHints — the naive same-name map sent sleeves across the body (#924).
    const hints = buildAxisHints(pieces, { left: [0.9, -0.4, 0], right: [-0.9, -0.4, 0], ready: true });
    expect(hints).toEqual({ L: [-0.9, -0.4, 0], R: [0.9, -0.4, 0] });
  });
  it('omits a sleeve whose corresponding-side arm direction is null', () => {
    const pieces: PatternPiece[] = [{ id: 'L' } as PatternPiece, { id: 'R' } as PatternPiece];
    vi.spyOn(gp, 'computeEffectiveRegions').mockReturnValue(['left-sleeve', 'right-sleeve'] as BodyRegion[]);
    // left-sleeve ← armAxis.right (null here → omitted); right-sleeve ← armAxis.left.
    const hints = buildAxisHints(pieces, { left: [1, 0, 0], right: null, ready: true });
    expect(hints).toEqual({ R: [1, 0, 0] });
  });
});
