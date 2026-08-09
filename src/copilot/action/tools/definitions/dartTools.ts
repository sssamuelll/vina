/**
 * Copilot tools for rich dart operations.
 */

import type { ToolDefinition, ToolResult } from '../registry';
import type { AppDispatch, RootState } from '../../../../store';

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
      const { extractDarts } = await import('../../../../utils/dartEntity');
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
      const { adjustDartIntake, extractDarts, applyDartsToInternals } = await import('../../../../utils/dartEntity');
      const { updatePiece } = await import('../../../../store/projectSlice');
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

      dispatch(updatePiece({
        ...piece,
        darts: newDarts,
        // El lienzo 2D dibuja `internals`. Sin la vuelta al almacenamiento el
        // ajuste queda invisible (#1016).
        internals: applyDartsToInternals(piece, newDarts),
      }));

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
      const { extractDarts } = await import('../../../../utils/dartEntity');
      const { updatePiece } = await import('../../../../store/projectSlice');
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
  {
    name: 'segmentDart',
    description: 'Split a dart into multiple evenly-spaced smaller darts along its base edge. / Dividir una pinza en múltiples pinzas más pequeñas distribuidas uniformemente.',
    parameters: {
      type: 'object',
      properties: {
        pieceId: { type: 'string', description: 'ID of the piece containing the dart' },
        dartId: { type: 'string', description: 'ID of the internal line (dart) to segment' },
        segments: { type: 'number', description: 'Number of segments (2–6)' },
      },
      required: ['pieceId', 'dartId', 'segments'],
    },
    execute: async (
      params: Record<string, unknown>,
      dispatch: AppDispatch,
      getState: () => RootState,
    ): Promise<ToolResult> => {
      const { segmentDart } = await import('../../../../utils/dartEntity');
      const state = getState();
      const piece = state.project.pieces.find(p => p.id === params.pieceId);
      if (!piece) return { success: false, error: `Piece "${params.pieceId}" not found` };

      const dartId = params.dartId as string;
      const segments = params.segments as number;
      const dartLine = piece.internals.find((l: { id: string }) => l.id === dartId);
      if (!dartLine) return { success: false, error: `Dart "${dartId}" not found on piece "${piece.id}"` };

      // Deep clone for rollback (prevents Immer draft revocation)
      const snapshot = structuredClone(piece);

      const newDarts = segmentDart(piece, dartId, segments);

      // Single atomic dispatch: replace original dart with N segments
      const updatedInternals = [
        ...piece.internals.filter((l: { id: string }) => l.id !== dartId),
        ...newDarts,
      ];
      dispatch({ type: 'project/updatePiece', payload: { ...piece, internals: updatedInternals } });

      return {
        success: true,
        data: {
          pieceId: piece.id,
          originalDartId: dartId,
          segments,
          newDartIds: newDarts.map(d => d.id),
        },
        rollback: () => dispatch({ type: 'project/updatePiece', payload: snapshot }),
      };
    },
  },
  {
    name: 'shapeDartCap',
    description: 'Change the shape of a dart tip (pointed, curved, flat, diamond). / Cambiar la forma de la punta de una pinza (punteada, curva, plana, diamante).',
    parameters: {
      type: 'object',
      properties: {
        pieceId: { type: 'string', description: 'ID of the piece containing the dart' },
        dartId: { type: 'string', description: 'ID of the internal line (dart) to reshape' },
        capShape: { type: 'string', enum: ['pointed', 'curved', 'flat', 'diamond'], description: 'Desired cap shape' },
      },
      required: ['pieceId', 'dartId', 'capShape'],
    },
    execute: async (
      params: Record<string, unknown>,
      dispatch: AppDispatch,
      getState: () => RootState,
    ): Promise<ToolResult> => {
      const { extractDartFromInternal, shapeDartCap } = await import('../../../../utils/dartEntity');
      const state = getState();
      const piece = state.project.pieces.find(p => p.id === params.pieceId);
      if (!piece) return { success: false, error: `Piece "${params.pieceId}" not found` };

      const dartId = params.dartId as string;
      const capShape = params.capShape as 'pointed' | 'curved' | 'flat' | 'diamond';
      const dartLine = piece.internals.find((l: { id: string }) => l.id === dartId);
      if (!dartLine) return { success: false, error: `Dart "${dartId}" not found on piece "${piece.id}"` };

      const dart = extractDartFromInternal(dartLine);
      if (!dart) return { success: false, error: `Line "${dartId}" is not a valid dart` };

      const snapshot = structuredClone(piece);
      const newPath = shapeDartCap(dart, capShape);

      const updatedInternals = piece.internals.map((l: { id: string }) =>
        l.id === dartId
          ? { ...dartLine, path: newPath, dartOptions: { ...dartLine.dartOptions, capShape } }
          : l,
      );
      dispatch({ type: 'project/updatePiece', payload: { ...piece, internals: updatedInternals } });

      return {
        success: true,
        data: { pieceId: piece.id, dartId, capShape },
        rollback: () => dispatch({ type: 'project/updatePiece', payload: snapshot }),
      };
    },
  },
];
