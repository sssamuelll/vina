/**
 * Mirror-notch geometry — locate the CORRESPONDING notch on the piece sewn to a
 * given edge (CLO3D's "corresponding notch": same distance along the paired
 * seam so the sewing lines up). One-shot, NO persistent pair identity — the
 * created notch carries its own frozen path + anchor, so D-2 ("path manda")
 * stays intact (spec 2026-06-09-notch-mirror-design.md, Alcance C).
 *
 * Reuses the proven arc-length A→B mapping (the same frac→distance the walk-seam
 * tool runs live). `SemanticEdge.segmentRange` is the [startIdx, endIdx) the
 * arc-length helpers expect directly.
 */
import type {
  PatternPiece,
  SemanticEdge,
  Seam,
  Point2D,
  PathCommand,
  InternalLine,
  NotchAnchor,
} from '../../types/types';
import { computePathArcLength, distanceAlongPath, projectOntoPath } from '../geometry/arcLength';
import { computeRangeLengthMM, interpolateRangePoint } from '../geometry/edgeInterpolation';
import { buildRing } from '../geometry/outlineRing';
import { rangoMedibleDeBorde } from '../semanticEdges';
import { generateNotchPath, DEFAULT_NOTCH_OPTIONS } from '../notches';
import { computeNotchAnchor, resolveNotchAnchorV2 } from '../notchAnchor';
import { lineId } from '../pathHelpers';

/** Resolve a SemanticEdge by name (or id), with the positional `edge-N` fallback. */
export function findEdgeByName(piece: PatternPiece, edgeName: string): SemanticEdge | null {
  const byName = piece.edges?.find(e => e.name === edgeName || e.id === edgeName);
  if (byName) return byName;
  const m = /^edge-(\d+)$/.exec(edgeName);
  if (m && piece.edges) return piece.edges[Number(m[1])] ?? null;
  return null;
}

/** Which semantic edge does a point fall on (nearest by perpendicular distance)? */
export function findEdgeForPoint(piece: PatternPiece, point: Point2D): SemanticEdge | null {
  if (!piece.edges?.length) return null;
  let best: SemanticEdge | null = null, bestPerp = Infinity;
  for (const edge of piece.edges) {
    const [s0, s1] = rangoMedibleDeBorde(piece.outline, edge.segmentRange);
    // El desvío sale de la misma proyección que la distancia: la ida y vuelta
    // por `pointAtPathDistance` caía en otro punto de una curva (t paramétrico).
    const { offset } = projectOntoPath(piece.outline, point, s0, s1);
    if (offset < bestPerp) { bestPerp = offset; best = edge; }
  }
  return best;
}

/**
 * El punto a `distanciaMm` del inicio de un borde, contado por el arco y en el
 * sentido del borde, con la normal hacia dentro: lo mismo que la cota de un
 * piquete puesto a mano (P3b), por la métrica 2. Coordenadas locales.
 */
export function puntoEnElBorde(
  piece: PatternPiece,
  edge: SemanticEdge,
  distanciaMm: number,
): { point: Point2D; normal: Point2D } | null {
  const inicio = interpolateRangePoint(piece.outline, edge.segmentRange, 0)?.point;
  const built = buildRing(piece.outline, 2);
  if (!inicio || !built.ok) return null;
  const r = resolveNotchAnchorV2(piece.outline, { refPoint: inicio, direction: 'cw', distanceMm: distanciaMm, metric: 2 }, built.value);
  return r ? { point: r.point, normal: r.normal } : null;
}

export type MirrorNotchResult =
  | {
      ok: true; pairedPieceId: string; pairedEdgeName: string; point: Point2D; normal: Point2D;
      frac: number; seamId: string;
      /** Dónde cae la pareja: fracción de su borde, en el sentido de ese borde. */
      pairedFrac: number;
      /** El sentido usado, en los términos de `NotchPair.invert`: true si un borde corre al revés del otro. */
      invert: boolean;
      /** Si el punto está dentro del tramo cosido. Fuera, la pareja cae en el extremo más cercano. */
      onSewnStretch: boolean;
    }
  | { ok: false; reason: 'no-edge' | 'no-seam' | 'no-paired-edge' | 'degenerate'; message: string };

/** El rango de un lado en el sentido de su borde: un B invertido lo guarda en el de cosido (`seamRange.ts`). */
function rangoEnElBorde(lado: Seam['pieceA'] | Seam['pieceB']): [number, number] {
  const r: [number, number] = [lado.tStart ?? 0, lado.tEnd ?? 1];
  return 'reversed' in lado && lado.reversed === true ? [1 - r[1], 1 - r[0]] : r;
}

/**
 * Map a notch point on a source piece's edge to the corresponding point on the
 * paired piece's edge across their shared seam (CLO3D's "corresponding notch").
 *
 * - **La costura del punto.** Un borde puede tener varias: una copa partida
 *   cose cada mitad a una sisa. Va por la que cose el punto; si ninguna lo
 *   cose, por la más cercana, y `onSewnStretch` lo dice. Antes tomaba la
 *   primera y la pareja caía en un extremo de la otra sisa.
 * - **El sentido.** Sin `invert`, el de la costura: un B `reversed` cose de su
 *   final a su inicio. Con `invert` (el panel, D-M2), el de antes: los dos
 *   rangos guardados como si fueran del borde, y `invert` da la vuelta.
 * - **La distancia.** La pareja cae a la distancia de arco que le toca
 *   (`puntoEnElBorde`); `pointAtPathDistance` es lineal en el parámetro de
 *   una curva y la dejaba corrida.
 */
export function mapNotchAcrossSeam(args: {
  sourcePiece: PatternPiece;
  point: Point2D;
  seams: Seam[];
  pieces: PatternPiece[];
  invert?: boolean;
  sourceEdge?: SemanticEdge;
}): MirrorNotchResult {
  const { sourcePiece, point, seams, pieces, invert } = args;

  const sourceEdge = args.sourceEdge ?? findEdgeForPoint(sourcePiece, point);
  if (!sourceEdge) return { ok: false, reason: 'no-edge', message: 'Notch is not on a named edge of the piece.' };

  // Traducido: el tramo de cierre se rotula con el índice de la `M`, que no
  // dibuja y mide cero (#1143). Sin esto, un piquete puesto en el lado de
  // cierre no cruzaba la costura: salía por `degenerate`, «Source edge has
  // zero length».
  const [sa0, sa1] = rangoMedibleDeBorde(sourcePiece.outline, sourceEdge.segmentRange);
  const lenA = computePathArcLength(sourcePiece.outline, sa0, sa1);
  if (lenA < 1e-9) return { ok: false, reason: 'degenerate', message: 'Source edge has zero length.' };
  const fracEdgeA = distanceAlongPath(sourcePiece.outline, point, sa0, sa1) / lenA;

  // Las costuras de este borde, con el lado que es la fuente.
  const candidatas = seams.flatMap(seam => {
    const enA = seam.pieceA.pieceId === sourcePiece.id && seam.pieceA.edgeName === sourceEdge.name;
    const enB = seam.pieceB.pieceId === sourcePiece.id && seam.pieceB.edgeName === sourceEdge.name;
    return [...(enA ? [{ seam, srcOnA: true }] : []), ...(enB ? [{ seam, srcOnA: false }] : [])];
  });
  if (candidatas.length === 0) return { ok: false, reason: 'no-seam', message: `No seam on edge "${sourceEdge.name}". Create the seam first.` };
  const fuera = (c: (typeof candidatas)[number]) => {
    const [t0, t1] = rangoEnElBorde(c.srcOnA ? c.seam.pieceA : c.seam.pieceB);
    return Math.max(0, t0 - fracEdgeA, fracEdgeA - t1);
  };
  const elegida = candidatas.reduce((mejor, c) => (fuera(c) < fuera(mejor) ? c : mejor));
  const { seam, srcOnA } = elegida;
  const srcSide = srcOnA ? seam.pieceA : seam.pieceB;
  const dstSide = srcOnA ? seam.pieceB : seam.pieceA;

  const pairedPiece = pieces.find(p => p.id === dstSide.pieceId);
  const pairedEdge = pairedPiece ? findEdgeByName(pairedPiece, dstSide.edgeName) : null;
  if (!pairedPiece || !pairedEdge) return { ok: false, reason: 'no-paired-edge', message: 'Paired edge not found.' };

  let pairedFrac: number;
  let sentido: boolean;
  if (invert !== undefined) {
    // El de antes: los rangos guardados como si fueran del borde.
    const tA0 = srcSide.tStart ?? 0, tA1 = srcSide.tEnd ?? 1;
    const tB0 = dstSide.tStart ?? 0, tB1 = dstSide.tEnd ?? 1;
    const spanA = tA1 - tA0;
    const u = Math.max(0, Math.min(1, spanA > 1e-9 ? (fracEdgeA - tA0) / spanA : fracEdgeA));
    pairedFrac = tB0 + (invert ? 1 - u : u) * (tB1 - tB0);
    sentido = invert;
  } else {
    // El de la costura: `u` es la posición a lo largo de lo cosido, en el
    // sentido de cosido; un B invertido corre al revés de su borde.
    const alReves = seam.pieceB.reversed === true;
    const s0 = srcSide.tStart ?? 0, s1 = srcSide.tEnd ?? 1;
    const tCosido = !srcOnA && alReves ? 1 - fracEdgeA : fracEdgeA;
    const span = s1 - s0;
    const u = Math.max(0, Math.min(1, span > 1e-9 ? (tCosido - s0) / span : tCosido));
    const d0 = dstSide.tStart ?? 0, d1 = dstSide.tEnd ?? 1;
    const tDestino = d0 + u * (d1 - d0);
    pairedFrac = srcOnA && alReves ? 1 - tDestino : tDestino;
    sentido = alReves;
  }

  const lenB = computeRangeLengthMM(pairedPiece.outline, pairedEdge.segmentRange);
  const sitio = puntoEnElBorde(pairedPiece, pairedEdge, pairedFrac * lenB);
  if (!sitio) return { ok: false, reason: 'degenerate', message: 'Paired edge has zero length.' };

  return {
    ok: true,
    pairedPieceId: pairedPiece.id,
    pairedEdgeName: pairedEdge.name,
    point: sitio.point,
    normal: sitio.normal,
    frac: fracEdgeA,
    seamId: seam.id,
    pairedFrac,
    invert: sentido,
    onSewnStretch: fuera(elegida) <= 0.5 / lenA,
  };
}

/**
 * Build the mirror notch InternalLine for the paired piece from a successful
 * mapping. The created notch is INDEPENDENT (own frozen path + recomputed
 * anchor on the paired outline, inheriting the source anchor's ring metric —
 * D-2 "path manda" intact); no persistent pair link. Shared by the copilot
 * `mirrorNotch` tool and the F3 panel control.
 */
export function createMirrorNotchLine(
  pairedOutline: PathCommand[],
  mapped: { point: Point2D; normal: Point2D },
  sourceNotch: {
    notchOptions?: InternalLine['notchOptions'];
    notchAnchor?: NotchAnchor;
  },
): InternalLine {
  const options = sourceNotch.notchOptions ?? DEFAULT_NOTCH_OPTIONS;
  const metric = sourceNotch.notchAnchor
    ? (sourceNotch.notchAnchor.metric ?? 1)
    : 2;
  const anchor = computeNotchAnchor(pairedOutline, mapped.point, metric);
  return {
    id: lineId(),
    type: 'notch',
    path: generateNotchPath(mapped.point, mapped.normal, options),
    notchOptions: { ...options },
    ...(anchor ? { notchAnchor: anchor } : {}),
  };
}
