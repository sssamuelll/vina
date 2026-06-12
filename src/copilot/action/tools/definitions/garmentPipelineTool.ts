/**
 * Garment Pipeline Tool — legacy auto-sew + simulate orchestrator over the
 * already-loaded pieces (the user imports their pattern via DXF).
 *
 * @module garmentPipelineTool
 */

import type { ToolDefinition, ToolResult } from '../registry';
import { autoSew } from '../../../../utils/autoSew';
import { addSeam } from '../../../../store/projectSlice';
import { refineProposalsAgainstState } from '../../../../store/autoSewThunk';
import { startSimulation } from '../../../../store/simulationSlice';

// ─── runGarmentPipeline ─────────────────────────────────────────────────────

const runGarmentPipelineTool: ToolDefinition = {
  name: 'runGarmentPipeline',
  description:
    'DEPRECATED for dressing. Geometric auto-sew pairs the wrong edges on DXF pieces (collar↔sleeve) and the auto-simulate drops the garment on the floor — do NOT use it to dress. ' +
    'Prefer: arrangeGarment (position in 3D) → createSeam (explicit, from construction knowledge) → let the HUMAN press Simulate. ' +
    'By default this tool now does NOTHING (no auto-sew, no simulation); both are opt-in via autoSew:true / simulate:true, kept only for non-dressing/legacy callers. ' +
    '/ OBSOLETO para vestir: el auto-sew geométrico empareja mal y el auto-simulate tira la prenda al piso. Usa arrangeGarment + createSeam + que el humano simule.',
  parameters: {
    type: 'object',
    properties: {
      minConfidence: {
        type: 'number',
        description: 'Minimum seam confidence to auto-apply (default 0.6) — only used when autoSew:true',
      },
      autoSew: {
        type: 'boolean',
        description: 'Opt-in: run geometric auto-sew (default false — discouraged, pairs wrong edges on DXF)',
      },
      simulate: {
        type: 'boolean',
        description: 'Opt-in: start the 3D drape simulation (default false — the human should press Simulate)',
      },
    },
  },
  execute: async (params, dispatch, getState): Promise<ToolResult> => {
    const state = getState();
    const pieces = state.project.pieces;

    if (pieces.length === 0) {
      return {
        success: false,
        error: 'No pieces loaded. Ask the user to import their DXF pattern first (drag-drop or File > Import DXF). / No hay piezas cargadas; pide al usuario importar su DXF.',
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

    // ─── Step 1: Auto-sew (opt-in only — default OFF) ───────────────────
    // Geometric auto-sew mispairs DXF edges; the dressing flow uses
    // arrangeGarment + explicit createSeam instead. Kept behind an explicit
    // flag so neither the agent nor a stray call can flail with it.
    if (params.autoSew === true) {
      const minConf = (params.minConfidence as number) ?? 0.6;

      if (pieces.length >= 2) {
        const sewResult = autoSew(pieces, { minConfidence: Math.min(minConf, 0.3) }); // detect broadly
        // World-space refinement (M4-C): same pass as the ⌘K thunk.
        const refinedSeams = refineProposalsAgainstState(
          sewResult.seams.map(p => p.seam), pieces, getState(),
        );
        sewResult.seams.forEach((p, i) => { p.seam = refinedSeams[i]; });
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

    // ─── Step 2: Start simulation (opt-in only — default OFF) ───────────
    // The human presses Simulate; the agent never auto-starts the drape.
    if (params.simulate === true) {
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
