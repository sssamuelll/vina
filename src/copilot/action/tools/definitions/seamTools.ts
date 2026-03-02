/**
 * Seam Tools — seam allowance and seam connection operations.
 * Herramientas de Costura — operaciones de margen de costura y conexiones de costura.
 *
 * @module seamTools
 */

import type { ToolDefinition, ToolResult } from '../registry';
import { updatePiece, addSeam, removeSeam } from '../../../../store/projectSlice';
import type { Seam } from '../../../../types/types';

// ─── setSeamAllowance ───────────────────────────────────────────────────────

const setSeamAllowanceTool: ToolDefinition = {
  name: 'setSeamAllowance',
  description:
    'Set seam allowance (margen de costura) width for a piece. Standard: 10mm (1cm). Hems usually 30-40mm. ' +
    '/ Establecer el ancho del margen de costura para una pieza. Estándar: 10mm (1cm). Dobladillos: 30-40mm.',
  parameters: {
    type: 'object',
    properties: {
      pieceId: { type: 'string', description: "Piece ID, or 'all' for all pieces / ID de la pieza, o 'all' para todas" },
      width: { type: 'number', description: 'Seam allowance width in mm / Ancho del margen de costura en mm' },
    },
    required: ['pieceId', 'width'],
  },
  execute: async (params, dispatch, getState): Promise<ToolResult> => {
    const state = getState();
    const width = params.width as number;
    const pieceId = params.pieceId as string;

    if (pieceId === 'all') {
      let count = 0;
      for (const piece of state.project.pieces) {
        dispatch(updatePiece({ ...piece, seamAllowance: width, updatedAt: Date.now() }));
        count++;
      }
      return { success: true, data: { piecesAffected: count } };
    }

    const piece = state.project.pieces.find(p => p.id === pieceId);
    if (!piece) return { success: false, error: `Piece "${pieceId}" not found` };

    dispatch(updatePiece({ ...piece, seamAllowance: width, updatedAt: Date.now() }));
    return { success: true, data: { piecesAffected: 1 } };
  },
};

// ─── auditSeamAllowances ────────────────────────────────────────────────────

const auditSeamAllowancesTool: ToolDefinition = {
  name: 'auditSeamAllowances',
  description:
    'Check all pieces for seam allowance consistency. Reports missing SA, mismatched SA between connected pieces, and non-standard values. ' +
    '/ Revisar todas las piezas para consistencia de margen de costura. Reporta SA faltante, discrepancias entre piezas conectadas y valores no estándar.',
  parameters: {
    type: 'object',
    properties: {},
  },
  execute: async (_params, _dispatch, getState): Promise<ToolResult> => {
    const state = getState();
    const issues: Array<{ pieceId: string; pieceName: string; issue: string; detail: string }> = [];

    for (const piece of state.project.pieces) {
      if (piece.seamAllowance === 0) {
        issues.push({
          pieceId: piece.id,
          pieceName: piece.name,
          issue: 'missing',
          detail: 'No seam allowance set (0mm)',
        });
      } else if (piece.seamAllowance !== 10 && piece.seamAllowance !== 15) {
        issues.push({
          pieceId: piece.id,
          pieceName: piece.name,
          issue: 'non-standard',
          detail: `Seam allowance is ${piece.seamAllowance}mm (standard is 10mm or 15mm)`,
        });
      }
    }

    // Check mismatches between connected pieces
    for (const seam of state.project.seams) {
      const pieceA = state.project.pieces.find(p => p.id === seam.pieceA.pieceId);
      const pieceB = state.project.pieces.find(p => p.id === seam.pieceB.pieceId);
      if (pieceA && pieceB && pieceA.seamAllowance !== pieceB.seamAllowance) {
        issues.push({
          pieceId: pieceA.id,
          pieceName: `${pieceA.name} ↔ ${pieceB.name}`,
          issue: 'mismatch',
          detail: `SA mismatch: ${pieceA.name} has ${pieceA.seamAllowance}mm, ${pieceB.name} has ${pieceB.seamAllowance}mm`,
        });
      }
    }

    return { success: true, data: { issues } };
  },
};

// ─── createSeam ─────────────────────────────────────────────────────────────

const createSeamTool: ToolDefinition = {
  name: 'createSeam',
  description:
    'Connect two edges from different pieces with a seam (costura). ' +
    '/ Conectar dos bordes de diferentes piezas con una costura.',
  parameters: {
    type: 'object',
    properties: {
      pieceAId: { type: 'string', description: 'First piece ID / ID de la primera pieza' },
      edgeAStart: { type: 'integer', description: 'Start segment index on piece A / Índice de segmento inicial en pieza A' },
      edgeAEnd: { type: 'integer', description: 'End segment index on piece A / Índice de segmento final en pieza A' },
      pieceBId: { type: 'string', description: 'Second piece ID / ID de la segunda pieza' },
      edgeBStart: { type: 'integer', description: 'Start segment index on piece B / Índice de segmento inicial en pieza B' },
      edgeBEnd: { type: 'integer', description: 'End segment index on piece B / Índice de segmento final en pieza B' },
      seamType: {
        type: 'string',
        enum: ['standard', 'french', 'flat-felled', 'overlock'],
        description: 'Seam type / Tipo de costura',
      },
    },
    required: ['pieceAId', 'edgeAStart', 'edgeAEnd', 'pieceBId', 'edgeBStart', 'edgeBEnd'],
  },
  execute: async (params, dispatch, getState): Promise<ToolResult> => {
    const state = getState();
    const pieceA = state.project.pieces.find(p => p.id === params.pieceAId);
    const pieceB = state.project.pieces.find(p => p.id === params.pieceBId);

    if (!pieceA) return { success: false, error: `Piece A "${params.pieceAId}" not found` };
    if (!pieceB) return { success: false, error: `Piece B "${params.pieceBId}" not found` };

    const seamId = `seam-${Date.now()}-${Math.random().toString(36).slice(2, 4)}`;
    const seam: Seam = {
      id: seamId,
      pieceA: {
        pieceId: params.pieceAId as string,
        edgeStart: params.edgeAStart as number,
        edgeEnd: params.edgeAEnd as number,
      },
      pieceB: {
        pieceId: params.pieceBId as string,
        edgeStart: params.edgeBStart as number,
        edgeEnd: params.edgeBEnd as number,
      },
      type: (params.seamType as Seam['type']) || 'standard',
    };

    dispatch(addSeam(seam));
    return { success: true, data: { seamId } };
  },
};

// ─── removeSeam ─────────────────────────────────────────────────────────────

const removeSeamTool: ToolDefinition = {
  name: 'removeSeam',
  description:
    'Remove a seam connection between pieces. / Eliminar una conexión de costura entre piezas.',
  parameters: {
    type: 'object',
    properties: {
      seamId: { type: 'string', description: 'Seam ID / ID de la costura' },
    },
    required: ['seamId'],
  },
  execute: async (params, dispatch, getState): Promise<ToolResult> => {
    const state = getState();
    const seam = state.project.seams.find(s => s.id === params.seamId);
    if (!seam) return { success: false, error: `Seam "${params.seamId}" not found` };

    dispatch(removeSeam(params.seamId as string));
    return { success: true };
  },
};

// ─── Export ─────────────────────────────────────────────────────────────────

export const tools: ToolDefinition[] = [
  setSeamAllowanceTool,
  auditSeamAllowancesTool,
  createSeamTool,
  removeSeamTool,
];
