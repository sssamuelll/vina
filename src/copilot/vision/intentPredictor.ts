/**
 * Intent Predictor — Pre-flight simulation and geometric auditing.
 *
 * Responsibilities:
 * - Validate proposed geometry changes before applying
 * - Check area integrity, self-intersection, seam compatibility
 * - Return structured results for LLM self-correction
 *
 * @module copilot/vision/intentPredictor
 */

import type { PathCommand } from '../../types/types';
import type { AuditResult } from './types';

// ─── Constants ──────────────────────────────────────────────────────────────

/** Default minimum area threshold in mm² */
export const DEFAULT_MIN_AREA_MM2 = 1;

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Extended audit result with computed area.
 */
export interface AreaAuditResult extends AuditResult {
  rule: 'area_integrity';
  /** Computed area in mm² */
  area?: number;
}

/**
 * Input for area integrity check.
 */
export interface AreaCheckInput {
  /** Piece outline to check */
  outline: PathCommand[];
  /** Minimum acceptable area in mm² (default: 1) */
  minArea?: number;
}

// ─── Geometry Helpers ───────────────────────────────────────────────────────

/**
 * Flatten path commands to points for area calculation.
 * Simplified version that handles M, L, and Z commands.
 */
function flattenOutlineToPoints(outline: PathCommand[]): [number, number][] {
  const points: [number, number][] = [];

  for (const cmd of outline) {
    switch (cmd.type) {
      case 'M':
      case 'L':
        points.push([cmd.values[0], cmd.values[1]]);
        break;
      case 'H':
        if (points.length > 0) {
          points.push([cmd.values[0], points[points.length - 1][1]]);
        }
        break;
      case 'V':
        if (points.length > 0) {
          points.push([points[points.length - 1][0], cmd.values[0]]);
        }
        break;
      case 'C':
        // For cubic bezier, just use the endpoint
        points.push([cmd.values[4], cmd.values[5]]);
        break;
      case 'Q':
        // For quadratic bezier, just use the endpoint
        points.push([cmd.values[2], cmd.values[3]]);
        break;
      case 'Z':
        // Close path, no new points needed
        break;
    }
  }

  return points;
}

/**
 * Compute polygon area using the shoelace formula.
 * Returns absolute area (always positive).
 */
function computePolygonArea(points: [number, number][]): number {
  if (points.length < 3) return 0;

  let area = 0;
  const n = points.length;

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i][0] * points[j][1];
    area -= points[j][0] * points[i][1];
  }

  return Math.abs(area / 2);
}

// ─── Area Integrity Check ───────────────────────────────────────────────────

/**
 * Check that a polygon has valid positive area.
 */
export function checkAreaIntegrity(input: AreaCheckInput): AreaAuditResult {
  const { outline, minArea = DEFAULT_MIN_AREA_MM2 } = input;

  // Empty outline check
  if (outline.length === 0) {
    return {
      rule: 'area_integrity',
      passed: false,
      message: 'Outline is empty',
    };
  }

  // Flatten and compute area
  const points = flattenOutlineToPoints(outline);
  const area = computePolygonArea(points);

  // Zero area check
  if (area === 0) {
    return {
      rule: 'area_integrity',
      passed: false,
      message: 'Polygon has zero area (degenerate or collinear points)',
      area: 0,
    };
  }

  // Minimum area check
  if (area < minArea) {
    return {
      rule: 'area_integrity',
      passed: false,
      message: `Area ${area.toFixed(2)}mm² is below minimum threshold of ${minArea}mm²`,
      area,
    };
  }

  return {
    rule: 'area_integrity',
    passed: true,
    area,
  };
}

// ─── Self-Intersection Check ────────────────────────────────────────────────

/**
 * Extended audit result for self-intersection check.
 */
export interface SelfIntersectionAuditResult extends AuditResult {
  rule: 'self_intersection';
  /** Number of intersection points found */
  intersectionCount?: number;
}

/**
 * Input for self-intersection check.
 */
export interface SelfIntersectionCheckInput {
  /** Piece outline to check */
  outline: PathCommand[];
}

/**
 * Check if two line segments intersect.
 * Returns true if segments (p1,p2) and (p3,p4) cross each other.
 */
function segmentsIntersect(
  p1: [number, number],
  p2: [number, number],
  p3: [number, number],
  p4: [number, number],
): boolean {
  // Cross product helper
  const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

  const d1 = cross(p3, p4, p1);
  const d2 = cross(p3, p4, p2);
  const d3 = cross(p1, p2, p3);
  const d4 = cross(p1, p2, p4);

  // Check if segments straddle each other
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }

  return false;
}

/**
 * Check that a polygon does not self-intersect.
 */
export function checkSelfIntersection(input: SelfIntersectionCheckInput): SelfIntersectionAuditResult {
  const { outline } = input;

  if (outline.length < 3) {
    return {
      rule: 'self_intersection',
      passed: true, // Not enough points to self-intersect
    };
  }

  const points = flattenOutlineToPoints(outline);
  const n = points.length;

  if (n < 4) {
    return {
      rule: 'self_intersection',
      passed: true, // Triangle can't self-intersect
    };
  }

  let intersectionCount = 0;

  // Check all non-adjacent segment pairs
  for (let i = 0; i < n; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % n];

    for (let j = i + 2; j < n; j++) {
      // Skip adjacent segments
      if (j === (i + n - 1) % n) continue;
      if (i === 0 && j === n - 1) continue; // First and last are adjacent

      const p3 = points[j];
      const p4 = points[(j + 1) % n];

      if (segmentsIntersect(p1, p2, p3, p4)) {
        intersectionCount++;
      }
    }
  }

  if (intersectionCount > 0) {
    return {
      rule: 'self_intersection',
      passed: false,
      message: `Polygon has ${intersectionCount} self-intersection(s)`,
      intersectionCount,
    };
  }

  return {
    rule: 'self_intersection',
    passed: true,
    intersectionCount: 0,
  };
}
