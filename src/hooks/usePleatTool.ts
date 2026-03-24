import { useState, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '../store';
import type { PatternPiece, Point2D } from '../types/types';
import { PLEAT_DEFAULTS } from '../types/types';
import { addPleat } from '../store/projectSlice';
import { uid } from '../utils/pathHelpers';
import {
  screenToPattern,
  findClosestEdge,
  resolveEdgeName,
  type FreeEdgeSelection,
} from '../components/PatternEditor/sewingUtils';

export interface PleatToolState {
  hoveredEdge: FreeEdgeSelection | null;
  selectedPleatId: string | null;
}

export function usePleatTool(zoom: number, pan: Point2D) {
  const dispatch = useDispatch();
  const activeTool = useSelector((s: RootState) => s.editor.activeTool);
  const pieces = useSelector((s: RootState) => s.project.pieces);
  const pleats = useSelector((s: RootState) => s.project.pleats);

  const [state, setState] = useState<PleatToolState>({
    hoveredEdge: null,
    selectedPleatId: null,
  });

  const toPattern = useCallback(
    (screenX: number, screenY: number, svgRect: DOMRect): Point2D =>
      screenToPattern(screenX, screenY, svgRect, zoom, pan),
    [zoom, pan],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (activeTool !== 'pleat') return;
      const svg = e.currentTarget;
      const rect = svg.getBoundingClientRect();
      const pt = toPattern(e.clientX, e.clientY, rect);
      const edge = findClosestEdge(pt, pieces as PatternPiece[], zoom, 'free');
      setState(prev => ({ ...prev, hoveredEdge: edge }));
    },
    [activeTool, toPattern, pieces, zoom],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (activeTool !== 'pleat') return;
      if (e.button !== 0) return;

      const svg = e.currentTarget;
      const rect = svg.getBoundingClientRect();
      const pt = toPattern(e.clientX, e.clientY, rect);
      const edge = findClosestEdge(pt, pieces as PatternPiece[], zoom, 'free');
      if (!edge) {
        setState(prev => ({ ...prev, selectedPleatId: null }));
        return;
      }

      const piece = pieces.find((p: PatternPiece) => p.id === edge.pieceId);
      if (!piece) return;

      const edgeName = resolveEdgeName(piece, edge.edgeIndex);

      // Check if this edge already has a pleat
      const existingPleats = pleats.filter(
        (pl) => pl.pieceId === edge.pieceId && pl.edgeName === edgeName,
      );

      if (existingPleats.length > 0) {
        // Select the first existing pleat for editing
        setState(prev => ({ ...prev, selectedPleatId: existingPleats[0].id }));
      } else {
        // Add a new pleat with defaults
        const id = uid();
        dispatch(
          addPleat({
            id,
            pieceId: edge.pieceId,
            edgeName,
            ...PLEAT_DEFAULTS,
          }),
        );
        setState(prev => ({ ...prev, selectedPleatId: id }));
      }
    },
    [activeTool, toPattern, pieces, zoom, pleats, dispatch],
  );

  return {
    hoveredEdge: state.hoveredEdge,
    selectedPleatId: state.selectedPleatId,
    handleMouseMove,
    handleMouseDown,
  };
}
