/**
 * Regression guard for #518 — hybrid (absolute + relative) length tolerance.
 *
 * `lengthSimilarity` used a fixed 5 mm absolute tolerance in its Gaussian falloff.
 * For garment edges hundreds of mm long that was far too strict: real seam
 * partners differ by more than 5 mm from seam allowance, curve-sampling, and
 * measurement rounding, so generic-named patterns (t-shirt / blouse pieces all
 * called "Detail"/"Detalle") could not form their length-based seams.
 *
 * The tolerance is now max(5 mm, 8% of the shorter edge). These tests lock in that
 * (a) large near-equal edges that used to score ~0 now score usefully, and
 * (b) small edges keep the tight absolute guard so tiny edges don't over-match.
 */
import { describe, it, expect } from 'vitest';
import { lengthSimilarity } from '../arcLengthMatcher';

describe('#518 — hybrid length tolerance (relative for large edges)', () => {
  it('large edges within ~10% now score usefully (used to be ~0)', () => {
    // t-shirt: 293 mm vs 268 mm side/shoulder partners (Δ 8.5%). With the old
    // 5 mm tolerance this was exp(-(25/5)^2) ≈ 0; now it clears the matcher floor.
    expect(lengthSimilarity(293, 268)).toBeGreaterThan(0.15);
    // blouse: 350 mm vs 380 mm (Δ 8.6%).
    expect(lengthSimilarity(350, 380)).toBeGreaterThan(0.2);
  });

  it('near-identical large edges score very high', () => {
    expect(lengthSimilarity(222, 224)).toBeGreaterThan(0.9);
  });

  it('small edges keep the tight absolute guard (no over-matching)', () => {
    // 8% of 10 mm is 0.8 mm < 5 mm floor, so the absolute 5 mm guard dominates:
    // a 10 mm gap on a 10 mm edge must stay a poor match.
    expect(lengthSimilarity(10, 20)).toBeLessThan(0.2);
  });

  it('wildly different edges still score near zero', () => {
    expect(lengthSimilarity(50, 300)).toBeLessThan(0.1);
  });

  it('identical edges score 1 and the metric stays symmetric', () => {
    expect(lengthSimilarity(180, 180)).toBeCloseTo(1, 5);
    expect(lengthSimilarity(120, 360)).toBeCloseTo(lengthSimilarity(360, 120), 10);
  });
});
