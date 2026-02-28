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
