/**
 * Copilot tools for rich dart operations.
 */

import type { ToolDefinition, ToolResult } from '../registry';
import type { AppDispatch, RootState } from '../../../store';

export const tools: ToolDefinition[] = [
  {
    name: 'listDarts',
    description: 'List all darts on a piece with intake, depth, apex, and fold direction',
    parameters: {
      type: 'object',
      properties: {
        pieceId: { type: 'string', description: 'Piece ID (omit for all pieces)' },
      },
    },
    execute: async (
      params: Record<string, unknown>,
      _dispatch: AppDispatch,
      getState: () => RootState,
    ): Promise<ToolResult> => {
      const { extractDarts } = await import('../../../utils/dartEntity');
      const state = getState();
      const pieces = state.project.pieces;
      const targetId = params.pieceId as string | undefined;

      const results: Record<string, unknown> = {};
      for (const piece of pieces) {
        if (targetId && piece.id !== targetId) continue;
        const darts = piece.darts ?? extractDarts(piece);
        if (darts.length > 0) {
          results[piece.id] = {
            name: piece.name,
            darts: darts.map(d => ({
              id: d.id,
              intake: d.intake + 'mm',
              depth: (d.depth ?? 0) + 'mm',
              apex: d.apex,
              foldDirection: d.foldDirection,
              edgeId: d.edgeId,
            })),
          };
        }
      }

      return { success: true, data: results };
    },
  },
  {
    name: 'adjustDartIntake',
    description: 'Adjust a dart\'s intake by a delta in mm (positive = wider, negative = narrower)',
    parameters: {
      type: 'object',
      properties: {
        pieceId: { type: 'string', description: 'Piece ID' },
        dartId: { type: 'string', description: 'Dart ID' },
        deltaMm: { type: 'number', description: 'Change in mm (e.g., -5 to reduce by 5mm)' },
      },
      required: ['pieceId', 'dartId', 'deltaMm'],
    },
    execute: async (
      params: Record<string, unknown>,
      dispatch: AppDispatch,
      getState: () => RootState,
    ): Promise<ToolResult> => {
      const { adjustDartIntake, extractDarts } = await import('../../../utils/dartEntity');
      const { updatePiece } = await import('../../../store/projectSlice');
      const state = getState();
      const piece = state.project.pieces.find(p => p.id === params.pieceId);
      if (!piece) return { success: false, error: `Piece "${params.pieceId}" not found` };

      const darts = piece.darts ?? extractDarts(piece);
      const dartIdx = darts.findIndex(d => d.id === params.dartId);
      if (dartIdx === -1) return { success: false, error: `Dart "${params.dartId}" not found. Available: ${darts.map(d => d.id).join(', ')}` };

      const delta = params.deltaMm as number;
      const updated = adjustDartIntake(darts[dartIdx], delta);
      const newDarts = [...darts];
      newDarts[dartIdx] = updated;

      dispatch(updatePiece({ ...piece, darts: newDarts }));

      return {
        success: true,
        data: {
          dartId: updated.id,
          oldIntake: darts[dartIdx].intake,
          newIntake: updated.intake,
          delta,
        },
      };
    },
  },
  {
    name: 'extractDarts',
    description: 'Extract rich dart entities from a piece\'s internal lines (auto-detect intake, apex, legs)',
    parameters: {
      type: 'object',
      properties: {
        pieceId: { type: 'string', description: 'Piece ID' },
      },
      required: ['pieceId'],
    },
    execute: async (
      params: Record<string, unknown>,
      dispatch: AppDispatch,
      getState: () => RootState,
    ): Promise<ToolResult> => {
      const { extractDarts } = await import('../../../utils/dartEntity');
      const { updatePiece } = await import('../../../store/projectSlice');
      const state = getState();
      const piece = state.project.pieces.find(p => p.id === params.pieceId);
      if (!piece) return { success: false, error: `Piece "${params.pieceId}" not found` };

      const darts = extractDarts(piece);
      dispatch(updatePiece({ ...piece, darts }));

      return {
        success: true,
        data: {
          pieceId: piece.id,
          pieceName: piece.name,
          dartCount: darts.length,
          darts: darts.map(d => ({
            id: d.id,
            intake: d.intake + 'mm',
            depth: (d.depth ?? 0) + 'mm',
            foldDirection: d.foldDirection,
          })),
        },
      };
    },
  },
];
