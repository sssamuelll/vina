/**
 * Copilot tools for advanced patternmaking operations.
 */

import type { ToolDefinition, ToolResult } from '../registry';
import type { AppDispatch, RootState } from '../../../../store';
import type { PatternPiece } from '../../../../types/types';

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
  {
    name: 'offsetPattern',
    description:
      'Offset a pattern piece outline by a distance. Positive = outward, negative = inward. / Desplazar el contorno de una pieza de patrón. Positivo = hacia afuera, negativo = hacia adentro.',
    parameters: {
      type: 'object',
      properties: {
        pieceId: { type: 'string', description: 'Piece ID' },
        distance: { type: 'number', description: 'Offset distance in mm (positive = outward, negative = inward)' },
        joinType: { type: 'string', description: 'Join type: miter, round, or square (default miter)' },
        replace: { type: 'boolean', description: 'Replace original piece instead of creating a new one (default false)' },
      },
      required: ['pieceId', 'distance'],
    },
    execute: async (params: Record<string, unknown>, dispatch: AppDispatch, getState: () => RootState): Promise<ToolResult> => {
      const { offsetPieceOutline } = await import('../../../../utils/patternOps');
      const { addPiece, updatePiece, removePiece } = await import('../../../../store/projectSlice');
      const state = getState();
      const piece = state.project.pieces.find(p => p.id === params.pieceId);
      if (!piece) return { success: false, error: `Piece not found` };
      const distErr = requireFiniteNumber(params.distance, 'distance');
      if (distErr) return { success: false, error: distErr };
      const joinType = (params.joinType as string) || 'miter';
      const newOutline = offsetPieceOutline(piece, params.distance as number, joinType as 'miter' | 'round' | 'square');
      if (!newOutline) return { success: false, error: `Offset collapsed the shape (distance too large)` };
      const replace = params.replace as boolean;
      if (replace) {
        const snapshot = JSON.parse(JSON.stringify(piece)) as PatternPiece;
        const updated: PatternPiece = { ...piece, outline: newOutline, edges: undefined, updatedAt: Date.now() };
        dispatch(updatePiece(updated));
        return {
          success: true,
          data: { pieceId: piece.id, distance: params.distance, joinType, replaced: true },
          rollback: () => dispatch(updatePiece(snapshot)),
        };
      } else {
        const offsetPiece: PatternPiece = {
          ...piece,
          id: `offset-${piece.id}-${Date.now()}`,
          name: `${piece.name} Offset`,
          outline: newOutline,
          edges: undefined,
          position: { x: piece.position.x + 15, y: piece.position.y },
          updatedAt: Date.now(),
        };
        dispatch(addPiece(offsetPiece));
        return {
          success: true,
          data: { pieceId: offsetPiece.id, name: offsetPiece.name, distance: params.distance, joinType, replaced: false },
          rollback: () => dispatch(removePiece(offsetPiece.id)),
        };
      }
    },
  },
  {
    name: 'extendEdge',
    description:
      'Extend a semantic edge of a pattern piece by a given distance. / Extender un borde semántico de una pieza de patrón por una distancia dada.',
    parameters: {
      type: 'object',
      properties: {
        pieceId: { type: 'string', description: 'Piece ID' },
        edgeName: { type: 'string', description: 'Semantic edge name (e.g., hemline, sideSeam)' },
        endpoint: { type: 'string', description: 'Which end to extend: start or end' },
        distance: { type: 'number', description: 'Extension distance in mm' },
      },
      required: ['pieceId', 'edgeName', 'endpoint', 'distance'],
    },
    execute: async (params: Record<string, unknown>, dispatch: AppDispatch, getState: () => RootState): Promise<ToolResult> => {
      const { extendEdge: extendEdgeFn } = await import('../../../../utils/patternOps');
      const { updatePiece } = await import('../../../../store/projectSlice');
      const { findEdgeByName } = await import('../../../../utils/semanticEdges');
      const state = getState();
      const piece = state.project.pieces.find(p => p.id === params.pieceId);
      if (!piece) return { success: false, error: `Piece not found` };
      if (!piece.edges) return { success: false, error: `Piece has no semantic edges` };
      const edge = findEdgeByName(piece.edges, params.edgeName as string);
      if (!edge) return { success: false, error: `Edge "${params.edgeName}" not found` };
      const distErr = requireFiniteNumber(params.distance, 'distance');
      if (distErr) return { success: false, error: distErr };
      const endpoint = params.endpoint as 'start' | 'end';
      const segmentIndex = endpoint === 'start' ? edge.segmentRange[0] : edge.segmentRange[1] - 1;
      const snapshot = JSON.parse(JSON.stringify(piece)) as PatternPiece;
      const result = extendEdgeFn(piece, segmentIndex, endpoint, params.distance as number);
      dispatch(updatePiece(result));
      return {
        success: true,
        data: { pieceId: result.id, edgeName: params.edgeName, endpoint, distance: params.distance },
        rollback: () => dispatch(updatePiece(snapshot)),
      };
    },
  },
  {
    name: 'trimEdge',
    description:
      'Trim a semantic edge at a given point, keeping one side. / Recortar un borde semántico en un punto dado, conservando un lado.',
    parameters: {
      type: 'object',
      properties: {
        pieceId: { type: 'string', description: 'Piece ID' },
        edgeName: { type: 'string', description: 'Semantic edge name' },
        trimX: { type: 'number', description: 'X coordinate of trim point in mm' },
        trimY: { type: 'number', description: 'Y coordinate of trim point in mm' },
        keepSide: { type: 'string', description: 'Which side to keep: start or end' },
      },
      required: ['pieceId', 'edgeName', 'trimX', 'trimY', 'keepSide'],
    },
    execute: async (params: Record<string, unknown>, dispatch: AppDispatch, getState: () => RootState): Promise<ToolResult> => {
      const { trimEdgeAtPoint } = await import('../../../../utils/patternOps');
      const { updatePiece } = await import('../../../../store/projectSlice');
      const { findEdgeByName } = await import('../../../../utils/semanticEdges');
      const state = getState();
      const piece = state.project.pieces.find(p => p.id === params.pieceId);
      if (!piece) return { success: false, error: `Piece not found` };
      if (!piece.edges) return { success: false, error: `Piece has no semantic edges` };
      const edge = findEdgeByName(piece.edges, params.edgeName as string);
      if (!edge) return { success: false, error: `Edge "${params.edgeName}" not found` };
      const xErr = requireFiniteNumber(params.trimX, 'trimX');
      if (xErr) return { success: false, error: xErr };
      const yErr = requireFiniteNumber(params.trimY, 'trimY');
      if (yErr) return { success: false, error: yErr };
      // Find closest segment in edge range to trim point
      const trimPt = { x: params.trimX as number, y: params.trimY as number };
      let segmentIndex = edge.segmentRange[0];
      let bestDist = Infinity;
      let cx = 0, cy = 0;
      for (let i = 0; i < piece.outline.length; i++) {
        const c = piece.outline[i];
        let ex = cx, ey = cy;
        if (c.type === 'M') { ex = c.values[0]; ey = c.values[1]; }
        else if (c.type === 'L') { ex = c.values[0]; ey = c.values[1]; }
        else if (c.type === 'C') { ex = c.values[4]; ey = c.values[5]; }
        if (i >= edge.segmentRange[0] && i < edge.segmentRange[1] && c.type !== 'M') {
          const mx = (cx + ex) / 2, my = (cy + ey) / 2;
          const d = Math.hypot(trimPt.x - mx, trimPt.y - my);
          if (d < bestDist) { bestDist = d; segmentIndex = i; }
        }
        cx = ex; cy = ey;
      }
      const snapshot = JSON.parse(JSON.stringify(piece)) as PatternPiece;
      const keepSideParam = params.keepSide as string;
      const keepSide: 'before' | 'after' = keepSideParam === 'start' ? 'before' : 'after';
      const result = trimEdgeAtPoint(
        piece,
        segmentIndex,
        { x: params.trimX as number, y: params.trimY as number },
        keepSide,
      );
      dispatch(updatePiece(result));
      return {
        success: true,
        data: { pieceId: result.id, edgeName: params.edgeName, trimX: params.trimX, trimY: params.trimY, keepSide: params.keepSide },
        rollback: () => dispatch(updatePiece(snapshot)),
      };
    },
  },
];
