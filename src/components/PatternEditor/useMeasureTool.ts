import { useState, useCallback, useRef } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import type { Point2D, PatternPiece } from '../../types/types';
import { formatDimension } from '../../utils/units';
import { flattenPath } from '../../utils/seam/index';

// ─── Types ───

export interface Measurement {
  id: string;
  startPoint: Point2D;
  endPoint: Point2D;
  distance: number;
  isPathMeasurement: boolean;
  pathPoints?: Point2D[];
  angle?: number;
}

export interface SnapResult {
  point: Point2D;
  pieceId: string;
  segmentIndex: number;
}

// ─── Exported helpers (pure functions for testability) ───

const SNAP_THRESHOLD = 8; // screen pixels

/**
 * Find nearest point on piece outline to a world-space point.
 * Returns snap info or null if outside threshold.
 */
export function snapToOutline(
  pt: Point2D,
  piece: PatternPiece,
  zoom: number,
): SnapResult | null {
  const localPt = { x: pt.x - piece.position.x, y: pt.y - piece.position.y };
  const flatPoints = flattenPath(piece.outline);
  let bestDist = Infinity;
  let bestPt: Point2D | null = null;
  let bestSegment = -1;

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
      bestSegment = i;
    }
  }

  const threshold = SNAP_THRESHOLD / zoom;
  if (bestDist <= threshold && bestPt) {
    return { point: bestPt, pieceId: piece.id, segmentIndex: bestSegment };
  }
  return null;
}

/**
 * Calculate total length of a polyline given its points.
 */
export function calculatePathLength(points: Point2D[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return total;
}

// ─── Hook ───

export function useMeasureTool(zoom: number, pan: Point2D) {
  const units = useSelector((s: RootState) => s.editor.units);
  const pieces = useSelector((s: RootState) => s.project.pieces);

  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [currentStart, setCurrentStart] = useState<Point2D | null>(null);
  const [cursorPos, setCursorPos] = useState<Point2D | null>(null);
  const [hoveredSnapPoint, setHoveredSnapPoint] = useState<Point2D | null>(null);

  const currentStartRef = useRef(currentStart);
  currentStartRef.current = currentStart;

  const formatDistance = useCallback((mm: number): string => {
    return formatDimension(mm, units);
  }, [units]);

  const toPattern = useCallback((e: React.MouseEvent<SVGSVGElement>): Point2D => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - pan.x) / zoom,
      y: (e.clientY - rect.top - pan.y) / zoom,
    };
  }, [zoom, pan]);

  /** Try to snap to nearest piece outline */
  const trySnap = useCallback((pt: Point2D): SnapResult | null => {
    let best: SnapResult | null = null;
    let bestDist = Infinity;
    for (const piece of pieces) {
      if (!piece.outline?.length) continue;
      const result = snapToOutline(pt, piece, zoom);
      if (result) {
        const d = Math.hypot(pt.x - result.point.x, pt.y - result.point.y);
        if (d < bestDist) {
          bestDist = d;
          best = result;
        }
      }
    }
    return best;
  }, [pieces, zoom]);

  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const rawPt = toPattern(e);
    const snap = trySnap(rawPt);
    const pt = snap ? snap.point : rawPt;

    if (!currentStartRef.current) {
      setCurrentStart(pt);
      setCursorPos(pt);
    } else {
      const start = currentStartRef.current;
      const dx = pt.x - start.x;
      const dy = pt.y - start.y;
      const distance = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx) * (180 / Math.PI);

      setMeasurements(prev => [...prev, {
        id: `measure-${Date.now()}`,
        startPoint: start,
        endPoint: pt,
        distance,
        isPathMeasurement: false,
        angle,
      }]);
      setCurrentStart(null);
      setCursorPos(null);
    }
  }, [toPattern, trySnap]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const rawPt = toPattern(e);
    const snap = trySnap(rawPt);
    setHoveredSnapPoint(snap ? snap.point : null);

    if (currentStartRef.current) {
      setCursorPos(snap ? snap.point : rawPt);
    }
  }, [toPattern, trySnap]);

  const handleMouseUp = useCallback(() => {
    // no-op — measure uses clicks, not drag
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (currentStartRef.current) {
        setCurrentStart(null);
        setCursorPos(null);
      } else {
        setMeasurements([]);
      }
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      setMeasurements(prev => prev.slice(0, -1));
    }
  }, []);

  const getCursor = useCallback((): string => {
    return 'crosshair';
  }, []);

  const reset = useCallback(() => {
    setMeasurements([]);
    setCurrentStart(null);
    setCursorPos(null);
    setHoveredSnapPoint(null);
  }, []);

  // Keep clear as alias for backward compatibility with useEditorInteractions
  const clear = reset;

  return {
    measurements,
    currentStart,
    cursorPos,
    hoveredSnapPoint,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleKeyDown,
    getCursor,
    reset,
    clear,
    formatDistance,
  };
}
