import type { CornerType, PatternPiece, Seam, SemanticEdge } from '../../types/types';
import { measureBorderCutLength, type MatchLookup, type MatchTarget } from './cornerTypes';

// ─── Matched corner ("Empatada") resolver ────────────────────────────────────
//
// A `match` corner copies the LENGTH (not the angle) of the cut line of the
// border it is sewn to. `buildMatchLookup` walks a piece's `match` vertices,
// finds the sewn adjacent border via the `Seam` list, measures the partner
// border's REAL cut length (its actual corner types at the border extremes —
// squared/envelope/… included), and returns the per-vertex targets the
// generator consumes. Resolution is one level deep: only the partner's own
// `match` corners are degraded to mitered by `measureBorderCutLength`, so two
// pieces matched to each other are symmetric, order-independent and stable — no
// recursion.

/** SemanticEdge whose command range covers command `cmd`, if any. */
function edgeCoveringCmd(edges: SemanticEdge[], cmd: number): SemanticEdge | undefined {
  return edges.find((e) => e.segmentRange[0] <= cmd && cmd < e.segmentRange[1]);
}

/** The opposite half of the first seam that references `pieceId`/`edgeName`, or null. */
function sewnPartner(
  pieceId: string,
  edgeName: string,
  seams: Seam[],
): { pieceId: string; edgeName: string } | null {
  for (const s of seams) {
    if (s.pieceA.pieceId === pieceId && s.pieceA.edgeName === edgeName) {
      return { pieceId: s.pieceB.pieceId, edgeName: s.pieceB.edgeName };
    }
    if (s.pieceB.pieceId === pieceId && s.pieceB.edgeName === edgeName) {
      return { pieceId: s.pieceA.pieceId, edgeName: s.pieceA.edgeName };
    }
  }
  return null;
}

/**
 * Resolve `match` corners of `piece` into `{ commandIndex → { side, targetLen } }`.
 *
 * For each vertex whose resolved corner type is `match`, the two adjacent
 * borders are the SemanticEdge covering the vertex's command (`prev`) and the
 * one covering the next command (`next`). The sewn one wins; when both are sewn
 * the `prev` (lower command) is chosen — deterministic. The partner border's
 * mitered cut length becomes `targetLen`. Vertices with no sewn adjacent border,
 * a missing partner piece/edge, or an unmeasurable partner produce NO entry —
 * the generator falls back to mitered for those.
 *
 * @param piece     the piece whose `match` corners are being resolved
 * @param allPieces every piece (must include `piece`; enables self-seams)
 * @param seams     project seams
 */
export function buildMatchLookup(
  piece: PatternPiece,
  allPieces: PatternPiece[],
  seams: Seam[],
): MatchLookup {
  const lookup: MatchLookup = {};
  const edges = piece.edges;
  if (!edges || edges.length === 0) return lookup;

  const cornerTypes = piece.cornerTypes ?? {};
  const defaultType: CornerType = piece.defaultCornerType ?? 'mitered';

  // Candidate command indices: explicit `match` overrides, plus every draw
  // command when the piece default is `match`.
  const candidates = new Set<number>();
  for (const [k, v] of Object.entries(cornerTypes)) {
    if (v === 'match') candidates.add(Number(k));
  }
  if (defaultType === 'match') {
    for (let c = 0; c < piece.outline.length; c++) {
      const t = piece.outline[c].type;
      if (t === 'M' || t === 'L' || t === 'H' || t === 'V' || t === 'C' || t === 'Q') candidates.add(c);
    }
  }

  for (const v of candidates) {
    if ((cornerTypes[v] ?? defaultType) !== 'match') continue;

    const prevEdge = edgeCoveringCmd(edges, v);
    const nextEdge = edgeCoveringCmd(edges, v + 1);

    // Which adjacent border is sewn? Prefer prev (lower command) when both are.
    let side: MatchTarget['side'] | null = null;
    let partner: { pieceId: string; edgeName: string } | null = null;
    if (prevEdge) {
      const p = sewnPartner(piece.id, prevEdge.name, seams);
      if (p) {
        side = 'prev';
        partner = p;
      }
    }
    if (!side && nextEdge) {
      const p = sewnPartner(piece.id, nextEdge.name, seams);
      if (p) {
        side = 'next';
        partner = p;
      }
    }
    if (!side || !partner) continue; // no sewn border → mitered fallback

    const partnerPiece = allPieces.find((pc) => pc.id === partner!.pieceId);
    if (!partnerPiece) continue;
    const partnerEdge = partnerPiece.edges?.find((e) => e.name === partner!.edgeName);
    if (!partnerEdge) continue;

    const targetLen = measureBorderCutLength(
      partnerPiece.outline,
      partnerPiece.seamAllowance || 0,
      partnerPiece.edges,
      partnerEdge.segmentRange,
      partnerPiece.cornerTypes,
      partnerPiece.defaultCornerType,
    );
    if (targetLen == null || targetLen <= 0) continue;

    lookup[v] = { side, targetLen };
  }

  return lookup;
}
