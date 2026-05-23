/**
 * Seamly2D measurement derivation — shared between the copilot tool path
 * (`seamlyTools.ts`) and the e2e Template Library path (`TemplateLibrary.tsx`).
 *
 * Two responsibilities:
 *   1. `MEAS_MAPPING` — translate from OpenClo internal avatar field names
 *      (`chest`, `height`, …) to canonical Seamly2D measurement names
 *      (`bust_circ`, `waist_circ`, …) referenced by pattern formulas.
 *   2. `deriveMeasurements` — fill in detailed measurements (~10) that
 *      patterns reference but the user did not supply, derived from the
 *      7 basic avatar measurements via empirically calibrated ratios.
 *
 * The derivation factors (h * 0.58 for waist height, etc.) are calibrated
 * against the existing Seamly2D pattern catalog and MUST NOT be redesigned
 * here — they are domain knowledge baked into the working code path.
 *
 * Why a shared helper:
 *   - `seamlyTools.ts:loadSeamlyPattern` (copilot path) already had this
 *     logic inline and was the only path getting it right.
 *   - `TemplateLibrary.tsx:handleGenerate` (the path the e2e test exercises)
 *     was passing only the 7 basic measurements to `adaptSeamlyPattern`,
 *     so patterns that reference detailed measurements (`bust_arc_f`,
 *     `indent_neck_back`, `height_neck_back`, etc.) saw empty defaults and
 *     produced degenerate geometry (73% of jacket points collapsed to
 *     origin per the v8 plan diagnostic).
 */

/**
 * Avatar-field → Seamly2D measurement-name mapping.
 *
 * Keys are OpenClo internal `BodyMeasurements` field names (camelCase /
 * single-word). Values are the canonical Seamly2D measurement names
 * (snake_case) referenced by the converted pattern JSONs.
 */
export const MEAS_MAPPING: Record<string, string> = {
  // Primary
  height: 'height',
  chest: 'bust_circ',
  waist: 'waist_circ',
  hips: 'hip_circ',
  shoulder: 'shoulder_length',
  armLength: 'arm_shoulder_tip_to_wrist_bent',
  inseam: 'leg_crotch_to_floor',
  // Torso
  neckCirc: 'neck_circ',
  // Vertical heights
  kneeHeight: 'height_knee',
  waistHeight: 'height_waist_side',
  // Lengths back
  neckToWaistBack: 'neck_back_to_waist_b',
  waistToFloor: 'leg_waist_side_to_floor',
  crotchLength: 'leg_crotch_to_floor', // alias
  // Legs
  kneeCirc: 'leg_knee_circ',
  ankleCirc: 'leg_ankle_circ',
  // Arms
  wristCirc: 'hand_circ', // closest match
};

export interface DeriveOptions {
  /** Avatar measurements keyed by OpenClo internal field names (height, chest, etc.) */
  userMeas: Record<string, number | undefined>;
  /** Pattern's measurements.defaults block (may be empty {}) */
  patternDefaults: Record<string, number>;
  /** All formula strings concatenated, used to scan for which measurements are referenced. */
  allFormulas: string;
  /** Pattern's keys (Object.keys(patternDefaults)) — for fast membership check. Optional. */
  patternKeys?: Set<string>;
  /**
   * Already-resolved overrides (Seamly-name keyed) that take precedence —
   * the caller already mapped MEAS_MAPPING entries; this function only
   * fills the cascade of derived detail measurements.
   */
  existingOverrides?: Record<string, number>;
}

/**
 * Derive missing measurements from the 7 basic ones. Returns the augmented
 * overrides map (does NOT mutate inputs). Only fills measurements that:
 *   (a) are referenced in formulas or pattern defaults
 *   (b) are not already supplied by user or pattern defaults
 *
 * The order matters for the cascade — e.g. `leg_ankle_high_circ` depends
 * on `leg_ankle_circ` being derived first.
 */
export function deriveMeasurements(opts: DeriveOptions): Record<string, number> {
  const { userMeas, patternDefaults, allFormulas, existingOverrides } = opts;
  const overrides: Record<string, number> = { ...(existingOverrides ?? {}) };
  const patternKeys = opts.patternKeys ?? new Set(Object.keys(patternDefaults));

  // has: measurement exists in user overrides or pattern defaults
  const has = (key: string): boolean => overrides[key] != null || patternDefaults[key] != null;
  // needs: pattern formulas/variables reference this measurement (scan all formula strings)
  // For simplicity, we check if the key appears in any variable formula or pattern defaults
  const needs = (key: string): boolean => patternKeys.has(key) || allFormulas.includes(key);

  const h = overrides['height'] ?? patternDefaults['height'] ?? userMeas.height ?? 168;
  if (needs('leg_crotch_to_floor') && !has('leg_crotch_to_floor'))
    overrides['leg_crotch_to_floor'] = userMeas.inseam ?? h * 0.45;
  if (needs('height_waist_side') && !has('height_waist_side'))
    overrides['height_waist_side'] = h * 0.58;
  if (needs('height_knee') && !has('height_knee'))
    overrides['height_knee'] = h * 0.285;
  if (needs('neck_back_to_waist_b') && !has('neck_back_to_waist_b'))
    overrides['neck_back_to_waist_b'] = h * 0.245;
  if (needs('leg_waist_side_to_floor') && !has('leg_waist_side_to_floor'))
    overrides['leg_waist_side_to_floor'] = h * 0.62;
  if (needs('neck_circ') && !has('neck_circ'))
    overrides['neck_circ'] = (overrides['bust_circ'] ?? patternDefaults['bust_circ'] ?? 92) * 0.395;
  if (needs('hand_circ') && !has('hand_circ'))
    overrides['hand_circ'] = 20;
  if (needs('leg_knee_circ') && !has('leg_knee_circ'))
    overrides['leg_knee_circ'] = (overrides['hip_circ'] ?? patternDefaults['hip_circ'] ?? 98) * 0.39;
  if (needs('leg_ankle_circ') && !has('leg_ankle_circ'))
    overrides['leg_ankle_circ'] = 23;
  if (needs('leg_ankle_high_circ') && !has('leg_ankle_high_circ'))
    overrides['leg_ankle_high_circ'] = (overrides['leg_ankle_circ'] ?? patternDefaults['leg_ankle_circ'] ?? 23) + 2;

  return overrides;
}
