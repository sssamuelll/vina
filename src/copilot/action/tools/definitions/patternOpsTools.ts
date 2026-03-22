/**
 * Copilot tools for advanced patternmaking operations.
 */

import type { ToolDefinition, ToolResult } from '../registry';
import type { AppDispatch, RootState } from '../../../../store';
import type { PatternPiece, InternalLineType, PathCommand } from '../../../../types/types';

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
  {
    name: 'unfoldPiece',
    description: 'Mirror a half-pattern along a fold line to produce a full symmetric piece. / Desplegar una mitad de patrón a lo largo de una línea de doblez.',
    parameters: {
      type: 'object',
      properties: {
        pieceId: { type: 'string', description: 'Piece ID' },
        foldLineId: { type: 'string', description: 'ID of the fold internal line' },
        outlineOnly: { type: 'boolean', description: 'Mirror only the outline, not internal lines (default false)' },
      },
      required: ['pieceId', 'foldLineId'],
    },
    execute: async (params: Record<string, unknown>, dispatch: AppDispatch, getState: () => RootState): Promise<ToolResult> => {
      const { unfoldPiece } = await import('../../../../utils/patternOps');
      const { updatePiece } = await import('../../../../store/projectSlice');
      const state = getState();
      const piece = state.project.pieces.find(p => p.id === params.pieceId);
      if (!piece) return { success: false, error: 'Piece not found' };
      const snapshot: PatternPiece = JSON.parse(JSON.stringify(piece));
      try {
        const result = unfoldPiece(piece, params.foldLineId as string, { outlineOnly: params.outlineOnly as boolean | undefined });
        dispatch(updatePiece(result));
        return { success: true, data: { pieceId: result.id, internalsCount: result.internals.length }, rollback: () => dispatch(updatePiece(snapshot)) };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Unfold failed' };
      }
    },
  },
  {
    name: 'optimizeCurvePoints',
    description: 'Reduce bezier control points while preserving curve shape. / Optimizar puntos de curva manteniendo la forma.',
    parameters: {
      type: 'object',
      properties: {
        pieceId: { type: 'string', description: 'Piece ID' },
        ratio: { type: 'number', description: 'Simplification ratio: 0.0 (aggressive) to 1.0 (preserve all), default 0.5' },
        target: { type: 'string', description: '"all" (default), "outline", or an internalLineId' },
      },
      required: ['pieceId'],
    },
    execute: async (params: Record<string, unknown>, dispatch: AppDispatch, getState: () => RootState): Promise<ToolResult> => {
      const { optimizePieceCurves } = await import('../../../../utils/patternOps');
      const { updatePiece } = await import('../../../../store/projectSlice');
      const state = getState();
      const piece = state.project.pieces.find(p => p.id === params.pieceId);
      if (!piece) return { success: false, error: 'Piece not found' };
      const ratioErr = params.ratio !== undefined ? requireFiniteNumber(params.ratio, 'ratio') : null;
      if (ratioErr) return { success: false, error: ratioErr };
      const snapshot: PatternPiece = JSON.parse(JSON.stringify(piece));
      const ratio = (params.ratio as number) ?? 0.5;
      const targetStr = (params.target as string) ?? 'all';
      const target = (targetStr === 'all' || targetStr === 'outline') ? targetStr : { internalLineId: targetStr };
      try {
        const result = optimizePieceCurves(piece, { ratio, target });
        dispatch(updatePiece(result));
        return { success: true, data: { pieceId: result.id, outlinePoints: result.outline.length }, rollback: () => dispatch(updatePiece(snapshot)) };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Optimize failed' };
      }
    },
  },
  {
    name: 'offsetInternalLine',
    description: 'Create parallel copies of an internal line at a given distance. / Crear copias paralelas de una línea interna a una distancia dada.',
    parameters: {
      type: 'object',
      properties: {
        pieceId: { type: 'string', description: 'Piece ID' },
        sourceLineId: { type: 'string', description: 'Source internal line ID' },
        count: { type: 'number', description: 'Number of copies (1-10, default 1)' },
        distance: { type: 'number', description: 'Distance between copies in mm' },
        reverse: { type: 'boolean', description: 'Flip offset direction (default false)' },
        extend: { type: 'boolean', description: 'Extend to outline boundary (default false)' },
      },
      required: ['pieceId', 'sourceLineId', 'distance'],
    },
    execute: async (params: Record<string, unknown>, dispatch: AppDispatch, getState: () => RootState): Promise<ToolResult> => {
      const { offsetInternalLine } = await import('../../../../utils/patternOps');
      const { updatePiece } = await import('../../../../store/projectSlice');
      const state = getState();
      const piece = state.project.pieces.find(p => p.id === params.pieceId);
      if (!piece) return { success: false, error: 'Piece not found' };
      const distErr = requireFiniteNumber(params.distance, 'distance');
      if (distErr) return { success: false, error: distErr };
      const snapshot: PatternPiece = JSON.parse(JSON.stringify(piece));
      try {
        const result = offsetInternalLine(piece, params.sourceLineId as string, {
          count: (params.count as number) ?? 1, distance: params.distance as number,
          reverse: params.reverse as boolean | undefined, extend: params.extend as boolean | undefined,
        });
        dispatch(updatePiece(result));
        return { success: true, data: { pieceId: result.id, totalInternals: result.internals.length }, rollback: () => dispatch(updatePiece(snapshot)) };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Offset failed' };
      }
    },
  },
  {
    name: 'polyPenDraw',
    description: 'Draw a shape from a list of points with straight lines and curves. / Dibujar una forma con líneas rectas y curvas.',
    parameters: {
      type: 'object',
      properties: {
        points: {
          type: 'array', description: 'Array of {x, y, type: "straight"|"curve", handleIn?: {x,y}, handleOut?: {x,y}}',
          items: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' }, type: { type: 'string', enum: ['straight', 'curve'] }, handleIn: { type: 'object' }, handleOut: { type: 'object' } }, required: ['x', 'y', 'type'] },
        },
        mode: { type: 'string', enum: ['piece', 'internalLine'], description: 'piece (default) or internalLine' },
        targetPieceId: { type: 'string', description: 'Required when mode is internalLine' },
        lineType: { type: 'string', enum: ['fold', 'reference', 'topstitch'], description: 'Internal line type (default fold)' },
      },
      required: ['points'],
    },
    execute: async (params: Record<string, unknown>, dispatch: AppDispatch, getState: () => RootState): Promise<ToolResult> => {
      const { addPiece, updatePiece } = await import('../../../../store/projectSlice');
      const state = getState();
      const points = params.points as Array<{ x: number; y: number; type: string; handleIn?: { x: number; y: number }; handleOut?: { x: number; y: number } }>;
      if (!points || points.length < 2) return { success: false, error: 'Need at least 2 points' };

      const cmds: PathCommand[] = [{ type: 'M', values: [points[0].x, points[0].y] }];
      for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1], curr = points[i];
        if (curr.type === 'curve' || prev.type === 'curve') {
          const cp1 = prev.handleOut || { x: prev.x, y: prev.y };
          const cp2 = curr.handleIn || { x: curr.x, y: curr.y };
          cmds.push({ type: 'C', values: [cp1.x, cp1.y, cp2.x, cp2.y, curr.x, curr.y] });
        } else {
          cmds.push({ type: 'L', values: [curr.x, curr.y] });
        }
      }
      cmds.push({ type: 'Z', values: [] });

      const mode = (params.mode as string) || 'piece';
      if (mode === 'piece') {
        const newPiece = { id: `piece-${Date.now()}`, name: 'Poly Pen Piece', outline: cmds, internals: [], position: { x: 0, y: 0 }, rotation: 0, mirrored: false, seamAllowance: 10, layer: 1, sublayer: 0, active: true, createdAt: Date.now(), updatedAt: Date.now() };
        dispatch(addPiece(newPiece));
        return { success: true, data: { pieceId: newPiece.id }, rollback: () => dispatch({ type: 'project/removePiece', payload: newPiece.id, meta: { skipConfirmation: true } }) };
      } else {
        const targetId = params.targetPieceId as string;
        if (!targetId) return { success: false, error: 'targetPieceId required for internalLine mode' };
        const piece = state.project.pieces.find(p => p.id === targetId);
        if (!piece) return { success: false, error: 'Target piece not found' };
        const snapshot: PatternPiece = JSON.parse(JSON.stringify(piece));
        const lt = (params.lineType as string) || 'fold';
        const lineId = `line-${Date.now()}`;
        dispatch(updatePiece({ ...piece, internals: [...piece.internals, { id: lineId, type: lt as InternalLineType, path: cmds.slice(0, -1) }], updatedAt: Date.now() }));
        return { success: true, data: { pieceId: targetId, lineId }, rollback: () => dispatch(updatePiece(snapshot)) };
      }
    },
  },
  {
    name: 'replaceAsPatternOutline',
    description: 'Swap an internal line with a section of the pattern outline. Old outline becomes a reference line. / Reemplazar sección del contorno con una línea interna.',
    parameters: {
      type: 'object',
      properties: {
        pieceId: { type: 'string', description: 'Piece ID' },
        internalLineId: { type: 'string', description: 'Internal line to promote to outline' },
        outlineSegmentRange: { type: 'array', items: { type: 'number' }, description: 'Start and end command indices: [start, end]' },
        outlineStartPoint: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } }, description: 'Alternative: start point near outline' },
        outlineEndPoint: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } }, description: 'Alternative: end point near outline' },
      },
      required: ['pieceId', 'internalLineId'],
    },
    execute: async (params: Record<string, unknown>, dispatch: AppDispatch, getState: () => RootState): Promise<ToolResult> => {
      const { replaceAsPatternOutline } = await import('../../../../utils/patternOps');
      const { updatePiece } = await import('../../../../store/projectSlice');
      const state = getState();
      const piece = state.project.pieces.find(p => p.id === params.pieceId);
      if (!piece) return { success: false, error: 'Piece not found' };
      const snapshot: PatternPiece = JSON.parse(JSON.stringify(piece));

      let range = params.outlineSegmentRange as [number, number] | undefined;
      if (!range && params.outlineStartPoint && params.outlineEndPoint) {
        const start = params.outlineStartPoint as { x: number; y: number };
        const end = params.outlineEndPoint as { x: number; y: number };
        let bestStartIdx = 0, bestEndIdx = 0, bestStartDist = Infinity, bestEndDist = Infinity;
        for (let i = 0; i < piece.outline.length; i++) {
          const v = piece.outline[i].values;
          if (v.length < 2) continue;
          const ex = v[v.length - 2], ey = v[v.length - 1];
          const dStart = Math.hypot(ex - start.x, ey - start.y);
          const dEnd = Math.hypot(ex - end.x, ey - end.y);
          if (dStart < bestStartDist) { bestStartDist = dStart; bestStartIdx = i; }
          if (dEnd < bestEndDist) { bestEndDist = dEnd; bestEndIdx = i; }
        }
        range = [Math.min(bestStartIdx, bestEndIdx), Math.max(bestStartIdx, bestEndIdx)];
      }
      if (!range) return { success: false, error: 'outlineSegmentRange or start/end points required' };

      try {
        const result = replaceAsPatternOutline(piece, params.internalLineId as string, range);
        dispatch(updatePiece(result));
        return { success: true, data: { pieceId: result.id }, rollback: () => dispatch(updatePiece(snapshot)) };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Replace failed' };
      }
    },
  },
];
