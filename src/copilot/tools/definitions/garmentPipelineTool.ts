/**
 * Garment Pipeline Tool — end-to-end: load pattern → auto-sew → simulate.
 *
 * Orchestrates the full flow from Seamly2D pattern to 3D draping.
 * This is the "one click" experience for OpenClo.
 *
 * @module garmentPipelineTool
 */

import type { ToolDefinition, ToolResult } from '../registry';
import { autoSew } from '../../../utils/autoSew';
import { addSeam } from '../../../store/projectSlice';
import { startSimulation } from '../../../store/simulationSlice';

// ─── runGarmentPipeline ─────────────────────────────────────────────────────

const runGarmentPipelineTool: ToolDefinition = {
  name: 'runGarmentPipeline',
  description:
    'Run the full garment pipeline on currently loaded pieces: auto-detect seams → apply high-confidence seams → start 3D simulation. ' +
    'Call this AFTER loading a pattern (loadSeamlyPattern or blueprint). ' +
    '/ Ejecutar pipeline completo: auto-detectar costuras → aplicar → iniciar simulación 3D.',
  parameters: {
    type: 'object',
    properties: {
      minConfidence: {
        type: 'number',
        description: 'Minimum seam confidence to auto-apply (default 0.6) / Confianza mínima para aplicar costuras',
      },
      skipSimulation: {
        type: 'boolean',
        description: 'If true, only detect seams but don\'t start simulation / Solo detectar costuras sin simular',
      },
      skipAutoSew: {
        type: 'boolean',
        description: 'If true, skip auto-sew (use existing seams) / Saltar auto-sew',
      },
    },
  },
  execute: async (params, dispatch, getState): Promise<ToolResult> => {
    const state = getState();
    const pieces = state.project.pieces;

    if (pieces.length === 0) {
      return {
        success: false,
        error: 'No pieces loaded. Use loadSeamlyPattern or a blueprint first. / No hay piezas cargadas.',
      };
    }

    const result: {
      piecesCount: number;
      seamsDetected: number;
      seamsApplied: number;
      seamDetails: Array<{ pieceA: string; pieceB: string; confidence: string; applied: boolean }>;
      simulationStarted: boolean;
      unmatchedEdges: number;
    } = {
      piecesCount: pieces.length,
      seamsDetected: 0,
      seamsApplied: 0,
      seamDetails: [],
      simulationStarted: false,
      unmatchedEdges: 0,
    };

    // ─── Step 1: Auto-sew ───────────────────────────────────────────────
    if (!params.skipAutoSew) {
      const minConf = (params.minConfidence as number) ?? 0.6;

      if (pieces.length >= 2) {
        const sewResult = autoSew(pieces, { minConfidence: Math.min(minConf, 0.3) }); // detect broadly
        result.seamsDetected = sewResult.seams.length;
        result.unmatchedEdges = sewResult.unmatchedEdges.length;

        const pieceLookup = new Map(pieces.map(p => [p.id, p.name]));

        for (const proposed of sewResult.seams) {
          const applied = proposed.confidence >= minConf;
          if (applied) {
            dispatch(addSeam(proposed.seam));
            result.seamsApplied++;
          }
          result.seamDetails.push({
            pieceA: pieceLookup.get(proposed.seam.pieceA.pieceId) || proposed.seam.pieceA.pieceId,
            pieceB: pieceLookup.get(proposed.seam.pieceB.pieceId) || proposed.seam.pieceB.pieceId,
            confidence: Math.round(proposed.confidence * 100) + '%',
            applied,
          });
        }
      }
    }

    // ─── Step 2: Start simulation ───────────────────────────────────────
    if (!params.skipSimulation) {
      dispatch(startSimulation());
      result.simulationStarted = true;
    }

    return {
      success: true,
      data: result,
    };
  },
};

export const tools: ToolDefinition[] = [
  runGarmentPipelineTool,
];
