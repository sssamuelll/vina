/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Semantic Fit Tools — adjust garments by name, not geometry.
 *
 * "Make the waist tighter" / "Acorta las mangas 2cm" / "Mehr Brustweite"
 *
 * These tools map human language to parametric variable overrides
 * via the semantic edit engine.
 *
 * @module semanticTools
 */

import type { ToolDefinition, ToolResult } from '../registry';
import type { RootState } from '../../../../store';
import { setVariableOverrides } from '../../../../store/parametricSlice';
import {
  calculateFitAdjustment,
  calculateLengthAdjustment,
  calculateSleeveAdjustment,
  calculateProportionAdjustment,
  type FitRegion,
  type FitDirection,
  type LengthRegion,
  type LengthDirection,
  type SleeveProperty,
  type ProportionRatio,
} from '../../../../utils/semanticEdit';

// ─── Helpers ────────────────────────────────────────────────────────────────

function getParametricState(getState: () => RootState) {
  const state = getState();
  const { activePattern, variableDefaults, variableOverrides } = state.parametric;

  if (!activePattern) {
    return { error: 'No template loaded. Generate a pattern first using generateFromTemplate.' };
  }

  // Merge defaults with overrides for current resolved values
  const resolved = { ...variableDefaults, ...variableOverrides };

  return { pattern: activePattern, resolved, variables: activePattern.variables };
}

function applyAdjustments(
  adjustments: Array<{ variableKey: string; newValue: number; description: string }>,
  dispatch: any,
): ToolResult {
  if (adjustments.length === 0) {
    return {
      success: false,
      error: 'No matching variables found for this adjustment. The current template may not have variables for this region.',
    };
  }

  const overrides: Record<string, number> = {};
  for (const adj of adjustments) {
    overrides[adj.variableKey] = adj.newValue;
  }
  dispatch(setVariableOverrides(overrides));

  return {
    success: true,
    data: {
      adjustments: adjustments.map(a => ({
        variable: a.variableKey,
        newValue: Math.round(a.newValue * 10) / 10,
        description: a.description,
      })),
      note: 'Pattern will regenerate automatically via parametric engine.',
    },
  };
}

// ─── adjustFit ──────────────────────────────────────────────────────────────

const adjustFitTool: ToolDefinition = {
  name: 'adjustFit',
  description:
    'Adjust garment fit by region. Makes bust/waist/hip/shoulder tighter or looser. ' +
    'Amount in mm or %. Distributes adjustment across matching variables. ' +
    '/ Ajustar el ajuste de la prenda por región. Más ceñido o más holgado.',
  parameters: {
    type: 'object',
    properties: {
      region: {
        type: 'string',
        enum: ['bust', 'waist', 'hip', 'shoulder', 'neck', 'armhole'],
        description: 'Body region to adjust / Región del cuerpo',
      },
      direction: {
        type: 'string',
        enum: ['tighter', 'looser'],
        description: 'Tighter (less ease) or looser (more ease) / Más ceñido o más holgado',
      },
      amount: {
        type: 'number',
        description: 'Amount of adjustment (default unit: mm) / Cantidad de ajuste',
      },
      unit: {
        type: 'string',
        enum: ['mm', '%'],
        description: 'Unit: mm (absolute) or % (relative). Default: mm',
      },
    },
    required: ['region', 'direction', 'amount'],
  },
  execute: async (params, dispatch, getState): Promise<ToolResult> => {
    const state = getParametricState(getState);
    if ('error' in state) return { success: false, error: state.error };

    const adjustments = calculateFitAdjustment(
      state.variables,
      state.resolved,
      params.region as FitRegion,
      params.direction as FitDirection,
      params.amount as number,
      (params.unit as 'mm' | '%') || 'mm',
    );

    return applyAdjustments(adjustments, dispatch);
  },
};

// ─── adjustLength ───────────────────────────────────────────────────────────

const adjustLengthTool: ToolDefinition = {
  name: 'adjustLength',
  description:
    'Adjust garment length by region. Shorten or lengthen hem, sleeves, torso, skirt. ' +
    'Example: adjustLength(region="sleeve", direction="shorter", amount=20) ' +
    '/ Ajustar largo de prenda. Acortar o alargar dobladillo, mangas, torso, falda.',
  parameters: {
    type: 'object',
    properties: {
      region: {
        type: 'string',
        enum: ['hem', 'sleeve', 'torso', 'skirt', 'inseam', 'total'],
        description: 'Length region / Región de largo',
      },
      direction: {
        type: 'string',
        enum: ['shorter', 'longer'],
        description: 'Shorter or longer / Más corto o más largo',
      },
      amount: {
        type: 'number',
        description: 'Amount in mm (or %) / Cantidad en mm (o %)',
      },
      unit: {
        type: 'string',
        enum: ['mm', '%'],
        description: 'Unit. Default: mm',
      },
    },
    required: ['region', 'direction', 'amount'],
  },
  execute: async (params, dispatch, getState): Promise<ToolResult> => {
    const state = getParametricState(getState);
    if ('error' in state) return { success: false, error: state.error };

    const adjustments = calculateLengthAdjustment(
      state.variables,
      state.resolved,
      params.region as LengthRegion,
      params.direction as LengthDirection,
      params.amount as number,
      (params.unit as 'mm' | '%') || 'mm',
    );

    return applyAdjustments(adjustments, dispatch);
  },
};

// ─── adjustSleeve ───────────────────────────────────────────────────────────

const adjustSleeveTool: ToolDefinition = {
  name: 'adjustSleeve',
  description:
    'Adjust sleeve properties: length, width, cap height, or ease. ' +
    'Positive amount increases, negative decreases. ' +
    'Example: adjustSleeve(property="length", amount=-20) to shorten by 20mm. ' +
    '/ Ajustar propiedades de la manga: largo, ancho, altura de copa, holgura.',
  parameters: {
    type: 'object',
    properties: {
      property: {
        type: 'string',
        enum: ['length', 'width', 'cap_height', 'ease'],
        description: 'Sleeve property to adjust / Propiedad de la manga',
      },
      amount: {
        type: 'number',
        description: 'Amount (positive=increase, negative=decrease) in mm or % / Cantidad',
      },
      unit: {
        type: 'string',
        enum: ['mm', '%'],
        description: 'Unit. Default: mm',
      },
    },
    required: ['property', 'amount'],
  },
  execute: async (params, dispatch, getState): Promise<ToolResult> => {
    const state = getParametricState(getState);
    if ('error' in state) return { success: false, error: state.error };

    const adjustments = calculateSleeveAdjustment(
      state.variables,
      state.resolved,
      params.property as SleeveProperty,
      params.amount as number,
      (params.unit as 'mm' | '%') || 'mm',
    );

    return applyAdjustments(adjustments, dispatch);
  },
};

// ─── adjustProportions ──────────────────────────────────────────────────────

const adjustProportionsTool: ToolDefinition = {
  name: 'adjustProportions',
  description:
    'Shift garment proportions between two regions while preserving overall measurements. ' +
    'Example: adjustProportions(ratio="shoulder_to_waist", shift=10) widens shoulders, narrows waist. ' +
    '/ Ajustar proporciones entre regiones. Hombros más anchos/cintura más estrecha.',
  parameters: {
    type: 'object',
    properties: {
      ratio: {
        type: 'string',
        enum: ['shoulder_to_waist', 'waist_to_hip', 'front_to_back', 'bodice_to_skirt'],
        description: 'Proportion ratio to shift / Proporción a ajustar',
      },
      shift: {
        type: 'number',
        description: 'Amount to shift (positive=more of first region). mm or % / Cantidad de cambio',
      },
      unit: {
        type: 'string',
        enum: ['mm', '%'],
        description: 'Unit. Default: mm',
      },
    },
    required: ['ratio', 'shift'],
  },
  execute: async (params, dispatch, getState): Promise<ToolResult> => {
    const state = getParametricState(getState);
    if ('error' in state) return { success: false, error: state.error };

    const adjustments = calculateProportionAdjustment(
      state.variables,
      state.resolved,
      params.ratio as ProportionRatio,
      params.shift as number,
      (params.unit as 'mm' | '%') || 'mm',
    );

    return applyAdjustments(adjustments, dispatch);
  },
};

// ─── Export ──────────────────────────────────────────────────────────────────

export const tools: ToolDefinition[] = [
  adjustFitTool,
  adjustLengthTool,
  adjustSleeveTool,
  adjustProportionsTool,
];
