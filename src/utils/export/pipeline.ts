/**
 * Unified Export Pipeline — shared piece preparation for all export formats.
 *
 * Extracts common logic (bounding box, seam allowance, layout) so that
 * format-specific renderers (DXF, AAMA, PDF, cutting layout) consume
 * pre-processed data without duplicating preparation steps.
 */

import type { PatternPiece, PathCommand, Point2D, Seam } from '../../types/types';
import { flattenPath } from '../seam/index';
import { generateSeamAllowanceWithCorners, type MatchLookup } from '../seam/cornerTypes';
import { buildMatchLookup } from '../seam/matchResolver';

// ─── Types ───

export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

export interface PreparedPiece {
  /** Original piece (for access to raw PathCommands, internals, etc.) */
  piece: PatternPiece;
  /** Flattened outline as Point2D[] (for formats that need flat points) */
  flatOutline: Point2D[];
  /** SA offset outline as PathCommand[] (empty if SA=0 or generation failed) */
  seamOutline: PathCommand[];
  /** Flattened SA outline as Point2D[] */
  flatSeamOutline: Point2D[];
  /** Bounding box of the piece outline */
  boundingBox: BBox;
  /** Layout offset X (mm) — position in left-to-right strip layout */
  offsetX: number;
  /** Layout offset Y (mm) */
  offsetY: number;
}

export interface PipelineOptions {
  /** Spacing between pieces in mm (default: 30) */
  spacing?: number;
  /** Curve flattening resolution for flattenPath (default: 12) */
  curveResolution?: number;
  /** Project seams — enable `match` ("Empatada") corners. Absent → mitered fallback. */
  seams?: Seam[];
}

const DEFAULT_SPACING = 30; // mm

// ─── Bounding Box ───

/**
 * Compute bounding box from PathCommand[] by inspecting all coordinate values.
 * Works with raw (unflattened) commands — examines every numeric pair.
 */
export function computeBBox(commands: PathCommand[]): BBox {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const cmd of commands) {
    const v = cmd.values;
    for (let i = 0; i < v.length - 1; i += 2) {
      if (v[i] < minX) minX = v[i];
      if (v[i + 1] < minY) minY = v[i + 1];
      if (v[i] > maxX) maxX = v[i];
      if (v[i + 1] > maxY) maxY = v[i + 1];
    }
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/**
 * Compute bounding box from flat Point2D[].
 */
export function computeBBoxFromPoints(points: Point2D[]): BBox {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

// ─── Piece Preparation ───

/**
 * Prepare a single piece: flatten outline, compute SA, compute bbox.
 * Does NOT assign layout position (offsetX/offsetY default to 0).
 */
export function preparePiece(
  piece: PatternPiece,
  opts: PipelineOptions = {},
  matchLookup?: MatchLookup,
): Omit<PreparedPiece, 'offsetX' | 'offsetY'> {
  const resolution = opts.curveResolution ?? 12;

  const flatOutline = flattenPath(piece.outline, resolution);
  const boundingBox = computeBBox(piece.outline);

  let seamOutline: PathCommand[] = [];
  let flatSeamOutline: Point2D[] = [];

  if (piece.seamAllowance > 0) {
    // ALWAYS the edge-walk generator — this is the EXPORT path, so the cut line
    // here becomes the factory DXF/PDF. The old "plain piece" fast path went to
    // Clipper's ClipperOffset, which is broken in clipper2-js 1.2.4 and was
    // shipping scrambled cut lines to production files. maria-190.
    seamOutline = generateSeamAllowanceWithCorners(
      piece.outline, piece.seamAllowance, piece.defaultCornerType ?? 'mitered', piece.cornerTypes ?? {}, piece.edges, matchLookup,
    );
    if (seamOutline.length > 0) {
      flatSeamOutline = flattenPath(seamOutline, resolution);
    }
  }

  return { piece, flatOutline, seamOutline, flatSeamOutline, boundingBox };
}

/**
 * Prepare all pieces and lay them out left-to-right with spacing.
 *
 * This is the shared preparation step used by DXF (legacy), AAMA, and PDF exporters.
 * Each piece is positioned so its bounding box starts at (currentX, 0) with
 * minX/minY normalized to origin.
 */
export function preparePieces(
  pieces: PatternPiece[],
  opts: PipelineOptions = {},
): PreparedPiece[] {
  const spacing = opts.spacing ?? DEFAULT_SPACING;
  const prepared: PreparedPiece[] = [];
  let currentX = 0;

  for (const piece of pieces) {
    // `match` corners need the partner border's length — resolved against the
    // full piece set + seams. Absent seams → undefined → mitered fallback.
    const matchLookup = opts.seams ? buildMatchLookup(piece, pieces, opts.seams) : undefined;
    const base = preparePiece(piece, opts, matchLookup);
    const bb = base.boundingBox;

    const offsetX = currentX - bb.minX;
    const offsetY = -bb.minY;

    prepared.push({ ...base, offsetX, offsetY });

    currentX += bb.width + spacing;
  }

  return prepared;
}
