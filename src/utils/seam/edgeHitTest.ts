import type { PathCommand, PatternPiece, Point2D, SemanticEdge } from '../../types/types';
import { flattenPathWithSource } from './index';
import { detectCornerCommands } from '../outlineAnalysis';
import { patternToPieceLocal } from '../geometry/pieceSpace';

interface OutlineBBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

interface OutlineMemo {
  flat: ReturnType<typeof flattenPathWithSource> | null;
  bbox: OutlineBBox;
}

/** Immer cambia la identidad del contorno solo cuando cambia su geometría. */
const outlineMemo = new WeakMap<PathCommand[], OutlineMemo>();
const cornerMemo = new WeakMap<PathCommand[], Set<number>>();

function memoForOutline(outline: PathCommand[]): OutlineMemo {
  const cached = outlineMemo.get(outline);
  if (cached) return cached;

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  let currentX = 0, currentY = 0, startX = 0, startY = 0;
  const seen = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };
  for (const command of outline) {
    const values = command.values;
    if (command.type === 'M' || command.type === 'L') {
      currentX = values[0]; currentY = values[1];
      if (command.type === 'M') { startX = currentX; startY = currentY; }
      seen(currentX, currentY);
    } else if (command.type === 'H') {
      currentX = values[0];
      seen(currentX, currentY);
    } else if (command.type === 'V') {
      currentY = values[0];
      seen(currentX, currentY);
    } else if (command.type === 'A') {
      const endX = values[5];
      const endY = values[6];
      // El aplanador canónico representa A por su extremo; la caja sigue esa
      // misma geometría para no convertir el radio en un blanco de cuerpo.
      seen(currentX, currentY);
      seen(endX, endY);
      currentX = endX; currentY = endY;
    } else if (command.type === 'Z') {
      currentX = startX; currentY = startY;
      seen(currentX, currentY);
    } else {
      // C/Q/S/T: sus controles y extremo vienen como pares absolutos; la
      // envolvente de los controles contiene la curva de Bézier.
      for (let i = 0; i + 1 < values.length; i += 2) seen(values[i], values[i + 1]);
      if (values.length >= 2) {
        currentX = values[values.length - 2];
        currentY = values[values.length - 1];
      }
    }
  }

  const entry = { flat: null, bbox: { minX, maxX, minY, maxY } };
  outlineMemo.set(outline, entry);
  return entry;
}

function flattenedOutline(outline: PathCommand[]) {
  const memo = memoForOutline(outline);
  memo.flat ??= flattenPathWithSource(outline);
  return memo.flat;
}

function bboxContains(bbox: OutlineBBox, point: Point2D, margin = 0): boolean {
  return point.x >= bbox.minX - margin && point.x <= bbox.maxX + margin
    && point.y >= bbox.minY - margin && point.y <= bbox.maxY + margin;
}

/** Distance from point p to segment a→b. */
function distToSegment(p: Point2D, a: Point2D, b: Point2D): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * Pick the SemanticEdge nearest a click point (piece-local coords), for the
 * seam-allowance tool's per-edge width gesture.
 *
 * Finds the nearest outline segment over the FLATTENED outline — curves are
 * sampled, not reduced to their endpoint chord — and maps the winning sample
 * back to its source COMMAND index through `flattenPathWithSource`'s tag (the
 * same index space `detectSemanticEdges`/`segmentRange` use). Then returns the
 * SemanticEdge whose segmentRange [start,end) covers that command. Returns null
 * when the click is beyond `maxDist`, or the nearest segment has no covering
 * edge (e.g. the closing edge of an implicitly-closed outline, which carries no
 * SemanticEdge — `flattenPathWithSource` tags the Z point with the M's index).
 *
 * This used to walk commands and measure a C/Q against the straight line
 * between its endpoints. On a curved border that is the wrong geometry by the
 * whole sagitta: with the arc of María's piece (90mm off its chord, #213),
 * clicking exactly ON the border measured 90mm away and resolved to nothing —
 * the edge was unselectable — while clicking in open space over the chord
 * selected it. Both directions are fixed by measuring the real trace.
 */
export function pickEdgeForSeamAllowance(
  outline: PathCommand[],
  edges: SemanticEdge[],
  point: Point2D,
  maxDist: number,
): SemanticEdge | null {
  if (!edges.length) return null;

  const flat = flattenedOutline(outline);
  let bestCmd = -1;
  let bestDist = Infinity;

  // Segment j→j+1 belongs to the command that EMITTED its endpoint: a C command
  // emits `resolution` points that all carry its index, so every sub-segment of
  // the curve resolves to the curve's own command.
  for (let j = 0; j + 1 < flat.length; j++) {
    const d = distToSegment(point, flat[j], flat[j + 1]);
    if (d < bestDist) { bestDist = d; bestCmd = flat[j + 1].cmd; }
  }

  if (bestCmd < 0 || bestDist > maxDist) return null;
  return edges.find((e) => e.segmentRange[0] <= bestCmd && bestCmd < e.segmentRange[1]) ?? null;
}

/**
 * Nearest outline CORNER to a piece-local point, within `maxDist`. Returns the
 * corner's COMMAND index (the same key space as cornerTypes / corner editing),
 * or null. Curve endpoints are not targeted (matches the existing corner-edit
 * behavior).
 *
 * Solo las esquinas de verdad son blanco. Esto antes aceptaba cualquier `M`/`L`,
 * lo cual es lo mismo en un rectángulo dibujado a mano y es ruido en un patrón
 * importado: un DXF entrega las curvas como polilíneas densas de `L`, así que
 * cada muestra de la curva era un blanco de vértice — y el vértice gana siempre
 * al borde en `resolveSeamAllowanceClick`. Medido sobre el DXF de producción de
 * María, al zoom con el que se ve el patrón entero: 862 de 882 clics ENCIMA del
 * contorno (98%) seleccionaban un "vértice" que nadie había dibujado, en vez del
 * borde cuyo margen ella quería editar ("hay veces que clicando curvas no hace
 * nada", maria #220). Zoom 15× adentro las muestras se separan lo bastante y
 * caía al 29%: de ahí su "hay veces".
 *
 * El tipo de esquina en un vértice que gira 0.5° tampoco pinta nada distinto,
 * así que no se pierde ningún blanco útil.
 */
export function findNearestOutlineVertex(
  outline: PathCommand[],
  point: Point2D,
  maxDist: number,
): { index: number; dist: number } | null {
  // Las esquinas se detectan una vez por contorno: con hover esto corre en
  // cada movimiento y `detectCornerCommands` aplana el contorno entero.
  let corners = cornerMemo.get(outline);
  if (!corners) {
    corners = detectCornerCommands(outline);
    cornerMemo.set(outline, corners);
  }
  if (corners.size === 0) return null;
  let best: { index: number; dist: number } | null = null;
  for (let i = 0; i < outline.length; i++) {
    const cmd = outline[i];
    if (cmd.type !== 'M' && cmd.type !== 'L') continue;
    if (!corners.has(i)) continue;
    const d = Math.hypot(cmd.values[0] - point.x, cmd.values[1] - point.y);
    if (d <= maxDist && (!best || d < best.dist)) best = { index: i, dist: d };
  }
  return best;
}

/** Where a seamAllowance-tool left-click landed: a vertex, an edge, or the piece body. */
export type SAClickTarget =
  | { kind: 'vertex'; pieceId: string; vertexIndex: number }
  | { kind: 'edge'; pieceId: string; edgeId: string }
  | { kind: 'piece'; pieceId: string };

/**
 * Classify a seamAllowance-tool left-click (pattern-space point) against the
 * pieces. La primera pieza gana; el llamador pasa las dibujables de arriba a
 * abajo. Precise targets win: a nearby VERTEX (corner editing) first, then a
 * nearby EDGE (per-edge width), across all pieces; falling back to the PIECE
 * whose bbox contains the point (whole-piece apply — the bulk seed). Returns
 * null on empty canvas. Precedence (vertex > edge) mirrors the tighter target.
 */
export function resolveSeamAllowanceClick(
  pieces: PatternPiece[],
  patternPoint: Point2D,
  maxVertexDist: number,
  maxEdgeDist: number,
): SAClickTarget | null {
  const preciseMargin = Math.max(maxVertexDist, maxEdgeDist);
  // Pass 1: precise vertex/edge targets (across all pieces).
  for (const piece of pieces) {
    if (!piece.outline?.length) continue;
    // Por el transform del renderizador, no restando solo la posición: desde
    // #1033 el giro vive en `piece.rotation` y no en el contorno, así que una
    // pieza girada se estaba midiendo contra su fantasma sin girar (#1064).
    const local = patternToPieceLocal(patternPoint, piece);
    // Con hover, este rechazo evita aplanar cada pieza lejana en cada frame.
    if (!bboxContains(memoForOutline(piece.outline).bbox, local, preciseMargin)) continue;
    const v = findNearestOutlineVertex(piece.outline, local, maxVertexDist);
    if (v) return { kind: 'vertex', pieceId: piece.id, vertexIndex: v.index };
    const edge = piece.edges?.length
      ? pickEdgeForSeamAllowance(piece.outline, piece.edges, local, maxEdgeDist)
      : null;
    if (edge) return { kind: 'edge', pieceId: piece.id, edgeId: edge.id };
  }
  // Pass 2: the piece body (bbox containment) — the whole-piece apply target.
  for (const piece of pieces) {
    if (!piece.outline?.length) continue;
    // La caja se mide en LOCAL y el punto se trae hasta ahí. Construirla en
    // espacio de patrón sumando la posición daba la caja del fantasma sin
    // girar; traer el punto, además, da la caja ORIENTADA de balde — que es la
    // que de verdad ocupa la pieza, no su envolvente eje-alineada.
    const local = patternToPieceLocal(patternPoint, piece);
    if (bboxContains(memoForOutline(piece.outline).bbox, local)) {
      return { kind: 'piece', pieceId: piece.id };
    }
  }
  return null;
}
