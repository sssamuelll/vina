import { useState, useCallback } from 'react';
import { PatternPiece, PathCommand, Point2D, Seam } from '../../types/types';

/**
 * Edge = a segment of a piece's outline (between two consecutive path commands).
 * edgeIndex corresponds to the PathCommand index (1-based, since 0 is always M).
 */
export interface EdgeSelection {
  pieceId: string;
  edgeIndex: number;
  /** Midpoint of the edge in pattern space (for visual feedback) */
  midpoint: Point2D;
}

interface SeamToolState {
  /** First edge selected (waiting for second) */
  firstEdge: EdgeSelection | null;
  /** Edge currently being hovered */
  hoveredEdge: EdgeSelection | null;
}

const EDGE_HIT_THRESHOLD = 15; // px in screen space

/** Get the start and end points of a path command given previous position */
function getEdgeEndpoints(
  commands: PathCommand[],
  edgeIndex: number,
): { start: Point2D; end: Point2D } | null {
  if (edgeIndex < 1 || edgeIndex >= commands.length) return null;

  // Find the "current point" before this command by tracing from start
  let cx = 0, cy = 0;
  for (let i = 0; i < edgeIndex; i++) {
    const cmd = commands[i];
    const v = cmd.values;
    switch (cmd.type) {
      case 'M': case 'L': cx = v[0]; cy = v[1]; break;
      case 'H': cx = v[0]; break;
      case 'V': cy = v[0]; break;
      case 'C': cx = v[4]; cy = v[5]; break;
      case 'Q': cx = v[2]; cy = v[3]; break;
      case 'Z': {
        // Z returns to the M point
        const m = commands[0];
        if (m.type === 'M') { cx = m.values[0]; cy = m.values[1]; }
        break;
      }
    }
  }
  const start = { x: cx, y: cy };

  const cmd = commands[edgeIndex];
  const v = cmd.values;
  let end: Point2D;
  switch (cmd.type) {
    case 'L': end = { x: v[0], y: v[1] }; break;
    case 'H': end = { x: v[0], y: cy }; break;
    case 'V': end = { x: cx, y: v[0] }; break;
    case 'C': end = { x: v[4], y: v[5] }; break;
    case 'Q': end = { x: v[2], y: v[3] }; break;
    case 'Z': {
      const m = commands[0];
      end = m.type === 'M' ? { x: m.values[0], y: m.values[1] } : start;
      break;
    }
    default: return null;
  }

  return { start, end };
}

/** Distance from point to line segment */
function distToSegment(p: Point2D, a: Point2D, b: Point2D): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Find the closest edge to a point across all pieces */
function findClosestEdge(
  pt: Point2D,
  pieces: PatternPiece[],
  zoom: number,
  excludePieceId?: string,
): EdgeSelection | null {
  let best: EdgeSelection | null = null;
  let bestDist = Infinity;

  for (const piece of pieces) {
    if (excludePieceId && piece.id === excludePieceId) continue;

    const cmds = piece.outline;
    for (let i = 1; i < cmds.length; i++) {
      if (cmds[i].type === 'Z') {
        // For Z, the edge goes from current point back to M
        const ep = getEdgeEndpoints(cmds, i);
        if (!ep) continue;
        const start = { x: ep.start.x + piece.position.x, y: ep.start.y + piece.position.y };
        const end = { x: ep.end.x + piece.position.x, y: ep.end.y + piece.position.y };
        const d = distToSegment(pt, start, end) * zoom;
        if (d < EDGE_HIT_THRESHOLD && d < bestDist) {
          bestDist = d;
          best = {
            pieceId: piece.id,
            edgeIndex: i,
            midpoint: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
          };
        }
        continue;
      }

      const ep = getEdgeEndpoints(cmds, i);
      if (!ep) continue;
      // Offset by piece position
      const start = { x: ep.start.x + piece.position.x, y: ep.start.y + piece.position.y };
      const end = { x: ep.end.x + piece.position.x, y: ep.end.y + piece.position.y };
      const d = distToSegment(pt, start, end) * zoom;
      if (d < EDGE_HIT_THRESHOLD && d < bestDist) {
        bestDist = d;
        best = {
          pieceId: piece.id,
          edgeIndex: i,
          midpoint: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
        };
      }
    }
  }

  return best;
}

export function useSeamTool(
  zoom: number,
  pan: Point2D,
  pieces: PatternPiece[],
  onComplete: (seam: Omit<Seam, 'id'>) => void,
) {
  const [state, setState] = useState<SeamToolState>({
    firstEdge: null,
    hoveredEdge: null,
  });

  const toPattern = useCallback((screenX: number, screenY: number, svgRect: DOMRect): Point2D => ({
    x: (screenX - svgRect.left - pan.x) / zoom,
    y: (screenY - svgRect.top - pan.y) / zoom,
  }), [zoom, pan]);

  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const pt = toPattern(e.clientX, e.clientY, rect);

    const edge = findClosestEdge(pt, pieces, zoom);
    if (!edge) {
      // Click on nothing — cancel
      setState({ firstEdge: null, hoveredEdge: null });
      return;
    }

    if (!state.firstEdge) {
      // First edge selection
      setState(prev => ({ ...prev, firstEdge: edge }));
    } else {
      // Second edge — must be different piece
      if (edge.pieceId === state.firstEdge.pieceId) return; // same piece, ignore

      onComplete({
        pieceA: {
          pieceId: state.firstEdge.pieceId,
          edgeStart: state.firstEdge.edgeIndex,
          edgeEnd: state.firstEdge.edgeIndex,
        },
        pieceB: {
          pieceId: edge.pieceId,
          edgeStart: edge.edgeIndex,
          edgeEnd: edge.edgeIndex,
        },
        type: 'standard',
      });
      setState({ firstEdge: null, hoveredEdge: null });
    }
  }, [toPattern, pieces, zoom, state.firstEdge, onComplete]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const pt = toPattern(e.clientX, e.clientY, rect);

    const excludeId = state.firstEdge?.pieceId;
    const edge = findClosestEdge(pt, pieces, zoom, state.firstEdge ? excludeId : undefined);
    setState(prev => ({ ...prev, hoveredEdge: edge }));
  }, [toPattern, pieces, zoom, state.firstEdge]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      setState({ firstEdge: null, hoveredEdge: null });
    }
  }, []);

  return {
    firstEdge: state.firstEdge,
    hoveredEdge: state.hoveredEdge,
    handleMouseDown,
    handleMouseMove,
    handleKeyDown,
  };
}

/** Get edge endpoints for rendering seam connections */
export { getEdgeEndpoints };
