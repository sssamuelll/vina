/**
 * simSeamLineData — pure geometry-prep for seam connection lines over the
 * SIMULATED garment (post-ship plan R2, #880).
 *
 * For each active seam, resolves the matched vertex PAIRS the solver
 * actually sews (same `seamInitDataToPairs` resolution as the GPU tier and
 * the Fase 4 observability summary), converts piece-LOCAL indices to
 * GLOBAL merged-mesh indices via prefix-sum offsets (the `mergeMeshes`
 * order contract), subsamples for legibility, and assigns the seam's
 * stable pair color (Fase 6 `seamPairColor` — identity, same language as
 * the 2D canvas).
 *
 * The per-frame position lookup happens in the consuming component
 * (`SimSeamLines`), which reads `positionsRef.current[globalIdx * 3 + k]`
 * fresh each frame — this module computes only the frame-invariant part.
 */

import type { SeamInitData } from '../../utils/cloth/seamAssembly';
import { seamInitDataToPairs, type PieceWithOutline } from '../../utils/cloth/seamPairs';
import { seamThreadColor } from '../../utils/colors/seamPalette';

export interface SimSeamPieceMesh extends PieceWithOutline {
  vertices: Float32Array;
}

export interface SimSeamLineData {
  /** Global merged-mesh vertex indices, flattened [a0, b0, a1, b1, ...]. */
  vertexIndices: Uint32Array;
  /** Per-LINE-VERTEX rgb colors (2 vertices per line), length = lines * 2 * 3. */
  colors: Float32Array;
  /** Number of line segments. */
  lineCount: number;
}

/** Max connection lines drawn per seam (CLO3D-like legibility, not density). */
export const MAX_LINES_PER_SEAM = 16;

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ];
}

/**
 * Build the frame-invariant line data for all active seams.
 *
 * Returns null when nothing resolves (no seams, no pieces, or every seam
 * unresolvable — the Fase 4 toast/overlay already reports that case).
 */
export function buildSimSeamLineData(
  seamInitData: SeamInitData[],
  pieces: SimSeamPieceMesh[],
  maxLinesPerSeam: number = MAX_LINES_PER_SEAM,
): SimSeamLineData | null {
  if (seamInitData.length === 0 || pieces.length === 0) return null;

  // Prefix-sum vertex offsets in pieces array order — the mergeMeshes /
  // worker init order contract (globalIdx = offset(pieceId) + localIdx).
  const offsets = new Map<string, number>();
  let acc = 0;
  for (const p of pieces) {
    offsets.set(p.pieceId, acc);
    acc += p.vertices.length / 3;
  }
  const totalVerts = acc;

  const idx: number[] = [];
  const rgb: number[] = [];

  for (const seam of seamInitData) {
    if (seam.active === false) continue;

    // Per-seam call keeps the seam id ↔ pairs association without a new
    // export (seamInitDataToPairs skips unresolvable seams silently-loud).
    const resolved = seamInitDataToPairs([seam], pieces);
    if (resolved.length === 0) continue;
    const { pieceAId, pieceBId, vertexPairs } = resolved[0];

    const offA = offsets.get(pieceAId);
    const offB = offsets.get(pieceBId);
    if (offA === undefined || offB === undefined) continue;

    // Subsample evenly, ALWAYS including first and last pair so the
    // extremes (where a crossed seam reads as an X) are never dropped.
    const n = vertexPairs.length;
    const step = Math.max(1, Math.ceil(n / maxLinesPerSeam));
    const sampled: Array<[number, number]> = [];
    for (let i = 0; i < n; i += step) sampled.push(vertexPairs[i]);
    const last = vertexPairs[n - 1];
    const lastSampled = sampled[sampled.length - 1];
    if (lastSampled[0] !== last[0] || lastSampled[1] !== last[1]) sampled.push(last);

    // Unificado 2026-07-05: seamThreadColor (identidad hash-estable +
    // proveniencia como saturación) — el mismo hue que los hilos de arrange
    // y las polylines de borde, para que TODO lo de una costura se lea junto.
    // (Antes seamPairColor, el lenguaje del canvas 2D — divergencia retirada.)
    const [r, g, b] = hexToRgb(seamThreadColor(seam.id, seam.createdBy));
    for (const [la, lb] of sampled) {
      const ga = offA + la;
      const gb = offB + lb;
      // Defensive: a stale pair pointing past the merged buffer would read
      // garbage positions every frame — skip it instead.
      if (ga >= totalVerts || gb >= totalVerts) continue;
      idx.push(ga, gb);
      rgb.push(r, g, b, r, g, b);
    }
  }

  if (idx.length === 0) return null;

  return {
    vertexIndices: new Uint32Array(idx),
    colors: new Float32Array(rgb),
    lineCount: idx.length / 2,
  };
}

/**
 * Polyline del BORDE de cada costura sobre el garment simulado (paridad
 * CLO3D, 2026-07-05): la línea continua que recorre el lado A de los pares
 * cosidos — con la costura cerrada (piso 2mm) esto ES la línea de costura
 * sobre la prenda, como CLO3D la dibuja.
 *
 * Orden garantizado: `matchVertices` emite los pares en t ascendente en
 * AMBOS lados (invariante documentada en seamAssembly; `reversed` restaura
 * el orden con reverse+1−t), así que encadenar índices consecutivos del
 * lado A produce la polyline del borde sin reordenar. Cuando B es el driver
 * el índice A puede repetirse en pares consecutivos — se deduplica (si no,
 * segmentos de longitud cero).
 *
 * SIN subsample: ~600 puntos en toda la prenda — trivial (<0.05ms/frame).
 */
export function buildSeamEdgePolylineData(
  seamInitData: SeamInitData[],
  pieces: SimSeamPieceMesh[],
): SimSeamLineData | null {
  if (seamInitData.length === 0 || pieces.length === 0) return null;

  const offsets = new Map<string, number>();
  let acc = 0;
  for (const p of pieces) {
    offsets.set(p.pieceId, acc);
    acc += p.vertices.length / 3;
  }
  const totalVerts = acc;

  const idx: number[] = [];
  const rgb: number[] = [];

  for (const seam of seamInitData) {
    if (seam.active === false) continue;

    const resolved = seamInitDataToPairs([seam], pieces);
    if (resolved.length === 0) continue;
    const { pieceAId, vertexPairs } = resolved[0];

    const offA = offsets.get(pieceAId);
    if (offA === undefined) continue;

    // Cadena de índices globales del lado A, dedup de consecutivos.
    const chain: number[] = [];
    for (const [la] of vertexPairs) {
      const ga = offA + la;
      if (ga >= totalVerts) continue; // guard defensivo (mismo criterio de arriba)
      if (chain.length === 0 || chain[chain.length - 1] !== ga) chain.push(ga);
    }
    if (chain.length < 2) continue;

    const [r, g, b] = hexToRgb(seamThreadColor(seam.id, seam.createdBy));
    for (let k = 0; k + 1 < chain.length; k++) {
      idx.push(chain[k], chain[k + 1]);
      rgb.push(r, g, b, r, g, b);
    }
  }

  if (idx.length === 0) return null;

  return {
    vertexIndices: new Uint32Array(idx),
    colors: new Float32Array(rgb),
    lineCount: idx.length / 2,
  };
}

/**
 * Copia por-frame: llena `out` (posiciones de línea, 3 floats por vértice)
 * leyendo `positions` por índice global. Devuelve si algo entró (visible).
 * Extraída pura para testear sin R3F (antes vivía inline en SimSeamLines).
 */
export function fillSeamLinePositions(
  out: Float32Array,
  vertexIndices: Uint32Array,
  positions: ArrayLike<number>,
): boolean {
  let visible = false;
  for (let i = 0; i < vertexIndices.length; i++) {
    const v = vertexIndices[i] * 3;
    if (v + 2 < positions.length) {
      out[i * 3] = positions[v];
      out[i * 3 + 1] = positions[v + 1];
      out[i * 3 + 2] = positions[v + 2];
      visible = true;
    }
  }
  return visible;
}
