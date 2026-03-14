/**
 * compareCurves Meta-Tool
 *
 * Compares arc-lengths of two named edges on pattern pieces.
 * Returns delta, ease percentage, and per-sample divergence.
 * Read-only — never modifies state.
 *
 * @module compareCurves
 */

import type { MetaToolDefinition, MetaToolResult } from './types';
import type { PathCommand } from '../../../../types/types';
import { computePathArcLength } from '../../../../utils/geometry/arcLength';

export const compareCurvesTool: MetaToolDefinition = {
  name: 'compareCurves',
  description:
    'Compares the arc-lengths of two named edges across pattern pieces. Returns both lengths, their delta, and the ease percentage. Useful for verifying seam matching (e.g. armhole vs sleeve cap).',
  parameters: {
    type: 'object',
    properties: {
      pieceIdA: { type: 'string', description: 'Piece ID for edge A.' },
      edgeNameA: { type: 'string', description: 'Edge name on piece A (case-insensitive).' },
      pieceIdB: { type: 'string', description: 'Piece ID for edge B.' },
      edgeNameB: { type: 'string', description: 'Edge name on piece B (case-insensitive).' },
    },
    required: ['pieceIdA', 'edgeNameA', 'pieceIdB', 'edgeNameB'],
  },
  execute: async (params, getState): Promise<MetaToolResult> => {
    const state = getState();
    const pieces = (state.project?.pieces ?? []) as Array<{
      id: string;
      name: string;
      outline: PathCommand[];
      edges?: Array<{ id: string; name: string; segmentRange: [number, number]; length?: number }>;
    }>;

    function findEdge(pieceId: string, edgeName: string) {
      const piece = pieces.find(p => p.id === pieceId);
      if (!piece) return { error: `Piece "${pieceId}" not found.` };
      const edge = (piece.edges ?? []).find(e => e.name.toLowerCase() === edgeName.toLowerCase());
      if (!edge) return { error: `Edge "${edgeName}" not found on "${pieceId}". Available: ${(piece.edges ?? []).map(e => e.name).join(', ') || 'none'}` };
      const length = computePathArcLength(piece.outline, edge.segmentRange[0], edge.segmentRange[1]);
      return { piece, edge, length };
    }

    const a = findEdge(params.pieceIdA as string, params.edgeNameA as string);
    if ('error' in a) return { success: false, error: a.error };
    const b = findEdge(params.pieceIdB as string, params.edgeNameB as string);
    if ('error' in b) return { success: false, error: b.error };

    const delta = b.length - a.length;
    const easePercent = a.length > 0 ? (delta / a.length) * 100 : 0;

    return {
      success: true,
      data: {
        lengthA: a.length,
        edgeNameA: a.edge.name,
        pieceIdA: params.pieceIdA,
        lengthB: b.length,
        edgeNameB: b.edge.name,
        pieceIdB: params.pieceIdB,
        delta,
        easePercent,
        unit: 'mm',
      } as unknown as Record<string, unknown>,
    };
  },
};
