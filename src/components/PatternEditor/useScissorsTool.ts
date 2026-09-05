import { useState, useCallback, useRef } from 'react';
import { useDispatch, useSelector, useStore } from 'react-redux';
import type { RootState } from '../../store';
import { addPiece, removePiece, addSeam, updatePiece } from '../../store/projectSlice';
import { selectAllPieces } from '../../store/editorSlice';
import type { Point2D, PatternPiece, Seam } from '../../types/types';
import { flattenPath } from '../../utils/seam/index';
import { linePolylineIntersections } from '../../utils/geometry/lineIntersect';
import { screenToPattern, screenToPatternLength } from '../../utils/geometry';
import { splitPieceAtLine, findCutEdgePair } from '../../utils/patternOps';
import { useGuardedAction } from '../../hooks/useGuardedAction';
import { newId } from '../../utils/ids';
import { patternToPieceLocal, pieceLocalToPattern } from './pieceTransform';
import { noPasoNada } from './noPasoNada';

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
  const store = useStore<RootState>();
  const pieces = useSelector((s: RootState) => s.project.pieces);
  const selectedPieceIds = useSelector((s: RootState) => s.editor.selectedPieceIds);
  const autoSew = useSelector((s: RootState) => s.tools.toolOptions?.scissors?.autoSew ?? true) as boolean;
  const seamType = useSelector((s: RootState) => s.tools.toolOptions?.scissors?.seamType ?? 'standard') as Seam['type'];
  const guardAction = useGuardedAction();

  const [state, setState] = useState<ScissorsState>(INITIAL_STATE);
  const stateRef = useRef(state);
  stateRef.current = state;
  const piecesRef = useRef(pieces);
  piecesRef.current = pieces;

  const toPattern = useCallback(
    (e: React.MouseEvent<SVGSVGElement>): Point2D => {
      const rect = e.currentTarget.getBoundingClientRect();
      return screenToPattern(e.clientX, e.clientY, rect, zoom2D, pan2D);
    },
    [zoom2D, pan2D],
  );

  /** Find nearest point on piece outline to a pattern-space point */
  const snapToOutline = useCallback(
    (pt: Point2D, piece: PatternPiece): Point2D | null => {
      const localPt = patternToPieceLocal(pt, piece);
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
          // `localPt` sí se des-giró arriba; subir el resultado sumando solo
          // la posición deshace la mitad de la vuelta y devuelve un punto que
          // no está sobre el contorno que se ve (#1116).
          bestPt = pieceLocalToPattern(proj, piece);
        }
      }

      const threshold = screenToPatternLength(SNAP_THRESHOLD, zoom2D);
      return bestDist <= threshold ? bestPt : null;
    },
    [zoom2D],
  );

  /** Check if the cut line produces exactly 2 intersections */
  const validateCut = useCallback(
    (piece: PatternPiece, start: Point2D, end: Point2D): boolean => {
      const localStart = patternToPieceLocal(start, piece);
      const localEnd = patternToPieceLocal(end, piece);
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

      // El press manda el objeto (spec 2026-08-11 § 4.1): la pieza cuyo
      // contorno está bajo el cursor. Solo lo que se ve y se puede editar —
      // el mismo filtro que pinta PieceRenderer — y, entre superpuestas, la
      // de arriba. Capas y bloqueos se leen del store en el momento del
      // press, no del render: un toggle de capa justo antes del clic no
      // puede dejar una pieza invisible como objetivo.
      const resolveInitialPress = () => {
        const { simulation: { hiddenLayerIds }, project: { layerLocked } } = store.getState();
        const orderedPieces = pieces
          .filter(piece => (
            !hiddenLayerIds.includes(piece.layer ?? 1)
            && !piece.locked
            && !layerLocked[piece.layer ?? 1]
          ))
          .sort((a, b) => {
            const aSelected = selectedPieceIds.includes(a.id);
            const bSelected = selectedPieceIds.includes(b.id);
            if (aSelected !== bSelected) return aSelected ? -1 : 1;
            return (b.zOrder ?? 0) - (a.zOrder ?? 0);
          });
        for (const piece of orderedPieces) {
          const snap = snapToOutline(pt, piece);
          if (!snap) continue;
          setState({ ...INITIAL_STATE, targetPieceId: piece.id, startPoint: snap });
          return;
        }
        setState(INITIAL_STATE);
      };

      if (!s.targetPieceId) {
        resolveInitialPress();
        return;
      }

      const piece = pieces.find(p => p.id === s.targetPieceId);
      if (!piece) {
        resolveInitialPress();
        return;
      }

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

      const startPoint = s.startPoint;
      if (!startPoint || !validateCut(piece, startPoint, snap)) return;

      guardAction('splitPiece', () => {
        const currentPiece = piecesRef.current.find(p => p.id === piece.id);
        if (!currentPiece) return;

        try {
          const [pieceA, pieceB] = splitPieceAtLine(currentPiece, startPoint, snap);
          // Use meta.skipConfirmation to bypass confirmationMiddleware
          dispatch({ ...removePiece(currentPiece.id), meta: { skipConfirmation: true } });
          dispatch(addPiece(pieceA));
          dispatch(addPiece(pieceB));
          dispatch(selectAllPieces([pieceA.id, pieceB.id]));

          // Auto-sew: detect edges and create seam on cut edges
          if (autoSew) {
            const cutPair = findCutEdgePair(pieceA, pieceB);
            if (cutPair) {
              dispatch(updatePiece({ ...pieceA, edges: cutPair.edgesA }));
              dispatch(updatePiece({ ...pieceB, edges: cutPair.edgesB }));
              dispatch(addSeam({
                id: newId(),
                pieceA: { pieceId: pieceA.id, edgeName: cutPair.edgeA.name },
                pieceB: { pieceId: pieceB.id, edgeName: cutPair.edgeB.name },
                type: seamType,
                tension: 100, strength: 1.0, active: true, taped: false, tapeWidth: 10,
              }));
            }
          }

          reset();
        } catch (err) {
          // `state.error` vivía aquí sin un solo consumidor: PatternEditor pasa
          // los otros cinco campos del estado y este no, así que el mensaje
          // —en inglés, además— no llegaba a nadie. El corte que no cruza es
          // un gesto que murió después de armarse: ese es el canal (#1116).
          noPasoNada('tijeras:corte-no-cruza', {
            pieceId: s.targetPieceId,
            motivo: err instanceof Error ? err.message : 'split-failed',
          });
        }
      });
    },
    [toPattern, pieces, selectedPieceIds, store, snapToOutline, validateCut, dispatch, reset, guardAction, autoSew, seamType],
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
