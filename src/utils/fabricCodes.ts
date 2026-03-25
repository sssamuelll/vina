/**
 * Fabric code constants for production classification.
 *
 * Every pattern piece gets a fabricCode indicating which fabric roll
 * it should be cut from. This is the single most important metadata
 * field for production interoperability (DXF/AAMA, BOM, nesting).
 */

export const STANDARD_FABRIC_CODES = [
  'SELF',
  'LINING',
  'INTERLINING',
  'CONTRAST-1',
  'CONTRAST-2',
  'FUSIBLE',
] as const;

export type StandardFabricCode = typeof STANDARD_FABRIC_CODES[number];

/** Color map for 2D visualization of fabric codes. */
export const FABRIC_CODE_COLORS: Record<string, string> = {
  'SELF': '#4a9eff',
  'LINING': '#ff6b9d',
  'INTERLINING': '#ffa64a',
  'CONTRAST-1': '#9d6bff',
  'CONTRAST-2': '#6bffa6',
  'FUSIBLE': '#ff4a4a',
};

/** Default fabric code for new pieces. */
export const DEFAULT_FABRIC_CODE = 'SELF';

/** Get the display color for a fabric code. Falls back to neutral gray. */
export function getFabricCodeColor(code: string | undefined): string {
  if (!code) return '#888888';
  return FABRIC_CODE_COLORS[code] ?? '#888888';
}
