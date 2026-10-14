/**
 * Seam Assembly — Virtual sewing engine for XPBD cloth simulation.
 *
 * Provides edge parameterization, vertex pairing, seam constraint generation,
 * and multi-piece mesh merging so pattern pieces can be sewn together during
 * simulation.
 *
 * @module seamAssembly
 */

import type { PathCommand, Point2D, Seam, SemanticEdge } from '../../types/types';
import { flattenPath, commandRangeToFlattened, edgeNToCommandIndex, TOLERANCIA_DE_DUPLICADOS } from '../seam/index';
import { renormalizeFilteredT } from '../seam/seamRange';

// ─── Types ──────────────────────────────────────────────────────────────────

/** A vertex on a boundary edge with its arc-length parameter (0–1). */
export interface ParameterizedVertex {
  /** Global particle index in the merged mesh */
  index: number;
  /** Normalized arc-length parameter along the edge (0 = start, 1 = end) */
  t: number;
}

/** A pair of vertices to be sewn together. */
export interface SeamConstraintPair {
  /** Particle index from piece A */
  idA: number;
  /** Particle index from piece B */
  idB: number;
  /** Current rest length (shrinks toward 0) */
  restLength: number;
}

/** Configuration for seam constraint behaviour. */
export interface SeamConstraintConfig {
  /** Shrink factor per substep (e.g. 0.995 = slow sewing). Default 0.995 */
  shrinkFactor: number;
  /**
   * Sewn-detection epsilon (m): a seam counts as sewn once
   * `restLength <= restLengthFloor + sewedThreshold`. Also lower-bounds the
   * effective floor, so a (test-only) floor of 0 degrades to the legacy
   * near-zero snap instead of decaying forever. Default 1e-6.
   */
  sewedThreshold: number;
  /**
   * Terminal seam rest length (m) — borrow-plan A3. Decay clamps HERE, not
   * at 0: snap-to-0 dragged the armscye seam midpoint through the convex
   * shoulder (mechanism 2 of the skin-poke diagnosis, 2026-06-26). Semantics:
   * `max(0.002, avg fabric thickness of the joined pieces)` via
   * `computeSeamRestLengthFloor`. Default 0.002 (2mm) — cross-tier canonical
   * with Rust `XpbdSolver::new` (`seam_rest_length_floor`) and the GPU
   * `seamRestLengthFloor` uniform.
   */
  restLengthFloor: number;
  /** XPBD compliance per seam type. Lower = stiffer. */
  compliance: Record<Seam['type'], number>;
}

/** A complete set of seam constraints ready for the solver. */
export interface SeamConstraintSet {
  /** Flat array of paired particle indices [idA0, idB0, idA1, idB1, ...] */
  ids: Int32Array;
  /** Current rest lengths (one per pair, shrinks each step) */
  restLengths: Float32Array;
  /** Compliance value per pair */
  compliances: Float32Array;
  /** Number of constraint pairs */
  count: number;
  /** Config used */
  config: SeamConstraintConfig;
}

/** Tracking info for a piece within a merged mesh. */
export interface PieceOffset {
  pieceId: string;
  /** First particle index in the merged mesh */
  vertexOffset: number;
  /** Number of particles for this piece */
  vertexCount: number;
  /** First triangle index (in triIds) for this piece */
  triangleOffset: number;
  /** Number of triangles for this piece */
  triangleCount: number;
}

/** Result of merging multiple piece meshes. */
export interface MergedMesh {
  /** Combined vertex positions [x0,y0,z0, ...] */
  vertices: Float32Array;
  /** Combined triangle indices (offsets applied) */
  triIds: Int32Array;
  /** Per-piece offset tracking */
  pieces: PieceOffset[];
  /** Combined UV coordinates [u0,v0, u1,v1, ...] (optional) */
  uvs?: Float32Array;
}


interface PieceOffsetIndexEntry {
  id: string;
  offset: PieceOffset;
}

function comparePieceId(a: string, b: string): number {
  return a.localeCompare(b);
}

function findPieceOffsetById(index: readonly PieceOffsetIndexEntry[], pieceId: string): PieceOffset | undefined {
  let left = 0;
  let right = index.length - 1;

  while (left <= right) {
    const mid = left + Math.floor((right - left) / 2);
    const cmp = comparePieceId(index[mid].id, pieceId);
    if (cmp === 0) return index[mid].offset;
    if (cmp < 0) left = mid + 1;
    else right = mid - 1;
  }

  return undefined;
}

// ─── Cross-tier Constants ───────────────────────────────────────────────────

/** Curve flattening resolution shared across CPU/WASM seam construction and GPU seam-pair extraction. MUST match across tiers (pair count parity invariant). */
export const SEAM_CURVE_RESOLUTION = 12;
/**
 * FALLBACK boundary-subdivision length (mm) for legacy callers that don't
 * declare the mesher's real value. `parameterizeEdge` reconstructs the CDT
 * mesher's boundary vertex NUMBERING — both sides must subdivide with the
 * SAME maxEdgeLength or every seam/elastic constraint addresses wrong mesh
 * vertices. Production meshes at `simulation.particleDistance` (default
 * 5mm), so consumers MUST thread that per-piece value via
 * `PieceSeamData.meshMaxEdgeLength`; this pinned 15 only remains as the
 * default for tests/tools that mesh at the historic value.
 *
 * (M4 camisa de María, paciente cero del drape: mesh a 5mm + costuras
 * reconstruidas a 15mm cosían spans comprimidos a ⅓ de cada edge — 260
 * constraints de producción uniendo vértices equivocados.)
 */
export const SEAM_MAX_EDGE_LENGTH = 15;

/**
 * Per-piece data consumed by seam/elastic constraint builders: semantic
 * edges for name→range resolution, plus the boundary-subdivision length the
 * MESHER actually used for this piece (see SEAM_MAX_EDGE_LENGTH docs).
 */
export interface PieceSeamData {
  edges?: Array<Pick<SemanticEdge, 'name' | 'segmentRange'>>;
  /** maxEdgeLength (mm) the CDT mesher subdivided this piece's boundary with. */
  meshMaxEdgeLength?: number;
  /**
   * Boundary provenance from the mesher (M4 — `ClothMeshData.boundaryOrig`):
   * original flattened-outline index per piece-local vertex (NaN interior).
   * When present, constraint builders address boundary vertices DIRECTLY
   * via `parameterizeEdgeFromBoundary` — the only correct option for real
   * patterns, where the mesher's dedupe (every piece), winding reversal
   * (CCW outlines) and Douglas-Peucker (dense outlines) make the legacy
   * `parameterizeEdge` reconstruction address wrong vertices.
   */
  boundaryOrig?: Float64Array;
}

// ─── Default Config ─────────────────────────────────────────────────────────

/**
 * Minimum seam rest-length floor (m) — borrow-plan A3. With today's fabric
 * library (0.1-1.2mm thickness) this 2mm minimum always dominates; the
 * fabric-thickness term in `computeSeamRestLengthFloor` is the knob for
 * thick fabrics (>4mm avg).
 */
export const SEAM_REST_LENGTH_FLOOR_MIN_M = 0.002;

/** Default seam constraint configuration. */
export const DEFAULT_SEAM_CONFIG: SeamConstraintConfig = {
  shrinkFactor: 0.97,
  sewedThreshold: 1e-6,
  restLengthFloor: SEAM_REST_LENGTH_FLOOR_MIN_M,
  // Una costura cosida es casi RÍGIDA (el hilo no estira): con 1e-4 el α
  // XPBD daba 81 (cada endpoint avanzaba ~1.2% de la violación por substep)
  // y la sisa se estancaba a 8-10cm contra la fricción del tubo sobre el
  // brazo — medido en vivo por la sonda seam-gap (2026-07-04; plateau desde
  // 0.5s, tether exonerado por A/B ON/OFF bit-idéntico). El ramp de decay
  // (el target arranca en la distancia actual y baja ×shrinkFactor) ya
  // protege del snap explosivo, así que la constraint final puede ser dura.
  // Jerarquía relativa entre tipos preservada (÷100 uniforme).
  compliance: {
    standard: 0.000001,
    french: 0.0000001,
    'flat-felled': 0.0000005,
    overlock: 0.000002,
  },
};

/**
 * Compute the scalar seam rest-length floor (m) for a seam set — A3 v1.
 *
 * Per-seam semantics: `max(2mm, (thicknessA + thicknessB) / 2)` where the
 * thicknesses (mm) come from each joined piece's `PhysicalFabric.thickness`
 * (B10-state: `project.pieces[].fabricId`, fallback default fabric — the
 * caller resolves that mapping into `thicknessMmByPieceId`). v1 is SCALAR:
 * the max over all active seams wins for the whole set; per-seam floors are
 * the named escalation, not built here.
 *
 * HONESTY (Serrano F6): the floor is the HYPOTHESIS fix for the seam
 * pull-through — the gate is Samuel's penetrationCount run (A1), and the
 * named escalation if it fails is body-aware midpoint projection (own spec).
 *
 * @param seams - worker-protocol seam entries (only pieceAId/pieceBId/active read)
 * @param thicknessMmByPieceId - pieceId → fabric thickness in MM (missing → 0)
 * @returns floor in METERS, never below SEAM_REST_LENGTH_FLOOR_MIN_M
 */
export function computeSeamRestLengthFloor(
  seams: ReadonlyArray<Pick<SeamInitData, 'pieceAId' | 'pieceBId' | 'active'>>,
  thicknessMmByPieceId: ReadonlyMap<string, number>,
): number {
  let floor = SEAM_REST_LENGTH_FLOOR_MIN_M;
  for (const s of seams) {
    if (s.active === false) continue;
    const tA = thicknessMmByPieceId.get(s.pieceAId) ?? 0;
    const tB = thicknessMmByPieceId.get(s.pieceBId) ?? 0;
    floor = Math.max(floor, (tA + tB) / 2 / 1000);
  }
  return floor;
}

// ─── Edge Parameterization ──────────────────────────────────────────────────

/**
 * Compute arc-length parameterized points from a sequence of 2D points.
 *
 * Returns normalized t values (0–1) for each input point based on cumulative
 * Euclidean distance along the polyline.
 *
 * @param points - Ordered 2D points along the edge
 * @returns Array of normalized arc-length parameters, one per point
 */
export function computeArcLengthParams(points: Point2D[]): number[] {
  if (points.length === 0) return [];
  if (points.length === 1) return [0];

  const cumLengths: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    cumLengths.push(cumLengths[i - 1] + Math.sqrt(dx * dx + dy * dy));
  }

  const totalLength = cumLengths[cumLengths.length - 1];
  if (totalLength === 0) return points.map(() => 0);

  return cumLengths.map(l => l / totalLength);
}

/**
 * Extract boundary vertices for a given edge segment of a pattern piece outline.
 * Subdivides edges according to maxEdgeLength to match the CDT mesher's output.
 *
 * @param outline - Pattern piece outline path commands
 * @param edgeStart - Start vertex index in the flattened outline
 * @param edgeEnd - End vertex index in the flattened outline
 * @param globalOffset - Offset to add to vertex indices for the merged mesh
 * @param curveResolution - Resolution for flattening curves
 * @param maxEdgeLength - Maximum allowed edge length before subdivision
 * @param reverse - Traverse the edge end→start (parity plan Fase 5,
 *   `Seam.pieceB.reversed`): vertex order is flipped and t is mirrored
 *   (t → 1−t), preserving the ascending-t invariant `matchVertices`
 *   requires. Any t-range filter applied downstream refers to the
 *   REVERSED parameterization.
 * @returns Array of parameterized vertices along the edge (ascending t)
 */
export function parameterizeEdge(
  outline: PathCommand[],
  edgeStart: number,
  edgeEnd: number,
  globalOffset: number = 0,
  curveResolution: number = SEAM_CURVE_RESOLUTION,
  maxEdgeLength: number = SEAM_MAX_EDGE_LENGTH,
  reverse: boolean = false,
): ParameterizedVertex[] {
  const flatPoints = flattenPath(outline, curveResolution);
  if (flatPoints.length === 0) return [];

  // 1. Calculate the global vertex index for each subdivided point in the WHOLE outline
  // This is how the CDT mesher numbers them.
  const allOutlineVertices: Array<{ x: number; y: number; originalIdx: number; isSubdivided: boolean }> = [];
  const pointToGlobalIdx = new Map<number, number>();

  for (let i = 0; i < flatPoints.length; i++) {
    const p1 = flatPoints[i];
    const p2 = flatPoints[(i + 1) % flatPoints.length];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const numSegments = dist <= maxEdgeLength ? 1 : Math.ceil(dist / maxEdgeLength);

    pointToGlobalIdx.set(i, allOutlineVertices.length);
    allOutlineVertices.push({ ...p1, originalIdx: i, isSubdivided: false });

    for (let s = 1; s < numSegments; s++) {
      const t = s / numSegments;
      allOutlineVertices.push({ 
        x: p1.x + dx * t, 
        y: p1.y + dy * t, 
        originalIdx: i, 
        isSubdivided: true 
      });
    }
  }

  // 2. Extract the range of global indices that correspond to the requested seam segment
  const seamVertices: ParameterizedVertex[] = [];
  let currentDist = 0;
  const distances: number[] = [0];

  // Determine the sequence of original points in the segment
  const segmentOriginalIndices: number[] = [];
  if (edgeEnd >= edgeStart) {
    for (let i = edgeStart; i <= edgeEnd; i++) segmentOriginalIndices.push(i);
  } else {
    for (let i = edgeStart; i < flatPoints.length; i++) segmentOriginalIndices.push(i);
    for (let i = 0; i <= edgeEnd; i++) segmentOriginalIndices.push(i);
  }

  // Collect all vertices (original and subdivided) for these segments
  for (let k = 0; k < segmentOriginalIndices.length; k++) {
    const origIdx = segmentOriginalIndices[k];
    const globalIdx = pointToGlobalIdx.get(origIdx)!;
    
    // Add the original point
    seamVertices.push({ index: globalIdx + globalOffset, t: 0 });

    // Add any subdivided points AFTER this point (if not at the very end of the seam)
    if (k < segmentOriginalIndices.length - 1) {
      let nextGlobalIdx = (globalIdx + 1) % allOutlineVertices.length;
      while (allOutlineVertices[nextGlobalIdx].isSubdivided) {
        seamVertices.push({ index: nextGlobalIdx + globalOffset, t: 0 });
        nextGlobalIdx = (nextGlobalIdx + 1) % allOutlineVertices.length;
      }
    }
  }

  // 3. Calculate T parameters (arc length) for the extracted vertices
  if (seamVertices.length > 1) {
    for (let i = 1; i < seamVertices.length; i++) {
      const p1 = allOutlineVertices[seamVertices[i - 1].index - globalOffset];
      const p2 = allOutlineVertices[seamVertices[i].index - globalOffset];
      const d = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
      currentDist += d;
      distances.push(currentDist);
    }
    const total = distances[distances.length - 1];
    for (let i = 0; i < seamVertices.length; i++) {
      seamVertices[i].t = total > 0 ? distances[i] / total : 0;
    }
  }

  if (reverse) {
    // Mirror the traversal: reverse vertex order (descending original t)
    // and map t → 1−t, which restores ascending t over the new order.
    seamVertices.reverse();
    for (const v of seamVertices) v.t = 1 - v.t;
  }

  return seamVertices;
}

// ─── Boundary-provenance parameterization (M4) ──────────────────────────────

/**
 * El rango [fs, fe] de un borde en el contorno aplanado, extendido sobre las copias exactas de sus puntas
 * (#1250 C1). En el DXF cada borde termina en un punto y el siguiente empieza en una copia; el mallador deja
 * una sola, con el origen de la primera, y sin esto la esquina entra solo en el borde que termina en ella.
 * `fe < fs` da la vuelta por el cierre. Un rango nunca da más de una vuelta al contorno.
 */
export function extenderSobreCopias(flat: ReadonlyArray<Point2D>, range: [number, number]): [number, number] {
  const N = flat.length;
  if (N < 2) return range;
  const punto = (k: number) => flat[((k % N) + N) % N];
  const cerca = (i: number, j: number) => {
    const p = punto(i), q = punto(j);
    return Math.hypot(p.x - q.x, p.y - q.y) <= TOLERANCIA_DE_DUPLICADOS;
  };
  let s = range[0];
  let e = range[1] < range[0] ? range[1] + N : range[1];
  while (s - 1 > e - N && cerca(s - 1, s)) s--;
  while (e + 1 < s + N && cerca(e + 1, e)) e++;
  return [((s % N) + N) % N, e % N];
}

/**
 * Parameterize an edge range directly from the mesher's boundary provenance
 * (`ClothMeshData.boundaryOrig`) instead of reconstructing the mesher's
 * numbering. Selects the piece's boundary vertices whose original outline
 * index falls inside `range` (wraparound supported), orders them along the
 * original traversal, and assigns t by cumulative arc length over their
 * REAL positions.
 *
 * @param boundaryOrig - per piece-local vertex: original flattened-outline
 *   index (fractional for subdivided points, NaN for interior vertices)
 * @param positions - flat xyz positions indexed by GLOBAL vertex id
 * @param vertexOffset - piece's vertex offset inside `positions`
 * @param flat - the piece's flattened outline: the same points the range indexes (#1250 C1)
 * @param range - [start, end] in flattened-outline index space (end may wrap)
 * @param reverse - traverse end→start (Seam.pieceB.reversed)
 */
export function parameterizeEdgeFromBoundary(
  boundaryOrig: ArrayLike<number>,
  positions: Float32Array,
  vertexOffset: number,
  flat: ReadonlyArray<Point2D>,
  range: [number, number],
  reverse: boolean = false,
): ParameterizedVertex[] {
  const [fs, fe] = extenderSobreCopias(flat, range);
  const N = flat.length;
  if (N <= 0) return [];
  const EPS = 1e-6;

  const wrapped = fe < fs;
  const selected: Array<{ local: number; d: number }> = [];
  for (let local = 0; local < boundaryOrig.length; local++) {
    const orig = boundaryOrig[local];
    if (!Number.isFinite(orig)) continue;
    const inRange = wrapped
      ? orig >= fs - EPS || orig <= fe + EPS
      : orig >= fs - EPS && orig <= fe + EPS;
    if (!inRange) continue;
    // Distance along the original traversal from the range start — sorts
    // correctly for wrapped ranges too. Un vértice hasta EPS ANTES del inicio (lo admite inRange) está a ~0, no
    // a N: un duplicado de la esquina cuyo origen redondea justo bajo el entero (la línea central de la tira de
    // María: 14,9999995) caía al final del borde y la tira "volvía" por toda su longitud (#1250 C1).
    let d = orig - fs;
    if (d < -EPS) d += N;
    selected.push({ local, d });
  }
  if (selected.length === 0) return [];
  selected.sort((a, b) => a.d - b.d || a.local - b.local);

  // t by cumulative arc length over real vertex positions.
  const verts: ParameterizedVertex[] = new Array(selected.length);
  const dists: number[] = new Array(selected.length);
  dists[0] = 0;
  let total = 0;
  for (let i = 1; i < selected.length; i++) {
    const a = (vertexOffset + selected[i - 1].local) * 3;
    const b = (vertexOffset + selected[i].local) * 3;
    total += Math.hypot(
      positions[b] - positions[a],
      positions[b + 1] - positions[a + 1],
      positions[b + 2] - positions[a + 2],
    );
    dists[i] = total;
  }
  for (let i = 0; i < selected.length; i++) {
    verts[i] = {
      index: vertexOffset + selected[i].local,
      t: total > 0 ? dists[i] / total : 0,
    };
  }

  if (reverse) {
    verts.reverse();
    for (const v of verts) v.t = 1 - v.t;
  }
  return verts;
}

// ─── Vertex Pairing ─────────────────────────────────────────────────────────

/**
 * Match vertices from two parameterized edges by closest arc-length parameter,
 * BIDIRECTIONALLY — every vertex on BOTH edges gets at least one pair.
 *
 * F2 (costura de proceso real): a single driver-side walk (shorter edge
 * drives) leaves the longer edge's surplus vertices with zero constraints —
 * physically, skipped stitches: those spans float held only by their own
 * piece (the shoulder "almendra" slit was exactly this). A real lockstitch
 * anchors every 2-3mm with no gaps, so we walk in both directions and union.
 * Where M≠N several vertices fan onto a shared partner — that is CLO-style
 * gathering, and the one-sided stretch limit absorbs the compression.
 *
 * Assumes both inputs are sorted by ascending `t` — an invariant produced by
 * `parameterizeEdge` (cumulative arc length). Each pass is a two-pointer
 * monotone walk: O(|edgeA| + |edgeB|) total. On exact ties in |t−t'| the
 * lower target index wins (strict-less-than, matches the legacy impl).
 *
 * Output is deduped by (indexA, indexB) and sorted by (tA, tB) —
 * `buildCrossSeamBendQuads` consumes consecutive-in-t pairs, so the union
 * of the two passes MUST be re-sorted before emission (two monotone walks
 * interleave when concatenated raw).
 *
 * @param edgeA - Parameterized vertices of edge A (ascending t)
 * @param edgeB - Parameterized vertices of edge B (ascending t)
 * @returns Array of [indexA, indexB] pairs, sorted by (tA, tB)
 */
export function matchVertices(
  edgeA: ParameterizedVertex[],
  edgeB: ParameterizedVertex[],
): Array<[number, number]> {
  if (edgeA.length === 0 || edgeB.length === 0) return [];

  const union = new Map<string, { a: number; b: number; tA: number; tB: number }>();

  const walk = (driver: ParameterizedVertex[], target: ParameterizedVertex[], driverIsA: boolean) => {
    const lastTargetIdx = target.length - 1;
    let j = 0;
    for (let i = 0; i < driver.length; i++) {
      const dv = driver[i];
      const dt = dv.t;
      while (j < lastTargetIdx && Math.abs(dt - target[j + 1].t) < Math.abs(dt - target[j].t)) {
        j++;
      }
      const tv = target[j];
      const av = driverIsA ? dv : tv;
      const bv = driverIsA ? tv : dv;
      const key = `${av.index},${bv.index}`;
      if (!union.has(key)) union.set(key, { a: av.index, b: bv.index, tA: av.t, tB: bv.t });
    }
  };

  walk(edgeA, edgeB, true);
  walk(edgeB, edgeA, false);

  return [...union.values()]
    .sort((p, q) => p.tA - q.tA || p.tB - q.tB)
    .map(p => [p.a, p.b] as [number, number]);
}

// ─── Multi-piece Mesh Merging ───────────────────────────────────────────────

/**
 * Merge multiple piece meshes into a single combined mesh with shared particle system.
 *
 * All vertex positions are concatenated into one Float32Array, triangle indices
 * are offset accordingly, and per-piece offset info is tracked for later use.
 *
 * @param pieces - Array of { pieceId, vertices (flat xyz), triIds, uvs? (flat uv) }
 * @returns Merged mesh with offset tracking
 */
export function mergeMeshes(
  pieces: Array<{ pieceId: string; vertices: Float32Array; triIds: Int32Array; uvs?: Float32Array }>,
): MergedMesh {
  const totalVerts = pieces.reduce((s, p) => s + p.vertices.length, 0);
  const totalTris = pieces.reduce((s, p) => s + p.triIds.length, 0);
  const hasUVs = pieces.every(p => p.uvs && p.uvs.length > 0);
  const totalUVs = hasUVs ? pieces.reduce((s, p) => s + (p.uvs?.length ?? 0), 0) : 0;

  const vertices = new Float32Array(totalVerts);
  const triIds = new Int32Array(totalTris);
  const uvs = hasUVs ? new Float32Array(totalUVs) : undefined;
  const offsets: PieceOffset[] = [];

  let vOff = 0; // float offset for vertices
  let tOff = 0; // int offset for triangles
  let uvOff = 0; // float offset for UVs

  for (const p of pieces) {
    const vertexOffset = vOff / 3;
    const vertexCount = p.vertices.length / 3;
    const triangleOffset = tOff / 3;
    const triangleCount = p.triIds.length / 3;

    vertices.set(p.vertices, vOff);
    for (let i = 0; i < p.triIds.length; i++) {
      triIds[tOff + i] = p.triIds[i] + vertexOffset;
    }

    // Merge UVs if available
    if (uvs && p.uvs) {
      uvs.set(p.uvs, uvOff);
      uvOff += p.uvs.length;
    }

    offsets.push({
      pieceId: p.pieceId,
      vertexOffset,
      vertexCount,
      triangleOffset,
      triangleCount,
    });

    vOff += p.vertices.length;
    tOff += p.triIds.length;
  }

  return { vertices, triIds, pieces: offsets, uvs };
}

// ─── Worker-shape conversion ────────────────────────────────────────────────

/**
 * Data needed to build seam constraints in a solver worker — the
 * worker-protocol counterpart of the domain `Seam` (flat ids instead of
 * nested halves, so it survives structured clone untouched).
 *
 * Lives here (not in clothWorker.ts) because this module owns the
 * conversion (`seamInitDataToSeams`) and is environment-neutral — the
 * worker files need DOM/worker libs and would drag them into every
 * consumer's program (e.g. bench/, lib ES2023-only). clothWorker
 * re-exports this type, so existing `from './clothWorker'` imports keep
 * working.
 */
export interface SeamInitData {
  id: string;
  pieceAId: string;
  pieceAEdgeName: string;
  pieceBId: string;
  pieceBEdgeName: string;
  type: 'standard' | 'french' | 'flat-felled' | 'overlock';
  /** t-parameter range on piece A side (partial-edge sewing) */
  pieceARange?: [number, number];
  /** t-parameter range on piece B side (partial-edge sewing) */
  pieceBRange?: [number, number];
  /**
   * Sewing direction of the B half relative to A (parity plan Fase 5,
   * mirrors `Seam.pieceB.reversed`). When true, B's edge is traversed
   * end→start during vertex matching. Undefined = false.
   */
  pieceBReversed?: boolean;
  /** Tension applied to seam (0-200, default 100) */
  tension: number;
  /** Strength of the seam bond (0-1, default 1.0) */
  strength: number;
  /** Proveniencia (Seam.createdBy) — solo para el COLOR de las seam lines
   *  sobre el drape (seamThreadColor: IA pálida / humano pleno). Los solvers
   *  la ignoran. */
  createdBy?: 'ai' | 'human';
  /** Whether this seam participates in simulation */
  active: boolean;
  /** Whether seam tape is applied */
  taped: boolean;
}

/**
 * Convert worker-protocol `SeamInitData[]` to the domain `Seam[]` shape
 * `buildSeamConstraints` consumes. THE single canonical mapping, used by
 * BOTH solver workers (clothWorker + wasmSolverWorker).
 *
 * History (parity plan Fase 5): the CPU worker carried two inline copies of
 * this mapping; the WASM worker had NONE and passed `msg.seams`
 * (SeamInitData) straight into `buildSeamConstraints`, which reads
 * `seam.pieceA.pieceId` → TypeError on init whenever seams existed → the
 * cascade silently fell back to the CPU tier. Centralizing the mapping
 * fixes the WASM crash and gives `pieceBReversed` one home.
 *
 * Inactive seams are filtered (the worker convention both call sites had).
 */
export function seamInitDataToSeams(seamData: SeamInitData[]): Seam[] {
  return seamData
    .filter(s => s.active !== false)
    .map(s => ({
      id: s.id,
      pieceA: { pieceId: s.pieceAId, edgeName: s.pieceAEdgeName, tStart: s.pieceARange?.[0], tEnd: s.pieceARange?.[1] },
      pieceB: {
        pieceId: s.pieceBId,
        edgeName: s.pieceBEdgeName,
        tStart: s.pieceBRange?.[0],
        tEnd: s.pieceBRange?.[1],
        reversed: s.pieceBReversed === true,
      },
      type: s.type,
      tension: s.tension ?? 100,
      strength: s.strength ?? 1.0,
      active: true,
      taped: s.taped ?? false,
      tapeWidth: 10,
    }));
}

// ─── Seam Constraint Generation ─────────────────────────────────────────────

/**
 * Build seam constraints from a list of seams, outlines, and a merged mesh.
 *
 * For each seam, resolves edge names to segment ranges using piece edge data,
 * parameterizes both edges, matches vertices, and creates XPBD distance
 * constraints that will pull the pairs together.
 *
 * @param seams - Seam definitions (edge-name based)
 * @param outlines - Map of pieceId → outline PathCommand[]
 * @param mergedMesh - The merged mesh (needed for piece offsets and positions)
 * @param pieces - Optional map of pieceId → { edges } for resolving edge names to segment ranges
 * @param config - Optional seam constraint configuration
 * @returns SeamConstraintSet ready for the solver
 */
export function buildSeamConstraints(
  seams: Seam[],
  outlines: Map<string, PathCommand[]>,
  mergedMesh: MergedMesh,
  pieces?: Map<string, PieceSeamData>,
  config: SeamConstraintConfig = DEFAULT_SEAM_CONFIG,
): SeamConstraintSet {
  const allPairs: Array<{ idA: number; idB: number; compliance: number; tension: number }> = [];
  const positions = mergedMesh.vertices;
  const pieceOffsetsIndex: PieceOffsetIndexEntry[] = mergedMesh.pieces
    .map((offset) => ({ id: offset.pieceId, offset }))
    .sort((a, b) => comparePieceId(a.id, b.id));

  for (const seam of seams) {
    // Skip inactive seams
    if (seam.active === false) continue;

    const outlineA = outlines.get(seam.pieceA.pieceId);
    const outlineB = outlines.get(seam.pieceB.pieceId);
    if (!outlineA || !outlineB) continue;

    const offsetA = findPieceOffsetById(pieceOffsetsIndex, seam.pieceA.pieceId);
    const offsetB = findPieceOffsetById(pieceOffsetsIndex, seam.pieceB.pieceId);
    if (!offsetA || !offsetB) continue;

    // Resolve edge names to segment ranges (semantic lookup + "edge-N" fallback)
    const pieceAData = pieces?.get(seam.pieceA.pieceId);
    const pieceBData = pieces?.get(seam.pieceB.pieceId);
    const semanticA = pieceAData?.edges?.find(e => e.name === seam.pieceA.edgeName);
    const semanticB = pieceBData?.edges?.find(e => e.name === seam.pieceB.edgeName);

    // Semantic ranges live in COMMAND space ([start, end) over the
    // PathCommand array — the detectSemanticEdges contract). Convert at
    // this boundary to the flattened-point space parameterizeEdge consumes
    // (Fase 3 / BP-3): every C/Q command expands to SEAM_CURVE_RESOLUTION
    // points, so indexing command ranges into the flattened array sewed
    // the wrong vertices on any piece with curves.
    let rangeA: [number, number] | undefined = semanticA
      ? commandRangeToFlattened(outlineA, semanticA.segmentRange, SEAM_CURVE_RESOLUTION)
      : undefined;
    let rangeB: [number, number] | undefined = semanticB
      ? commandRangeToFlattened(outlineB, semanticB.segmentRange, SEAM_CURVE_RESOLUTION)
      : undefined;

    // Fallback: legacy "edge-N" names a COMMAND index (the resolveEdgeName
    // producer contract — see edgeNToCommandIndex), converted through the
    // same boundary as a semantic range. This used to index the FLATTENED
    // outline with N instead, which sewed a mid-curve micro-segment on any
    // curved piece and disagreed with SeamRenderer's reading.
    if (!rangeA) {
      const cmdIdx = edgeNToCommandIndex(outlineA, seam.pieceA.edgeName);
      if (cmdIdx !== null) {
        rangeA = commandRangeToFlattened(outlineA, [cmdIdx, cmdIdx + 1], SEAM_CURVE_RESOLUTION);
      }
    }
    if (!rangeB) {
      const cmdIdx = edgeNToCommandIndex(outlineB, seam.pieceB.edgeName);
      if (cmdIdx !== null) {
        rangeB = commandRangeToFlattened(outlineB, [cmdIdx, cmdIdx + 1], SEAM_CURVE_RESOLUTION);
      }
    }

    if (!rangeA || !rangeB) continue;

    // Boundary resolution (M4): prefer the mesher's provenance
    // (boundaryOrig) — the legacy reconstruction silently addresses wrong
    // vertices on real patterns (dedupe/winding/simplify). The legacy path
    // remains for synthetic meshes built without the CDT mesher, where the
    // per-piece meshMaxEdgeLength contract still holds.
    // Direction (Fase 5): the B half may be reversed relative to A —
    // both paths mirror t so matching pairs A:t=0 with B:t=1.
    const reversedB = seam.pieceB.reversed === true;
    let edgeA = pieceAData?.boundaryOrig
      ? parameterizeEdgeFromBoundary(
          pieceAData.boundaryOrig, positions, offsetA.vertexOffset,
          flattenPath(outlineA, SEAM_CURVE_RESOLUTION), rangeA,
        )
      : parameterizeEdge(
          outlineA, rangeA[0], rangeA[1], offsetA.vertexOffset,
          SEAM_CURVE_RESOLUTION, pieceAData?.meshMaxEdgeLength ?? SEAM_MAX_EDGE_LENGTH,
        );
    let edgeB = pieceBData?.boundaryOrig
      ? parameterizeEdgeFromBoundary(
          pieceBData.boundaryOrig, positions, offsetB.vertexOffset,
          flattenPath(outlineB, SEAM_CURVE_RESOLUTION), rangeB, reversedB,
        )
      : parameterizeEdge(
          outlineB, rangeB[0], rangeB[1], offsetB.vertexOffset,
          SEAM_CURVE_RESOLUTION, pieceBData?.meshMaxEdgeLength ?? SEAM_MAX_EDGE_LENGTH, reversedB,
        );

    // Apply t-range filtering: restrict parameterized vertices to the sub-range,
    // then RENORMALIZE t to the sub-range (renormalizeFilteredT — sin esto los
    // rangos asimétricos no stretch-mapean; espejo GPU en seamPairs.ts).
    if (seam.pieceA.tStart != null && seam.pieceA.tEnd != null) {
      edgeA = renormalizeFilteredT(
        edgeA.filter(v => v.t >= seam.pieceA.tStart! && v.t <= seam.pieceA.tEnd!),
        seam.pieceA.tStart, seam.pieceA.tEnd,
      );
    }
    if (seam.pieceB.tStart != null && seam.pieceB.tEnd != null) {
      edgeB = renormalizeFilteredT(
        edgeB.filter(v => v.t >= seam.pieceB.tStart! && v.t <= seam.pieceB.tEnd!),
        seam.pieceB.tStart, seam.pieceB.tEnd,
      );
    }

    const pairs = matchVertices(edgeA, edgeB);

    // Compute per-seam compliance: base compliance adjusted by strength and tape
    const baseCompliance = config.compliance[seam.type];
    const seamCompliance = (baseCompliance / (seam.strength ?? 1.0)) * (seam.taped ? 0.1 : 1.0);

    // Tension factor: 100 = normal, <100 = gathering, >100 = easing
    const tension = seam.tension ?? 100;

    for (const [idA, idB] of pairs) {
      allPairs.push({ idA, idB, compliance: seamCompliance, tension });
    }
  }

  const count = allPairs.length;
  const ids = new Int32Array(count * 2);
  const restLengths = new Float32Array(count);
  const compliances = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const { idA, idB, compliance, tension } = allPairs[i];
    ids[2 * i] = idA;
    ids[2 * i + 1] = idB;

    // Initial rest length = current distance, modified by tension
    const ai = idA * 3;
    const bi = idB * 3;
    const dx = positions[ai] - positions[bi];
    const dy = positions[ai + 1] - positions[bi + 1];
    const dz = positions[ai + 2] - positions[bi + 2];
    const currentDist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    // tension=100 → restLength = currentDist (normal)
    // tension<100 → restLength < currentDist (gathering / pulling tighter)
    // tension>100 → restLength > currentDist (easing / allowing slack)
    restLengths[i] = currentDist * (tension / 100);

    compliances[i] = compliance;
  }

  return { ids, restLengths, compliances, count, config };
}

// ─── XPBD Seam Constraint Solver ────────────────────────────────────────────

/**
 * Solve seam constraints for one substep using XPBD projection.
 *
 * Applies distance constraints between paired vertices, gradually shrinking
 * rest lengths toward zero to "sew" pieces together.
 *
 * Uses the same XPBD distance constraint math as the stretching solver:
 * `Δx = -C / (w0 + w1 + α) * w_i * gradient`
 *
 * @param positions - Current particle positions (modified in place)
 * @param invMass - Inverse mass per particle
 * @param seamSet - The seam constraint set
 * @param sdt - Substep delta time
 */
export function solveSeamConstraints(
  positions: Float32Array,
  invMass: Float32Array,
  seamSet: SeamConstraintSet,
  sdt: number,
): void {
  // Shrink rest lengths — clamped at the rest-length floor (A3): the
  // terminal target is fabric-thickness spacing, NOT literal 0 (snap-to-0
  // dragged armscye seam midpoints through the body). sewedThreshold
  // lower-bounds the floor so a floor of 0 degrades to the legacy near-zero
  // snap. Mirrors Rust `solve_seams` and the GPU seam kernel.
  const floor = Math.max(seamSet.config.restLengthFloor, seamSet.config.sewedThreshold);
  for (let i = 0; i < seamSet.count; i++) {
    if (seamSet.restLengths[i] > floor) {
      seamSet.restLengths[i] = Math.max(seamSet.restLengths[i] * seamSet.config.shrinkFactor, floor);
    }
  }

  // Solve distance constraints
  for (let i = 0; i < seamSet.count; i++) {
    const id0 = seamSet.ids[2 * i];
    const id1 = seamSet.ids[2 * i + 1];

    const w0 = invMass[id0];
    const w1 = invMass[id1];
    const w = w0 + w1;
    if (w === 0) continue;

    const alpha = seamSet.compliances[i] / (sdt * sdt);

    const i0 = id0 * 3;
    const i1 = id1 * 3;
    const dx = positions[i0] - positions[i1];
    const dy = positions[i0 + 1] - positions[i1 + 1];
    const dz = positions[i0 + 2] - positions[i1 + 2];
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len === 0) continue;

    const restLen = seamSet.restLengths[i];
    const C = len - restLen;
    const s = -C / (w + alpha);
    const nx = dx / len;
    const ny = dy / len;
    const nz = dz / len;

    positions[i0] += s * w0 * nx;
    positions[i0 + 1] += s * w0 * ny;
    positions[i0 + 2] += s * w0 * nz;
    positions[i1] -= s * w1 * nx;
    positions[i1 + 1] -= s * w1 * ny;
    positions[i1 + 2] -= s * w1 * nz;
  }
}

/**
 * Check if all seam constraints are fully sewn (rest length at the floor).
 *
 * A3: sewn means `restLength <= restLengthFloor + sewedThreshold` (the
 * threshold is the epsilon) — the terminal target is the floor, not 0.
 *
 * @param seamSet - The seam constraint set
 * @returns true if all constraints are within epsilon of the floor
 */
export function isFullySewn(seamSet: SeamConstraintSet): boolean {
  const floor = Math.max(seamSet.config.restLengthFloor, seamSet.config.sewedThreshold);
  for (let i = 0; i < seamSet.count; i++) {
    if (seamSet.restLengths[i] > floor + seamSet.config.sewedThreshold) {
      return false;
    }
  }
  return true;
}
