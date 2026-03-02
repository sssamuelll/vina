/**
 * Modify Dimension Tools — semantic length/width adjustments.
 * Herramientas de Modificación — ajustes semánticos de largo/ancho.
 *
 * @module modifyDimensionTools
 */

import type { ToolDefinition, ToolResult } from '../registry';
import { updatePiece } from '../../../store/projectSlice';

const modifyDimensionTool: ToolDefinition = {
  name: 'modifyDimension',
  description:
    'Modify a piece dimension: lengthen, shorten, widen, or narrow by a specified amount. ' +
    'Automatically identifies the correct edge (hem for length, side for width). ' +
    '/ Modificar dimensión: alargar, acortar, ensanchar o estrechar por una cantidad especificada. ' +
    'Identifica automáticamente el borde correcto (dobladillo para largo, costado para ancho).',
  parameters: {
    type: 'object',
    properties: {
      pieceId: {
        type: 'string',
        description: "Piece ID to modify, or 'all' / ID de la pieza, o 'all' para todas",
      },
      direction: {
        type: 'string',
        enum: ['lengthen', 'shorten', 'widen', 'narrow'],
        description: 'Modification direction / Dirección de modificación',
      },
      amount: {
        type: 'number',
        description: 'Amount in mm (always positive) / Cantidad en mm (siempre positiva)',
      },
      targetEdge: {
        type: 'string',
        description: 'Specific edge name (optional, auto-detected if omitted) / Nombre del borde (opcional)',
      },
    },
    required: ['direction', 'amount'],
  },
  execute: async (params, dispatch, getState): Promise<ToolResult> => {
    const { modifyDimension } = await import('../../../utils/modifyDimension');
    const state = getState();
    const direction = params.direction as 'lengthen' | 'shorten' | 'widen' | 'narrow';
    const amount = params.amount as number;
    const targetEdge = params.targetEdge as string | undefined;

    if (amount <= 0) {
      return { success: false, error: 'Amount must be positive' };
    }

    const pieceId = params.pieceId as string;
    const pieces = pieceId === 'all' || !pieceId
      ? state.project.pieces
      : state.project.pieces.filter(p => p.id === pieceId);

    if (pieces.length === 0) {
      return { success: false, error: 'No pieces found' };
    }

    // Save original pieces for rollback
    const originalPieces = pieces.map(p => ({ ...p }));

    const results: Array<{ name: string; edge: string; nodes: number }> = [];

    for (const piece of pieces) {
      try {
        const result = modifyDimension(piece, { direction, amount, targetEdge });
        dispatch(updatePiece(result.piece));
        results.push({
          name: piece.name,
          edge: result.edgeName,
          nodes: result.nodesAffected,
        });
      } catch (err) {
        return {
          success: false,
          error: `Failed on "${piece.name}": ${(err as Error).message}`,
        };
      }
    }

    const directionEs: Record<string, string> = {
      lengthen: 'alargado',
      shorten: 'acortado',
      widen: 'ensanchado',
      narrow: 'estrechado',
    };

    return {
      success: true,
      data: {
        direction,
        directionEs: directionEs[direction],
        amountMm: amount,
        amountCm: amount / 10,
        piecesModified: results,
      },
      // Rollback function to restore original pieces
      rollback: () => {
        for (const originalPiece of originalPieces) {
          dispatch(updatePiece(originalPiece));
        }
      },
    };
  },
};

export const tools: ToolDefinition[] = [modifyDimensionTool];
