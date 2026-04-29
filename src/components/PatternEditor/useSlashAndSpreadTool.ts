/**
 * useSlashAndSpreadTool — interactive state machine for the slash-and-spread
 * operation.  Follows the same patterns as useScissorsTool.ts.
 *
 * State flow:
 *   IDLE → DRAWING_SLASH → SLASH_COMPLETE → SELECTING_HALF →
 *   HALF_CONFIRMED → AWAITING_DRAG → SPREADING → SPREAD_PREVIEW → (apply → IDLE)
 */

import { useState, useCallback, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { updatePiece } from '../../store/projectSlice';
import { setToolOption } from '../../store/toolSlice';
import type { Point2D, PatternPiece, PathCommand } from '../../types/types';
import { flattenPath } from '../../utils/seam/index';
import { screenToPattern, screenToPatternLength } from '../../utils/geometry';
import {
  findSlashIntersections,
  splitOutlineAtSlash,
  pointInPolygon,
  buildSpreadPiece,
  type OutlineHit,
} from '../../utils/geometry/slashAndSpread';

// ─── Types ─────────────────────────────────────────────────────────────────

export type SlashAndSpreadPhase =
  | 'idle'
  | 'drawingSlash'
  | 'slashComplete'
  | 'selectingHalf'
  | 'halfConfirmed'
  | 'awaitingDrag'
  | 'spreading'
  | 'spreadPreview';

export interface SlashAndSpreadState {
  phase: SlashAndSpreadPhase;
  targetPieceId: string | null;
  startPoint: Point2D | null;
  endPoint: Point2D | null;
  hit1: OutlineHit | null;
  hit2: OutlineHit | null;
  halfA: PathCommand[] | null;
  halfB: PathCommand[] | null;
  selectedHalf: 'A' | 'B' | null;
  pivotPoint: Point2D | null;
  pivotEnd: 'start' | 'end' | null;
  spreadAmount: number;
  previewPiece: PatternPiece | null;
  hoveredHalf: 'A' | 'B' | null;
  error: string | null;
}

/** Transition result that may carry side-effect signals. */
export interface TransitionResult extends SlashAndSpreadState {
  /** When set, the hook should dispatch updatePiece with this value. */
  _applyPiece?: PatternPiece;
  /** When true, the hook should toggle the spread mode tool option. */
  _toggleMode?: boolean;
}

export const INITIAL_STATE: SlashAndSpreadState = {
  phase: 'idle',
  targetPieceId: null,
  startPoint: null,
  endPoint: null,
  hit1: null,
  hit2: null,
  halfA: null,
  halfB: null,
  selectedHalf: null,
  pivotPoint: null,
  pivotEnd: null,
  spreadAmount: 0,
  previewPiece: null,
  hoveredHalf: null,
  error: null,
};

const SNAP_THRESHOLD = 8; // screen pixels
const PIVOT_THRESHOLD = 15; // screen pixels

// ─── Context for pure transition functions ─────────────────────────────────

export interface TransitionContext {
  pieces: PatternPiece[];
  selectedPieceIds: string[];
  toolOptions: Record<string, unknown>;
  zoom2D: number;
  pan2D: Point2D;
}

// ─── Pure helpers ──────────────────────────────────────────────────────────

function snapToOutline(
  pt: Point2D,
  piece: PatternPiece,
  zoom2D: number,
): Point2D | null {
  const localPt = { x: pt.x - piece.position.x, y: pt.y - piece.position.y };
  const flatPoints = flattenPath(piece.outline);
  let bestDist = Infinity;
  let bestPt: Point2D | null = null;

  for (let i = 0; i < flatPoints.length - 1; i++) {
    const a = flatPoints[i];
    const b = flatPoints[i + 1];
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

  const threshold = screenToPatternLength(SNAP_THRESHOLD, zoom2D);
  return bestDist <= threshold ? bestPt : null;
}

function dist2D(a: Point2D, b: Point2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Calculate spread angle in degrees from the pivot point to the current mouse
 * position, relative to the original slash direction.
 */
function computeSpreadAngle(
  pivot: Point2D,
  pivotEnd: 'start' | 'end',
  hit1: OutlineHit,
  hit2: OutlineHit,
  mousePt: Point2D,
): number {
  // Reference direction: from pivot toward the other hit
  const other = pivotEnd === 'start' ? hit2.point : hit1.point;
  const refAngle = Math.atan2(other.y - pivot.y, other.x - pivot.x);
  const mouseAngle = Math.atan2(mousePt.y - pivot.y, mousePt.x - pivot.x);
  let angleDeg = ((mouseAngle - refAngle) * 180) / Math.PI;
  // Clamp to reasonable range
  if (angleDeg > 180) angleDeg -= 360;
  if (angleDeg < -180) angleDeg += 360;
  return angleDeg;
}

/**
 * Calculate spread distance for parallel mode: perpendicular distance from
 * mouse to the slash line.
 */
function computeSpreadDistance(
  hit1: OutlineHit,
  hit2: OutlineHit,
  mousePt: Point2D,
): number {
  const dx = hit2.point.x - hit1.point.x;
  const dy = hit2.point.y - hit1.point.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return 0;
  // Signed perpendicular distance (positive = left of slash direction)
  return ((mousePt.x - hit1.point.x) * (-dy) + (mousePt.y - hit1.point.y) * dx) / len;
}

// ─── Pure state transition: mouseDown ──────────────────────────────────────

export function transitionMouseDown(
  state: SlashAndSpreadState,
  pt: Point2D,
  ctx: TransitionContext,
): TransitionResult {
  const { pieces, selectedPieceIds, zoom2D } = ctx;

  // ── idle: target a piece and snap to outline ───────────────────────
  if (state.phase === 'idle') {
    const targetId = selectedPieceIds[0] ?? null;
    if (!targetId) return { ...state };

    const piece = pieces.find(p => p.id === targetId);
    if (!piece) return { ...state };

    const snap = snapToOutline(pt, piece, zoom2D);
    if (snap) {
      return {
        ...INITIAL_STATE,
        phase: 'drawingSlash',
        targetPieceId: targetId,
        startPoint: snap,
      };
    }
    // Piece selected but click not on outline → set target, stay idle
    return { ...INITIAL_STATE, targetPieceId: targetId };
  }

  const piece = pieces.find(p => p.id === state.targetPieceId);
  if (!piece) return { ...state };

  // ── drawingSlash: second click sets end and computes split ─────────
  if (state.phase === 'drawingSlash') {
    const snap = snapToOutline(pt, piece, zoom2D);
    const endPt = snap ?? pt;

    if (!state.startPoint) return { ...state };

    try {
      // Convert to local coords for geometry
      const localStart = {
        x: state.startPoint.x - piece.position.x,
        y: state.startPoint.y - piece.position.y,
      };
      const localEnd = {
        x: endPt.x - piece.position.x,
        y: endPt.y - piece.position.y,
      };

      const [h1, h2] = findSlashIntersections(piece.outline, localStart, localEnd);
      const { halfA: hA, halfB: hB } = splitOutlineAtSlash(piece.outline, h1, h2);

      return {
        ...state,
        phase: 'slashComplete',
        endPoint: endPt,
        hit1: h1,
        hit2: h2,
        halfA: hA,
        halfB: hB,
        error: null,
      };
    } catch (err) {
      return {
        ...state,
        error: err instanceof Error ? err.message : 'Invalid slash line',
      };
    }
  }

  // ── slashComplete: determine which half was clicked ───────────────
  if (state.phase === 'slashComplete') {
    if (!state.halfA || !state.halfB) return { ...state };

    const localPt = {
      x: pt.x - piece.position.x,
      y: pt.y - piece.position.y,
    };

    const inA = pointInPolygon(localPt, state.halfA);
    const inB = pointInPolygon(localPt, state.halfB);

    if (inA) {
      return { ...state, phase: 'selectingHalf', selectedHalf: 'A', error: null };
    }
    if (inB) {
      return { ...state, phase: 'selectingHalf', selectedHalf: 'B', error: null };
    }
    // Click outside both halves → do nothing
    return { ...state };
  }

  // ── selectingHalf: confirm selection ──────────────────────────────
  if (state.phase === 'selectingHalf') {
    return { ...state, phase: 'halfConfirmed', error: null };
  }

  // ── halfConfirmed: click near hit to set pivot ────────────────────
  if (state.phase === 'halfConfirmed') {
    if (!state.hit1 || !state.hit2) return { ...state };

    const localPt = {
      x: pt.x - piece.position.x,
      y: pt.y - piece.position.y,
    };

    const threshold = screenToPatternLength(PIVOT_THRESHOLD, zoom2D);
    const d1 = dist2D(localPt, state.hit1.point);
    const d2 = dist2D(localPt, state.hit2.point);

    if (d1 <= threshold && d1 <= d2) {
      return {
        ...state,
        phase: 'awaitingDrag',
        pivotPoint: state.hit1.point,
        pivotEnd: 'start',
        error: null,
      };
    }
    if (d2 <= threshold) {
      return {
        ...state,
        phase: 'awaitingDrag',
        pivotPoint: state.hit2.point,
        pivotEnd: 'end',
        error: null,
      };
    }

    // Click not near either hit
    return { ...state };
  }

  // ── awaitingDrag: click starts drag (alternative to mousemove) ────
  if (state.phase === 'awaitingDrag') {
    return { ...state };
  }

  return { ...state };
}

// ─── Pure state transition: mouseMove ──────────────────────────────────────

export function transitionMouseMove(
  state: SlashAndSpreadState,
  pt: Point2D,
  ctx: TransitionContext,
): TransitionResult {
  const { pieces, toolOptions } = ctx;

  // ── idle: nothing ─────────────────────────────────────────────────
  if (state.phase === 'idle') return { ...state };

  const piece = pieces.find(p => p.id === state.targetPieceId);
  if (!piece) return { ...state };

  // ── drawingSlash: update live endpoint ────────────────────────────
  if (state.phase === 'drawingSlash') {
    return { ...state, endPoint: pt };
  }

  // ── slashComplete: determine hovered half ─────────────────────────
  if (state.phase === 'slashComplete') {
    if (!state.halfA || !state.halfB) return { ...state };

    const localPt = {
      x: pt.x - piece.position.x,
      y: pt.y - piece.position.y,
    };

    const inA = pointInPolygon(localPt, state.halfA);
    const inB = pointInPolygon(localPt, state.halfB);

    let hoveredHalf: 'A' | 'B' | null = null;
    if (inA) hoveredHalf = 'A';
    else if (inB) hoveredHalf = 'B';

    return { ...state, hoveredHalf };
  }

  // ── awaitingDrag / spreading: calculate spread amount + preview ───
  if (state.phase === 'awaitingDrag' || state.phase === 'spreading') {
    if (!state.hit1 || !state.hit2 || !state.pivotPoint || !state.pivotEnd || !state.selectedHalf) {
      return { ...state };
    }

    const localPt = {
      x: pt.x - piece.position.x,
      y: pt.y - piece.position.y,
    };

    const mode = (toolOptions.mode as 'pivot' | 'parallel') ?? 'pivot';
    const gapFill = (toolOptions.gapFill as 'straight' | 'smooth') ?? 'straight';

    let spreadAmount: number;
    if (mode === 'pivot') {
      spreadAmount = computeSpreadAngle(
        state.pivotPoint,
        state.pivotEnd,
        state.hit1,
        state.hit2,
        localPt,
      );
    } else {
      spreadAmount = computeSpreadDistance(state.hit1, state.hit2, localPt);
    }

    let previewPiece: PatternPiece | null = null;
    try {
      previewPiece = buildSpreadPiece(
        piece,
        state.hit1,
        state.hit2,
        state.selectedHalf,
        state.pivotEnd,
        spreadAmount,
        mode,
        gapFill,
      );
    } catch {
      // Ignore preview errors during drag
    }

    return {
      ...state,
      phase: 'spreading',
      spreadAmount,
      previewPiece,
    };
  }

  return { ...state };
}

// ─── Pure state transition: mouseUp ────────────────────────────────────────

export function transitionMouseUp(
  state: SlashAndSpreadState,
): TransitionResult {
  if (state.phase === 'spreading') {
    return { ...state, phase: 'spreadPreview' };
  }
  return { ...state };
}

// ─── Pure state transition: keyDown ────────────────────────────────────────

export function transitionKeyDown(
  state: SlashAndSpreadState,
  key: string,
): TransitionResult {
  if (key === 'Escape') {
    if (state.phase === 'spreadPreview') {
      // Discard preview, go back to awaitingDrag
      return {
        ...state,
        phase: 'awaitingDrag',
        spreadAmount: 0,
        previewPiece: null,
      };
    }
    // Any other phase: full reset
    return { ...INITIAL_STATE };
  }

  if (key === 'Enter' && state.phase === 'spreadPreview' && state.previewPiece) {
    // Signal to apply the spread and reset
    return {
      ...INITIAL_STATE,
      _applyPiece: state.previewPiece,
    };
  }

  if (key === 'Tab') {
    if (
      state.phase === 'halfConfirmed' ||
      state.phase === 'awaitingDrag' ||
      state.phase === 'spreading' ||
      state.phase === 'spreadPreview'
    ) {
      return { ...state, _toggleMode: true };
    }
  }

  return { ...state };
}

// ─── React Hook ────────────────────────────────────────────────────────────

export function useSlashAndSpreadTool(
  zoom2D: number,
  pan2D: Point2D,
) {
  const dispatch = useDispatch();
  const pieces = useSelector((s: RootState) => s.project.pieces);
  const selectedPieceIds = useSelector((s: RootState) => s.editor.selectedPieceIds);
  const toolOptions = useSelector(
    (s: RootState) => (s.tools.toolOptions?.slashAndSpread ?? { mode: 'pivot', gapFill: 'straight' }) as Record<string, unknown>,
  );

  const [state, setState] = useState<SlashAndSpreadState>(INITIAL_STATE);
  const stateRef = useRef(state);
  stateRef.current = state;

  const toPattern = useCallback(
    (e: React.MouseEvent<SVGSVGElement>): Point2D => {
      const rect = e.currentTarget.getBoundingClientRect();
      return screenToPattern(e.clientX, e.clientY, rect, zoom2D, pan2D);
    },
    [zoom2D, pan2D],
  );

  const getCtx = useCallback((): TransitionContext => ({
    pieces,
    selectedPieceIds,
    toolOptions,
    zoom2D,
    pan2D,
  }), [pieces, selectedPieceIds, toolOptions, zoom2D, pan2D]);

  const applyResult = useCallback((result: TransitionResult) => {
    // Handle side effects
    if (result._applyPiece) {
      dispatch(updatePiece(result._applyPiece));
    }
    if (result._toggleMode) {
      const currentMode = (toolOptions.mode as string) ?? 'pivot';
      const newMode = currentMode === 'pivot' ? 'parallel' : 'pivot';
      dispatch(setToolOption({ toolId: 'slashAndSpread', optionId: 'mode', value: newMode }));
    }

    // Strip signals before storing state
    const { _applyPiece, _toggleMode, ...cleanState } = result;
    setState(cleanState);
  }, [dispatch, toolOptions.mode]);

  const reset = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const pt = toPattern(e);
      const result = transitionMouseDown(stateRef.current, pt, getCtx());
      applyResult(result);
    },
    [toPattern, getCtx, applyResult],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const pt = toPattern(e);
      const result = transitionMouseMove(stateRef.current, pt, getCtx());
      applyResult(result);
    },
    [toPattern, getCtx, applyResult],
  );

  const handleMouseUp = useCallback(() => {
    const result = transitionMouseUp(stateRef.current);
    applyResult(result);
  }, [applyResult]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        e.preventDefault(); // Prevent focus change
      }
      const result = transitionKeyDown(stateRef.current, e.key);
      applyResult(result);
    },
    [applyResult],
  );

  const getCursor = useCallback((): string => {
    const s = stateRef.current;
    switch (s.phase) {
      case 'idle':
        return 'crosshair';
      case 'drawingSlash':
        return 'crosshair';
      case 'slashComplete':
        return 'pointer';
      case 'selectingHalf':
        return 'pointer';
      case 'halfConfirmed':
        return 'pointer';
      case 'awaitingDrag':
        return 'grab';
      case 'spreading':
        return 'grabbing';
      case 'spreadPreview':
        return 'default';
      default:
        return 'default';
    }
  }, []);

  return {
    // State for overlay rendering
    phase: state.phase,
    targetPieceId: state.targetPieceId,
    startPoint: state.startPoint,
    endPoint: state.endPoint,
    halfA: state.halfA,
    halfB: state.halfB,
    selectedHalf: state.selectedHalf,
    hoveredHalf: state.hoveredHalf,
    pivotPoint: state.pivotPoint,
    spreadAmount: state.spreadAmount,
    previewPiece: state.previewPiece,
    error: state.error,
    // Handlers
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleKeyDown,
    getCursor,
    reset,
  };
}
