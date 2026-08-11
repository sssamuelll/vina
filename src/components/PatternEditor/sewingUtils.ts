import type { PatternPiece, Point2D } from '../../types/types';
import { getEdgeEndpoints } from '../../utils/geometry/path';
import { commandPolyline, closestOnPolyline } from '../../utils/seam';

// ─── Shared Types ─────────────────────────────────────────────────────────────

/**
 * A selected edge segment — includes start/end points for rendering
 * snap dots and highlighted segments.
 */
export interface FreeEdgeSelection {
  pieceId: string;
  edgeIndex: number;
  /** Segment start in world space */
  start: Point2D;
  /** Segment end in world space */
  end: Point2D;
  /** Midpoint in world space */
  midpoint: Point2D;
  /**
   * Trazo del borde en mundo: la polilínea aplanada del comando, o sus dos
   * extremos si es recto. Sin esto `EdgePairOverlay` solo podía dibujar la
   * recta entre extremos, y el resalte de un borde curvo salía como su cuerda
   * — "CREA COSTURA EN RECTA, SIN SEGUIR LA CURVA" (maria #199).
   */
  path: Point2D[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const EDGE_HIT_THRESHOLD = 15; // px in screen space
export const VERTEX_SNAP_THRESHOLD = 10; // px in screen space

// ─── Pure Functions ───────────────────────────────────────────────────────────

/**
 * Convert screen coordinates to pattern space.
 * Re-exported from canonical geometry/coords.ts (C5 unification).
 * Pure function — wrap in useCallback within each hook.
 */
export { screenToPattern } from '../../utils/geometry';

/**
 * Resolve a semantic edge name from a segment index.
 * Falls back to `edge-{edgeIndex}` if no semantic edge matches.
 */
export function resolveEdgeName(piece: PatternPiece, edgeIndex: number): string {
  return piece.edges?.find(
    e => edgeIndex >= e.segmentRange[0] && edgeIndex < e.segmentRange[1],
  )?.name ?? `edge-${edgeIndex}`;
}

/** Build a FreeEdgeSelection from a piece + edge index */
export function buildEdgeSelection(piece: PatternPiece, edgeIndex: number): FreeEdgeSelection | null {
  const ep = getEdgeEndpoints(piece.outline, edgeIndex);
  if (!ep) return null;
  const start = { x: ep.start.x + piece.position.x, y: ep.start.y + piece.position.y };
  const end = { x: ep.end.x + piece.position.x, y: ep.end.y + piece.position.y };
  // El trazo real del comando, en mundo. Un recto aplanado son sus dos
  // extremos, así que esto no cambia nada para ellos; una curva trae su arco.
  const local = commandPolyline(piece.outline, edgeIndex);
  const path = local.length >= 2
    ? local.map(p => ({ x: p.x + piece.position.x, y: p.y + piece.position.y }))
    : [start, end];
  return {
    pieceId: piece.id,
    edgeIndex,
    start,
    end,
    midpoint: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
    path,
  };
}

/**
 * Find closest edge segment to a point across all pieces.
 * In 'point' mode, only matches vertices (segment endpoints).
 * In 'free' mode, matches anywhere along the segment.
 */
export function findClosestEdge(
  pt: Point2D,
  pieces: PatternPiece[],
  zoom: number,
  mode: 'free' | 'point',
  excludePieceId?: string,
): FreeEdgeSelection | null {
  let best: FreeEdgeSelection | null = null;
  let bestDist = Infinity;

  for (const piece of pieces) {
    if (excludePieceId && piece.id === excludePieceId) continue;

    const cmds = piece.outline;
    for (let i = 1; i < cmds.length; i++) {
      const sel = buildEdgeSelection(piece, i);
      if (!sel) continue;

      if (mode === 'point') {
        const dStart = Math.hypot(pt.x - sel.start.x, pt.y - sel.start.y) * zoom;
        const dEnd = Math.hypot(pt.x - sel.end.x, pt.y - sel.end.y) * zoom;
        const d = Math.min(dStart, dEnd);
        if (d < VERTEX_SNAP_THRESHOLD && d < bestDist) {
          bestDist = d;
          best = sel;
        }
      } else {
        // Contra el TRAZO, no contra la cuerda: sobre un arco abombado, clicar
        // encima de la línea caía fuera del umbral y clicar en el aire sobre la
        // cuerda caía dentro (maria #199, mismo fallo que el margen en #213).
        const hit = closestOnPolyline(pt, sel.path);
        if (!hit) continue;
        const d = hit.dist * zoom;
        if (d < EDGE_HIT_THRESHOLD && d < bestDist) {
          bestDist = d;
          best = sel;
        }
      }
    }
  }

  return best;
}
