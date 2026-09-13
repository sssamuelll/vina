/**
 * Advanced Patternmaking Operations — atomic operations every patronista needs.
 *
 * All functions are pure: take a PatternPiece, return a new one (or new pieces).
 * SemanticEdges and Darts are preserved or updated where possible.
 *
 * @module patternOps
 */

import type { PatternPiece, PathCommand, SemanticEdge, Dart, Point2D } from '../types/types';
import { findOutlineIntersections, splitOutlineAtPoints } from './geometry/splitOutline';
import { findSharedEdge, mergeOutlines } from './geometry/mergeOutline';
import { detectSemanticEdges, findEdgeByName } from './semanticEdges';
import { applyDartsToInternals } from './dartEntity';
import { getEdgeEndpoints } from './geometry/path';
import { offsetOutline, type OffsetJoin } from './seam/cornerTypes';
import { samplePathAtIntervals } from './geometry/arcLength';
import { fitCubicBezier, rdpSimplify } from './geometry/bezier';
import { linePolylineIntersections } from './geometry/lineIntersect';
import { findSlashIntersections, buildSpreadPiece } from './geometry/slashAndSpread';
import { newId } from './ids';
import { patternToPieceLocal } from './geometry/pieceSpace';
export { buildSpreadPiece } from './geometry/slashAndSpread';

// B11-state: thin wrapper. Prefix retained in signature for backward
// compatibility but ignored. The previous `let _counter = 0` is gone.
function uid(_prefix: string): string { return newId(); }

// ─── Helpers ──────────────────────────────────────────────────────────────────

// OJO con el id: clona con identidad NUEVA porque el caso original era partir
// una pieza en dos. Toda op que modifica en sitio tiene que pasar
// `{ id: piece.id }` — si no, el `updatePiece(result)` del tool matchea por id,
// no encuentra nada y no hace NADA, mientras el tool responde success. Así
// estuvieron mudos `addFullness` y `transferDart` hasta #1009.
function clonePiece(piece: PatternPiece, overrides?: Partial<PatternPiece>): PatternPiece {
  const clon: PatternPiece = {
    ...piece,
    id: uid('piece'),
    outline: piece.outline.map(c => ({ ...c, values: [...c.values] })),
    internals: piece.internals.map(i => ({ ...i, path: i.path.map(c => ({ ...c, values: [...c.values] })) })),
    edges: piece.edges ? [...piece.edges] : undefined,
    darts: piece.darts ? [...piece.darts] : undefined,
    updatedAt: Date.now(),
    ...overrides,
  };

  // Identidad nueva, pieza nueva: hereda la geometría y nada de la identidad.
  // Con `{ id: piece.id }` —las ops en sitio de arriba— no se toca nada, porque
  // ahí sigue siendo la MISMA pieza y borrarle el vínculo la desvincularía cada
  // vez que se le estira un borde.
  //
  // Sin esto, cortar con Tijeras una pieza vinculada da dos mitades apuntando
  // a la compañera; el `updatePiece` del auto-cosido —mismo gesto— despierta
  // `linkedEditingMiddleware`, que le escribe a la compañera el contorno de una
  // mitad y su pieza entera desaparece, dentro del mismo lote de deshacer
  // (#1126, quinto sitio: el censo por `JSON.parse(JSON.stringify)` no ve este
  // `...piece`).
  if (clon.id !== piece.id) {
    if (!overrides || !('linkedPieceId' in overrides)) clon.linkedPieceId = undefined;
    if (!overrides || !('linkMode' in overrides)) clon.linkMode = undefined;
    if (!overrides || !('createdAt' in overrides)) clon.createdAt = Date.now();
  }

  return clon;
}

function outlineBBox(outline: PathCommand[]): { minX: number; maxX: number; minY: number; maxY: number } {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const cmd of outline) {
    for (let i = 0; i < cmd.values.length; i += 2) {
      const x = cmd.values[i], y = cmd.values[i + 1];
      if (isFinite(x) && isFinite(y)) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  return { minX, maxX, minY, maxY };
}

// ─── splitPieceAxis ──────────────────────────────────────────────────────────

/**
 * Split a piece along a horizontal or vertical line.
 * Returns two new pieces: [upper/left, lower/right].
 *
 * @param piece - Source piece
 * @param axis - 'horizontal' (split at Y) or 'vertical' (split at X)
 * @param position - Y or X coordinate to split at (in piece local coords)
 */
export function splitPieceAxis(
  piece: PatternPiece,
  axis: 'horizontal' | 'vertical',
  position: number,
): [PatternPiece, PatternPiece] {
  const bbox = outlineBBox(piece.outline);
  const isHorizontal = axis === 'horizontal';

  // Create two bounding rectangles as simplified outlines
  const pieceA = clonePiece(piece, {
    name: `${piece.name} (upper)`,
    outline: isHorizontal ? [
      { type: 'M', values: [bbox.minX, bbox.minY] },
      { type: 'L', values: [bbox.maxX, bbox.minY] },
      { type: 'L', values: [bbox.maxX, position] },
      { type: 'L', values: [bbox.minX, position] },
      { type: 'Z', values: [] },
    ] : [
      { type: 'M', values: [bbox.minX, bbox.minY] },
      { type: 'L', values: [position, bbox.minY] },
      { type: 'L', values: [position, bbox.maxY] },
      { type: 'L', values: [bbox.minX, bbox.maxY] },
      { type: 'Z', values: [] },
    ],
    edges: undefined, // Edges invalidated by split
  });

  const pieceB = clonePiece(piece, {
    name: `${piece.name} (lower)`,
    outline: isHorizontal ? [
      { type: 'M', values: [bbox.minX, position] },
      { type: 'L', values: [bbox.maxX, position] },
      { type: 'L', values: [bbox.maxX, bbox.maxY] },
      { type: 'L', values: [bbox.minX, bbox.maxY] },
      { type: 'Z', values: [] },
    ] : [
      { type: 'M', values: [position, bbox.minY] },
      { type: 'L', values: [bbox.maxX, bbox.minY] },
      { type: 'L', values: [bbox.maxX, bbox.maxY] },
      { type: 'L', values: [position, bbox.maxY] },
      { type: 'Z', values: [] },
    ],
    edges: undefined,
  });

  return [pieceA, pieceB];
}

// Backward-compatible alias
export { splitPieceAxis as splitPiece };

// ─── splitPieceAtLine ────────────────────────────────────────────────────────

/**
 * Split a piece along an arbitrary line from startPoint to endPoint.
 * Returns two new pieces with curve-preserving outlines.
 * Points are in pattern space (absolute coordinates).
 */
export function splitPieceAtLine(
  piece: PatternPiece,
  startPoint: Point2D,
  endPoint: Point2D,
): [PatternPiece, PatternPiece] {
  // Restar la posición NO es bajar a local: con la pieza girada da el punto
  // girado sin trasladar, que cae en otro sitio. La línea deja de tocar el
  // contorno donde la usuaria la dibujó — y lo peor no es que reviente, es
  // que corta igual, por donde nadie pidió (#1116, hermano de #1064).
  const localStart = patternToPieceLocal(startPoint, piece);
  const localEnd = patternToPieceLocal(endPoint, piece);

  const hits = findOutlineIntersections(piece.outline, localStart, localEnd);
  if (hits.length < 2) {
    throw new Error('Cut line must intersect the outline at exactly 2 points');
  }

  const [outlineA, outlineB] = splitOutlineAtPoints(piece.outline, hits[0], hits[1]);

  const pieceA: PatternPiece = clonePiece(piece, {
    name: `${piece.name} (A)`,
    outline: outlineA,
    internals: [],
    edges: undefined,
    darts: undefined,
  });

  const pieceB: PatternPiece = clonePiece(piece, {
    name: `${piece.name} (B)`,
    outline: outlineB,
    internals: [],
    position: { x: piece.position.x + 15, y: piece.position.y },
    edges: undefined,
    darts: undefined,
  });

  return [pieceA, pieceB];
}

// ─── mergePieces ─────────────────────────────────────────────────────────────

/**
 * Merge two adjacent pieces into one piece.
 * The pieces must share an adjacent edge (within tolerance).
 * Returns the merged piece, or throws if no shared edge is found.
 */
export function mergePieces(
  pieceA: PatternPiece,
  pieceB: PatternPiece,
  tolerance: number = 2,
): PatternPiece {
  const shared = findSharedEdge(
    pieceA.outline, pieceA.position,
    pieceB.outline, pieceB.position,
    tolerance,
  );

  if (!shared) {
    throw new Error('No shared edge found between pieces');
  }

  const mergedOutline = mergeOutlines(
    pieceA.outline, pieceA.position,
    pieceB.outline, pieceB.position,
    shared,
  );

  return clonePiece(pieceA, {
    name: `${pieceA.name} + ${pieceB.name}`,
    outline: mergedOutline,
    position: { x: 0, y: 0 },
    internals: [...pieceA.internals, ...pieceB.internals],
    edges: undefined,
    darts: [...(pieceA.darts ?? []), ...(pieceB.darts ?? [])],
  });
}

// ─── addFullness ──────────────────────────────────────────────────────────────

export type FullnessMethod = 'gather' | 'pleat' | 'flare';

/**
 * Add fullness at an edge by scaling the piece width at that region.
 *
 * @param piece - Source piece
 * @param edge - 'top' | 'bottom' | 'left' | 'right' or edge name
 * @param amount - Amount in mm to add
 * @param method - 'gather', 'pleat', or 'flare'
 */
export function addFullness(
  piece: PatternPiece,
  edge: string,
  amount: number,
  method: FullnessMethod = 'gather',
): PatternPiece {
  const result = clonePiece(piece, {
    id: piece.id, // modifica en sitio: el tool despacha updatePiece
    name: piece.name,
    edges: undefined, // Edges invalidated
  });

  const isBottom = edge === 'bottom' || edge === 'hemline';
  const isTop = edge === 'top' || edge === 'waistline' || edge === 'shoulder';

  // Scale outline commands at the affected edge
  const bbox = outlineBBox(result.outline);
  const halfAdd = amount / 2;

  for (const cmd of result.outline) {
    if (cmd.type === 'M' || cmd.type === 'Z') continue;
    for (let i = 0; i < cmd.values.length; i += 2) {
      const y = cmd.values[i + 1];
      if (!isFinite(y)) continue;

      const relY = (y - bbox.minY) / (bbox.maxY - bbox.minY);
      let scale = 0;

      if (isBottom && relY > 0.7) {
        scale = (relY - 0.7) / 0.3; // Gradual from 70% to 100%
      } else if (isTop && relY < 0.3) {
        scale = (0.3 - relY) / 0.3;
      }

      if (scale > 0) {
        // Expand X outward from center
        const cx = (bbox.minX + bbox.maxX) / 2;
        const dx = cmd.values[i] - cx;
        cmd.values[i] = cx + dx + (dx > 0 ? halfAdd * scale : -halfAdd * scale);
      }
    }
  }

  // Add internal line to indicate fullness type
  if (method === 'pleat' || method === 'gather') {
    const midX = (bbox.minX + bbox.maxX) / 2;
    const y = isBottom ? bbox.maxY : bbox.minY;
    result.internals.push({
      id: uid('fullness'),
      type: 'fold' as const,
      path: [
        { type: 'M' as const, values: [midX - amount / 4, y] },
        { type: 'L' as const, values: [midX + amount / 4, y] },
      ],
    });
  }

  return result;
}

// ─── addFacing ────────────────────────────────────────────────────────────────

/**
 * Create a facing piece from an edge of a pattern piece.
 * The facing mirrors the edge contour with a given width.
 *
 * @param piece - Source piece
 * @param edgeName - Name of the edge to face (e.g., 'neckline', 'armhole')
 * @param width - Facing width in mm (default 40mm)
 */
export function addFacing(
  piece: PatternPiece,
  edgeName: string,
  width: number = 40,
): PatternPiece {
  const edge = piece.edges?.find(e =>
    e.name.toLowerCase().includes(edgeName.toLowerCase())
  );

  const bbox = outlineBBox(piece.outline);
  let facingOutline: PathCommand[];

  if (edge) {
    // Use edge segment range to extract contour
    const start = edge.segmentRange[0];
    const end = edge.segmentRange[1];
    const edgeCmds = piece.outline.slice(start, end);

    // Create facing: edge contour + offset contour
    facingOutline = [
      ...edgeCmds.map(c => ({ ...c, values: [...c.values] })),
      // Offset path (simplified: shift by width in Y). Displaced geometry,
      // not a 1:1 clone of the edge — born without authoredAnchor/manualBezier.
      ...edgeCmds.map(c => ({
        type: c.type as PathCommand['type'],
        values: c.values.map((v, i) => i % 2 === 1 ? v + width : v),
      })).reverse(),
      { type: 'Z' as const, values: [] },
    ];
  } else {
    // Fallback: create a rectangular facing at the top edge
    facingOutline = [
      { type: 'M', values: [bbox.minX, bbox.minY] },
      { type: 'L', values: [bbox.maxX, bbox.minY] },
      { type: 'L', values: [bbox.maxX, bbox.minY + width] },
      { type: 'L', values: [bbox.minX, bbox.minY + width] },
      { type: 'Z', values: [] },
    ];
  }

  return clonePiece(piece, {
    name: `${piece.name} Facing`,
    outline: facingOutline,
    internals: [],
    category: 'facing',
    edges: undefined,
    darts: undefined,
    grainLine: undefined,
  });
}

// ─── slashAndSpread (delegated to geometry module) ────────────────────────────

/**
 * Slash and spread: simplified backward-compatible API.
 * Slashes vertically at slashX and spreads by spreadAmount mm (parallel mode).
 * For full control (pivot, angles, gap fill), use buildSpreadPiece directly.
 *
 * @param piece - Source piece
 * @param slashX - X position of the vertical slash line
 * @param spreadAmount - Amount to spread in mm
 */
export function slashAndSpread(
  piece: PatternPiece,
  slashX: number,
  spreadAmount: number,
): PatternPiece {
  // Compute bounding box to extend the slash line beyond the piece
  const bbox = outlineBBox(piece.outline);
  const start = { x: slashX, y: bbox.minY - 10 };
  const end = { x: slashX, y: bbox.maxY + 10 };

  const [hit1, hit2] = findSlashIntersections(piece.outline, start, end);
  // halfA is the segment between hit1 and hit2 going forward along the outline,
  // which for a vertical slash at slashX is the right-hand side of the piece.
  // We spread halfA (the right half) to preserve backward-compatible behaviour.
  return buildSpreadPiece(piece, hit1, hit2, 'A', 'start', spreadAmount, 'parallel', 'straight');
}

// ─── transferDart ─────────────────────────────────────────────────────────────

/**
 * Transfer a dart from one edge to another (conceptual: removes old dart, adds new one).
 *
 * @param piece - Source piece with darts
 * @param fromDartId - ID of the dart to transfer
 * @param toEdgeName - Name of the target edge
 */
export function transferDart(
  piece: PatternPiece,
  fromDartId: string,
  toEdgeName: string,
): PatternPiece {
  const result = clonePiece(piece, { id: piece.id }); // modifica en sitio
  const darts = result.darts ?? [];
  const dartIdx = darts.findIndex(d => d.id === fromDartId);
  if (dartIdx === -1) return result;

  const oldDart = darts[dartIdx];
  const targetEdge = findEdgeByName(result.edges ?? [], toEdgeName);

  if (!targetEdge) return result;

  // Create new dart on target edge
  const bbox = outlineBBox(result.outline);
  const edgeMidX = (bbox.minX + bbox.maxX) / 2;
  const edgeMidY = targetEdge.segmentRange[0] < result.outline.length / 2
    ? bbox.minY + (bbox.maxY - bbox.minY) * 0.2  // top edge
    : bbox.maxY - (bbox.maxY - bbox.minY) * 0.2; // bottom edge

  const newDart: Dart = {
    // Misma pinza, otro borde: conservar el id mantiene viva la referencia que
    // el copilot ya tiene y deja la escritura de vuelta como update en sitio.
    id: oldDart.id,
    intake: oldDart.intake,
    apex: { x: edgeMidX, y: (bbox.minY + bbox.maxY) / 2 },
    legs: [
      [{ x: edgeMidX - oldDart.intake / 2, y: edgeMidY }, { x: edgeMidX, y: (bbox.minY + bbox.maxY) / 2 }],
      [{ x: edgeMidX, y: (bbox.minY + bbox.maxY) / 2 }, { x: edgeMidX + oldDart.intake / 2, y: edgeMidY }],
    ],
    edgeId: targetEdge.id,
    foldDirection: 'toward-center',
    depth: oldDart.depth,
  };

  // Remove old, add new
  darts.splice(dartIdx, 1, newDart);
  result.darts = darts;
  // Y de vuelta al almacenamiento: el lienzo 2D dibuja `internals`, no `darts`.
  // Sin esta línea la pinza se mueve solo en Redux (#1016).
  result.internals = applyDartsToInternals(result, darts);

  return result;
}

// ─── trueSeam ─────────────────────────────────────────────────────────────────

/**
 * Compute seam length for an edge (walk the outline segments).
 */
export function measureEdgeLength(piece: PatternPiece, edge: SemanticEdge): number {
  let length = 0;
  let cx = 0, cy = 0;

  for (let i = 0; i < piece.outline.length; i++) {
    const cmd = piece.outline[i];
    let ex = cx, ey = cy;

    switch (cmd.type) {
      case 'M': ex = cmd.values[0]; ey = cmd.values[1]; break;
      case 'L': ex = cmd.values[0]; ey = cmd.values[1]; break;
      case 'C': ex = cmd.values[4]; ey = cmd.values[5]; break;
      default: break;
    }

    if (i >= edge.segmentRange[0] && i < edge.segmentRange[1] && cmd.type !== 'M') {
      const dx = ex - cx, dy = ey - cy;
      length += Math.sqrt(dx * dx + dy * dy);
    }

    cx = ex; cy = ey;
  }

  return Math.round(length * 100) / 100;
}

// ─── findCutEdgePair ──────────────────────────────────────────────────────────

/**
 * Compute the midpoint of an edge's segments on a piece outline.
 * Uses the average of all segment midpoints weighted by segment length.
 */
function computeEdgeMidpoint(
  piece: PatternPiece,
  edge: SemanticEdge,
): { x: number; y: number; arcLength: number } {
  let cx = 0, cy = 0;
  let totalLength = 0;
  let midX = 0, midY = 0;

  for (let i = 0; i < piece.outline.length; i++) {
    const cmd = piece.outline[i];
    let ex = cx, ey = cy;

    switch (cmd.type) {
      case 'M': ex = cmd.values[0]; ey = cmd.values[1]; break;
      case 'L': ex = cmd.values[0]; ey = cmd.values[1]; break;
      case 'C': ex = cmd.values[4]; ey = cmd.values[5]; break;
      default: break;
    }

    if (i >= edge.segmentRange[0] && i < edge.segmentRange[1] && cmd.type !== 'M') {
      const dx = ex - cx, dy = ey - cy;
      const segLen = Math.sqrt(dx * dx + dy * dy);
      const segMidX = (cx + ex) / 2;
      const segMidY = (cy + ey) / 2;
      midX += segMidX * segLen;
      midY += segMidY * segLen;
      totalLength += segLen;
    }

    cx = ex; cy = ey;
  }

  if (totalLength === 0) return { x: 0, y: 0, arcLength: 0 };
  return {
    x: midX / totalLength,
    y: midY / totalLength,
    arcLength: totalLength,
  };
}

/**
 * After splitting a piece, find the pair of edges on pieceA and pieceB
 * that correspond to the cut line. These edges will be at the same
 * spatial location with opposite normals.
 *
 * Algorithm:
 * 1. Detect semantic edges on both pieces.
 * 2. Compute midpoints for each edge (in pattern space, accounting for piece position).
 * 3. Find the pair with closest midpoints (within 20mm tolerance, accounting for
 *    the 15px position offset applied to pieceB after split).
 * 4. Verify similar arc lengths (within 5% tolerance).
 * 5. Return the matching pair, or null if no good match.
 */
export function findCutEdgePair(
  pieceA: PatternPiece,
  pieceB: PatternPiece,
): { edgeA: SemanticEdge; edgeB: SemanticEdge; edgesA: SemanticEdge[]; edgesB: SemanticEdge[] } | null {
  // Step 1: Detect semantic edges if not already present
  const edgesA = pieceA.edges && pieceA.edges.length > 0
    ? pieceA.edges
    : detectSemanticEdges(pieceA);
  const edgesB = pieceB.edges && pieceB.edges.length > 0
    ? pieceB.edges
    : detectSemanticEdges(pieceB);

  if (edgesA.length === 0 || edgesB.length === 0) return null;

  const MIDPOINT_TOLERANCE = 20; // mm
  const ARC_LENGTH_TOLERANCE = 0.05; // 5%

  let bestPair: { edgeA: SemanticEdge; edgeB: SemanticEdge; edgesA: SemanticEdge[]; edgesB: SemanticEdge[] } | null = null;
  let bestDist = Infinity;

  for (const eA of edgesA) {
    const midA = computeEdgeMidpoint(pieceA, eA);
    // Convert to pattern space
    const patMidAx = midA.x + pieceA.position.x;
    const patMidAy = midA.y + pieceA.position.y;

    for (const eB of edgesB) {
      const midB = computeEdgeMidpoint(pieceB, eB);
      // Convert to pattern space
      const patMidBx = midB.x + pieceB.position.x;
      const patMidBy = midB.y + pieceB.position.y;

      const dist = Math.hypot(patMidAx - patMidBx, patMidAy - patMidBy);

      if (dist > MIDPOINT_TOLERANCE) continue;

      // Verify similar arc lengths (within 5%)
      const lenA = midA.arcLength;
      const lenB = midB.arcLength;
      if (lenA === 0 || lenB === 0) continue;
      const ratio = Math.min(lenA, lenB) / Math.max(lenA, lenB);
      if (ratio < 1 - ARC_LENGTH_TOLERANCE) continue;

      if (dist < bestDist) {
        bestDist = dist;
        bestPair = { edgeA: eA, edgeB: eB, edgesA, edgesB };
      }
    }
  }

  return bestPair;
}

// ─── offsetPieceOutline ──────────────────────────────────────────────────────

/**
 * Offset a piece's outline by a distance. Positive = outward, negative = inward.
 * Returns new PathCommand[] or null if the offset collapses the shape.
 *
 * Delegates to the seam engine's edge-walk. This used to drive Clipper's
 * `ClipperOffset` directly (outward via generateSeamAllowance, inward via a
 * hand-rolled call), which is broken in clipper2-js 1.2.4 for every polygon —
 * it returned 6 points for a convex quad and could shrink a shape on an outward
 * offset. See the banner on `generateSeamAllowance` in utils/seam/index.ts.
 */
export function offsetPieceOutline(
  piece: PatternPiece,
  distance: number,
  joinType: OffsetJoin = 'round',
): PathCommand[] | null {
  return offsetOutline(piece.outline, distance, joinType);
}

// ─── extendEdge ──────────────────────────────────────────────────────────────

/**
 * Extend an edge at its start or end by a distance along its tangent direction.
 * Returns a new PatternPiece with modified outline.
 */
export function extendEdge(
  piece: PatternPiece,
  segmentIndex: number,
  endpoint: 'start' | 'end',
  distance: number,
): PatternPiece {
  const newPiece = clonePiece(piece, { id: piece.id });
  const cmds = [...newPiece.outline.map(c => ({ ...c, values: [...c.values] }))];

  const ep = getEdgeEndpoints(cmds, segmentIndex);
  if (!ep) return newPiece;

  // Compute tangent direction
  const dx = ep.end.x - ep.start.x;
  const dy = ep.end.y - ep.start.y;
  const len = Math.hypot(dx, dy);
  if (len < 0.001) return newPiece;
  const ux = dx / len;
  const uy = dy / len;

  if (endpoint === 'end') {
    // Extend the endpoint further along the tangent
    const cmd = cmds[segmentIndex];
    if (cmd.type === 'L') {
      cmds[segmentIndex] = { ...cmd, type: 'L', values: [ep.end.x + ux * distance, ep.end.y + uy * distance] };
    } else if (cmd.type === 'C') {
      // For cubic bezier, extend the final point along the tangent formed by cp2 → end
      const cp2x = cmd.values[2], cp2y = cmd.values[3];
      const ex = cmd.values[4], ey = cmd.values[5];
      const tdx = ex - cp2x, tdy = ey - cp2y;
      const tlen = Math.hypot(tdx, tdy);
      if (tlen > 0.001) {
        const tux = tdx / tlen, tuy = tdy / tlen;
        cmds[segmentIndex] = {
          ...cmd,
          type: 'C',
          values: [cmd.values[0], cmd.values[1], cp2x, cp2y, ex + tux * distance, ey + tuy * distance],
        };
      }
    }
  } else {
    // Extend the start backwards along the tangent
    const cmd = cmds[segmentIndex];
    let startTx = -ux, startTy = -uy; // default: backwards along chord
    if (cmd.type === 'C' && cmd.values.length >= 6) {
      // Cubic Bezier: tangent at t=0 is (cp1 - start)
      const cp1x = cmd.values[0], cp1y = cmd.values[1];
      const tdx = ep.start.x - cp1x, tdy = ep.start.y - cp1y;
      const tlen = Math.hypot(tdx, tdy);
      if (tlen > 0.001) { startTx = tdx / tlen; startTy = tdy / tlen; }
    } else if (cmd.type === 'Q' && cmd.values.length >= 4) {
      const cpx = cmd.values[0], cpy = cmd.values[1];
      const tdx = ep.start.x - cpx, tdy = ep.start.y - cpy;
      const tlen = Math.hypot(tdx, tdy);
      if (tlen > 0.001) { startTx = tdx / tlen; startTy = tdy / tlen; }
    }

    if (segmentIndex === 1) {
      cmds[0] = { ...cmds[0], type: 'M', values: [ep.start.x + startTx * distance, ep.start.y + startTy * distance] };
    } else {
      const prev = cmds[segmentIndex - 1];
      if (prev.type === 'L') {
        cmds[segmentIndex - 1] = { ...prev, type: 'L', values: [ep.start.x + startTx * distance, ep.start.y + startTy * distance] };
      } else if (prev.type === 'C') {
        const v = [...prev.values];
        v[4] = ep.start.x + startTx * distance;
        v[5] = ep.start.y + startTy * distance;
        cmds[segmentIndex - 1] = { ...prev, type: 'C', values: v };
      } else if (prev.type === 'Q') {
        const v = [...prev.values];
        v[2] = ep.start.x + startTx * distance;
        v[3] = ep.start.y + startTy * distance;
        cmds[segmentIndex - 1] = { ...prev, type: 'Q', values: v };
      }
    }
  }

  newPiece.outline = cmds;
  newPiece.edges = undefined; // invalidate semantic edges
  newPiece.updatedAt = Date.now();
  return newPiece;
}

// ─── trimEdgeAtPoint ────────────────────────────────────────────────────────

/**
 * Trim an edge at a given point. Keeps the 'before' or 'after' portion.
 * For 'before': the edge ends at trimPoint.
 * For 'after': the edge starts at trimPoint.
 */
export function trimEdgeAtPoint(
  piece: PatternPiece,
  segmentIndex: number,
  trimPoint: Point2D,
  keepSide: 'before' | 'after',
): PatternPiece {
  const newPiece = clonePiece(piece, { id: piece.id });
  const cmds = [...newPiece.outline.map(c => ({ ...c, values: [...c.values] }))];
  const cmd = cmds[segmentIndex];

  if (cmd.type === 'L') {
    if (keepSide === 'before') {
      // El punto de recorte es geometría NUEVA — nace sin marcas.
      cmds[segmentIndex] = { type: 'L', values: [trimPoint.x, trimPoint.y] };
    } else {
      // Move the previous endpoint to trimPoint
      if (segmentIndex === 1) {
        cmds[0] = { ...cmds[0], type: 'M', values: [trimPoint.x, trimPoint.y] };
      } else {
        // El extremo de `prev` pasa a ser el punto de recorte: geometría
        // nueva, sin la marca del punto que desaparece (revisión 13-09).
        const prev = cmds[segmentIndex - 1];
        if (prev.type === 'L') {
          cmds[segmentIndex - 1] = { type: 'L', values: [trimPoint.x, trimPoint.y] };
        }
      }
    }
  } else if (cmd.type === 'C') {
    // Simplified: for cubic bezier, replace with a line to/from the trim point
    if (keepSide === 'before') {
      // El punto de recorte es geometría NUEVA — manualBezier queda inerte
      // (ya no es C) y authoredAnchor decoraría un punto que nadie insertó.
      cmds[segmentIndex] = { type: 'L', values: [trimPoint.x, trimPoint.y] };
    } else {
      if (segmentIndex === 1) {
        cmds[0] = { ...cmds[0], type: 'M', values: [trimPoint.x, trimPoint.y] };
      } else {
        // Adjust previous segment endpoint to trim point
        // Ídem: el extremo de `prev` se sustituye por el punto de recorte. Un
        // Bézier libre sigue siéndolo; el punto que desaparece no deja marca.
        const prev = cmds[segmentIndex - 1];
        if (prev.type === 'L') {
          cmds[segmentIndex - 1] = { type: 'L', values: [trimPoint.x, trimPoint.y] };
        } else if (prev.type === 'C') {
          const v = [...prev.values];
          v[4] = trimPoint.x; v[5] = trimPoint.y;
          cmds[segmentIndex - 1] = { ...(prev.manualBezier ? { manualBezier: true as const } : {}), type: 'C', values: v };
        }
      }
      // Replace curve with line from trim point to original end. The
      // original endpoint survives untouched — authoredAnchor travels with
      // it, but manualBezier does not: the command is no longer a C.
      cmds[segmentIndex] = {
        ...(cmd.authoredAnchor ? { authoredAnchor: true as const } : {}),
        type: 'L',
        values: [cmd.values[4], cmd.values[5]],
      };
    }
  }

  newPiece.outline = cmds;
  newPiece.edges = undefined;
  newPiece.updatedAt = Date.now();
  return newPiece;
}

// ─── unfoldPiece ─────────────────────────────────────────────────────────────

function reflectPoint(pt: Point2D, p1: Point2D, p2: Point2D): Point2D {
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return { ...pt };
  const t = ((pt.x - p1.x) * dx + (pt.y - p1.y) * dy) / lenSq;
  const projX = p1.x + t * dx, projY = p1.y + t * dy;
  return { x: 2 * projX - pt.x, y: 2 * projY - pt.y };
}

function reflectCommands(commands: PathCommand[], p1: Point2D, p2: Point2D): PathCommand[] {
  return commands.map(cmd => {
    const vals = [...cmd.values];
    for (let i = 0; i < vals.length; i += 2) {
      if (i + 1 < vals.length) {
        const reflected = reflectPoint({ x: vals[i], y: vals[i + 1] }, p1, p2);
        vals[i] = reflected.x;
        vals[i + 1] = reflected.y;
      }
    }
    return { ...cmd, values: vals };
  });
}

function distPt(a: Point2D, b: Point2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function cmdEndpoint(cmd: PathCommand): Point2D | null {
  if (cmd.type === 'Z' || cmd.values.length < 2) return null;
  return { x: cmd.values[cmd.values.length - 2], y: cmd.values[cmd.values.length - 1] };
}

export function unfoldPiece(
  piece: PatternPiece,
  foldLineId: string,
  options?: { outlineOnly?: boolean },
): PatternPiece {
  const foldLine = piece.internals.find(l => l.id === foldLineId);
  if (!foldLine) throw new Error(`Fold line "${foldLineId}" not found`);
  if (foldLine.type !== 'fold') throw new Error(`Internal line "${foldLineId}" is not a fold line`);

  const foldStart = cmdEndpoint(foldLine.path[0]) || { x: foldLine.path[0].values[0], y: foldLine.path[0].values[1] };
  // Skip trailing Z commands to find the actual endpoint
  let foldEndCmd = foldLine.path[foldLine.path.length - 1];
  if (foldEndCmd.type === 'Z' && foldLine.path.length > 1) {
    foldEndCmd = foldLine.path[foldLine.path.length - 2];
  }
  const foldEnd = cmdEndpoint(foldEndCmd);
  if (!foldEnd) throw new Error('Cannot determine fold line endpoint');

  const TOLERANCE = 2;
  const outlinePoints: { idx: number; pt: Point2D }[] = [];
  for (let i = 0; i < piece.outline.length; i++) {
    const ep = cmdEndpoint(piece.outline[i]);
    if (ep) outlinePoints.push({ idx: i, pt: ep });
  }

  let splitA = -1, splitB = -1;
  let minDistA = Infinity, minDistB = Infinity;
  for (const { idx, pt } of outlinePoints) {
    const dA = distPt(pt, foldStart);
    const dB = distPt(pt, foldEnd);
    if (dA < minDistA) { minDistA = dA; splitA = idx; }
    if (dB < minDistB) { minDistB = dB; splitB = idx; }
  }

  if (minDistA > TOLERANCE || minDistB > TOLERANCE) {
    throw new Error('Fold line endpoints are not on the piece outline');
  }

  if (splitA > splitB) { [splitA, splitB] = [splitB, splitA]; }

  const keptCmds: PathCommand[] = [];
  for (let i = splitA + 1; i <= splitB; i++) {
    keptCmds.push({ ...piece.outline[i], values: [...piece.outline[i].values] });
  }

  const mirroredCmds = reflectCommands(keptCmds, foldStart, foldEnd);

  const startPt = outlinePoints.find(p => p.idx === splitA)!.pt;
  const startAuthored = piece.outline[splitA].authoredAnchor;
  const merged: PathCommand[] = [{
    ...(startAuthored ? { authoredAnchor: true } : {}),
    type: 'M', values: [startPt.x, startPt.y],
  }];

  for (const cmd of keptCmds) {
    merged.push({ ...cmd, type: cmd.type === 'M' ? 'L' : cmd.type, values: [...cmd.values] });
  }

  // Reverse mirrored half — collect (start, cmd) segments, walk in reverse
  const mirrorSegs: { start: Point2D; cmd: PathCommand; authoredAnchor?: true }[] = [];
  // keptCmds begins with a segment, not M. Its first values may be a control
  // point; the reverse must arrive at the actual reflected starting anchor.
  let mirrorCursor = reflectPoint(startPt, foldStart, foldEnd);
  let arrivalIntent = startAuthored;
  for (const cmd of mirroredCmds) {
    if (cmd.type === 'M') {
      mirrorCursor = { x: cmd.values[0], y: cmd.values[1] };
      arrivalIntent = cmd.authoredAnchor;
      continue;
    }
    if (cmd.type === 'Z') continue;
    mirrorSegs.push({ start: { ...mirrorCursor }, cmd, authoredAnchor: arrivalIntent });
    const ep = cmdEndpoint(cmd);
    if (ep) mirrorCursor = ep;
    arrivalIntent = cmd.authoredAnchor;
  }
  for (let i = mirrorSegs.length - 1; i >= 0; i--) {
    const { start, cmd, authoredAnchor } = mirrorSegs[i];
    const intent = {
      ...(authoredAnchor ? { authoredAnchor: true as const } : {}),
      ...(cmd.manualBezier ? { manualBezier: true as const } : {}),
    };
    if (cmd.type === 'L' || cmd.type === 'H' || cmd.type === 'V') {
      merged.push({ ...intent, type: 'L', values: [start.x, start.y] });
    } else if (cmd.type === 'C') {
      const [cx1, cy1, cx2, cy2] = cmd.values;
      merged.push({ ...intent, type: 'C', values: [cx2, cy2, cx1, cy1, start.x, start.y] });
    }
  }

  merged.push({ type: 'Z', values: [] });

  const newInternals = piece.internals
    .filter(l => l.id !== foldLineId)
    .map(l => ({ ...l, path: l.path.map(c => ({ ...c, values: [...c.values] })) }));

  if (!options?.outlineOnly) {
    const mirrored = piece.internals
      .filter(l => l.id !== foldLineId)
      .map(l => ({
        ...l,
        id: uid('line'),
        path: reflectCommands(l.path, foldStart, foldEnd),
      }));
    newInternals.push(...mirrored);
  }

  let newDarts = piece.darts ? [...piece.darts] : undefined;
  if (piece.darts && !options?.outlineOnly) {
    const mirroredDarts = piece.darts.map(d => ({
      ...d,
      id: uid('dart'),
      apex: reflectPoint(d.apex, foldStart, foldEnd),
      legs: d.legs.map(leg => leg.map(pt => reflectPoint(pt, foldStart, foldEnd))) as [Point2D[], Point2D[]],
      foldDirection: d.foldDirection === 'left' ? 'right' as const
        : d.foldDirection === 'right' ? 'left' as const
        : d.foldDirection,
    }));
    newDarts = [...piece.darts, ...mirroredDarts];
  }

  return {
    ...piece,
    id: piece.id,
    outline: merged,
    internals: newInternals,
    darts: newDarts,
    edges: detectSemanticEdges({ ...piece, outline: merged }),
    updatedAt: Date.now(),
  };
}

// ─── optimizeCurvePoints ─────────────────────────────────────────────────────

function areCollinear(a: Point2D, b: Point2D, c: Point2D, eps = 0.1): boolean {
  const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  return Math.abs(cross) < eps;
}

export function optimizeCurvePoints(commands: PathCommand[], ratio: number): PathCommand[] {
  if (ratio >= 1.0) return commands.map(c => ({ ...c, values: [...c.values] }));
  if (commands.length <= 2) return commands.map(c => ({ ...c, values: [...c.values] }));

  const mCmd = commands[0];
  const hasZ = commands[commands.length - 1].type === 'Z';
  const geoCmds = commands.slice(1, hasZ ? -1 : undefined);
  const hasCurves = geoCmds.some(c => c.type === 'C' || c.type === 'Q');

  if (hasCurves) {
    const samples = samplePathAtIntervals(commands, 0.5);
    if (samples.length < 2) return commands.map(c => ({ ...c, values: [...c.values] }));
    const points = samples.map(s => s.point);
    const bbox = outlineBBox(commands);
    const diag = Math.hypot(bbox.maxX - bbox.minX, bbox.maxY - bbox.minY);
    const tolerance = (1 - ratio) * diag * 0.005;
    const simplified = rdpSimplify(points, tolerance);
    if (simplified.length < 2) return commands.map(c => ({ ...c, values: [...c.values] }));
    const fitted = fitCubicBezier(simplified, tolerance);
    if (hasZ) fitted.push({ type: 'Z', values: [] });
    return fitted;
  }

  const result: PathCommand[] = [{ ...mCmd, values: [...mCmd.values] }];
  let prevPt: Point2D = { x: mCmd.values[0], y: mCmd.values[1] };
  for (let i = 0; i < geoCmds.length; i++) {
    const cmd = geoCmds[i];
    const endPt: Point2D = { x: cmd.values[cmd.values.length - 2], y: cmd.values[cmd.values.length - 1] };
    if (i + 1 < geoCmds.length) {
      const nextCmd = geoCmds[i + 1];
      const nextEnd: Point2D = { x: nextCmd.values[nextCmd.values.length - 2], y: nextCmd.values[nextCmd.values.length - 1] };
      if ((cmd.type === 'L' || cmd.type === 'H' || cmd.type === 'V') &&
          (nextCmd.type === 'L' || nextCmd.type === 'H' || nextCmd.type === 'V') &&
          areCollinear(prevPt, endPt, nextEnd)) {
        prevPt = endPt;
        continue;
      }
    }
    result.push({ ...cmd, values: [...cmd.values] });
    prevPt = endPt;
  }
  if (hasZ) result.push({ type: 'Z', values: [] });
  return result;
}

export function optimizePieceCurves(
  piece: PatternPiece,
  options?: { ratio?: number; target?: 'all' | 'outline' | { internalLineId: string } },
): PatternPiece {
  const ratio = options?.ratio ?? 0.5;
  const target = options?.target ?? 'all';
  const newOutline = (target === 'all' || target === 'outline')
    ? optimizeCurvePoints(piece.outline, ratio)
    : piece.outline.map(c => ({ ...c, values: [...c.values] }));
  const newInternals = piece.internals.map(l => {
    const shouldOptimize = target === 'all' ||
      (typeof target === 'object' && 'internalLineId' in target && target.internalLineId === l.id);
    return {
      ...l,
      path: shouldOptimize ? optimizeCurvePoints(l.path, ratio) : l.path.map(c => ({ ...c, values: [...c.values] })),
    };
  });
  return { ...piece, id: piece.id, outline: newOutline, internals: newInternals, edges: undefined, updatedAt: Date.now() };
}

// ─── offsetInternalLine ──────────────────────────────────────────────────────

function normalAtSegment(ax: number, ay: number, bx: number, by: number): Point2D {
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len === 0) return { x: 0, y: 1 };
  return { x: -dy / len, y: dx / len };
}

function offsetPolyline(points: Point2D[], dist: number): Point2D[] {
  if (points.length < 2) return points.map(p => ({ ...p }));
  const result: Point2D[] = [];
  for (let i = 0; i < points.length; i++) {
    let nx = 0, ny = 0, count = 0;
    if (i > 0) {
      const n = normalAtSegment(points[i - 1].x, points[i - 1].y, points[i].x, points[i].y);
      nx += n.x; ny += n.y; count++;
    }
    if (i < points.length - 1) {
      const n = normalAtSegment(points[i].x, points[i].y, points[i + 1].x, points[i + 1].y);
      nx += n.x; ny += n.y; count++;
    }
    if (count > 0) { nx /= count; ny /= count; }
    const len = Math.hypot(nx, ny);
    if (len > 0) { nx /= len; ny /= len; }
    result.push({ x: points[i].x + nx * dist, y: points[i].y + ny * dist });
  }
  return result;
}

export function offsetInternalLine(
  piece: PatternPiece,
  sourceLineId: string,
  options: {
    count: number;
    distance: number;
    reverse?: boolean;
    extend?: boolean;
    sourceSegmentRange?: [number, number];
  },
): PatternPiece {
  const sourceLine = piece.internals.find(l => l.id === sourceLineId);
  if (!sourceLine) throw new Error(`Internal line "${sourceLineId}" not found`);

  const sign = options.reverse ? -1 : 1;
  const newInternals = piece.internals.map(l => ({
    ...l,
    path: l.path.map(c => ({ ...c, values: [...c.values] })),
  }));

  const samples = samplePathAtIntervals(sourceLine.path, 0.5);
  const sourcePoints = samples.map(s => s.point);

  for (let i = 1; i <= options.count; i++) {
    const dist = i * options.distance * sign;
    const offsetPts = offsetPolyline(sourcePoints, dist);

    const finalPts = [...offsetPts];

    if (options.extend && offsetPts.length >= 2) {
      const outlineSamples = samplePathAtIntervals(piece.outline, 0.5);
      const outlinePoly = outlineSamples.map(s => s.point);

      const startTanX = offsetPts[0].x - offsetPts[1].x;
      const startTanY = offsetPts[0].y - offsetPts[1].y;
      const extStart = { x: offsetPts[0].x + startTanX * 100, y: offsetPts[0].y + startTanY * 100 };
      const hitsStart = linePolylineIntersections(extStart, offsetPts[0], outlinePoly);
      if (hitsStart.length > 0) finalPts[0] = hitsStart[hitsStart.length - 1].point;

      const last = offsetPts.length - 1;
      const endTanX = offsetPts[last].x - offsetPts[last - 1].x;
      const endTanY = offsetPts[last].y - offsetPts[last - 1].y;
      const extEnd = { x: offsetPts[last].x + endTanX * 100, y: offsetPts[last].y + endTanY * 100 };
      const hitsEnd = linePolylineIntersections(offsetPts[last], extEnd, outlinePoly);
      if (hitsEnd.length > 0) finalPts[last] = hitsEnd[0].point;
    }

    const fitted = fitCubicBezier(finalPts, 0.5);
    newInternals.push({
      id: uid('line'),
      type: sourceLine.type,
      path: fitted,
    });
  }

  return { ...piece, id: piece.id, internals: newInternals, updatedAt: Date.now() };
}

// ─── replaceAsPatternOutline ─────────────────────────────────────────────────

export function replaceAsPatternOutline(
  piece: PatternPiece,
  internalLineId: string,
  outlineSegmentRange: [number, number],
): PatternPiece {
  const line = piece.internals.find(l => l.id === internalLineId);
  if (!line) throw new Error(`Internal line "${internalLineId}" not found`);

  const [rangeStart, rangeEnd] = outlineSegmentRange;
  if (rangeStart < 0 || rangeEnd >= piece.outline.length) {
    throw new Error('Outline segment range out of bounds');
  }

  const outlineStartPt = cmdEndpoint(piece.outline[rangeStart])
    || { x: piece.outline[rangeStart].values[0], y: piece.outline[rangeStart].values[1] };
  const outlineEndPt = cmdEndpoint(piece.outline[rangeEnd])!;

  const lineStartPt = { x: line.path[0].values[0], y: line.path[0].values[1] };
  const lineLastCmd = line.path[line.path.length - 1];
  const lineEndPt = cmdEndpoint(lineLastCmd)
    || { x: lineLastCmd.values[0], y: lineLastCmd.values[1] };

  const TOLERANCE = 2;
  const startToStart = distPt(lineStartPt, outlineStartPt);
  const startToEnd = distPt(lineStartPt, outlineEndPt);

  let lineCmds: PathCommand[];
  if (startToStart <= TOLERANCE) {
    lineCmds = line.path.slice(1);
    if (distPt(lineEndPt, outlineEndPt) > TOLERANCE) {
      throw new Error('Internal line endpoints do not match outline segment');
    }
  } else if (startToEnd <= TOLERANCE) {
    if (distPt(lineEndPt, outlineStartPt) > TOLERANCE) {
      throw new Error('Internal line endpoints do not match outline segment');
    }
    const allPts: Point2D[] = [{ x: line.path[0].values[0], y: line.path[0].values[1] }];
    for (const cmd of line.path.slice(1)) {
      const ep = cmdEndpoint(cmd);
      if (ep) allPts.push(ep);
    }
    allPts.reverse();
    const reversed: PathCommand[] = [];
    for (let i = 1; i < allPts.length; i++) {
      reversed.push({ type: 'L', values: [allPts[i].x, allPts[i].y] });
    }
    lineCmds = reversed;
  } else {
    throw new Error('Internal line endpoints are too far from outline segment');
  }

  const insertCmds = lineCmds.map(c => ({
    ...c,
    type: c.type === 'M' ? 'L' : c.type,
    values: [...c.values],
  }));

  const before = piece.outline.slice(0, rangeStart + 1).map(c => ({ ...c, values: [...c.values] }));
  const after = piece.outline.slice(rangeEnd + 1).map(c => ({ ...c, values: [...c.values] }));

  const newOutline = [...before, ...insertCmds, ...after];
  if (newOutline[newOutline.length - 1].type !== 'Z') {
    newOutline.push({ type: 'Z', values: [] });
  }

  const oldSegment: PathCommand[] = [
    { type: 'M', values: [outlineStartPt.x, outlineStartPt.y] },
    ...piece.outline.slice(rangeStart + 1, rangeEnd + 1).map(c => ({ ...c, values: [...c.values] })),
  ];

  const refLine = {
    id: uid('line'),
    type: 'reference' as const,
    path: oldSegment,
  };

  const newInternals = piece.internals
    .filter(l => l.id !== internalLineId)
    .map(l => ({ ...l, path: l.path.map(c => ({ ...c, values: [...c.values] })) }));
  newInternals.push(refLine);

  const result = {
    ...piece,
    id: piece.id,
    outline: newOutline,
    internals: newInternals,
    updatedAt: Date.now(),
  };

  result.edges = detectSemanticEdges(result);
  return result;
}
