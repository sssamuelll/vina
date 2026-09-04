import { useState, useCallback, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { addPiece, removePiece, removeSeam } from '../../store/projectSlice';
import type { Point2D, PatternPiece } from '../../types/types';
import { mergePieces } from '../../utils/patternOps';
import { findSharedEdge } from '../../utils/geometry/mergeOutline';
import { screenToPattern } from '../../utils/geometry';
import { useGuardedAction } from '../../hooks/useGuardedAction';
import { noPasoNada } from './noPasoNada';

export interface MergeState {
  pieceIdA: string | null;
  pieceIdB: string | null;
  sharedEdgeFound: boolean;
  error: string | null;
}

const INITIAL_STATE: MergeState = {
  pieceIdA: null,
  pieceIdB: null,
  sharedEdgeFound: false,
  error: null,
};

export function useMergeTool(zoom2D: number, pan2D: Point2D) {
  const dispatch = useDispatch();
  const pieces = useSelector((s: RootState) => s.project.pieces);
  const seams = useSelector((s: RootState) => s.project.seams);
  const guardAction = useGuardedAction();

  const [state, setState] = useState<MergeState>(INITIAL_STATE);
  const stateRef = useRef(state);
  stateRef.current = state;

  const toPattern = useCallback(
    (e: React.MouseEvent<SVGSVGElement>): Point2D => {
      const rect = e.currentTarget.getBoundingClientRect();
      return screenToPattern(e.clientX, e.clientY, rect, zoom2D, pan2D);
    },
    [zoom2D, pan2D],
  );

  /** Hit-test: find which piece contains the point */
  const hitTestPiece = useCallback(
    (pt: Point2D): PatternPiece | null => {
      // Simple bounding box hit test
      for (const piece of pieces) {
        const ox = piece.position.x;
        const oy = piece.position.y;
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const cmd of piece.outline) {
          for (let i = 0; i < cmd.values.length; i += 2) {
            const x = cmd.values[i] + ox;
            const y = (i + 1 < cmd.values.length) ? cmd.values[i + 1] + oy : 0;
            if (x < minX) minX = x; if (x > maxX) maxX = x;
            if (y < minY) minY = y; if (y > maxY) maxY = y;
          }
        }
        if (pt.x >= minX && pt.x <= maxX && pt.y >= minY && pt.y <= maxY) {
          return piece;
        }
      }
      return null;
    },
    [pieces],
  );

  const reset = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const pt = toPattern(e);
      const s = stateRef.current;
      const clickedPiece = hitTestPiece(pt);

      if (!clickedPiece) {
        reset();
        return;
      }

      if (!s.pieceIdA) {
        // Select first piece
        setState({
          pieceIdA: clickedPiece.id,
          pieceIdB: null,
          sharedEdgeFound: false,
          error: null,
        });
        return;
      }

      if (clickedPiece.id === s.pieceIdA) {
        // Clic otra vez sobre la pieza ya elegida: unir necesita dos.
        noPasoNada('unir:misma-pieza', { pieceId: clickedPiece.id });
        return;
      }

      // Select second piece and try to merge
      const pieceA = pieces.find(p => p.id === s.pieceIdA);
      if (!pieceA) { reset(); return; }

      const shared = findSharedEdge(
        pieceA.outline, pieceA.position,
        clickedPiece.outline, clickedPiece.position,
        2,
      );

      if (!shared) {
        setState(prev => ({
          ...prev,
          pieceIdB: clickedPiece.id,
          sharedEdgeFound: false,
          // Este texto SÍ se pinta (MergeOverlay), y va como texto SVG sobre el
          // lienzo: en español y corto, que ahí no hay dónde envolverlo.
          error: 'Esas piezas no se tocan; acerca una al borde de la otra',
        }));
        return;
      }

      setState(prev => ({
        ...prev,
        pieceIdB: clickedPiece.id,
        sharedEdgeFound: true,
        error: null,
      }));

      // Execute merge
      guardAction('mergePieces', () => {
        try {
          const merged = mergePieces(pieceA, clickedPiece, 2);

          // Remove seams between the two pieces before removing pieces
          // (removePiece also cleans up seams, but we do it explicitly for clarity)
          for (const seam of seams) {
            if (
              (seam.pieceA.pieceId === pieceA.id && seam.pieceB.pieceId === clickedPiece.id) ||
              (seam.pieceA.pieceId === clickedPiece.id && seam.pieceB.pieceId === pieceA.id)
            ) {
              dispatch({ ...removeSeam(seam.id), meta: { skipConfirmation: true } });
            }
          }

          dispatch({ ...removePiece(pieceA.id), meta: { skipConfirmation: true } });
          dispatch({ ...removePiece(clickedPiece.id), meta: { skipConfirmation: true } });
          dispatch(addPiece(merged));

          reset();
        } catch {
          setState(prev => ({ ...prev, error: 'Esas dos piezas no se pudieron unir; prueba con otro par' }));
        }
      });
    },
    [toPattern, hitTestPiece, pieces, seams, dispatch, reset, guardAction],
  );

  const handleMouseMove = useCallback(
    (_e: React.MouseEvent<SVGSVGElement>) => {
      // Could add hover highlighting in the future
    },
    [],
  );

  const handleMouseUp = useCallback(() => {}, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') reset();
    },
    [reset],
  );

  const getCursor = useCallback((): string => {
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
