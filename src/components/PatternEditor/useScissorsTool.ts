import { useState, useCallback, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { addPiece, removePiece } from '../../store/projectSlice';
import type { Point2D, PatternPiece } from '../../types/types';
import { flattenPath } from '../../utils/seam/index';
import { linePolylineIntersections } from '../../utils/geometry/lineIntersect';
import { splitPieceAtLine } from '../../utils/patternOps';

export interface ScissorsState {
  targetPieceId: string | null;
  startPoint: Point2D | null;
  endPoint: Point2D | null;
  hoveredEdgePoint: Point2D | null;
  previewValid: boolean;
}

const INITIAL_STATE: ScissorsState = {
  targetPieceId: null,
  startPoint: null,
  endPoint: null,
  hoveredEdgePoint: null,
  previewValid: false,
};

const SNAP_THRESHOLD = 8; // screen pixels

export function useScissorsTool(zoom2D: number, pan2D: Point2D) {
  const dispatch = useDispatch();
  const pieces = useSelector((s: RootState) => s.project.pieces);
  const selectedPieceIds = useSelector((s: RootState) => s.editor.selectedPieceIds);

  const [state, setState] = useState<ScissorsState>(INITIAL_STATE);
  const stateRef = useRef(state);
  stateRef.current = state;

  const toPattern = useCallback(
    (e: React.MouseEvent<SVGSVGElement>): Point2D => {
      const svg = e.currentTarget;
      const rect = svg.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left - pan2D.x) / zoom2D,
        y: (e.clientY - rect.top - pan2D.y) / zoom2D,
      };
    },
    [zoom2D, pan2D],
  );

  /** Find nearest point on piece outline to a pattern-space point */
  const snapToOutline = useCallback(
    (pt: Point2D, piece: PatternPiece): Point2D | null => {
      const localPt = { x: pt.x - piece.position.x, y: pt.y - piece.position.y };
      const flatPoints = flattenPath(piece.outline);
      let bestDist = Infinity;
      let bestPt: Point2D | null = null;

      for (let i = 0; i < flatPoints.length - 1; i++) {
        const a = flatPoints[i];
        const b = flatPoints[i + 1];
        // Project localPt onto segment a-b
        const abx = b.x - a.x;
        const aby = b.y - a.y;
        const len2 = abx * abx + aby * aby;
        if (len2 === 0) continue;
        let t = ((localPt.x - a.x) * abx + (localPt.y - a.y) * aby) / len2;
        t = Math.max(0, Math.min(1, t));
        const proj = { x: a.x + t * abx, y: a.y + t * aby };
        const dist = Math.hypot(localPt.x - proj.x, localPt.y - proj.y);
        if (dist < bestDist) {
          bestDist = dist;
          bestPt = { x: proj.x + piece.position.x, y: proj.y + piece.position.y };
        }
      }

      const threshold = SNAP_THRESHOLD / zoom2D;
      return bestDist <= threshold ? bestPt : null;
    },
    [zoom2D],
  );

  /** Check if the cut line produces exactly 2 intersections */
  const validateCut = useCallback(
    (piece: PatternPiece, start: Point2D, end: Point2D): boolean => {
      const localStart = { x: start.x - piece.position.x, y: start.y - piece.position.y };
      const localEnd = { x: end.x - piece.position.x, y: end.y - piece.position.y };
      const flatPoints = flattenPath(piece.outline);
      const hits = linePolylineIntersections(localStart, localEnd, flatPoints);
      return hits.length >= 2;
    },
    [],
  );

  const reset = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const pt = toPattern(e);
      const s = stateRef.current;

      if (!s.targetPieceId) {
        // First: target a piece (use selected piece or click on one)
        const targetId = selectedPieceIds[0] ?? null;
        if (targetId) {
          const piece = pieces.find(p => p.id === targetId);
          if (piece) {
            const snap = snapToOutline(pt, piece);
            if (snap) {
              setState({
                targetPieceId: targetId,
                startPoint: snap,
                endPoint: null,
                hoveredEdgePoint: null,
                previewValid: false,
              });
            } else {
              setState({ ...INITIAL_STATE, targetPieceId: targetId });
            }
          }
        }
        return;
      }

      const piece = pieces.find(p => p.id === s.targetPieceId);
      if (!piece) return;

      if (!s.startPoint) {
        // Set start point
        const snap = snapToOutline(pt, piece);
        if (snap) {
          setState(prev => ({ ...prev, startPoint: snap }));
        }
        return;
      }

      // Set end point and execute split
      const snap = snapToOutline(pt, piece);
      if (!snap) return;

      if (!validateCut(piece, s.startPoint, snap)) return;

      try {
        const [pieceA, pieceB] = splitPieceAtLine(piece, s.startPoint, snap);
        dispatch(removePiece(piece.id));
        dispatch(addPiece(pieceA));
        dispatch(addPiece(pieceB));
        reset();
      } catch {
        // Invalid cut — ignore
      }
    },
    [toPattern, pieces, selectedPieceIds, snapToOutline, validateCut, dispatch, reset],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const s = stateRef.current;
      if (!s.targetPieceId) return;

      const piece = pieces.find(p => p.id === s.targetPieceId);
      if (!piece) return;

      const pt = toPattern(e);
      const snap = snapToOutline(pt, piece);

      if (s.startPoint && snap) {
        const valid = validateCut(piece, s.startPoint, snap);
        setState(prev => ({ ...prev, hoveredEdgePoint: snap, endPoint: snap, previewValid: valid }));
      } else {
        setState(prev => ({ ...prev, hoveredEdgePoint: snap, endPoint: null, previewValid: false }));
      }
    },
    [toPattern, pieces, snapToOutline, validateCut],
  );

  const handleMouseUp = useCallback(() => {
    // No-op — scissors uses clicks, not drag
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        reset();
      }
    },
    [reset],
  );

  const getCursor = useCallback((): string => {
    const s = stateRef.current;
    if (s.hoveredEdgePoint) return 'crosshair';
    if (s.targetPieceId) return 'crosshair';
    return 'default';
  }, []);

  return {
    ...state,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleKeyDown,
    getCursor,
    reset,
  };
}
