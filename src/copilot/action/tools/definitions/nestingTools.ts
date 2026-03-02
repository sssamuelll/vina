/**
 * Nesting Tools — fabric layout optimization.
 * Herramientas de Anidamiento — optimización de tendido en tela.
 *
 * @module nestingTools
 */

import type { ToolDefinition, ToolResult } from '../registry';
import { nestPieces, computeArea } from '../../../../utils/nesting';

// ─── runNesting ─────────────────────────────────────────────────────────────

const runNestingTool: ToolDefinition = {
  name: 'runNesting',
  description:
    'Arrange pattern pieces on fabric sheets for optimal material usage. Returns fabric consumption. ' +
    '/ Acomodar piezas de patrón en hojas de tela para uso óptimo del material. Retorna consumo de tela.',
  parameters: {
    type: 'object',
    properties: {
      pieceIds: {
        type: 'array',
        items: { type: 'string' },
        description: 'Pieces to nest (default: all) / Piezas a anidar (defecto: todas)',
      },
      fabricWidth: { type: 'number', description: 'Fabric width in mm (default 1500 = 150cm) / Ancho de tela en mm' },
      fabricLength: { type: 'number', description: 'Max fabric length in mm (default 3000) / Largo máximo de tela en mm' },
      gap: { type: 'number', description: 'Minimum gap between pieces in mm (default 5) / Espacio mínimo entre piezas en mm' },
      rotationStep: { type: 'integer', description: 'Rotation granularity in degrees (default 90) / Granularidad de rotación en grados' },
      allowMirror: { type: 'boolean', description: 'Allow mirroring pieces / Permitir espejar piezas' },
      sortStrategy: {
        type: 'string',
        enum: ['area-desc', 'height-desc', 'width-desc'],
        description: 'Sorting strategy for pieces / Estrategia de ordenamiento',
      },
      includeSeamAllowance: { type: 'boolean', description: 'Include SA in nested pieces (default true) / Incluir margen de costura' },
    },
  },
  execute: async (params, _dispatch, getState): Promise<ToolResult> => {
    const state = getState();

    const pieceIds = params.pieceIds as string[] | undefined;
    const pieces = pieceIds && pieceIds.length > 0
      ? state.project.pieces.filter(p => pieceIds.includes(p.id))
      : state.project.pieces;

    if (pieces.length === 0) {
      return { success: false, error: 'No pieces to nest' };
    }

    const fabricWidth = (params.fabricWidth as number) || 1500;
    const fabricLength = (params.fabricLength as number) || 3000;

    const result = nestPieces(pieces, {
      sheet: { width: fabricWidth, height: fabricLength, margin: 10 },
      gap: (params.gap as number) || 5,
      rotationStep: (params.rotationStep as number) || 90,
      allowMirror: (params.allowMirror as boolean) || false,
      sortStrategy: (params.sortStrategy as 'area-desc' | 'height-desc' | 'width-desc') || 'area-desc',
    });

    const totalFabricArea = pieces.reduce((sum, p) => sum + computeArea(p.outline), 0);

    return {
      success: true,
      data: {
        sheetsUsed: result.sheetsUsed,
        utilization: Math.round(result.utilization * 100) / 100,
        totalFabricArea: Math.round(totalFabricArea),
        unplaced: result.unplaced,
        placements: result.placements,
      },
    };
  },
};

// ─── Export ─────────────────────────────────────────────────────────────────

export const tools: ToolDefinition[] = [
  runNestingTool,
];
