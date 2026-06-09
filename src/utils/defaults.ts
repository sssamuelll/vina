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

/** Width an EXPLICIT apply-seam-allowance action offers — NOT a birth value.
 *  9.5mm ≈ 3/8", the standard serged seam allowance (CLO3D parity). */
export const DEFAULT_SEAM_ALLOWANCE = 9.5; // mm
export const DEFAULT_SEAM_TENSION = 100; // 0-200, 100 = normal
export const DEFAULT_SEAM_STRENGTH = 1.0; // 0-1

// ─── Drafted-piece Defaults ─────────────────────────────────────────────────

/**
 * Shared birth fields for pieces drafted in the 2D editor (pen, polyPen,
 * rectangle) or created by the copilot.
 *
 * Pieces are born NET (hallazgo #2, María): patternmakers draft without
 * seam allowance — SA is an explicit finishing step applied per piece
 * (width + corner geometry), never an automatic default at creation.
 */
export function draftedPieceDefaults() {
  return {
    internals: [] as import('../types/types').InternalLine[],
    position: { x: 0, y: 0 },
    rotation: 0,
    mirrored: false,
    seamAllowance: 0, // born net
    layer: 1,
    sublayer: 0,
    active: true,
  };
}

// ─── Annotation Defaults ────────────────────────────────────────────────────

export const DEFAULT_ANNOTATION_FONT_SIZE = 8;

// ─── Pressure Defaults ──────────────────────────────────────────────────────

export const DEFAULT_PRESSURE_PA = 0; // Pascals, 0 = no pressure
export const MAX_PRESSURE_PA = 1000;

// ─── Elastic Defaults ───────────────────────────────────────────────────────

export const DEFAULT_ELASTIC_STRETCH_RATIO = 0.5; // 0.1–2.0
export const DEFAULT_ELASTIC_WIDTH = 12; // mm
export const DEFAULT_ELASTIC_TYPE = 'band' as const;

// ─── UV Transform Defaults ──────────────────────────────────────────────────

export const DEFAULT_UV_TRANSFORM = {
  repeatX: 4, repeatY: 4, rotation: 0, offsetX: 0, offsetY: 0,
} as const;

// ─── Fabric Code Default ────────────────────────────────────────────────────

export const DEFAULT_FABRIC_CODE = 'SELF';

// ─── Trim Defaults ─────────────────────────────────────────────────────────

export const DEFAULT_TRIM_TYPE = 'button' as const;
export const DEFAULT_TRIM_MATERIAL = 'plastic';
export const DEFAULT_TRIM_COLOR = '#333333';
export const DEFAULT_TRIM_SIZE = 15; // mm
export const DEFAULT_TRIM_UNIT_COST = 0;
