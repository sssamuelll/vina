/**
 * Batch Grader — generate all sizes from a template pattern.
 *
 * Uses the template engine to regenerate pieces at each size,
 * producing accurate construction-based grading (not just scaling).
 *
 * @module batchGrader
 */

import { PatternTemplateEngine, type SeamlyPattern } from '../seamly2d/templateEngine';
import { buildMeasurements, getAvailableSizes, type StandardSize, type SizeSystem } from '../seamly2d/sizeTables';
import type { PatternPiece } from '../../types/types';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface GradedSize {
  size: StandardSize;
  pieces: PatternPiece[];
  color: string;
}

export interface BatchGradeResult {
  sizes: GradedSize[];
  baseSize: StandardSize;
  totalPieces: number;
  warnings: string[];
}

export interface BatchGradeOptions {
  /** Sizes to generate (default: all available) */
  sizes?: StandardSize[];
  /** Base size for reference (default: M) */
  baseSize?: StandardSize;
  /** Size system (default: eu-women) */
  sizeSystem?: SizeSystem;
  /** Layout offset between sizes in mm */
  layoutOffset?: number;
}

// ─── Size Colors ────────────────────────────────────────────────────────────

/** Accessible color palette for size overlay visualization */
const SIZE_COLORS: Record<StandardSize, string> = {
  'XXS': '#9b59b6', // purple
  'XS':  '#3498db', // blue
  'S':   '#2ecc71', // green
  'M':   '#e74c3c', // red (base)
  'L':   '#e67e22', // orange
  'XL':  '#f1c40f', // yellow
  'XXL': '#1abc9c', // teal
  '3XL': '#95a5a6', // gray
};

export function getSizeColor(size: StandardSize): string {
  return SIZE_COLORS[size] || '#666';
}

// ─── Batch Generation ───────────────────────────────────────────────────────

/**
 * Generate pieces for all requested sizes using the template engine.
 * Much more accurate than uniform scaling — recalculates construction.
 */
export function batchGrade(
  pattern: SeamlyPattern,
  options: BatchGradeOptions = {},
): BatchGradeResult {
  const {
    sizes,
    baseSize = 'M',
    sizeSystem = 'eu-women',
    layoutOffset = 50,
  } = options;

  const targetSizes = sizes || getAvailableSizes(sizeSystem);
  const engine = new PatternTemplateEngine();
  const warnings: string[] = [];
  const results: GradedSize[] = [];
  let totalPieces = 0;

  // Generate base size first to get reference positions
  engine.loadPattern(pattern);
  let basePieces: PatternPiece[] = [];
  try {
    const baseMeas = buildMeasurements(baseSize, sizeSystem);
    basePieces = engine.generate(baseMeas);
  } catch (err) {
    warnings.push(`Base size ${baseSize} generation failed: ${(err as Error).message}`);
  }

  // Track cumulative Y offset for stacking sizes
  let yOffset = 0;

  for (const size of targetSizes) {
    const measurements = buildMeasurements(size, sizeSystem);
    engine.loadPattern(pattern);

    try {
      const pieces = engine.generate(measurements);

      // Tag pieces with size info and apply layout offset
      const taggedPieces = pieces.map((piece, idx) => {
        // Position: same X as base piece, stacked vertically per size
        const basePosition = basePieces[idx]?.position || { x: 0, y: 0 };
        return {
          ...piece,
          id: `${piece.id}_${size}`,
          name: `${piece.name} (${size})`,
          position: {
            x: basePosition.x,
            y: basePosition.y + yOffset,
          },
        };
      });

      results.push({
        size,
        pieces: taggedPieces,
        color: getSizeColor(size),
      });

      totalPieces += taggedPieces.length;
    } catch (err) {
      warnings.push(`Size ${size} generation failed: ${(err as Error).message}`);
    }

    // Calculate max height of pieces for offset
    const maxHeight = basePieces.reduce((max, piece) => {
      const ys = piece.outline
        .filter(c => c.values.length >= 2)
        .map(c => c.type === 'C' ? c.values[5] : c.values[1]);
      const h = ys.length > 0 ? Math.max(...ys) - Math.min(...ys) : 300;
      return Math.max(max, h);
    }, 300);

    yOffset += maxHeight + layoutOffset;
  }

  return { sizes: results, baseSize, totalPieces, warnings };
}

/**
 * Generate overlay data for the 2D editor — all sizes stacked at origin
 * with different colors. Pieces share the same position (overlaid).
 */
export function generateOverlay(
  pattern: SeamlyPattern,
  options: BatchGradeOptions = {},
): GradedSize[] {
  const {
    sizes,
    sizeSystem = 'eu-women',
  } = options;

  const targetSizes = sizes || getAvailableSizes(sizeSystem);
  const engine = new PatternTemplateEngine();
  const results: GradedSize[] = [];

  for (const size of targetSizes) {
    const measurements = buildMeasurements(size, sizeSystem);
    engine.loadPattern(pattern);

    try {
      const pieces = engine.generate(measurements);
      const taggedPieces = pieces.map(piece => ({
        ...piece,
        id: `${piece.id}_overlay_${size}`,
        name: `${piece.name} (${size})`,
      }));

      results.push({
        size,
        pieces: taggedPieces,
        color: getSizeColor(size),
      });
    } catch {
      // Skip failed sizes in overlay
    }
  }

  return results;
}
