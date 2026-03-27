/**
 * Shared default constants used by both UI hooks and copilot tools.
 *
 * CONVENTION: All feature defaults live here. Both UI and copilot tools
 * import from this module to ensure consistent behavior regardless of
 * whether the user clicks a button or asks the copilot.
 *
 * @module defaults
 */

// ─── Seam Defaults ──────────────────────────────────────────────────────────

export const DEFAULT_SEAM_ALLOWANCE = 10; // mm
export const DEFAULT_SEAM_TENSION = 100; // 0-200, 100 = normal
export const DEFAULT_SEAM_STRENGTH = 1.0; // 0-1

// ─── Annotation Defaults ────────────────────────────────────────────────────

export const DEFAULT_ANNOTATION_FONT_SIZE = 8;

// ─── Pressure Defaults ──────────────────────────────────────────────────────

export const DEFAULT_PRESSURE_PA = 0; // Pascals, 0 = no pressure
export const MAX_PRESSURE_PA = 1000;

// ─── Fabric Code Default ────────────────────────────────────────────────────

export const DEFAULT_FABRIC_CODE = 'SELF';
