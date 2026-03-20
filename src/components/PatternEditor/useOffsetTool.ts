import { useState, useCallback, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { addPiece, updatePiece } from '../../store/projectSlice';
import type { Point2D, PathCommand, PatternPiece } from '../../types/types';
import { offsetPieceOutline } from '../../utils/patternOps';
import { uid } from '../../utils/pathHelpers';

export interface OffsetState {
  previewOutline: PathCommand[] | null;
  error: string | null;
}

const INITIAL_STATE: OffsetState = {
  previewOutline: null,
  error: null,
};

export function useOffsetTool(zoom2D: number, pan2D: Point2D) {
  void zoom2D; void pan2D; // reserved for future distance-from-cursor preview
  const dispatch = useDispatch();
  const pieces = useSelector((s: RootState) => s.project.pieces);
  const selectedPieceIds = useSelector((s: RootState) => s.editor.selectedPieceIds);
  const toolOptions = useSelector((s: RootState) => s.tools.toolOptions);

  const [state, setState] = useState<OffsetState>(INITIAL_STATE);

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

    const { distance, direction, joinType } = getOptions();
    const effectiveDistance = direction === 'inward' ? -distance : distance;

    return offsetPieceOutline(piece, effectiveDistance, joinType);
  }, [selectedPieceIds, pieces, getOptions]);

  /** Whether the tool can execute (piece selected + valid preview) */
  const canExecute = selectedPieceIds.length === 1 && previewOutline !== null;

  /** Execute the offset operation */
  const execute = useCallback(() => {
    if (selectedPieceIds.length !== 1) {
      setState({ previewOutline: null, error: 'Select a single piece to offset' });
      return;
    }

    const piece = pieces.find(p => p.id === selectedPieceIds[0]);
    if (!piece) {
      setState({ previewOutline: null, error: 'Selected piece not found' });
      return;
    }

    const { distance, direction, joinType, replace } = getOptions();

    const createOffset = (effectiveDistance: number): PathCommand[] | null => {
      return offsetPieceOutline(piece, effectiveDistance, joinType);
    };

    if (direction === 'both') {
      // Create both outward and inward offsets
      const outward = createOffset(distance);
      const inward = createOffset(-distance);

      if (!outward && !inward) {
        setState({ previewOutline: null, error: 'Offset collapsed the shape in both directions' });
        return;
      }

      if (outward) {
        if (replace) {
          dispatch(updatePiece({ ...piece, outline: outward, edges: undefined, updatedAt: Date.now() }));
        } else {
          const newPiece: PatternPiece = {
            ...piece,
            id: uid(),
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
        setState({ previewOutline: null, error: 'Offset collapsed the shape — try a smaller distance' });
        return;
      }

      if (replace) {
        dispatch(updatePiece({ ...piece, outline: result, edges: undefined, updatedAt: Date.now() }));
      } else {
        const newPiece: PatternPiece = {
          ...piece,
          id: uid(),
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

    setState({ previewOutline: null, error: null });
  }, [selectedPieceIds, pieces, getOptions, dispatch]);

  const reset = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  const handleMouseDown = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    (_e: React.MouseEvent<SVGSVGElement>) => {
      // Click on a piece to select it (handled by useEditorInteractions select fallback)
    },
    [],
  );

  const handleMouseMove = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    (_e: React.MouseEvent<SVGSVGElement>) => {
      // No mouse-move behavior — preview is computed from selection
    },
    [],
  );

  const handleMouseUp = useCallback(() => {}, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Enter' && canExecute) {
        execute();
      }
      if (e.key === 'Escape') {
        reset();
      }
    },
    [canExecute, execute, reset],
  );

  const getCursor = useCallback((): string => {
    return 'crosshair';
  }, []);

  return {
    previewOutline,
    error: state.error,
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
