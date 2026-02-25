/**
 * Ease Tracking System — compute, compare, and manage garment ease.
 *
 * Ease = garment measurement - body measurement at each region.
 * A patronista thinks "4cm ease at bust", not pixel coordinates.
 *
 * @module easeTracking
 */

import type { PatternPiece } from '../types/types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EaseMap {
  bust?: number;
  waist?: number;
  hip?: number;
  shoulder?: number;
  armhole?: number;
  sleeve?: number;
  neckline?: number;
  [key: string]: number | undefined;
}

export interface BodyMeasurements {
  chest: number;   // cm
  waist: number;   // cm
  hip: number;     // cm
  shoulder: number; // cm (shoulder width)
  [key: string]: number | undefined;
}

export type FitCategory = 'skin-tight' | 'fitted' | 'semi-fitted' | 'loose' | 'oversized';

export interface EaseStandard {
  name: string;
  /** Ease values in mm */
  bust: [number, number];   // [min, max]
  waist: [number, number];
  hip: [number, number];
  fitCategory: FitCategory;
}

// ─── Ease Standards Database ──────────────────────────────────────────────────

export const EASE_STANDARDS: EaseStandard[] = [
  { name: 'Knit Fitted', fitCategory: 'skin-tight', bust: [-20, 10], waist: [-20, 10], hip: [-20, 10] },
  { name: 'Woven Fitted', fitCategory: 'fitted', bust: [25, 50], waist: [20, 40], hip: [20, 50] },
  { name: 'Woven Semi-Fitted', fitCategory: 'semi-fitted', bust: [50, 80], waist: [30, 60], hip: [50, 80] },
  { name: 'Woven Loose', fitCategory: 'loose', bust: [80, 120], waist: [60, 100], hip: [80, 120] },
  { name: 'Outerwear', fitCategory: 'oversized', bust: [120, 200], waist: [100, 180], hip: [120, 200] },
  { name: 'Activewear', fitCategory: 'skin-tight', bust: [-10, 20], waist: [-10, 15], hip: [-10, 20] },
  { name: 'Dress Shirt', fitCategory: 'semi-fitted', bust: [60, 100], waist: [80, 140], hip: [80, 120] },
  { name: 'T-Shirt', fitCategory: 'loose', bust: [50, 100], waist: [60, 120], hip: [50, 100] },
];

// ─── Garment Measurement Extraction ──────────────────────────────────────────

/**
 * Measure the width of a piece at a given Y-fraction (0=top, 1=bottom).
 * Returns width in mm by scanning the outline horizontally.
 */
function measureWidthAtFraction(piece: PatternPiece, fraction: number): number {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

  for (const cmd of piece.outline) {
    for (let i = 0; i < cmd.values.length; i += 2) {
      const x = cmd.values[i], y = cmd.values[i + 1];
      if (isFinite(x) && isFinite(y)) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }

  if (!isFinite(minX)) return 0;

  const targetY = minY + (maxY - minY) * fraction;
  const tolerance = (maxY - minY) * 0.05; // 5% tolerance band

  // Find all x-values near targetY
  const xValues: number[] = [];
  let cx = 0, cy = 0;
  for (const cmd of piece.outline) {
    let ex = cx, ey = cy;
    switch (cmd.type) {
      case 'M': ex = cmd.values[0]; ey = cmd.values[1]; break;
      case 'L': ex = cmd.values[0]; ey = cmd.values[1]; break;
      case 'C': ex = cmd.values[4]; ey = cmd.values[5]; break;
      default: ex = cx; ey = cy; break;
    }

    // Check if segment crosses targetY
    if (cmd.type !== 'M' && cmd.type !== 'Z') {
      const y1 = cy, y2 = ey;
      if ((y1 <= targetY + tolerance && y2 >= targetY - tolerance) ||
          (y2 <= targetY + tolerance && y1 >= targetY - tolerance)) {
        // Interpolate x at targetY
        const dy = y2 - y1;
        if (Math.abs(dy) > 0.01) {
          const t = Math.max(0, Math.min(1, (targetY - y1) / dy));
          const ix = cx + t * (ex - cx);
          xValues.push(ix);
        }
      }
    }
    cx = ex; cy = ey;
  }

  if (xValues.length < 2) return maxX - minX; // fallback to full width
  return Math.max(...xValues) - Math.min(...xValues);
}

/**
 * Compute ease for all body regions from pieces + body measurements.
 *
 * Strategy:
 * - Find bodice pieces → measure width at bust/waist level
 * - Double for half-patterns (front+back = full circumference)
 * - Subtract body measurement
 */
export function computeEase(pieces: PatternPiece[], bodyMeasurements: BodyMeasurements): EaseMap {
  const ease: EaseMap = {};

  // Separate pieces by category
  const bodices = pieces.filter(p => p.category === 'bodice');
  const skirts = pieces.filter(p => p.category === 'skirt');
  const trousers = pieces.filter(p => p.category === 'trouser');
  const sleeves = pieces.filter(p => p.category === 'sleeve');

  // Bust ease: sum bodice widths at ~30% from top (bust level), ×2 if only front/back
  if (bodices.length > 0 && bodyMeasurements.chest) {
    const bustWidths = bodices.map(p => measureWidthAtFraction(p, 0.3));
    let totalWidth = bustWidths.reduce((a, b) => a + b, 0);
    // If we only have front or back, double it
    if (bodices.length === 1) totalWidth *= 2;
    // Body measurement is in cm, pattern in mm
    ease.bust = Math.round(totalWidth - bodyMeasurements.chest * 10);
  }

  // Waist ease: bodice pieces at ~80% from top
  if (bodices.length > 0 && bodyMeasurements.waist) {
    const waistWidths = bodices.map(p => measureWidthAtFraction(p, 0.8));
    let totalWidth = waistWidths.reduce((a, b) => a + b, 0);
    if (bodices.length === 1) totalWidth *= 2;
    ease.waist = Math.round(totalWidth - bodyMeasurements.waist * 10);
  }

  // Hip ease: skirts/trousers at ~30% from top
  const hipPieces = skirts.length > 0 ? skirts : trousers;
  if (hipPieces.length > 0 && bodyMeasurements.hip) {
    const hipWidths = hipPieces.map(p => measureWidthAtFraction(p, 0.3));
    let totalWidth = hipWidths.reduce((a, b) => a + b, 0);
    if (hipPieces.length === 1) totalWidth *= 2;
    ease.hip = Math.round(totalWidth - (bodyMeasurements.hip ?? bodyMeasurements.chest) * 10);
  }

  // Shoulder ease
  if (bodices.length > 0 && bodyMeasurements.shoulder) {
    // Approximate: top edge width of bodice pieces
    const shoulderWidths = bodices.map(p => measureWidthAtFraction(p, 0.05));
    let totalWidth = shoulderWidths.reduce((a, b) => a + b, 0);
    if (bodices.length === 1) totalWidth *= 2;
    ease.shoulder = Math.round(totalWidth - bodyMeasurements.shoulder * 10);
  }

  // Sleeve ease: width at ~20% (bicep level)
  if (sleeves.length > 0) {
    const sleeveWidth = sleeves.map(p => measureWidthAtFraction(p, 0.2));
    const avgWidth = sleeveWidth.reduce((a, b) => a + b, 0) / sleeveWidth.length;
    // Sleeve circumference ≈ width × 2
    ease.sleeve = Math.round(avgWidth * 2 - (bodyMeasurements.chest ?? 96) * 10 * 0.35); // ~35% of chest = bicep
  }

  return ease;
}

/**
 * Compare ease values against a standard.
 */
export function compareToStandard(ease: EaseMap, standardName?: string): {
  standard: EaseStandard;
  analysis: Record<string, { value: number; range: [number, number]; status: 'tight' | 'ok' | 'loose' }>;
}[] {
  const standards = standardName
    ? EASE_STANDARDS.filter(s => s.name.toLowerCase().includes(standardName.toLowerCase()))
    : EASE_STANDARDS;

  return standards.map(std => {
    const analysis: Record<string, { value: number; range: [number, number]; status: 'tight' | 'ok' | 'loose' }> = {};

    for (const [region, range] of [
      ['bust', std.bust],
      ['waist', std.waist],
      ['hip', std.hip],
    ] as [string, [number, number]][]) {
      const val = ease[region];
      if (val !== undefined) {
        let status: 'tight' | 'ok' | 'loose' = 'ok';
        if (val < range[0]) status = 'tight';
        else if (val > range[1]) status = 'loose';
        analysis[region] = { value: val, range, status };
      }
    }

    return { standard: std, analysis };
  });
}

/**
 * Classify overall fit category from ease values.
 */
export function classifyFit(ease: EaseMap): FitCategory {
  const bustEase = ease.bust ?? 50;
  if (bustEase < 10) return 'skin-tight';
  if (bustEase < 50) return 'fitted';
  if (bustEase < 80) return 'semi-fitted';
  if (bustEase < 120) return 'loose';
  return 'oversized';
}
