import { useState, useCallback } from 'react';
import { PatternPiece, Point2D, InternalLine, NotchOptions } from '../../types/types';
import { generateNotchPath, DEFAULT_NOTCH_OPTIONS } from '../../utils/notches';

/**
 * Notch tool: click on a piece edge to place a notch mark.
 * Notches are small perpendicular marks on the outline that indicate
 * alignment points for sewing pieces together.
 */

const EDGE_HIT_THRESHOLD = 20; // px screen space
const NOTCH_SIZE = 8; // mm in pattern space

interface NotchToolState {
  hoveredPoint: { pieceId: string; point: Point2D; normal: Point2D } | null;
}

/** Get closest point on piece outline to a given point */
function closestPointOnOutline(
  pt: Point2D,
  piece: PatternPiece,
  zoom: number,
): { point: Point2D; normal: Point2D; dist: number } | null {
  const cmds = piece.outline;
  let best: { point: Point2D; normal: Point2D; dist: number } | null = null;

  let cx = 0, cy = 0;
  for (let i = 0; i < cmds.length; i++) {
    const cmd = cmds[i];
    const v = cmd.values;
    let ex: number, ey: number;

    switch (cmd.type) {
      case 'M': cx = v[0]; cy = v[1]; continue;
      case 'L': ex = v[0]; ey = v[1]; break;
      case 'C': ex = v[4]; ey = v[5]; break;
      case 'Q': ex = v[2]; ey = v[3]; break;
      case 'Z': {
        const m = cmds[0];
        if (m.type !== 'M') continue;
        ex = m.values[0]; ey = m.values[1];
        break;
      }
      default: continue;
    }

    // Project pt onto segment cx,cy → ex,ey
    const sx = piece.position.x + cx;
    const sy = piece.position.y + cy;
    const exx = piece.position.x + ex;
    const eyy = piece.position.y + ey;
    const dx = exx - sx, dy = eyy - sy;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) { cx = ex; cy = ey; continue; }

    let t = ((pt.x - sx) * dx + (pt.y - sy) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const projX = sx + t * dx;
    const projY = sy + t * dy;
    const d = Math.hypot(pt.x - projX, pt.y - projY) * zoom;

    if (d < EDGE_HIT_THRESHOLD && (!best || d < best.dist)) {
      // Normal = perpendicular to edge, pointing inward
      const len = Math.sqrt(lenSq);
      const nx = -dy / len;
      const ny = dx / len;
      best = {
        point: { x: projX, y: projY },
        normal: { x: nx, y: ny },
        dist: d,
      };
    }

    cx = ex; cy = ey;
  }

  return best;
}

/** Create a notch InternalLine at a point with a normal direction */
function createNotchLine(point: Point2D, normal: Point2D, piecePos: Point2D, notchOptions?: NotchOptions): InternalLine {
  const localPt = { x: point.x - piecePos.x, y: point.y - piecePos.y };
  const opts = notchOptions || DEFAULT_NOTCH_OPTIONS;
  return {
    id: `notch-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type: 'notch',
    path: generateNotchPath(localPt, normal, opts),
    notchOptions: opts,
  };
}

export function useNotchTool(
  zoom: number,
  pan: Point2D,
  pieces: PatternPiece[],
  onAddNotch: (pieceId: string, notch: InternalLine) => void,
  notchOptions?: NotchOptions,
) {
  const [state, setState] = useState<NotchToolState>({ hoveredPoint: null });

  const toPattern = useCallback((screenX: number, screenY: number, svgRect: DOMRect): Point2D => ({
    x: (screenX - svgRect.left - pan.x) / zoom,
    y: (screenY - svgRect.top - pan.y) / zoom,
  }), [zoom, pan]);

  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const pt = toPattern(e.clientX, e.clientY, rect);

    for (const piece of pieces) {
      const hit = closestPointOnOutline(pt, piece, zoom);
      if (hit) {
        const notch = createNotchLine(hit.point, hit.normal, piece.position, notchOptions);
        onAddNotch(piece.id, notch);
        return;
      }
    }
  }, [toPattern, pieces, zoom, onAddNotch]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const pt = toPattern(e.clientX, e.clientY, rect);

    for (const piece of pieces) {
      const hit = closestPointOnOutline(pt, piece, zoom);
      if (hit) {
        setState({ hoveredPoint: { pieceId: piece.id, point: hit.point, normal: hit.normal } });
        return;
      }
    }
    setState({ hoveredPoint: null });
  }, [toPattern, pieces, zoom]);

  return {
    hoveredPoint: state.hoveredPoint,
    handleMouseDown,
    handleMouseMove,
  };
}
