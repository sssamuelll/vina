import { useState, useCallback, useRef, useEffect } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import type { Point2D, PatternPiece, SemanticEdge } from '../../types/types';
import { formatDimension } from '../../utils/units';
import { flattenPath } from '../../utils/seam/index';
import { computePathArcLength, samplePathAtIntervals, samplePathDense, distanceAlongPath, pointAtPathDistance } from '../../utils/geometry/arcLength';
import type { ArcLengthSample } from '../../utils/geometry/arcLength';
import { screenToPattern } from './sewingUtils';

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

export type MeasureMode = 'point-to-point' | 'along-curve' | 'compare';

export interface SelectedEdgeInfo {
  pieceId: string;
  piece: PatternPiece;
  edge: SemanticEdge;
  arcLength: number;
  markers: ArcLengthSample[];
  pathPoints: Point2D[];    // coarse (marker interval) — for overlay dots
  walkPoints: Point2D[];    // dense (3mm) — for smooth walk animation
}

export interface CurveDivergenceSample {
  tA: number;
  pointA: Point2D;
  pointB: Point2D;
  localDelta: number;
}

export interface CurveComparison {
  edgeA: SelectedEdgeInfo;
  edgeB: SelectedEdgeInfo;
  delta: number;
  easePercent: number;
  maxLocalDelta: number;
  samples: CurveDivergenceSample[];
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

// ─── Along-curve helpers ───

export function findEdgeForSegment(piece: PatternPiece, segmentIndex: number): SemanticEdge | null {
  if (!piece.edges) return null;
  return piece.edges.find(e =>
    segmentIndex >= e.segmentRange[0] && segmentIndex < e.segmentRange[1]
  ) ?? null;
}

export function buildEdgeInfo(piece: PatternPiece, edge: SemanticEdge, markerInterval: number): SelectedEdgeInfo {
  const arcLength = computePathArcLength(piece.outline, edge.segmentRange[0], edge.segmentRange[1]);
  const markers = samplePathAtIntervals(piece.outline, markerInterval, edge.segmentRange[0], edge.segmentRange[1]);
  const pathPoints = markers.map(m => ({
    x: m.point.x + piece.position.x,
    y: m.point.y + piece.position.y,
  }));
  const rawWalk = samplePathDense(piece.outline, 3, edge.segmentRange[0], edge.segmentRange[1]);
  const walkPoints = rawWalk.map(p => ({
    x: p.x + piece.position.x,
    y: p.y + piece.position.y,
  }));
  return { pieceId: piece.id, piece, edge, arcLength, markers, pathPoints, walkPoints };
}

export function buildOutlineInfo(piece: PatternPiece, markerInterval: number): SelectedEdgeInfo {
  const syntheticEdge: SemanticEdge = {
    id: '__outline__',
    name: 'outline',
    segmentRange: [0, piece.outline.length],
    edgeType: 'unknown',
  };
  return buildEdgeInfo(piece, syntheticEdge, markerInterval);
}

// ─── Hook ───

export function useMeasureTool(zoom: number, pan: Point2D) {
  const units = useSelector((s: RootState) => s.editor.units);
  const pieces = useSelector((s: RootState) => s.project.pieces);

  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [currentStart, setCurrentStart] = useState<Point2D | null>(null);
  const [cursorPos, setCursorPos] = useState<Point2D | null>(null);
  const [hoveredSnapPoint, setHoveredSnapPoint] = useState<Point2D | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<SelectedEdgeInfo | null>(null);
  const [compareEdgeA, setCompareEdgeA] = useState<SelectedEdgeInfo | null>(null);
  const compareEdgeARef = useRef(compareEdgeA);
  compareEdgeARef.current = compareEdgeA;
  const [compareEdgeB, setCompareEdgeB] = useState<SelectedEdgeInfo | null>(null);
  const [hoverDistance, setHoverDistance] = useState<number | null>(null);
  const [comparison, setComparison] = useState<CurveComparison | null>(null);

  const activeTool2D = useSelector((s: RootState) => s.tools.activeTool2D);
  const measureMode: MeasureMode =
    activeTool2D === 'compareCurves' ? 'compare' :
    activeTool2D === 'measureCurve' ? 'along-curve' :
    'point-to-point';
  const markerInterval = useSelector(
    (s: RootState) => Number(s.tools.toolOptions[activeTool2D]?.markerInterval ?? '50')
  );

  // Clear mode-specific state when switching measure modes
  useEffect(() => {
    setSelectedEdge(null);
    setHoverDistance(null);
    setCompareEdgeA(null);
    setCompareEdgeB(null);
    setComparison(null);
  }, [measureMode]);

  const currentStartRef = useRef(currentStart);
  currentStartRef.current = currentStart;

  const formatDistance = useCallback((mm: number): string => {
    return formatDimension(mm, units);
  }, [units]);

  const toPattern = useCallback((e: React.MouseEvent<SVGSVGElement>): Point2D => {
    const rect = e.currentTarget.getBoundingClientRect();
    return screenToPattern(e.clientX, e.clientY, rect, zoom, pan);
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

    if (measureMode === 'along-curve') {
      // Find which piece and edge was clicked
      if (snap) {
        const piece = pieces.find(p => p.id === snap.pieceId);
        if (piece) {
          const edge = findEdgeForSegment(piece, snap.segmentIndex);
          if (edge) {
            setSelectedEdge(buildEdgeInfo(piece, edge, markerInterval));
          } else {
            setSelectedEdge(buildOutlineInfo(piece, markerInterval));
          }
        }
      }
      return;
    }

    if (measureMode === 'compare') {
      if (snap) {
        const piece = pieces.find(p => p.id === snap.pieceId);
        if (piece) {
          const edge = findEdgeForSegment(piece, snap.segmentIndex);
          const info = edge
            ? buildEdgeInfo(piece, edge, markerInterval)
            : buildOutlineInfo(piece, markerInterval);

          if (!compareEdgeARef.current) {
            setCompareEdgeA(info);
            setCompareEdgeB(null);
            setComparison(null);
          } else {
            setCompareEdgeB(info);
            const edgeA = compareEdgeARef.current;
            const delta = info.arcLength - edgeA.arcLength;
            const easePercent = edgeA.arcLength > 0 ? (delta / edgeA.arcLength) * 100 : 0;

            // Sample both edges at 10 equal arc-length fractions
            const NUM_SAMPLES = 10;
            const divergenceSamples: CurveDivergenceSample[] = [];
            let maxLocalDelta = 0;
            for (let si = 0; si <= NUM_SAMPLES; si++) {
              const frac = si / NUM_SAMPLES;
              const dA = frac * edgeA.arcLength;
              const dB = frac * info.arcLength;
              const ptA = pointAtPathDistance(
                edgeA.piece.outline, dA,
                edgeA.edge.segmentRange[0], edgeA.edge.segmentRange[1],
              );
              const ptB = pointAtPathDistance(
                info.piece.outline, dB,
                info.edge.segmentRange[0], info.edge.segmentRange[1],
              );
              if (ptA && ptB) {
                const worldA = { x: ptA.x + edgeA.piece.position.x, y: ptA.y + edgeA.piece.position.y };
                const worldB = { x: ptB.x + info.piece.position.x, y: ptB.y + info.piece.position.y };
                // Local-space divergence: compare shape geometry only, ignore piece positioning
                const ld = Math.abs(dA - dB);
                if (ld > maxLocalDelta) maxLocalDelta = ld;
                divergenceSamples.push({ tA: frac, pointA: worldA, pointB: worldB, localDelta: ld });
              }
            }

            setComparison({ edgeA, edgeB: info, delta, easePercent, maxLocalDelta, samples: divergenceSamples });
          }
        }
      }
      return;
    }

    // point-to-point mode (existing behavior)
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
  }, [toPattern, trySnap, measureMode, markerInterval, pieces]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const rawPt = toPattern(e);
    const snap = trySnap(rawPt);
    setHoveredSnapPoint(snap ? snap.point : null);

    if (measureMode === 'along-curve' && selectedEdge) {
      // Compute hover distance along the selected edge
      const localPt = {
        x: rawPt.x - selectedEdge.piece.position.x,
        y: rawPt.y - selectedEdge.piece.position.y,
      };
      const d = distanceAlongPath(
        selectedEdge.piece.outline,
        localPt,
        selectedEdge.edge.segmentRange[0],
        selectedEdge.edge.segmentRange[1],
      );
      setHoverDistance(d);
      setCursorPos(rawPt);
    } else {
      setHoverDistance(null);
      if (currentStartRef.current) {
        setCursorPos(snap ? snap.point : rawPt);
      }
    }
  }, [toPattern, trySnap, measureMode, selectedEdge]);

  const handleMouseUp = useCallback(() => {
    // no-op — measure uses clicks, not drag
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (selectedEdge) {
        setSelectedEdge(null);
        setHoverDistance(null);
      } else if (compareEdgeA || compareEdgeB || comparison) {
        setCompareEdgeA(null);
        setCompareEdgeB(null);
        setComparison(null);
      } else if (currentStartRef.current) {
        setCurrentStart(null);
        setCursorPos(null);
      } else {
        setMeasurements([]);
      }
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      setMeasurements(prev => prev.slice(0, -1));
    }
  }, [selectedEdge, compareEdgeA, compareEdgeB, comparison]);

  const getCursor = useCallback((): string => {
    return 'crosshair';
  }, []);

  const reset = useCallback(() => {
    setMeasurements([]);
    setCurrentStart(null);
    setCursorPos(null);
    setHoveredSnapPoint(null);
    setSelectedEdge(null);
    setCompareEdgeA(null);
    setCompareEdgeB(null);
    setHoverDistance(null);
    setComparison(null);
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
    // Along-curve
    measureMode,
    markerInterval,
    selectedEdge,
    hoverDistance,
    // Compare
    compareEdgeA,
    comparison,
  };
}
