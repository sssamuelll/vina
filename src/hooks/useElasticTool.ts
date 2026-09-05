import { useState, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../store';
import { addElastic, removeElastic } from '../store/projectSlice';
import type { PatternPiece, Point2D, Elastic } from '../types/types';
import { ELASTIC_DEFAULTS } from '../types/types';
import { uid } from '../utils/pathHelpers';
import { screenToPattern, resolveEdgeName, EDGE_HIT_THRESHOLD } from '../components/PatternEditor/sewingUtils';
import { getEdgeEndpoints } from '../utils/geometry/path';
import { screenToPatternLength } from '../utils/geometry';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface HoveredEdge {
  pieceId: string;
  edgeIndex: number;
  /** Midpoint in world (pattern) space — used for rendering highlight */
  midpoint: Point2D;
}

// ─── Pure helpers ──────────────────────────────────────────────────────────

/**
 * Find the nearest outline edge on `piece` to the given pattern-space point.
 * Returns null if no edge is within EDGE_HIT_THRESHOLD screen pixels.
 */
export function findNearestEdgeOnPiece(
  pt: Point2D,
  piece: PatternPiece,
  zoom: number,
): { edgeIndex: number; midpoint: Point2D } | null {
  const cmds = piece.outline;
  const ox = piece.position?.x ?? 0;
  const oy = piece.position?.y ?? 0;
  const threshold = screenToPatternLength(EDGE_HIT_THRESHOLD, zoom);

  let best: { edgeIndex: number; midpoint: Point2D; dist: number } | null = null;

  for (let i = 1; i < cmds.length; i++) {
    const ep = getEdgeEndpoints(cmds, i);
    if (!ep) continue;

    // World-space endpoints
    const sx = ep.start.x + ox;
    const sy = ep.start.y + oy;
    const ex = ep.end.x + ox;
    const ey = ep.end.y + oy;

    const dx = ex - sx;
    const dy = ey - sy;
    const lenSq = dx * dx + dy * dy;

    let t: number;
    if (lenSq === 0) {
      t = 0;
    } else {
      t = ((pt.x - sx) * dx + (pt.y - sy) * dy) / lenSq;
      t = Math.max(0, Math.min(1, t));
    }

    const closestX = sx + t * dx;
    const closestY = sy + t * dy;
    const dist = Math.hypot(pt.x - closestX, pt.y - closestY);

    if (dist < threshold && (!best || dist < best.dist)) {
      best = {
        edgeIndex: i,
        midpoint: { x: (sx + ex) / 2, y: (sy + ey) / 2 },
        dist,
      };
    }
  }

  if (!best) return null;
  return { edgeIndex: best.edgeIndex, midpoint: best.midpoint };
}

/**
 * Find the nearest edge across all pieces.
 */
export function findNearestEdge(
  pt: Point2D,
  pieces: PatternPiece[],
  zoom: number,
): HoveredEdge | null {
  let best: (HoveredEdge & { dist: number }) | null = null;

  for (const piece of pieces) {
    const hit = findNearestEdgeOnPiece(pt, piece, zoom);
    if (!hit) continue;

    const dist = Math.hypot(pt.x - hit.midpoint.x, pt.y - hit.midpoint.y);
    if (!best || dist < best.dist) {
      best = { pieceId: piece.id, edgeIndex: hit.edgeIndex, midpoint: hit.midpoint, dist };
    }
  }

  if (!best) return null;
  return { pieceId: best.pieceId, edgeIndex: best.edgeIndex, midpoint: best.midpoint };
}

// ─── Hook ──────────────────────────────────────────────────────────────────

/**
 * Interaction hook for the elastic/gathering tool.
 *
 * - Hover: highlights the nearest outline edge under the cursor.
 * - Click on edge with no elastic → dispatches `addElastic` with defaults.
 * - Click on edge that already has elastic(s) → selects the nearest one
 *   (by matching pieceId + edgeName).
 *
 * Only active when `activeTool2D === 'elastic'`.
 */
export function useElasticTool(
  zoom2D: number,
  pan2D: Point2D,
  pieces: PatternPiece[],
) {
  const dispatch = useDispatch();
  const activeTool = useSelector((s: RootState) => s.editor.activeTool);
  const elastics = useSelector((s: RootState) => s.project.elastics);

  const [hoveredEdge, setHoveredEdge] = useState<HoveredEdge | null>(null);
  const [selectedElasticId, setSelectedElasticId] = useState<string | null>(null);

  const isActive = activeTool === 'elastic';

  const toPattern = useCallback(
    (e: React.MouseEvent<SVGSVGElement>): Point2D => {
      const rect = e.currentTarget.getBoundingClientRect();
      return screenToPattern(e.clientX, e.clientY, rect, zoom2D, pan2D);
    },
    [zoom2D, pan2D],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!isActive) return;
      const pt = toPattern(e);
      const edge = findNearestEdge(pt, pieces, zoom2D);
      setHoveredEdge(edge);
    },
    [isActive, toPattern, pieces, zoom2D],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!isActive) return;
      if (e.button !== 0) return;

      const pt = toPattern(e);
      const edge = findNearestEdge(pt, pieces, zoom2D);
      if (!edge) return;

      const piece = pieces.find(p => p.id === edge.pieceId);
      if (!piece) return;

      const edgeName = resolveEdgeName(piece, edge.edgeIndex);

      // Check if this edge already has elastics
      const existingOnEdge = elastics.filter(
        el => el.pieceId === edge.pieceId && el.edgeName === edgeName,
      );

      if (existingOnEdge.length === 0) {
        // No elastic on this edge — add one with defaults
        const newElastic: Elastic = {
          id: `elastic-${uid()}`,
          pieceId: edge.pieceId,
          edgeName,
          ...ELASTIC_DEFAULTS,
        };
        dispatch(addElastic(newElastic));
        setSelectedElasticId(newElastic.id);
      } else {
        // Edge already has elastic(s) — select the nearest one (first, for single-edge case)
        // For future: compute by parametric distance tStart/tEnd centroid
        const nearest = existingOnEdge.reduce<Elastic | null>((acc, el) => {
          if (!acc) return el;
          // Select by closest midpoint parametric position to cursor t
          const ep = getEdgeEndpoints(piece.outline, edge.edgeIndex);
          if (!ep) return acc;
          const ox = piece.position?.x ?? 0;
          const oy = piece.position?.y ?? 0;
          const sx = ep.start.x + ox;
          const sy = ep.start.y + oy;
          const ex2 = ep.end.x + ox;
          const ey2 = ep.end.y + oy;
          const dx = ex2 - sx;
          const dy = ey2 - sy;
          const lenSq = dx * dx + dy * dy;
          if (lenSq === 0) return acc;
          const t = Math.max(0, Math.min(1, ((pt.x - sx) * dx + (pt.y - sy) * dy) / lenSq));
          const tMidEl = (el.tStart + el.tEnd) / 2;
          const tMidAcc = (acc.tStart + acc.tEnd) / 2;
          return Math.abs(t - tMidEl) < Math.abs(t - tMidAcc) ? el : acc;
        }, null);

        if (nearest) {
          setSelectedElasticId(nearest.id);
        }
      }
    },
    [isActive, toPattern, pieces, zoom2D, elastics, dispatch],
  );

  /**
   * Supr borra el elástico seleccionado; Escape lo suelta.
   *
   * El sujeto vive en el estado LOCAL de este hook, no en Redux, así que el
   * borrado no puede pasar por `resolverBorrado` (`store/borradoDeSeleccion.ts`),
   * que solo sabe leer el store. Es la misma familia que el borrado de nodos de
   * `useEditPattern`: quien tiene la selección es quien la borra.
   *
   * Sin sujeto NO se consume: si esta herramienta se quedara el Supr en vacío,
   * María no podría borrar una pieza con el Elástico activo.
   *
   * Devuelve `boolean` —el protocolo de `routeKey`, `useEditorInteractions.ts:114`—
   * en vez de parar el evento por dentro. Es la diferencia entre que la bitácora
   * diga `consumedBy: 'elastic'` y que mienta con `null`. Y va en la CAPTURA, no
   * en la burbuja: `edit.delete` (`shortcuts/defaults.ts:22`) es global y corre
   * antes que el router de burbuja, así que desde ahí Supr habría borrado la
   * pieza Y el elástico.
   */
  const handleKeyDown = useCallback(
    (e: KeyboardEvent): boolean => {
      if (!isActive || !selectedElasticId) return false;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        dispatch(removeElastic(selectedElasticId));
        setSelectedElasticId(null);
        return true;
      }

      if (e.key === 'Escape') {
        setSelectedElasticId(null);
        return true;
      }

      return false;
    },
    [isActive, selectedElasticId, dispatch],
  );

  return {
    hoveredEdge,
    selectedElasticId,
    handleMouseMove,
    handleMouseDown,
    handleKeyDown,
  };
}
