/**
 * Seamly2D measurement-name translations: FR / RU / UK → canonical English.
 *
 * Seamly2D patterns authored in different locales reference body measurements
 * by the localized name (e.g. `@Lignetailledos` in French, `@Сг` in Russian).
 * The formula evaluator looks measurements up by their canonical English name
 * (`neck_back_to_waist_b`, `bust_circ`, …) — unresolved references fall back
 * to 0 and produce degenerate geometry.
 *
 * Scope per the v8 follow-up plan: enough to make the jacket family + a
 * representative French pattern (zigzag) usable, not a complete i18n project.
 * Names not in this table pass through unchanged and the evaluator falls back
 * to 0 with the existing warning — graceful degradation, not crash.
 *
 * Names marked "best-guess" are inferences from the literal translation +
 * Seamly2D measurement catalog matching. They unblock the e2e diagnostic
 * but a pattern-engineering review should confirm them before any of these
 * patterns ships in a customer-facing release.
 */

/**
 * Maps a localized @MeasurementName (without the @ prefix) to the canonical
 * Seamly2D snake_case measurement name. Returns undefined when the name
 * is already English / unrecognized.
 */
export const MEASUREMENT_NAME_TRANSLATIONS: Record<string, string> = {
  // ─── French (zigzag.json) ─────────────────────────────────────────────────
  // Body circumferences ("Tour" = circumference, "Demitour" = half-circumference)
  Tourdepoitrine: 'bust_circ',
  Toursouspoitrine: 'underbust_circ',
  Tourdessuspoitrine: 'highbust_circ',
  Tourpoignet: 'wrist_circ',
  // "Demitour" half-circumference → use _arc_f/_arc_b when available, else the
  // full circ (callers typically divide by 2 explicitly in formulas).
  Demitourdebassindevant: 'hip_arc_f', // best-guess: front half-hip
  Demitourdebassindos: 'hip_arc_b',    // best-guess: back half-hip

  // Heights from floor ("Hauteur" = height)
  Hauteurpoitrine: 'height_bustpoint',         // best-guess
  Hauteursouspoitrine: 'height_underbust_point', // best-guess
  Hauteurcarrure: 'height_shoulder_tip',       // best-guess: "carrure" ≈ shoulder line
  Hauteurdubassin: 'height_hip',
  Hauteurpetiteshanches: 'height_highhip',     // best-guess
  Hauteuremmanchure: 'height_armpit',          // best-guess

  // Lengths along the body ("Longueur" = length, "Ligne" = line)
  Lignetailledos: 'neck_back_to_waist_b',
  Lignetailledevant: 'neck_front_to_waist_f',
  Longueurdos: 'neck_back_to_waist_b',         // alias for back length
  Longueurdevant: 'neck_front_to_waist_f',     // alias for front length
  Longueurépaule: 'shoulder_length',
  Longueurjupeàpartirtaille: 'leg_waist_side_to_floor',
  Longueurmanchelongue: 'arm_shoulder_tip_to_wrist',

  // Neck ("Encolure" = neckline, "Largeur" = width, "Profondeur" = depth)
  Largeurencoluredos: 'neck_back_width',       // best-guess
  Largeurencoluredevant: 'neck_front_width',   // best-guess
  Profondeurencoluredos: 'neck_back_depth',    // best-guess
  Profondeurencoluredevant: 'neck_front_depth', // best-guess

  // Shoulder area ("Demicarrure" = half shoulder breadth)
  Demicarruredevant: 'shoulder_breadth_front', // best-guess (no exact Seamly canonical)
  Demicarruredos: 'shoulder_breadth_back',     // best-guess

  // ─── Russian (imk_zhaketa_poluprilegayuschego_silueta.json) ───────────────
  // Single-syllable abbreviations from Russian pattern-making notation.
  // "Полуобхват" (С*) = half-circumference, "Длина" (Д*) = length.
  Сг: 'bust_arc_f',                  // best-guess: half-bust ≈ front bust arc
  Ст: 'waist_arc_f',                 // best-guess: half-waist
  Сб: 'hip_arc_f',                   // best-guess: half-hip
  Дс: 'neck_back_to_waist_b',        // length back ("длина спинки")
  Др: 'arm_shoulder_tip_to_wrist',   // sleeve length ("длина рукава")
  Дб: 'leg_waist_side_to_floor',     // best-guess: side length ("длина бока")
  Ди: 'leg_waist_side_to_floor',     // best-guess: garment length, often skirt/dress
  Дл: 'neck_back_to_waist_b',        // best-guess: line length, context-dependent
  Во: 'height',                      // base height ("высота основания")
};

/**
 * Resolve a localized measurement name to its canonical English Seamly2D
 * counterpart, if a translation exists. Names already in English (or
 * unrecognized) pass through unchanged.
 *
 * The two-step lookup means that the formula evaluator can call this
 * unconditionally on every @-name without needing to know the language
 * the pattern was authored in.
 */
export function translateMeasurementName(name: string): string {
  return MEASUREMENT_NAME_TRANSLATIONS[name] ?? name;
}
