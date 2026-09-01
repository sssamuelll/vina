/**
 * Geometría del tramo de borde — de cursor a `t` en arco del borde semántico.
 *
 * Fue un hook con máquina de cuatro fases (`segmentSewing`, tecla `N` sin botón
 * en el dock). La máquina murió al fusionarse con la herramienta de coser
 * (#1029): hoy un arrastre dice lo mismo en un gesto. Lo que queda es la
 * geometría, que es lo único que sabía hacer lo que María pide, y la consumen
 * `useFreeSewingTool` y `useSeamEditTool`.
 */
import type { PathCommand, PatternPiece, Point2D, Seam } from '../../types/types';
import { getEdgeEndpoints } from '../../utils/geometry/path';
import { screenToPatternLength } from '../../utils/geometry';
import {
  flattenPathWithSource, commandRangeToFlattened, commandPolyline, closestOnPolyline,
} from '../../utils/seam';
import { applyPctRange } from '../../utils/seam/seamRange';
import { edgeRangeForCommand } from '../../utils/semanticEdges';
import { patternToPieceLocal, pieceLocalToPattern } from './pieceTransform';
import { EDGE_HIT_PX } from './gestureConstants';

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

// ─── Pure functions (exported for testing) ────────────────────────────

export function snapToEdge(
  pt: Point2D,
  piece: PatternPiece,
  zoom: number,
  /** Rango de comandos [inicio, fin) al que confinar el snap. */
  edgeConstraint?: [number, number],
  /**
   * Sin radio de enganche: la proyección sobre el borde gana siempre, esté el
   * cursor donde esté. Es lo que necesita el RELEASE de la familia TRAMO.
   *
   * El press y el release no hacen la misma pregunta. El press pregunta *qué
   * agarro*, y ahí el radio es la respuesta correcta: hay que apretar cerca de
   * un borde. El release solo pregunta *hasta dónde*, sobre un borde que ya
   * está elegido y que el gesto no re-apunta nunca (spec § 4.1, "el press
   * manda el objeto"). Un radio ahí no puede escoger mejor objeto — solo puede
   * negar el valor, y negarlo tiraba el gesto entero a clic: el borde COMPLETO
   * en vez del tramo marcado (#1061).
   *
   * Solo tiene sentido junto a `edgeConstraint`: sin un borde ya fijado, el
   * radio es lo único que decide qué se engancha.
   */
  unbounded = false,
): SnapResult | null {
  const threshold = unbounded ? Infinity : screenToPatternLength(EDGE_HIT_PX, zoom);
  const cmds = piece.outline;
  // Entra y sale por el mismo transform que usa el renderizador. Restar solo
  // `position` medía contra el fantasma de la pieza SIN girar: desde #1033 el
  // ángulo vive en `piece.rotation` y no en las coordenadas del contorno, así
  // que clicar encima del borde no enganchaba nada y clicar en el aire sí
  // (#1064). La vuelta es igual de obligatoria — `point` se dibuja.
  const localPt = patternToPieceLocal(pt, piece);

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
        point: pieceLocalToPattern(closest, piece),
        edgeIndex: i,
        t,
        pieceId: piece.id,
      };
    }
  }

  return best;
}

/**
 * Memo de UNA entrada para la busqueda sin pieza fijada (#1110).
 *
 * Con Coser activa, dos consumidores distintos resuelven el MISMO punto en el
 * mismo movimiento del raton: el selector de bordes (`useFreeSewingTool`) y el
 * encendido del par ya cosido (`useSeamEditTool`). La funcion es pura —
 * (pt, pieces, zoom) manda y nada mas— asi que la segunda llamada sale gratis
 * en vez de volver a aplanar la geometria de todas las piezas. `pieces` viene
 * de Redux, que da una referencia nueva cuando cambia, asi que comparar por
 * identidad basta.
 *
 * El camino con `constrainPieceId` no pasa por aqui: ya es barato (una pieza).
 */
let memoSinFijar: {
  x: number;
  y: number;
  pieces: PatternPiece[];
  zoom: number;
  out: SnapResult | null;
} | null = null;

export function snapToAnyEdge(
  pt: Point2D,
  pieces: PatternPiece[],
  zoom: number,
  constrainPieceId?: string,
  constrainEdge?: [number, number],
  /** Ver `snapToEdge`. Se ignora sin pieza fijada: ahí el radio es lo único
   *  que decide cuál de todas se engancha, y quitarlo elegiría una cualquiera. */
  unbounded = false,
): SnapResult | null {
  if (constrainPieceId) {
    const piece = pieces.find(p => p.id === constrainPieceId);
    if (!piece) return null;
    return snapToEdge(pt, piece, zoom, constrainEdge, unbounded);
  }

  if (
    memoSinFijar
    && memoSinFijar.zoom === zoom
    && memoSinFijar.pieces === pieces
    && memoSinFijar.x === pt.x
    && memoSinFijar.y === pt.y
  ) {
    return memoSinFijar.out;
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

  memoSinFijar = { x: pt.x, y: pt.y, pieces, zoom, out: best };
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
export function commandTToEdgeT(
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
  const edgeRange = edgeRangeForCommand(piece, first.edgeIndex);
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
