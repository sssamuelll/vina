/**
 * outlineAnalysis — discrete-curvature anatomy of pattern outlines
 * (camisa de María plan, M1 — docs/plans/2026-06-12-maria-shirt-plan.md).
 *
 * Real CAD exports (DXF AC1009) deliver curves as DENSE POLYLINES of `L`
 * commands — there are no C/Q Béziers to inspect. Probes on María's shirt
 * (2026-06-12) showed the signal is surgically clean anyway: smooth curve
 * sampling turns ≤5° per vertex while true pattern corners turn >60°, with
 * NO population in between. This module exploits that: it segments an
 * outline at corner clusters into anatomical TRAMS and measures each
 * tram's real curvature (signed sagitta), which is what lets a neckline,
 * an armhole or a sleeve cap be recognized GEOMETRICALLY — independent of
 * command types and of piece naming.
 *
 * Trams carry their range in COMMAND space (`cmdRange`, the
 * `SemanticEdge.segmentRange` producer contract per parity-plan Fase 3) so
 * downstream consumers keep converting at the canonical boundary
 * (`commandRangeToFlattened`).
 */

import type { PathCommand } from '../types/types';
import { flattenPathWithSource, type SourcedPoint } from './seam/index';

// ─── Calibration (probed against María's pattern, 2026-06-12) ───────────────

/** Vertices closer than this are duplicates (CAD exports emit them). */
const DEDUPE_EPS_MM = 0.05;
/** |turning angle| above this marks a corner candidate (probe: 15-60° all equivalent). */
const CORNER_DEG = 30;
/** Corner candidates within this arc distance merge into one cluster. */
const CORNER_CLUSTER_MM = 6;
/** Minimum tram arc length — shorter trams merge into a neighbor. */
const MIN_TRAM_MM = 4;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface OutlinePoint { x: number; y: number }

export interface OutlineTram {
  /** Inclusive point-index range over `points` (may wrap past the end). */
  startPt: number;
  endPt: number;
  /** [start, end) over the source PathCommand array — SemanticEdge.segmentRange space. */
  cmdRange: [number, number];
  /** Polyline of the tram in walk order. */
  pts: OutlinePoint[];
  arcLength: number;
  chordLength: number;
  /**
   * Max perpendicular deviation from the chord, SIGNED:
   * positive = bows away from the piece interior (convex bump, e.g. sleeve cap),
   * negative = bows into the piece (concave notch, e.g. neckline, armhole).
   */
  sagitta: number;
  /** |sagitta| / chordLength — dimensionless curvature depth (0 = straight). */
  bowRatio: number;
  /** Mean travel direction in degrees (atan2, -180..180). */
  meanAngle: number;
  /** Tram midpoint relative to the outline bbox (0..1 each). */
  relX: number;
  relY: number;
}

export interface OutlineAnalysis {
  /** Deduped closed loop (no repeated closing point). */
  points: OutlinePoint[];
  /** Parallel array: source command index per point. */
  pointCmd: number[];
  bbox: { minX: number; minY: number; width: number; height: number };
  /** +1 if signed area positive (counter-clockwise in math axes), else -1. */
  orientation: 1 | -1;
  /** Point indices of corner clusters (representative = sharpest of cluster). */
  corners: number[];
  trams: OutlineTram[];
}

// ─── Core ────────────────────────────────────────────────────────────────────

function dedupe(src: SourcedPoint[]): {
  points: OutlinePoint[];
  pointCmd: number[];
  /** Command of the dropped closing duplicate (explicit closing L / Z point). */
  closingCmd: number | null;
} {
  const points: OutlinePoint[] = [];
  const pointCmd: number[] = [];
  for (const p of src) {
    const last = points[points.length - 1];
    if (last && Math.hypot(p.x - last.x, p.y - last.y) < DEDUPE_EPS_MM) continue;
    points.push({ x: p.x, y: p.y });
    pointCmd.push(p.cmd);
  }
  // Drop the closing duplicate, RETAINING its command: the closing SEGMENT
  // (last point → point 0) belongs to that command (an explicit closing L
  // keeps its own index; a Z-emitted point carries the M's index 0 — the
  // Fase 3 lore).
  let closingCmd: number | null = null;
  if (points.length > 1) {
    const a = points[0];
    const b = points[points.length - 1];
    if (Math.hypot(a.x - b.x, a.y - b.y) < DEDUPE_EPS_MM) {
      points.pop();
      closingCmd = pointCmd.pop()!;
    }
  }
  return { points, pointCmd, closingCmd };
}

function signedArea(points: OutlinePoint[]): number {
  let a = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const q = points[(i + 1) % points.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

/** Turning angle at each vertex in degrees, normalized to (-180, 180]. */
function turningAngles(points: OutlinePoint[]): number[] {
  const n = points.length;
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const a = points[(i - 1 + n) % n];
    const b = points[i];
    const c = points[(i + 1) % n];
    const v1 = Math.atan2(b.y - a.y, b.x - a.x);
    const v2 = Math.atan2(c.y - b.y, c.x - b.x);
    let d = ((v2 - v1) * 180) / Math.PI;
    while (d > 180) d -= 360;
    while (d <= -180) d += 360;
    out[i] = d;
  }
  return out;
}

function arcBetween(points: OutlinePoint[], from: number, to: number): number {
  const n = points.length;
  let acc = 0;
  for (let i = from; i !== to; i = (i + 1) % n) {
    const p = points[i];
    const q = points[(i + 1) % n];
    acc += Math.hypot(q.x - p.x, q.y - p.y);
  }
  return acc;
}

/**
 * Detect corners and merge adjacent candidates into clusters. CAD exports
 * produce both genuine double-corners and tiny notch steps; clustering by
 * arc distance keeps one representative (the sharpest turn) per feature.
 */
function detectCorners(points: OutlinePoint[], turns: number[]): number[] {
  const n = points.length;
  const candidates: number[] = [];
  for (let i = 0; i < n; i++) {
    if (Math.abs(turns[i]) > CORNER_DEG) candidates.push(i);
  }
  if (candidates.length === 0) return [];

  // Cluster by arc proximity (wrapping).
  const clusters: number[][] = [[candidates[0]]];
  for (let k = 1; k < candidates.length; k++) {
    const prev = candidates[k - 1];
    const cur = candidates[k];
    if (arcBetween(points, prev, cur) <= CORNER_CLUSTER_MM) {
      clusters[clusters.length - 1].push(cur);
    } else {
      clusters.push([cur]);
    }
  }
  // Wrap join: last cluster may continue into the first.
  if (clusters.length > 1) {
    const first = clusters[0];
    const last = clusters[clusters.length - 1];
    if (arcBetween(points, last[last.length - 1], first[0]) <= CORNER_CLUSTER_MM) {
      clusters[0] = [...last, ...first];
      clusters.pop();
    }
  }

  return clusters.map(cluster =>
    cluster.reduce((best, i) => (Math.abs(turns[i]) > Math.abs(turns[best]) ? i : best), cluster[0]),
  ).sort((a, b) => a - b);
}

function buildTram(
  points: OutlinePoint[],
  segCmds: number[],
  bbox: OutlineAnalysis['bbox'],
  orientation: 1 | -1,
  startPt: number,
  endPt: number,
): OutlineTram {
  const n = points.length;
  const pts: OutlinePoint[] = [];
  const cmds: number[] = [];
  for (let i = startPt; ; i = (i + 1) % n) {
    pts.push(points[i]);
    if (i !== endPt) cmds.push(segCmds[i]); // cmd of segment (i → i+1)
    if (i === endPt) break;
  }

  let arcLength = 0;
  for (let i = 1; i < pts.length; i++) {
    arcLength += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }
  const a = pts[0];
  const b = pts[pts.length - 1];
  const chordLength = Math.hypot(b.x - a.x, b.y - a.y);

  // Signed max deviation from the chord. Cross sign tells the side; the
  // outline orientation tells which side is the interior: walking the
  // boundary with orientation o, the interior lies where the shoelace says
  // it does — a point on the interior side of the chord = concave (−).
  let sagitta = 0;
  if (chordLength > 1e-6) {
    const ux = (b.x - a.x) / chordLength;
    const uy = (b.y - a.y) / chordLength;
    for (let i = 1; i < pts.length - 1; i++) {
      const px = pts[i].x - a.x;
      const py = pts[i].y - a.y;
      const cross = ux * py - uy * px; // + = left of travel
      // Interior is to the LEFT of travel when orientation=+1 (positive
      // signed area), to the RIGHT when -1.
      const interiorSide = orientation;
      const signed = cross * interiorSide > 0 ? -Math.abs(cross) : Math.abs(cross);
      if (Math.abs(signed) > Math.abs(sagitta)) sagitta = signed;
    }
  }

  let sx = 0, sy = 0, weight = 0;
  let angSinSum = 0, angCosSum = 0;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i - 1].x;
    const dy = pts[i].y - pts[i - 1].y;
    const len = Math.hypot(dx, dy);
    sx += ((pts[i].x + pts[i - 1].x) / 2) * len;
    sy += ((pts[i].y + pts[i - 1].y) / 2) * len;
    weight += len;
    const ang = Math.atan2(dy, dx);
    angSinSum += Math.sin(ang) * len;
    angCosSum += Math.cos(ang) * len;
  }
  const midX = weight > 0 ? sx / weight : a.x;
  const midY = weight > 0 ? sy / weight : a.y;

  // Command range [start, end) over the SEGMENTS of this tram. Segments
  // partition cleanly across trams (no corner overlap). A Z-closure segment
  // carries cmd 0 (the M tag, Fase 3 lore) — unaddressable as a draw
  // command, so it is excluded when other commands exist.
  const drawCmds = cmds.filter(c => c !== 0);
  const rangeCmds = drawCmds.length > 0 ? drawCmds : cmds;
  const cmdStart = Math.min(...rangeCmds);
  const cmdEnd = Math.max(...rangeCmds) + 1;

  return {
    startPt,
    endPt,
    cmdRange: [cmdStart, cmdEnd],
    pts,
    arcLength,
    chordLength,
    sagitta,
    bowRatio: chordLength > 1e-6 ? Math.abs(sagitta) / chordLength : 0,
    meanAngle: (Math.atan2(angSinSum, angCosSum) * 180) / Math.PI,
    relX: bbox.width > 0 ? (midX - bbox.minX) / bbox.width : 0.5,
    relY: bbox.height > 0 ? (midY - bbox.minY) / bbox.height : 0.5,
  };
}

/**
 * Índices de COMANDO de las esquinas reales del contorno — los vértices donde
 * el trazo dobla de verdad (|giro| > CORNER_DEG), no las muestras de una curva.
 *
 * La distinción no es cosmética: un DXF entrega las curvas como polilíneas
 * densas de `L`, así que "es un comando `L`" no dice nada sobre si el usuario
 * dibujó ahí una esquina. Medido sobre el patrón de producción de María, sus
 * curvas muestrean a ≤5° por vértice y sus esquinas doblan >60°, sin población
 * intermedia (la calibración de la cabecera de este módulo).
 *
 * A diferencia de `analyzeOutline().corners`, esto NO añade el corte implícito
 * en el punto 0 ni cae al fallback de "los dos giros más marcados": aquí la
 * pregunta es si un vértice es una esquina, y el arranque del contorno no lo es
 * por serlo. Un contorno sin esquinas (una elipse) devuelve el conjunto vacío,
 * que es la respuesta honesta.
 */
export function detectCornerCommands(outline: PathCommand[]): Set<number> {
  const { points, pointCmd } = dedupe(flattenPathWithSource(outline));
  if (points.length < 3) return new Set();
  const turns = turningAngles(points);
  return new Set(detectCorners(points, turns).map(i => pointCmd[i]));
}

/**
 * Analyze a pattern outline: dedupe → corners → anatomical trams with real
 * curvature. Works identically for dense polylines (real CAD) and sparse
 * synthetic outlines with C/Q curves (which flatten first).
 */
export function analyzeOutline(outline: PathCommand[]): OutlineAnalysis | null {
  const flat = flattenPathWithSource(outline);
  const { points, pointCmd, closingCmd } = dedupe(flat);
  if (points.length < 3) return null;

  // Command per SEGMENT (point i → point i+1). flattenPathWithSource tags
  // each point with the command that produced it, and the segment leading
  // TO a point belongs to that point's command. The closing segment
  // (n-1 → 0) belongs to the dropped closing duplicate's command.
  const nPts = points.length;
  const segCmds = new Array<number>(nPts);
  for (let i = 0; i < nPts - 1; i++) segCmds[i] = pointCmd[i + 1];
  segCmds[nPts - 1] = closingCmd ?? pointCmd[0];

  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const bbox = { minX, minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY };

  const orientation: 1 | -1 = signedArea(points) >= 0 ? 1 : -1;
  const turns = turningAngles(points);
  let corners = detectCorners(points, turns);

  // A closed shape needs ≥2 cut points to form trams; with fewer corners
  // (e.g. an ellipse) fall back to the sharpest two turns.
  if (corners.length < 2) {
    const ranked = turns
      .map((t, i) => ({ t: Math.abs(t), i }))
      .sort((a, b) => b.t - a.t)
      .slice(0, 2)
      .map(x => x.i)
      .sort((a, b) => a - b);
    corners = ranked;
  }

  // Implicit cut at the outline start (point 0 = the M command): a tram that
  // crosses the start would carry a WRAPPED command range — min/max over its
  // commands covers the whole outline, which downstream `segmentRange`
  // consumers cannot represent (commandRangeToFlattened degrades wrapped
  // ranges). Cutting at M keeps every cmdRange contiguous; an edge whose
  // anatomy happens to straddle M simply splits into two same-named trams
  // (classifier features aggregate over trams, so splits are harmless).
  if (!corners.includes(0)) corners = [0, ...corners];

  let trams: OutlineTram[] = [];
  for (let k = 0; k < corners.length; k++) {
    const startPt = corners[k];
    const endPt = corners[(k + 1) % corners.length];
    trams.push(buildTram(points, segCmds, bbox, orientation, startPt, endPt));
  }

  // Merge micro-trams (notch steps survive clustering occasionally) into
  // their preceding neighbor so anatomy isn't fragmented.
  if (trams.length > 2) {
    const merged: OutlineTram[] = [];
    for (const tram of trams) {
      const prev = merged[merged.length - 1];
      if (tram.arcLength < MIN_TRAM_MM && prev) {
        merged[merged.length - 1] = buildTram(points, segCmds, bbox, orientation, prev.startPt, tram.endPt);
      } else {
        merged.push(tram);
      }
    }
    // Wrap case: first tram tiny → merge into last.
    if (merged.length > 2 && merged[0].arcLength < MIN_TRAM_MM) {
      const first = merged.shift()!;
      merged[merged.length - 1] = buildTram(
        points, segCmds, bbox, orientation, merged[merged.length - 1].startPt, first.endPt,
      );
    }
    trams = merged;
  }

  return { points, pointCmd, bbox, orientation, corners, trams };
}
