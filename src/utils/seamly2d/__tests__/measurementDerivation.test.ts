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
import { deriveMeasurements, MEAS_MAPPING, applyMeasMapping } from '../measurementDerivation';

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

  // ─── Jacket-family detail derivations (#506 follow-up) ───────────────────
  describe('jacket-family detail derivations', () => {
    it('derives bust_arc_f as half of bust_circ', () => {
      const out = deriveMeasurements({
        userMeas: { ...baseUser },
        patternDefaults: {},
        allFormulas: 'bust_arc_f * 2 + 5', // formula references bust_arc_f
        existingOverrides: { bust_circ: 92 },
      });
      expect(out.bust_arc_f).toBeCloseTo(46, 2);
    });

    it('derives indent_neck_back as the anatomical constant 2.4 cm', () => {
      const out = deriveMeasurements({
        userMeas: baseUser,
        patternDefaults: {},
        allFormulas: '0.33 * height + 0.33 * indent_neck_back',
      });
      expect(out.indent_neck_back).toBe(2.4);
    });

    it('derives head_circ from height', () => {
      const out = deriveMeasurements({
        userMeas: baseUser,
        patternDefaults: {},
        allFormulas: 'head_circ',
      });
      // 170 * 0.328 = 55.76
      expect(out.head_circ).toBeCloseTo(55.76, 1);
    });

    it('derives height_neck_back from height', () => {
      const out = deriveMeasurements({
        userMeas: baseUser,
        patternDefaults: {},
        allFormulas: 'height_neck_back',
      });
      // 170 * 0.84 = 142.8
      expect(out.height_neck_back).toBeCloseTo(142.8, 1);
    });

    it('derives neck_mid_circ from bust', () => {
      const out = deriveMeasurements({
        userMeas: baseUser,
        patternDefaults: { bust_circ: 92 },
        allFormulas: 'neck_mid_circ',
      });
      // 92 * 0.395 * 0.94 = 34.16
      expect(out.neck_mid_circ).toBeCloseTo(34.16, 2);
    });

    it('does NOT derive jacket details when patterns do not reference them', () => {
      const out = deriveMeasurements({
        userMeas: baseUser,
        patternDefaults: {},
        allFormulas: 'just bust_circ here', // no jacket-detail references
      });
      expect(out.bust_arc_f).toBeUndefined();
      expect(out.indent_neck_back).toBeUndefined();
      expect(out.head_circ).toBeUndefined();
    });
  });
});

describe('applyMeasMapping', () => {
  it('translates the basic 7 avatar fields to canonical Seamly names when pattern formulas reference them', () => {
    const out = applyMeasMapping(
      { chest: 92, waist: 74, hips: 96, height: 170, shoulder: 44, armLength: 60, inseam: 80 },
      new Set(),
      'bust_circ + waist_circ + hip_circ + height + shoulder_length + arm_shoulder_tip_to_wrist_bent + leg_crotch_to_floor',
    );
    expect(out).toEqual({
      bust_circ: 92,
      waist_circ: 74,
      hip_circ: 96,
      height: 170,
      shoulder_length: 44,
      arm_shoulder_tip_to_wrist_bent: 60,
      leg_crotch_to_floor: 80,
    });
  });

  it('applies mapping even when pattern.measurements.defaults is empty (the jacket bug)', () => {
    // The previous version of this logic gated only on patternKeys.has(),
    // which is empty for every jacket → MEAS_MAPPING never applied →
    // every derived measurement defaulted to 0 in the formula evaluator.
    // The fix: also check formula references.
    const out = applyMeasMapping(
      { chest: 96, height: 180 },
      new Set(), // empty defaults
      '0.2 * bust_circ + 0.07 * height', // formulas reference Seamly canonical names
    );
    expect(out.bust_circ).toBe(96);
    expect(out.height).toBe(180);
  });

  it('skips entries whose user-supplied value is null/undefined', () => {
    const out = applyMeasMapping(
      { chest: 96, waist: undefined },
      new Set(),
      'bust_circ + waist_circ',
    );
    expect(out.bust_circ).toBe(96);
    expect(out).not.toHaveProperty('waist_circ');
  });

  it('skips Seamly names that the pattern never references', () => {
    const out = applyMeasMapping(
      { chest: 96, inseam: 80 },
      new Set(),
      'bust_circ', // only references bust_circ
    );
    expect(out.bust_circ).toBe(96);
    expect(out).not.toHaveProperty('leg_crotch_to_floor');
  });
});
