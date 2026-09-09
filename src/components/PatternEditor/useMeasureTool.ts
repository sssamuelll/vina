import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import type { Point2D, PatternPiece, SemanticEdge } from '../../types/types';
import { formatDimension } from '../../utils/units';
import { flattenPath } from '../../utils/seam/index';
import { computePathArcLength, samplePathAtIntervals, samplePathDense, distanceAlongPath, pointAtPathDistance } from '../../utils/geometry/arcLength';
import type { ArcLengthSample } from '../../utils/geometry/arcLength';
import { screenToPattern } from './sewingUtils';
import { screenToPatternLength } from '../../utils/geometry';
import { newId } from '../../utils/ids';
import { rangoMedibleDeBorde } from '../../utils/semanticEdges';
import { patternToPieceLocal, pieceLocalToPattern } from './pieceTransform';
import { buildSnapIndex, resolveSnap, verticesVisibles, type SnapKind } from './snapIndex';
import { EDGE_HIT_PX } from './gestureConstants';

// ─── Types ───

export interface Measurement {
  id: string;
  startPoint: Point2D;
  endPoint: Point2D;
  distance: number;
  isPathMeasurement: boolean;
  pathPoints?: Point2D[];
  angle?: number;
  // Las piezas solo identifican la geometría que originó la anotación: si se
  // borran, la medida se apaga sin desaparecer ni cambiar sus coordenadas.
  pieceIds?: string[];
}

export interface MeasureProximity {
  cursor: Point2D;
  point: Point2D;
  distance: number;
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
  radiusPx = SNAP_THRESHOLD,
): SnapResult | null {
  const localPt = patternToPieceLocal(pt, piece);
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
      // Entraba por `patternToPieceLocal` y salia sumando solo la posicion:
      // sobre una pieza girada el snap devolvia un punto que no esta donde se
      // ve (#1068). Si una direccion necesita el helper, la otra tambien.
      bestPt = pieceLocalToPattern(proj, piece);
      bestSegment = i;
    }
  }

  const threshold = screenToPatternLength(radiusPx, zoom);
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
  // El borde de cierre no tiene comando propio y su rango apunta a la `M`, que
  // mide cero: sin traducir, clicar el lado izquierdo de un rectangulo decia
  // «0.0 mm». Ver `rangoMedibleDeBorde`.
  const [desde, hasta] = rangoMedibleDeBorde(piece.outline, edge.segmentRange);
  const arcLength = computePathArcLength(piece.outline, desde, hasta);
  const markers = samplePathAtIntervals(piece.outline, markerInterval, desde, hasta);
  const pathPoints = markers.map(m => pieceLocalToPattern(m.point, piece));
  const rawWalk = samplePathDense(piece.outline, 3, desde, hasta);
  const walkPoints = rawWalk.map(p => pieceLocalToPattern(p, piece));
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

export function useMeasureTool(zoom: number, pan: Point2D, visiblePieces?: PatternPiece[]) {
  const units = useSelector((s: RootState) => s.editor.units);
  const pieces = useSelector((s: RootState) => s.project.pieces);
  const projectId = useSelector((s: RootState) => s.project.id);
  const snapPieces = visiblePieces ?? pieces;
  const snapIndex = useMemo(() => buildSnapIndex(snapPieces), [snapPieces]);
  // Un extremo interno sirve para medir entre puntos, pero no identifica un
  // tramo del contorno. Las herramientas de curvas comparten los vértices y
  // anillos del índice sin dejar que una interna les tape el tramo buscado.
  const outlineIndex = useMemo(() => ({ ...snapIndex, endsByPiece: new Map<string, Point2D[]>() }), [snapIndex]);
  const vertices = useMemo(() => verticesVisibles(snapIndex), [snapIndex]);

  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [currentStart, setCurrentStart] = useState<Point2D | null>(null);
  const [cursorPos, setCursorPos] = useState<Point2D | null>(null);
  const [hoveredSnapPoint, setHoveredSnapPoint] = useState<Point2D | null>(null);
  const [hoveredSnapKind, setHoveredSnapKind] = useState<SnapKind | null>(null);
  const [proximity, setProximity] = useState<MeasureProximity | null>(null);
  const startPieceIdRef = useRef<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<SelectedEdgeInfo | null>(null);
  const [compareEdgeA, setCompareEdgeA] = useState<SelectedEdgeInfo | null>(null);
  const compareEdgeARef = useRef(compareEdgeA);
  compareEdgeARef.current = compareEdgeA;
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

  const currentStartRef = useRef(currentStart);
  currentStartRef.current = currentStart;

  const formatDistance = useCallback((mm: number): string => {
    return formatDimension(mm, units);
  }, [units]);

  const toPattern = useCallback((e: React.MouseEvent<SVGSVGElement>): Point2D => {
    const rect = e.currentTarget.getBoundingClientRect();
    return screenToPattern(e.clientX, e.clientY, rect, zoom, pan);
  }, [zoom, pan]);

  // El resolutor recorre TODOS los vértices antes de mirar ningún contorno:
  // una arista vecina más cercana no puede robarle el clic a una esquina.
  const trySnap = useCallback((pt: Point2D) => resolveSnap(
    measureMode === 'point-to-point' ? snapIndex : outlineIndex,
    pt,
    screenToPatternLength(EDGE_HIT_PX, zoom),
  ), [measureMode, snapIndex, outlineIndex, zoom]);

  // SnapTarget identifica el punto y la pieza, pero una esquina pertenece a
  // dos tramos. Proyectar el cursor ORIGINAL sobre esa pieza conserva la
  // elección del tramo de snapToOutline; proyectar el vértice ya enganchado
  // crearía un empate artificial. El radio opcional deja intactos los 8 px
  // y el contrato segmentIndex que sigue usando useWalkSeamTool.
  const resolveClickedEdge = useCallback((piece: PatternPiece, rawPt: Point2D) => {
    const projection = snapToOutline(rawPt, piece, zoom, EDGE_HIT_PX);
    return projection ? findEdgeForSegment(piece, projection.segmentIndex) : null;
  }, [zoom]);

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
          const edge = resolveClickedEdge(piece, rawPt);
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
          const edge = resolveClickedEdge(piece, rawPt);
          const info = edge
            ? buildEdgeInfo(piece, edge, markerInterval)
            : buildOutlineInfo(piece, markerInterval);

          if (!compareEdgeARef.current) {
            setCompareEdgeA(info);
            setComparison(null);
          } else {
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
              // Igual que en la línea 132: el rango viene en la convención del
              // productor y hay que traducirlo, o comparar contra el tramo de
              // cierre muestrea el comando `M`, que no dibuja nada (#1120).
              const [aDesde, aHasta] = rangoMedibleDeBorde(edgeA.piece.outline, edgeA.edge.segmentRange);
              const [bDesde, bHasta] = rangoMedibleDeBorde(info.piece.outline, info.edge.segmentRange);
              const ptA = pointAtPathDistance(edgeA.piece.outline, dA, aDesde, aHasta);
              const ptB = pointAtPathDistance(info.piece.outline, dB, bDesde, bHasta);
              if (ptA && ptB) {
                const worldA = pieceLocalToPattern(ptA, edgeA.piece);
                const worldB = pieceLocalToPattern(ptB, info.piece);
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
      startPieceIdRef.current = snap?.pieceId ?? null;
      setCurrentStart(pt);
      setCursorPos(pt);
    } else {
      const start = currentStartRef.current;
      const dx = pt.x - start.x;
      const dy = pt.y - start.y;
      const distance = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx) * (180 / Math.PI);
      const pieceIds = [startPieceIdRef.current, snap?.pieceId]
        .filter((id): id is string => id != null);

      setMeasurements(prev => [...prev, {
        id: newId(),
        startPoint: start,
        endPoint: pt,
        distance,
        isPathMeasurement: false,
        angle,
        pieceIds,
      }]);
      startPieceIdRef.current = null;
      setCurrentStart(null);
      setCursorPos(null);
    }
  }, [toPattern, trySnap, measureMode, markerInterval, pieces, resolveClickedEdge]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const rawPt = toPattern(e);
    const snap = trySnap(rawPt);
    setHoveredSnapPoint(snap ? snap.point : null);
    setHoveredSnapKind(snap?.kind ?? null);

    // La lectura usa el cursor real, incluso cuando el clic caerá en la
    // esquina. Sus 32 px dejan ver la distancia ANTES de entrar en los 12 px
    // de enganche; fuera de ellos buscamos el vértice más cercano del índice.
    let nearest = snap?.kind === 'vertex' ? snap.point : null;
    let nearestDistance = nearest ? Math.hypot(rawPt.x - nearest.x, rawPt.y - nearest.y) : Infinity;
    if (!nearest) {
      const readingRadius = screenToPatternLength(32, zoom);
      for (const vertex of vertices) {
        const distance = Math.hypot(rawPt.x - vertex.x, rawPt.y - vertex.y);
        if (distance <= readingRadius && distance < nearestDistance) {
          nearest = vertex;
          nearestDistance = distance;
        }
      }
    }
    setProximity(nearest ? { cursor: rawPt, point: nearest, distance: nearestDistance } : null);

    if (measureMode === 'along-curve' && selectedEdge) {
      // Compute hover distance along the selected edge
      const localPt = patternToPieceLocal(rawPt, selectedEdge.piece);
      // El panel ya medía bien el cierre desde #1120, pero la etiqueta que
      // sigue al cursor no: decía 0,0 mm en todo el recorrido del lado
      // izquierdo. Mismo rango traducido para las dos.
      const [hDesde, hHasta] = rangoMedibleDeBorde(selectedEdge.piece.outline, selectedEdge.edge.segmentRange);
      const d = distanceAlongPath(selectedEdge.piece.outline, localPt, hDesde, hHasta);
      setHoverDistance(d);
      setCursorPos(rawPt);
    } else {
      setHoverDistance(null);
      setCursorPos(currentStartRef.current && snap ? snap.point : rawPt);
    }
  }, [toPattern, trySnap, measureMode, selectedEdge, vertices, zoom]);

  const handleMouseUp = useCallback(() => {
    // no-op — measure uses clicks, not drag
  }, []);

  const getCursor = useCallback((): string => {
    return 'crosshair';
  }, []);

  // Al ir del lienzo a la tira ya no hay un cursor sobre el patrón al que
  // acompañar. Retiramos la lectura y el anillo, conservando el primer punto
  // para que volver al lienzo permita terminar la misma medición.
  const limpiarHover = useCallback(() => {
    setCursorPos(null);
    setHoveredSnapPoint(null);
    setHoveredSnapKind(null);
    setProximity(null);
    setHoverDistance(null);
  }, []);

  // Cambiar de herramienta cancela el gesto incompleto y sus avisos, pero no
  // el resultado que la usuaria quería recordar. Los refs se vacían también
  // para que un clic posterior no complete un gesto de la herramienta anterior.
  const cancel = useCallback(() => {
    currentStartRef.current = null;
    startPieceIdRef.current = null;
    compareEdgeARef.current = null;
    setCurrentStart(null);
    setCompareEdgeA(null);
    limpiarHover();
  }, [limpiarHover]);

  // Escape abandona el gesto, no borra la memoria de la sesión. La v1 no
  // selecciona mediciones individuales: la única puerta de borrado es la
  // acción explícita de la tira, también al usar Supr o Retroceso.
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') cancel();
  }, [cancel]);

  useEffect(() => {
    cancel();
  }, [activeTool2D, cancel]);

  const reset = useCallback(() => {
    cancel();
    setMeasurements([]);
    setSelectedEdge(null);
    setComparison(null);
  }, [cancel]);

  // Las coordenadas solo tienen sentido en este proyecto. Conservamos la
  // sesión al cambiar de herramienta, pero nunca encima de otro patrón ni
  // en disco: desmontar el editor ya termina esta memoria local.
  useEffect(() => {
    reset();
  }, [projectId, reset]);

  // La tira usa el mismo vaciado completo que el cambio de proyecto para que
  // «Borrar mediciones» incluya puntos, tramos y comparaciones por igual.
  const clear = reset;

  return {
    measurements,
    currentStart,
    cursorPos,
    hoveredSnapPoint,
    hoveredSnapKind,
    proximity,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleKeyDown,
    getCursor,
    reset,
    clear,
    limpiarHover,
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
