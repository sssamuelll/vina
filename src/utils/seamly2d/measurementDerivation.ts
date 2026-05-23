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

/**
 * Build the initial Seamly-name-keyed overrides from a user avatar by
 * applying `MEAS_MAPPING`. Bridges between OpenClo internal field names
 * and the canonical Seamly2D names referenced by pattern formulas.
 *
 * A measurement is added to overrides if EITHER (a) the pattern declares
 * the canonical name in its `measurements.defaults`, OR (b) the canonical
 * name appears anywhere in the concatenated formula strings. The second
 * branch is what unblocks the jacket family — their patterns ship with
 * `measurements.defaults: {}` but reference `bust_arc_f`, `indent_neck_back`,
 * etc. in formulas. The previous version of this logic gated only on
 * `patternKeys.has(seamlyName)`, so empty defaults → empty overrides →
 * degenerate geometry.
 */
export function applyMeasMapping(
  userMeas: Record<string, number | undefined>,
  patternKeys: Set<string>,
  allFormulas: string,
): Record<string, number> {
  const overrides: Record<string, number> = {};
  for (const [ourName, seamlyName] of Object.entries(MEAS_MAPPING)) {
    const userVal = userMeas[ourName];
    if (userVal == null) continue;
    if (patternKeys.has(seamlyName) || allFormulas.includes(seamlyName)) {
      overrides[seamlyName] = userVal;
    }
  }
  return overrides;
}

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

  // ─── Jacket-family detail measurements ───────────────────────────────────
  // jacket1-6 reference these English Seamly2D names directly in their
  // construction formulas but ship with `measurements.defaults: {}` — without
  // these derivations, 73% of jacket construction points collapse to the
  // origin (per v8 diagnostic). Factors below are best-fit approximations
  // and would be refined by a pattern-engineering review; the priority here
  // is geometric non-degeneracy, not customer-grade fit accuracy.
  const bust = overrides['bust_circ'] ?? patternDefaults['bust_circ'] ?? userMeas.chest ?? 92;
  // Front bust arc ≈ half of full bust circumference (symmetric assumption).
  if (needs('bust_arc_f') && !has('bust_arc_f'))
    overrides['bust_arc_f'] = bust * 0.5;
  // Back bust arc — same symmetric assumption, in case any pattern references it.
  if (needs('bust_arc_b') && !has('bust_arc_b'))
    overrides['bust_arc_b'] = bust * 0.5;
  // Half-waist and half-hip arcs (for FR Demitour* and RU С* translations).
  const waist = overrides['waist_circ'] ?? patternDefaults['waist_circ'] ?? userMeas.waist ?? 74;
  if (needs('waist_arc_f') && !has('waist_arc_f'))
    overrides['waist_arc_f'] = waist * 0.5;
  if (needs('waist_arc_b') && !has('waist_arc_b'))
    overrides['waist_arc_b'] = waist * 0.5;
  const hip = overrides['hip_circ'] ?? patternDefaults['hip_circ'] ?? userMeas.hips ?? 96;
  if (needs('hip_arc_f') && !has('hip_arc_f'))
    overrides['hip_arc_f'] = hip * 0.5;
  if (needs('hip_arc_b') && !has('hip_arc_b'))
    overrides['hip_arc_b'] = hip * 0.5;
  // Anatomical constant ~2.4 cm; not size-dependent.
  if (needs('indent_neck_back') && !has('indent_neck_back'))
    overrides['indent_neck_back'] = 2.4;
  // Mid-neck ≈ 94% of neck_circ; neck_circ already derived as 39.5% of bust above.
  if (needs('neck_mid_circ') && !has('neck_mid_circ'))
    overrides['neck_mid_circ'] = bust * 0.395 * 0.94;
  // Head circumference loose fit ≈ 32.8% of height (adult).
  if (needs('head_circ') && !has('head_circ'))
    overrides['head_circ'] = h * 0.328;
  // Back-of-neck height ≈ 84% of total height (shoulder line drops ~16% from top).
  if (needs('height_neck_back') && !has('height_neck_back'))
    overrides['height_neck_back'] = h * 0.84;

  return overrides;
}
