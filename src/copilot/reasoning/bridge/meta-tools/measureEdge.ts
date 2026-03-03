/**
 * measureEdge Meta-Tool
 *
 * Returns the length of a specific named edge on a pattern piece.
 * Matches edge names case-insensitively. If the edge or piece is not found,
 * returns an error listing available options to guide the LLM.
 *
 * Read-only — never modifies state.
 *
 * @module measureEdge
 */

import type { MetaToolDefinition, MetaToolResult } from './types';

export const measureEdgeTool: MetaToolDefinition = {
  name: 'measureEdge',
  description:
    'Returns the length (in mm) of a specific named edge on a pattern piece. Edge name matching is case-insensitive.',
  parameters: {
    type: 'object',
    properties: {
      pieceId: {
        type: 'string',
        description: 'The unique identifier of the piece containing the edge.',
      },
      edgeName: {
        type: 'string',
        description: 'The name of the edge to measure (case-insensitive).',
      },
    },
    required: ['pieceId', 'edgeName'],
  },
  execute: async (params, getState): Promise<MetaToolResult> => {
    const pieceId = params.pieceId as string;
    const edgeName = params.edgeName as string;
    const state = getState();
    const pieces = (state.project?.pieces ?? []) as Array<{
      id: string;
      name: string;
      edges?: Array<{
        id: string;
        name: string;
        edgeType: string;
        length?: number;
      }>;
    }>;

    const piece = pieces.find((p) => p.id === pieceId);
    if (!piece) {
      return {
        success: false,
        error: `Piece "${pieceId}" not found. Available pieces: ${pieces.map((p) => p.id).join(', ') || 'none'}`,
      };
    }

    const edges = piece.edges ?? [];
    const edgeNameLower = edgeName.toLowerCase();
    const edge = edges.find((e) => e.name.toLowerCase() === edgeNameLower);

    if (!edge) {
      return {
        success: false,
        error: `Edge "${edgeName}" not found on piece "${pieceId}". Available edges: ${edges.map((e) => e.name).join(', ') || 'none'}`,
      };
    }

    return {
      success: true,
      data: {
        pieceId,
        edgeName: edge.name,
        length: edge.length ?? 0,
        unit: 'mm',
      } as unknown as Record<string, unknown>,
    };
  },
};
