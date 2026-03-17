import { useState, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../store';
import { addInternalLine } from '../../store/projectSlice';
import { selectInternalLine } from '../../store/editorSlice';
import type { PatternPiece, Point2D, PathCommand, InternalLine, TopstitchOptions, Tool2D } from '../../types/types';
import { getEdgeEndpoints, computeOffsetPath, computeSegmentOffsetPath } from '../../utils/geometry/path';
import { snapToEdge } from './useSegmentSewingTool';
import { screenToPattern } from './sewingUtils';

// Re-export pure functions for backward compatibility
export { computeOffsetPath, computeSegmentOffsetPath } from '../../utils/geometry/path';

// ─── Types ────────────────────────────────────────────────────────────

type TopstitchMode = 'seamline' | 'segment' | 'free' | 'edit';

interface SnapHit {
  point: Point2D;
  edgeIndex: number;
  t: number;
  pieceId: string;
}

interface TopstitchState {
  mode: TopstitchMode;
  hoveredEdge: { pieceId: string; edgeIndex: number; start: Point2D; end: Point2D } | null;
  segSnapA: SnapHit | null;
  segSnapB: SnapHit | null;
  segHover: SnapHit | null;
  freePieceId: string | null;
  freePoints: Point2D[];
  freeCursor: Point2D | null;
  hoveredSnapPoint: Point2D | null;
}

const SNAP_THRESHOLD = 15;

// ─── Hook ──────────────────────────────────────────────────────────────

export function useTopstitchTool(
  zoom2D: number,
  pan2D: Point2D,
  pieces: PatternPiece[],
  // seams parameter will be added when seamline-aware topstitch is implemented
) {
  const dispatch = useDispatch();
  const activeTool = useSelector((s: RootState) => s.editor.activeTool) as Tool2D;
  const toolOptions = useSelector((s: RootState) => s.tools.toolOptions);

  const getOptions = useCallback((): TopstitchOptions => {
    const key = activeTool;
    const opts = toolOptions?.[key] ?? {};
    return {
      stitchType: (opts.stitchType as TopstitchOptions['stitchType']) ?? 'straight',
      stitchLength: (opts.stitchLength as number) ?? 3.0,
      offset: (opts.offset as number) ?? 5.0,
      threadColor: (opts.threadColor as string) ?? '#333333',
      rows: 1,
    };
  }, [activeTool, toolOptions]);

  const getMode = useCallback((): TopstitchMode => {
    switch (activeTool) {
      case 'topstitchSeamline': return 'seamline';
      case 'topstitchSegment': return 'segment';
      case 'topstitchFree': return 'free';
      case 'topstitchEdit': return 'edit';
      default: return 'seamline';
    }
  }, [activeTool]);

  const [state, setState] = useState<TopstitchState>({
    mode: 'seamline',
    hoveredEdge: null,
    segSnapA: null,
    segSnapB: null,
    segHover: null,
    freePieceId: null,
    freePoints: [],
    freeCursor: null,
    hoveredSnapPoint: null,
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
      mode: getMode(),
      hoveredEdge: null,
      segSnapA: null,
      segSnapB: null,
      segHover: null,
      freePieceId: null,
      freePoints: [],
      freeCursor: null,
      hoveredSnapPoint: null,
    });
  }, [getMode]);

  const findEdge = useCallback((pt: Point2D): { pieceId: string; edgeIndex: number; start: Point2D; end: Point2D } | null => {
    const threshold = SNAP_THRESHOLD / zoom2D;
    let best: { pieceId: string; edgeIndex: number; start: Point2D; end: Point2D; dist: number } | null = null;

    for (const piece of pieces) {
      const cmds = piece.outline;
      const ox = piece.position?.x ?? 0;
      const oy = piece.position?.y ?? 0;
      for (let i = 1; i < cmds.length; i++) {
        const ep = getEdgeEndpoints(cmds, i);
        if (!ep) continue;
        const s = { x: ep.start.x + ox, y: ep.start.y + oy };
        const e = { x: ep.end.x + ox, y: ep.end.y + oy };
        const dx = e.x - s.x, dy = e.y - s.y;
        const lenSq = dx * dx + dy * dy;
        if (lenSq === 0) continue;
        let t = ((pt.x - s.x) * dx + (pt.y - s.y) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));
        const dist = Math.hypot(pt.x - (s.x + t * dx), pt.y - (s.y + t * dy));
        if (dist < threshold && (!best || dist < best.dist)) {
          best = { pieceId: piece.id, edgeIndex: i, start: s, end: e, dist };
        }
      }
    }
    return best ? { pieceId: best.pieceId, edgeIndex: best.edgeIndex, start: best.start, end: best.end } : null;
  }, [pieces, zoom2D]);

  const addTopstitch = useCallback((pieceId: string, path: PathCommand[]) => {
    if (path.length < 2) return;
    const opts = getOptions();
    const line: InternalLine = {
      id: `topstitch-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: 'topstitch',
      path,
      topstitchOptions: opts,
    };
    dispatch(addInternalLine({ pieceId, line }));
    dispatch(selectInternalLine({ pieceId, lineId: line.id }));
  }, [dispatch, getOptions]);

  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const pt = toPattern(e);
    const mode = getMode();

    if (mode === 'seamline') {
      const edge = findEdge(pt);
      if (!edge) return;
      const piece = pieces.find(p => p.id === edge.pieceId);
      if (!piece) return;
      const ep = getEdgeEndpoints(piece.outline, edge.edgeIndex);
      if (!ep) return;
      const opts = getOptions();
      const path = computeOffsetPath(ep.start, ep.end, opts.offset);
      if (path.length > 0) addTopstitch(edge.pieceId, path);
      return;
    }

    if (mode === 'segment') {
      setState(prev => {
        if (!prev.segSnapA) {
          for (const piece of pieces) {
            const snap = snapToEdge(pt, piece, zoom2D);
            if (snap) return { ...prev, segSnapA: snap, segSnapB: null };
          }
          return prev;
        } else {
          const piece = pieces.find(p => p.id === prev.segSnapA!.pieceId);
          if (!piece) return prev;
          const snap = snapToEdge(pt, piece, zoom2D, prev.segSnapA!.edgeIndex);
          if (!snap) return prev;
          if (Math.abs(snap.t - prev.segSnapA!.t) < 0.01) return prev;

          const ep = getEdgeEndpoints(piece.outline, prev.segSnapA!.edgeIndex);
          if (!ep) return prev;
          const t0 = Math.min(prev.segSnapA!.t, snap.t);
          const t1 = Math.max(prev.segSnapA!.t, snap.t);
          const opts = getOptions();
          const path = computeSegmentOffsetPath(ep.start, ep.end, t0, t1, opts.offset);
          if (path.length > 0) addTopstitch(prev.segSnapA!.pieceId, path);
          return { ...prev, segSnapA: null, segSnapB: null };
        }
      });
      return;
    }

    if (mode === 'free') {
      const hitPiece = pieces.find(piece => {
        if (!piece.outline?.length) return false;
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        const ox = piece.position?.x ?? 0;
        const oy = piece.position?.y ?? 0;
        for (const cmd of piece.outline) {
          for (let i = 0; i < cmd.values.length; i += 2) {
            const px = cmd.values[i] + ox;
            const py = cmd.values[i + 1] + oy;
            if (px < minX) minX = px; if (px > maxX) maxX = px;
            if (py < minY) minY = py; if (py > maxY) maxY = py;
          }
        }
        return pt.x >= minX && pt.x <= maxX && pt.y >= minY && pt.y <= maxY;
      });

      setState(prev => {
        if (!prev.freePieceId && hitPiece) {
          const ox = hitPiece.position?.x ?? 0;
          const oy = hitPiece.position?.y ?? 0;
          return { ...prev, freePieceId: hitPiece.id, freePoints: [{ x: pt.x - ox, y: pt.y - oy }] };
        } else if (prev.freePieceId) {
          const piece = pieces.find(p => p.id === prev.freePieceId);
          const ox = piece?.position?.x ?? 0;
          const oy = piece?.position?.y ?? 0;
          return { ...prev, freePoints: [...prev.freePoints, { x: pt.x - ox, y: pt.y - oy }] };
        }
        return prev;
      });
      return;
    }
  }, [toPattern, getMode, findEdge, pieces, zoom2D, getOptions, addTopstitch]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const pt = toPattern(e);
    const mode = getMode();

    if (mode === 'seamline') {
      const edge = findEdge(pt);
      setState(prev => ({ ...prev, hoveredEdge: edge, hoveredSnapPoint: edge ? pt : null }));
      return;
    }

    if (mode === 'segment') {
      setState(prev => {
        if (prev.segSnapA) {
          const piece = pieces.find(p => p.id === prev.segSnapA!.pieceId);
          if (piece) {
            const snap = snapToEdge(pt, piece, zoom2D, prev.segSnapA!.edgeIndex);
            return { ...prev, segHover: snap, hoveredSnapPoint: snap?.point ?? null };
          }
        } else {
          for (const piece of pieces) {
            const snap = snapToEdge(pt, piece, zoom2D);
            if (snap) return { ...prev, segHover: snap, hoveredSnapPoint: snap.point };
          }
        }
        return { ...prev, segHover: null, hoveredSnapPoint: null };
      });
      return;
    }

    if (mode === 'free') {
      setState(prev => ({ ...prev, freeCursor: pt }));
      return;
    }
  }, [toPattern, getMode, findEdge, pieces, zoom2D]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      reset();
      return;
    }
    const mode = getMode();
    if (e.key === 'Backspace' && mode === 'segment') {
      setState(prev => ({ ...prev, segSnapA: null, segSnapB: null }));
      return;
    }
    if (e.key === 'Backspace' && mode === 'free') {
      setState(prev => ({
        ...prev,
        freePoints: prev.freePoints.slice(0, -1),
        freePieceId: prev.freePoints.length <= 1 ? null : prev.freePieceId,
      }));
      return;
    }
    if (e.key === 'Enter' && mode === 'free' && state.freePieceId && state.freePoints.length >= 2) {
      const path: PathCommand[] = state.freePoints.map((p, i) => ({
        type: i === 0 ? 'M' as const : 'L' as const,
        values: [p.x, p.y],
      }));
      addTopstitch(state.freePieceId, path);
      reset();
      return;
    }
  }, [getMode, state.freePieceId, state.freePoints, addTopstitch, reset]);

  const getCursor = useCallback((): string => {
    const mode = getMode();
    if (mode === 'edit') return 'default';
    if (state.hoveredEdge || state.segHover || state.hoveredSnapPoint) return 'crosshair';
    return 'default';
  }, [getMode, state.hoveredEdge, state.segHover, state.hoveredSnapPoint]);

  return {
    mode: getMode(),
    hoveredEdge: state.hoveredEdge,
    segSnapA: state.segSnapA,
    segHover: state.segHover,
    freePieceId: state.freePieceId,
    freePoints: state.freePoints,
    freeCursor: state.freeCursor,
    hoveredSnapPoint: state.hoveredSnapPoint,
    handleMouseDown,
    handleMouseMove,
    handleKeyDown,
    getCursor,
    reset,
  };
}
