import { useState, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../store';
import { addSeam } from '../../store/projectSlice';
import { selectSeam } from '../../store/editorSlice';
import type { PathCommand, PatternPiece, Point2D, Seam } from '../../types/types';
import { getEdgeEndpoints } from '../../utils/geometry/path';
import { screenToPattern } from './sewingUtils';
import { screenToPatternLength } from '../../utils/geometry';
import {
  flattenPathWithSource, commandRangeToFlattened, commandPolyline, closestOnPolyline,
} from '../../utils/seam';
import { applyPctRange } from '../../utils/seam/seamRange';
import { newId } from '../../utils/ids';

// ─── Types ────────────────────────────────────────────────────────────

export interface SnapResult {
  point: Point2D;
  edgeIndex: number;
  t: number;
  pieceId: string;
}

export interface SegmentSelection {
  pieceId: string;
  /** Comando del PRIMER clic — con él se resuelve el nombre del borde. */
  edgeIndex: number;
  /** Rango de comandos del borde semántico que contiene el tramo. */
  edgeRange: [number, number];
  /** Fracción de ARCO sobre el borde completo (no sobre el comando clicado). */
  startT: number;
  endT: number;
  startPoint: Point2D;
  endPoint: Point2D;
}

type Phase = 'idle' | 'a_start' | 'a_end' | 'b_start' | 'b_end';

interface SegmentSewingState {
  phase: Phase;
  segmentA: SegmentSelection | null;
  segmentB: SegmentSelection | null;
  pendingSnap: SnapResult | null;
  hoveredSnap: SnapResult | null;
}

const SNAP_THRESHOLD = 8;

// ─── Pure functions (exported for testing) ────────────────────────────

/**
 * Rango de comandos del borde semántico que contiene `cmdIndex`, o el comando
 * suelto si la pieza no tiene bordes detectados.
 *
 * Es la unidad del gesto. La pista de pantalla siempre dijo "el mismo BORDE" y
 * el código constreñía al mismo COMANDO: coinciden solo en un rectángulo
 * dibujado a mano. En un DXF los contornos vienen como polilíneas densas de
 * `L` (cabecera de outlineAnalysis.ts), y basta añadir un punto a un lado
 * recto para partirlo en dos — ahí el segundo clic caía fuera y el gesto se
 * quedaba mudo (maria #199a).
 */
export function semanticEdgeRange(
  piece: PatternPiece | undefined,
  cmdIndex: number,
): [number, number] {
  const semantic = piece?.edges?.find(
    e => cmdIndex >= e.segmentRange[0] && cmdIndex < e.segmentRange[1],
  );
  return semantic ? semantic.segmentRange : [cmdIndex, cmdIndex + 1];
}

export function snapToEdge(
  pt: Point2D,
  piece: PatternPiece,
  zoom: number,
  /** Rango de comandos [inicio, fin) al que confinar el snap. */
  edgeConstraint?: [number, number],
): SnapResult | null {
  const threshold = screenToPatternLength(SNAP_THRESHOLD, zoom);
  const cmds = piece.outline;
  const ox = piece.position?.x ?? 0;
  const oy = piece.position?.y ?? 0;
  const localPt = { x: pt.x - ox, y: pt.y - oy };

  let best: SnapResult | null = null;
  let bestDist = Infinity;

  for (let i = 1; i < cmds.length; i++) {
    if (edgeConstraint && (i < edgeConstraint[0] || i >= edgeConstraint[1])) continue;

    // Contra el TRAZO aplanado, no contra la cuerda. Medir contra la cuerda de
    // un comando curvo miente por los dos lados: clicar encima del arco no
    // enganchaba nada (la cuerda queda lejísimos) y clicar en el aire sobre la
    // cuerda sí enganchaba. Es el fallo del #213 en las tijeras de coser
    // (maria #199 vuelta 2). La cuerda queda de reserva para los comandos que
    // el aplanado no cubre — el cierre Z, entre otros.
    const poly = commandPolyline(cmds, i);
    let closest: Point2D;
    let t: number;

    if (poly.length >= 2) {
      const hit = closestOnPolyline(localPt, poly);
      if (!hit) continue;
      closest = hit.point;
      t = hit.t;
    } else {
      const ep = getEdgeEndpoints(cmds, i);
      if (!ep) continue;
      const dx = ep.end.x - ep.start.x;
      const dy = ep.end.y - ep.start.y;
      const lenSq = dx * dx + dy * dy;
      if (lenSq === 0) {
        t = 0;
        closest = ep.start;
      } else {
        t = Math.max(0, Math.min(1,
          ((localPt.x - ep.start.x) * dx + (localPt.y - ep.start.y) * dy) / lenSq));
        closest = { x: ep.start.x + t * dx, y: ep.start.y + t * dy };
      }
    }

    const dist = Math.hypot(localPt.x - closest.x, localPt.y - closest.y);
    if (dist < threshold && dist < bestDist) {
      bestDist = dist;
      best = {
        point: { x: closest.x + ox, y: closest.y + oy },
        edgeIndex: i,
        t,
        pieceId: piece.id,
      };
    }
  }

  return best;
}

function snapToAnyEdge(
  pt: Point2D,
  pieces: PatternPiece[],
  zoom: number,
  constrainPieceId?: string,
  constrainEdge?: [number, number],
): SnapResult | null {
  if (constrainPieceId) {
    const piece = pieces.find(p => p.id === constrainPieceId);
    if (!piece) return null;
    return snapToEdge(pt, piece, zoom, constrainEdge);
  }

  let best: SnapResult | null = null;
  let bestDist = Infinity;

  for (const piece of pieces) {
    const snap = snapToEdge(pt, piece, zoom);
    if (snap) {
      const dist = Math.hypot(pt.x - snap.point.x, pt.y - snap.point.y);
      if (dist < bestDist) {
        bestDist = dist;
        best = snap;
      }
    }
  }

  return best;
}

/** Un clic a <1% del extremo del edge cuenta como el extremo exacto — evita
 *  slivers sin coser accidentales y deja que vértice-a-vértice colapse a la
 *  convención rango-completo de seamRange.ts (campos ausentes, nunca 0/1). */
const EDGE_ENDPOINT_SNAP_T = 0.01;

/**
 * (índice de comando, t local del comando) → fracción de ARCO sobre el edge
 * semántico completo. El t del Seam vive en espacio de arco del edge
 * (contrato seamRange.ts / parameterizeEdge); el t del snap vive dentro del
 * comando clicado. Iguales solo cuando el edge es un único comando. Sobre un
 * comando CURVO, tLocal viene de la proyección sobre la cuerda (snapToEdge) y
 * se escala al arco aplanado del comando — exacto en L/H/V, aproximado en C/Q.
 */
function commandTToEdgeT(
  outline: PathCommand[],
  edgeRange: [number, number],
  cmdIndex: number,
  tLocal: number,
): number {
  const pts = flattenPathWithSource(outline);
  const [from, to] = commandRangeToFlattened(outline, edgeRange);
  const [cmdFrom, cmdTo] = commandRangeToFlattened(outline, [cmdIndex, cmdIndex + 1]);
  const arc = (i: number, j: number): number => {
    let s = 0;
    for (let k = i + 1; k <= j; k++) s += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y);
    return s;
  };
  const total = arc(from, to);
  if (total <= 0) return 0;
  return (arc(from, cmdFrom) + tLocal * arc(cmdFrom, cmdTo)) / total;
}

/** Tramo más corto que esto = los dos clics son el mismo sitio. */
const MIN_SEGMENT_T = 0.01;

/**
 * Cierra el tramo con los dos clics de una fase, en espacio de ARCO DEL BORDE.
 *
 * La conversión comando→borde ocurre aquí, en el gesto, y no más abajo: los
 * dos clics pueden caer en comandos DISTINTOS del mismo borde, y sus `t`
 * locales no son comparables entre sí (0.5 del primer comando puede ir después
 * de 0.2 del segundo). Convertidos a arco del borde sí lo son, y de paso es la
 * unidad en la que ya viajaba el dato (`Seam.tStart/tEnd`, seamRange.ts).
 *
 * Devuelve null si los dos clics caen prácticamente encima.
 */
export function closeSegment(
  first: SnapResult,
  second: SnapResult,
  piece: PatternPiece | undefined,
): SegmentSelection | null {
  const edgeRange = semanticEdgeRange(piece, first.edgeIndex);
  const tA = piece ? commandTToEdgeT(piece.outline, edgeRange, first.edgeIndex, first.t) : first.t;
  const tB = piece ? commandTToEdgeT(piece.outline, edgeRange, second.edgeIndex, second.t) : second.t;
  if (Math.abs(tB - tA) < MIN_SEGMENT_T) return null;

  const forward = tA <= tB;
  return {
    pieceId: first.pieceId,
    edgeIndex: first.edgeIndex,
    edgeRange,
    startT: forward ? tA : tB,
    endT: forward ? tB : tA,
    startPoint: forward ? first.point : second.point,
    endPoint: forward ? second.point : first.point,
  };
}

function segmentToSeamHalf(
  piece: PatternPiece | undefined,
  segment: SegmentSelection,
): Seam['pieceA'] {
  const semantic = piece?.edges?.find(
    e => segment.edgeIndex >= e.segmentRange[0] && segment.edgeIndex < e.segmentRange[1],
  );
  const base = {
    pieceId: segment.pieceId,
    edgeName: semantic?.name ?? `edge-${segment.edgeIndex}`,
  };
  // startT/endT ya vienen en arco del borde desde closeSegment.
  let t0 = segment.startT;
  let t1 = segment.endT;
  if (t0 < EDGE_ENDPOINT_SNAP_T) t0 = 0;
  if (t1 > 1 - EDGE_ENDPOINT_SNAP_T) t1 = 1;
  return applyPctRange(base, t0 * 100, t1 * 100);
}

/**
 * Build the Seam a completed segment-sewing gesture dispatches.
 *
 * Los tramos parciales VIAJAN al Seam como tStart/tEnd (#1022). La mitigación
 * full-segment-snap del parity plan Fase 5 § 5 descartaba el sub-rango citando
 * un solver que emparejaba por t sin renormalizar; ese solver ya no existe —
 * renormalizeFilteredT corre en los dos tiers (seamAssembly CPU, seamPairs
 * GPU) y el escenario que la mitigación temía (parcial contra entero, y
 * parciales asimétricos) está verificado con números en
 * src/utils/cloth/__tests__/seamPartialRange.test.ts: stretch-map
 * proporcional, cero cruces, convergencia sin torsión.
 */
export function buildSegmentSeam(
  segmentA: SegmentSelection,
  segmentB: SegmentSelection,
  pieces: PatternPiece[],
  seamType: string,
): Omit<Seam, 'id'> {
  return {
    pieceA: segmentToSeamHalf(pieces.find(p => p.id === segmentA.pieceId), segmentA),
    pieceB: segmentToSeamHalf(pieces.find(p => p.id === segmentB.pieceId), segmentB),
    type: seamType as Seam['type'],
    tension: 100,
    strength: 1.0,
    active: true,
    taped: false,
    tapeWidth: 10,
  };
}

/** Segundo clic de una fase: snap confinado al borde del primero, y cierre. */
function closeAgainstPending(
  pending: SnapResult | null,
  pt: Point2D,
  pieces: PatternPiece[],
  zoom: number,
): SegmentSelection | null {
  if (!pending) return null;
  const piece = pieces.find(p => p.id === pending.pieceId);
  const snap = snapToAnyEdge(
    pt, pieces, zoom,
    pending.pieceId,
    semanticEdgeRange(piece, pending.edgeIndex),
  );
  return snap ? closeSegment(pending, snap, piece) : null;
}

// ─── Hook ──────────────────────────────────────────────────────────────

export function useSegmentSewingTool(
  zoom2D: number,
  pan2D: Point2D,
  pieces: PatternPiece[],
) {
  const dispatch = useDispatch();
  const seamType = useSelector(
    (s: RootState) => (s.tools.toolOptions?.segmentSewing?.seamType as string) ?? 'standard',
  );

  const [state, setState] = useState<SegmentSewingState>({
    phase: 'idle',
    segmentA: null,
    segmentB: null,
    pendingSnap: null,
    hoveredSnap: null,
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
      phase: 'idle',
      segmentA: null,
      segmentB: null,
      pendingSnap: null,
      hoveredSnap: null,
    });
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (e.button !== 0) return;
      const pt = toPattern(e);

      setState(prev => {
        switch (prev.phase) {
          case 'idle': {
            const snap = snapToAnyEdge(pt, pieces, zoom2D);
            if (!snap) return prev;
            return {
              ...prev,
              phase: 'a_start',
              pendingSnap: snap,
              segmentA: null,
              segmentB: null,
            };
          }

          case 'a_start': {
            const segment = closeAgainstPending(prev.pendingSnap, pt, pieces, zoom2D);
            if (!segment) return prev;
            return { ...prev, phase: 'a_end', segmentA: segment, pendingSnap: null };
          }

          case 'a_end': {
            if (!prev.segmentA) return prev;
            const snap = snapToAnyEdge(pt, pieces, zoom2D);
            if (!snap || snap.pieceId === prev.segmentA.pieceId) return prev;
            return {
              ...prev,
              phase: 'b_start',
              pendingSnap: snap,
            };
          }

          case 'b_start': {
            const segment = closeAgainstPending(prev.pendingSnap, pt, pieces, zoom2D);
            if (!segment) return prev;
            return { ...prev, phase: 'b_end', segmentB: segment, pendingSnap: null };
          }

          default:
            return prev;
        }
      });
    },
    [toPattern, pieces, zoom2D],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const pt = toPattern(e);

      setState(prev => {
        let constrainPiece: string | undefined;
        let constrainEdge: [number, number] | undefined;

        if ((prev.phase === 'a_start' || prev.phase === 'b_start') && prev.pendingSnap) {
          constrainPiece = prev.pendingSnap.pieceId;
          constrainEdge = semanticEdgeRange(
            pieces.find(p => p.id === constrainPiece),
            prev.pendingSnap.edgeIndex,
          );
        }

        const snap = snapToAnyEdge(pt, pieces, zoom2D, constrainPiece, constrainEdge);
        return { ...prev, hoveredSnap: snap };
      });
    },
    [toPattern, pieces, zoom2D],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        reset();
        return;
      }
      if (e.key === 'Backspace') {
        setState(prev => {
          switch (prev.phase) {
            case 'a_start':
              return { ...prev, phase: 'idle' as Phase, pendingSnap: null };
            case 'a_end':
              return { ...prev, phase: 'idle' as Phase, segmentA: null, pendingSnap: null };
            case 'b_start':
              return { ...prev, phase: 'a_end' as Phase, pendingSnap: null };
            case 'b_end':
              return { ...prev, phase: 'a_end' as Phase, segmentB: null, pendingSnap: null };
            default:
              return prev;
          }
        });
        return;
      }
      if (e.key === 'Enter' && state.phase === 'b_end' && state.segmentA && state.segmentB) {
        const fullSeam: Seam = {
          ...buildSegmentSeam(state.segmentA, state.segmentB, pieces, seamType),
          id: newId(),
        };
        dispatch(addSeam(fullSeam));
        dispatch(selectSeam(fullSeam.id));
        reset();
      }
    },
    [state.phase, state.segmentA, state.segmentB, seamType, dispatch, reset, pieces],
  );

  const getCursor = useCallback((): string => {
    if (state.hoveredSnap) return 'crosshair';
    return 'default';
  }, [state.hoveredSnap]);

  return {
    phase: state.phase,
    segmentA: state.segmentA,
    segmentB: state.segmentB,
    pendingSnap: state.pendingSnap,
    hoveredSnap: state.hoveredSnap,
    handleMouseDown,
    handleMouseMove,
    handleKeyDown,
    getCursor,
    reset,
  };
}
