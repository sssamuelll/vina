import { useState, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../store';
import { addSeam } from '../../store/projectSlice';
import { selectSeam } from '../../store/editorSlice';
import type { PatternPiece, Point2D, Seam } from '../../types/types';
import { getEdgeEndpoints } from '../../utils/geometry/path';
import { screenToPattern, resolveEdgeName } from './sewingUtils';
import { screenToPatternLength } from '../../utils/geometry';
import { newId } from '../../utils/ids';

// ─── Types ────────────────────────────────────────────────────────────

export interface SnapResult {
  point: Point2D;
  edgeIndex: number;
  t: number;
  pieceId: string;
}

export interface SegmentSelection {
  pieceId: string;
  edgeIndex: number;
  startT: number;
  endT: number;
  startPoint: Point2D;
  endPoint: Point2D;
}

type Phase = 'idle' | 'a_start' | 'a_end' | 'b_start' | 'b_end';

interface SegmentSewingState {
  phase: Phase;
  segmentA: SegmentSelection | null;
  segmentB: SegmentSelection | null;
  pendingSnap: SnapResult | null;
  hoveredSnap: SnapResult | null;
}

const SNAP_THRESHOLD = 8;

// ─── Pure functions (exported for testing) ────────────────────────────

export function snapToEdge(
  pt: Point2D,
  piece: PatternPiece,
  zoom: number,
  edgeConstraint?: number,
): SnapResult | null {
  const threshold = screenToPatternLength(SNAP_THRESHOLD, zoom);
  const cmds = piece.outline;
  const ox = piece.position?.x ?? 0;
  const oy = piece.position?.y ?? 0;
  const localPt = { x: pt.x - ox, y: pt.y - oy };

  let best: SnapResult | null = null;
  let bestDist = Infinity;

  for (let i = 1; i < cmds.length; i++) {
    if (edgeConstraint !== undefined && i !== edgeConstraint) continue;

    const ep = getEdgeEndpoints(cmds, i);
    if (!ep) continue;

    const dx = ep.end.x - ep.start.x;
    const dy = ep.end.y - ep.start.y;
    const lenSq = dx * dx + dy * dy;

    let t: number;
    let closest: Point2D;

    if (lenSq === 0) {
      t = 0;
      closest = ep.start;
    } else {
      t = ((localPt.x - ep.start.x) * dx + (localPt.y - ep.start.y) * dy) / lenSq;
      t = Math.max(0, Math.min(1, t));
      closest = {
        x: ep.start.x + t * dx,
        y: ep.start.y + t * dy,
      };
    }

    const dist = Math.hypot(localPt.x - closest.x, localPt.y - closest.y);
    if (dist < threshold && dist < bestDist) {
      bestDist = dist;
      best = {
        point: { x: closest.x + ox, y: closest.y + oy },
        edgeIndex: i,
        t,
        pieceId: piece.id,
      };
    }
  }

  return best;
}

function snapToAnyEdge(
  pt: Point2D,
  pieces: PatternPiece[],
  zoom: number,
  constrainPieceId?: string,
  constrainEdge?: number,
): SnapResult | null {
  if (constrainPieceId) {
    const piece = pieces.find(p => p.id === constrainPieceId);
    if (!piece) return null;
    return snapToEdge(pt, piece, zoom, constrainEdge);
  }

  let best: SnapResult | null = null;
  let bestDist = Infinity;

  for (const piece of pieces) {
    const snap = snapToEdge(pt, piece, zoom);
    if (snap) {
      const dist = Math.hypot(pt.x - snap.point.x, pt.y - snap.point.y);
      if (dist < bestDist) {
        bestDist = dist;
        best = snap;
      }
    }
  }

  return best;
}

// ─── Hook ──────────────────────────────────────────────────────────────

export function useSegmentSewingTool(
  zoom2D: number,
  pan2D: Point2D,
  pieces: PatternPiece[],
) {
  const dispatch = useDispatch();
  const seamType = useSelector(
    (s: RootState) => (s.tools.toolOptions?.segmentSewing?.seamType as string) ?? 'standard',
  );

  const [state, setState] = useState<SegmentSewingState>({
    phase: 'idle',
    segmentA: null,
    segmentB: null,
    pendingSnap: null,
    hoveredSnap: null,
  });

  const toPattern = useCallback(
    (e: React.MouseEvent<SVGSVGElement>): Point2D => {
      const rect = e.currentTarget.getBoundingClientRect();
      return screenToPattern(e.clientX, e.clientY, rect, zoom2D, pan2D);
    },
    [zoom2D, pan2D],
  );

  const reset = useCallback(() => {
    setState({
      phase: 'idle',
      segmentA: null,
      segmentB: null,
      pendingSnap: null,
      hoveredSnap: null,
    });
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (e.button !== 0) return;
      const pt = toPattern(e);

      setState(prev => {
        switch (prev.phase) {
          case 'idle': {
            const snap = snapToAnyEdge(pt, pieces, zoom2D);
            if (!snap) return prev;
            return {
              ...prev,
              phase: 'a_start',
              pendingSnap: snap,
              segmentA: null,
              segmentB: null,
            };
          }

          case 'a_start': {
            if (!prev.pendingSnap) return prev;
            const snap = snapToAnyEdge(
              pt, pieces, zoom2D,
              prev.pendingSnap.pieceId,
              prev.pendingSnap.edgeIndex,
            );
            if (!snap) return prev;

            const startT = Math.min(prev.pendingSnap.t, snap.t);
            const endT = Math.max(prev.pendingSnap.t, snap.t);
            const startPt = startT === prev.pendingSnap.t ? prev.pendingSnap.point : snap.point;
            const endPt = endT === snap.t ? snap.point : prev.pendingSnap.point;

            if (Math.abs(endT - startT) < 0.01) return prev;

            return {
              ...prev,
              phase: 'a_end',
              segmentA: {
                pieceId: prev.pendingSnap.pieceId,
                edgeIndex: prev.pendingSnap.edgeIndex,
                startT,
                endT,
                startPoint: startPt,
                endPoint: endPt,
              },
              pendingSnap: null,
            };
          }

          case 'a_end': {
            if (!prev.segmentA) return prev;
            const snap = snapToAnyEdge(pt, pieces, zoom2D);
            if (!snap || snap.pieceId === prev.segmentA.pieceId) return prev;
            return {
              ...prev,
              phase: 'b_start',
              pendingSnap: snap,
            };
          }

          case 'b_start': {
            if (!prev.pendingSnap) return prev;
            const snap = snapToAnyEdge(
              pt, pieces, zoom2D,
              prev.pendingSnap.pieceId,
              prev.pendingSnap.edgeIndex,
            );
            if (!snap) return prev;

            const startT = Math.min(prev.pendingSnap.t, snap.t);
            const endT = Math.max(prev.pendingSnap.t, snap.t);
            const startPt = startT === prev.pendingSnap.t ? prev.pendingSnap.point : snap.point;
            const endPt = endT === snap.t ? snap.point : prev.pendingSnap.point;

            if (Math.abs(endT - startT) < 0.01) return prev;

            return {
              ...prev,
              phase: 'b_end',
              segmentB: {
                pieceId: prev.pendingSnap.pieceId,
                edgeIndex: prev.pendingSnap.edgeIndex,
                startT,
                endT,
                startPoint: startPt,
                endPoint: endPt,
              },
              pendingSnap: null,
            };
          }

          default:
            return prev;
        }
      });
    },
    [toPattern, pieces, zoom2D],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const pt = toPattern(e);

      setState(prev => {
        let constrainPiece: string | undefined;
        let constrainEdge: number | undefined;

        if (prev.phase === 'a_start' && prev.pendingSnap) {
          constrainPiece = prev.pendingSnap.pieceId;
          constrainEdge = prev.pendingSnap.edgeIndex;
        } else if (prev.phase === 'b_start' && prev.pendingSnap) {
          constrainPiece = prev.pendingSnap.pieceId;
          constrainEdge = prev.pendingSnap.edgeIndex;
        }

        const snap = snapToAnyEdge(pt, pieces, zoom2D, constrainPiece, constrainEdge);
        return { ...prev, hoveredSnap: snap };
      });
    },
    [toPattern, pieces, zoom2D],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        reset();
        return;
      }
      if (e.key === 'Backspace') {
        setState(prev => {
          switch (prev.phase) {
            case 'a_start':
              return { ...prev, phase: 'idle' as Phase, pendingSnap: null };
            case 'a_end':
              return { ...prev, phase: 'idle' as Phase, segmentA: null, pendingSnap: null };
            case 'b_start':
              return { ...prev, phase: 'a_end' as Phase, pendingSnap: null };
            case 'b_end':
              return { ...prev, phase: 'a_end' as Phase, segmentB: null, pendingSnap: null };
            default:
              return prev;
          }
        });
        return;
      }
      if (e.key === 'Enter' && state.phase === 'b_end' && state.segmentA && state.segmentB) {
        const segA = state.segmentA;
        const segB = state.segmentB;
        const pieceAObj = pieces.find(p => p.id === segA.pieceId);
        const pieceBObj = pieces.find(p => p.id === segB.pieceId);
        const edgeAName = pieceAObj ? resolveEdgeName(pieceAObj, segA.edgeIndex) : `edge-${segA.edgeIndex}`;
        const edgeBName = pieceBObj ? resolveEdgeName(pieceBObj, segB.edgeIndex) : `edge-${segB.edgeIndex}`;

        const seam: Omit<Seam, 'id'> = {
          pieceA: {
            pieceId: segA.pieceId,
            edgeName: edgeAName,
          },
          pieceB: {
            pieceId: segB.pieceId,
            edgeName: edgeBName,
          },
          type: seamType as Seam['type'],
          tension: 100,
          strength: 1.0,
          active: true,
          taped: false,
          tapeWidth: 10,
        };
        const fullSeam: Seam = { ...seam, id: newId() };
        dispatch(addSeam(fullSeam));
        dispatch(selectSeam(fullSeam.id));
        reset();
      }
    },
    [state.phase, state.segmentA, state.segmentB, seamType, dispatch, reset, pieces],
  );

  const getCursor = useCallback((): string => {
    if (state.hoveredSnap) return 'crosshair';
    return 'default';
  }, [state.hoveredSnap]);

  return {
    phase: state.phase,
    segmentA: state.segmentA,
    segmentB: state.segmentB,
    pendingSnap: state.pendingSnap,
    hoveredSnap: state.hoveredSnap,
    handleMouseDown,
    handleMouseMove,
    handleKeyDown,
    getCursor,
    reset,
  };
}
