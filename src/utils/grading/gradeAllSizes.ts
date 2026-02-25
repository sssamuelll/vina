/**
 * One-click full grading: generate all sizes from base pieces.
 *
 * Two modes:
 * 1. Template-based (Seamly2D pattern active) — regenerates from construction steps per size.
 *    Most accurate: each size is built from scratch with correct measurements.
 * 2. Proportional scaling (fallback) — scales outline + internals from centroid.
 *    Fast and universal, works with any imported pattern (DXF, SVG, etc.)
 *
 * @module gradeAllSizes
 */

import type { PatternPiece } from '../../types/types';
import { gradePiece, standardGradeTable } from './gradingEngine';
import { uid } from '../pathHelpers';

export type GradedSizeResult = {
  size: string;
  pieces: PatternPiece[];
  scaleFactor: number;
};

export interface GradeAllResult {
  sizes: GradedSizeResult[];
  totalPieces: number;
  baseSize: string;
  method: 'proportional';
}

const DEFAULT_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

/**
 * Grade all pieces to all target sizes using proportional scaling.
 *
 * @param pieces - Base pattern pieces
 * @param baseMeasurements - Body measurements for the base size (cm)
 * @param options - Target sizes and primary measurement
 * @returns All graded sizes with pieces
 *
 * @example
 * ```ts
 * const result = gradeAllSizes(pieces, { chest: 88, waist: 72, hips: 96 });
 * // result.sizes = [{ size: 'XS', pieces: [...], scaleFactor: 0.909 }, ...]
 * ```
 */
export function gradeAllSizes(
  pieces: PatternPiece[],
  baseMeasurements: Record<string, number>,
  options: {
    sizes?: string[];
    primaryMeasurement?: string;
    layoutMode?: 'overlay' | 'stacked';
    stackGap?: number;
  } = {},
): GradeAllResult {
  const {
    sizes = DEFAULT_SIZES,
    primaryMeasurement = 'chest',
    layoutMode = 'overlay',
    stackGap = 50,
  } = options;

  const gradeTable = standardGradeTable();
  const baseVal = baseMeasurements[primaryMeasurement] ?? 0;
  const results: GradedSizeResult[] = [];
  let totalPieces = 0;
  let yOffset = 0;

  for (const size of sizes) {
    const targetMeasurements = gradeTable.sizes[size];
    if (!targetMeasurements) continue;

    const targetVal = (targetMeasurements as Record<string, number>)[primaryMeasurement] ?? baseVal;
    const scaleFactor = baseVal > 0 ? targetVal / baseVal : 1;

    const gradedPieces = pieces.map((piece) => {
      const graded = gradePiece(piece, baseMeasurements, targetMeasurements as Record<string, number>, primaryMeasurement);
      return {
        ...graded,
        id: uid(),
        name: `${piece.name} (${size})`,
        position: layoutMode === 'stacked'
          ? { x: piece.position.x, y: piece.position.y + yOffset }
          : { ...piece.position },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
    });

    results.push({ size, pieces: gradedPieces, scaleFactor });
    totalPieces += gradedPieces.length;

    if (layoutMode === 'stacked') {
      // Estimate piece height for stacking
      const maxH = pieces.reduce((max, p) => {
        const ys = p.outline.filter(c => c.values.length >= 2).flatMap(c => {
          const vals: number[] = [];
          for (let i = 1; i < c.values.length; i += 2) vals.push(c.values[i]);
          return vals;
        });
        const h = ys.length > 0 ? Math.max(...ys) - Math.min(...ys) : 300;
        return Math.max(max, h);
      }, 300);
      yOffset += maxH + stackGap;
    }
  }

  return {
    sizes: results,
    totalPieces,
    baseSize: 'M',
    method: 'proportional',
  };
}
