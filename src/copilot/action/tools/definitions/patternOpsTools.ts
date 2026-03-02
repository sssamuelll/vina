/**
 * Copilot tools for advanced patternmaking operations.
 */

import type { ToolDefinition, ToolResult } from '../registry';
import type { AppDispatch, RootState } from '../../../../store';

export const tools: ToolDefinition[] = [
  {
    name: 'splitPiece',
    description: 'Split a piece along a horizontal or vertical line into two pieces',
    parameters: {
      type: 'object',
      properties: {
        pieceId: { type: 'string', description: 'Piece ID' },
        axis: { type: 'string', description: 'horizontal or vertical' },
        position: { type: 'number', description: 'Y (horizontal) or X (vertical) coordinate in mm' },
      },
      required: ['pieceId', 'axis', 'position'],
    },
    execute: async (params: Record<string, unknown>, dispatch: AppDispatch, getState: () => RootState): Promise<ToolResult> => {
      const { splitPiece } = await import('../../../../utils/patternOps');
      const { addPiece, removePiece } = await import('../../../../store/projectSlice');
      const state = getState();
      const piece = state.project.pieces.find(p => p.id === params.pieceId);
      if (!piece) return { success: false, error: `Piece not found` };
      const [a, b] = splitPiece(piece, params.axis as 'horizontal' | 'vertical', params.position as number);
      dispatch(removePiece(piece.id));
      dispatch(addPiece(a));
      dispatch(addPiece(b));
      return { success: true, data: { pieceA: { id: a.id, name: a.name }, pieceB: { id: b.id, name: b.name } } };
    },
  },
  {
    name: 'addFullness',
    description: 'Add fullness (gather/pleat/flare) at an edge',
    parameters: {
      type: 'object',
      properties: {
        pieceId: { type: 'string', description: 'Piece ID' },
        edge: { type: 'string', description: 'Edge: top, bottom, hemline, waistline, etc.' },
        amount: { type: 'number', description: 'Amount in mm' },
        method: { type: 'string', description: 'gather, pleat, or flare' },
      },
      required: ['pieceId', 'edge', 'amount'],
    },
    execute: async (params: Record<string, unknown>, dispatch: AppDispatch, getState: () => RootState): Promise<ToolResult> => {
      const { addFullness } = await import('../../../../utils/patternOps');
      const { updatePiece } = await import('../../../../store/projectSlice');
      const state = getState();
      const piece = state.project.pieces.find(p => p.id === params.pieceId);
      if (!piece) return { success: false, error: `Piece not found` };
      const method = (params.method as string) || 'gather';
      const result = addFullness(piece, params.edge as string, params.amount as number, method as 'gather' | 'pleat' | 'flare');
      dispatch(updatePiece(result));
      return { success: true, data: { pieceId: result.id, method, amount: params.amount, edge: params.edge } };
    },
  },
  {
    name: 'addFacing',
    description: 'Create a facing piece from an edge (neckline, armhole, etc.)',
    parameters: {
      type: 'object',
      properties: {
        pieceId: { type: 'string', description: 'Piece ID' },
        edgeName: { type: 'string', description: 'Edge name (e.g., neckline, armhole)' },
        width: { type: 'number', description: 'Facing width in mm (default 40)' },
      },
      required: ['pieceId', 'edgeName'],
    },
    execute: async (params: Record<string, unknown>, dispatch: AppDispatch, getState: () => RootState): Promise<ToolResult> => {
      const { addFacing } = await import('../../../../utils/patternOps');
      const { addPiece } = await import('../../../../store/projectSlice');
      const state = getState();
      const piece = state.project.pieces.find(p => p.id === params.pieceId);
      if (!piece) return { success: false, error: `Piece not found` };
      const facing = addFacing(piece, params.edgeName as string, (params.width as number) ?? 40);
      dispatch(addPiece(facing));
      return { success: true, data: { facingId: facing.id, name: facing.name, width: params.width ?? 40 } };
    },
  },
  {
    name: 'slashAndSpread',
    description: 'Slash piece vertically and spread to add fullness (fundamental manipulation)',
    parameters: {
      type: 'object',
      properties: {
        pieceId: { type: 'string', description: 'Piece ID' },
        slashX: { type: 'number', description: 'X position of slash line in mm' },
        spreadAmount: { type: 'number', description: 'Spread amount in mm' },
      },
      required: ['pieceId', 'slashX', 'spreadAmount'],
    },
    execute: async (params: Record<string, unknown>, dispatch: AppDispatch, getState: () => RootState): Promise<ToolResult> => {
      const { slashAndSpread } = await import('../../../../utils/patternOps');
      const { updatePiece } = await import('../../../../store/projectSlice');
      const state = getState();
      const piece = state.project.pieces.find(p => p.id === params.pieceId);
      if (!piece) return { success: false, error: `Piece not found` };
      const result = slashAndSpread(piece, params.slashX as number, params.spreadAmount as number);
      dispatch(updatePiece(result));
      return { success: true, data: { pieceId: result.id, slashX: params.slashX, spread: params.spreadAmount } };
    },
  },
  {
    name: 'transferDart',
    description: 'Transfer a dart from its current edge to a different edge (slash & spread)',
    parameters: {
      type: 'object',
      properties: {
        pieceId: { type: 'string', description: 'Piece ID' },
        dartId: { type: 'string', description: 'Dart ID to transfer' },
        toEdge: { type: 'string', description: 'Target edge name' },
      },
      required: ['pieceId', 'dartId', 'toEdge'],
    },
    execute: async (params: Record<string, unknown>, dispatch: AppDispatch, getState: () => RootState): Promise<ToolResult> => {
      const { transferDart } = await import('../../../../utils/patternOps');
      const { updatePiece } = await import('../../../../store/projectSlice');
      const state = getState();
      const piece = state.project.pieces.find(p => p.id === params.pieceId);
      if (!piece) return { success: false, error: `Piece not found` };
      const result = transferDart(piece, params.dartId as string, params.toEdge as string);
      dispatch(updatePiece(result));
      return { success: true, data: { pieceId: result.id, dartTransferred: params.dartId, toEdge: params.toEdge } };
    },
  },
  {
    name: 'measureEdge',
    description: 'Measure the length of a semantic edge in mm',
    parameters: {
      type: 'object',
      properties: {
        pieceId: { type: 'string', description: 'Piece ID' },
        edgeName: { type: 'string', description: 'Edge name' },
      },
      required: ['pieceId', 'edgeName'],
    },
    execute: async (params: Record<string, unknown>, _dispatch: AppDispatch, getState: () => RootState): Promise<ToolResult> => {
      const { measureEdgeLength } = await import('../../../../utils/patternOps');
      const { findEdgeByName } = await import('../../../../utils/semanticEdges');
      const state = getState();
      const piece = state.project.pieces.find(p => p.id === params.pieceId);
      if (!piece) return { success: false, error: `Piece not found` };
      if (!piece.edges) return { success: false, error: `Piece has no semantic edges` };
      const edge = findEdgeByName(piece.edges, params.edgeName as string);
      if (!edge) return { success: false, error: `Edge "${params.edgeName}" not found` };
      const length = measureEdgeLength(piece, edge);
      return { success: true, data: { edgeName: edge.name, length, lengthCm: (length / 10).toFixed(1) + 'cm' } };
    },
  },
];
