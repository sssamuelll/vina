/**
 * Copilot tools for querying and manipulating semantic edges.
 */

import type { ToolDefinition, ToolResult } from '../registry';
import type { AppDispatch, RootState } from '../../../store';

export const tools: ToolDefinition[] = [
  {
    name: 'classifyPiece',
    description: 'Classify a piece by category (bodice/sleeve/collar/skirt/trouser/etc.) and side (front/back/left/right)',
    parameters: {
      type: 'object',
      properties: {
        pieceId: { type: 'string', description: 'Piece ID (omit for all pieces)' },
      },
    },
    execute: async (
      params: Record<string, unknown>,
      dispatch: AppDispatch,
      getState: () => RootState,
    ): Promise<ToolResult> => {
      const { classifyPiece } = await import('../../../utils/pieceClassifier');
      const { updatePiece } = await import('../../../store/projectSlice');
      const state = getState();
      const pieces = state.project.pieces;
      const targetId = params.pieceId as string | undefined;

      const results: Record<string, unknown>[] = [];
      for (const piece of pieces) {
        if (targetId && piece.id !== targetId) continue;
        const { category, side } = classifyPiece(piece);
        if (category !== piece.category || side !== piece.side) {
          dispatch(updatePiece({ ...piece, category, side }));
        }
        results.push({ id: piece.id, name: piece.name, category, side });
      }

      return { success: true, data: { pieces: results } };
    },
  },
  {
    name: 'getGrainLine',
    description: 'Get grainline info for a piece (direction, angle, reference edge)',
    parameters: {
      type: 'object',
      properties: {
        pieceId: { type: 'string', description: 'Piece ID' },
      },
      required: ['pieceId'],
    },
    execute: async (
      params: Record<string, unknown>,
      _dispatch: AppDispatch,
      getState: () => RootState,
    ): Promise<ToolResult> => {
      const { extractGrainLine } = await import('../../../utils/grainLine');
      const state = getState();
      const piece = state.project.pieces.find(p => p.id === params.pieceId);
      if (!piece) return { success: false, error: `Piece "${params.pieceId}" not found` };

      const gl = piece.grainLine ?? extractGrainLine(piece);
      if (!gl) return { success: true, data: { pieceId: piece.id, grainLine: null, message: 'No grainline found' } };

      return { success: true, data: { pieceId: piece.id, grainLine: gl } };
    },
  },
  {
    name: 'setGrainDirection',
    description: 'Set grain direction on a piece: lengthwise, crosswise, bias, or custom',
    parameters: {
      type: 'object',
      properties: {
        pieceId: { type: 'string', description: 'Piece ID' },
        direction: { type: 'string', description: 'lengthwise | crosswise | bias | custom' },
      },
      required: ['pieceId', 'direction'],
    },
    execute: async (
      params: Record<string, unknown>,
      dispatch: AppDispatch,
      getState: () => RootState,
    ): Promise<ToolResult> => {
      const { setGrainDirection } = await import('../../../utils/grainLine');
      const { updatePiece } = await import('../../../store/projectSlice');
      const state = getState();
      const piece = state.project.pieces.find(p => p.id === params.pieceId);
      if (!piece) return { success: false, error: `Piece "${params.pieceId}" not found` };

      const dir = params.direction as 'lengthwise' | 'crosswise' | 'bias' | 'custom';
      const gl = setGrainDirection(piece, dir);
      dispatch(updatePiece({ ...piece, grainLine: gl }));

      return { success: true, data: { pieceId: piece.id, grainLine: gl } };
    },
  },
  {
    name: 'listEdges',
    description: 'List semantic edges of a pattern piece (armhole, shoulder, hemline, etc.). Omit pieceId for all pieces.',
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
      const state = getState();
      const pieces = state.project.pieces;
      const targetId = params.pieceId as string | undefined;

      const results: Record<string, unknown> = {};

      for (const piece of pieces) {
        if (targetId && piece.id !== targetId) continue;
        results[piece.id] = {
          name: piece.name,
          edges: (piece.edges ?? []).map(e => ({
            name: e.name,
            type: e.edgeType,
            length: e.length,
            matchHint: e.matchHint,
          })),
        };
      }

      return { success: true, data: results };
    },
  },
  {
    name: 'findEdge',
    description: 'Find a specific edge by name on a piece (e.g., "armhole" on front bodice)',
    parameters: {
      type: 'object',
      properties: {
        pieceId: { type: 'string', description: 'Piece ID' },
        edgeName: { type: 'string', description: 'Edge name to search (partial match, case-insensitive)' },
      },
      required: ['pieceId', 'edgeName'],
    },
    execute: async (
      params: Record<string, unknown>,
      _dispatch: AppDispatch,
      getState: () => RootState,
    ): Promise<ToolResult> => {
      const { findEdgeByName } = await import('../../../utils/semanticEdges');
      const state = getState();
      const piece = state.project.pieces.find(p => p.id === params.pieceId);
      if (!piece) return { success: false, error: `Piece "${params.pieceId}" not found` };
      if (!piece.edges) return { success: false, error: `Piece "${piece.name}" has no semantic edges` };

      const edge = findEdgeByName(piece.edges, params.edgeName as string);
      if (!edge) return {
        success: false,
        error: `No edge matching "${params.edgeName}" on ${piece.name}. Available: ${piece.edges.map(e => e.name).join(', ')}`,
      };

      return { success: true, data: edge as unknown as Record<string, unknown> };
    },
  },
  {
    name: 'findSeamMatches',
    description: 'Find matching edges between two pieces for seam connections',
    parameters: {
      type: 'object',
      properties: {
        pieceAId: { type: 'string', description: 'First piece ID' },
        pieceBId: { type: 'string', description: 'Second piece ID' },
      },
      required: ['pieceAId', 'pieceBId'],
    },
    execute: async (
      params: Record<string, unknown>,
      _dispatch: AppDispatch,
      getState: () => RootState,
    ): Promise<ToolResult> => {
      const { findMatchingEdges } = await import('../../../utils/semanticEdges');
      const state = getState();
      const pieceA = state.project.pieces.find(p => p.id === params.pieceAId);
      const pieceB = state.project.pieces.find(p => p.id === params.pieceBId);
      if (!pieceA || !pieceB) return { success: false, error: 'One or both pieces not found' };

      const matches = findMatchingEdges(pieceA, pieceB);
      if (matches.length === 0) return {
        success: true,
        data: { matches: [], message: `No matching edges between "${pieceA.name}" and "${pieceB.name}"` },
      };

      return {
        success: true,
        data: {
          matches: matches.map(m => ({
            edgeA: { name: m.edgeA.name, type: m.edgeA.edgeType },
            edgeB: { name: m.edgeB.name, type: m.edgeB.edgeType },
          })),
        },
      };
    },
  },
  {
    name: 'detectEdges',
    description: 'Re-run semantic edge detection on a piece (useful after editing outline)',
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
      const { detectSemanticEdges } = await import('../../../utils/semanticEdges');
      const { updatePiece } = await import('../../../store/projectSlice');
      const state = getState();
      const piece = state.project.pieces.find(p => p.id === params.pieceId);
      if (!piece) return { success: false, error: `Piece "${params.pieceId}" not found` };

      const edges = detectSemanticEdges(piece);
      dispatch(updatePiece({ ...piece, edges }));

      return {
        success: true,
        data: {
          pieceId: piece.id,
          pieceName: piece.name,
          edgeCount: edges.length,
          edges: edges.map(e => ({ name: e.name, type: e.edgeType, length: e.length })),
        },
      };
    },
  },
];
