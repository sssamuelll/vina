/**
 * Grading Tools — size grading from base pattern.
 * Herramientas de Gradación — gradación de tallas desde patrón base.
 *
 * @module gradingTools
 */

import type { ToolDefinition, ToolResult } from '../registry';
import { addPiece } from '../../../store/projectSlice';
import { gradePiece, standardGradeTable } from '../../../utils/grading';
import { uid } from '../../../utils/pathHelpers';

// ─── gradePiece ─────────────────────────────────────────────────────────────

const gradePieceTool: ToolDefinition = {
  name: 'gradePiece',
  description:
    'Grade a pattern piece from its base size to a target size using measurement-based scaling. ' +
    '/ Gradar una pieza de patrón desde su talla base a una talla objetivo usando escalado basado en medidas.',
  parameters: {
    type: 'object',
    properties: {
      pieceId: { type: 'string', description: "Piece ID to grade, or 'all' for all pieces / ID de la pieza a gradar, o 'all' para todas" },
      targetSize: {
        type: 'string',
        enum: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
        description: 'Target size / Talla objetivo',
      },
      baseSize: { type: 'string', description: 'Base size of the current pattern / Talla base del patrón actual' },
      gradeTable: {
        type: 'string',
        enum: ['standard-women', 'standard-men', 'children', 'custom'],
        description: 'Grade table to use / Tabla de gradación a usar',
      },
      primaryMeasurement: {
        type: 'string',
        enum: ['chest', 'waist', 'hips'],
        description: 'Primary measurement driving the scaling / Medida principal que determina el escalado',
      },
    },
    required: ['targetSize'],
  },
  execute: async (params, dispatch, getState): Promise<ToolResult> => {
    const state = getState();
    const targetSize = params.targetSize as string;
    const primaryMeasurement = (params.primaryMeasurement as string) || 'chest';

    const gradeTable = standardGradeTable();
    const baseMeasurements = state.project.avatar.measurements as unknown as Record<string, number>;
    const targetSizeMeasurements = gradeTable.sizes[targetSize];

    if (!targetSizeMeasurements) {
      return { success: false, error: `Target size "${targetSize}" not found in grade table` };
    }

    const pieceId = params.pieceId as string;
    const piecesToGrade = pieceId === 'all' || !pieceId
      ? state.project.pieces
      : state.project.pieces.filter(p => p.id === pieceId);

    if (piecesToGrade.length === 0) {
      return { success: false, error: 'No pieces found to grade' };
    }

    let graded = 0;
    const baseVal = baseMeasurements[primaryMeasurement] ?? 0;
    const targetVal = targetSizeMeasurements[primaryMeasurement] ?? baseVal;
    const scaleFactor = baseVal > 0 ? targetVal / baseVal : 1;

    for (const piece of piecesToGrade) {
      const gradedPiece = gradePiece(piece, baseMeasurements, targetSizeMeasurements as Record<string, number>, primaryMeasurement);
      const newPiece = {
        ...gradedPiece,
        id: uid(),
        name: `${piece.name} (${targetSize})`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      dispatch(addPiece(newPiece));
      graded++;
    }

    return {
      success: true,
      data: {
        piecesGraded: graded,
        scaleFactor,
        targetSize,
      },
    };
  },
};

// ─── gradeAllSizes ──────────────────────────────────────────────────────────

const gradeAllSizesTool: ToolDefinition = {
  name: 'gradeAllSizes',
  description:
    'Generate all sizes from a base pattern. Creates graded pieces for each size. ' +
    '/ Generar todas las tallas desde un patrón base. Crea piezas gradadas para cada talla.',
  parameters: {
    type: 'object',
    properties: {
      pieceIds: {
        type: 'array',
        items: { type: 'string' },
        description: 'Pieces to grade (default: all) / Piezas a gradar (defecto: todas)',
      },
      sizes: {
        type: 'array',
        items: { type: 'string' },
        description: 'Target sizes (default: XS through XXL) / Tallas objetivo',
      },
      gradeTable: { type: 'string', description: 'Grade table to use / Tabla de gradación a usar' },
    },
  },
  execute: async (params, dispatch, getState): Promise<ToolResult> => {
    const state = getState();
    const sizes = (params.sizes as string[]) || ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
    const gradeTable = standardGradeTable();
    const baseMeasurements = state.project.avatar.measurements as unknown as Record<string, number>;

    const pieceIds = params.pieceIds as string[] | undefined;
    const piecesToGrade = pieceIds && pieceIds.length > 0
      ? state.project.pieces.filter(p => pieceIds.includes(p.id))
      : state.project.pieces;

    if (piecesToGrade.length === 0) {
      return { success: false, error: 'No pieces found to grade' };
    }

    const results: Array<{ size: string; pieceId: string; name: string }> = [];

    for (const size of sizes) {
      const targetMeasurements = gradeTable.sizes[size];
      if (!targetMeasurements) continue;

      for (const piece of piecesToGrade) {
        const gradedPiece = gradePiece(piece, baseMeasurements, targetMeasurements as Record<string, number>);
        const newPiece = {
          ...gradedPiece,
          id: uid(),
          name: `${piece.name} (${size})`,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        dispatch(addPiece(newPiece));
        results.push({ size, pieceId: newPiece.id, name: newPiece.name });
      }
    }

    return {
      success: true,
      data: {
        sizesGenerated: sizes.length,
        pieces: results,
      },
    };
  },
};

// ─── Export ─────────────────────────────────────────────────────────────────

export const tools: ToolDefinition[] = [
  gradePieceTool,
  gradeAllSizesTool,
];
