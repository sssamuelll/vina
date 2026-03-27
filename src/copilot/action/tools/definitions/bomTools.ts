/**
 * BOM (Bill of Materials) Tools — copilot tools for managing the BOM.
 *
 * Provides tools to auto-populate, add, update, remove, read, cost,
 * set currency, and export BOM entries.
 *
 * @module bomTools
 */

import type { ToolDefinition, ToolResult } from '../registry';
import {
  populateBOM,
  addManualEntry,
  updateEntry,
  removeEntry,
  setCurrency,
  selectBOMEntries,
  selectTotalCost,
  selectTotalCostByColorway,
} from '../../../../store/bomSlice';
import { extractAll } from '../../../../utils/export/bomExtractor';
import type { BOMCategory, BOMUnit } from '../../../../types/bom';

// ─── Constants ──────────────────────────────────────────────────────────────

const BOM_CATEGORIES: BOMCategory[] = [
  'fabric', 'interfacing', 'thread', 'seam-tape', 'elastic', 'trim', 'label', 'other',
];

const BOM_UNITS: BOMUnit[] = [
  'meters', 'yards', 'cm', 'pieces', 'rolls',
];

// ─── Tool Definitions ───────────────────────────────────────────────────────

const refreshBOMTool: ToolDefinition = {
  name: 'refreshBOM',
  description:
    'Auto-populate the Bill of Materials from the current garment state (pieces, fabrics, seams, elastics). ' +
    'Replaces auto-populated entries while keeping manual ones. ' +
    '/ Generar automaticamente la lista de materiales a partir del estado actual de la prenda.',
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
  execute: async (_params, dispatch, getState): Promise<ToolResult> => {
    const state = getState();
    const { pieces, fabrics, seams, elastics } = state.project;

    const entries = extractAll(pieces, fabrics, seams, elastics);
    const projectVersion = Date.now();

    dispatch(populateBOM({ entries, projectVersion }));

    // Summarise categories
    const categories = new Map<string, number>();
    for (const entry of entries) {
      categories.set(entry.category, (categories.get(entry.category) ?? 0) + 1);
    }

    return {
      success: true,
      data: {
        message: `BOM refreshed with ${entries.length} auto-populated entries.`,
        entryCount: entries.length,
        categories: Object.fromEntries(categories),
      },
    };
  },
};

const addBOMEntryTool: ToolDefinition = {
  name: 'addBOMEntry',
  description:
    'Add a manual entry to the Bill of Materials. ' +
    '/ Agregar una entrada manual a la lista de materiales.',
  parameters: {
    type: 'object',
    properties: {
      category: {
        type: 'string',
        enum: BOM_CATEGORIES,
        description: 'BOM category / Categoria del BOM',
      },
      name: {
        type: 'string',
        description: 'Entry name / Nombre de la entrada',
      },
      description: {
        type: 'string',
        description: 'Entry description / Descripcion de la entrada',
      },
      quantity: {
        type: 'number',
        description: 'Quantity / Cantidad',
      },
      unit: {
        type: 'string',
        enum: BOM_UNITS,
        description: 'Unit of measure / Unidad de medida',
      },
      unitCost: {
        type: 'number',
        description: 'Cost per unit / Costo por unidad',
      },
    },
    required: ['name', 'quantity', 'unit'],
  },
  execute: async (params, dispatch): Promise<ToolResult> => {
    const category = (params.category as BOMCategory) ?? 'other';
    const name = params.name as string;
    const description = (params.description as string) ?? '';
    const quantity = params.quantity as number;
    const unit = params.unit as BOMUnit;
    const unitCost = (params.unitCost as number) ?? 0;

    dispatch(
      addManualEntry({
        category,
        name,
        description,
        quantity,
        unit,
        unitCost,
        currency: 'USD',
        colorwayOverrides: {},
        sourcePieceIds: [],
      }),
    );

    return {
      success: true,
      data: {
        message: `Added BOM entry "${name}" (${quantity} ${unit}).`,
        name,
        category,
        quantity,
        unit,
        unitCost,
      },
    };
  },
};

const updateBOMEntryTool: ToolDefinition = {
  name: 'updateBOMEntry',
  description:
    'Update an existing BOM entry by ID. Only provided fields are changed. ' +
    '/ Actualizar una entrada existente del BOM por ID. Solo se cambian los campos proporcionados.',
  parameters: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: 'Entry ID / ID de la entrada',
      },
      name: {
        type: 'string',
        description: 'New name / Nuevo nombre',
      },
      quantity: {
        type: 'number',
        description: 'New quantity / Nueva cantidad',
      },
      unitCost: {
        type: 'number',
        description: 'New unit cost / Nuevo costo unitario',
      },
      description: {
        type: 'string',
        description: 'New description / Nueva descripcion',
      },
    },
    required: ['id'],
  },
  execute: async (params, dispatch, getState): Promise<ToolResult> => {
    const id = params.id as string;
    const state = getState();
    const entries = selectBOMEntries(state);
    const entry = entries.find(e => e.id === id);

    if (!entry) {
      return {
        success: false,
        error: `BOM entry with id "${id}" not found.`,
      };
    }

    const changes: Record<string, unknown> = {};
    if (params.name !== undefined) changes.name = params.name;
    if (params.quantity !== undefined) changes.quantity = params.quantity;
    if (params.unitCost !== undefined) changes.unitCost = params.unitCost;
    if (params.description !== undefined) changes.description = params.description;

    if (Object.keys(changes).length === 0) {
      return {
        success: false,
        error: 'No fields provided to update.',
      };
    }

    dispatch(updateEntry({ id, changes }));

    return {
      success: true,
      data: {
        message: `Updated BOM entry "${entry.name}".`,
        id,
        changes,
      },
    };
  },
};

const removeBOMEntryTool: ToolDefinition = {
  name: 'removeBOMEntry',
  description:
    'Remove a BOM entry by ID. ' +
    '/ Eliminar una entrada del BOM por ID.',
  parameters: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: 'Entry ID to remove / ID de la entrada a eliminar',
      },
    },
    required: ['id'],
  },
  execute: async (params, dispatch, getState): Promise<ToolResult> => {
    const id = params.id as string;
    const state = getState();
    const entries = selectBOMEntries(state);
    const entry = entries.find(e => e.id === id);

    if (!entry) {
      return {
        success: false,
        error: `BOM entry with id "${id}" not found.`,
      };
    }

    // Snapshot for rollback
    const snapshot = { ...entry };

    dispatch(removeEntry(id));

    return {
      success: true,
      data: {
        message: `Removed BOM entry "${entry.name}".`,
        id,
        name: entry.name,
      },
      rollback: () => {
        dispatch(
          addManualEntry({
            category: snapshot.category,
            name: snapshot.name,
            description: snapshot.description,
            quantity: snapshot.quantity,
            unit: snapshot.unit,
            unitCost: snapshot.unitCost,
            currency: snapshot.currency,
            colorwayOverrides: snapshot.colorwayOverrides,
            sourcePieceIds: snapshot.sourcePieceIds,
          }),
        );
      },
    };
  },
};

const setBOMCurrencyTool: ToolDefinition = {
  name: 'setBOMCurrency',
  description:
    'Set the BOM currency code (e.g. USD, EUR, GBP). ' +
    '/ Establecer el codigo de moneda del BOM (ej. USD, EUR, GBP).',
  parameters: {
    type: 'object',
    properties: {
      currency: {
        type: 'string',
        description: 'ISO 4217 currency code / Codigo de moneda ISO 4217',
      },
    },
    required: ['currency'],
  },
  execute: async (params, dispatch): Promise<ToolResult> => {
    const currency = params.currency as string;

    dispatch(setCurrency(currency));

    return {
      success: true,
      data: {
        message: `BOM currency set to ${currency}.`,
        currency,
      },
    };
  },
};

const getBOMTool: ToolDefinition = {
  name: 'getBOM',
  description:
    'Get the full Bill of Materials with all entries, quantities, costs, and total. ' +
    '/ Obtener la lista completa de materiales con entradas, cantidades, costos y total.',
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
  execute: async (_params, _dispatch, getState): Promise<ToolResult> => {
    const state = getState();
    const entries = selectBOMEntries(state);
    const totalCost = selectTotalCost(state);
    const currency = state.bom.currency;

    const mapped = entries.map(e => ({
      id: e.id,
      category: e.category,
      name: e.name,
      quantity: e.quantity,
      unit: e.unit,
      unitCost: e.unitCost,
      total: e.quantity * e.unitCost,
      autoPopulated: e.autoPopulated,
    }));

    return {
      success: true,
      data: {
        entries: mapped,
        totalCost,
        currency,
        count: entries.length,
      },
    };
  },
};

const getBOMCostTool: ToolDefinition = {
  name: 'getBOMCost',
  description:
    'Get the total BOM cost, optionally for a specific colorway. ' +
    '/ Obtener el costo total del BOM, opcionalmente para un colorway especifico.',
  parameters: {
    type: 'object',
    properties: {
      colorwayId: {
        type: 'string',
        description: 'Colorway ID (optional — omit for base cost) / ID de colorway (opcional)',
      },
    },
    required: [],
  },
  execute: async (params, _dispatch, getState): Promise<ToolResult> => {
    const state = getState();
    const colorwayId = params.colorwayId as string | undefined;

    let totalCost: number;
    if (colorwayId) {
      totalCost = selectTotalCostByColorway(state, colorwayId);
    } else {
      totalCost = selectTotalCost(state);
    }

    const currency = state.bom.currency;

    return {
      success: true,
      data: {
        totalCost,
        currency,
        colorwayId: colorwayId ?? null,
      },
    };
  },
};

const exportBOMCSVTool: ToolDefinition = {
  name: 'exportBOMCSV',
  description:
    'Download the BOM as a CSV file. ' +
    '/ Descargar la lista de materiales como archivo CSV.',
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
  execute: async (_params, _dispatch, getState): Promise<ToolResult> => {
    try {
      const state = getState();
      const { pieces, seams, fabrics } = state.project;

      const { downloadBOM } = await import('../../../../utils/export/bomExport');
      downloadBOM(pieces, seams, fabrics);

      return {
        success: true,
        data: { message: 'BOM CSV downloaded.' },
      };
    } catch (err) {
      return {
        success: false,
        error: `Failed to export BOM CSV: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  },
};

// ─── Export ─────────────────────────────────────────────────────────────────

export const tools: ToolDefinition[] = [
  refreshBOMTool,
  addBOMEntryTool,
  updateBOMEntryTool,
  removeBOMEntryTool,
  setBOMCurrencyTool,
  getBOMTool,
  getBOMCostTool,
  exportBOMCSVTool,
];
