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

export interface MismatchLabelAnchor {
  id: string;
  x: number;
  y: number;
  text: string;
}

/**
 * Anticolisión de labels de mismatch (Fase1-H1): los seams del cuello
 * post-auto-sew anclaban su label al mismo punto medio y se imprimían uno
 * sobre otro hasta ser ilegibles. Pase global: los labels cuyo box estimado
 * colisiona se apilan hacia abajo en pasos de una línea. Coordenadas y
 * fontSize en unidades del canvas (el caller ya dividió por zoom).
 */
export function layoutMismatchLabels(
  anchors: MismatchLabelAnchor[],
  fontSize: number,
): Map<string, { x: number; y: number }> {
  const lineH = fontSize * 1.4;
  // Box estimado: ancho ≈ chars × fontSize × 0.62 (mono), centrado (textAnchor=middle).
  const halfW = (text: string) => (text.length * fontSize * 0.62) / 2;
  // Orden estable (y, x, id) → mismo resultado sea cual sea el orden de entrada.
  const sorted = [...anchors].sort(
    (a, b) => a.y - b.y || a.x - b.x || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  const placed: { x: number; y: number; hw: number }[] = [];
  const out = new Map<string, { x: number; y: number }>();
  for (const a of sorted) {
    const hw = halfW(a.text);
    let y = a.y;
    // ponytail: greedy O(n²) — n = labels con mismatch visibles (decenas máximo).
    // `next > y` obliga progreso estricto: sin él, el error de redondeo de
    // (p.y + lineH) − p.y < lineH re-dispara la colisión con el mismo y → loop.
    let moved = true;
    while (moved) {
      moved = false;
      for (const p of placed) {
        if (Math.abs(a.x - p.x) < hw + p.hw && Math.abs(y - p.y) < lineH) {
          const next = p.y + lineH;
          if (next > y) {
            y = next;
            moved = true;
          }
        }
      }
    }
    placed.push({ x: a.x, y, hw });
    out.set(a.id, { x: a.x, y });
  }
  return out;
}
