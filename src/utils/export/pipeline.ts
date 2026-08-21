/**
 * Unified Export Pipeline — shared piece preparation for all export formats.
 *
 * Extracts common logic (bounding box, seam allowance, layout) so that
 * format-specific renderers (DXF, AAMA, PDF, cutting layout) consume
 * pre-processed data without duplicating preparation steps.
 */

import type { PatternPiece, PathCommand, Point2D, Seam } from '../../types/types';
import { flattenPath } from '../seam/index';
import { outlineBBoxCenter, rotateOutline } from '../geometry/transform';
import {
  generateSeamAllowanceWithCorners,
  hasPositiveEdgeAllowance,
  type MatchLookup,
} from '../seam/cornerTypes';
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
  /** SA offset outline as PathCommand[] (empty without any explicit width or if generation failed) */
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
/**
 * Devuelve la pieza con su `rotation` ya aplicada a la geometría, sobre el
 * mismo pivote que usa el editor 2D (`outlineBBoxCenter` del contorno
 * original) — así lo que sale en el archivo coincide con lo que se ve en
 * pantalla. Sin rotación devuelve la misma pieza, sin copiar.
 */
function applyPieceRotation(piece: PatternPiece): PatternPiece {
  const deg = piece.rotation ?? 0;
  if (!deg) return piece;
  const rad = (deg * Math.PI) / 180;
  const pivot = outlineBBoxCenter(piece.outline);
  return {
    ...piece,
    outline: rotateOutline(piece.outline, pivot, rad),
    internals: piece.internals.map(l => ({ ...l, path: rotateOutline(l.path, pivot, rad) })),
    // El giro ya está en las coordenadas: dejarlo en el campo lo aplicaría dos
    // veces si alguien río abajo lo volviera a leer.
    rotation: 0,
  };
}

export function preparePiece(
  rawPiece: PatternPiece,
  opts: PipelineOptions = {},
  matchLookup?: MatchLookup,
): Omit<PreparedPiece, 'offsetX' | 'offsetY'> {
  const resolution = opts.curveResolution ?? 12;

  // El giro entra ACÁ, antes de medir nada. Desde #1033 el tirador de giro
  // escribe `piece.rotation` en vez de hornear el ángulo en las coordenadas,
  // así que sin esto el archivo saldría sin girar.
  //
  // Y tiene que ser antes de `computeBBox`: si se gira más abajo (por ejemplo
  // dentro del emisor de un formato), `preparePieces` ya decidió `currentX`
  // con el ancho SIN girar y las piezas se pisan. Girar aquí lo arregla para
  // los cuatro consumidores a la vez — AAMA, PDF, DXF plano y layout de corte.
  const piece = applyPieceRotation(rawPiece);

  const flatOutline = flattenPath(piece.outline, resolution);
  const boundingBox = computeBBox(piece.outline);

  let seamOutline: PathCommand[] = [];
  let flatSeamOutline: Point2D[] = [];

  if (piece.seamAllowance > 0 || hasPositiveEdgeAllowance(piece.edges)) {
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
