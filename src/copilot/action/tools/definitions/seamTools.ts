/**
 * Seam Tools — seam allowance and seam connection operations.
 * Herramientas de Costura — operaciones de margen de costura y conexiones de costura.
 *
 * @module seamTools
 */

import type { ToolDefinition, ToolResult } from '../registry';
import { updatePiece, addSeam, removeSeam } from '../../../../store/projectSlice';
import type { Seam, CornerType } from '../../../../types/types';
import { DEFAULT_SEAM_TENSION, DEFAULT_SEAM_STRENGTH } from '../../../../utils/defaults';
import { newId } from '../../../../utils/ids';
import { applyPctRange } from '../../../../utils/seam/seamRange';
import { CreateSeamSchema } from '../validation';

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
    'Check pieces with an EXPLICIT seam allowance for consistency. Reports mismatched SA between connected pieces and non-standard values. SA 0 (net pattern) is the normal working state, never an issue. ' +
    '/ Revisar consistencia de las piezas con margen de costura EXPLÍCITO. Reporta discrepancias entre piezas conectadas y valores no estándar. SA 0 (patrón en neto) es el estado normal de trabajo, nunca un issue.',
  parameters: {
    type: 'object',
    properties: {},
  },
  execute: async (_params, _dispatch, getState): Promise<ToolResult> => {
    const state = getState();
    const issues: Array<{ pieceId: string; pieceName: string; issue: string; detail: string }> = [];

    for (const piece of state.project.pieces) {
      // SA = 0 is the normal NET state (hallazgo #2) — not an issue.
      // Only explicitly-set values get audited for standard widths.
      if (piece.seamAllowance > 0 && piece.seamAllowance !== 10 && piece.seamAllowance !== 15) {
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
    'Connect two named edges from different pieces with a seam (costura). ' +
    'Use edge names like "armhole", "sideSeam", "hemline", "shoulder". ' +
    'Optional rangeA/rangeB = [startPercent, endPercent] (0–100) sew only that span of the edge ' +
    '(CLO3D-style seam extents); omit them to sew the full edges. Percent positions are matched ' +
    'across halves, so use the same or nested spans for partial sewing. ' +
    '/ Conectar dos bordes nombrados de diferentes piezas con una costura. rangeA/rangeB opcionales ' +
    '= [inicio%, fin%] (0–100) cosen solo esa porción del borde; omítelos para coser el borde completo.',
  parameters: {
    type: 'object',
    properties: {
      pieceAId: { type: 'string', description: 'First piece ID / ID de la primera pieza' },
      edgeAName: { type: 'string', description: 'Semantic edge name on piece A (e.g. "armhole", "sideSeam") / Nombre del borde semántico en pieza A' },
      pieceBId: { type: 'string', description: 'Second piece ID / ID de la segunda pieza' },
      edgeBName: { type: 'string', description: 'Semantic edge name on piece B / Nombre del borde semántico en pieza B' },
      seamType: {
        type: 'string',
        enum: ['standard', 'french', 'flat-felled', 'overlock'],
        description: 'Seam type / Tipo de costura',
      },
      rangeA: {
        type: 'array',
        items: { type: 'number' },
        description: 'Optional [startPercent, endPercent] (0–100) sewn span of edge A / porción cosida del borde A en %',
      },
      rangeB: {
        type: 'array',
        items: { type: 'number' },
        description: 'Optional [startPercent, endPercent] (0–100) sewn span of edge B / porción cosida del borde B en %',
      },
    },
    required: ['pieceAId', 'edgeAName', 'pieceBId', 'edgeBName'],
  },
  schema: CreateSeamSchema,
  execute: async (params, dispatch, getState): Promise<ToolResult> => {
    const state = getState();
    const pieceA = state.project.pieces.find(p => p.id === params.pieceAId);
    const pieceB = state.project.pieces.find(p => p.id === params.pieceBId);

    if (!pieceA) return { success: false, error: `Piece A "${params.pieceAId}" not found` };
    if (!pieceB) return { success: false, error: `Piece B "${params.pieceBId}" not found` };

    const edgeAName = params.edgeAName as string;
    const edgeBName = params.edgeBName as string;

    // Validate edge names exist on the pieces
    const edgeA = pieceA.edges?.find(e => e.name === edgeAName);
    const edgeB = pieceB.edges?.find(e => e.name === edgeBName);
    if (!edgeA) return { success: false, error: `Edge "${edgeAName}" not found on piece "${pieceA.name}". Available: ${pieceA.edges?.map(e => e.name).join(', ') || 'none (run detectEdges first)'}` };
    if (!edgeB) return { success: false, error: `Edge "${edgeBName}" not found on piece "${pieceB.name}". Available: ${pieceB.edges?.map(e => e.name).join(', ') || 'none (run detectEdges first)'}` };

    const rangeA = params.rangeA as [number, number] | undefined;
    const rangeB = params.rangeB as [number, number] | undefined;

    const seamId = newId();
    // Full range → NO tStart/tEnd fields (applyPctRange normalizes) — the
    // Seam convention: sub-range fields only when a real sub-range exists.
    const seam: Seam = {
      id: seamId,
      pieceA: applyPctRange(
        { pieceId: params.pieceAId as string, edgeName: edgeAName },
        rangeA?.[0] ?? 0, rangeA?.[1] ?? 100,
      ),
      pieceB: applyPctRange(
        { pieceId: params.pieceBId as string, edgeName: edgeBName },
        rangeB?.[0] ?? 0, rangeB?.[1] ?? 100,
      ),
      type: (params.seamType as Seam['type']) || 'standard',
      tension: DEFAULT_SEAM_TENSION,
      strength: DEFAULT_SEAM_STRENGTH,
      active: true,
      taped: false,
      tapeWidth: 10,
      createdBy: 'ai', // agent-created seam — review me
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

// ─── setCornerType ───────────────────────────────────────────────────────────

const setCornerTypeTool: ToolDefinition = {
  name: 'setCornerType',
  description:
    'Set seam corner type for a specific vertex on a piece outline. ' +
    'Types: mitered, doubleMitered, envelope, squared, slant, match, trimMirrored. ' +
    '/ Establecer tipo de esquina para un vértice específico.',
  parameters: {
    type: 'object',
    properties: {
      pieceId: { type: 'string', description: 'Piece ID' },
      vertexIndex: { type: 'number', description: 'Outline command index (0-based) of the vertex' },
      cornerType: {
        type: 'string',
        enum: ['mitered', 'doubleMitered', 'envelope', 'squared', 'slant', 'match', 'trimMirrored'],
        description: 'Corner type',
      },
    },
    required: ['pieceId', 'vertexIndex', 'cornerType'],
  },
  execute: async (params, dispatch, getState): Promise<ToolResult> => {
    const state = getState();
    const piece = state.project.pieces.find(p => p.id === params.pieceId);
    if (!piece) return { success: false, error: 'Piece not found' };

    const idx = params.vertexIndex as number;
    if (idx < 0 || idx >= piece.outline.length) {
      return {
        success: false,
        error: `Vertex index ${idx} out of bounds (outline has ${piece.outline.length} commands)`,
      };
    }

    dispatch(updatePiece({
      ...piece,
      cornerTypes: { ...(piece.cornerTypes ?? {}), [idx]: params.cornerType as CornerType },
      updatedAt: Date.now(),
    }));
    return { success: true, data: { pieceId: piece.id, vertexIndex: idx, cornerType: params.cornerType } };
  },
};

// ─── setAllCorners ───────────────────────────────────────────────────────────

const setAllCornersTool: ToolDefinition = {
  name: 'setAllCorners',
  description:
    'Set default corner type for all vertices of a piece, clearing per-vertex overrides. ' +
    '/ Establecer tipo de esquina predeterminado para todos los vértices.',
  parameters: {
    type: 'object',
    properties: {
      pieceId: { type: 'string', description: 'Piece ID' },
      cornerType: {
        type: 'string',
        enum: ['mitered', 'doubleMitered', 'envelope', 'squared', 'slant', 'match', 'trimMirrored'],
        description: 'Corner type to apply to all vertices',
      },
    },
    required: ['pieceId', 'cornerType'],
  },
  execute: async (params, dispatch, getState): Promise<ToolResult> => {
    const state = getState();
    const piece = state.project.pieces.find(p => p.id === params.pieceId);
    if (!piece) return { success: false, error: 'Piece not found' };

    dispatch(updatePiece({
      ...piece,
      defaultCornerType: params.cornerType as CornerType,
      cornerTypes: {},
      updatedAt: Date.now(),
    }));
    return { success: true, data: { pieceId: piece.id, cornerType: params.cornerType } };
  },
};

// ─── Export ─────────────────────────────────────────────────────────────────

export const tools: ToolDefinition[] = [
  setSeamAllowanceTool,
  auditSeamAllowancesTool,
  createSeamTool,
  removeSeamTool,
  setCornerTypeTool,
  setAllCornersTool,
];
