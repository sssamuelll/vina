import type { PathCommand, PatternPiece, Point2D } from '../../types/types';
import { ClipperOffset, Path64, Point64, Paths64, JoinType, EndType } from 'clipper2-js';

const CURVE_RESOLUTION = 12;

/** A flattened point carrying the index of the source command that produced it. */
export interface SourcedPoint extends Point2D {
  /** Index into the original `commands` array of the command that emitted this point. */
  cmd: number;
}

/**
 * Flatten PathCommand[] to points, tagging each with its source command index.
 *
 * Curve commands (C/Q) expand to `resolution` points that ALL carry the curve
 * command's index — so a corner override keyed to a straight M/L command index
 * resolves to the single flattened point that is that command's endpoint, never
 * to a mid-curve sample. This is the contract the corner edge-walk needs: corner
 * overrides are stored by command index (findNearestVertex walks the command
 * array) but consumed against the flattened vertex array.
 */
export function flattenPathWithSource(
  commands: PathCommand[],
  resolution: number = CURVE_RESOLUTION,
): SourcedPoint[] {
  const points: SourcedPoint[] = [];
  let cx = 0, cy = 0;
  let startX = 0, startY = 0;
  let startCmd = 0;

  for (let ci = 0; ci < commands.length; ci++) {
    const cmd = commands[ci];
    switch (cmd.type) {
      case 'M':
        cx = cmd.values[0]; cy = cmd.values[1];
        startX = cx; startY = cy; startCmd = ci;
        points.push({ x: cx, y: cy, cmd: ci });
        break;
      case 'L':
        cx = cmd.values[0]; cy = cmd.values[1];
        points.push({ x: cx, y: cy, cmd: ci });
        break;
      case 'H':
        cx = cmd.values[0];
        points.push({ x: cx, y: cy, cmd: ci });
        break;
      case 'V':
        cy = cmd.values[0];
        points.push({ x: cx, y: cy, cmd: ci });
        break;
      case 'C': {
        const [x1, y1, x2, y2, x3, y3] = cmd.values;
        for (let i = 1; i <= resolution; i++) {
          const t = i / resolution;
          const mt = 1 - t;
          points.push({
            x: mt * mt * mt * cx + 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t * t * t * x3,
            y: mt * mt * mt * cy + 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t * y3,
            cmd: ci,
          });
        }
        cx = x3; cy = y3;
        break;
      }
      case 'Q': {
        const [qx1, qy1, qx2, qy2] = cmd.values;
        for (let i = 1; i <= resolution; i++) {
          const t = i / resolution;
          const mt = 1 - t;
          points.push({
            x: mt * mt * cx + 2 * mt * t * qx1 + t * t * qx2,
            y: mt * mt * cy + 2 * mt * t * qy1 + t * t * qy2,
            cmd: ci,
          });
        }
        cx = qx2; cy = qy2;
        break;
      }
      case 'Z':
        if (Math.abs(cx - startX) > 0.001 || Math.abs(cy - startY) > 0.001) {
          points.push({ x: startX, y: startY, cmd: startCmd });
        }
        cx = startX; cy = startY;
        break;
      default:
        if (cmd.values.length >= 2) {
          cx = cmd.values[cmd.values.length - 2];
          cy = cmd.values[cmd.values.length - 1];
          points.push({ x: cx, y: cy, cmd: ci });
        }
        break;
    }
  }

  return points;
}

/**
 * Convert a `SemanticEdge.segmentRange` — index range [start, end) over the
 * outline's PathCommand array (the producer contract: `detectSemanticEdges`
 * emits one segment per draw command; see types.ts) — into the equivalent
 * INCLUSIVE point range [firstPoint, lastPoint] over the FLATTENED outline
 * that `parameterizeEdge`, the edge picker and the highlight renderers
 * consume.
 *
 * This is the single canonical command→flattened boundary (Fase 3 / BP-3).
 * Before it existed, consumers indexed command ranges straight into the
 * flattened array, where every C/Q command expands to `resolution` points —
 * so any piece with curves (armhole, neckline) sewed, picked and highlighted
 * the wrong vertices.
 *
 * The start of the returned range is the ANCHOR point: the endpoint of the
 * previous command (a draw command starts where the previous one ended). It
 * is found as `firstEmittedPoint - 1` rather than by searching backwards by
 * tag, because the Z closing point is tagged with the M's command index
 * (`flattenPathWithSource`) and would false-match a backwards search.
 *
 * Defensive:
 * - Empty outline → [0, 0].
 * - A range that emits no points (only M/Z inside it) → [0, 0]; downstream
 *   yields 0–1 vertices → no constraints (the observable 0-constraint case).
 * - A malformed wrapped/empty range (end <= start) degrades to "the single
 *   command at start" — the producer never emits wrapping ranges.
 */
export function commandRangeToFlattened(
  commands: PathCommand[],
  range: [number, number],
  resolution: number = CURVE_RESOLUTION,
): [number, number] {
  const pts = flattenPathWithSource(commands, resolution);
  if (pts.length === 0) return [0, 0];

  const cmdStart = range[0];
  const cmdEnd = range[1] > range[0] ? range[1] : range[0] + 1;

  let firstEmitted = -1;
  let lastEmitted = -1;
  for (let i = 0; i < pts.length; i++) {
    const c = pts[i].cmd;
    if (c >= cmdStart && c < cmdEnd) {
      if (firstEmitted === -1) firstEmitted = i;
      lastEmitted = i;
    }
  }
  if (firstEmitted === -1) return [0, 0];

  return [Math.max(0, firstEmitted - 1), lastEmitted];
}

/**
 * Parse a legacy "edge-N" fallback name into the outline COMMAND index of the
 * edge command it names.
 *
 * N is the index the sewing tools' `resolveEdgeName` writes (`snapToEdge`
 * walks command indices 1..len-1), so command space is the only space with a
 * live writer — every consumer must read it the same way and convert to its
 * own space at the boundary (`commandRangeToFlattened([N, N+1])` for the
 * flattened-point consumers).
 *
 * Before this helper the three consumer families disagreed: SeamRenderer read
 * N+1 as a command index while the solver pipelines (buildSeamConstraints,
 * seamPairs, resolveEdgePolyline) indexed the FLATTENED outline with N — the
 * two only coincided on straight-only outlines, and even there both were one
 * edge off from what the user clicked. On curved outlines the solver sewed an
 * arbitrary mid-curve micro-segment.
 *
 * Returns null for non-edge-N names and for an N with no edge command
 * (N = 0 is the M; N >= outline.length is out of range).
 */
export function edgeNToCommandIndex(outline: PathCommand[], edgeName: string): number | null {
  const m = edgeName.match(/^edge-(\d+)$/);
  if (!m) return null;
  const idx = parseInt(m[1], 10);
  return idx >= 1 && idx < outline.length ? idx : null;
}

/**
 * Resolve a seam half's edge name to its sub-polyline over the FLATTENED
 * outline, in traversal order (parity plan Fase 5 — direction-aware
 * rendering).
 *
 * Resolution mirrors the solver pipeline (`buildSeamConstraints` /
 * `seamPairs.resolveSegmentRange`): semantic edge names map through
 * `commandRangeToFlattened` (command space → flattened space, BP-3); the
 * legacy "edge-N" fallback names a COMMAND index (`edgeNToCommandIndex`)
 * and converts through the same boundary.
 *
 * `reversed` flips the point order — the renderer's "start" then matches
 * what `parameterizeEdge(..., reverse=true)` treats as t=0, so connection
 * lines and direction ticks tell the same story the solver enforces.
 *
 * Returns [] when the edge cannot be resolved (unknown name, empty
 * outline) — callers fall back to non-directional rendering.
 */
export function resolveEdgePolyline(
  outline: PathCommand[],
  edges: Array<{ name: string; segmentRange: [number, number] }> | undefined,
  edgeName: string,
  reversed: boolean = false,
  resolution: number = CURVE_RESOLUTION,
): Point2D[] {
  const flat = flattenPath(outline, resolution);
  if (flat.length === 0) return [];

  let range: [number, number] | null = null;
  const semantic = edges?.find(e => e.name === edgeName);
  if (semantic) {
    range = commandRangeToFlattened(outline, semantic.segmentRange, resolution);
  } else {
    // Legacy "edge-N": N is the outline COMMAND index (edgeNToCommandIndex
    // contract) — convert to flattened space exactly like a semantic range.
    const cmdIdx = edgeNToCommandIndex(outline, edgeName);
    if (cmdIdx !== null) range = commandRangeToFlattened(outline, [cmdIdx, cmdIdx + 1], resolution);
  }
  if (!range) return [];

  const pts = range[1] >= range[0]
    ? flat.slice(range[0], range[1] + 1)
    : [...flat.slice(range[0]), ...flat.slice(0, range[1] + 1)];

  return reversed ? pts.slice().reverse() : pts;
}

/**
 * Polilínea aplanada de UN comando del contorno, en coordenadas locales de la
 * pieza. Es `resolveEdgePolyline` pero por índice de comando en vez de por
 * nombre de borde semántico — lo que necesitan las herramientas de coser, que
 * trabajan con `edgeIndex`.
 *
 * Devuelve [] cuando el comando no aporta tramo (el flattener no lo cubre);
 * el llamador decide si cae a la cuerda.
 */
export function commandPolyline(
  outline: PathCommand[],
  cmdIndex: number,
  resolution: number = CURVE_RESOLUTION,
): Point2D[] {
  return edgeRangePolyline(outline, [cmdIndex, cmdIndex + 1], resolution);
}

/**
 * Igual que `commandPolyline` pero sobre un RANGO de comandos — el
 * `segmentRange` de un borde semántico, que es la unidad en la que el usuario
 * ve (y clica) un borde. En un patrón importado un lado recto son varios
 * comandos `L`, así que "el comando" y "el borde" no son lo mismo (maria
 * #199a).
 */
export function edgeRangePolyline(
  outline: PathCommand[],
  range: [number, number],
  resolution: number = CURVE_RESOLUTION,
): Point2D[] {
  const flat = flattenPath(outline, resolution);
  if (flat.length === 0) return [];
  const [from, to] = commandRangeToFlattened(outline, range, resolution);
  const pts = to >= from
    ? flat.slice(from, to + 1)
    : [...flat.slice(from), ...flat.slice(0, to + 1)];
  return pts.length >= 2 ? pts : [];
}

/**
 * Punto de la polilínea más cercano a `pt`, con su fracción de ARCO y la
 * distancia. La `t` es arco acumulado / arco total, o sea la misma
 * parametrización que usan `slicePolylineByT` y el `tStart`/`tEnd` de un Seam.
 *
 * Existe porque medir contra la CUERDA de un comando curvo miente por los dos
 * lados: un clic encima del trazo sale lejísimos, y un clic en el aire sobre la
 * cuerda sale encima. Es el mismo arreglo que recibió el hit-test del margen de
 * costura en el #213, ahora para las herramientas de coser (#1026).
 */
export function closestOnPolyline(
  pt: Point2D,
  poly: Point2D[],
): { point: Point2D; t: number; dist: number } | null {
  if (poly.length < 2) return null;
  const cum: number[] = [0];
  for (let i = 1; i < poly.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(poly[i].x - poly[i - 1].x, poly[i].y - poly[i - 1].y));
  }
  const total = cum[cum.length - 1];
  let best: { point: Point2D; t: number; dist: number } = {
    point: { ...poly[0] }, t: 0, dist: Infinity,
  };
  for (let i = 1; i < poly.length; i++) {
    const a = poly[i - 1], b = poly[i];
    const dx = b.x - a.x, dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    const u = l2 > 0 ? Math.max(0, Math.min(1, ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / l2)) : 0;
    const p = { x: a.x + u * dx, y: a.y + u * dy };
    const dist = Math.hypot(pt.x - p.x, pt.y - p.y);
    if (dist < best.dist) {
      best = { point: p, t: total > 0 ? (cum[i - 1] + u * Math.sqrt(l2)) / total : 0, dist };
    }
  }
  return best;
}

/**
 * Recorta una polilínea al sub-rango [t0, t1] de su ARCO (fracciones 0-1,
 * la parametrización de tStart/tEnd en seamRange.ts), interpolando los
 * extremos y conservando los vértices interiores del rango.
 *
 * Consumidor: SeamRenderer (#1022) — un seam parcial se pinta sobre el
 * sub-tramo cosido, no sobre el borde entero. Para el half B ya invertido
 * por `resolveEdgePolyline(reversed)`, el rango almacenado se aplica
 * DIRECTO: la convención (header de seamRange.ts) es que vive en dirección
 * de cosido, igual que el filtro del solver.
 *
 * Rango completo, polilínea degenerada (<2 puntos o arco 0) → intacta.
 */
export function slicePolylineByT(pts: Point2D[], t0: number, t1: number): Point2D[] {
  if (pts.length < 2 || (t0 <= 0 && t1 >= 1)) return pts;
  const cum: number[] = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  }
  const total = cum[cum.length - 1];
  if (total <= 0) return pts;

  const at = (t: number): Point2D => {
    const target = Math.min(1, Math.max(0, t)) * total;
    let i = 1;
    while (i < cum.length - 1 && cum[i] < target) i++;
    const segLen = cum[i] - cum[i - 1];
    const f = segLen > 0 ? (target - cum[i - 1]) / segLen : 0;
    return {
      x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * f,
      y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * f,
    };
  };

  const a = Math.min(t0, t1);
  const b = Math.max(t0, t1);
  const EPS = 1e-9;
  const out: Point2D[] = [at(a)];
  for (let i = 0; i < pts.length; i++) {
    if (cum[i] > a * total + EPS && cum[i] < b * total - EPS) out.push(pts[i]);
  }
  out.push(at(b));
  return out;
}

/**
 * Flatten PathCommand[] (including curves) to Point2D[].
 */
export function flattenPath(commands: PathCommand[], resolution: number = CURVE_RESOLUTION): Point2D[] {
  const points: Point2D[] = [];
  let cx = 0, cy = 0;
  let startX = 0, startY = 0;

  for (const cmd of commands) {
    switch (cmd.type) {
      case 'M':
        cx = cmd.values[0];
        cy = cmd.values[1];
        startX = cx;
        startY = cy;
        points.push({ x: cx, y: cy });
        break;
      case 'L':
        cx = cmd.values[0];
        cy = cmd.values[1];
        points.push({ x: cx, y: cy });
        break;
      case 'H':
        cx = cmd.values[0];
        points.push({ x: cx, y: cy });
        break;
      case 'V':
        cy = cmd.values[0];
        points.push({ x: cx, y: cy });
        break;
      case 'C': {
        const [x1, y1, x2, y2, x3, y3] = cmd.values;
        for (let i = 1; i <= resolution; i++) {
          const t = i / resolution;
          const mt = 1 - t;
          points.push({
            x: mt * mt * mt * cx + 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t * t * t * x3,
            y: mt * mt * mt * cy + 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t * y3,
          });
        }
        cx = x3;
        cy = y3;
        break;
      }
      case 'Q': {
        const [qx1, qy1, qx2, qy2] = cmd.values;
        for (let i = 1; i <= resolution; i++) {
          const t = i / resolution;
          const mt = 1 - t;
          points.push({
            x: mt * mt * cx + 2 * mt * t * qx1 + t * t * qx2,
            y: mt * mt * cy + 2 * mt * t * qy1 + t * t * qy2,
          });
        }
        cx = qx2;
        cy = qy2;
        break;
      }
      case 'Z':
        if (Math.abs(cx - startX) > 0.001 || Math.abs(cy - startY) > 0.001) {
          points.push({ x: startX, y: startY });
        }
        cx = startX;
        cy = startY;
        break;
      default:
        // S, T, A — simplified: treat as line to endpoint
        if (cmd.values.length >= 2) {
          cx = cmd.values[cmd.values.length - 2];
          cy = cmd.values[cmd.values.length - 1];
          points.push({ x: cx, y: cy });
        }
        break;
    }
  }

  return points;
}

/**
 * Width of the seam-allowance double-line for a piece — EXPLICIT-ONLY.
 *
 * Pieces are NET (hallazgo #2, María): patternmakers draft without seam
 * allowance — SA is an explicit finishing step, never a default. A piece
 * renders a margin ONLY when its own `seamAllowance` was explicitly set
 * (the user asked for it). There is no editor-wide fallback anymore.
 *
 * This subsumes the earlier suppression rules: pieces carrying a real sew
 * line (`'seam'` internal, M3.5) or import provenance (`outlineIsCutLine`,
 * junta F1) are born with `seamAllowance: 0` and thus render no margin —
 * the system never invents geometry the file/user did not provide.
 */
export function effectiveSeamAllowanceWidth(
  piece: Pick<PatternPiece, 'seamAllowance'>,
): number {
  return piece.seamAllowance || 0;
}

// Clipper2 scale: integer coords at 100x for 0.01mm precision
const CLIPPER_SCALE = 100;

export type SeamJoinType = 'round' | 'miter' | 'square';

/**
 * Convert outline PathCommand[] + width → offset PathCommand[] using Clipper2.
 *
 * ⚠️ BROKEN — DO NOT USE FOR SEAM ALLOWANCE. clipper2-js 1.2.4's ClipperOffset
 * returns wrong geometry for every polygon we tested: a convex quad offset with
 * a miter join comes back with 6 points instead of 4, and an 80-gon offset
 * OUTWARD comes back with less area than it went in with. Reproduced against the
 * raw library API (addPath / addPaths / Clipper.InflatePaths) across all 20
 * JoinType × EndType combinations, so it is not our call site. 1.2.4 is the
 * latest published version; there is no upgrade. `Clipper.simplifyPaths` in the
 * same library is fine — the fault is specific to the offset module.
 *
 * All seam allowance now goes through `generateSeamAllowanceWithCorners`
 * (src/utils/seam/cornerTypes.ts), a pure edge-walk. This function survives only
 * because `offsetPieceOutline` (the offset tool + its copilot tool) still calls
 * it for arbitrary inside/outside offsets; that path is equally wrong and is
 * queued separately. Do not add callers. maria-190.
 *
 * @param outline  Source path commands
 * @param width    Seam allowance width in mm (positive = outward)
 * @param joinType Corner style: 'round' (default, best for fabric), 'miter', or 'square'
 */
export function generateSeamAllowance(
  outline: PathCommand[],
  width: number,
  joinType: SeamJoinType = 'round',
): PathCommand[] {
  if (width <= 0) return [];

  const flat = flattenPath(outline);
  if (flat.length < 3) return [];

  // Remove closing duplicate if present
  const last = flat[flat.length - 1];
  const pts = (Math.abs(flat[0].x - last.x) < 0.001 && Math.abs(flat[0].y - last.y) < 0.001)
    ? flat.slice(0, -1)
    : flat;

  if (pts.length < 3) return [];

  // Convert to Clipper2 integer path
  const clipperPath = new Path64();
  for (const p of pts) {
    clipperPath.push(new Point64(
      Math.round(p.x * CLIPPER_SCALE),
      Math.round(p.y * CLIPPER_SCALE),
    ));
  }

  // Map join type
  const jt = joinType === 'miter' ? JoinType.Miter
    : joinType === 'square' ? JoinType.Square
    : JoinType.Round;

  const co = new ClipperOffset();
  co.addPath(clipperPath as unknown as Point64[], jt, EndType.Polygon);

  const result = new Paths64();
  co.execute(width * CLIPPER_SCALE, result);

  if (result.length === 0) return [];

  // Take the largest path (outer offset)
  let largest = result[0];
  let largestArea = 0;
  for (const path of result) {
    let area = 0;
    for (let i = 0, n = path.length; i < n; i++) {
      const j = (i + 1) % n;
      area += Number(path[i].x) * Number(path[j].y);
      area -= Number(path[j].x) * Number(path[i].y);
    }
    area = Math.abs(area);
    if (area > largestArea) {
      largestArea = area;
      largest = path;
    }
  }

  // Convert back to PathCommand[]
  const commands: PathCommand[] = [
    { type: 'M', values: [Number(largest[0].x) / CLIPPER_SCALE, Number(largest[0].y) / CLIPPER_SCALE] },
  ];
  for (let i = 1; i < largest.length; i++) {
    commands.push({ type: 'L', values: [Number(largest[i].x) / CLIPPER_SCALE, Number(largest[i].y) / CLIPPER_SCALE] });
  }
  commands.push({ type: 'Z', values: [] });

  return commands;
}
