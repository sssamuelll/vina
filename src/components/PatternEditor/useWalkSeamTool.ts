/**
 * Walk Seam Verification Tool
 *
 * Lets the user click an edge on a pattern piece, auto-discovers the paired
 * edge via Seam data, and as the user hovers along the stationary edge a
 * ghost of the paired piece translates+rotates to follow — like "walking"
 * two physical pattern pieces together on a table.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import type { Point2D, PathCommand, PatternPiece, Seam, SemanticEdge } from '../../types/types';
import {
  computePathArcLength,
  pointAtPathDistance,
  distanceAlongPath,
} from '../../utils/geometry/arcLength';
import { rangoMedibleDeBorde } from '../../utils/semanticEdges';
import {
  patternToPieceLocal,
  pieceLocalToPattern,
  pieceLocalToPatternDirection,
} from '../../utils/geometry/pieceSpace';
import { snapToOutline, findEdgeForSegment, buildEdgeInfo, buildOutlineInfo } from './useMeasureTool';
import { formatDimension } from '../../utils/units';
import { screenToPattern } from './sewingUtils';
import { noPasoNada } from './noPasoNada';
import { bandaDeDesajuste, metricasDeCaminar, TOLERANCIA_CAMINAR_MM } from '../../utils/seam/caminarCostura';

// ─── Exported Types ─────────────────────────────────────────────────────────

export interface WalkSeamEdge {
  pieceId: string;
  piece: PatternPiece;
  edge: SemanticEdge;
  arcLength: number;
}

export interface MismatchSample {
  distance: number;
  pointA: Point2D;
  pointB: Point2D;
  delta: number;
  color: 'green' | 'yellow' | 'red';
}

/**
 * El fantasma, en tres capas que se aplican SOBRE la pose real de la pieza
 * móvil — nunca en vez de ella. De dentro hacia afuera:
 *
 *   `translate(tx, ty) rotate(angleDeg, pivot) [pose del renderizador]`
 *
 * Antes esto reemplazaba a la pose y omitía su `rotate(piece.rotation, …)`,
 * así que una pieza móvil girada se dibujaba sin girar (#1068). Componer en
 * vez de sustituir es lo que hace imposible volver a perder ese giro.
 */
export interface GhostTransform {
  /** Lleva el punto de contacto hasta el punto de caminado, ya en patrón. */
  tx: number;
  ty: number;
  /** Giro que le FALTA a la pieza móvil para acostarse sobre el estacionario. */
  angleDeg: number;
  /** El punto de contacto en espacio de patrón: el giro no lo mueve. */
  pivotX: number;
  pivotY: number;
}

export interface WalkSeamMetrics {
  lengthA: number;
  lengthB: number;
  delta: number;
  easePercent: number;
  walkPosition: number;
}

export interface SeamLookupResult {
  seam: Seam;
  pairedPieceId: string;
  pairedEdgeName: string;
}

// ─── Pure Helper Functions ──────────────────────────────────────────────────

/**
 * Find a seam that connects the given piece+edge, returning the paired side.
 */
export function findSeamForEdge(
  pieceId: string,
  edgeName: string,
  seams: Seam[],
): SeamLookupResult | null {
  for (const seam of seams) {
    if (seam.pieceA.pieceId === pieceId && seam.pieceA.edgeName === edgeName) {
      return {
        seam,
        pairedPieceId: seam.pieceB.pieceId,
        pairedEdgeName: seam.pieceB.edgeName,
      };
    }
    if (seam.pieceB.pieceId === pieceId && seam.pieceB.edgeName === edgeName) {
      return {
        seam,
        pairedPieceId: seam.pieceA.pieceId,
        pairedEdgeName: seam.pieceA.edgeName,
      };
    }
  }
  return null;
}

/**
 * Compute the unit tangent vector at a given arc-length distance along an
 * edge (defined by segStart..segEnd within the outline).
 *
 * Uses finite difference: normalize(point(d+ε) − point(d−ε)).
 */
export function computeEdgeTangent(
  outline: PathCommand[],
  d: number,
  segStart: number,
  segEnd: number,
): Point2D {
  const arcLen = computePathArcLength(outline, segStart, segEnd);
  const EPS = 0.5;
  const dLo = Math.max(0, d - EPS);
  const dHi = Math.min(arcLen, d + EPS);

  const pLo = pointAtPathDistance(outline, dLo, segStart, segEnd);
  const pHi = pointAtPathDistance(outline, dHi, segStart, segEnd);

  if (!pLo || !pHi) {
    return { x: 1, y: 0 }; // fallback: horizontal
  }

  const dx = pHi.x - pLo.x;
  const dy = pHi.y - pLo.y;
  const mag = Math.sqrt(dx * dx + dy * dy);

  if (mag < 1e-10) {
    return { x: 1, y: 0 }; // degenerate: return default
  }

  return { x: dx / mag, y: dy / mag };
}

/**
 * Compute the translation + rotation needed to place the mobile piece's
 * edge at the current walk position on the stationary edge.
 *
 * The ghost piece is positioned so that:
 *  - The point on the mobile edge (at the same fractional distance)
 *    aligns with the walk point on the stationary edge.
 *  - The mobile edge tangent is rotated to align with the stationary tangent.
 */
export function computeGhostTransform(
  stationaryPiece: PatternPiece,
  stationaryRange: [number, number],
  mobilePiece: PatternPiece,
  mobileRange: [number, number],
  walkDistance: number,
): GhostTransform {
  // Recibe las PIEZAS, no `outline` + `position` sueltos. Con la posición
  // suelta el archivo no mencionaba `piece.position` ni una vez, así que el
  // trinquete del #1068 no podía verlo: el rodeo era arquitectónico, no
  // sintáctico. Pedir la pieza entera hace imposible olvidar su giro.
  const stationaryOutline = stationaryPiece.outline;
  const mobileOutline = mobilePiece.outline;
  // Traducidos por lo mismo que en `sampleMismatch` (#1143): con el lado de
  // cierre el fantasma se quedaba clavado en la esquina.
  const [s0, s1] = rangoMedibleDeBorde(stationaryOutline, stationaryRange);
  const [m0, m1] = rangoMedibleDeBorde(mobileOutline, mobileRange);
  const stationaryArcLen = computePathArcLength(stationaryOutline, s0, s1);
  const mobileArcLen = computePathArcLength(mobileOutline, m0, m1);

  // Clamp walk distance
  const dS = Math.max(0, Math.min(walkDistance, stationaryArcLen));

  // Map to mobile: same fraction
  const frac = stationaryArcLen > 0 ? dS / stationaryArcLen : 0;
  const dM = frac * mobileArcLen;

  // Get local-space points on each edge
  const localStatPt = pointAtPathDistance(stationaryOutline, dS, s0, s1) ?? { x: 0, y: 0 };
  const localMobPt = pointAtPathDistance(mobileOutline, dM, m0, m1) ?? { x: 0, y: 0 };

  // Las tangentes se comparan en espacio de PATRÓN. Medidas sobre el contorno
  // crudo el ángulo ignora los dos giros, y con una pieza girada el fantasma
  // se acuesta sobre una dirección que no existe en pantalla.
  const tS = pieceLocalToPatternDirection(
    computeEdgeTangent(stationaryOutline, dS, s0, s1),
    stationaryPiece,
  );
  const tM = pieceLocalToPatternDirection(
    computeEdgeTangent(mobileOutline, dM, m0, m1),
    mobilePiece,
  );

  // Lo que le FALTA a la móvil para quedar paralela al borde estacionario.
  const angleDeg = (Math.atan2(tS.y, tS.x) - Math.atan2(tM.y, tM.x)) * (180 / Math.PI);

  // Los dos puntos, por el transform del renderizador.
  const walkPt = pieceLocalToPattern(localStatPt, stationaryPiece);
  const contactPt = pieceLocalToPattern(localMobPt, mobilePiece);

  // El giro es alrededor del punto de contacto, así que no lo mueve: la
  // traslación es la diferencia directa entre los dos puntos.
  return {
    tx: walkPt.x - contactPt.x,
    ty: walkPt.y - contactPt.y,
    angleDeg,
    pivotX: contactPt.x,
    pivotY: contactPt.y,
  };
}

/**
 * Sample two edges at 5mm intervals and compare arc-length distances
 * to produce color-coded mismatch indicators.
 *
 * For each sample at distance dA along edge A:
 *   frac = dA / lenA
 *   dB   = frac * lenB
 *   delta = |dA - dB|
 *   green:  delta < tolerance
 *   yellow: tolerance <= delta < 2 * tolerance
 *   red:    delta >= 2 * tolerance
 */
export function sampleMismatch(
  outlineA: PathCommand[],
  rangeA: [number, number],
  outlineB: PathCommand[],
  rangeB: [number, number],
  tolerance: number,
): MismatchSample[] {
  // Los rangos vienen en la convención del productor y el tramo de cierre se
  // rotula con el índice de la `M`, que no dibuja: sin traducir, `lenA` da 0,
  // la función se va por el early-return y caminar el lado de cierre no
  // pintaba una sola muestra (#1143). Se traduce AQUÍ y no en los llamadores
  // por el mismo motivo por el que esta familia recibe la pieza entera: que
  // no se pueda olvidar.
  const [a0, a1] = rangoMedibleDeBorde(outlineA, rangeA);
  const [b0, b1] = rangoMedibleDeBorde(outlineB, rangeB);
  const lenA = computePathArcLength(outlineA, a0, a1);
  const lenB = computePathArcLength(outlineB, b0, b1);

  if (lenA <= 0) return [];

  const INTERVAL = 5; // mm
  const numIntervals = Math.floor(lenA / INTERVAL);
  const samples: MismatchSample[] = [];

  for (let i = 0; i <= numIntervals; i++) {
    const dA = i * INTERVAL;
    const frac = lenA > 0 ? dA / lenA : 0;
    const dB = frac * lenB;
    const delta = Math.abs(dA - dB);

    const ptA = pointAtPathDistance(outlineA, dA, a0, a1);
    const ptB = pointAtPathDistance(outlineB, dB, b0, b1);

    if (!ptA || !ptB) continue;

    const color = bandaDeDesajuste(delta, tolerance);

    samples.push({
      distance: dA,
      pointA: ptA,
      pointB: ptB,
      delta,
      color,
    });
  }

  // Add endpoint if not already at exactly the last interval
  const lastDist = numIntervals * INTERVAL;
  if (lenA - lastDist > 1e-6) {
    const frac = 1;
    const dB = frac * lenB;
    const delta = Math.abs(lenA - dB);
    const ptA = pointAtPathDistance(outlineA, lenA, a0, a1);
    const ptB = pointAtPathDistance(outlineB, dB, b0, b1);

    if (ptA && ptB) {
      const color = bandaDeDesajuste(delta, tolerance);

      samples.push({
        distance: lenA,
        pointA: ptA,
        pointB: ptB,
        delta,
        color,
      });
    }
  }

  return samples;
}

// ─── Hook ───────────────────────────────────────────────────────────────────

/**
 * Cuanto se lleva recorrido del borde `edge` cuando el cursor esta en
 * `patternPt` (espacio de patron).
 *
 * Se saca del hook por el mismo motivo que `computeGhostTransform` y
 * `sampleMismatch`: es geometria pura y aqui se puede probar. El giro importa
 * —`piece.outline` esta SIN girar, asi que restar solo `position` proyecta el
 * cursor contra la sombra y devuelve casi el borde entero (#1068).
 */
export function walkDistanceAt(
  patternPt: Point2D,
  piece: PatternPiece,
  edge: SemanticEdge,
): number {
  const [desde, hasta] = rangoMedibleDeBorde(piece.outline, edge.segmentRange);
  return distanceAlongPath(
    piece.outline,
    patternToPieceLocal(patternPt, piece),
    desde,
    hasta,
  );
}

export function useWalkSeamTool(zoom: number, pan: Point2D) {
  const units = useSelector((s: RootState) => s.editor.units);
  const pieces = useSelector((s: RootState) => s.project.pieces);
  const seams = useSelector((s: RootState) => s.project.seams);
  const activeTool2D = useSelector((s: RootState) => s.tools.activeTool2D);
  const tolerance = useSelector(
    (s: RootState) => Number(s.tools.toolOptions[activeTool2D]?.tolerance ?? String(TOLERANCIA_CAMINAR_MM)),
  );
  const ghostOpacity = useSelector(
    (s: RootState) => Number(s.tools.toolOptions[activeTool2D]?.ghostOpacity ?? '30'),
  );

  const [stationaryEdge, setStationaryEdge] = useState<WalkSeamEdge | null>(null);
  const [mobileEdge, setMobileEdge] = useState<WalkSeamEdge | null>(null);
  const [walkDistance, setWalkDistance] = useState<number>(0);
  const [hoveredSnapPoint, setHoveredSnapPoint] = useState<Point2D | null>(null);
  const [ghostTransform, setGhostTransform] = useState<GhostTransform | null>(null);
  const [mismatchSamples, setMismatchSamples] = useState<MismatchSample[]>([]);
  const [metrics, setMetrics] = useState<WalkSeamMetrics | null>(null);

  const stationaryEdgeRef = useRef(stationaryEdge);
  stationaryEdgeRef.current = stationaryEdge;
  const mobileEdgeRef = useRef(mobileEdge);
  mobileEdgeRef.current = mobileEdge;

  // Clear state when tool deactivates
  useEffect(() => {
    if (activeTool2D !== 'walkSeam') {
      setStationaryEdge(null);
      setMobileEdge(null);
      setWalkDistance(0);
      setHoveredSnapPoint(null);
      setGhostTransform(null);
      setMismatchSamples([]);
      setMetrics(null);
    }
  }, [activeTool2D]);

  // Recompute mismatch samples + metrics when edges or tolerance change
  useEffect(() => {
    if (!stationaryEdge || !mobileEdge) {
      setMismatchSamples([]);
      setMetrics(null);
      return;
    }

    const samples = sampleMismatch(
      stationaryEdge.piece.outline,
      stationaryEdge.edge.segmentRange,
      mobileEdge.piece.outline,
      mobileEdge.edge.segmentRange,
      tolerance,
    );
    setMismatchSamples(samples);

    const { lengthA, lengthB, delta, easePercent } = metricasDeCaminar(stationaryEdge.arcLength, mobileEdge.arcLength, tolerance);
    setMetrics({ lengthA, lengthB, delta, easePercent, walkPosition: 0 });
  }, [stationaryEdge, mobileEdge, tolerance]);

  const toPattern = useCallback((e: React.MouseEvent<SVGSVGElement>): Point2D => {
    const rect = e.currentTarget.getBoundingClientRect();
    return screenToPattern(e.clientX, e.clientY, rect, zoom, pan);
  }, [zoom, pan]);

  /** Try to snap to nearest piece outline */
  const trySnap = useCallback((pt: Point2D) => {
    let best: ReturnType<typeof snapToOutline> = null;
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

  /** Resolve a snap result into a WalkSeamEdge */
  const resolveEdge = useCallback((snap: { pieceId: string; segmentIndex: number }): WalkSeamEdge | null => {
    const piece = pieces.find(p => p.id === snap.pieceId);
    if (!piece) return null;
    const edge = findEdgeForSegment(piece, snap.segmentIndex);
    const info = edge
      ? buildEdgeInfo(piece, edge, 50)
      : buildOutlineInfo(piece, 50);
    return {
      pieceId: piece.id,
      piece,
      edge: info.edge,
      arcLength: info.arcLength,
    };
  }, [pieces]);

  /** Try to auto-discover the paired mobile edge via seam data */
  const tryAutoDiscover = useCallback((edge: WalkSeamEdge, shiftKey: boolean) => {
    if (shiftKey) return;
    const seamResult = findSeamForEdge(edge.pieceId, edge.edge.name, seams);
    if (!seamResult) return;
    const pairedPiece = pieces.find(p => p.id === seamResult.pairedPieceId);
    if (!pairedPiece) return;
    const pairedEdge = pairedPiece.edges?.find(ed => ed.name === seamResult.pairedEdgeName);
    if (!pairedEdge) return;
    const pairedInfo = buildEdgeInfo(pairedPiece, pairedEdge, 50);
    setMobileEdge({
      pieceId: pairedPiece.id,
      piece: pairedPiece,
      edge: pairedEdge,
      arcLength: pairedInfo.arcLength,
    });
  }, [seams, pieces]);

  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const rawPt = toPattern(e);
    const snap = trySnap(rawPt);
    if (!snap) return;

    const clickedEdge = resolveEdge(snap);
    if (!clickedEdge) {
      // El enganche acertó un borde y aquí la pieza ya no aparece: sin esto
      // caminar la costura no arranca y nada lo dice (#1117).
      noPasoNada('walkseam:borde-sin-resolver', { pieceId: snap.pieceId });
      return;
    }

    const stationary = stationaryEdgeRef.current;
    const mobile = mobileEdgeRef.current;

    if (!stationary) {
      // First click: set stationary, try auto-discover
      setStationaryEdge(clickedEdge);
      setMobileEdge(null);
      setGhostTransform(null);
      setWalkDistance(0);
      tryAutoDiscover(clickedEdge, e.shiftKey);
      // If no auto or shiftKey held → wait for second click
    } else if (!mobile) {
      // Second click: set mobile edge
      setMobileEdge(clickedEdge);
      setWalkDistance(0);
      setGhostTransform(null);
    } else {
      // Third click (both set): reset to new stationary
      setStationaryEdge(clickedEdge);
      setMobileEdge(null);
      setGhostTransform(null);
      setWalkDistance(0);
      tryAutoDiscover(clickedEdge, e.shiftKey);
    }
  }, [toPattern, trySnap, resolveEdge, tryAutoDiscover]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const rawPt = toPattern(e);
    const snap = trySnap(rawPt);
    setHoveredSnapPoint(snap ? snap.point : null);

    const stationary = stationaryEdgeRef.current;
    const mobile = mobileEdgeRef.current;

    if (stationary && mobile) {
      // Compute walk distance along stationary edge
      const d = walkDistanceAt(rawPt, stationary.piece, stationary.edge);
      setWalkDistance(d);

      const transform = computeGhostTransform(
        stationary.piece,
        stationary.edge.segmentRange,
        mobile.piece,
        mobile.edge.segmentRange,
        d,
      );
      setGhostTransform(transform);

      // Update walk position in metrics
      setMetrics(prev => prev ? { ...prev, walkPosition: d } : null);
    }
  }, [toPattern, trySnap]);

  const handleMouseUp = useCallback(() => {
    // no-op — walk seam uses clicks, not drag
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (mobileEdgeRef.current) {
        // Clear mobile first
        setMobileEdge(null);
        setGhostTransform(null);
        setWalkDistance(0);
      } else if (stationaryEdgeRef.current) {
        // Then clear stationary
        setStationaryEdge(null);
      }
    }
  }, []);

  const getCursor = useCallback((): string => {
    return 'crosshair';
  }, []);

  const reset = useCallback(() => {
    setStationaryEdge(null);
    setMobileEdge(null);
    setWalkDistance(0);
    setHoveredSnapPoint(null);
    setGhostTransform(null);
    setMismatchSamples([]);
    setMetrics(null);
  }, []);

  const clear = reset;

  /** Al salir del lienzo de golpe no llega mousemove que lo apague (#1132).
   *  Solo el enganche: los bordes elegidos y el fantasma se quedan. */
  const limpiarHover = useCallback(() => setHoveredSnapPoint(null), []);

  const formatDistance = useCallback((mm: number): string => {
    return formatDimension(mm, units);
  }, [units]);

  return {
    // State
    stationaryEdge,
    mobileEdge,
    walkDistance,
    hoveredSnapPoint,
    ghostTransform,
    mismatchSamples,
    metrics,
    ghostOpacity,
    tolerance,
    units,
    formatDistance,
    // Handlers
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleKeyDown,
    getCursor,
    reset,
    clear,
    limpiarHover,
  };
}
