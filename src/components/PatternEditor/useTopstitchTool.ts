import { useState, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../store';
import { addInternalLine } from '../../store/projectSlice';
import { selectInternalLine } from '../../store/editorSlice';
import type { PatternPiece, Point2D, PathCommand, InternalLine, TopstitchOptions, Tool2D } from '../../types/types';
import { getEdgeEndpoints, computeOffsetPath, computeSegmentOffsetPath } from '../../utils/geometry/path';
import { snapToEdge } from './useSegmentSewingTool';
import { pieceLocalToPattern } from './pieceTransform';
import { screenToPattern } from './sewingUtils';
import { screenToPatternLength } from '../../utils/geometry';
import { newId } from '../../utils/ids';
import { noPasoNada } from './noPasoNada';

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
    const threshold = screenToPatternLength(SNAP_THRESHOLD, zoom2D);
    let best: { pieceId: string; edgeIndex: number; start: Point2D; end: Point2D; dist: number } | null = null;

    for (const piece of pieces) {
      const cmds = piece.outline;
      for (let i = 1; i < cmds.length; i++) {
        const ep = getEdgeEndpoints(cmds, i);
        if (!ep) continue;
        // Por el transform del renderizador: sumar solo la posición colocaba
        // el borde donde la pieza estaría SIN girar, y desde #1033 el ángulo
        // vive en `piece.rotation` (#1064).
        const s = pieceLocalToPattern(ep.start, piece);
        const e = pieceLocalToPattern(ep.end, piece);
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
      id: newId(),
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
      // Borde de largo cero o desplazamiento que no cabe: el clic acertó el
      // borde y no nació ningún pespunte (#1117).
      if (path.length > 0) addTopstitch(edge.pieceId, path);
      else noPasoNada('pespunte:desplazamiento-no-cabe', { pieceId: edge.pieceId, offset: opts.offset });
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
          const snap = snapToEdge(pt, piece, zoom2D, [prev.segSnapA!.edgeIndex, prev.segSnapA!.edgeIndex + 1]);
          // El aviso viaja dentro del updater, igual que el `addTopstitch` de
          // abajo: el segundo clic no tiene otra puerta donde decidirse.
          // ponytail: en dev, StrictMode invoca los updaters dos veces, así que
          // estas líneas se duplican en la bitácora LOCAL. En producción sale
          // una sola vez, o sea que la bitácora que llega de María es correcta;
          // el daño es a quien depure aquí. Sacarlo pide un `stateRef` y
          // reescribir la rama, y hoy no compra lo que cuesta.
          if (!snap) {
            noPasoNada('pespunte:tramo-invalido', { pieceId: prev.segSnapA!.pieceId, motivo: 'otroBorde' });
            return prev;
          }
          if (Math.abs(snap.t - prev.segSnapA!.t) < 0.01) {
            noPasoNada('pespunte:tramo-invalido', { pieceId: prev.segSnapA!.pieceId, motivo: 'pegadoAlPrimero' });
            return prev;
          }

          const ep = getEdgeEndpoints(piece.outline, prev.segSnapA!.edgeIndex);
          if (!ep) return prev;
          const t0 = Math.min(prev.segSnapA!.t, snap.t);
          const t1 = Math.max(prev.segSnapA!.t, snap.t);
          const opts = getOptions();
          const path = computeSegmentOffsetPath(ep.start, ep.end, t0, t1, opts.offset);
          if (path.length > 0) addTopstitch(prev.segSnapA!.pieceId, path);
          else noPasoNada('pespunte:desplazamiento-no-cabe', { pieceId: prev.segSnapA!.pieceId, offset: opts.offset });
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
            const snap = snapToEdge(pt, piece, zoom2D, [prev.segSnapA!.edgeIndex, prev.segSnapA!.edgeIndex + 1]);
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
