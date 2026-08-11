import type { PathCommand, Point2D, SemanticEdge } from '../../types/types';
import type { CornerType } from '../../types/types';
import { Clipper, Clipper64, Paths64, Path64, Point64, ClipType, FillRule } from 'clipper2-js';
import { flattenPathWithSource } from './index';
import type { SourcedPoint } from './index';

// Clipper2 scale: integer coords at 100x for 0.01mm precision (same as index.ts)
const CLIPPER_SCALE = 100;

export interface Line2D {
  start: Point2D;
  end: Point2D;
}

/**
 * Compute the parallel offset of an edge by saWidth, perpendicular to the left
 * of the edge direction.
 *
 * For an edge going in direction (dx, dy), the left-perpendicular normal is
 * (-dy, dx) / length. Both endpoints are shifted by saWidth along that normal.
 *
 * If the edge has zero length, the original edge is returned unchanged.
 */
export function offsetEdge(edge: Line2D, saWidth: number): Line2D {
  const dx = edge.end.x - edge.start.x;
  const dy = edge.end.y - edge.start.y;
  const len = Math.sqrt(dx * dx + dy * dy);

  if (len < 1e-12) {
    return { start: { ...edge.start }, end: { ...edge.end } };
  }

  // Left-perpendicular normal in screen coords (Y-down): rotate direction 90° CW → (dy, -dx)
  // For a rightward edge (dx>0, dy=0) this gives normal (0, -saWidth) → shifts y upward (negative).
  // For an upward edge in screen-Y-down (dx=0, dy>0) this gives normal (saWidth, 0) → shifts x right.
  const nx = (dy / len) * saWidth;
  const ny = (-dx / len) * saWidth;

  return {
    start: { x: edge.start.x + nx, y: edge.start.y + ny },
    end: { x: edge.end.x + nx, y: edge.end.y + ny },
  };
}

/**
 * Find the intersection point of two infinite lines defined by their segments.
 * Returns null if the lines are parallel (cross product magnitude < 1e-10).
 *
 * Uses the standard parametric line-line intersection formula:
 *   P = start_a + t * dir_a  where t is solved via cross products.
 */
export function lineIntersection(a: Line2D, b: Line2D): Point2D | null {
  const dx1 = a.end.x - a.start.x;
  const dy1 = a.end.y - a.start.y;
  const dx2 = b.end.x - b.start.x;
  const dy2 = b.end.y - b.start.y;

  // Cross product of direction vectors (z-component of 3D cross)
  const cross = dx1 * dy2 - dy1 * dx2;

  if (Math.abs(cross) < 1e-10) {
    return null; // Parallel or coincident lines
  }

  // Vector from a.start to b.start
  const dx3 = b.start.x - a.start.x;
  const dy3 = b.start.y - a.start.y;

  const t = (dx3 * dy2 - dy3 * dx2) / cross;

  return {
    x: a.start.x + t * dx1,
    y: a.start.y + t * dy1,
  };
}

/**
 * Compute the interior angle (radians) between two edges at their shared vertex.
 *
 * Uses atan2(|cross|, dot) of the two edge direction vectors, yielding a value
 * in [0, PI]. Returns 0 for collinear same-direction edges and PI for antiparallel
 * (U-turn / 180° interior angle) edges.
 */
export function interiorAngle(prev: Line2D, next: Line2D): number {
  const ax = prev.end.x - prev.start.x;
  const ay = prev.end.y - prev.start.y;
  const bx = next.end.x - next.start.x;
  const by = next.end.y - next.start.y;

  const dot = ax * bx + ay * by;
  const cross = ax * by - ay * bx; // z-component of 3D cross product

  return Math.atan2(Math.abs(cross), dot);
}

/**
 * Compute the unit vector along the angle bisector at the shared vertex of
 * prev and next edges.
 *
 * Bisector = normalize(unit(prev_dir) + unit(next_dir)).
 * If the sum is near-zero (antiparallel, i.e. 180° turn back), falls back to
 * the left-perpendicular of prev.
 */
export function bisectorDirection(prev: Line2D, next: Line2D): Point2D {
  const ax = prev.end.x - prev.start.x;
  const ay = prev.end.y - prev.start.y;
  const aLen = Math.sqrt(ax * ax + ay * ay);

  const bx = next.end.x - next.start.x;
  const by = next.end.y - next.start.y;
  const bLen = Math.sqrt(bx * bx + by * by);

  // Normalize each direction; treat zero-length as (0,0)
  const uax = aLen > 1e-12 ? ax / aLen : 0;
  const uay = aLen > 1e-12 ? ay / aLen : 0;
  const ubx = bLen > 1e-12 ? bx / bLen : 0;
  const uby = bLen > 1e-12 ? by / bLen : 0;

  const sx = uax + ubx;
  const sy = uay + uby;
  const sLen = Math.sqrt(sx * sx + sy * sy);

  if (sLen < 1e-12) {
    // Antiparallel edges: fall back to left-perpendicular of prev direction
    return { x: -uay, y: uax };
  }

  return { x: sx / sLen, y: sy / sLen };
}

// ─── Corner Function Type ──────────────────────────────────────────────────

/**
 * A corner function takes the two adjacent offset edges at a vertex and
 * returns the array of geometry points that replace the standard miter.
 *
 * The two edges may be offset by DIFFERENT widths (per-edge seam allowance:
 * e.g. a 40mm hem meeting a 10mm armhole). Geometric corner types (mitered,
 * squared, slant, match) resolve the asymmetry directly from the offset edges;
 * scalar-factor types (doubleMitered, envelope, trimMirrored) use the mean of
 * the two widths. When prevWidth === nextWidth the geometry is identical to the
 * legacy single-width behavior.
 *
 * @param prevOffsetEdge - Offset line of the edge BEFORE this vertex (offset by prevWidth)
 * @param nextOffsetEdge - Offset line of the edge AFTER this vertex (offset by nextWidth)
 * @param vertex         - The piece outline vertex position
 * @param prevWidth      - Seam allowance width (mm) of the edge before this vertex
 * @param nextWidth      - Seam allowance width (mm) of the edge after this vertex
 * @param angle          - Interior angle at the vertex (radians)
 * @returns              - Ordered array of Point2D forming the corner geometry
 */
export type CornerFunction = (
  prevOffsetEdge: Line2D,
  nextOffsetEdge: Line2D,
  vertex: Point2D,
  prevWidth: number,
  nextWidth: number,
  angle: number,
) => Point2D[];

// ─── Helper: unit direction of a line ─────────────────────────────────────

function lineDir(line: Line2D): Point2D {
  const dx = line.end.x - line.start.x;
  const dy = line.end.y - line.start.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1e-12) return { x: 0, y: 0 };
  return { x: dx / len, y: dy / len };
}

// ─── Helper: order a symmetric pair along the walk ────────────────────────

/**
 * Order a two-point corner bundle so the first point is the one that meets the
 * PREVIOUS offset edge and the second meets the NEXT one.
 *
 * cornerDoubleMitered and cornerTrimMirrored both build their pair by stepping
 * ±perp from a centre point, where perp is a 90° rotation of a bisector or of
 * the vertex→miter axis. That sign is unrelated to the direction the contour is
 * walked, so at roughly half the vertices the pair came out reversed and the
 * cut line crossed itself in a small bowtie at that corner. It went unnoticed
 * because the only cleanup downstream was simplifyPaths, which does not remove
 * self-intersections — it faithfully preserved the crossing.
 *
 * The bundle contract is prev-side first; see measureBorderCutLength, which
 * reads bundle[length-1] as the next-side touch point and bundle[0] as the
 * prev-side one.
 */
function orderPrevToNext(
  a: Point2D,
  b: Point2D,
  prevOffsetEdge: Line2D,
  nextOffsetEdge: Line2D,
): Point2D[] {
  const P = prevOffsetEdge.end;
  const Q = nextOffsetEdge.start;
  const asIs = Math.hypot(a.x - P.x, a.y - P.y) + Math.hypot(b.x - Q.x, b.y - Q.y);
  const swapped = Math.hypot(b.x - P.x, b.y - P.y) + Math.hypot(a.x - Q.x, a.y - Q.y);
  return swapped < asIs ? [b, a] : [a, b];
}

// ─── cornerMitered ────────────────────────────────────────────────────────

/**
 * Cota de la punta del miter, en múltiplos del ancho del margen. Pasada esta
 * cota el vértice se BISELA (ver `cornerMitered`), que es lo que hace SVG con
 * `stroke-linejoin: miter` cuando se supera `stroke-miterlimit`.
 *
 * Sin cota, la excursión en un vértice de ángulo interior θ es SA / sin(θ/2),
 * que diverge: un margen de 10mm llegaba a 114.7mm en una punta de 10° y a
 * 1145.9mm en una de 1° — el pincho que María fotografió en el #213 sin
 * haberlo dibujado.
 *
 * Valía 4 (el default de SVG y CSS) y era demasiado flojo. Ese 4 es razonable
 * para un TRAZO de 1-2 px, donde son 8px; traducido a geometría de patrón
 * significa cuatro veces el margen pedido. Con 4, el límite solo entraba por
 * debajo de 29°, y la punta que ella volvió a fotografiar el 2026-08-10 es de
 * 36°: nunca se disparó. La constante se había copiado sin traducir la unidad.
 *
 * Con 2 la regla se dice en una frase: un margen mitrado nunca se aleja más del
 * DOBLE de lo pedido, y en cuanto lo pasaría corta plano y no se aleja más de
 * lo pedido a secas. Los rectángulos no cambian (90° → 1.41×) y el bisel
 * empieza por debajo de 60°.
 */
const MITER_LIMIT = 2;

/**
 * Punto de miter acotado: la intersección de los dos offsets, y si se aleja del
 * vértice más de `MITER_LIMIT` anchos, el mismo punto acercado sobre la
 * dirección vértice→miter (que con anchos distintos no es la bisectriz).
 *
 * Es la REFERENCIA geométrica que consumen las otras esquinas — doubleMitered,
 * squared (su caída reflex), slant, envelope, trimMirrored construyen su forma
 * alrededor de este punto y necesitan uno solo. `cornerMitered` no les sirve
 * porque al biselar devuelve dos.
 */
function miterPointClamped(
  prevOffsetEdge: Line2D,
  nextOffsetEdge: Line2D,
  vertex: Point2D,
  prevWidth: number,
  nextWidth: number,
): Point2D {
  const pt = lineIntersection(prevOffsetEdge, nextOffsetEdge);
  if (pt === null) return { ...prevOffsetEdge.end };
  const maxDist = MITER_LIMIT * Math.max(prevWidth, nextWidth);
  if (maxDist <= 0) return pt;
  const dx = pt.x - vertex.x;
  const dy = pt.y - vertex.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= maxDist || dist < 1e-12) return pt;
  return { x: vertex.x + (dx / dist) * maxDist, y: vertex.y + (dy / dist) * maxDist };
}

/**
 * Standard miter: single intersection point of prevOffsetEdge and nextOffsetEdge.
 * Falls back to the endpoint of prevOffsetEdge when the lines are parallel.
 *
 * Devuelve 1 punto mientras la punta quepa dentro de `MITER_LIMIT` anchos, y 2
 * cuando no: el BISEL, o sea el corte plano entre `prevOffsetEdge.end` y
 * `nextOffsetEdge.start`. Esos dos puntos son el mismo vértice desplazado
 * perpendicularmente por cada borde, así que el margen biselado no se aleja del
 * vértice más de lo que el usuario pidió — ni un milímetro más.
 *
 * El paquete ya sale ordenado lado-prev → lado-next, que es el contrato que
 * `generateSeamAllowanceWithCorners` espera de cualquier esquina (el mismo de
 * cornerSquared: `[prevOffsetEdge.end, corner, nextOffsetEdge.start]`).
 *
 * Truncar el pico en vez de biselar — lo que hacía antes — dejaba una punta más
 * corta pero punta al fin, y a 4 anchos de distancia. SVG no trunca: cae a
 * bevel. Acá también.
 */
export function cornerMitered(
  prevOffsetEdge: Line2D,
  nextOffsetEdge: Line2D,
  vertex: Point2D,
  prevWidth: number,
  nextWidth: number,
  _angle: number,
): Point2D[] {
  // Geometric: the intersection of the two offset edges already encodes their
  // (possibly different) offset distances — no width factor needed.
  const pt = lineIntersection(prevOffsetEdge, nextOffsetEdge);
  if (pt === null) {
    // Parallel fallback: endpoint of prevOffsetEdge
    return [{ ...prevOffsetEdge.end }];
  }
  const maxDist = MITER_LIMIT * Math.max(prevWidth, nextWidth);
  if (maxDist <= 0) return [pt];
  const dist = Math.hypot(pt.x - vertex.x, pt.y - vertex.y);
  if (dist <= maxDist) return [pt];
  return [{ ...prevOffsetEdge.end }, { ...nextOffsetEdge.start }];
}

// ─── cornerDoubleMitered ──────────────────────────────────────────────────

/**
 * Double miter: compute the miter point, then back up toward the vertex along
 * the bisector by `saWidth * 0.3` and return two points symmetric about the
 * bisector at perpendicular distance `saWidth * 0.3`.
 *
 * Returns 2 points.
 */
export function cornerDoubleMitered(
  prevOffsetEdge: Line2D,
  nextOffsetEdge: Line2D,
  vertex: Point2D,
  prevWidth: number,
  nextWidth: number,
  _angle: number,
): Point2D[] {
  // Scalar setback uses the mean of the two widths (identical to legacy when equal).
  const saWidth = (prevWidth + nextWidth) / 2;
  // Reconstruct the original edges from vertex (approximate — use offset edge
  // directions since they are parallel to the originals).
  const prevDir = lineDir(prevOffsetEdge);
  const nextDir = lineDir(nextOffsetEdge);

  // Build proxy edges pointing away from vertex to get bisector direction.
  const prevProxy: Line2D = {
    start: vertex,
    end: { x: vertex.x + prevDir.x, y: vertex.y + prevDir.y },
  };
  const nextProxy: Line2D = {
    start: vertex,
    end: { x: vertex.x + nextDir.x, y: vertex.y + nextDir.y },
  };
  const bis = bisectorDirection(prevProxy, nextProxy);

  // Miter intersection point.
  const miter = miterPointClamped(prevOffsetEdge, nextOffsetEdge, vertex, prevWidth, nextWidth);

  // Move from miter back toward vertex by saWidth * 0.3.
  // Use the actual direction from miter to vertex so that midPt stays on the
  // vertex→miter axis (the outward SA bisector), preserving bilateral symmetry.
  const depth = saWidth * 0.3;
  const mvx = vertex.x - miter.x;
  const mvy = vertex.y - miter.y;
  const mvLen = Math.sqrt(mvx * mvx + mvy * mvy);
  const mvDir: Point2D =
    mvLen > 1e-12 ? { x: mvx / mvLen, y: mvy / mvLen } : { x: -bis.x, y: -bis.y };
  const midPt: Point2D = {
    x: miter.x + mvDir.x * depth,
    y: miter.y + mvDir.y * depth,
  };

  // Perpendicular to the vertex→miter axis (i.e., perpendicular to mvDir).
  const perpX = -mvDir.y;
  const perpY = mvDir.x;

  return orderPrevToNext(
    { x: midPt.x - perpX * depth, y: midPt.y - perpY * depth },
    { x: midPt.x + perpX * depth, y: midPt.y + perpY * depth },
    prevOffsetEdge,
    nextOffsetEdge,
  );
}

// ─── cornerSquared ────────────────────────────────────────────────────────

/**
 * Squared corner — "right-angle extension (belt loops, tabs)" per #253.
 *
 * The seam allowance runs along the previous edge's offset, then turns a true
 * 90° and cuts straight across to meet the next edge's offset. That makes the
 * corner a square end rather than the spike a miter grows at an acute angle.
 *
 * Construction: with P = prevOffsetEdge.end and Q = nextOffsetEdge.start, the
 * corner R is the projection of Q onto the line through P along prevDir. By
 * construction P→R is along the previous edge and R→Q is perpendicular to it,
 * so the angle at R is exactly 90°.
 *
 * At a 90° vertex this lands exactly on the miter point — which is required,
 * not a coincidence: a rectangle's seam allowance corner IS square, and any
 * definition that moved it there would break every rectangle.
 *
 * ⚠️ The previous implementation intersected the two offset edges extended
 * along their OWN directions, which is the definition of the miter point — so
 * `squared` silently rendered identical to `mitered` at every angle. The UI
 * chip did nothing. maria-190 follow-up.
 *
 * ASSUMPTION PENDING RATIFICATION: this squares relative to the PREVIOUS edge.
 * The mirror convention (square to the next edge) is equally defensible and
 * Gerber may define it the other way; #253 only says "right-angle extension"
 * and carries no geometry. Needs a patternmaker's call before it is presented
 * as Gerber-compatible.
 *
 * Returns 3 points: [prevOffsetEdge.end, corner, nextOffsetEdge.start].
 */
export function cornerSquared(
  prevOffsetEdge: Line2D,
  nextOffsetEdge: Line2D,
  vertex: Point2D,
  prevWidth: number,
  nextWidth: number,
  _angle: number,
): Point2D[] {
  const P = prevOffsetEdge.end;
  const Q = nextOffsetEdge.start;
  const prevDir = lineDir(prevOffsetEdge);

  // Projection of Q onto the ray from P along the previous edge.
  const t = (Q.x - P.x) * prevDir.x + (Q.y - P.y) * prevDir.y;

  // t < 0 means squaring off would walk backwards along the previous edge —
  // a reflex vertex, where there is no outward corner to square. Miter it.
  if (t <= 0 || (prevDir.x === 0 && prevDir.y === 0)) {
    const miter = miterPointClamped(prevOffsetEdge, nextOffsetEdge, vertex, prevWidth, nextWidth);
    return [{ ...P }, miter, { ...Q }];
  }

  const corner: Point2D = { x: P.x + prevDir.x * t, y: P.y + prevDir.y * t };
  return [{ ...P }, corner, { ...Q }];
}

// ─── cornerSlant ──────────────────────────────────────────────────────────

/**
 * Slant corner: a straight cut perpendicular to the angle bisector, passing
 * through the miter point. Returns the two intersections of this perpendicular
 * line with prevOffsetEdge and nextOffsetEdge.
 *
 * Returns 2 points.
 */
export function cornerSlant(
  prevOffsetEdge: Line2D,
  nextOffsetEdge: Line2D,
  vertex: Point2D,
  prevWidth: number,
  nextWidth: number,
  _angle: number,
): Point2D[] {
  // Geometric: the slant passes through the (asymmetric) miter; no width factor.
  const miter = miterPointClamped(prevOffsetEdge, nextOffsetEdge, vertex, prevWidth, nextWidth);

  const prevDir = lineDir(prevOffsetEdge);
  const nextDir = lineDir(nextOffsetEdge);

  const prevProxy: Line2D = {
    start: vertex,
    end: { x: vertex.x + prevDir.x, y: vertex.y + prevDir.y },
  };
  const nextProxy: Line2D = {
    start: vertex,
    end: { x: vertex.x + nextDir.x, y: vertex.y + nextDir.y },
  };
  const bis = bisectorDirection(prevProxy, nextProxy);

  // Perpendicular to bisector direction
  const perpDir: Point2D = { x: -bis.y, y: bis.x };

  // Line through miter point with perpendicular-to-bisector direction
  const slantLine: Line2D = {
    start: miter,
    end: { x: miter.x + perpDir.x, y: miter.y + perpDir.y },
  };

  // Intersect slant line with prevOffsetEdge and nextOffsetEdge
  const ptPrev = lineIntersection(slantLine, prevOffsetEdge) ?? { ...prevOffsetEdge.end };
  const ptNext = lineIntersection(slantLine, nextOffsetEdge) ?? { ...nextOffsetEdge.start };

  return [ptPrev, ptNext];
}

// ─── cornerEnvelope ───────────────────────────────────────────────────────

/**
 * Envelope corner: extends both offset edges past their miter intersection
 * by `saWidth * 0.75` and connects the extended endpoints with a rectangular
 * tab along the bisector direction.
 *
 * Returns 4 points: [prevExtEnd, outerCorner1, outerCorner2, nextExtStart].
 */
export function cornerEnvelope(
  prevOffsetEdge: Line2D,
  nextOffsetEdge: Line2D,
  vertex: Point2D,
  prevWidth: number,
  nextWidth: number,
  _angle: number,
): Point2D[] {
  // Tab extension uses the mean width (identical to legacy when equal).
  const ext = ((prevWidth + nextWidth) / 2) * 0.75;
  const miter = miterPointClamped(prevOffsetEdge, nextOffsetEdge, vertex, prevWidth, nextWidth);

  const prevDir = lineDir(prevOffsetEdge);
  const nextDir = lineDir(nextOffsetEdge);

  // Extend each offset edge past the miter by ext
  const prevExtEnd: Point2D = {
    x: miter.x + prevDir.x * ext,
    y: miter.y + prevDir.y * ext,
  };
  const nextExtStart: Point2D = {
    x: miter.x + nextDir.x * ext,
    y: miter.y + nextDir.y * ext,
  };

  // Build the outward bisector direction from vertex
  const prevProxy: Line2D = {
    start: vertex,
    end: { x: vertex.x + prevDir.x, y: vertex.y + prevDir.y },
  };
  const nextProxy: Line2D = {
    start: vertex,
    end: { x: vertex.x + nextDir.x, y: vertex.y + nextDir.y },
  };
  const bis = bisectorDirection(prevProxy, nextProxy);

  // Connect the two extended ends via two outer corners (rectangular tab)
  const outerCorner1: Point2D = {
    x: prevExtEnd.x + bis.x * ext,
    y: prevExtEnd.y + bis.y * ext,
  };
  const outerCorner2: Point2D = {
    x: nextExtStart.x + bis.x * ext,
    y: nextExtStart.y + bis.y * ext,
  };

  return [prevExtEnd, outerCorner1, outerCorner2, nextExtStart];
}

// ─── cornerMatch ──────────────────────────────────────────────────────────

/**
 * Match corner: identical to cornerMitered. The seam-lookup resolution
 * (pairing with the opposing piece's corner) happens at a higher level.
 *
 * Returns 1 point.
 */
export function cornerMatch(
  prevOffsetEdge: Line2D,
  nextOffsetEdge: Line2D,
  vertex: Point2D,
  prevWidth: number,
  nextWidth: number,
  angle: number,
): Point2D[] {
  return cornerMitered(prevOffsetEdge, nextOffsetEdge, vertex, prevWidth, nextWidth, angle);
}

// ─── cornerTrimMirrored ───────────────────────────────────────────────────

/**
 * Trim mirrored corner: compute the miter point, then trim equal amounts from
 * both sides along a line perpendicular to the bisector. The trim amount is
 * `saWidth * 0.2`. Returns 2 symmetric points about the bisector.
 *
 * Returns 2 points.
 */
export function cornerTrimMirrored(
  prevOffsetEdge: Line2D,
  nextOffsetEdge: Line2D,
  vertex: Point2D,
  prevWidth: number,
  nextWidth: number,
  _angle: number,
): Point2D[] {
  // Trim amount uses the mean width (identical to legacy when equal).
  const trimAmount = ((prevWidth + nextWidth) / 2) * 0.2;
  const miter = miterPointClamped(prevOffsetEdge, nextOffsetEdge, vertex, prevWidth, nextWidth);

  const prevDir = lineDir(prevOffsetEdge);
  const nextDir = lineDir(nextOffsetEdge);

  const prevProxy: Line2D = {
    start: vertex,
    end: { x: vertex.x + prevDir.x, y: vertex.y + prevDir.y },
  };
  const nextProxy: Line2D = {
    start: vertex,
    end: { x: vertex.x + nextDir.x, y: vertex.y + nextDir.y },
  };
  const bis = bisectorDirection(prevProxy, nextProxy);

  // Perpendicular to bisector
  const perpX = -bis.y;
  const perpY = bis.x;

  return orderPrevToNext(
    { x: miter.x - perpX * trimAmount, y: miter.y - perpY * trimAmount },
    { x: miter.x + perpX * trimAmount, y: miter.y + perpY * trimAmount },
    prevOffsetEdge,
    nextOffsetEdge,
  );
}

// ─── shiftCornerTypes ─────────────────────────────────────────────────────

/**
 * Shift corner type keys after an insert (+1) or remove (-1) operation on the
 * piece outline at `editIndex`.
 *
 * - Insert (delta = +1): keys >= editIndex are incremented by 1.
 * - Remove (delta = -1): the key at editIndex is dropped, keys > editIndex
 *   are decremented by 1.
 *
 * Keys below editIndex are left unchanged in both cases.
 */
export function shiftCornerTypes(
  cornerTypes: Record<number, CornerType>,
  editIndex: number,
  delta: number,
): Record<number, CornerType> {
  const result: Record<number, CornerType> = {};
  for (const [keyStr, value] of Object.entries(cornerTypes)) {
    const key = Number(keyStr);
    if (delta < 0 && key === editIndex) continue; // remove: skip deleted key
    if (key >= editIndex) {
      result[key + delta] = value;
    } else {
      result[key] = value;
    }
  }
  return result;
}

// ─── perEdgeWidths ────────────────────────────────────────────────────────

/**
 * Resolve the seam-allowance width of each flattened outline edge.
 *
 * For flattened edge `i` (from vertices[i] to vertices[(i+1)%n]), the owning
 * outline command is the source command of its END vertex — `vertexCmds[(i+1)%n]`
 * (the convention `detectSemanticEdges`/`sampleSegments` use: a segment is keyed
 * by the command that draws it). The SemanticEdge whose `segmentRange` [start,end)
 * covers that command supplies the width; everything else inherits `fallbackWidth`.
 *
 * When `semanticEdges` is absent or none sets `seamAllowanceWidth`, every edge
 * gets `fallbackWidth`, so the result is uniform and the generated SA is
 * byte-identical to the single-width path (zero regression).
 *
 * @param vertexCmds    source command index per flattened vertex (from flattenPathWithSource)
 * @param semanticEdges piece.edges; `segmentRange` is [start,end) in command space
 * @param fallbackWidth piece-level SA width (mm)
 */
export function perEdgeWidths(
  vertexCmds: number[],
  semanticEdges: SemanticEdge[] | undefined,
  fallbackWidth: number,
): number[] {
  const n = vertexCmds.length;
  const widths = new Array<number>(n).fill(fallbackWidth);
  if (!semanticEdges || semanticEdges.length === 0) return widths;

  // command index → per-edge width, for the edges that explicitly set one.
  const commandWidth = new Map<number, number>();
  for (const se of semanticEdges) {
    if (se.seamAllowanceWidth == null) continue;
    const [start, end] = se.segmentRange;
    for (let c = start; c < end; c++) commandWidth.set(c, se.seamAllowanceWidth);
  }
  if (commandWidth.size === 0) return widths;

  for (let i = 0; i < n; i++) {
    const owningCmd = vertexCmds[(i + 1) % n];
    const w = commandWidth.get(owningCmd);
    if (w != null) widths[i] = w;
  }
  return widths;
}

// ─── Matched corner ("Empatada") support ─────────────────────────────────
//
// A `match` corner slides the sewn border's cut-line endpoint at the vertex so
// the border's cut length equals `targetLen` (the partner border's cut length,
// resolved in matchResolver.ts). Base length is the border's mitered cut length;
// delta = targetLen − baseLen slides the endpoint (extend / retract) and the
// corner closes straight to the adjacent border's offset — the "necessary angle".

/** Which adjacent border of the match vertex is the sewn one, + its target cut length. */
export interface MatchTarget {
  /** 'prev' = incoming border (covers the vertex's command); 'next' = outgoing border. */
  side: 'prev' | 'next';
  /** Desired cut length (mm) of the sewn border. */
  targetLen: number;
}

/** Match resolution keyed by outline COMMAND index (same key space as cornerTypes). */
export type MatchLookup = Record<number, MatchTarget>;

/** The flattened + offset scaffolding the edge-walk operates on (Steps 1-3). */
export interface OffsetEdgeData {
  /** Flattened outline points (closing duplicate removed), tagged by source command. */
  sourced: SourcedPoint[];
  vertices: Point2D[];
  edges: Line2D[];
  edgeWidths: number[];
  offsetEdges: Line2D[];
  n: number;
}

/**
 * Flatten + build per-edge offsets for an outline (generator Steps 1-3),
 * factored out so the resolver can measure a partner border's cut length with
 * the exact same geometry the generator produces. Returns null for degenerate
 * outlines (< 3 vertices).
 */
export function buildOffsetEdges(
  outline: PathCommand[],
  saWidth: number,
  semanticEdges?: SemanticEdge[],
): OffsetEdgeData | null {
  const raw = flattenPathWithSource(outline);
  // Consecutive duplicates (CLO DXFs repeat the shared vertex where curve
  // samples join) become zero-length edges, and a zero-length edge cannot be
  // offset — offsetEdge returns it in place, pinning the cut line to the
  // outline at that vertex (maria-202). Keep the FIRST occurrence: its cmd
  // tag stays valid for cornerTypes / perEdgeWidths lookups.
  const sourced: SourcedPoint[] = [];
  for (const p of raw) {
    const prev = sourced[sourced.length - 1];
    if (prev && Math.abs(p.x - prev.x) < 1e-6 && Math.abs(p.y - prev.y) < 1e-6) continue;
    sourced.push(p);
  }
  if (sourced.length >= 2) {
    const first = sourced[0];
    const last = sourced[sourced.length - 1];
    if (Math.abs(first.x - last.x) < 1e-6 && Math.abs(first.y - last.y) < 1e-6) {
      sourced.pop();
    }
  }
  if (sourced.length < 3) return null;

  const vertices: Point2D[] = sourced.map((p) => ({ x: p.x, y: p.y }));
  const n = vertices.length;
  const edges: Line2D[] = [];
  for (let i = 0; i < n; i++) edges.push({ start: vertices[i], end: vertices[(i + 1) % n] });
  const edgeWidths = perEdgeWidths(sourced.map((p) => p.cmd), semanticEdges, saWidth);

  // `offsetEdge` shifts along the left-perpendicular of the edge direction, so
  // which side is OUTWARD depends entirely on how the outline is wound. A
  // negatively-wound piece used to get its seam allowance generated INWARD —
  // silently, and differently per piece depending on how it was authored (the
  // rectangle tool winds one way, some imports the other).
  //
  // The sign is applied to the offset DIRECTION, never to the vertex order:
  // `cornerTypes` and `semanticEdges` are keyed by outline COMMAND index, which
  // `sourced` carries, so reversing the ring would silently re-target every
  // per-vertex override. `edgeWidths` also stays positive — the corner
  // functions consume it as a scalar setback (doubleMitered's depth, envelope's
  // tab), and a negative width there would invert that geometry too.
  const winding = ringArea(vertices) < 0 ? -1 : 1;
  const offsetEdges = edges.map((e, i) => offsetEdge(e, edgeWidths[i] * winding));
  return { sourced, vertices, edges, edgeWidths, offsetEdges, n };
}

/** Mitered corner point at flattened vertex k (matches cornerMitered, incl. its parallel fallback). */
function miterAt(offsetEdges: Line2D[], n: number, k: number): Point2D {
  const prev = offsetEdges[(k - 1 + n) % n];
  const next = offsetEdges[k % n];
  const pt = lineIntersection(prev, next);
  return pt ?? { ...prev.end };
}

function polylineLength(pts: Point2D[]): number {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return s;
}

/**
 * Flattened edge indices belonging to a SemanticEdge's command range, as a
 * sorted ascending run. Returns null when the range emits no edges or the run
 * is non-contiguous / wraps the polygon closure (caller falls back to mitered).
 * ponytail: wrap-spanning borders (closing edge) are the rare case; falling back
 * to mitered there is acceptable until a real garment needs it.
 */
function edgesInBorder(sourced: SourcedPoint[], n: number, range: [number, number]): number[] | null {
  const [start, end] = range;
  const run: number[] = [];
  for (let j = 0; j < n; j++) {
    const owningCmd = sourced[(j + 1) % n].cmd;
    if (owningCmd >= start && owningCmd < end) run.push(j);
  }
  if (run.length === 0) return null;
  run.sort((a, b) => a - b);
  if (run[run.length - 1] - run[0] + 1 !== run.length) return null; // gap / wrap
  return run;
}

/**
 * Corner geometry bundle at flattened vertex `i`, computed from the exact
 * per-vertex inputs `generateSeamAllowanceWithCorners` feeds its corner
 * functions (the two offset edges, the interior angle, the per-edge widths).
 * Shared by the generator and the partner-length measurement so both read
 * identical geometry. Bundles are ordered prev-side → next-side (mitered = 1
 * point); doubleMitered/trimMirrored emit their two blunt points and are the
 * known exceptions to that ordering — irrelevant to the length measurement's
 * required cases (mitered/squared/envelope/slant).
 */
function cornerBundleAt(data: OffsetEdgeData, i: number, type: CornerType): Point2D[] {
  const { vertices, edges, edgeWidths, offsetEdges, n } = data;
  const prevOffsetEdge = offsetEdges[(i + n - 1) % n];
  const nextOffsetEdge = offsetEdges[i];
  const angle = interiorAngle(edges[(i + n - 1) % n], edges[i]);
  const prevWidth = edgeWidths[(i + n - 1) % n];
  const nextWidth = edgeWidths[i];
  return getCornerFunction(type)(prevOffsetEdge, nextOffsetEdge, vertices[i], prevWidth, nextWidth, angle);
}

/**
 * Length of a SemanticEdge's cut line (the outward SA offset polyline), built
 * with the exact geometry `generateSeamAllowanceWithCorners` uses. Used by
 * matchResolver to read a partner border's target length.
 *
 * The two EXTREME vertices of the border use the partner's REAL corner geometry
 * (`cornerTypes` / `defaultCornerType`), so a squared/envelope/… corner at a
 * border end changes the measured length exactly as it changes the real cut
 * line — the maria-164 fix ("lo primero que dices no es real"). The length runs
 * from the LAST point of the start-vertex bundle (the point that touches this
 * border) through the interior mitered joints to the FIRST point of the
 * end-vertex bundle. A partner corner typed `match` is measured MITERED: the
 * one-level anti-recursion, so measuring a partner never re-resolves its own
 * `match` corners. With no cornerTypes every corner is mitered → miter-to-miter
 * (byte-identical to the pre-fix behavior). Returns null when unmeasurable.
 */
export function measureBorderCutLength(
  outline: PathCommand[],
  saWidth: number,
  semanticEdges: SemanticEdge[] | undefined,
  segmentRange: [number, number],
  cornerTypes?: Record<number, CornerType>,
  defaultCornerType?: CornerType,
): number | null {
  const data = buildOffsetEdges(outline, saWidth, semanticEdges);
  if (!data) return null;
  const { sourced, offsetEdges, n } = data;
  const run = edgesInBorder(sourced, n, segmentRange);
  if (!run) return null;

  // One-level anti-recursion: a partner's own `match` corner is measured mitered.
  const resolveType = (cmd: number): CornerType => {
    const t = cornerTypes?.[cmd] ?? defaultCornerType ?? 'mitered';
    return t === 'match' ? 'mitered' : t;
  };

  const startV = run[0];
  const endV = (run[run.length - 1] + 1) % n;
  const startBundle = cornerBundleAt(data, startV, resolveType(sourced[startV].cmd));
  const endBundle = cornerBundleAt(data, endV, resolveType(sourced[endV].cmd));

  // start-touching point (next-side) → interior mitered joints → end-touching
  // point (prev-side). For all-mitered this is exactly miter-to-miter.
  const poly: Point2D[] = [startBundle[startBundle.length - 1]];
  for (let k = run[0] + 1; k <= run[run.length - 1]; k++) poly.push(miterAt(offsetEdges, n, k % n));
  poly.push(endBundle[0]);
  return polylineLength(poly);
}

/**
 * Slide the near endpoint of a mitered cut polyline (ordered far→near) to make
 * the total length `targetLen`. Returns the slid endpoint E and `lastRetainedIdx`
 * (the index of the last far-side miter kept before E). delta≥0 extends the last
 * segment colinearly; delta<0 walks back from the far end accumulating length,
 * clamped to keep ≥10% of the base. Returns null for a degenerate polyline.
 */
function slideMatchEndpoint(
  mitersFarToNear: Point2D[],
  targetLen: number,
): { E: Point2D; lastRetainedIdx: number } | null {
  const m = mitersFarToNear;
  const last = m.length - 1;
  if (last < 1) return null;

  const seg: number[] = [];
  let baseLen = 0;
  for (let p = 0; p < last; p++) {
    const l = Math.hypot(m[p + 1].x - m[p].x, m[p + 1].y - m[p].y);
    seg.push(l);
    baseLen += l;
  }
  if (baseLen < 1e-9) return null;

  if (targetLen >= baseLen) {
    // Extend beyond the near end along the last segment's direction.
    const l = seg[last - 1] || 1e-9;
    const ux = (m[last].x - m[last - 1].x) / l;
    const uy = (m[last].y - m[last - 1].y) / l;
    const extra = targetLen - baseLen;
    return { E: { x: m[last].x + ux * extra, y: m[last].y + uy * extra }, lastRetainedIdx: last - 1 };
  }

  // Retract; clamp to keep at least 10% of the base length.
  const target = Math.max(targetLen, 0.1 * baseLen);
  let acc = 0;
  for (let p = 0; p < last; p++) {
    if (acc + seg[p] >= target) {
      const t = (target - acc) / (seg[p] || 1e-9);
      return {
        E: { x: m[p].x + (m[p + 1].x - m[p].x) * t, y: m[p].y + (m[p + 1].y - m[p].y) * t },
        lastRetainedIdx: p,
      };
    }
    acc += seg[p];
  }
  return { E: { ...m[last - 1] }, lastRetainedIdx: last - 1 }; // numerical guard
}

/**
 * Resolve a `match` vertex into a map of per-vertex output-slot replacements.
 * Returns null → the vertex falls back to the mitered output already in `out[i]`
 * (missing border, wrap, degenerate). Operates entirely on `data.offsetEdges` —
 * independent of emit order, applied as a post-pass over the per-vertex arrays.
 *
 * The map rewrites three groups of slots:
 *  - The sewn border's own slots keep only their miter (the true cut line),
 *    dropping the redundant on-edge start point — those detour points are
 *    harmless under a full miter but poke through the retraction notch and
 *    make Clipper's largest-area pick drop the far corner.
 *  - Near-side corner slots the retraction consumes are emptied.
 *  - The match vertex slot carries the slid endpoint + the straight closure.
 */
function resolveMatchVertex(
  data: OffsetEdgeData,
  i: number,
  entry: MatchTarget,
  semanticEdges: SemanticEdge[],
): Map<number, Point2D[]> | null {
  const { sourced, offsetEdges, n } = data;
  const coveringCmd = entry.side === 'prev' ? sourced[i].cmd : sourced[(i + 1) % n].cmd;
  const border = semanticEdges.find(
    (e) => e.segmentRange[0] <= coveringCmd && coveringCmd < e.segmentRange[1],
  );
  if (!border) return null;
  const run = edgesInBorder(sourced, n, border.segmentRange);
  if (!run) return null;

  // Corner vertices spanning the border, oriented far → near (near = vertex i).
  let cornersFarToNear: number[];
  if (entry.side === 'prev') {
    if ((run[run.length - 1] + 1) % n !== i) return null; // border must end at this vertex
    cornersFarToNear = [];
    for (let k = run[0]; k <= run[run.length - 1] + 1; k++) cornersFarToNear.push(k % n);
  } else {
    if (run[0] % n !== i) return null; // border must start at this vertex
    const nearToFar: number[] = [];
    for (let k = run[0]; k <= run[run.length - 1] + 1; k++) nearToFar.push(k % n);
    cornersFarToNear = nearToFar.slice().reverse();
  }

  const miters = cornersFarToNear.map((k) => miterAt(offsetEdges, n, k));
  const slid = slideMatchEndpoint(miters, entry.targetLen);
  if (!slid) return null;

  const updates = new Map<number, Point2D[]>();
  // Sewn border slots → miter-only (strip the redundant on-edge detour point).
  for (const k of run) updates.set(k, [miterAt(offsetEdges, n, k)]);
  // Near-side corners past the retained endpoint are consumed.
  for (const v of cornersFarToNear.slice(slid.lastRetainedIdx + 1)) {
    if (v !== i) updates.set(v, []);
  }
  // The match vertex carries the slid endpoint and the straight closure.
  updates.set(
    i,
    entry.side === 'prev'
      ? [slid.E, { ...offsetEdges[i].start }] // cut endpoint, then close to the adjacent (next) offset
      : [{ ...offsetEdges[(i - 1 + n) % n].end }, slid.E], // adjacent (prev) offset, then close to cut endpoint
  );
  return updates;
}

// ─── generateSeamAllowanceWithCorners ─────────────────────────────────────

/**
 * Generate a seam allowance outline using an edge-walk algorithm with per-vertex
 * corner types. This replaces Clipper2's ClipperOffset for pieces that need
 * custom corner styles.
 *
 * Algorithm:
 *  1. Extract vertices from outline (M/L commands; skip Z).
 *  2. Build edges between consecutive vertex pairs (wrapping around).
 *  3. Offset each edge outward by saWidth (left-perpendicular).
 *  4. At each vertex, resolve the corner type and call the corner function to
 *     get the geometry points that join the two adjacent offset edges.
 *  5. Assemble the full outline: for each edge, emit the offset edge start
 *     followed by the corner geometry. Close with Z.
 *  6. Run Clipper2 SimplifyPaths to clean up any self-intersecting regions
 *     that can arise from concave corners.
 *
 * @param outline           Source path (M/L/Z commands)
 * @param saWidth           Seam allowance width in mm (must be > 0)
 * @param defaultCornerType Corner type used when a vertex has no explicit override
 * @param cornerTypes       Per-vertex overrides (key = vertex index in outline)
 * @param semanticEdges     Optional piece.edges — supplies per-edge SA widths via
 *                          `seamAllowanceWidth`; absent → uniform `saWidth`. Also
 *                          identifies the sewn border for `match` corners.
 * @param matchLookup       Optional `match`-corner resolution (command index →
 *                          {side, targetLen}, from matchResolver.buildMatchLookup).
 *                          Absent, or no entry for a vertex → mitered (byte-identical).
 */
export function generateSeamAllowanceWithCorners(
  outline: PathCommand[],
  saWidth: number,
  defaultCornerType: CornerType,
  cornerTypes: Record<number, CornerType>,
  semanticEdges?: SemanticEdge[],
  matchLookup?: MatchLookup,
): PathCommand[] {
  // ── Guard: degenerate inputs ──────────────────────────────────────────────
  if (saWidth <= 0) return [];

  // ── Steps 1-3: Flatten + build per-edge offsets ───────────────────────────
  // flattenPathWithSource linearizes C/Q/A commands so the edge-walk handles
  // curved outlines, tagging each point with its source command index (cornerTypes
  // is keyed by COMMAND index). Per-edge offsets carry the per-edge SA widths.
  const data = buildOffsetEdges(outline, saWidth, semanticEdges);
  if (!data) return [];
  const { sourced, n } = data;

  // ── Step 4 + 5: Assemble the SA outline, one array of points per vertex ────
  // out[i] = the corner bundle at vertex i, and NOTHING else. A bundle is already
  // ordered prev-side → next-side and already ends on the next edge's offset start
  // (see cornerSquared: [prevOffsetEdge.end, corner, nextOffsetEdge.start]), so
  // concatenating the bundles in vertex order IS the closed cut line.
  //
  // This used to also unshift `offsetEdges[i].start` ahead of the bundle. That is
  // the same point the bundle already ends on, emitted one slot too early — the
  // contour left vertex i toward edge i BEFORE turning the corner at vertex i, so
  // every piece's SA zigzagged across itself. It survived because the SA tests
  // only asserted a bounding box, which a scrambled contour still satisfies.
  // Fixing it makes a 300x150 rect at SA 10 return exactly the 4 points
  // (90,90) (410,90) (410,260) (90,260) — see seamAllowanceGeometry.test.ts.
  const out: Point2D[][] = [];

  for (let i = 0; i < n; i++) {
    const type: CornerType = cornerTypes[sourced[i].cmd] ?? defaultCornerType;
    out.push(cornerBundleAt(data, i, type));
  }

  // ── Step 5b: Matched corners ──────────────────────────────────────────────
  // For each `match` vertex with a resolved target, slide the sewn border's
  // cut-line endpoint to the target length and close straight to the adjacent
  // border. Anything unresolved (no lookup, no entry, missing border) leaves the
  // mitered `out[i]` in place → byte-identical to today.
  if (matchLookup && semanticEdges) {
    for (let i = 0; i < n; i++) {
      if ((cornerTypes[sourced[i].cmd] ?? defaultCornerType) !== 'match') continue;
      const entry = matchLookup[sourced[i].cmd];
      if (!entry) continue;
      const resolved = resolveMatchVertex(data, i, entry, semanticEdges);
      if (!resolved) continue;
      for (const [slot, pts] of resolved) out[slot] = pts;
    }
  }

  const resultPoints: Point2D[] = out.flat();
  if (resultPoints.length < 3) return [];

  // ── Step 6: Clean up the assembled contour ────────────────────────────────
  // Corner bundles can overlap each other on a concave vertex or a wide SA, so
  // the raw walk may self-intersect. cleanClosedContour runs the boolean Union
  // that removes those, then simplifies, then keeps the largest ring.
  //
  // simplifyPaths alone — all this step used to do — does NOT remove
  // self-intersections. Feed it a bowtie and the bowtie comes straight back; it
  // is a vertex reducer, not a topology pass. Two bugs hid behind that:
  // the paired corner bundles walked backwards at half the vertices
  // (orderPrevToNext) and a negatively-wound piece offset inward
  // (buildOffsetEdges). Both are fixed, so Union is safe here now.
  const cleaned = cleanClosedContour(resultPoints);

  if (cleaned.length < 3) {
    // Fallback: return the raw assembled path rather than nothing.
    const commands: PathCommand[] = [
      { type: 'M', values: [resultPoints[0].x, resultPoints[0].y] },
    ];
    for (let i = 1; i < resultPoints.length; i++) {
      commands.push({ type: 'L', values: [resultPoints[i].x, resultPoints[i].y] });
    }
    commands.push({ type: 'Z', values: [] });
    return commands;
  }

  const commands: PathCommand[] = [{ type: 'M', values: [cleaned[0].x, cleaned[0].y] }];
  for (let i = 1; i < cleaned.length; i++) {
    commands.push({ type: 'L', values: [cleaned[i].x, cleaned[i].y] });
  }
  commands.push({ type: 'Z', values: [] });

  return commands;
}

// ─── getCornerFunction dispatcher ─────────────────────────────────────────

/**
 * Returns the corner geometry function for the given CornerType.
 */
export function getCornerFunction(type: CornerType): CornerFunction {
  switch (type) {
    case 'mitered':
      return cornerMitered;
    case 'doubleMitered':
      return cornerDoubleMitered;
    case 'squared':
      return cornerSquared;
    case 'slant':
      return cornerSlant;
    case 'envelope':
      return cornerEnvelope;
    case 'match':
      return cornerMatch;
    case 'trimMirrored':
      return cornerTrimMirrored;
  }
}

// ─── Generic signed outline offset ────────────────────────────────────────

/** Shoelace signed area of a closed vertex ring. */
function ringArea(pts: Point2D[]): number {
  let a = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const j = (i + 1) % n;
    a += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return a / 2;
}

/**
 * Normalise a raw closed contour: drop self-intersecting lobes, collapse
 * duplicate/near-collinear vertices, and return the largest remaining ring.
 *
 * A boolean Union under NonZero is what actually removes self-intersections —
 * `Clipper.simplifyPaths` alone does NOT (feed it a bowtie and it hands the
 * bowtie straight back; verified). simplifyPaths only reduces vertices, which
 * is still wanted afterwards because Union emits duplicates at every original
 * vertex. Both of these clipper2-js entry points return correct results; it is
 * `ClipperOffset` specifically that is broken in 1.2.4 (see seam/index.ts).
 *
 * Returns [] when the contour degenerates to nothing.
 */
export function cleanClosedContour(points: Point2D[]): Point2D[] {
  if (points.length < 3) return [];

  const path = new Path64();
  for (const p of points) {
    path.push(new Point64(Math.round(p.x * CLIPPER_SCALE), Math.round(p.y * CLIPPER_SCALE)));
  }
  const subject = new Paths64();
  subject.push(path);

  const clipper = new Clipper64();
  clipper.addSubjectPaths(subject);
  const unioned = new Paths64();
  clipper.execute(ClipType.Union, FillRule.NonZero, unioned);
  if (unioned.length === 0) return [];

  const simplified = Clipper.simplifyPaths(unioned, 0.01 * CLIPPER_SCALE, true);
  const rings = simplified.length > 0 ? simplified : unioned;

  let best: Point2D[] = [];
  let bestArea = -1;
  for (const ring of rings) {
    const pts = [...ring].map((q: { x: number; y: number }) => ({
      x: q.x / CLIPPER_SCALE,
      y: q.y / CLIPPER_SCALE,
    }));
    const a = Math.abs(ringArea(pts));
    if (a > bestArea) {
      bestArea = a;
      best = pts;
    }
  }
  return best.length >= 3 ? best : [];
}

/** Join style for {@link offsetOutline}. Mirrors the offsetOutline tool options. */
export type OffsetJoin = 'round' | 'miter' | 'square';

/** Points per quarter-turn of a rounded join. */
const ARC_SEGMENTS_PER_QUARTER = 4;

/**
 * Signed parallel offset of a closed outline. Positive = outward, negative =
 * inward. Returns null when the shape collapses.
 *
 * Replaces the Clipper `ClipperOffset` path, which is broken in clipper2-js
 * 1.2.4 for every polygon (see the banner on `generateSeamAllowance`). This is
 * the same edge-walk the seam allowance engine uses — offset each edge along
 * its normal, then resolve each vertex — with the join styles the offset tool
 * exposes, plus a Union-based cleanup for the self-intersections an inward
 * offset can create.
 *
 * The outline's winding is normalised first, so `distance > 0` means outward
 * regardless of how the piece was authored.
 */
export function offsetOutline(
  outline: PathCommand[],
  distance: number,
  join: OffsetJoin = 'round',
): PathCommand[] | null {
  if (distance === 0) {
    return outline.map((c) => ({ type: c.type, values: [...c.values] }));
  }

  // buildOffsetEdges normalises the winding, so a positive distance is outward
  // regardless of how the piece was authored.
  const data = buildOffsetEdges(outline, distance);
  if (!data) return null;
  const { vertices, edges, offsetEdges, n } = data;

  // Collapse guard. An inward offset larger than the shape's inradius produces
  // an INVERTED result — for a 60x60 square inset 40mm you get a tidy 20x20
  // rectangle with the right winding and a positive area, so neither
  // orientation nor area catches it. What does catch it: an edge that reverses
  // direction. A valid offset may shorten an edge to nothing, never flip it.
  for (let i = 0; i < n; i++) {
    const a = miterAt(offsetEdges, n, i);
    const b = miterAt(offsetEdges, n, (i + 1) % n);
    const src = edges[i];
    const dot =
      (b.x - a.x) * (src.end.x - src.start.x) + (b.y - a.y) * (src.end.y - src.start.y);
    if (dot < 0) return null;
  }

  const raw: Point2D[] = [];
  for (let i = 0; i < n; i++) {
    const prev = offsetEdges[(i + n - 1) % n];
    const next = offsetEdges[i];
    const prevDir = lineDir(prev);
    const nextDir = lineDir(next);
    // Turn direction at this vertex. With normalised winding, a positive cross
    // is the side the offset expands into — the only side that needs an arc or
    // a bevel. The other side is a plain miter (the offset lines already cross).
    const cross = prevDir.x * nextDir.y - prevDir.y * nextDir.x;
    const expanding = cross * distance > 0;

    if (!expanding || join === 'miter') {
      raw.push(miterAt(offsetEdges, n, i));
      continue;
    }

    const from = { ...prev.end };
    const to = { ...next.start };
    if (join === 'square') {
      raw.push(from, to);
      continue;
    }
    raw.push(...arcBetween(vertices[i], from, to, Math.abs(distance)));
  }

  const cleaned = cleanClosedContour(raw);
  if (cleaned.length < 3) return null;

  const commands: PathCommand[] = [{ type: 'M', values: [cleaned[0].x, cleaned[0].y] }];
  for (let i = 1; i < cleaned.length; i++) {
    commands.push({ type: 'L', values: [cleaned[i].x, cleaned[i].y] });
  }
  commands.push({ type: 'Z', values: [] });
  return commands;
}

/** Circular arc from `from` to `to` around `centre`, taking the short way. */
function arcBetween(centre: Point2D, from: Point2D, to: Point2D, radius: number): Point2D[] {
  const a0 = Math.atan2(from.y - centre.y, from.x - centre.x);
  const a1 = Math.atan2(to.y - centre.y, to.x - centre.x);
  let sweep = a1 - a0;
  while (sweep > Math.PI) sweep -= Math.PI * 2;
  while (sweep < -Math.PI) sweep += Math.PI * 2;

  const steps = Math.max(1, Math.ceil((Math.abs(sweep) / (Math.PI / 2)) * ARC_SEGMENTS_PER_QUARTER));
  const pts: Point2D[] = [];
  for (let k = 0; k <= steps; k++) {
    const a = a0 + (sweep * k) / steps;
    pts.push({ x: centre.x + Math.cos(a) * radius, y: centre.y + Math.sin(a) * radius });
  }
  return pts;
}
