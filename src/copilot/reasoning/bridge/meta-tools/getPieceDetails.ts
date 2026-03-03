/**
 * getPieceDetails Meta-Tool
 *
 * Returns detailed information about a specific pattern piece, including
 * all edges with their measurements, darts, bounding box dimensions,
 * category, and side. Used by the LLM to inspect a single piece in detail
 * before planning modifications.
 *
 * Read-only — never modifies state.
 *
 * @module getPieceDetails
 */

import type { MetaToolDefinition, MetaToolResult, EdgeInfo } from './types';

/**
 * Compute bounding box dimensions from outline path commands.
 */
function computeBoundingBox(
  outline: Array<{ type: string; values: number[] }>,
): { width: number; height: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const cmd of outline) {
    if ((cmd.type === 'M' || cmd.type === 'L') && cmd.values.length >= 2) {
      const [x, y] = cmd.values;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (minX === Infinity) return { width: 0, height: 0 };
  return { width: maxX - minX, height: maxY - minY };
}

export const getPieceDetailsTool: MetaToolDefinition = {
  name: 'getPieceDetails',
  description:
    'Returns detailed information about a specific pattern piece including all edges with measurements, darts, bounding box dimensions, category, and side.',
  parameters: {
    type: 'object',
    properties: {
      pieceId: {
        type: 'string',
        description: 'The unique identifier of the piece to inspect.',
      },
    },
    required: ['pieceId'],
  },
  execute: async (params, getState): Promise<MetaToolResult> => {
    const pieceId = params.pieceId as string;
    const state = getState();
    const pieces = (state.project?.pieces ?? []) as Array<{
      id: string;
      name: string;
      category?: string;
      side?: string;
      edges?: Array<{
        id: string;
        name: string;
        edgeType: string;
        length?: number;
      }>;
      darts?: Array<{
        id: string;
        edgeId?: string;
      }>;
      outline?: Array<{ type: string; values: number[] }>;
    }>;

    const piece = pieces.find((p) => p.id === pieceId);
    if (!piece) {
      return {
        success: false,
        error: `Piece "${pieceId}" not found. Available pieces: ${pieces.map((p) => p.id).join(', ') || 'none'}`,
      };
    }

    const edges: EdgeInfo[] = (piece.edges ?? []).map((e) => ({
      name: e.name,
      length: e.length ?? 0,
      edgeType: e.edgeType,
    }));

    const darts = (piece.darts ?? []).map((d) => ({
      id: d.id,
      position: d.edgeId ?? 'unknown',
    }));

    const dimensions = piece.outline
      ? computeBoundingBox(piece.outline)
      : { width: 0, height: 0 };

    return {
      success: true,
      data: {
        id: piece.id,
        name: piece.name,
        edges,
        darts,
        dimensions,
        category: piece.category,
        side: piece.side,
      } as unknown as Record<string, unknown>,
    };
  },
};
