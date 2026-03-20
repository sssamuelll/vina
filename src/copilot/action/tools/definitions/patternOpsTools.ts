/**
 * Copilot tools for advanced patternmaking operations.
 */

import type { ToolDefinition, ToolResult } from '../registry';
import type { AppDispatch, RootState } from '../../../../store';

function requireFiniteNumber(value: unknown, name: string): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return `${name} must be a valid number`;
  return null;
}

export const tools: ToolDefinition[] = [
  {
    name: 'splitPiece',
    description:
      'Split a piece along a horizontal or vertical line into two pieces. ' +
      'Optionally auto-sew the cut edges. ' +
      '/ Dividir una pieza a lo largo de una línea horizontal o vertical. ' +
      'Opcionalmente coser automáticamente los bordes cortados.',
    parameters: {
      type: 'object',
      properties: {
        pieceId: { type: 'string', description: 'Piece ID' },
        axis: { type: 'string', description: 'horizontal or vertical' },
        position: { type: 'number', description: 'Y (horizontal) or X (vertical) coordinate in mm' },
        autoSew: { type: 'boolean', description: 'Auto-sew cut edges (default true)' },
        seamType: {
          type: 'string',
          enum: ['standard', 'french', 'flat-felled', 'overlock'],
          description: 'Seam type for auto-sew (default standard)',
        },
      },
      required: ['pieceId', 'axis', 'position'],
    },
    execute: async (params: Record<string, unknown>, dispatch: AppDispatch, getState: () => RootState): Promise<ToolResult> => {
      const { splitPiece, findCutEdgePair } = await import('../../../../utils/patternOps');
      const { addPiece, removePiece, removeSeam, addSeam, updatePiece } = await import('../../../../store/projectSlice');
      const state = getState();
      const piece = state.project.pieces.find(p => p.id === params.pieceId);
      if (!piece) return { success: false, error: `Piece not found` };

      const posErr = requireFiniteNumber(params.position, 'position');
      if (posErr) return { success: false, error: posErr };

      const originalPiece = JSON.parse(JSON.stringify(piece));

      let a, b;
      try {
        [a, b] = splitPiece(piece, params.axis as 'horizontal' | 'vertical', params.position as number);
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Split failed' };
      }

      dispatch({ ...removePiece(piece.id), meta: { skipConfirmation: true } });
      dispatch(addPiece(a));
      dispatch(addPiece(b));

      // Auto-sew cut edges unless explicitly disabled
      let seamInfo: Record<string, unknown> | undefined;
      if (params.autoSew !== false) {
        const cutPair = findCutEdgePair(a, b);
        if (cutPair) {
          // Persist detected edges to Redux store
          dispatch(updatePiece({ ...a, edges: cutPair.edgesA }));
          dispatch(updatePiece({ ...b, edges: cutPair.edgesB }));
          const seamId = `cut-seam-${Date.now()}`;
          const seamTypeVal = (params.seamType as string) || 'standard';
          dispatch(addSeam({
            id: seamId,
            pieceA: { pieceId: a.id, edgeName: cutPair.edgeA.name },
            pieceB: { pieceId: b.id, edgeName: cutPair.edgeB.name },
            type: seamTypeVal as 'standard' | 'french' | 'flat-felled' | 'overlock',
            tension: 100, strength: 1.0, active: true, taped: false, tapeWidth: 10,
          }));
          seamInfo = { seamId, edgeA: cutPair.edgeA.name, edgeB: cutPair.edgeB.name, type: seamTypeVal };
        }
      }

      return {
        success: true,
        data: {
          pieceA: { id: a.id, name: a.name },
          pieceB: { id: b.id, name: b.name },
          ...(seamInfo ? { seam: seamInfo } : {}),
        },
        rollback: () => {
          dispatch(removePiece(a.id));
          dispatch(removePiece(b.id));
          if (seamInfo) {
            dispatch(removeSeam(seamInfo.seamId as string));
          }
          dispatch(addPiece(originalPiece));
        },
      };
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
  {
    name: 'cutAndSew',
    description:
      'Cut a piece along a line and automatically sew the cut edges. ' +
      'Combines splitPieceAtLine + auto-detect edges + create seam in one step. ' +
      '/ Cortar una pieza a lo largo de una línea y coser automáticamente los bordes cortados. ' +
      'Combina división + detección de bordes + creación de costura en un solo paso.',
    parameters: {
      type: 'object',
      properties: {
        pieceId: { type: 'string', description: 'Piece ID to cut / ID de la pieza a cortar' },
        startX: { type: 'number', description: 'Cut line start X (piece-local coords) / Inicio de línea de corte X' },
        startY: { type: 'number', description: 'Cut line start Y (piece-local coords) / Inicio de línea de corte Y' },
        endX: { type: 'number', description: 'Cut line end X (piece-local coords) / Fin de línea de corte X' },
        endY: { type: 'number', description: 'Cut line end Y (piece-local coords) / Fin de línea de corte Y' },
        seamType: {
          type: 'string',
          enum: ['standard', 'french', 'flat-felled', 'overlock'],
          description: 'Seam type (default standard) / Tipo de costura (defecto standard)',
        },
      },
      required: ['pieceId', 'startX', 'startY', 'endX', 'endY'],
    },
    execute: async (params: Record<string, unknown>, dispatch: AppDispatch, getState: () => RootState): Promise<ToolResult> => {
      const { splitPieceAtLine, findCutEdgePair } = await import('../../../../utils/patternOps');
      const { addPiece, removePiece, removeSeam, addSeam, updatePiece } = await import('../../../../store/projectSlice');

      const state = getState();
      const piece = state.project.pieces.find(p => p.id === params.pieceId);
      if (!piece) return { success: false, error: `Piece not found` };

      for (const [name, val] of [['startX', params.startX], ['startY', params.startY], ['endX', params.endX], ['endY', params.endY]] as const) {
        const err = requireFiniteNumber(val, name);
        if (err) return { success: false, error: err };
      }

      const originalPiece = JSON.parse(JSON.stringify(piece));

      const startX = params.startX as number;
      const startY = params.startY as number;
      const endX = params.endX as number;
      const endY = params.endY as number;

      // Convert piece-local coords to pattern space
      const startPoint = { x: startX + piece.position.x, y: startY + piece.position.y };
      const endPoint = { x: endX + piece.position.x, y: endY + piece.position.y };

      let a, b;
      try {
        [a, b] = splitPieceAtLine(piece, startPoint, endPoint);
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Cut failed' };
      }

      dispatch({ ...removePiece(piece.id), meta: { skipConfirmation: true } });
      dispatch(addPiece(a));
      dispatch(addPiece(b));

      // Auto-sew the cut edges
      let seamInfo: Record<string, unknown> | undefined;
      const cutPair = findCutEdgePair(a, b);
      if (cutPair) {
        dispatch(updatePiece({ ...a, edges: cutPair.edgesA }));
        dispatch(updatePiece({ ...b, edges: cutPair.edgesB }));
        const seamId = `cut-seam-${Date.now()}`;
        const seamTypeVal = (params.seamType as string) || 'standard';
        dispatch(addSeam({
          id: seamId,
          pieceA: { pieceId: a.id, edgeName: cutPair.edgeA.name },
          pieceB: { pieceId: b.id, edgeName: cutPair.edgeB.name },
          type: seamTypeVal as 'standard' | 'french' | 'flat-felled' | 'overlock',
          tension: 100, strength: 1.0, active: true, taped: false, tapeWidth: 10,
        }));
        seamInfo = { seamId, edgeA: cutPair.edgeA.name, edgeB: cutPair.edgeB.name, type: seamTypeVal };
      }

      return {
        success: true,
        data: {
          pieceA: { id: a.id, name: a.name },
          pieceB: { id: b.id, name: b.name },
          ...(seamInfo ? { seam: seamInfo } : {}),
        },
        rollback: () => {
          dispatch(removePiece(a.id));
          dispatch(removePiece(b.id));
          if (seamInfo) {
            dispatch(removeSeam(seamInfo.seamId as string));
          }
          dispatch(addPiece(originalPiece));
        },
      };
    },
  },
];
