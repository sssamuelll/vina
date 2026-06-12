/**
 * World-space refinement of auto-sew proposals (camisa de María plan, M4-C).
 *
 * autoSew scores in 2D pattern space, but which physical edges end up
 * adjacent is decided by PLACEMENT: real CAD patterns draw symmetric pieces
 * with arbitrary 2D orientation (María's back draws its left-body side seam
 * on the opposite 2D side than the front), and facing rotations mirror X.
 * Pairing by 2D edge NAME therefore connects opposite sides of the body —
 * the probe measured side seams crossing the torso diagonally (63cm mean
 * pair distance vs the 37cm front↔back gap) — and traversal directions
 * flip, so `matchVertices` sews an X inside each seam.
 *
 * This module refines a proposal SET after placement is known:
 * 1. PARTNER ASSIGNMENT — within each symmetric role group (the `-N` suffix
 *    family: sideSeam/sideSeam-2 ↔ sideSeam/sideSeam-2, armhole family ↔
 *    sleeveCap family, …), reassign partners to minimize total world
 *    distance between edge midpoints (brute force; groups are 2-4 seams).
 *    Halves are CANONICALIZED first (autoSew emits A/B sides in arbitrary
 *    order per seam — the armhole group mixes sleeve↔bodice and
 *    bodice↔sleeve), so the permutation always swaps same-role halves.
 * 2. DIRECTION — set `pieceB.reversed` so endpoints pair nearest-to-nearest
 *    (straight, not crossed). Ctrl+B in the seam tool remains the human
 *    override; this only seeds the AI proposal correctly.
 *
 * Seams whose edges can't be resolved by semantic name (manual `edge-N`
 * seams, missing pieces) pass through untouched.
 */

import type { PatternPiece, Seam } from '../../types/types';
import {
  patternPointToWorld,
  outlineBBoxCenter,
  type PlacementResult,
} from '../cloth/garmentPlacement';
import { flattenPath, commandRangeToFlattened } from '../seam/index';

type V3 = [number, number, number];

/** One side of a seam, detached from A/B storage order. */
type SeamHalf = { pieceId: string; edgeName: string; tStart?: number; tEnd?: number };

interface EdgeWorld {
  /** World position of the edge's first outline point (t=0 traversal). */
  first: V3;
  /** World position of the edge's last outline point (t=1 traversal). */
  last: V3;
  mid: V3;
}

function dist(p: V3, q: V3): number {
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

function edgeRoot(name: string): string {
  return name.toLowerCase().replace(/-\d+$/, '');
}

function edgeWorld(
  piece: PatternPiece,
  placement: PlacementResult,
  edgeName: string,
): EdgeWorld | null {
  const edge = piece.edges?.find(e => e.name === edgeName);
  if (!edge) return null;
  const flat = flattenPath(piece.outline, 12);
  if (flat.length === 0) return null;
  const center = outlineBBoxCenter(piece.outline);
  const [fs, fe] = commandRangeToFlattened(piece.outline, edge.segmentRange, 12);
  const pFirst = flat[fs];
  const pLast = flat[fe % flat.length];
  if (!pFirst || !pLast) return null;
  const first = patternPointToWorld(pFirst.x, pFirst.y, center, placement);
  const last = patternPointToWorld(pLast.x, pLast.y, center, placement);
  const mid: V3 = [
    (first[0] + last[0]) / 2,
    (first[1] + last[1]) / 2,
    (first[2] + last[2]) / 2,
  ];
  return { first, last, mid };
}

/** All permutations of [0..n) — groups are tiny (≤4), so n! is fine. */
function permutations(n: number): number[][] {
  if (n === 1) return [[0]];
  const out: number[][] = [];
  for (const perm of permutations(n - 1)) {
    for (let i = 0; i <= perm.length; i++) {
      out.push([...perm.slice(0, i), n - 1, ...perm.slice(i)]);
    }
  }
  return out;
}

/** Largest group size we solve exactly; beyond this, leave assignment as-is. */
const MAX_GROUP_PERMUTE = 4;

interface ResolvedSeam {
  /** Canonical halves: X is the lexicographically smaller role key (ties
   *  broken by pieceId), so every member of a group has same-role X sides. */
  x: { half: SeamHalf; world: EdgeWorld };
  y: { half: SeamHalf; world: EdgeWorld };
  groupKey: string;
}

/**
 * Refine a set of proposed seams against the CURRENT placements: reassign
 * symmetric partners by world proximity and seed `pieceB.reversed` from
 * endpoint geometry. Returns refined copies in the same order; unresolvable
 * seams pass through untouched.
 */
export function refineSeamsInWorld(
  seams: Seam[],
  pieces: PatternPiece[],
  placements: PlacementResult[],
): Seam[] {
  const byId = new Map<string, { piece: PatternPiece; placement: PlacementResult }>();
  for (let i = 0; i < pieces.length; i++) {
    if (placements[i]) byId.set(pieces[i].id, { piece: pieces[i], placement: placements[i] });
  }

  const resolved: Array<ResolvedSeam | null> = seams.map(seam => {
    const pa = byId.get(seam.pieceA.pieceId);
    const pb = byId.get(seam.pieceB.pieceId);
    if (!pa || !pb) return null;
    const aWorld = edgeWorld(pa.piece, pa.placement, seam.pieceA.edgeName);
    const bWorld = edgeWorld(pb.piece, pb.placement, seam.pieceB.edgeName);
    if (!aWorld || !bWorld) return null;

    const keyA = `${pa.piece.category ?? '?'}:${edgeRoot(seam.pieceA.edgeName)}`;
    const keyB = `${pb.piece.category ?? '?'}:${edgeRoot(seam.pieceB.edgeName)}`;
    const halfA: SeamHalf = {
      pieceId: seam.pieceA.pieceId, edgeName: seam.pieceA.edgeName,
      tStart: seam.pieceA.tStart, tEnd: seam.pieceA.tEnd,
    };
    const halfB: SeamHalf = {
      pieceId: seam.pieceB.pieceId, edgeName: seam.pieceB.edgeName,
      tStart: seam.pieceB.tStart, tEnd: seam.pieceB.tEnd,
    };

    const aIsX = keyA < keyB || (keyA === keyB && seam.pieceA.pieceId <= seam.pieceB.pieceId);
    return {
      x: aIsX ? { half: halfA, world: aWorld } : { half: halfB, world: bWorld },
      y: aIsX ? { half: halfB, world: bWorld } : { half: halfA, world: aWorld },
      groupKey: [keyA, keyB].sort().join('↔'),
    };
  });

  // ── 1. Partner reassignment within symmetric role groups ────────────────
  const groups = new Map<string, number[]>();
  resolved.forEach((r, i) => {
    if (!r) return;
    const list = groups.get(r.groupKey) ?? [];
    list.push(i);
    groups.set(r.groupKey, list);
  });

  // Y halves are permuted among each group's seams to minimize Σ midpoint
  // distance — the smallest assignment that turns "same 2D name" into
  // "same world side".
  const assignedY = new Map<number, ResolvedSeam['y']>();
  for (const indices of groups.values()) {
    if (indices.length < 2 || indices.length > MAX_GROUP_PERMUTE) continue;
    const members = indices.map(i => resolved[i]!);
    let best: number[] | null = null;
    let bestCost = Infinity;
    for (const perm of permutations(indices.length)) {
      let cost = 0;
      for (let k = 0; k < perm.length; k++) {
        cost += dist(members[k].x.world.mid, members[perm[k]].y.world.mid);
      }
      if (cost < bestCost) {
        bestCost = cost;
        best = perm;
      }
    }
    if (!best) continue;
    for (let k = 0; k < best.length; k++) {
      if (best[k] !== k) assignedY.set(indices[k], members[best[k]].y);
    }
  }

  // ── 2. Direction (reversed) from endpoint geometry ───────────────────────
  return seams.map((seam, i) => {
    const r = resolved[i];
    if (!r) return seam;

    const y = assignedY.get(i) ?? r.y;
    const straight = dist(r.x.world.first, y.world.first) + dist(r.x.world.last, y.world.last);
    const crossed = dist(r.x.world.first, y.world.last) + dist(r.x.world.last, y.world.first);

    return {
      ...seam,
      pieceA: { ...r.x.half },
      pieceB: { ...y.half, reversed: crossed < straight },
    };
  });
}
