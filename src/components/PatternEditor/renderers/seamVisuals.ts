/**
 * seamVisuals — the 2D canvas seam color/error language (parity plan Fase 6).
 *
 * One channel per concern, never collapsed (Iris N3):
 * - IDENTITY: each seam pair gets a stable palette color from a hash of its
 *   id — it never changes when other seams are added/removed (array-index
 *   cycling did), and it never disappears under interaction.
 * - STATE (selected): weight, not recolor — the renderer widens the stroke
 *   and adds the accent glow halo BEHIND the pair color.
 * - ERROR (length mismatch): the red warning LABEL only, in absolute mm
 *   (the craft works in mm; CLO3D flags >1mm) — the pair color stays.
 */

/**
 * Categorical palette for distinguishing seam pairs — muted for the cream
 * paper ground. Three hues (Iris cut 3): beyond three, adjacent seams read
 * as a parade of color rather than groups; cycling three keeps neighbors
 * distinct without competing with the selection/error language.
 */
export const SEAM_PALETTE = ['#4a7fb5', '#b56d8a', '#5a9e72'];

/**
 * Stable pair color: deterministic hash of the seam id → palette entry.
 * Unlike array-position cycling, deleting or reordering seams never
 * recolors the survivors (CLO3D: "cada par tiene color chip estable").
 */
export function seamPairColor(seamId: string): string {
  let h = 0;
  for (let i = 0; i < seamId.length; i++) {
    h = ((h << 5) - h + seamId.charCodeAt(i)) | 0;
  }
  return SEAM_PALETTE[Math.abs(h) % SEAM_PALETTE.length];
}

/**
 * CLO3D parity: a seam-half length difference above 1mm is flagged red.
 * Absolute mm, not relative % — 5% of a 400mm side seam hid a 19mm error
 * while 5% of a 10mm notch seam cried wolf at 0.6mm.
 */
export const SEAM_MISMATCH_THRESHOLD_MM = 1;

/** Absolute seam-half length mismatch in mm (outline space is mm). */
export function seamMismatchMm(lenA: number, lenB: number): number {
  return Math.abs(lenA - lenB);
}

/**
 * Shared pick colors for the sewing-tool overlays. FIRST selection is
 * always green, SECOND/hover is always blue — EdgePairOverlay and
 * SegmentSewingOverlay had the assignment INVERTED relative to each other
 * (first=green in one, first=blue in the other), so the same gesture
 * taught two contradictory color meanings.
 */
export const SEWING_PICK_FIRST = '#2ecc71';
export const SEWING_PICK_SECOND = '#3498db';
