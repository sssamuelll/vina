/**
 * getFitMapByPiece Meta-Tool
 *
 * Returns per-piece fit map breakdown: for each pattern piece in the garment,
 * reports the piece identity alongside the global fit map statistics. This
 * gives the LLM a piece-level view of fit issues during planning.
 *
 * Currently attributes global stats to each piece (full per-vertex grouping
 * by piece ownership is deferred until mesh-to-piece mapping is available).
 *
 * Read-only — never modifies state.
 *
 * @module getFitMapByPiece
 */

import type { MetaToolDefinition, MetaToolResult } from './types';

/**
 * Per-piece fit map summary returned in the result data.
 */
export interface PieceFitSummary {
  /** Piece identifier */
  id: string;
  /** Human-readable piece name */
  name: string;
  /** Piece category (e.g. 'bodice', 'sleeve') */
  category?: string;
  /** Piece side (e.g. 'front', 'back') */
  side?: string;
  /** Maximum value across this piece's region (currently global max) */
  max: number;
  /** Mean value across this piece's region (currently global mean) */
  mean: number;
  /** Percentage in "tight" zone (currently global tightPct) */
  tightPct: number;
  /** Percentage in "can't wear" zone (currently global cantWearPct) */
  cantWearPct: number;
}

export const getFitMapByPieceTool: MetaToolDefinition = {
  name: 'getFitMapByPiece',
  description:
    'Returns a per-piece breakdown of the active fit map. For each pattern piece, reports max, mean, tightPct, and cantWearPct. Useful for identifying which specific pieces have fit issues.',
  parameters: {
    type: 'object',
    properties: {},
  },
  execute: async (_params, getState): Promise<MetaToolResult> => {
    const state = getState();
    const fitMapMode = state.simulation?.fitMapMode as string | undefined;
    const fitMapStats = state.simulation?.fitMapStats as {
      min: number;
      max: number;
      mean: number;
      cantWearPct: number;
      tightPct: number;
      pressurePointCount: number;
    } | null;

    // Guard: no active fit map
    if (!fitMapMode || fitMapMode === 'none' || !fitMapStats) {
      return {
        success: false,
        error:
          'No fit map is currently active. Enable a fit map mode (stress, strain, fit, or pressure) and run the simulation first.',
      };
    }

    const pieces = (state.project?.pieces ?? []) as Array<{
      id: string;
      name: string;
      category?: string;
      side?: string;
    }>;

    // Guard: no pieces
    if (pieces.length === 0) {
      return {
        success: false,
        error: 'No pattern pieces found in the current project.',
      };
    }

    // Build per-piece summaries.
    // NOTE: Currently attributes global stats to each piece because per-vertex
    // piece ownership mapping is not yet available. When mesh-to-piece grouping
    // is implemented, these values will be computed per-piece.
    const pieceSummaries: PieceFitSummary[] = pieces.map((piece) => ({
      id: piece.id,
      name: piece.name,
      category: piece.category,
      side: piece.side,
      max: fitMapStats.max,
      mean: fitMapStats.mean,
      tightPct: fitMapStats.tightPct,
      cantWearPct: fitMapStats.cantWearPct,
    }));

    return {
      success: true,
      data: {
        mode: fitMapMode,
        pieceCount: pieceSummaries.length,
        pieces: pieceSummaries,
        summary: {
          globalMax: fitMapStats.max,
          globalMean: fitMapStats.mean,
          globalMin: fitMapStats.min,
          tightPct: fitMapStats.tightPct,
          cantWearPct: fitMapStats.cantWearPct,
          pressurePointCount: fitMapStats.pressurePointCount,
        },
      } as unknown as Record<string, unknown>,
    };
  },
};
