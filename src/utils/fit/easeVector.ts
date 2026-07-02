/**
 * easeVector — the missing FIT instrument (consejo drape profesional
 * 2026-07-02, acta docs/reports/2026-07-02-consejo-drape-profesional.md).
 *
 * Law: calidad(drape) ≤ fit(patrón, avatar). Per body section (chest /
 * waist / hips), garment circumference MINUS avatar measurement = ease in
 * cm — computed 100% in 2D BEFORE simulating. With this the patternmaker
 * can tell "the cloth floats because contact fails" apart from "it floats
 * because the pattern carries +7cm of ease". READ-ONLY over the pattern
 * domain; never writes into grading or the solver (ruling 07-01).
 *
 * v0 method — honest assumptions:
 * - Only `category === 'bodice'` pieces participate. Sleeves/collars/etc.
 *   do not contribute to torso circumference.
 * - Garment circumference at a section = SUM of each bodice's outline
 *   WIDTH at that section height (horizontal scanline ∩ outline polygon,
 *   even-odd). Assumes each bodice is a FULL-width panel (front + back =
 *   whole torso, María's shirt shape). Half-on-fold pieces are NOT doubled
 *   in v0 (documented limitation); `mirrored` is ignored likewise.
 * - Exactly 2 bodices → the front+back assumption holds; 1 or >2 →
 *   confidence degrades to 'estimated'.
 * - Section heights by drafting convention over each bodice's bbox, top =
 *   minY (outline space is y-down; neckline sits at low relY — same
 *   convention as geometricClassifier/semanticEdges): chest ≈ 25% from the
 *   top, waist ≈ 55%, hips ≈ 85%. When the piece carries detected
 *   'armhole' semantic edges, chest uses the REAL underarm Y (deepest
 *   armhole point) instead of the 25% guess → chest confidence 'measured'.
 *   Waist/hips heights are always convention guesses → 'estimated'.
 * - Seam allowances: subtracted as 2 × `piece.seamAllowance` per piece
 *   (one side seam crossing each end of the scanline) when the domain
 *   knows it (> 0). DXF imports carry `outlineIsCutLine` with
 *   seamAllowance 0 — there garmentCm INCLUDES sewn-away seam width
 *   (≈ +2-4cm on a shirt); v0 documents rather than guesses it.
 * - Outline units are mm (DXF import convention); body measurements cm.
 *
 * Guards: no pieces / no bodices / unanalyzable outlines → [] (never
 * throws). Deterministic — pure geometry, no randomness.
 */

import type { PatternPiece, BodyMeasurements } from '../../types/types';
import { analyzeOutline, type OutlinePoint } from '../outlineAnalysis';

export type EaseSection = 'chest' | 'waist' | 'hips';

export interface EaseEntry {
  section: EaseSection;
  /** Garment circumference at the section, cm. */
  garmentCm: number;
  /** Avatar measurement at the section, cm. */
  bodyCm: number;
  /** garmentCm − bodyCm. Positive = ease (holgura), negative = negative ease. */
  easeCm: number;
  confidence: 'measured' | 'estimated';
}

/** Drafting-convention section heights as bbox fraction from the top (minY). */
const SECTION_FRACTION: Record<EaseSection, number> = {
  chest: 0.25,
  waist: 0.55,
  hips: 0.85,
};

const SECTIONS: EaseSection[] = ['chest', 'waist', 'hips'];

const round1 = (v: number) => Math.round(v * 10) / 10;

/**
 * Width of the closed polygon at horizontal line y: even-odd scanline.
 * Half-open rule (y0 ≤ y < y1) — horizontal edges contribute nothing,
 * shared vertices count once.
 */
function widthAt(points: OutlinePoint[], y: number): number {
  const xs: number[] = [];
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    if ((a.y <= y && y < b.y) || (b.y <= y && y < a.y)) {
      xs.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x));
    }
  }
  xs.sort((p, q) => p - q);
  let width = 0;
  for (let i = 0; i + 1 < xs.length; i += 2) width += xs[i + 1] - xs[i];
  return width;
}

/**
 * Real underarm level: the deepest (max-y) point of the piece's detected
 * 'armhole' semantic edges, or null when none exist. Maps edge cmd ranges
 * to outline points via the analysis' pointCmd provenance.
 */
function underarmY(
  piece: PatternPiece,
  analysis: NonNullable<ReturnType<typeof analyzeOutline>>,
): number | null {
  const armholes = (piece.edges ?? []).filter(
    e => e.name === 'armhole' || e.name.startsWith('armhole-'),
  );
  if (armholes.length === 0) return null;
  let maxY = -Infinity;
  for (const edge of armholes) {
    const [start, end] = edge.segmentRange;
    for (let i = 0; i < analysis.points.length; i++) {
      const cmd = analysis.pointCmd[i];
      if (cmd >= start && cmd < end && analysis.points[i].y > maxY) {
        maxY = analysis.points[i].y;
      }
    }
  }
  return Number.isFinite(maxY) ? maxY : null;
}

/**
 * Compute the ease-vector: per section, garment circumference (2D, summed
 * bodice widths) minus the avatar measurement. Pure read of the pattern
 * domain; see the header for the v0 assumptions.
 */
export function computeEaseVector(
  pieces: PatternPiece[],
  measurements: BodyMeasurements,
): EaseEntry[] {
  const bodices = pieces
    .filter(p => p.category === 'bodice')
    .map(p => ({ piece: p, analysis: analyzeOutline(p.outline) }))
    .filter((x): x is { piece: PatternPiece; analysis: NonNullable<ReturnType<typeof analyzeOutline>> } =>
      x.analysis !== null,
    );
  if (bodices.length === 0) return [];

  const fullBodySet = bodices.length === 2; // front + back assumption holds
  const bodyBySection: Record<EaseSection, number> = {
    chest: measurements.chest,
    waist: measurements.waist,
    hips: measurements.hips,
  };

  const entries: EaseEntry[] = [];
  for (const section of SECTIONS) {
    let garmentMm = 0;
    let allChestMeasured = true;
    for (const { piece, analysis } of bodices) {
      const { minY, height } = { minY: analysis.bbox.minY, height: analysis.bbox.height };
      let y = minY + SECTION_FRACTION[section] * height;
      if (section === 'chest') {
        const real = underarmY(piece, analysis);
        if (real !== null) y = real;
        else allChestMeasured = false;
      }
      let w = widthAt(analysis.points, y);
      // Seam allowance known to the domain: one side-seam crossing at each
      // end of the scanline.
      if (piece.seamAllowance > 0) w = Math.max(0, w - 2 * piece.seamAllowance);
      garmentMm += w;
    }
    if (garmentMm <= 0) continue; // degenerate slice — no honest number to report

    const garmentCm = round1(garmentMm / 10);
    const bodyCm = bodyBySection[section];
    entries.push({
      section,
      garmentCm,
      bodyCm,
      easeCm: round1(garmentCm - bodyCm),
      confidence:
        section === 'chest' && fullBodySet && allChestMeasured ? 'measured' : 'estimated',
    });
  }
  return entries;
}
