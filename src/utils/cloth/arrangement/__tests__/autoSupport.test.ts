import { describe, it, expect } from 'vitest';
import { deriveDimensions } from '../../garmentPlacement';

describe('auto-support precondition (non-circular)', () => {
  it('collar ring diameter (from neckCirc) is narrower than the shoulder span (from shoulder)', () => {
    // independent measured inputs: neckCirc and shoulder are NOT both derived from chest
    const d = deriveDimensions({ height: 168, chest: 88, waist: 72, hips: 96, shoulder: 40, armLength: 60, inseam: 79, neckCirc: 36, upperArmCirc: 28 });
    const ringDiameter = 2 * d.neckR;        // from neckCirc
    const shoulderSpan = d.shoulderWidth;    // from shoulder
    expect(ringDiameter).toBeLessThan(shoulderSpan); // the ring catches on the shoulders
  });
});
