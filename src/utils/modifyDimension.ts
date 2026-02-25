/**
 * Modify piece dimensions semantically — lengthen, shorten, widen, narrow.
 *
 * Works by identifying target edges via semantic edge classification,
 * then translating outline commands along the appropriate axis.
 * Preserves curve topology (moves control points + anchors together).
 *
 * @module modifyDimension
 */

import type { PatternPiece, PathCommand, SemanticEdge } from '../types/types';
import { detectSemanticEdges, findEdgeByName } from './semanticEdges';

export type ModifyDirection = 'lengthen' | 'shorten' | 'widen' | 'narrow';

export interface ModifyDimensionParams {
  /** Direction of modification */
  direction: ModifyDirection;
  /** Amount in mm (always positive) */
  amount: number;
  /** Target region: edge name or auto-detect from direction */
  targetEdge?: string;
}

export interface ModifyResult {
  piece: PatternPiece;
  edgeName: string;
  edgeType: string;
  direction: ModifyDirection;
  amountMm: number;
  nodesAffected: number;
}

/**
 * Determine which edge to modify based on direction.
 *
 * - lengthen/shorten → hem edge (bottom)
 * - widen/narrow → side edges
 */
function findTargetEdge(
  edges: SemanticEdge[],
  direction: ModifyDirection,
  targetEdge?: string,
): SemanticEdge | undefined {
  if (targetEdge) {
    return findEdgeByName(edges, targetEdge);
  }

  switch (direction) {
    case 'lengthen':
    case 'shorten':
      // Find hem/bottom edge
      return edges.find(e => e.edgeType === 'hem')
        ?? edges.find(e => e.name.toLowerCase().includes('hem'))
        ?? edges.find(e => e.name.toLowerCase().includes('bottom'));
    case 'widen':
    case 'narrow':
      // Find side seam
      return edges.find(e => e.name.toLowerCase().includes('side'))
        ?? edges.find(e => e.edgeType === 'seam' && e.name.toLowerCase().includes('seam'));
  }
}

/**
 * Translate path commands within a range along an axis.
 *
 * For lengthen/shorten: translate Y values
 * For widen/narrow: translate X values (split ±half per side)
 */
function translateCommands(
  outline: PathCommand[],
  range: [number, number],
  dx: number,
  dy: number,
): PathCommand[] {
  return outline.map((cmd, idx) => {
    if (idx < range[0] || idx >= range[1]) return cmd;
    if (cmd.type === 'Z' || cmd.values.length === 0) return cmd;

    const newValues = [...cmd.values];
    for (let i = 0; i < newValues.length; i++) {
      if (i % 2 === 0) newValues[i] += dx;
      else newValues[i] += dy;
    }
    return { type: cmd.type, values: newValues };
  });
}

/**
 * Modify a pattern piece dimension semantically.
 *
 * @example
 * ```ts
 * // "Alarga la falda 5cm"
 * const result = modifyDimension(piece, {
 *   direction: 'lengthen',
 *   amount: 50, // mm
 * });
 * ```
 */
export function modifyDimension(
  piece: PatternPiece,
  params: ModifyDimensionParams,
): ModifyResult {
  const edges = piece.edges?.length
    ? piece.edges
    : detectSemanticEdges(piece);

  const edge = findTargetEdge(edges, params.direction, params.targetEdge);

  if (!edge) {
    throw new Error(
      `No suitable edge found for "${params.direction}"` +
      (params.targetEdge ? ` (target: "${params.targetEdge}")` : '') +
      `. Available edges: ${edges.map(e => e.name).join(', ')}`,
    );
  }

  const sign = (params.direction === 'shorten' || params.direction === 'narrow') ? -1 : 1;
  const amount = params.amount * sign;

  let dx = 0, dy = 0;
  if (params.direction === 'lengthen' || params.direction === 'shorten') {
    // Y-down coordinate system: lengthen = push hem down (+Y)
    dy = amount;
  } else {
    // Widen: push side edges outward (+X for right side, -X for left)
    // For single edge modification, just push outward
    dx = amount;
  }

  const newOutline = translateCommands(piece.outline, edge.segmentRange, dx, dy);

  // Re-detect edges on modified piece
  const modifiedPiece: PatternPiece = {
    ...piece,
    outline: newOutline,
    edges: undefined, // force re-detection
    updatedAt: Date.now(),
  };

  return {
    piece: modifiedPiece,
    edgeName: edge.name,
    edgeType: edge.edgeType,
    direction: params.direction,
    amountMm: params.amount,
    nodesAffected: edge.segmentRange[1] - edge.segmentRange[0],
  };
}
