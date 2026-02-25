/**
 * Advanced Patternmaking Operations — atomic operations every patronista needs.
 *
 * All functions are pure: take a PatternPiece, return a new one (or new pieces).
 * SemanticEdges and Darts are preserved or updated where possible.
 *
 * @module patternOps
 */

import type { PatternPiece, PathCommand, SemanticEdge, Dart } from '../types/types';

let _counter = 0;
function uid(prefix: string): string { return `${prefix}-${Date.now()}-${++_counter}`; }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clonePiece(piece: PatternPiece, overrides?: Partial<PatternPiece>): PatternPiece {
  return {
    ...piece,
    id: uid('piece'),
    outline: piece.outline.map(c => ({ type: c.type, values: [...c.values] })),
    internals: piece.internals.map(i => ({ ...i, path: i.path.map(c => ({ type: c.type, values: [...c.values] })) })),
    edges: piece.edges ? [...piece.edges] : undefined,
    darts: piece.darts ? [...piece.darts] : undefined,
    updatedAt: Date.now(),
    ...overrides,
  };
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

// ─── splitPiece ───────────────────────────────────────────────────────────────

/**
 * Split a piece along a horizontal or vertical line.
 * Returns two new pieces: [upper/left, lower/right].
 *
 * @param piece - Source piece
 * @param axis - 'horizontal' (split at Y) or 'vertical' (split at X)
 * @param position - Y or X coordinate to split at (in piece local coords)
 */
export function splitPiece(
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
      ...edgeCmds.map(c => ({ type: c.type, values: [...c.values] })),
      // Offset path (simplified: shift by width in Y)
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

// ─── slashAndSpread ───────────────────────────────────────────────────────────

/**
 * Slash and spread: cut piece vertically and spread by an amount.
 * Creates fullness by opening a wedge.
 *
 * @param piece - Source piece
 * @param slashX - X position of the slash line
 * @param spreadAmount - Amount to spread in mm
 */
export function slashAndSpread(
  piece: PatternPiece,
  slashX: number,
  spreadAmount: number,
): PatternPiece {
  const result = clonePiece(piece, { edges: undefined });

  // Shift all points to the right of slashX by spreadAmount
  for (const cmd of result.outline) {
    for (let i = 0; i < cmd.values.length; i += 2) {
      if (cmd.values[i] > slashX) {
        cmd.values[i] += spreadAmount;
      }
    }
  }

  // Also shift internals
  for (const int of result.internals) {
    for (const cmd of int.path) {
      for (let i = 0; i < cmd.values.length; i += 2) {
        if (cmd.values[i] > slashX) {
          cmd.values[i] += spreadAmount;
        }
      }
    }
  }

  return result;
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
  const result = clonePiece(piece);
  const darts = result.darts ?? [];
  const dartIdx = darts.findIndex(d => d.id === fromDartId);
  if (dartIdx === -1) return result;

  const oldDart = darts[dartIdx];
  const targetEdge = result.edges?.find(e =>
    e.name.toLowerCase().includes(toEdgeName.toLowerCase())
  );

  if (!targetEdge) return result;

  // Create new dart on target edge
  const bbox = outlineBBox(result.outline);
  const edgeMidX = (bbox.minX + bbox.maxX) / 2;
  const edgeMidY = targetEdge.segmentRange[0] < result.outline.length / 2
    ? bbox.minY + (bbox.maxY - bbox.minY) * 0.2  // top edge
    : bbox.maxY - (bbox.maxY - bbox.minY) * 0.2; // bottom edge

  const newDart: Dart = {
    id: uid('dart'),
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
