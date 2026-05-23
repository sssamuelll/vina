/**
 * Unit tests for the shared measurement derivation helper.
 *
 * The behaviour locked here was previously inlined in
 * `src/copilot/action/tools/definitions/seamlyTools.ts:140-179`. Lifting
 * it didn't change the algorithm, but the tests below freeze the contract
 * so future edits to the derivation factors are conscious decisions, not
 * accidents. The factors themselves (h * 0.58 for waist height, etc.) are
 * domain knowledge calibrated against the existing pattern catalog.
 */
import { describe, it, expect } from 'vitest';
import { deriveMeasurements, MEAS_MAPPING } from '../measurementDerivation';

describe('MEAS_MAPPING', () => {
  it('translates the primary 7 avatar fields to canonical Seamly2D names', () => {
    expect(MEAS_MAPPING.height).toBe('height');
    expect(MEAS_MAPPING.chest).toBe('bust_circ');
    expect(MEAS_MAPPING.waist).toBe('waist_circ');
    expect(MEAS_MAPPING.hips).toBe('hip_circ');
    expect(MEAS_MAPPING.shoulder).toBe('shoulder_length');
    expect(MEAS_MAPPING.armLength).toBe('arm_shoulder_tip_to_wrist_bent');
    expect(MEAS_MAPPING.inseam).toBe('leg_crotch_to_floor');
  });
});

describe('deriveMeasurements', () => {
  const baseUser = { height: 170, chest: 92, waist: 74, hips: 98 };

  it('fills in height_waist_side when referenced in formulas and missing from defaults', () => {
    const out = deriveMeasurements({
      userMeas: baseUser,
      patternDefaults: {},
      allFormulas: 'height_waist_side / 2 + 3',
    });
    // 170 * 0.58 = 98.6
    expect(out.height_waist_side).toBeCloseTo(98.6, 1);
  });

  it('does NOT fill a measurement that is already in patternDefaults', () => {
    const out = deriveMeasurements({
      userMeas: baseUser,
      patternDefaults: { height_waist_side: 105 },
      allFormulas: 'height_waist_side / 2',
    });
    // Should not override the explicit default
    expect(out.height_waist_side).toBeUndefined();
  });

  it('does NOT fill a measurement that is not referenced anywhere', () => {
    const out = deriveMeasurements({
      userMeas: baseUser,
      patternDefaults: {},
      allFormulas: 'height + bust_circ', // does not mention height_knee
    });
    expect(out.height_knee).toBeUndefined();
  });

  it('cascades: leg_ankle_high_circ depends on leg_ankle_circ being derived first', () => {
    const out = deriveMeasurements({
      userMeas: baseUser,
      patternDefaults: {},
      allFormulas: 'leg_ankle_circ + leg_ankle_high_circ',
    });
    expect(out.leg_ankle_circ).toBe(23);
    expect(out.leg_ankle_high_circ).toBe(25); // 23 + 2
  });

  it('uses user.inseam over the height-fraction fallback for leg_crotch_to_floor', () => {
    const out = deriveMeasurements({
      userMeas: { ...baseUser, inseam: 82 },
      patternDefaults: {},
      allFormulas: 'leg_crotch_to_floor',
    });
    expect(out.leg_crotch_to_floor).toBe(82);
  });

  it('falls back to height*0.45 when inseam is missing', () => {
    const out = deriveMeasurements({
      userMeas: { ...baseUser, inseam: undefined },
      patternDefaults: {},
      allFormulas: 'leg_crotch_to_floor',
    });
    // 170 * 0.45 = 76.5
    expect(out.leg_crotch_to_floor).toBeCloseTo(76.5, 1);
  });

  it('derives neck_circ as 39.5% of bust', () => {
    const out = deriveMeasurements({
      userMeas: baseUser,
      patternDefaults: { bust_circ: 92 },
      allFormulas: 'neck_circ',
    });
    // 92 * 0.395 = 36.34
    expect(out.neck_circ).toBeCloseTo(36.34, 2);
  });

  it('preserves existing overrides (does not overwrite caller-supplied values)', () => {
    const out = deriveMeasurements({
      userMeas: baseUser,
      patternDefaults: {},
      allFormulas: 'height_waist_side',
      existingOverrides: { height_waist_side: 99 },
    });
    expect(out.height_waist_side).toBe(99);
  });

  it('returns an object without mutating the inputs', () => {
    const defaults = { bust_circ: 92 };
    const user = { ...baseUser };
    const existing: Record<string, number> = {};
    const out = deriveMeasurements({
      userMeas: user,
      patternDefaults: defaults,
      allFormulas: 'height_waist_side',
      existingOverrides: existing,
    });
    expect(defaults).toEqual({ bust_circ: 92 });
    expect(user).toEqual(baseUser);
    expect(existing).toEqual({});
    expect(out.height_waist_side).toBeCloseTo(98.6, 1);
  });
});
