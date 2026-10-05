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
import { computePathArcLength, pointAtPathDistance, distanceAlongPath, projectOntoPath } from '../geometry/arcLength';
import { rangoMedibleDeBorde } from '../semanticEdges';
import { generateNotchPath, DEFAULT_NOTCH_OPTIONS } from '../notches';
// `ringOf` es EL aplanado del contorno, y vive en notchAnchor: este módulo
// tenía su propia copia literal, y dos copias del mismo aplanado derivan —
// alguien arregla una y no la otra (#1029).
import { computeNotchAnchor, ringOf } from '../notchAnchor';
import { lineId } from '../pathHelpers';

export interface SeamPartner {
  seam: Seam;
  pairedPieceId: string;
  pairedEdgeName: string;
}

/** Find a seam connecting (pieceId, edgeName); return the paired side, bidirectional. */
export function findSeamForEdge(pieceId: string, edgeName: string, seams: Seam[]): SeamPartner | null {
  for (const seam of seams) {
    if (seam.pieceA.pieceId === pieceId && seam.pieceA.edgeName === edgeName) {
      return { seam, pairedPieceId: seam.pieceB.pieceId, pairedEdgeName: seam.pieceB.edgeName };
    }
    if (seam.pieceB.pieceId === pieceId && seam.pieceB.edgeName === edgeName) {
      return { seam, pairedPieceId: seam.pieceA.pieceId, pairedEdgeName: seam.pieceA.edgeName };
    }
  }
  return null;
}

/** Resolve a SemanticEdge by name (or id), with the positional `edge-N` fallback. */
export function findEdgeByName(piece: PatternPiece, edgeName: string): SemanticEdge | null {
  const byName = piece.edges?.find(e => e.name === edgeName || e.id === edgeName);
  if (byName) return byName;
  const m = /^edge-(\d+)$/.exec(edgeName);
  if (m && piece.edges) return piece.edges[Number(m[1])] ?? null;
  return null;
}

/**
 * Interior unit normal at a point on an outline. Shoelace winding decides which
 * side is inward (the resolveNotchAnchor convention, shared so a mirror notch
 * never points outward on a reversed-winding piece — D-M4).
 */
export function interiorNormalAtPoint(outline: PathCommand[], point: Point2D): Point2D {
  const ring = ringOf(outline);
  const n = ring.length;
  if (n < 3) return { x: 0, y: -1 };
  let area2 = 0;
  for (let i = 0; i < n; i++) {
    const a = ring[i], b = ring[(i + 1) % n];
    area2 += a.x * b.y - b.x * a.y;
  }
  let bestDist = Infinity, tx = 1, ty = 0;
  for (let i = 0; i < n; i++) {
    const a = ring[i], b = ring[(i + 1) % n];
    const dx = b.x - a.x, dy = b.y - a.y;
    const segLen = Math.hypot(dx, dy);
    if (segLen < 1e-9) continue;
    let t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / (segLen * segLen);
    t = Math.max(0, Math.min(1, t));
    const px = a.x + t * dx, py = a.y + t * dy;
    const dist = Math.hypot(point.x - px, point.y - py);
    if (dist < bestDist) { bestDist = dist; tx = dx / segLen; ty = dy / segLen; }
  }
  // Left normal of travel = (-ty, tx); inward depends on winding (shoelace sign).
  return area2 > 0 ? { x: -ty, y: tx } : { x: ty, y: -tx };
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

export type MirrorNotchResult =
  | { ok: true; pairedPieceId: string; pairedEdgeName: string; point: Point2D; normal: Point2D; frac: number; seamId: string }
  | { ok: false; reason: 'no-edge' | 'no-seam' | 'no-paired-edge' | 'degenerate'; message: string };

/**
 * Map a notch point on a source piece's edge to the corresponding point on the
 * paired piece's edge across their shared seam. `invert` flips the sense (the
 * normal real-garment case sews edges right-sides-together → opposite traversal;
 * the human picks the sense via preview+toggle — D-M2). Respects `tStart/tEnd`
 * partial seams: the fraction is measured within the SEWN sub-range.
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

  const partner = findSeamForEdge(sourcePiece.id, sourceEdge.name, seams);
  if (!partner) return { ok: false, reason: 'no-seam', message: `No seam on edge "${sourceEdge.name}". Create the seam first.` };

  const pairedPiece = pieces.find(p => p.id === partner.pairedPieceId);
  const pairedEdge = pairedPiece ? findEdgeByName(pairedPiece, partner.pairedEdgeName) : null;
  if (!pairedPiece || !pairedEdge) return { ok: false, reason: 'no-paired-edge', message: 'Paired edge not found.' };

  // Traducido: el tramo de cierre se rotula con el índice de la `M`, que no
  // dibuja y mide cero (#1143). Sin esto, un piquete puesto en el lado de
  // cierre no cruzaba la costura: salía por `degenerate`, «Source edge has
  // zero length».
  const [sa0, sa1] = rangoMedibleDeBorde(sourcePiece.outline, sourceEdge.segmentRange);
  const lenA = computePathArcLength(sourcePiece.outline, sa0, sa1);
  if (lenA < 1e-9) return { ok: false, reason: 'degenerate', message: 'Source edge has zero length.' };
  const dA = distanceAlongPath(sourcePiece.outline, point, sa0, sa1);
  const fracEdgeA = dA / lenA;

  // Which seam side is the source, to read the right tStart/tEnd sub-range.
  const srcOnA = partner.seam.pieceA.pieceId === sourcePiece.id && partner.seam.pieceA.edgeName === sourceEdge.name;
  const srcSide = srcOnA ? partner.seam.pieceA : partner.seam.pieceB;
  const dstSide = srcOnA ? partner.seam.pieceB : partner.seam.pieceA;
  const tA0 = srcSide.tStart ?? 0, tA1 = srcSide.tEnd ?? 1;
  const tB0 = dstSide.tStart ?? 0, tB1 = dstSide.tEnd ?? 1;

  // Fraction within the SEWN sub-range of the source edge.
  const spanA = tA1 - tA0;
  let fracSewn = spanA > 1e-9 ? (fracEdgeA - tA0) / spanA : fracEdgeA;
  fracSewn = Math.max(0, Math.min(1, fracSewn));
  const fracSewnB = invert ? 1 - fracSewn : fracSewn;
  const fracEdgeB = tB0 + fracSewnB * (tB1 - tB0);

  const [sb0, sb1] = rangoMedibleDeBorde(pairedPiece.outline, pairedEdge.segmentRange);
  const lenB = computePathArcLength(pairedPiece.outline, sb0, sb1);
  const ptB = pointAtPathDistance(pairedPiece.outline, fracEdgeB * lenB, sb0, sb1);
  if (!ptB) return { ok: false, reason: 'degenerate', message: 'Paired edge has zero length.' };

  return {
    ok: true,
    pairedPieceId: pairedPiece.id,
    pairedEdgeName: pairedEdge.name,
    point: ptB,
    normal: interiorNormalAtPoint(pairedPiece.outline, ptB),
    frac: fracEdgeA,
    seamId: partner.seam.id,
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
