import { useCallback, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { addPiece, updatePiece } from '../../store/projectSlice';
import { showErrorToast } from '../../store/copilotUISlice';
import type { Point2D, PathCommand, PatternPiece } from '../../types/types';
import { offsetPieceOutline } from '../../utils/patternOps';
import { uid } from '../../utils/pathHelpers';
import { piezaBloqueada } from '../../utils/piezaBloqueada';
import { noPasoNada } from './noPasoNada';

export function useOffsetTool(zoom2D: number, pan2D: Point2D) {
  void zoom2D; void pan2D; // reserved for future distance-from-cursor preview
  const dispatch = useDispatch();
  const pieces = useSelector((s: RootState) => s.project.pieces);
  const selectedPieceIds = useSelector((s: RootState) => s.editor.selectedPieceIds);
  const toolOptions = useSelector((s: RootState) => s.tools.toolOptions);
  const layerLocked = useSelector((s: RootState) => s.project.layerLocked);

  /** Read current tool options */
  const getOptions = useCallback(() => {
    const opts = toolOptions?.['offsetOutline'] ?? {};
    return {
      distance: Number(opts.distance ?? 10),
      direction: (opts.direction as 'outward' | 'inward' | 'both') ?? 'outward',
      joinType: (opts.joinType as 'round' | 'miter' | 'square') ?? 'round',
      replace: Boolean(opts.replace ?? false),
    };
  }, [toolOptions]);

  /** Compute preview outline based on selected piece and current options */
  const previewOutline = useMemo((): PathCommand[] | null => {
    if (selectedPieceIds.length !== 1) return null;
    const piece = pieces.find(p => p.id === selectedPieceIds[0]);
    if (!piece) return null;

    const { distance, direction, joinType, replace } = getOptions();

    // Mismo criterio que Extender/Recortar: armar un preview que luego se
    // rechaza en silencio al pulsar Enter es peor que no mostrarlo. Solo en
    // modo `replace` — en modo "crear pieza nueva" el preview es honesto,
    // porque `execute()` sí va a poder hacerlo (#1145).
    if (replace && piezaBloqueada(piece, layerLocked)) return null;

    const effectiveDistance = direction === 'inward' ? -distance : distance;

    return offsetPieceOutline(piece, effectiveDistance, joinType);
  }, [selectedPieceIds, pieces, getOptions, layerLocked]);

  /** Whether the tool can execute (piece selected + valid preview) */
  const canExecute = selectedPieceIds.length === 1 && previewOutline !== null;

  /** Execute the offset operation */
  const execute = useCallback(() => {
    // Sin una pieza seleccionada no hay nada que desplazar, y eso lo dice la
    // tira ANTES del clic (`faltaSujeto`, #1117): un toast por clic sería ruido.
    if (selectedPieceIds.length !== 1) return;

    const piece = pieces.find(p => p.id === selectedPieceIds[0]);
    if (!piece) return;

    const { distance, direction, joinType, replace } = getOptions();

    // El candado se leía para pintar (el chip, la fila de capas) y no para
    // escribir: en modo `replace` esto SUSTITUYE el contorno en el sitio, sin
    // dejar rastro de la geometría que el candado prometía proteger (#1145,
    // mismo mecanismo que #1136 encontró en Margen).
    //
    // Solo `replace`: en modo "crear pieza nueva" la original ni se toca —se
    // usa de referencia geométrica—, igual que mover ya se permite a
    // propósito sobre una pieza bloqueada. Bloquearlo también restringiría
    // algo que el candado nunca prometió proteger.
    if (replace && piezaBloqueada(piece, layerLocked)) {
      noPasoNada('desplazar:pieza-bloqueada', { pieceId: piece.id });
      return;
    }

    const createOffset = (effectiveDistance: number): PathCommand[] | null => {
      return offsetPieceOutline(piece, effectiveDistance, joinType);
    };

    if (direction === 'both') {
      // Create both outward and inward offsets
      const outward = createOffset(distance);
      const inward = createOffset(-distance);

      if (!outward && !inward) {
        dispatch(showErrorToast('El contorno se cerró sobre sí mismo en las dos direcciones. Prueba una distancia menor'));
        return;
      }

      if (outward) {
        if (replace) {
          dispatch(updatePiece({ ...piece, outline: outward, edges: undefined, updatedAt: Date.now() }));
        } else {
          const newPiece: PatternPiece = {
            ...piece,
            id: uid(),
            // La pieza derivada es geometría nueva: hereda `locked` por el
            // spread pero no hay ninguna razón de producto para que nazca
            // atascada como la original (#1145, revisión adversarial).
            locked: false,
            name: `${piece.name} Offset (out)`,
            outline: outward,
            edges: undefined,
            position: { ...piece.position },
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          dispatch(addPiece(newPiece));
        }
      }

      if (inward) {
        const newPiece: PatternPiece = {
          ...piece,
          id: uid(),
          // pieza derivada: no hereda el candado de la original (#1145)
          locked: false,
          name: `${piece.name} Offset (in)`,
          outline: inward,
          edges: undefined,
          position: { ...piece.position },
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        dispatch(addPiece(newPiece));
      }
    } else {
      const effectiveDistance = direction === 'inward' ? -distance : distance;
      const result = createOffset(effectiveDistance);

      if (!result) {
        dispatch(showErrorToast('El contorno se cerró sobre sí mismo. Prueba una distancia menor'));
        return;
      }

      if (replace) {
        dispatch(updatePiece({ ...piece, outline: result, edges: undefined, updatedAt: Date.now() }));
      } else {
        const newPiece: PatternPiece = {
          ...piece,
          id: uid(),
          // pieza derivada: no hereda el candado de la original (#1145)
          locked: false,
          name: `${piece.name} Offset`,
          outline: result,
          edges: undefined,
          position: { ...piece.position },
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        dispatch(addPiece(newPiece));
      }
    }

  }, [selectedPieceIds, pieces, getOptions, dispatch, layerLocked]);

  const handleMouseDown = useCallback(
    (_e: React.MouseEvent<SVGSVGElement>) => {
      // Click on a piece to select it (handled by useEditorInteractions select fallback)
    },
    [],
  );

  const handleMouseMove = useCallback(
    (_e: React.MouseEvent<SVGSVGElement>) => {
      // No mouse-move behavior — preview is computed from selection
    },
    [],
  );

  const handleMouseUp = useCallback(() => {}, []);

  // Esta herramienta ya no guarda estado propio —el preview se deriva de la
  // selección—, pero `useEditorInteractions` exige `reset` en la forma de toda
  // herramienta 2D. ponytail: no-op hasta que esa forma se limpie.
  const reset = useCallback(() => {}, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Enter' && canExecute) {
        execute();
      }
    },
    [canExecute, execute],
  );

  const getCursor = useCallback((): string => {
    return 'crosshair';
  }, []);

  return {
    previewOutline,
    canExecute,
    execute,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleKeyDown,
    getCursor,
    reset,
  };
}
