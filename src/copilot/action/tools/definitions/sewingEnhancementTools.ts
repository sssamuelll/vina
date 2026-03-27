/**
 * Sewing Enhancement Tools — tools for adjusting seam tension, range, tape,
 * active state, piece activation, seam groups, seam info, and gathering analysis.
 * Herramientas de Mejora de Costura — herramientas para ajustar tensión, rango,
 * cinta, estado activo, activación de piezas, grupos de costura, info de costura
 * y análisis de fruncido.
 *
 * @module sewingEnhancementTools
 */

import type { ToolDefinition, ToolResult } from '../registry';
import type { AppDispatch, RootState } from '../../../../store';
import {
  setSeamTension,
  updateSeam,
  deactivateSeam,
  deactivatePiece,
  addSeamGroup,
} from '../../../../store/projectSlice';
import type { SeamGroup } from '../../../../types/types';
import { DEFAULT_SEAM_TENSION, DEFAULT_SEAM_STRENGTH } from '../../../../utils/defaults';
import { uid } from '../../../../utils/pathHelpers';

// ─── setSeamTension ──────────────────────────────────────────────────────────

const setSeamTensionTool: ToolDefinition = {
  name: 'setSeamTension',
  description:
    'Set the tension and optional strength for a seam. Tension range: 10–200 (default 100). ' +
    'Higher tension gathers the shorter edge to match the longer one. ' +
    '/ Establecer la tensión y fuerza opcional para una costura. Rango: 10–200 (defecto 100). ' +
    'Mayor tensión frunce el borde más corto para igualarlo al más largo.',
  parameters: {
    type: 'object',
    properties: {
      seamId: { type: 'string', description: 'Seam ID / ID de la costura' },
      tension: {
        type: 'number',
        description: 'Tension value (10–200). Default 100 = no gathering. / Tensión (10–200). 100 = sin fruncido.',
      },
      strength: {
        type: 'number',
        description: 'Optional bond strength (0.01–1.0). Default 1.0. / Fuerza del enlace opcional (0.01–1.0).',
      },
    },
    required: ['seamId', 'tension'],
  },
  execute: async (
    params: Record<string, unknown>,
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<ToolResult> => {
    const state = getState();
    const seam = state.project.seams.find(s => s.id === params.seamId);
    if (!seam) return { success: false, error: `Seam "${params.seamId}" not found` };

    const tension = params.tension as number;
    const strength = params.strength as number | undefined;

    dispatch(setSeamTension({ seamId: params.seamId as string, tension, strength }));

    return {
      success: true,
      data: {
        seamId: params.seamId,
        tension: Math.max(10, Math.min(200, tension)),
        strength: strength !== undefined ? Math.max(0.01, Math.min(1.0, strength)) : seam.strength,
      },
    };
  },
};

// ─── setSeamRange ─────────────────────────────────────────────────────────────

const setSeamRangeTool: ToolDefinition = {
  name: 'setSeamRange',
  description:
    'Set the parametric range [tStart, tEnd] on one side (A or B) of a seam. ' +
    'tStart and tEnd are 0–1 fractions along the edge. ' +
    '/ Establecer el rango paramétrico [tStart, tEnd] en un lado (A o B) de una costura. ' +
    'tStart y tEnd son fracciones 0–1 a lo largo del borde.',
  parameters: {
    type: 'object',
    properties: {
      seamId: { type: 'string', description: 'Seam ID / ID de la costura' },
      side: {
        type: 'string',
        enum: ['A', 'B'],
        description: 'Which side of the seam to modify / Qué lado de la costura modificar',
      },
      tStart: {
        type: 'number',
        description: 'Start of the range (0–1) / Inicio del rango (0–1)',
      },
      tEnd: {
        type: 'number',
        description: 'End of the range (0–1) / Fin del rango (0–1)',
      },
    },
    required: ['seamId', 'side', 'tStart', 'tEnd'],
  },
  execute: async (
    params: Record<string, unknown>,
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<ToolResult> => {
    const state = getState();
    const seam = state.project.seams.find(s => s.id === params.seamId);
    if (!seam) return { success: false, error: `Seam "${params.seamId}" not found` };

    const side = params.side as 'A' | 'B';
    const tStart = params.tStart as number;
    const tEnd = params.tEnd as number;

    if (tStart < 0 || tStart > 1 || tEnd < 0 || tEnd > 1) {
      return { success: false, error: 'tStart and tEnd must be between 0 and 1' };
    }
    if (tStart >= tEnd) {
      return { success: false, error: 'tStart must be less than tEnd' };
    }

    const updatedSeam = side === 'A'
      ? { ...seam, pieceA: { ...seam.pieceA, tStart, tEnd } }
      : { ...seam, pieceB: { ...seam.pieceB, tStart, tEnd } };

    dispatch(updateSeam(updatedSeam));

    return {
      success: true,
      data: { seamId: params.seamId, side, tStart, tEnd },
    };
  },
};

// ─── setSeamTape ──────────────────────────────────────────────────────────────

const setSeamTapeTool: ToolDefinition = {
  name: 'setSeamTape',
  description:
    'Apply or remove seam tape on a seam, optionally setting the tape width in mm. ' +
    'Seam tape stabilises the seam and prevents stretching during simulation. ' +
    '/ Aplicar o quitar cinta de costura en una costura, opcionalmente ajustando el ancho en mm. ' +
    'La cinta estabiliza la costura y evita el estiramiento durante la simulación.',
  parameters: {
    type: 'object',
    properties: {
      seamId: { type: 'string', description: 'Seam ID / ID de la costura' },
      taped: { type: 'boolean', description: 'Whether to apply tape / Si aplicar la cinta' },
      tapeWidth: {
        type: 'number',
        description: 'Tape width in mm (default 10) / Ancho de la cinta en mm (defecto 10)',
      },
    },
    required: ['seamId', 'taped'],
  },
  execute: async (
    params: Record<string, unknown>,
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<ToolResult> => {
    const state = getState();
    const seam = state.project.seams.find(s => s.id === params.seamId);
    if (!seam) return { success: false, error: `Seam "${params.seamId}" not found` };

    const taped = params.taped as boolean;
    const tapeWidth = (params.tapeWidth as number | undefined) ?? seam.tapeWidth;

    dispatch(updateSeam({ ...seam, taped, tapeWidth }));

    return {
      success: true,
      data: { seamId: params.seamId, taped, tapeWidth },
    };
  },
};

// ─── setSeamActive ────────────────────────────────────────────────────────────

const setSeamActiveTool: ToolDefinition = {
  name: 'setSeamActive',
  description:
    'Enable or disable a seam\'s participation in the cloth simulation. ' +
    'Inactive seams are ignored by the XPBD solver. ' +
    '/ Activar o desactivar la participación de una costura en la simulación de tela. ' +
    'Las costuras inactivas son ignoradas por el solucionador XPBD.',
  parameters: {
    type: 'object',
    properties: {
      seamId: { type: 'string', description: 'Seam ID / ID de la costura' },
      active: { type: 'boolean', description: 'Whether the seam is active / Si la costura está activa' },
    },
    required: ['seamId', 'active'],
  },
  execute: async (
    params: Record<string, unknown>,
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<ToolResult> => {
    const state = getState();
    const seam = state.project.seams.find(s => s.id === params.seamId);
    if (!seam) return { success: false, error: `Seam "${params.seamId}" not found` };

    dispatch(deactivateSeam({ seamId: params.seamId as string, active: params.active as boolean }));

    return {
      success: true,
      data: { seamId: params.seamId, active: params.active },
    };
  },
};

// ─── setPieceActive ───────────────────────────────────────────────────────────

const setPieceActiveTool: ToolDefinition = {
  name: 'setPieceActive',
  description:
    'Enable or disable a pattern piece\'s participation in the cloth simulation. ' +
    'Inactive pieces are excluded from draping and rendering. ' +
    '/ Activar o desactivar la participación de una pieza de patrón en la simulación. ' +
    'Las piezas inactivas se excluyen del drapeado y renderizado.',
  parameters: {
    type: 'object',
    properties: {
      pieceId: { type: 'string', description: 'Piece ID / ID de la pieza' },
      active: { type: 'boolean', description: 'Whether the piece is active / Si la pieza está activa' },
    },
    required: ['pieceId', 'active'],
  },
  execute: async (
    params: Record<string, unknown>,
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<ToolResult> => {
    const state = getState();
    const piece = state.project.pieces.find(p => p.id === params.pieceId);
    if (!piece) return { success: false, error: `Piece "${params.pieceId}" not found` };

    dispatch(deactivatePiece({ pieceId: params.pieceId as string, active: params.active as boolean }));

    return {
      success: true,
      data: { pieceId: params.pieceId, active: params.active },
    };
  },
};

// ─── createSeamGroup ─────────────────────────────────────────────────────────

const createSeamGroupTool: ToolDefinition = {
  name: 'createSeamGroup',
  description:
    'Create a seam group connecting multiple edge segments from two sets of edges. ' +
    'Useful for complex seam connections like princess seams or curved hems. ' +
    '/ Crear un grupo de costuras que conecta múltiples segmentos de borde de dos conjuntos de bordes. ' +
    'Útil para conexiones complejas como costuras princesa o dobladillos curvos.',
  parameters: {
    type: 'object',
    properties: {
      edgesA: {
        type: 'array',
        description: 'Edges on side A / Bordes del lado A',
        items: {
          type: 'object',
          properties: {
            pieceId: { type: 'string' },
            edgeName: { type: 'string' },
            tStart: { type: 'number' },
            tEnd: { type: 'number' },
          },
        },
      },
      edgesB: {
        type: 'array',
        description: 'Edges on side B / Bordes del lado B',
        items: {
          type: 'object',
          properties: {
            pieceId: { type: 'string' },
            edgeName: { type: 'string' },
            tStart: { type: 'number' },
            tEnd: { type: 'number' },
          },
        },
      },
      type: {
        type: 'string',
        enum: ['standard', 'french', 'flat-felled', 'overlock'],
        description: 'Seam type / Tipo de costura',
      },
      tension: {
        type: 'number',
        description: 'Tension (10–200, default 100) / Tensión (10–200, defecto 100)',
      },
    },
    required: ['edgesA', 'edgesB'],
  },
  execute: async (
    params: Record<string, unknown>,
    dispatch: AppDispatch,
  ): Promise<ToolResult> => {
    const edgesA = params.edgesA as SeamGroup['edgesA'];
    const edgesB = params.edgesB as SeamGroup['edgesB'];

    if (!edgesA || edgesA.length === 0) {
      return { success: false, error: 'edgesA must contain at least one edge' };
    }
    if (!edgesB || edgesB.length === 0) {
      return { success: false, error: 'edgesB must contain at least one edge' };
    }

    const tension = (params.tension as number | undefined) ?? DEFAULT_SEAM_TENSION;

    const group: SeamGroup = {
      id: uid(),
      edgesA,
      edgesB,
      type: (params.type as SeamGroup['type']) ?? 'standard',
      tension: Math.max(10, Math.min(200, tension)),
      strength: DEFAULT_SEAM_STRENGTH,
      active: true,
      taped: false,
      tapeWidth: 10,
    };

    dispatch(addSeamGroup(group));

    return {
      success: true,
      data: {
        seamGroupId: group.id,
        edgesACount: edgesA.length,
        edgesBCount: edgesB.length,
        type: group.type,
        tension: group.tension,
      },
    };
  },
};

// ─── getSeamInfo ──────────────────────────────────────────────────────────────

const getSeamInfoTool: ToolDefinition = {
  name: 'getSeamInfo',
  description:
    'Read-only. Returns properties of a specific seam or all seams in the project. ' +
    '/ Solo lectura. Devuelve las propiedades de una costura específica o de todas las costuras del proyecto.',
  parameters: {
    type: 'object',
    properties: {
      seamId: {
        type: 'string',
        description: 'ID of the seam to query. Omit to get all seams. / ID de la costura a consultar. Omitir para obtener todas.',
      },
    },
    required: [],
  },
  execute: async (
    params: Record<string, unknown>,
    _dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<ToolResult> => {
    const state = getState();

    if (params.seamId) {
      const seam = state.project.seams.find(s => s.id === params.seamId);
      if (!seam) return { success: false, error: `Seam "${params.seamId}" not found` };
      return {
        success: true,
        data: {
          id: seam.id,
          pieceA: seam.pieceA,
          pieceB: seam.pieceB,
          type: seam.type,
          tension: seam.tension,
          strength: seam.strength,
          active: seam.active,
          taped: seam.taped,
          tapeWidth: seam.tapeWidth,
        },
      };
    }

    const seams = state.project.seams.map(s => ({
      id: s.id,
      pieceA: s.pieceA,
      pieceB: s.pieceB,
      type: s.type,
      tension: s.tension,
      strength: s.strength,
      active: s.active,
      taped: s.taped,
      tapeWidth: s.tapeWidth,
    }));

    return {
      success: true,
      data: { seams: seams as unknown as Record<string, unknown>, count: seams.length },
    };
  },
};

// ─── analyzeGathering ────────────────────────────────────────────────────────

const analyzeGatheringTool: ToolDefinition = {
  name: 'analyzeGathering',
  description:
    'Analyze a seam to compute the length of both connected edges and suggest an optimal tension ratio for gathering. ' +
    'Returns current tension, suggested tension percentage, and edge lengths in mm. ' +
    '/ Analizar una costura para calcular la longitud de ambos bordes conectados y sugerir una tensión óptima para el fruncido. ' +
    'Devuelve la tensión actual, la tensión sugerida en porcentaje y las longitudes en mm.',
  parameters: {
    type: 'object',
    properties: {
      seamId: { type: 'string', description: 'Seam ID to analyze / ID de la costura a analizar' },
    },
    required: ['seamId'],
  },
  execute: async (
    params: Record<string, unknown>,
    _dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<ToolResult> => {
    const state = getState() as RootState;
    const seam = state.project.seams.find(s => s.id === params.seamId);
    if (!seam) return { success: false, error: 'Seam not found' };

    const pieceA = state.project.pieces.find(p => p.id === seam.pieceA.pieceId);
    const pieceB = state.project.pieces.find(p => p.id === seam.pieceB.pieceId);
    if (!pieceA || !pieceB) return { success: false, error: 'Connected pieces not found' };

    const edgeA = pieceA.edges?.find(e => e.name === seam.pieceA.edgeName);
    const edgeB = pieceB.edges?.find(e => e.name === seam.pieceB.edgeName);

    const lengthA = edgeA?.length ?? 0;
    const lengthB = edgeB?.length ?? 0;

    const ratio = lengthA > 0 ? Math.round((lengthB / lengthA) * 100) : 100;

    return {
      success: true,
      data: {
        edgeAName: seam.pieceA.edgeName,
        edgeALength: lengthA,
        edgeBName: seam.pieceB.edgeName,
        edgeBLength: lengthB,
        currentTension: seam.tension,
        suggestedTension: ratio,
        analysis: `${seam.pieceA.edgeName} is ${lengthA.toFixed(1)}mm, ${seam.pieceB.edgeName} is ${lengthB.toFixed(1)}mm. Suggested tension: ${ratio}%.`,
      },
    };
  },
};

// ─── Export ──────────────────────────────────────────────────────────────────

const setSeamShrinkageTool: ToolDefinition = {
  name: 'setSeamShrinkage',
  description: 'Set shrinkage/gathering percentage for a seam (0%=flat, 90%=max gathering). / Establecer porcentaje de fruncido para una costura.',
  parameters: {
    type: 'object',
    properties: {
      seamId: { type: 'string', description: 'ID of the seam' },
      shrinkage: { type: 'number', description: 'Shrinkage percentage (0-90). 0=flat, 50=moderate gathering, 90=heavy gathering.' },
    },
    required: ['seamId', 'shrinkage'],
  },
  execute: async (params, dispatch, getState): Promise<ToolResult> => {
    const seam = (getState().project.seams as Array<{ id: string; tension: number }>).find(s => s.id === params.seamId);
    if (!seam) return { success: false, error: `Seam "${params.seamId}" not found` };
    const shrinkage = Math.max(0, Math.min(90, params.shrinkage as number));
    const tension = 100 - shrinkage;
    const oldTension = seam.tension;
    dispatch({ type: 'project/setSeamTension', payload: { seamId: params.seamId, tension } });
    return {
      success: true,
      data: { seamId: params.seamId, shrinkage, tension },
      rollback: () => dispatch({ type: 'project/setSeamTension', payload: { seamId: params.seamId, tension: oldTension } }),
    };
  },
};

export const tools: ToolDefinition[] = [
  setSeamTensionTool,
  setSeamRangeTool,
  setSeamTapeTool,
  setSeamActiveTool,
  setPieceActiveTool,
  createSeamGroupTool,
  getSeamInfoTool,
  analyzeGatheringTool,
  setSeamShrinkageTool,
];
