/**
 * Pleat Tools — create, remove, and update pleats on pattern pieces.
 * Herramientas de Pliegues — crear, eliminar y actualizar pliegues en piezas de patrón.
 *
 * @module pleatTools
 */

import type { ToolDefinition, ToolResult } from '../registry';
import type { AppDispatch, RootState } from '../../../../store';
import { addPleat, removePleat, updatePleat } from '../../../../store/projectSlice';
import { PLEAT_DEFAULTS, MAX_PLEAT_COUNT, type Pleat } from '../../../../types/types';
import { uid } from '../../../../utils/pathHelpers';

// ─── createPleat ─────────────────────────────────────────────────────────────

const createPleatTool: ToolDefinition = {
  name: 'createPleat',
  description:
    'Create pleats along a named edge. Types: knife, box, accordion, invertedBox. ' +
    '/ Crear pliegues a lo largo de un borde. Tipos: knife, box, accordion, invertedBox.',
  parameters: {
    type: 'object',
    properties: {
      pieceId: { type: 'string', description: 'Piece ID' },
      edgeName: { type: 'string', description: 'Semantic edge name (e.g. "hemline", "waistband")' },
      type: {
        type: 'string',
        enum: ['knife', 'box', 'accordion', 'invertedBox'],
        description: 'Pleat type',
      },
      depth: { type: 'number', description: 'Fold depth in mm (default 15)' },
      spacing: { type: 'number', description: 'Distance between pleat centers in mm (default 20)' },
      count: { type: 'number', description: 'Number of repeats, max 50 (default 4)' },
      direction: {
        type: 'string',
        enum: ['left', 'right'],
        description: 'Knife pleat direction (default left)',
      },
      tStart: { type: 'number', description: 'Start position 0–1 (default 0)' },
      tEnd: { type: 'number', description: 'End position 0–1 (default 1)' },
    },
    required: ['pieceId', 'edgeName', 'type'],
  },
  execute: async (
    params: Record<string, unknown>,
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<ToolResult> => {
    const state = getState();
    const piece = state.project.pieces.find(p => p.id === params.pieceId);
    if (!piece) return { success: false, error: `Piece "${params.pieceId}" not found` };

    const edge = piece.edges?.find(e => e.name === params.edgeName);
    if (!edge) return { success: false, error: `Edge "${params.edgeName}" not found on piece "${params.pieceId}"` };

    const count = Math.min(
      (params.count as number | undefined) ?? PLEAT_DEFAULTS.count,
      MAX_PLEAT_COUNT,
    );

    const pleatId = uid();

    dispatch(
      addPleat({
        id: pleatId,
        pieceId: params.pieceId as string,
        edgeName: params.edgeName as string,
        type: (params.type as 'knife' | 'box' | 'accordion' | 'invertedBox'),
        depth: (params.depth as number | undefined) ?? PLEAT_DEFAULTS.depth,
        spacing: (params.spacing as number | undefined) ?? PLEAT_DEFAULTS.spacing,
        count,
        direction: (params.direction as 'left' | 'right' | undefined) ?? PLEAT_DEFAULTS.direction,
        tStart: (params.tStart as number | undefined) ?? PLEAT_DEFAULTS.tStart,
        tEnd: (params.tEnd as number | undefined) ?? PLEAT_DEFAULTS.tEnd,
      }),
    );

    return {
      success: true,
      data: {
        pleatId,
        pieceId: params.pieceId,
        edgeName: params.edgeName,
        type: params.type,
        count,
      },
    };
  },
};

// ─── removePleat ─────────────────────────────────────────────────────────────

const removePleatTool: ToolDefinition = {
  name: 'removePleat',
  description:
    'Remove a pleat and its generated fold lines from a pattern piece. ' +
    '/ Eliminar un pliegue y sus líneas de doblez generadas de una pieza de patrón.',
  parameters: {
    type: 'object',
    properties: {
      pleatId: { type: 'string', description: 'Pleat ID to remove / ID del pliegue a eliminar' },
    },
    required: ['pleatId'],
  },
  execute: async (
    params: Record<string, unknown>,
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<ToolResult> => {
    const state = getState();
    const pleat = state.project.pleats?.find(p => p.id === params.pleatId);
    if (!pleat) return { success: false, error: `Pleat "${params.pleatId}" not found` };

    dispatch(removePleat(params.pleatId as string));

    return {
      success: true,
      data: { pleatId: params.pleatId },
    };
  },
};

// ─── updatePleat ─────────────────────────────────────────────────────────────

const updatePleatTool: ToolDefinition = {
  name: 'updatePleat',
  description:
    'Update an existing pleat\'s properties and regenerate its fold lines. ' +
    '/ Actualizar las propiedades de un pliegue existente y regenerar sus líneas de doblez.',
  parameters: {
    type: 'object',
    properties: {
      pleatId: { type: 'string', description: 'Pleat ID to update / ID del pliegue a actualizar' },
      type: {
        type: 'string',
        enum: ['knife', 'box', 'accordion', 'invertedBox'],
        description: 'Pleat type / Tipo de pliegue',
      },
      depth: { type: 'number', description: 'Fold depth in mm / Profundidad del doblez en mm' },
      spacing: { type: 'number', description: 'Distance between pleat centers in mm / Distancia entre centros de pliegues en mm' },
      count: { type: 'number', description: 'Number of repeats, max 50 / Número de repeticiones, máx 50' },
      direction: {
        type: 'string',
        enum: ['left', 'right'],
        description: 'Knife pleat direction / Dirección del pliegue tipo cuchillo',
      },
      tStart: { type: 'number', description: 'Start position 0–1 / Posición de inicio 0–1' },
      tEnd: { type: 'number', description: 'End position 0–1 / Posición de fin 0–1' },
    },
    required: ['pleatId'],
  },
  execute: async (
    params: Record<string, unknown>,
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<ToolResult> => {
    const state = getState();
    const pleat = state.project.pleats?.find(p => p.id === params.pleatId);
    if (!pleat) return { success: false, error: `Pleat "${params.pleatId}" not found` };

    const updates: Record<string, unknown> = { id: params.pleatId };
    if (params.type !== undefined) updates.type = params.type;
    if (params.depth !== undefined) updates.depth = params.depth;
    if (params.spacing !== undefined) updates.spacing = params.spacing;
    if (params.count !== undefined) updates.count = params.count;
    if (params.direction !== undefined) updates.direction = params.direction;
    if (params.tStart !== undefined) updates.tStart = params.tStart;
    if (params.tEnd !== undefined) updates.tEnd = params.tEnd;

    dispatch(updatePleat(updates as Partial<Pleat> & { id: string }));

    return {
      success: true,
      data: { pleatId: params.pleatId, updated: Object.keys(updates).filter(k => k !== 'id') },
    };
  },
};

// ─── Export ──────────────────────────────────────────────────────────────────

export const tools: ToolDefinition[] = [createPleatTool, removePleatTool, updatePleatTool];
