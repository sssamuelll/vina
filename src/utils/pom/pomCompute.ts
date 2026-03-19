/**
 * Pure compute functions for Points of Measure (POM).
 *
 * All functions are pure — no Redux, no side effects.
 * They resolve POM reference points to world coordinates and compute
 * distances using the appropriate method (straight / along-edge).
 */

import type { PointOfMeasure, POMPoint, PatternPiece, Point2D } from '../../types/types';
import { computePathArcLength } from '../geometry/arcLength';

// ─── World-position resolution ──────────────────────────────────────────────

/**
 * Resolve a POMPoint's local position to world coordinates by adding the
 * owning piece's canvas position.  Returns `null` if the piece is not found.
 */
export function resolveWorldPosition(
  pt: POMPoint,
  pieces: PatternPiece[],
): Point2D | null {
  const piece = pieces.find((p) => p.id === pt.pieceId);
  if (!piece) return null;
  return {
    x: piece.position.x + pt.localPosition.x,
    y: piece.position.y + pt.localPosition.y,
  };
}

// ─── Straight (Euclidean) distance ──────────────────────────────────────────

/**
 * Compute the Euclidean distance between two POM reference points after
 * resolving them to world coordinates.  Returns `null` if either piece is
 * missing.
 */
export function computeStraightDistance(
  pointA: POMPoint,
  pointB: POMPoint,
  pieces: PatternPiece[],
): number | null {
  const worldA = resolveWorldPosition(pointA, pieces);
  const worldB = resolveWorldPosition(pointB, pieces);
  if (!worldA || !worldB) return null;
  return Math.hypot(worldB.x - worldA.x, worldB.y - worldA.y);
}

// ─── Along-edge distance ────────────────────────────────────────────────────

/**
 * Compute distance along a named semantic edge.
 *
 * Uses pointA.edgeName to locate the edge on pointA's piece.
 * If the edge has a cached `length`, returns that directly.
 * Otherwise falls back to `computePathArcLength` over the edge's segment range.
 *
 * Returns `null` if the piece or edge is not found.
 */
export function computeAlongEdgeDistance(
  pom: PointOfMeasure,
  pieces: PatternPiece[],
): number | null {
  const piece = pieces.find((p) => p.id === pom.pointA.pieceId);
  if (!piece) return null;

  const edgeName = pom.pointA.edgeName;
  if (!edgeName) return null;

  const edge = piece.edges?.find((e) => e.name === edgeName);
  if (!edge) return null;

  // Always compute from geometry for correctness (edge.length may be stale after edits)
  const [start, end] = edge.segmentRange;
  return computePathArcLength(piece.outline, start, end);
}

// ─── Unified dispatcher ─────────────────────────────────────────────────────

/**
 * Compute a POM's value by dispatching to the correct method.
 * Currently supports `'straight'` and `'alongEdge'`.
 * Returns `null` for unsupported methods or if data is missing.
 */
export function computePOMValue(
  pom: PointOfMeasure,
  pieces: PatternPiece[],
): number | null {
  switch (pom.method) {
    case 'straight':
      return computeStraightDistance(pom.pointA, pom.pointB, pieces);
    case 'alongEdge':
      return computeAlongEdgeDistance(pom, pieces);
    default:
      return null;
  }
}

// ─── Batch recomputation ────────────────────────────────────────────────────

export interface POMUpdate {
  id: string;
  value: number;
}

/**
 * Recompute all POMs, returning `{ id, value }` pairs for those that could
 * be resolved.  Orphaned POMs (missing piece / edge) are silently skipped.
 */
export function recomputeAllPOMs(
  poms: PointOfMeasure[],
  pieces: PatternPiece[],
): POMUpdate[] {
  const updates: POMUpdate[] = [];
  for (const pom of poms) {
    const value = computePOMValue(pom, pieces);
    if (value != null) {
      updates.push({ id: pom.id, value });
    }
  }
  return updates;
}
