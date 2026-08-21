import { useState, useCallback, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '../../store';
import type { Point2D, POMPoint, POMMethod, POMCategory, PatternPiece, PointOfMeasure } from '../../types/types';
import { snapToOutline, findEdgeForSegment } from './useMeasureTool';
import { distanceAlongPath, computePathArcLength } from '../../utils/geometry/arcLength';
import { computePOMValue } from '../../utils/pom/pomCompute';
import { addPOM } from '../../store/projectSlice';
import { selectPOM } from '../../store/editorSlice';
import { uid } from '../../utils/pathHelpers';
import { screenToPattern } from './sewingUtils';
import { patternToPieceLocal } from './pieceTransform';

// ─── Types ───

type Phase = 'idle' | 'pointASet' | 'naming';

// ─── Snap bridging ───

/**
 * Convert a snapToOutline result into a POMPoint.
 *
 * 1. Resolve the snap to a SemanticEdge via `findEdgeForSegment`.
 * 2. Compute parametric `t` along that edge.
 * 3. Store piece-local coordinates (world - piece.position).
 */
function snapToPOMPoint(
  snapPoint: Point2D,
  pieceId: string,
  segmentIndex: number,
  piece: PatternPiece,
): POMPoint {
  const localPosition: Point2D = patternToPieceLocal(snapPoint, piece);

  const edge = findEdgeForSegment(piece, segmentIndex);
  let edgeName: string | undefined;
  let t: number | undefined;

  if (edge) {
    edgeName = edge.name;
    const [start, end] = edge.segmentRange;
    const totalLen = computePathArcLength(piece.outline, start, end);
    if (totalLen > 0) {
      const distAlong = distanceAlongPath(piece.outline, localPosition, start, end);
      t = distAlong / totalLen;
    } else {
      t = 0;
    }
  }

  return { pieceId, edgeName, t, localPosition };
}

// ─── Hook ───

export function usePOMMeasureTool(zoom: number, pan: Point2D, pieces: PatternPiece[]) {
  const dispatch = useDispatch();

  // Read tool options from the store
  const method = useSelector(
    (s: RootState) => (s.tools.toolOptions['pomMeasure']?.method as POMMethod) ?? 'straight',
  );
  const defaultCategory = useSelector(
    (s: RootState) => (s.tools.toolOptions['pomMeasure']?.defaultCategory as POMCategory) ?? 'custom',
  );

  // State machine
  const [phase, setPhase] = useState<Phase>('idle');
  const [pointA, setPointA] = useState<POMPoint | null>(null);
  const [pointB, setPointB] = useState<POMPoint | null>(null);
  const [hoveredSnap, setHoveredSnap] = useState<{ point: Point2D; pieceId: string } | null>(null);
  const [namingPosition, setNamingPosition] = useState<Point2D | null>(null);
  const [nameValue, setNameValue] = useState<string>('');

  // Refs for stable callbacks
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const pointARef = useRef(pointA);
  pointARef.current = pointA;
  const pointBRef = useRef(pointB);
  pointBRef.current = pointB;
  const nameValueRef = useRef(nameValue);
  nameValueRef.current = nameValue;
  const methodRef = useRef(method);
  methodRef.current = method;
  const defaultCategoryRef = useRef(defaultCategory);
  defaultCategoryRef.current = defaultCategory;

  /** Convert screen coords to pattern coords */
  const toPattern = useCallback((e: React.MouseEvent<SVGSVGElement>): Point2D => {
    const rect = e.currentTarget.getBoundingClientRect();
    return screenToPattern(e.clientX, e.clientY, rect, zoom, pan);
  }, [zoom, pan]);

  /** Try to snap to nearest piece outline */
  const trySnap = useCallback((pt: Point2D): { point: Point2D; pieceId: string; segmentIndex: number } | null => {
    let best: { point: Point2D; pieceId: string; segmentIndex: number } | null = null;
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

  /** Confirm the name and create the POM */
  const confirmName = useCallback(() => {
    const a = pointARef.current;
    const b = pointBRef.current;
    const m = methodRef.current;
    const cat = defaultCategoryRef.current;
    const name = nameValueRef.current.trim() || 'Untitled POM';

    if (!a) return;

    // For along-edge mode, pointB mirrors pointA (full-edge measurement)
    const effectiveB = b ?? a;

    const now = Date.now();
    const pom: PointOfMeasure = {
      id: uid(),
      name,
      category: cat,
      method: m,
      pointA: a,
      pointB: effectiveB,
      value: 0,
      createdAt: now,
      updatedAt: now,
    };

    // Compute value
    const value = computePOMValue(pom, pieces);
    if (value != null) {
      pom.value = value;
    }

    dispatch(addPOM(pom));
    dispatch(selectPOM(pom.id));

    // Reset state
    setPhase('idle');
    setPointA(null);
    setPointB(null);
    setNamingPosition(null);
    setNameValue('');
  }, [dispatch, pieces]);

  /** Cancel back to idle */
  const cancel = useCallback(() => {
    setPhase('idle');
    setPointA(null);
    setPointB(null);
    setNamingPosition(null);
    setNameValue('');
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const rawPt = toPattern(e);
    const snap = trySnap(rawPt);
    if (!snap) return; // POM points must snap to an outline

    const piece = pieces.find(p => p.id === snap.pieceId);
    if (!piece) return;

    const pomPoint = snapToPOMPoint(snap.point, snap.pieceId, snap.segmentIndex, piece);

    if (methodRef.current === 'alongEdge') {
      // Along-edge: single click selects edge, go straight to naming
      setPointA(pomPoint);
      setPointB(null);
      setNamingPosition(snap.point);
      setNameValue('');
      setPhase('naming');
      return;
    }

    // Straight mode: two-click workflow
    if (phaseRef.current === 'idle') {
      setPointA(pomPoint);
      setPointB(null);
      setPhase('pointASet');
    } else if (phaseRef.current === 'pointASet') {
      setPointB(pomPoint);
      // Midpoint between A and B for naming input placement
      const a = pointARef.current;
      if (a) {
        const aPiece = pieces.find(p => p.id === a.pieceId);
        const worldAx = aPiece ? aPiece.position.x + a.localPosition.x : snap.point.x;
        const worldAy = aPiece ? aPiece.position.y + a.localPosition.y : snap.point.y;
        setNamingPosition({
          x: (worldAx + snap.point.x) / 2,
          y: (worldAy + snap.point.y) / 2,
        });
      } else {
        setNamingPosition(snap.point);
      }
      setNameValue('');
      setPhase('naming');
    }
    // In 'naming' phase, clicks are ignored (user must press Enter or Escape)
  }, [toPattern, trySnap, pieces]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const rawPt = toPattern(e);
    const snap = trySnap(rawPt);
    setHoveredSnap(snap ? { point: snap.point, pieceId: snap.pieceId } : null);
  }, [toPattern, trySnap]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    }
    if (e.key === 'Enter' && phaseRef.current === 'naming') {
      e.preventDefault();
      confirmName();
    }
  }, [cancel, confirmName]);

  return {
    phase,
    pointA,
    pointB,
    hoveredSnap,
    namingPosition,
    nameValue,
    setNameValue,
    handleMouseDown,
    handleMouseMove,
    handleKeyDown,
    confirmName,
    cancel,
  };
}
