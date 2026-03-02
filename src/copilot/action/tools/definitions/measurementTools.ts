/**
 * Measurement Tools — body measurements management.
 * Herramientas de Medidas — gestión de medidas corporales.
 *
 * @module measurementTools
 */

import type { ToolDefinition, ToolResult } from '../registry';
import { updateMeasurements } from '../../../../store/projectSlice';
import type { BodyMeasurements } from '../../../../types/types';

/** Standard size tables (EU women) */
const SIZE_TABLES: Record<string, Record<string, Partial<BodyMeasurements>>> = {
  'EU-women': {
    '34': { height: 168, chest: 80, waist: 64, hips: 88, shoulder: 38, armLength: 60, inseam: 79 },
    '36': { height: 168, chest: 84, waist: 68, hips: 92, shoulder: 39, armLength: 60, inseam: 79 },
    '38': { height: 168, chest: 88, waist: 72, hips: 96, shoulder: 40, armLength: 60, inseam: 79 },
    '40': { height: 168, chest: 92, waist: 76, hips: 100, shoulder: 41, armLength: 61, inseam: 80 },
    '42': { height: 168, chest: 96, waist: 80, hips: 104, shoulder: 42, armLength: 61, inseam: 80 },
    '44': { height: 168, chest: 100, waist: 84, hips: 108, shoulder: 43, armLength: 61, inseam: 80 },
    '46': { height: 168, chest: 104, waist: 88, hips: 112, shoulder: 44, armLength: 62, inseam: 81 },
    '48': { height: 168, chest: 108, waist: 94, hips: 118, shoulder: 45, armLength: 62, inseam: 81 },
    'XS': { height: 168, chest: 80, waist: 64, hips: 88, shoulder: 38, armLength: 60, inseam: 79 },
    'S': { height: 168, chest: 84, waist: 68, hips: 92, shoulder: 39, armLength: 60, inseam: 79 },
    'M': { height: 168, chest: 88, waist: 72, hips: 96, shoulder: 40, armLength: 60, inseam: 79 },
    'L': { height: 168, chest: 92, waist: 78, hips: 102, shoulder: 42, armLength: 61, inseam: 80 },
    'XL': { height: 168, chest: 96, waist: 84, hips: 108, shoulder: 43, armLength: 61, inseam: 80 },
    'XXL': { height: 168, chest: 100, waist: 90, hips: 114, shoulder: 44, armLength: 62, inseam: 81 },
  },
  'EU-men': {
    '44': { height: 176, chest: 88, waist: 76, hips: 92, shoulder: 43, armLength: 64, inseam: 82 },
    '46': { height: 176, chest: 92, waist: 80, hips: 96, shoulder: 44, armLength: 64, inseam: 82 },
    '48': { height: 176, chest: 96, waist: 84, hips: 100, shoulder: 45, armLength: 65, inseam: 83 },
    '50': { height: 176, chest: 100, waist: 88, hips: 104, shoulder: 46, armLength: 65, inseam: 83 },
    '52': { height: 176, chest: 104, waist: 92, hips: 108, shoulder: 47, armLength: 66, inseam: 83 },
    'S': { height: 176, chest: 88, waist: 76, hips: 92, shoulder: 43, armLength: 64, inseam: 82 },
    'M': { height: 176, chest: 96, waist: 84, hips: 100, shoulder: 45, armLength: 65, inseam: 83 },
    'L': { height: 176, chest: 100, waist: 88, hips: 104, shoulder: 46, armLength: 65, inseam: 83 },
    'XL': { height: 176, chest: 104, waist: 92, hips: 108, shoulder: 47, armLength: 66, inseam: 83 },
  },
};

// ─── setMeasurements ────────────────────────────────────────────────────────

const setMeasurementsTool: ToolDefinition = {
  name: 'setMeasurements',
  description:
    'Set body measurements for the avatar. All values in cm. Affects pattern template generation and grading. ' +
    '/ Establecer medidas corporales del avatar. Todos los valores en cm. Afecta generación de plantillas y gradación.',
  parameters: {
    type: 'object',
    properties: {
      measurements: {
        type: 'object',
        description: 'Body measurements in cm / Medidas corporales en cm',
        properties: {
          height: { type: 'number' },
          chest: { type: 'number' },
          waist: { type: 'number' },
          hips: { type: 'number' },
          shoulder: { type: 'number' },
          armLength: { type: 'number' },
          inseam: { type: 'number' },
          neckCirc: { type: 'number' },
          highBust: { type: 'number' },
          neckToWaistFront: { type: 'number' },
          neckToWaistBack: { type: 'number' },
          shoulderToWaistFront: { type: 'number' },
          shoulderToWaistBack: { type: 'number' },
          upperArmCirc: { type: 'number' },
          wristCirc: { type: 'number' },
          armscyeDepth: { type: 'number' },
          bustPointToBustPoint: { type: 'number' },
          bustPointToNeckSide: { type: 'number' },
          waistToKnee: { type: 'number' },
          waistToFloor: { type: 'number' },
          thighCirc: { type: 'number' },
          kneeCirc: { type: 'number' },
          crotchLength: { type: 'number' },
        },
      },
    },
    required: ['measurements'],
  },
  execute: async (params, dispatch): Promise<ToolResult> => {
    const measurements = params.measurements as Partial<BodyMeasurements>;
    const updated = Object.keys(measurements).filter(
      k => measurements[k as keyof BodyMeasurements] !== undefined
    );

    dispatch(updateMeasurements(measurements));

    return {
      success: true,
      data: { updated },
    };
  },
};

// ─── getMeasurements ────────────────────────────────────────────────────────

const getMeasurementsTool: ToolDefinition = {
  name: 'getMeasurements',
  description:
    'Get current avatar body measurements. / Obtener las medidas corporales actuales del avatar.',
  parameters: {
    type: 'object',
    properties: {},
  },
  execute: async (_params, _dispatch, getState): Promise<ToolResult> => {
    const state = getState();
    return {
      success: true,
      data: { measurements: state.project.avatar.measurements as unknown as Record<string, unknown> },
    };
  },
};

// ─── setMeasurementsFromSize ────────────────────────────────────────────────

const setMeasurementsFromSizeTool: ToolDefinition = {
  name: 'setMeasurementsFromSize',
  description:
    "Set standard measurements from a named size (e.g. 'EU 40', 'M'). " +
    "/ Establecer medidas estándar desde una talla (e.g. 'EU 40', 'M').",
  parameters: {
    type: 'object',
    properties: {
      size: { type: 'string', description: "Size name (e.g. '40', 'M', 'US 8') / Nombre de talla" },
      system: {
        type: 'string',
        enum: ['EU', 'US', 'UK'],
        description: 'Size system / Sistema de tallas',
      },
      category: {
        type: 'string',
        enum: ['women', 'men', 'children'],
        description: 'Size category / Categoría de talla',
      },
    },
    required: ['size'],
  },
  execute: async (params, dispatch): Promise<ToolResult> => {
    const size = params.size as string;
    const category = (params.category as string) || 'women';

    const tableKey = `EU-${category}`;
    const table = SIZE_TABLES[tableKey];
    if (!table) {
      return { success: false, error: `Size table for "${tableKey}" not found` };
    }

    const measurements = table[size];
    if (!measurements) {
      const available = Object.keys(table).join(', ');
      return { success: false, error: `Size "${size}" not found. Available: ${available}` };
    }

    dispatch(updateMeasurements(measurements));

    return {
      success: true,
      data: { measurements: measurements as unknown as Record<string, unknown> },
    };
  },
};

// ─── Export ─────────────────────────────────────────────────────────────────

export const tools: ToolDefinition[] = [
  setMeasurementsTool,
  getMeasurementsTool,
  setMeasurementsFromSizeTool,
];
