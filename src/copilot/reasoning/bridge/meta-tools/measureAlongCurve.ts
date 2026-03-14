/**
 * measureAlongCurve Meta-Tool
 *
 * Returns arc-length of a named edge on a pattern piece, with sample points
 * at regular intervals. Read-only — never modifies state.
 *
 * @module measureAlongCurve
 */

import type { MetaToolDefinition, MetaToolResult } from './types';
import type { PathCommand } from '../../../../types/types';
import { computePathArcLength, samplePathAtIntervals } from '../../../../utils/geometry/arcLength';

export const measureAlongCurveTool: MetaToolDefinition = {
  name: 'measureAlongCurve',
  description:
    'Returns the arc-length (in mm) of a named edge on a pattern piece, measured along the curve rather than straight-line. Also returns sample points at regular intervals along the edge.',
  parameters: {
    type: 'object',
    properties: {
      pieceId: {
        type: 'string',
        description: 'The unique identifier of the piece containing the edge.',
      },
      edgeName: {
        type: 'string',
        description: 'The name of the edge to measure along (case-insensitive). E.g. "armhole", "neckline".',
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
      outline: PathCommand[];
      edges?: Array<{ id: string; name: string; segmentRange: [number, number]; length?: number }>;
    }>;

    const piece = pieces.find(p => p.id === pieceId);
    if (!piece) {
      return {
        success: false,
        error: `Piece "${pieceId}" not found. Available: ${pieces.map(p => `${p.id} (${p.name})`).join(', ') || 'none'}`,
      };
    }

    const edges = piece.edges ?? [];
    const edgeNameLower = edgeName.toLowerCase();
    const edge = edges.find(e => e.name.toLowerCase() === edgeNameLower);
    if (!edge) {
      return {
        success: false,
        error: `Edge "${edgeName}" not found on piece "${pieceId}". Available: ${edges.map(e => e.name).join(', ') || 'none'}`,
      };
    }

    const length = computePathArcLength(piece.outline, edge.segmentRange[0], edge.segmentRange[1]);
    const samples = samplePathAtIntervals(piece.outline, 50, edge.segmentRange[0], edge.segmentRange[1]);

    return {
      success: true,
      data: {
        pieceId,
        edgeName: edge.name,
        length,
        unit: 'mm',
        samplePoints: samples.map(s => ({ distance: s.distance, x: s.point.x, y: s.point.y })),
      },
    };
  },
};
