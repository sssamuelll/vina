/**
 * getGarmentState Meta-Tool
 *
 * Returns a high-level overview of the current garment: all pattern pieces
 * with their edge names, seam connections, and piece count. Used by the LLM
 * during planning to understand what the garment looks like before deciding
 * which actions to take.
 *
 * Read-only — never modifies state.
 *
 * @module getGarmentState
 */

import type { MetaToolDefinition, MetaToolResult, GarmentPieceSummary } from './types';

/**
 * Compute polygon area using the shoelace formula on M/L path commands.
 * Returns area in square units (mm^2 if coordinates are in mm).
 */
function computeAreaFromOutline(
  outline: Array<{ type: string; values: number[] }>,
): number {
  // Collect vertices from M and L commands
  const vertices: Array<[number, number]> = [];
  for (const cmd of outline) {
    if ((cmd.type === 'M' || cmd.type === 'L') && cmd.values.length >= 2) {
      vertices.push([cmd.values[0], cmd.values[1]]);
    }
  }
  if (vertices.length < 3) return 0;

  // Shoelace formula
  let area = 0;
  for (let i = 0; i < vertices.length; i++) {
    const j = (i + 1) % vertices.length;
    area += vertices[i][0] * vertices[j][1];
    area -= vertices[j][0] * vertices[i][1];
  }
  return Math.abs(area / 2);
}

export const getGarmentStateTool: MetaToolDefinition = {
  name: 'getGarmentState',
  description:
    'Returns a high-level overview of the current garment including all pattern pieces, their edge names, seam connections, and total piece count.',
  parameters: {
    type: 'object',
    properties: {},
  },
  execute: async (_params, getState): Promise<MetaToolResult> => {
    const state = getState();
    const pieces = (state.project?.pieces ?? []) as Array<{
      id: string;
      name: string;
      category?: string;
      side?: string;
      edges?: Array<{ name: string }>;
      outline?: Array<{ type: string; values: number[] }>;
    }>;
    const seams = (state.project?.seams ?? []) as Array<{
      id: string;
      pieceA: { pieceId: string };
      pieceB: { pieceId: string };
    }>;

    const pieceSummaries: GarmentPieceSummary[] = pieces.map((piece) => ({
      id: piece.id,
      name: piece.name,
      category: piece.category,
      side: piece.side,
      edges: (piece.edges ?? []).map((e) => e.name),
      area: piece.outline ? computeAreaFromOutline(piece.outline) : 0,
      perimeter: 0, // Perimeter calculation omitted for simplicity
    }));

    const seamSummaries = seams.map((seam) => ({
      id: seam.id,
      pieceAId: seam.pieceA.pieceId,
      pieceBId: seam.pieceB.pieceId,
    }));

    return {
      success: true,
      data: {
        pieces: pieceSummaries,
        seams: seamSummaries,
        pieceCount: pieceSummaries.length,
      } as unknown as Record<string, unknown>,
    };
  },
};
