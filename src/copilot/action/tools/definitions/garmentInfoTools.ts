/**
 * Garment Info Tools — get and set garment metadata (brand, season, style, etc.) via copilot.
 *
 * @module garmentInfoTools
 */

import type { ToolDefinition, ToolResult } from '../registry';
import { setGarmentInfoBulk } from '../../../../store/projectSlice';
import type { GarmentInfo } from '../../../../types/types';

const GARMENT_INFO_FIELDS = ['brand', 'season', 'styleNumber', 'designer', 'date', 'notes', 'description'] as const;

const setGarmentInfoTool: ToolDefinition = {
  name: 'setGarmentInfo',
  description:
    'Set garment metadata fields (brand, season, style number, designer, date, notes, description). ' +
    'Only provided fields are updated; omitted fields remain unchanged. ' +
    '/ Establecer metadatos de prenda (marca, temporada, numero de estilo, disenador, fecha, notas, descripcion).',
  parameters: {
    type: 'object',
    properties: {
      brand: { type: 'string', description: 'Brand name / Marca' },
      season: { type: 'string', description: 'Season (e.g. SS26, FW26) / Temporada' },
      styleNumber: { type: 'string', description: 'Style/model number / Numero de estilo' },
      designer: { type: 'string', description: 'Designer name / Disenador' },
      date: { type: 'string', description: 'Date (e.g. 2026-03-25) / Fecha' },
      notes: { type: 'string', description: 'General notes / Notas generales' },
      description: { type: 'string', description: 'Garment description / Descripcion de la prenda' },
    },
    required: [],
  },
  execute: async (params, dispatch, getState): Promise<ToolResult> => {
    const oldInfo: GarmentInfo = { ...getState().project.garmentInfo };

    // Build update object
    const updated: Record<string, string> = {};
    for (const field of GARMENT_INFO_FIELDS) {
      if (params[field] !== undefined) {
        updated[field] = params[field] as string;
      }
    }

    if (Object.keys(updated).length === 0) {
      return {
        success: false,
        error: 'No fields provided. Specify at least one of: brand, season, styleNumber, designer, date, notes, description.',
      };
    }

    // Single atomic dispatch
    dispatch(setGarmentInfoBulk({ ...oldInfo, ...updated }));

    return {
      success: true,
      data: { updated },
      rollback: () => dispatch(setGarmentInfoBulk(oldInfo)),
    };
  },
};

const getGarmentInfoTool: ToolDefinition = {
  name: 'getGarmentInfo',
  description:
    'Get all garment metadata fields (brand, season, style number, designer, date, notes, description) and the project name. ' +
    '/ Obtener todos los metadatos de la prenda y el nombre del proyecto.',
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
  execute: async (_params, _dispatch, getState): Promise<ToolResult> => {
    const info = getState().project.garmentInfo;
    return {
      success: true,
      data: { garmentInfo: info, projectName: getState().project.name },
    };
  },
};

export const tools: ToolDefinition[] = [
  setGarmentInfoTool,
  getGarmentInfoTool,
];
