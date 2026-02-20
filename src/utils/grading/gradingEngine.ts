import type { Point2D, PathCommand, PatternPiece } from '../../types/types';
import type { GradedPoint, GradeTable, GradingOptions } from './types';

/**
 * Grade a set of points from the base size to a target size using measurement-based grading rules.
 *
 * Each graded point carries rules that define how it shifts per unit of measurement change.
 * The delta between base and target measurements drives proportional X/Y displacement.
 *
 * @param points - Array of graded points, each with position and grading rules
 * @param options - Grading options including grade table, base/target size, and base measurements
 * @returns New array of 2D points shifted to the target size
 *
 * @example
 * ```ts
 * const graded = gradePoints(gradedPoints, {
 *   gradeTable: standardGradeTable(),
 *   baseSize: 'M',
 *   targetSize: 'L',
 *   baseMeasurements: { chest: 88, waist: 72, hips: 96 },
 * });
 * ```
 */
export function gradePoints(
  points: GradedPoint[],
  options: GradingOptions,
): Point2D[] {
  const { gradeTable, baseSize: _baseSize, targetSize, baseMeasurements } = options;
  const targetSizeMeasurements = gradeTable.sizes[targetSize] ?? {};

  return points.map((pt) => {
    let dx = 0;
    let dy = 0;
    for (const rule of pt.rules) {
      const baseVal = baseMeasurements[rule.measurement] ?? 0;
      const targetVal = targetSizeMeasurements[rule.measurement] ?? baseVal;
      const delta = targetVal - baseVal; // in cm
      dx += rule.deltaX * delta;
      dy += rule.deltaY * delta;
    }
    return { x: pt.x + dx, y: pt.y + dy };
  });
}

function scalePoint(val: number, center: number, factor: number): number {
  return center + (val - center) * factor;
}

/**
 * Uniformly scale a pattern piece outline around a center point.
 *
 * Handles all SVG path command types (M, L, H, V, C, Q, A, Z) by scaling
 * coordinate values relative to the given center.
 *
 * @param outline - Array of path commands defining the piece outline
 * @param scaleFactor - Multiplicative scale factor (e.g. 1.1 = 10% larger)
 * @param center - Point to scale around; defaults to origin (0, 0)
 * @returns New array of path commands with scaled coordinates
 */
export function scaleOutline(
  outline: PathCommand[],
  scaleFactor: number,
  center: Point2D = { x: 0, y: 0 },
): PathCommand[] {
  return outline.map((cmd) => {
    const newValues = [...cmd.values];
    // Scale all coordinate pairs in values
    // Different commands have different value layouts, but we scale all numbers
    // For simplicity: even indices are x, odd indices are y for most commands
    if (cmd.type === 'H') {
      // H has single x value
      newValues[0] = scalePoint(newValues[0], center.x, scaleFactor);
    } else if (cmd.type === 'V') {
      // V has single y value
      newValues[0] = scalePoint(newValues[0], center.y, scaleFactor);
    } else if (cmd.type === 'A') {
      // A: rx ry xrot largearc sweep x y
      newValues[0] *= scaleFactor; // rx
      newValues[1] *= scaleFactor; // ry
      newValues[5] = scalePoint(newValues[5], center.x, scaleFactor);
      newValues[6] = scalePoint(newValues[6], center.y, scaleFactor);
    } else if (cmd.type === 'Z') {
      // no values
    } else {
      for (let i = 0; i < newValues.length; i++) {
        const c = i % 2 === 0 ? center.x : center.y;
        newValues[i] = scalePoint(newValues[i], c, scaleFactor);
      }
    }
    return { type: cmd.type, values: newValues };
  });
}

/**
 * Return a standard women's grade table with chest, waist, and hip measurements (in cm)
 * for sizes XS through XXL.
 *
 * @returns A grade table with six sizes and three body measurements each
 */
export function standardGradeTable(): GradeTable {
  return {
    sizes: {
      XS:  { chest: 80, waist: 64, hips: 88 },
      S:   { chest: 84, waist: 68, hips: 92 },
      M:   { chest: 88, waist: 72, hips: 96 },
      L:   { chest: 92, waist: 78, hips: 102 },
      XL:  { chest: 96, waist: 84, hips: 108 },
      XXL: { chest: 100, waist: 90, hips: 114 },
    },
  };
}

/**
 * Grade an entire pattern piece from base to target measurements using uniform scaling.
 *
 * Computes a scale factor from the primary measurement ratio and applies it
 * to the piece outline via {@link scaleOutline}.
 *
 * @param piece - The pattern piece to grade
 * @param baseMeasurements - Body measurements (cm) for the base size
 * @param targetMeasurements - Body measurements (cm) for the target size
 * @param primaryMeasurement - Which measurement drives the scale factor (default: `'chest'`)
 * @returns A new pattern piece with the scaled outline
 */
export function gradePiece(
  piece: PatternPiece,
  baseMeasurements: Record<string, number>,
  targetMeasurements: Record<string, number>,
  primaryMeasurement: string = 'chest',
): PatternPiece {
  const baseVal = baseMeasurements[primaryMeasurement];
  const targetVal = targetMeasurements[primaryMeasurement];
  if (!baseVal || !targetVal || baseVal === 0) return { ...piece };

  const scaleFactor = targetVal / baseVal;
  const scaledOutline = scaleOutline(piece.outline, scaleFactor);

  return {
    ...piece,
    outline: scaledOutline,
  };
}
