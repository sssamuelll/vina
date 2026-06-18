import type { Point2D, PathCommand, PatternPiece, GradeRule } from '../../types/types';
import type { GradedPoint, GradeTable, GradingOptions } from './types';
import { resolveNotchAnchor } from '../notchAnchor';

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
  const { gradeTable, targetSize, baseMeasurements } = options;
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

/** Compute centroid of outline path commands */
function computeCentroid(outline: PathCommand[]): Point2D {
  let sx = 0, sy = 0, count = 0;
  for (const cmd of outline) {
    if (cmd.type === 'Z' || cmd.values.length < 2) continue;
    for (let i = 0; i < cmd.values.length - 1; i += 2) {
      sx += cmd.values[i];
      sy += cmd.values[i + 1];
      count++;
    }
  }
  return count > 0 ? { x: sx / count, y: sy / count } : { x: 0, y: 0 };
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
  if (!baseVal || !targetVal || baseVal === 0 || !Number.isFinite(baseVal) || !Number.isFinite(targetVal)) {
    return { ...piece };
  }

  const scaleFactor = targetVal / baseVal;
  if (!Number.isFinite(scaleFactor) || scaleFactor <= 0) return { ...piece };
  const center = computeCentroid(piece.outline);
  const scaledOutline = scaleOutline(piece.outline, scaleFactor, center);

  // Scale internals (notches, grainlines, darts) with the same factor.
  // Parametric notch anchors scale too (notch-precision F4): uniform scale
  // means arc distances scale by the same factor, and the refPoint follows
  // the same centroid transform as the path — an unscaled anchor would
  // silently diverge from the geometry it describes.
  const scaledInternals = piece.internals.map(internal => ({
    ...internal,
    path: scaleOutline(internal.path, scaleFactor, center),
    ...(internal.notchAnchor ? {
      notchAnchor: {
        ...internal.notchAnchor,
        refPoint: {
          x: center.x + (internal.notchAnchor.refPoint.x - center.x) * scaleFactor,
          y: center.y + (internal.notchAnchor.refPoint.y - center.y) * scaleFactor,
        },
        distanceMm: internal.notchAnchor.distanceMm * scaleFactor,
      },
    } : {}),
  }));

  return {
    ...piece,
    outline: scaledOutline,
    internals: scaledInternals,
  };
}

/**
 * Grade a piece to a target size, routing to the per-point rule engine when the
 * piece carries grade rules and falling back to uniform scaling otherwise. This
 * is the single entry point the UI/agent should call — it keeps the
 * Level-1 (per-point) vs uniform decision in one place.
 *
 * @param piece - The piece to grade
 * @param baseMeasurements - Body measurements for the base size
 * @param targetMeasurements - Body measurements for the target size
 * @param primaryMeasurement - Drives the uniform-scale fallback (default `'chest'`)
 * @returns A new graded pattern piece
 */
export function gradePieceToSize(
  piece: PatternPiece,
  baseMeasurements: Record<string, number>,
  targetMeasurements: Record<string, number>,
  primaryMeasurement: string = 'chest',
): PatternPiece {
  if (piece.gradeRules && piece.gradeRules.length > 0) {
    return gradePieceByRules(piece, baseMeasurements, targetMeasurements);
  }
  return gradePiece(piece, baseMeasurements, targetMeasurements, primaryMeasurement);
}

/** Endpoint (last coordinate pair) of a path command, or null for valueless/short commands (e.g. `Z`). */
function commandEndpoint(cmd: PathCommand): Point2D | null {
  const n = cmd.values.length;
  if (n < 2) return null;
  return { x: cmd.values[n - 2], y: cmd.values[n - 1] };
}

/**
 * Grade an imported (history-less) piece by its per-point grade rules — the
 * Level-1 path for #847 choice A (shallow parametricity; not construction
 * regeneration). Each {@link PointGradeRule} anchors to a point on the current
 * outline (via {@link resolveNotchAnchor}); the per-point shift is computed by
 * the existing {@link gradePoints} engine and written back onto the nearest
 * outline vertex.
 *
 * v1 scope (deliberate, not silent — see review 2026-06-18):
 * - Moves only the tagged outline vertex; curve blending between grade points
 *   is a follow-up. On curved (C/Q) outlines this shifts the command endpoint
 *   only, not its control points.
 * - **Grades the OUTLINE only. Internals (darts/notches/grainlines) are carried
 *   unchanged** — unlike the uniform {@link gradePiece}, which scales them.
 *   Proper internal grading lands with the displacement-field/blending
 *   increment; until then a producer of `gradeRules` must surface this so a
 *   piece with internals is not silently regressed. (Scope plan, Step 2.)
 * - A rule whose anchor no longer lies on the outline is dropped (D-2: path
 *   manda). Returns the piece unchanged when it has no rules.
 *
 * @param piece - The imported piece to grade (must carry `gradeRules` to do anything)
 * @param baseMeasurements - Body measurements for the base size
 * @param targetMeasurements - Body measurements for the target size
 * @returns A new pattern piece with the graded outline (input is not mutated)
 */
export function gradePieceByRules(
  piece: PatternPiece,
  baseMeasurements: Record<string, number>,
  targetMeasurements: Record<string, number>,
): PatternPiece {
  const gradeRules = piece.gradeRules;
  if (!gradeRules || gradeRules.length === 0) return { ...piece };

  // Resolve each rule's anchor to a live point on the current outline. A rule
  // whose refPoint no longer sits on the outline is dropped (D-2: path manda).
  const resolved: { point: Point2D; rules: GradeRule[] }[] = [];
  for (const gr of gradeRules) {
    const hit = resolveNotchAnchor(piece.outline, gr.anchor);
    if (!hit) continue;
    resolved.push({ point: hit.point, rules: gr.rules });
  }
  if (resolved.length === 0) return { ...piece };

  // Per-point measurement-driven shift via the existing grade engine. The
  // engine reads target values from `gradeTable.sizes[targetSize]`, so we adapt
  // the target measurement record into a single-entry table.
  const gradedPoints: GradedPoint[] = resolved.map((r) => ({ x: r.point.x, y: r.point.y, rules: r.rules }));
  const shifted = gradePoints(gradedPoints, {
    baseSize: 'base',
    targetSize: 'target',
    gradeTable: { sizes: { target: targetMeasurements } },
    baseMeasurements,
  });

  // Write each shift back onto the nearest outline vertex.
  const outline: PathCommand[] = piece.outline.map((cmd) => ({ type: cmd.type, values: [...cmd.values] }));
  for (let i = 0; i < resolved.length; i++) {
    const from = resolved[i].point;
    const dx = shifted[i].x - from.x;
    const dy = shifted[i].y - from.y;
    if (dx === 0 && dy === 0) continue;

    let bestIdx = -1;
    let bestDist = Infinity;
    for (let c = 0; c < outline.length; c++) {
      const ep = commandEndpoint(outline[c]);
      if (!ep) continue;
      const d = Math.hypot(ep.x - from.x, ep.y - from.y);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = c;
      }
    }
    if (bestIdx >= 0) {
      const v = outline[bestIdx].values;
      v[v.length - 2] += dx;
      v[v.length - 1] += dy;
    }
  }

  // v1: internals are carried unchanged (outline-only grading) — see docstring.
  return { ...piece, outline };
}
