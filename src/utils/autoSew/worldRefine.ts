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
 * 3. CAP CUT — step 1 may hand a sleeve-cap half to the other armhole, so
 *    each split cap is re-cut for its FINAL partners (`repartirCopas`).
 *
 * Seams whose edges can't be resolved by semantic name (manual `edge-N`
 * seams, missing pieces) pass through steps 1-2 untouched; step 3 only
 * touches a cap split in two complementary halves.
 */

import type { PatternPiece, Point2D, Seam } from '../../types/types';
import { outlineBBoxCenter } from '../cloth/garmentPlacement';
import type { PlacementWithFrame } from '../cloth/arrangement/arrangementBinding';
import { wrapPlacedMesh } from '../cloth/arrangement/wrapPlacedMesh';
import { flattenPath, commandRangeToFlattened } from '../seam/index';
import { mirrorPctRange } from '../seam/seamRange';
import { repartirCopas } from './repartoDeCopa';

type V3 = [number, number, number];

/** One side of a seam, detached from A/B storage order. */
type SeamHalf = { pieceId: string; edgeName: string; tStart?: number; tEnd?: number };

export interface EdgeWorld {
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

/** El punto del tramo aplanado [fs, fe] (fe < fs da la vuelta por el cierre) a la fracción t de su largo de arco. */
function puntoPorLargo(flat: Point2D[], fs: number, fe: number, t: number): Point2D | null {
  const N = flat.length;
  const fin = fe < fs ? fe + N : fe;
  const pts: Point2D[] = [];
  for (let k = fs; k <= fin; k++) pts.push(flat[k % N]);
  if (pts.length === 0 || pts.some((p) => !p)) return null;
  if (pts.length === 1) return pts[0];
  const largos = [0];
  for (let k = 1; k < pts.length; k++) largos.push(largos[k - 1] + Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y));
  const total = largos[largos.length - 1];
  if (!(total > 0)) return pts[0];
  const objetivo = Math.max(0, Math.min(1, t)) * total;
  let k = 1;
  while (k < pts.length - 1 && largos[k] < objetivo) k++;
  const tramo = largos[k] - largos[k - 1];
  const u = tramo > 0 ? (objetivo - largos[k - 1]) / tramo : 0;
  return { x: pts[k - 1].x + u * (pts[k].x - pts[k - 1].x), y: pts[k - 1].y + u * (pts[k].y - pts[k - 1].y) };
}

export function edgeWorld(
  piece: PatternPiece,
  pwf: PlacementWithFrame,
  edgeName: string,
  tRange?: [number, number],
): EdgeWorld | null {
  const edge = piece.edges?.find(e => e.name === edgeName);
  if (!edge) return null;
  const flat = flattenPath(piece.outline, 12);
  if (flat.length === 0) return null;
  const center = outlineBBoxCenter(piece.outline);
  const [fs0, fe0] = commandRangeToFlattened(piece.outline, edge.segmentRange, 12);
  // Las puntas de un sub-rango t (medias costuras de sisa y de cuello) van por largo de arco, interpolando
  // dentro del segmento: la misma t con la que parameterizeEdgeFromBoundary reparte los vértices (#1250 C2).
  // Por índice de punto, en la orilla recta de la tira (dos puntos) las dos puntas caían en el mismo lugar y
  // la dirección de la media costura quedaba a la suerte del empate.
  const pFirst = puntoPorLargo(flat, fs0, fe0, tRange ? tRange[0] : 0);
  const pLast = puntoPorLargo(flat, fs0, fe0, tRange ? tRange[1] : 1);
  if (!pFirst || !pLast) return null;
  // Position the endpoints with the EXACT mapping the solver uses (envelope
  // wrap, not the old rigid Euler): build the two local mesher verts in the
  // mesher's local convention ([(x−cx)·0.001, 0, (y−cy)·0.001], same as
  // patternPointToWorld), then run them through wrapPlacedMesh — byte-identical
  // geometry to GarmentSimulation's placed-mesh wrap. Do NOT re-implement the
  // wrap math here.
  const local = new Float32Array([
    (pFirst.x - center.cx) * 0.001, 0, (pFirst.y - center.cy) * 0.001,
    (pLast.x - center.cx) * 0.001, 0, (pLast.y - center.cy) * 0.001,
  ]);
  const wrapped = wrapPlacedMesh(local, pwf.frame, pwf.wrapParams, pwf.flip);
  const first: V3 = [wrapped[0], wrapped[1], wrapped[2]];
  const last: V3 = [wrapped[3], wrapped[4], wrapped[5]];
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
 * symmetric partners by world proximity, seed `pieceB.reversed` from
 * endpoint geometry, and re-cut split sleeve caps for their final partners.
 * Returns refined copies in the same order; unresolvable seams pass through
 * untouched unless they are halves of a split cap.
 *
 * Endpoints are positioned with the WRAP (envelope-wrap PR), via the same
 * `wrapPlacedMesh(frame, flip)` the solver starts pieces with — NOT the old
 * rigid Euler placement. Scoring against the rigid pose while the solver
 * starts pieces wrapped diverged 4-8cm on wrapped edges and could decide
 * partner/`reversed` against the wrong geometry (PR #924 finding #5). Takes a
 * `PlacementWithFrame` per piece (`resolveArrangementWithFrames`).
 */
export function refineSeamsInWorld(
  seams: Seam[],
  pieces: PatternPiece[],
  placements: PlacementWithFrame[],
): Seam[] {
  const byId = new Map<string, { piece: PatternPiece; placement: PlacementWithFrame }>();
  for (let i = 0; i < pieces.length; i++) {
    if (placements[i]) byId.set(pieces[i].id, { piece: pieces[i], placement: placements[i] });
  }

  const resolved: Array<ResolvedSeam | null> = seams.map(seam => {
    // Same-piece (self) seam — e.g. a sleeve's underarm tube closure. It must
    // NOT enter the cross-piece partner-reassignment grouping (both sleeves'
    // underarm self-seams share one role key and would be cross-paired).
    // Returning null routes it through the existing "pass through untouched"
    // branch in step 2, preserving the reversed the self-close pass set.
    // See docs/superpowers/specs/2026-06-23-sleeve-tube-closure-design.md.
    if (seam.pieceA.pieceId === seam.pieceB.pieceId) return null;
    const pa = byId.get(seam.pieceA.pieceId);
    const pb = byId.get(seam.pieceB.pieceId);
    if (!pa || !pb) return null;
    const tOf = (h: { tStart?: number; tEnd?: number }): [number, number] | undefined =>
      h.tStart != null || h.tEnd != null ? [h.tStart ?? 0, h.tEnd ?? 1] : undefined;
    // FÍSICO, no almacenado (bug reversed×rango 2026-07-04): el rango del
    // half B se almacena en dirección de COSIDO (seamRange header) — para
    // MEDIR geometría hay que des-espejarlo cuando el input trae
    // reversed=true. Las halves internas cargan el rango FÍSICO; la emisión
    // (paso 2) re-espeja según el reversed FINAL. Sin esto, worldRefine
    // seteaba reversed sin tocar el rango y el solver cosía la mitad física
    // equivocada: las dos medias de la sisa reclamaban la MISMA mitad del
    // cap y la otra quedaba desnuda (esquinas de 9-13cm medidas).
    const rangeA = tOf(seam.pieceA); // A nunca lleva reversed: almacenado ≡ físico
    const rangeB0 = tOf(seam.pieceB);
    const rangeB = seam.pieceB.reversed === true && rangeB0 ? mirrorPctRange(rangeB0) : rangeB0;
    const aWorld = edgeWorld(pa.piece, pa.placement, seam.pieceA.edgeName, rangeA);
    const bWorld = edgeWorld(pb.piece, pb.placement, seam.pieceB.edgeName, rangeB);
    if (!aWorld || !bWorld) return null;

    const keyA = `${pa.piece.category ?? '?'}:${edgeRoot(seam.pieceA.edgeName)}`;
    const keyB = `${pb.piece.category ?? '?'}:${edgeRoot(seam.pieceB.edgeName)}`;
    const halfA: SeamHalf = {
      pieceId: seam.pieceA.pieceId, edgeName: seam.pieceA.edgeName,
      tStart: rangeA?.[0], tEnd: rangeA?.[1],
    };
    const halfB: SeamHalf = {
      pieceId: seam.pieceB.pieceId, edgeName: seam.pieceB.edgeName,
      tStart: rangeB?.[0], tEnd: rangeB?.[1],
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
  const refined = seams.map((seam, i) => {
    const r = resolved[i];
    if (!r) return seam;

    const y = assignedY.get(i) ?? r.y;
    const straight = dist(r.x.world.first, y.world.first) + dist(r.x.world.last, y.world.last);
    const crossed = dist(r.x.world.first, y.world.last) + dist(r.x.world.last, y.world.first);
    const reversed = crossed < straight;

    // Las halves internas cargan rangos FÍSICOS (ver ingesta). El half B se
    // almacena en dirección de COSIDO: si reversed queda true, se espeja al
    // emitir (mirrorPctRange — el único definidor del espejo). Idempotente:
    // re-refinar des-espeja en la ingesta y re-espeja aquí.
    const yStored = reversed && y.half.tStart != null && y.half.tEnd != null
      ? (() => {
          const [s, e] = mirrorPctRange([y.half.tStart!, y.half.tEnd!]);
          return { ...y.half, tStart: s, tEnd: e };
        })()
      : y.half;

    return {
      ...seam,
      pieceA: { ...r.x.half },
      pieceB: { ...yStored, reversed },
    };
  });

  // ── 3. Where each sleeve cap is cut ──────────────────────────────────────
  // Step 1 may hand a cap half to the other armhole; the cut follows the
  // FINAL partners, so each half measures what its armhole measures.
  return repartirCopas(refined, pieces);
}
