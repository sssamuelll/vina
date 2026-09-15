import { useState, useCallback, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { addPiece, removePiece, removeSeam } from '../../store/projectSlice';
import type { Point2D, PatternPiece } from '../../types/types';
import { mergePieces } from '../../utils/patternOps';
import { findSharedEdge } from '../../utils/geometry/mergeOutline';
import { hitTestPieceBBox } from '../../utils/geometry/hitTest';
import { screenToPattern } from '../../utils/geometry';
import { useGuardedAction } from '../../hooks/useGuardedAction';
import { noPasoNada } from './noPasoNada';
import { piezaBloqueada } from '../../utils/piezaBloqueada';

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
  const layerLocked = useSelector((s: RootState) => s.project.layerLocked);
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

  /**
   * El mismo hit-test que el resto del lienzo, no una copia.
   *
   * Aquí vivía el bucle otra vez, sumando `piece.position` en lugar de traer el
   * punto a coordenadas de la pieza: con la pieza girada medía contra el
   * fantasma sin girar y el clic no enganchaba. Es exactamente #1064, que
   * `PatternEditor.tsx:500` ya arregló dejando escrita la razón — esta copia se
   * quedó atrás. Llevaba además un segundo defecto: con un comando de número
   * impar de valores usaba `0` como `y`, lo que estiraba la caja hasta el origen.
   */
  const hitTestPiece = useCallback(
    (pt: Point2D): PatternPiece | null => hitTestPieceBBox(pt, pieces),
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

      // El candado no se lee: ni para armar el primer sujeto, ni para el
      // segundo, que es el clic que de verdad borra las dos piezas (#1145).
      // `guardAction` no es una defensa — en modo experto ejecuta sin
      // preguntar (`useGuardedAction.ts:120-124`) — así que este es el único
      // filtro real, igual que ya lo es para Tijeras.
      if (piezaBloqueada(clickedPiece, layerLocked)) {
        noPasoNada('unir:pieza-bloqueada', { pieceId: clickedPiece.id });
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
    [toPattern, hitTestPiece, pieces, seams, dispatch, reset, guardAction, layerLocked],
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
