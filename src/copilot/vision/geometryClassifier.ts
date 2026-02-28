/**
 * Geometry Classifier — Segment analysis for pattern piece edges.
 *
 * Provides functions to classify path segments by curvature type
 * and extract segment information from pattern outlines.
 *
 * @module copilot/vision/geometryClassifier
 */

import type { PathCommand, Point2D } from '../../types/types';
import type { SegmentType } from './types';

/**
 * Curvature threshold for classifying nearly-straight curves.
 * A curve is considered "straight" if its control points deviate from the
 * baseline by less than this fraction of the squared segment length.
 * Value of 0.01 means control points within 1% of the squared length
 * are treated as negligible curvature.
 */
const CURVATURE_THRESHOLD_RATIO = 0.01;

/**
 * Minimum number of sample points for Bezier length approximation.
 */
const MIN_BEZIER_SAMPLES = 1;

/**
 * Information about a classified segment.
 */
export interface SegmentInfo {
  /** Curvature type of the segment */
  type: SegmentType;
  /** Length of the segment in units */
  length: number;
  /** Start point of the segment */
  start: Point2D;
  /** End point of the segment */
  end: Point2D;
}

/**
 * Calculate the length of a straight line segment.
 */
function lineLength(p1: Point2D, p2: Point2D): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Approximate the length of a cubic Bezier curve by sampling.
 * Uses 10 sample points for reasonable accuracy.
 *
 * @param p0 - Start point
 * @param p1 - First control point
 * @param p2 - Second control point
 * @param p3 - End point
 * @param samples - Number of sample points (must be >= 1, defaults to 10)
 * @returns Approximate length of the curve
 */
function bezierLength(
  p0: Point2D,
  p1: Point2D,
  p2: Point2D,
  p3: Point2D,
  samples = 10
): number {
  // Validate samples parameter
  const validSamples = Math.max(MIN_BEZIER_SAMPLES, Math.floor(samples));

  let length = 0;
  let prevPoint = p0;

  for (let i = 1; i <= validSamples; i++) {
    const t = i / validSamples;
    const t2 = t * t;
    const t3 = t2 * t;
    const mt = 1 - t;
    const mt2 = mt * mt;
    const mt3 = mt2 * mt;

    const point: Point2D = {
      x: mt3 * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t3 * p3.x,
      y: mt3 * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t3 * p3.y,
    };

    length += lineLength(prevPoint, point);
    prevPoint = point;
  }

  return length;
}

/**
 * Approximate the length of a quadratic Bezier curve by sampling.
 *
 * @param p0 - Start point
 * @param p1 - Control point
 * @param p2 - End point
 * @param samples - Number of sample points (must be >= 1, defaults to 10)
 * @returns Approximate length of the curve
 */
function quadraticBezierLength(
  p0: Point2D,
  p1: Point2D,
  p2: Point2D,
  samples = 10
): number {
  // Validate samples parameter
  const validSamples = Math.max(MIN_BEZIER_SAMPLES, Math.floor(samples));

  let length = 0;
  let prevPoint = p0;

  for (let i = 1; i <= validSamples; i++) {
    const t = i / validSamples;
    const mt = 1 - t;

    const point: Point2D = {
      x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
      y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y,
    };

    length += lineLength(prevPoint, point);
    prevPoint = point;
  }

  return length;
}

/**
 * Classify a cubic Bezier curve as convex or concave based on control point positions.
 *
 * Uses the cross product of vectors from start-to-end and start-to-control-point
 * to determine which side of the line the curve bulges toward.
 *
 * - Negative cross product = control points are "above" the line = convex (bulging outward)
 * - Positive cross product = control points are "below" the line = concave (bulging inward)
 */
function classifyBezierCurvature(
  p0: Point2D,
  cp1: Point2D,
  cp2: Point2D,
  p3: Point2D
): SegmentType {
  // Vector from start to end
  const dx = p3.x - p0.x;
  const dy = p3.y - p0.y;

  // Degenerate case: start and end points coincide (zero-length segment)
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) {
    return 'straight';
  }

  // Cross products of (start→end) × (start→control point)
  const cross1 = dx * (cp1.y - p0.y) - dy * (cp1.x - p0.x);
  const cross2 = dx * (cp2.y - p0.y) - dy * (cp2.x - p0.x);

  // Average cross product to determine overall curve direction
  const avgCross = (cross1 + cross2) / 2;

  // Threshold to avoid classifying nearly-straight curves
  const threshold = lengthSq * CURVATURE_THRESHOLD_RATIO;

  if (Math.abs(avgCross) < threshold) {
    return 'straight';
  }

  // Negative = convex (control points above line in standard coords)
  // Positive = concave (control points below line)
  return avgCross < 0 ? 'convex' : 'concave';
}

/**
 * Classify a quadratic Bezier curve as convex or concave.
 */
function classifyQuadraticCurvature(
  p0: Point2D,
  cp: Point2D,
  p2: Point2D
): SegmentType {
  // Vector from start to end
  const dx = p2.x - p0.x;
  const dy = p2.y - p0.y;

  // Degenerate case: start and end points coincide (zero-length segment)
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) {
    return 'straight';
  }

  // Cross product of (start→end) × (start→control point)
  const cross = dx * (cp.y - p0.y) - dy * (cp.x - p0.x);

  // Threshold to avoid classifying nearly-straight curves
  const threshold = lengthSq * CURVATURE_THRESHOLD_RATIO;

  if (Math.abs(cross) < threshold) {
    return 'straight';
  }

  return cross < 0 ? 'convex' : 'concave';
}

/**
 * Safely get a value from segment.values array with bounds checking.
 * Returns 0 if index is out of bounds.
 */
function safeGetValue(values: number[], index: number): number {
  return index >= 0 && index < values.length ? values[index] : 0;
}

/**
 * Check if segment.values has the required number of values for a command type.
 */
function hasRequiredValues(values: number[], required: number): boolean {
  return values.length >= required;
}

/**
 * Classify a single path segment by its curvature type.
 *
 * @param segment - The path command to classify
 * @param prevPoint - The starting point of this segment (end of previous segment)
 * @returns SegmentInfo with type, length, start, and end points
 */
export function classifySegment(
  segment: PathCommand,
  prevPoint: Point2D
): SegmentInfo {
  const start = { ...prevPoint };

  switch (segment.type) {
    case 'L': {
      // Line to (x, y) - requires 2 values
      if (!hasRequiredValues(segment.values, 2)) {
        return { type: 'straight', length: 0, start, end: start };
      }
      const end: Point2D = { x: safeGetValue(segment.values, 0), y: safeGetValue(segment.values, 1) };
      return {
        type: 'straight',
        length: lineLength(start, end),
        start,
        end,
      };
    }

    case 'H': {
      // Horizontal line to x - requires 1 value
      if (!hasRequiredValues(segment.values, 1)) {
        return { type: 'straight', length: 0, start, end: start };
      }
      const end: Point2D = { x: safeGetValue(segment.values, 0), y: start.y };
      return {
        type: 'straight',
        length: Math.abs(end.x - start.x),
        start,
        end,
      };
    }

    case 'V': {
      // Vertical line to y - requires 1 value
      if (!hasRequiredValues(segment.values, 1)) {
        return { type: 'straight', length: 0, start, end: start };
      }
      const end: Point2D = { x: start.x, y: safeGetValue(segment.values, 0) };
      return {
        type: 'straight',
        length: Math.abs(end.y - start.y),
        start,
        end,
      };
    }

    case 'C': {
      // Cubic Bezier: C cp1x cp1y cp2x cp2y x y - requires 6 values
      if (!hasRequiredValues(segment.values, 6)) {
        return { type: 'straight', length: 0, start, end: start };
      }
      const cp1: Point2D = { x: safeGetValue(segment.values, 0), y: safeGetValue(segment.values, 1) };
      const cp2: Point2D = { x: safeGetValue(segment.values, 2), y: safeGetValue(segment.values, 3) };
      const end: Point2D = { x: safeGetValue(segment.values, 4), y: safeGetValue(segment.values, 5) };

      return {
        type: classifyBezierCurvature(start, cp1, cp2, end),
        length: bezierLength(start, cp1, cp2, end),
        start,
        end,
      };
    }

    case 'Q': {
      // Quadratic Bezier: Q cpx cpy x y - requires 4 values
      if (!hasRequiredValues(segment.values, 4)) {
        return { type: 'straight', length: 0, start, end: start };
      }
      const cp: Point2D = { x: safeGetValue(segment.values, 0), y: safeGetValue(segment.values, 1) };
      const end: Point2D = { x: safeGetValue(segment.values, 2), y: safeGetValue(segment.values, 3) };

      return {
        type: classifyQuadraticCurvature(start, cp, end),
        length: quadraticBezierLength(start, cp, end),
        start,
        end,
      };
    }

    case 'M': {
      // Move to - requires 2 values
      if (!hasRequiredValues(segment.values, 2)) {
        return { type: 'straight', length: 0, start, end: start };
      }
      const end: Point2D = { x: safeGetValue(segment.values, 0), y: safeGetValue(segment.values, 1) };
      return {
        type: 'straight',
        length: 0,
        start,
        end,
      };
    }

    case 'Z': {
      // Close path - line back to start (prevPoint should be start of path)
      // The caller should provide the path start as prevPoint for Z commands
      return {
        type: 'straight',
        length: 0, // Will be calculated by caller if needed
        start,
        end: start, // Z closes to path start, caller handles this
      };
    }

    default: {
      // For unsupported commands (S, T, A), treat as straight
      const end = segment.values.length >= 2
        ? { x: segment.values[segment.values.length - 2], y: segment.values[segment.values.length - 1] }
        : start;
      return {
        type: 'straight',
        length: lineLength(start, end),
        start,
        end,
      };
    }
  }
}

/**
 * Extract and classify all segments from a pattern outline.
 *
 * @param outline - Array of path commands defining the outline
 * @returns Array of SegmentInfo for each segment (excludes M commands)
 */
export function extractSegments(outline: PathCommand[]): SegmentInfo[] {
  const segments: SegmentInfo[] = [];

  if (outline.length === 0) {
    return segments;
  }

  // Find the starting point (first M command)
  let pathStart: Point2D = { x: 0, y: 0 };
  let currentPoint: Point2D = { x: 0, y: 0 };

  for (const cmd of outline) {
    if (cmd.type === 'M') {
      // M command requires 2 values, use defaults if missing
      if (hasRequiredValues(cmd.values, 2)) {
        pathStart = { x: safeGetValue(cmd.values, 0), y: safeGetValue(cmd.values, 1) };
        currentPoint = { ...pathStart };
      }
      continue;
    }

    if (cmd.type === 'Z') {
      // Close path - create segment back to path start
      if (currentPoint.x !== pathStart.x || currentPoint.y !== pathStart.y) {
        segments.push({
          type: 'straight',
          length: lineLength(currentPoint, pathStart),
          start: { ...currentPoint },
          end: { ...pathStart },
        });
      }
      currentPoint = { ...pathStart };
      continue;
    }

    // Classify the segment
    const segmentInfo = classifySegment(cmd, currentPoint);
    segments.push(segmentInfo);
    currentPoint = { ...segmentInfo.end };
  }

  return segments;
}
