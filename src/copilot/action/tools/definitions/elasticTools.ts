/**
 * Elastic Tools — tools for adding, removing, and updating elastic/gathering
 * on pattern piece edges.
 * Herramientas de Elástico — herramientas para agregar, eliminar y actualizar
 * elástico/fruncido en los bordes de las piezas de patrón.
 *
 * @module elasticTools
 */

import type { ToolDefinition, ToolResult } from '../registry';
import type { AppDispatch, RootState } from '../../../../store';
import { addElastic, removeElastic, updateElastic } from '../../../../store/projectSlice';
import type { Elastic } from '../../../../types/types';
import { uid } from '../../../../utils/pathHelpers';

// ─── addElastic ──────────────────────────────────────────────────────────────

const addElasticTool: ToolDefinition = {
  name: 'addElastic',
  description:
    'Add an elastic band, shirring, or drawstring to a specific edge of a pattern piece. ' +
    'stretchRatio controls how much the elastic stretches (0.1–2.0, default 0.7). ' +
    'width is the elastic width in mm (default 25). ' +
    'type can be "band", "shirring", or "drawstring" (default "band"). ' +
    'tStart/tEnd define the parametric range along the edge (0–1, defaults 0 and 1). ' +
    '/ Agregar un elástico, fruncido o cordón a un borde específico de una pieza de patrón. ' +
    'stretchRatio controla el estiramiento (0.1–2.0, defecto 0.7). ' +
    'width es el ancho del elástico en mm (defecto 25). ' +
    'type puede ser "band", "shirring" o "drawstring" (defecto "band"). ' +
    'tStart/tEnd definen el rango paramétrico a lo largo del borde (0–1, defecto 0 y 1).',
  parameters: {
    type: 'object',
    properties: {
      pieceId: { type: 'string', description: 'Piece ID / ID de la pieza' },
      edgeName: { type: 'string', description: 'Edge name on the piece / Nombre del borde en la pieza' },
      stretchRatio: {
        type: 'number',
        description: 'Stretch ratio (0.1–2.0, default 0.7). Values <1 gather, >1 stretch. / Ratio de estiramiento (0.1–2.0, defecto 0.7).',
      },
      width: {
        type: 'number',
        description: 'Elastic width in mm (default 25) / Ancho del elástico en mm (defecto 25)',
      },
      type: {
        type: 'string',
        enum: ['band', 'shirring', 'drawstring'],
        description: 'Elastic type (default "band") / Tipo de elástico (defecto "band")',
      },
      tStart: {
        type: 'number',
        description: 'Start of parametric range (0–1, default 0) / Inicio del rango paramétrico (0–1, defecto 0)',
      },
      tEnd: {
        type: 'number',
        description: 'End of parametric range (0–1, default 1) / Fin del rango paramétrico (0–1, defecto 1)',
      },
    },
    required: ['pieceId', 'edgeName'],
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

    const stretchRatio = (params.stretchRatio as number | undefined) ?? 0.7;
    const width = (params.width as number | undefined) ?? 25;
    const type = (params.type as 'band' | 'shirring' | 'drawstring' | undefined) ?? 'band';
    const tStart = (params.tStart as number | undefined) ?? 0;
    const tEnd = (params.tEnd as number | undefined) ?? 1;

    const id = uid();

    dispatch(addElastic({
      id,
      pieceId: params.pieceId as string,
      edgeName: params.edgeName as string,
      stretchRatio,
      width,
      type,
      tStart,
      tEnd,
      active: true,
    }));

    return {
      success: true,
      data: {
        elasticId: id,
        pieceId: params.pieceId,
        edgeName: params.edgeName,
        stretchRatio: Math.max(0.1, Math.min(2.0, stretchRatio)),
        width,
        type,
        tStart,
        tEnd,
      },
    };
  },
};

// ─── removeElastic ───────────────────────────────────────────────────────────

const removeElasticTool: ToolDefinition = {
  name: 'removeElastic',
  description:
    'Remove an elastic band, shirring, or drawstring from a pattern piece edge by its ID. ' +
    '/ Eliminar un elástico, fruncido o cordón de un borde de pieza de patrón por su ID.',
  parameters: {
    type: 'object',
    properties: {
      elasticId: { type: 'string', description: 'Elastic ID to remove / ID del elástico a eliminar' },
    },
    required: ['elasticId'],
  },
  execute: async (
    params: Record<string, unknown>,
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<ToolResult> => {
    const state = getState();
    const elastic = state.project.elastics.find(e => e.id === params.elasticId);
    if (!elastic) return { success: false, error: `Elastic "${params.elasticId}" not found` };

    dispatch(removeElastic(params.elasticId as string));

    return {
      success: true,
      data: { elasticId: params.elasticId },
    };
  },
};

// ─── updateElastic ───────────────────────────────────────────────────────────

const updateElasticTool: ToolDefinition = {
  name: 'updateElastic',
  description:
    'Update properties of an existing elastic on a pattern piece edge. ' +
    'Only the provided fields will be changed; omitted fields keep their current values. ' +
    '/ Actualizar las propiedades de un elástico existente en un borde de pieza de patrón. ' +
    'Solo se cambiarán los campos proporcionados; los campos omitidos conservan sus valores actuales.',
  parameters: {
    type: 'object',
    properties: {
      elasticId: { type: 'string', description: 'Elastic ID to update / ID del elástico a actualizar' },
      stretchRatio: {
        type: 'number',
        description: 'New stretch ratio (0.1–2.0) / Nuevo ratio de estiramiento (0.1–2.0)',
      },
      width: {
        type: 'number',
        description: 'New elastic width in mm / Nuevo ancho del elástico en mm',
      },
      type: {
        type: 'string',
        enum: ['band', 'shirring', 'drawstring'],
        description: 'New elastic type / Nuevo tipo de elástico',
      },
      tStart: {
        type: 'number',
        description: 'New start of parametric range (0–1) / Nuevo inicio del rango paramétrico (0–1)',
      },
      tEnd: {
        type: 'number',
        description: 'New end of parametric range (0–1) / Nuevo fin del rango paramétrico (0–1)',
      },
      active: {
        type: 'boolean',
        description: 'Whether the elastic is active / Si el elástico está activo',
      },
    },
    required: ['elasticId'],
  },
  execute: async (
    params: Record<string, unknown>,
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<ToolResult> => {
    const state = getState();
    const elastic = state.project.elastics.find(e => e.id === params.elasticId);
    if (!elastic) return { success: false, error: `Elastic "${params.elasticId}" not found` };

    const updates: Partial<Elastic> & { id: string } = { id: params.elasticId as string };
    if (params.stretchRatio !== undefined) updates.stretchRatio = params.stretchRatio as number;
    if (params.width !== undefined) updates.width = params.width as number;
    if (params.type !== undefined) updates.type = params.type as Elastic['type'];
    if (params.tStart !== undefined) updates.tStart = params.tStart as number;
    if (params.tEnd !== undefined) updates.tEnd = params.tEnd as number;
    if (params.active !== undefined) updates.active = params.active as boolean;

    dispatch(updateElastic(updates));

    return {
      success: true,
      data: { elasticId: params.elasticId, updated: updates },
    };
  },
};

// ─── Export ──────────────────────────────────────────────────────────────────

export const tools: ToolDefinition[] = [addElasticTool, removeElasticTool, updateElasticTool];
