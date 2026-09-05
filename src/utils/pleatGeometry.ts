/**
 * pleatGeometry.ts
 *
 * Generates fold lines (InternalLine[]) for a given Pleat on a PatternPiece.
 * Each line is perpendicular to the named SemanticEdge, spaced evenly along
 * the edge, and extends inward by the pleat depth.
 */

import type { Pleat, PatternPiece, InternalLine, PathCommand } from '../types/types';
import { MAX_PLEAT_COUNT } from '../types/types';
import { uid } from './pathHelpers';
import { interpolateEdgePoint } from './geometry/edgeInterpolation';

// ─── Internal geometry helpers ────────────────────────────────────────────────

interface Point2D {
  x: number;
  y: number;
}

/**
 * +1 si el contorno gira en el sentido en que `perpendicular` apunta HACIA
 * DENTRO; -1 si al revés. Fórmula del cordón de zapato sobre las anclas.
 *
 * Hace falta porque `perpendicular` rota 90° a un lado fijo y no sabe de
 * contornos: con un contorno horario —que un DXF puede traer perfectamente,
 * `polyVertexToPath` conserva el orden del archivo— los pliegues nacían FUERA
 * de la pieza. El defecto es viejo, pero mientras la función devolvía `[]`
 * nadie podía verlo; arreglar el silencio sin arreglar esto habría cambiado
 * «no pasa nada» por «pasa al revés», que es peor de diagnosticar.
 *
 * `analyzeOutline` ya calcula esto (`orientation`) y nadie lo consultaba aquí.
 * Se recalcula en vez de importarlo para no arrastrar el análisis entero por
 * un signo.
 */
function sentidoHaciaDentro(outline: PathCommand[]): 1 | -1 {
  let doble = 0;
  let prev: Point2D | null = null;
  let primero: Point2D | null = null;
  for (const cmd of outline) {
    if (cmd.type === 'Z' || cmd.values.length < 2) continue;
    const p = { x: cmd.values[cmd.values.length - 2], y: cmd.values[cmd.values.length - 1] };
    if (!primero) primero = p;
    if (prev) doble += prev.x * p.y - p.x * prev.y;
    prev = p;
  }
  if (prev && primero) doble += prev.x * primero.y - primero.x * prev.y;
  return doble >= 0 ? 1 : -1;
}

/** Euclidean distance between two points */
function dist(a: Point2D, b: Point2D): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Sample a point along a polyline at arc-length `t` in [0, 1].
 * Returns { point, tangent }.
 *
 * Exported (Fase 5): also consumed by `SeamRenderer` for the seam
 * directional tick at t≈0.05 — generic polyline sampling, not pleat-specific.
 */
export function samplePolyline(
  pts: Point2D[],
  t: number,
): { point: Point2D; tangent: Point2D } {
  if (pts.length === 0) return { point: { x: 0, y: 0 }, tangent: { x: 1, y: 0 } };
  if (pts.length === 1) return { point: pts[0], tangent: { x: 1, y: 0 } };

  // Build cumulative arc-length table
  const lengths: number[] = [0];
  for (let i = 1; i < pts.length; i++) {
    lengths.push(lengths[i - 1] + dist(pts[i - 1], pts[i]));
  }
  const total = lengths[lengths.length - 1];

  if (total === 0) return { point: pts[0], tangent: { x: 1, y: 0 } };

  const target = Math.max(0, Math.min(1, t)) * total;

  // Binary-search for the segment
  let lo = 0;
  let hi = lengths.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (lengths[mid] <= target) lo = mid;
    else hi = mid;
  }

  const segLen = lengths[lo + 1] - lengths[lo];
  const localT = segLen > 0 ? (target - lengths[lo]) / segLen : 0;
  const a = pts[lo];
  const b = pts[lo + 1] ?? pts[lo];

  const point: Point2D = {
    x: a.x + (b.x - a.x) * localT,
    y: a.y + (b.y - a.y) * localT,
  };

  // Tangent = direction of segment (lo → lo+1)
  const rawLen = dist(a, b);
  const tangent: Point2D =
    rawLen > 0
      ? { x: (b.x - a.x) / rawLen, y: (b.y - a.y) / rawLen }
      : { x: 1, y: 0 };

  return { point, tangent };
}

/** Rotate a 2D unit vector 90° counter-clockwise: (x,y) → (-y, x).
 *  Exported (Fase 5): also consumed by `SeamRenderer` (directional tick). */
export function perpendicular(v: Point2D): Point2D {
  return { x: -v.y, y: v.x };
}

/** Compute bounding box height from a list of outline commands */
function outlineBBoxHeight(outline: PathCommand[]): number {
  let minY = Infinity;
  let maxY = -Infinity;

  for (const cmd of outline) {
    if (cmd.type === 'Z') continue;
    // Check all y values in the command (odd indices in values after the first pair)
    for (let i = 1; i < cmd.values.length; i += 2) {
      const y = cmd.values[i];
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  return maxY > minY ? maxY - minY : 100; // fallback 100
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generate InternalLine fold lines for a pleat on a pattern piece.
 *
 * Returns an empty array if:
 * - The named edge is not found on the piece.
 * - count <= 0 (after clamping).
 */
export function generatePleatFoldLines(
  pleat: Pleat,
  piece: PatternPiece,
): InternalLine[] {
  // 1. Clamp count
  const count = Math.min(pleat.count, MAX_PLEAT_COUNT);
  if (count <= 0) return [];

  // 2. Muestrear el borde nombrado.
  //
  // Antes esto rebanaba `outline.slice(segmentRange)` y aplanaba el trozo. Un
  // comando `L` lleva su punto FINAL, no el inicial, así que un borde de UN
  // comando —los cuatro lados de un rectángulo lo son— daba un solo punto y la
  // función devolvía [] sin decir nada. El pliegue no se dibujaba en ningún
  // borde de ninguna pieza, y el censo del 05-09 leyó ese silencio como
  // «nadie pinta los pliegues». Sí los pinta: `PieceRenderer` dibuja
  // `type:'fold'` con sus marcas de monte y valle desde siempre.
  //
  // `interpolateEdgePoint` trabaja en espacio de comandos, mide curvas de
  // verdad y ya resuelve el tramo de cierre (`rangoMedibleDeBorde`), que era
  // el otro borde roto. Ver `el-pliegue-se-dibuja.test.ts`.
  const muestrear = (t: number) => interpolateEdgePoint(piece, pleat.edgeName, t);
  if (!muestrear(0)) return [];

  // El pliegue entra en la pieza, con el contorno en cualquier sentido.
  const dentro = sentidoHaciaDentro(piece.outline);
  const haciaDentro = (v: Point2D): Point2D => {
    const n = perpendicular(v);
    return dentro === 1 ? n : { x: -n.x, y: -n.y };
  };

  // 4. Clamp depth to piece bounding box height
  const bboxHeight = outlineBBoxHeight(piece.outline);
  const depth = Math.min(Math.abs(pleat.depth), bboxHeight);

  // 5. Compute lines per repeat based on pleat type
  const linesPerRepeat: number =
    pleat.type === 'knife' ? 1 : 2;

  const lines: InternalLine[] = [];

  // 6. Generate fold line positions evenly in tStart–tEnd range
  const tRange = pleat.tEnd - pleat.tStart;

  // For types with 2 lines per repeat, we interleave pairs within each repeat slot
  const totalRepeats = count;

  for (let i = 0; i < totalRepeats; i++) {
    // Base t for this repeat, centered in its slot
    const slotFraction = tRange / totalRepeats;
    const slotStart = pleat.tStart + i * slotFraction;
    const slotMid = slotStart + slotFraction * 0.5;

    if (linesPerRepeat === 1) {
      // Knife: single line at slot midpoint
      const muestra = muestrear(slotMid);
      if (!muestra) continue;
      const perp = haciaDentro(muestra.tangent);

      lines.push(buildFoldLine(muestra.point, perp, depth, pleat.id, 'mountain'));
    } else {
      // Box / Accordion / InvertedBox: two lines per repeat
      // Offset lines symmetrically around slot center
      const halfOffset = 0.1; // fraction of slot
      const tA = slotMid - halfOffset * slotFraction;
      const tB = slotMid + halfOffset * slotFraction;

      const sampA = muestrear(tA);
      const sampB = muestrear(tB);
      if (!sampA || !sampB) continue;

      let dirA: 'mountain' | 'valley';
      let dirB: 'mountain' | 'valley';

      switch (pleat.type) {
        case 'box':
          dirA = 'mountain';
          dirB = 'mountain';
          break;
        case 'accordion':
          // Each repeat pair is mountain then valley — produces alternating M/V sequence
          dirA = 'mountain';
          dirB = 'valley';
          break;
        case 'invertedBox':
          dirA = 'valley';
          dirB = 'valley';
          break;
        default:
          dirA = 'mountain';
          dirB = 'mountain';
      }

      lines.push(
        buildFoldLine(sampA.point, haciaDentro(sampA.tangent), depth, pleat.id, dirA),
      );
      lines.push(
        buildFoldLine(sampB.point, haciaDentro(sampB.tangent), depth, pleat.id, dirB),
      );
    }
  }

  return lines;
}

// ─── Private builder ──────────────────────────────────────────────────────────

function buildFoldLine(
  start: Point2D,
  perp: Point2D,
  depth: number,
  pleatId: string,
  direction: 'mountain' | 'valley',
): InternalLine {
  const end: Point2D = {
    x: start.x + perp.x * depth,
    y: start.y + perp.y * depth,
  };

  const path: PathCommand[] = [
    { type: 'M', values: [start.x, start.y] },
    { type: 'L', values: [end.x, end.y] },
  ];

  return {
    id: uid(),
    type: 'fold',
    path,
    foldOptions: {
      direction,
      creaseAngleDeg: 180,
      pleatId,
    },
  };
}
