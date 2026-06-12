/**
 * Auto-Sew Tools — automatic seam detection copilot commands.
 *
 * @module autoSewTools
 */

import type { ToolDefinition, ToolResult } from '../registry';
import { autoSew } from '../../../../utils/autoSew';
import { addSeam } from '../../../../store/projectSlice';
import { refineProposalsAgainstState } from '../../../../store/autoSewThunk';

// ─── autoDetectSeams ────────────────────────────────────────────────────────

const autoDetectSeamsTool: ToolDefinition = {
  name: 'autoDetectSeams',
  description:
    'Automatically detect and propose seams between pattern pieces using naming conventions, ' +
    'arc-length matching (Hungarian algorithm), and geometric analysis. Returns candidates with confidence scores. ' +
    '/ Detectar automáticamente costuras entre piezas usando convenciones de nombre, ' +
    'coincidencia de longitud de arco (algoritmo húngaro) y análisis geométrico.',
  parameters: {
    type: 'object',
    properties: {
      minConfidence: {
        type: 'number',
        description: 'Minimum confidence threshold 0-1 (default 0.4) / Umbral mínimo de confianza 0-1',
      },
      autoApply: {
        type: 'boolean',
        description: 'If true, automatically apply high-confidence seams (≥0.8). Default false. / Si es true, aplicar automáticamente costuras de alta confianza (≥0.8)',
      },
      excludePieceIds: {
        type: 'array',
        items: { type: 'string' },
        description: 'Piece IDs to exclude from matching / IDs de piezas a excluir',
      },
    },
  },
  execute: async (params, dispatch, getState): Promise<ToolResult> => {
    const state = getState();
    const pieces = state.project.pieces;

    if (pieces.length < 2) {
      return { success: false, error: 'Need at least 2 pieces for auto-sew / Se necesitan al menos 2 piezas' };
    }

    const result = autoSew(pieces, {
      minConfidence: (params.minConfidence as number) ?? 0.4,
      excludePieceIds: params.excludePieceIds as string[] | undefined,
    });
    // World-space refinement (M4-C): same pass as the ⌘K thunk — partner
    // reassignment by world proximity + reversed seeding. 2D names lie
    // about adjacency on real CAD patterns.
    const refinedSeams = refineProposalsAgainstState(
      result.seams.map(p => p.seam), pieces, state,
    );
    result.seams.forEach((p, i) => { p.seam = refinedSeams[i]; });

    const autoApply = params.autoApply as boolean ?? false;
    const applied: string[] = [];

    if (autoApply) {
      for (const proposed of result.seams) {
        if (proposed.confidence >= 0.8) {
          dispatch(addSeam(proposed.seam));
          applied.push(proposed.seam.id);
        }
      }
    }

    // Build human-readable summary
    const pieceLookup = new Map(pieces.map(p => [p.id, p.name]));
    const summary = result.seams.map(s => ({
      pieceA: pieceLookup.get(s.seam.pieceA.pieceId) || s.seam.pieceA.pieceId,
      pieceB: pieceLookup.get(s.seam.pieceB.pieceId) || s.seam.pieceB.pieceId,
      confidence: Math.round(s.confidence * 100) + '%',
      reason: s.reason,
      applied: applied.includes(s.seam.id),
    }));

    return {
      success: true,
      data: {
        proposed: summary,
        totalProposed: result.seams.length,
        applied: applied.length,
        unmatchedEdges: result.unmatchedEdges.length,
        piecesAnalyzed: result.piecesAnalyzed,
      },
    };
  },
};

// ─── Export ──────────────────────────────────────────────────────────────────

export const tools: ToolDefinition[] = [
  autoDetectSeamsTool,
];
