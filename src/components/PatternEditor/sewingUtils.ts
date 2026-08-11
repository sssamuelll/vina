import type { PatternPiece, Point2D } from '../../types/types';
import { getEdgeEndpoints } from '../../utils/geometry/path';
import { edgeRangePolyline, closestOnPolyline } from '../../utils/seam';
import { edgeRangeForCommand } from '../../utils/semanticEdges';

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
   * Trazo en mundo del BORDE SEMÁNTICO entero — lo que se va a coser. Sin esto
   * `EdgePairOverlay` solo podía dibujar la recta entre extremos y el resalte
   * de un borde curvo salía como su cuerda ("CREA COSTURA EN RECTA, SIN SEGUIR
   * LA CURVA", maria #199); y mientras salió del comando clicado, enseñaba una
   * fracción de lo que la costura acababa cogiendo (#1042).
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

/**
 * Build a FreeEdgeSelection from a piece + edge index.
 *
 * La selección describe el BORDE SEMÁNTICO entero, que es lo que se va a
 * coser: `resolveEdgeName` resuelve el borde completo y ese nombre es el que
 * viaja al `Seam`. Antes el trazo se sacaba del COMANDO clicado, así que en un
 * patrón importado —donde un borde son 14-20 comandos— ella clicaba un lado,
 * se le iluminaba una veinteava parte, y la costura cosía el lado entero
 * (#1042). El resalte no es un adorno: es la única señal de qué se va a coser.
 *
 * Sin bordes detectados el rango cae al comando suelto y todo queda como
 * estaba.
 */
export function buildEdgeSelection(piece: PatternPiece, edgeIndex: number): FreeEdgeSelection | null {
  const ox = piece.position.x;
  const oy = piece.position.y;
  const local = edgeRangePolyline(piece.outline, edgeRangeForCommand(piece, edgeIndex));
  let path: Point2D[];
  if (local.length >= 2) {
    path = local.map(p => ({ x: p.x + ox, y: p.y + oy }));
  } else {
    // Lo que el aplanado no cubre (el cierre Z, entre otros): la cuerda.
    const ep = getEdgeEndpoints(piece.outline, edgeIndex);
    if (!ep) return null;
    path = [
      { x: ep.start.x + ox, y: ep.start.y + oy },
      { x: ep.end.x + ox, y: ep.end.y + oy },
    ];
  }
  const start = path[0];
  const end = path[path.length - 1];
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
        // Los vértices siguen siendo los del COMANDO: lo que este modo promete
        // es "clica cerca de un punto del contorno", y los vértices intermedios
        // de una polilínea densa son puntos del contorno. Lo que cambió con el
        // #1042 es lo que se DEVUELVE (el borde entero), no dónde se engancha.
        const ep = getEdgeEndpoints(piece.outline, i);
        if (!ep) continue;
        const vIni = { x: ep.start.x + piece.position.x, y: ep.start.y + piece.position.y };
        const vFin = { x: ep.end.x + piece.position.x, y: ep.end.y + piece.position.y };
        const dStart = Math.hypot(pt.x - vIni.x, pt.y - vIni.y) * zoom;
        const dEnd = Math.hypot(pt.x - vFin.x, pt.y - vFin.y) * zoom;
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
