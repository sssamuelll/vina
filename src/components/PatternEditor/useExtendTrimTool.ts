import { useState, useCallback, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { updatePiece } from '../../store/projectSlice';
import type { Point2D, PatternPiece, PathCommand } from '../../types/types';
import { extendEdge, trimEdgeAtPoint } from '../../utils/patternOps';
import { flattenPath } from '../../utils/seam/index';

export interface ExtendTrimState {
  /** Currently hovered snap point (endpoint for extend, point-on-edge for trim) */
  hoveredSnap: { point: Point2D; segmentIndex: number; endpoint: 'start' | 'end' } | null;
  /** Selected endpoint to extend/trim from */
  selectedSnap: { point: Point2D; segmentIndex: number; endpoint: 'start' | 'end' } | null;
  /** Preview outline showing the result before confirmation */
  previewOutline: PathCommand[] | null;
  /** Error message if operation failed */
  error: string | null;
}

const INITIAL_STATE: ExtendTrimState = {
  hoveredSnap: null,
  selectedSnap: null,
  previewOutline: null,
  error: null,
};

const SNAP_THRESHOLD = 10; // screen pixels

export function useExtendTrimTool(zoom2D: number, pan2D: Point2D) {
  const dispatch = useDispatch();
  const pieces = useSelector((s: RootState) => s.project.pieces);
  const selectedPieceIds = useSelector((s: RootState) => s.editor.selectedPieceIds);
  const toolOptions = useSelector((s: RootState) => s.tools.toolOptions);

  const [state, setState] = useState<ExtendTrimState>(INITIAL_STATE);
  const stateRef = useRef(state);
  stateRef.current = state;

  const getOptions = useCallback(() => {
    const opts = toolOptions?.['extendTrim'] ?? {};
    return {
      mode: (opts.mode as 'extend' | 'trim') ?? 'extend',
      distance: Number(opts.distance ?? 20),
    };
  }, [toolOptions]);

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

  /** Find the nearest edge endpoint on the selected piece */
  const findNearestEndpoint = useCallback(
    (pt: Point2D, piece: PatternPiece): ExtendTrimState['hoveredSnap'] => {
      const localPt = { x: pt.x - piece.position.x, y: pt.y - piece.position.y };
      const threshold = SNAP_THRESHOLD / zoom2D;
      let best: ExtendTrimState['hoveredSnap'] = null;
      let bestDist = Infinity;

      // Walk the outline and find endpoints of each segment
      let prevX = 0, prevY = 0;
      for (let i = 0; i < piece.outline.length; i++) {
        const cmd = piece.outline[i];
        let endX = prevX, endY = prevY;

        switch (cmd.type) {
          case 'M':
            endX = cmd.values[0]; endY = cmd.values[1];
            break;
          case 'L':
            endX = cmd.values[0]; endY = cmd.values[1];
            break;
          case 'C':
            endX = cmd.values[4]; endY = cmd.values[5];
            break;
          case 'Q':
            endX = cmd.values[2]; endY = cmd.values[3];
            break;
        }

        if (cmd.type !== 'M' && cmd.type !== 'Z') {
          // Check start of this segment (= end of previous)
          const dStart = Math.hypot(localPt.x - prevX, localPt.y - prevY);
          if (dStart < threshold && dStart < bestDist) {
            bestDist = dStart;
            best = {
              point: { x: prevX + piece.position.x, y: prevY + piece.position.y },
              segmentIndex: i,
              endpoint: 'start',
            };
          }

          // Check end of this segment
          const dEnd = Math.hypot(localPt.x - endX, localPt.y - endY);
          if (dEnd < threshold && dEnd < bestDist) {
            bestDist = dEnd;
            best = {
              point: { x: endX + piece.position.x, y: endY + piece.position.y },
              segmentIndex: i,
              endpoint: 'end',
            };
          }
        }

        prevX = endX;
        prevY = endY;
      }

      return best;
    },
    [zoom2D],
  );

  /** Find nearest point on any edge segment of the selected piece (for trim mode) */
  const findNearestEdgePoint = useCallback(
    (pt: Point2D, piece: PatternPiece): ExtendTrimState['hoveredSnap'] => {
      const localPt = { x: pt.x - piece.position.x, y: pt.y - piece.position.y };
      const threshold = SNAP_THRESHOLD / zoom2D;
      let best: ExtendTrimState['hoveredSnap'] = null;
      let bestDist = Infinity;

      let prevX = 0, prevY = 0;
      for (let i = 0; i < piece.outline.length; i++) {
        const cmd = piece.outline[i];
        let endX = prevX, endY = prevY;

        switch (cmd.type) {
          case 'M':
            endX = cmd.values[0]; endY = cmd.values[1];
            prevX = endX; prevY = endY;
            continue;
          case 'L':
            endX = cmd.values[0]; endY = cmd.values[1];
            break;
          case 'C':
            endX = cmd.values[4]; endY = cmd.values[5];
            break;
          case 'Q':
            endX = cmd.values[2]; endY = cmd.values[3];
            break;
          case 'Z':
            continue;
        }

        // Project point onto segment (simplified as line segment for all types)
        const dx = endX - prevX;
        const dy = endY - prevY;
        const len2 = dx * dx + dy * dy;
        if (len2 > 0) {
          let t = ((localPt.x - prevX) * dx + (localPt.y - prevY) * dy) / len2;
          t = Math.max(0, Math.min(1, t));
          const projX = prevX + t * dx;
          const projY = prevY + t * dy;
          const dist = Math.hypot(localPt.x - projX, localPt.y - projY);

          if (dist < threshold && dist < bestDist) {
            bestDist = dist;
            best = {
              point: { x: projX + piece.position.x, y: projY + piece.position.y },
              segmentIndex: i,
              endpoint: t < 0.5 ? 'start' : 'end',
            };
          }
        }

        prevX = endX;
        prevY = endY;
      }

      return best;
    },
    [zoom2D],
  );

  const reset = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (selectedPieceIds.length !== 1) return;
      const piece = pieces.find(p => p.id === selectedPieceIds[0]);
      if (!piece) return;

      const s = stateRef.current;
      const { mode, distance } = getOptions();

      if (mode === 'extend') {
        if (!s.selectedSnap) {
          // First click: select an endpoint
          const pt = toPattern(e);
          const snap = findNearestEndpoint(pt, piece);
          if (snap) {
            // Compute preview with the extend
            const extended = extendEdge(piece, snap.segmentIndex, snap.endpoint, distance);
            setState({
              hoveredSnap: null,
              selectedSnap: snap,
              previewOutline: extended.outline,
              error: null,
            });
          }
        } else {
          // Second click: confirm the extend
          const snap = s.selectedSnap;
          try {
            const extended = extendEdge(piece, snap.segmentIndex, snap.endpoint, distance);
            dispatch(updatePiece(extended));
            reset();
          } catch {
            setState(prev => ({ ...prev, error: 'Failed to extend edge' }));
          }
        }
      } else {
        // Trim mode: click on edge to set trim point
        const pt = toPattern(e);
        const snap = findNearestEdgePoint(pt, piece);
        if (!snap) return;

        if (!s.selectedSnap) {
          // First click: select the trim point and preview
          const localTrimPt = {
            x: snap.point.x - piece.position.x,
            y: snap.point.y - piece.position.y,
          };
          const trimmed = trimEdgeAtPoint(piece, snap.segmentIndex, localTrimPt, 'before');
          setState({
            hoveredSnap: null,
            selectedSnap: snap,
            previewOutline: trimmed.outline,
            error: null,
          });
        } else {
          // Second click: confirm trim (keep the side closer to this click)
          const localTrimPt = {
            x: s.selectedSnap.point.x - piece.position.x,
            y: s.selectedSnap.point.y - piece.position.y,
          };
          const clickPt = toPattern(e);
          const localClick = {
            x: clickPt.x - piece.position.x,
            y: clickPt.y - piece.position.y,
          };

          // Determine which side to keep based on where the confirmation click is
          const flatPoints = flattenPath(piece.outline);
          const trimIdx = s.selectedSnap.segmentIndex;

          // Simple heuristic: measure distance from click to first vs last point
          const firstPt = flatPoints[0] ?? { x: 0, y: 0 };
          const lastPt = flatPoints[flatPoints.length - 1] ?? { x: 0, y: 0 };
          const distToFirst = Math.hypot(localClick.x - firstPt.x, localClick.y - firstPt.y);
          const distToLast = Math.hypot(localClick.x - lastPt.x, localClick.y - lastPt.y);
          const keepSide: 'before' | 'after' = distToFirst < distToLast ? 'before' : 'after';

          try {
            const trimmed = trimEdgeAtPoint(piece, trimIdx, localTrimPt, keepSide);
            dispatch(updatePiece(trimmed));
            reset();
          } catch {
            setState(prev => ({ ...prev, error: 'Failed to trim edge' }));
          }
        }
      }
    },
    [selectedPieceIds, pieces, getOptions, toPattern, findNearestEndpoint, findNearestEdgePoint, dispatch, reset],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (selectedPieceIds.length !== 1) return;
      const piece = pieces.find(p => p.id === selectedPieceIds[0]);
      if (!piece) return;

      const s = stateRef.current;
      if (s.selectedSnap) return; // Already selected, waiting for confirm

      const pt = toPattern(e);
      const { mode } = getOptions();

      if (mode === 'extend') {
        const snap = findNearestEndpoint(pt, piece);
        setState(prev => ({ ...prev, hoveredSnap: snap }));
      } else {
        const snap = findNearestEdgePoint(pt, piece);
        setState(prev => ({ ...prev, hoveredSnap: snap }));
      }
    },
    [selectedPieceIds, pieces, toPattern, getOptions, findNearestEndpoint, findNearestEdgePoint],
  );

  const handleMouseUp = useCallback(() => {}, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        const s = stateRef.current;
        if (s.selectedSnap) {
          // Cancel current selection, go back to hovering
          setState(prev => ({ ...prev, selectedSnap: null, previewOutline: null, error: null }));
        } else {
          reset();
        }
      }
      if (e.key === 'Enter') {
        const s = stateRef.current;
        if (s.selectedSnap && selectedPieceIds.length === 1) {
          const piece = pieces.find(p => p.id === selectedPieceIds[0]);
          if (!piece) return;

          const { mode, distance } = getOptions();
          const snap = s.selectedSnap;

          try {
            if (mode === 'extend') {
              const extended = extendEdge(piece, snap.segmentIndex, snap.endpoint, distance);
              dispatch(updatePiece(extended));
            } else {
              const localTrimPt = {
                x: snap.point.x - piece.position.x,
                y: snap.point.y - piece.position.y,
              };
              const trimmed = trimEdgeAtPoint(piece, snap.segmentIndex, localTrimPt, 'before');
              dispatch(updatePiece(trimmed));
            }
            reset();
          } catch {
            setState(prev => ({ ...prev, error: 'Operation failed' }));
          }
        }
      }
    },
    [selectedPieceIds, pieces, getOptions, dispatch, reset],
  );

  const getCursor = useCallback((): string => {
    const s = stateRef.current;
    if (s.hoveredSnap || s.selectedSnap) return 'crosshair';
    return 'crosshair';
  }, []);

  return {
    hoveredSnap: state.hoveredSnap,
    selectedSnap: state.selectedSnap,
    previewOutline: state.previewOutline,
    error: state.error,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleKeyDown,
    getCursor,
    reset,
  };
}
