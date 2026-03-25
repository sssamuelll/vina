/**
 * Colorway Tools — tools for managing garment colorways (add, remove, switch,
 * update, list, duplicate).
 * Herramientas de Colorway — herramientas para gestionar los colorways del
 * patrón (añadir, eliminar, cambiar, actualizar, listar, duplicar).
 *
 * @module colorwayTools
 */

import type { ToolDefinition, ToolResult } from '../registry';
import type { AppDispatch, RootState } from '../../../../store';
import {
  addColorway,
  removeColorway,
  updateColorway,
  setActiveColorway,
  duplicateColorway,
} from '../../../../store/projectSlice';
import type { ColorwayOverride } from '../../../../types/types';

// ─── addColorway ─────────────────────────────────────────────────────────────

const addColorwayTool: ToolDefinition = {
  name: 'addColorway',
  description:
    'Create a new colorway with the given name and piece overrides, and optionally activate it immediately. ' +
    'Overrides is a map of pieceId → { color, fabricId, textureUrl }. ' +
    '/ Crear un nuevo colorway con el nombre y las sustituciones de piezas indicadas, y opcionalmente activarlo de inmediato. ' +
    'Overrides es un mapa de pieceId → { color, fabricId, textureUrl }.',
  parameters: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Unique name for the colorway / Nombre único del colorway',
      },
      overrides: {
        type: 'object',
        description:
          'Map of pieceId to override properties (color, fabricId, textureUrl) / ' +
          'Mapa de pieceId a propiedades de sustitución (color, fabricId, textureUrl)',
      },
      activate: {
        type: 'boolean',
        description:
          'Whether to activate this colorway after creation (default: true) / ' +
          'Si activar este colorway tras crearlo (defecto: true)',
      },
    },
    required: ['name', 'overrides'],
  },
  execute: async (
    params: Record<string, unknown>,
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<ToolResult> => {
    const state = getState();
    const name = params.name as string;
    const overrides = params.overrides as Record<string, ColorwayOverride>;
    const activate = (params.activate as boolean | undefined) ?? true;

    if (state.project.colorways.some(c => c.name === name)) {
      return { success: false, error: `A colorway named "${name}" already exists` };
    }

    dispatch(addColorway({ name, overrides }));

    // After dispatch, get the newly created colorway id
    const newState = getState();
    const created = newState.project.colorways.find(c => c.name === name);
    if (!created) {
      return { success: false, error: 'Failed to create colorway' };
    }

    if (activate) {
      dispatch(setActiveColorway(created.id));
    }

    return {
      success: true,
      data: {
        colorwayId: created.id,
        name: created.name,
        active: activate,
        overrideCount: Object.keys(overrides).length,
      },
    };
  },
};

// ─── removeColorway ──────────────────────────────────────────────────────────

const removeColorwayTool: ToolDefinition = {
  name: 'removeColorway',
  description:
    'Remove a colorway by ID. If it was active, the first remaining colorway becomes active. ' +
    '/ Eliminar un colorway por ID. Si estaba activo, el primer colorway restante se vuelve activo.',
  parameters: {
    type: 'object',
    properties: {
      colorwayId: {
        type: 'string',
        description: 'ID of the colorway to remove / ID del colorway a eliminar',
      },
    },
    required: ['colorwayId'],
  },
  execute: async (
    params: Record<string, unknown>,
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<ToolResult> => {
    const state = getState();
    const colorwayId = params.colorwayId as string;
    const colorway = state.project.colorways.find(c => c.id === colorwayId);

    if (!colorway) {
      return { success: false, error: `Colorway "${colorwayId}" not found` };
    }

    const wasActive = state.project.activeColorwayId === colorwayId;
    dispatch(removeColorway(colorwayId));

    const newState = getState();
    const newActiveId = newState.project.activeColorwayId;

    return {
      success: true,
      data: {
        removedId: colorwayId,
        removedName: colorway.name,
        wasActive,
        newActiveColorwayId: newActiveId,
      },
    };
  },
};

// ─── switchColorway ──────────────────────────────────────────────────────────

const switchColorwayTool: ToolDefinition = {
  name: 'switchColorway',
  description:
    'Switch the active colorway by ID or name. Pass null colorwayId to deactivate all colorways. ' +
    'At least one of colorwayId or name must be provided. ' +
    '/ Cambiar el colorway activo por ID o nombre. Pasar null en colorwayId para desactivar todos. ' +
    'Se debe proporcionar al menos uno de colorwayId o name.',
  parameters: {
    type: 'object',
    properties: {
      colorwayId: {
        type: 'string',
        description:
          'ID of the colorway to activate, or null to deactivate / ' +
          'ID del colorway a activar, o null para desactivar',
      },
      name: {
        type: 'string',
        description:
          'Name of the colorway to activate (used if colorwayId not provided) / ' +
          'Nombre del colorway a activar (se usa si no se proporciona colorwayId)',
      },
    },
    required: [],
  },
  execute: async (
    params: Record<string, unknown>,
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<ToolResult> => {
    const state = getState();
    let targetId: string | null | undefined = params.colorwayId as string | null | undefined;
    const name = params.name as string | undefined;

    // If neither provided, error
    if (targetId === undefined && name === undefined) {
      return {
        success: false,
        error: 'At least one of colorwayId or name must be provided',
      };
    }

    // Explicit null means deactivate
    if (targetId === null) {
      dispatch(setActiveColorway(null));
      return { success: true, data: { activeColorwayId: null } };
    }

    // Resolve by name if no id given
    if (targetId === undefined && name !== undefined) {
      const found = state.project.colorways.find(c => c.name === name);
      if (!found) {
        return { success: false, error: `Colorway with name "${name}" not found` };
      }
      targetId = found.id;
    }

    // Validate id exists
    const colorway = state.project.colorways.find(c => c.id === targetId);
    if (!colorway) {
      return { success: false, error: `Colorway "${targetId}" not found` };
    }

    dispatch(setActiveColorway(targetId as string));

    return {
      success: true,
      data: {
        activeColorwayId: targetId,
        activeColorwayName: colorway.name,
      },
    };
  },
};

// ─── updateColorway ──────────────────────────────────────────────────────────

const updateColorwayTool: ToolDefinition = {
  name: 'updateColorway',
  description:
    'Merge partial overrides into an existing colorway. Pass null for a pieceId entry to remove that override. ' +
    '/ Fusionar sustituciones parciales en un colorway existente. ' +
    'Pasar null para una entrada de pieceId elimina esa sustitución.',
  parameters: {
    type: 'object',
    properties: {
      colorwayId: {
        type: 'string',
        description: 'ID of the colorway to update / ID del colorway a actualizar',
      },
      overrides: {
        type: 'object',
        description:
          'Partial map of pieceId to override properties to merge (null removes the entry) / ' +
          'Mapa parcial de pieceId a propiedades de sustitución a fusionar (null elimina la entrada)',
      },
    },
    required: ['colorwayId', 'overrides'],
  },
  execute: async (
    params: Record<string, unknown>,
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<ToolResult> => {
    const state = getState();
    const colorwayId = params.colorwayId as string;
    const overrides = params.overrides as Record<string, ColorwayOverride | null>;

    const colorway = state.project.colorways.find(c => c.id === colorwayId);
    if (!colorway) {
      return { success: false, error: `Colorway "${colorwayId}" not found` };
    }

    dispatch(updateColorway({ id: colorwayId, overrides }));

    return {
      success: true,
      data: {
        colorwayId,
        name: colorway.name,
        updatedKeys: Object.keys(overrides),
      },
    };
  },
};

// ─── listColorways ────────────────────────────────────────────────────────────

const listColorwaysTool: ToolDefinition = {
  name: 'listColorways',
  description:
    'Read-only. Returns all colorways in the project with their IDs, names, override counts, and active status. ' +
    '/ Solo lectura. Devuelve todos los colorways del proyecto con sus IDs, nombres, cantidad de sustituciones y estado activo.',
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
  execute: async (
    _params: Record<string, unknown>,
    _dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<ToolResult> => {
    const state = getState();
    const activeId = state.project.activeColorwayId;

    const colorways = state.project.colorways.map(c => ({
      id: c.id,
      name: c.name,
      isDefault: c.isDefault ?? false,
      isActive: c.id === activeId,
      overrideCount: Object.keys(c.overrides).length,
    }));

    return {
      success: true,
      data: {
        colorways: colorways as unknown as Record<string, unknown>,
        count: colorways.length,
        activeColorwayId: activeId,
      },
    };
  },
};

// ─── duplicateColorway ────────────────────────────────────────────────────────

const duplicateColorwayTool: ToolDefinition = {
  name: 'duplicateColorway',
  description:
    'Duplicate an existing colorway with a new name, copying all overrides. ' +
    '/ Duplicar un colorway existente con un nuevo nombre, copiando todas las sustituciones.',
  parameters: {
    type: 'object',
    properties: {
      colorwayId: {
        type: 'string',
        description: 'ID of the colorway to duplicate / ID del colorway a duplicar',
      },
      newName: {
        type: 'string',
        description: 'Name for the new colorway / Nombre del nuevo colorway',
      },
    },
    required: ['colorwayId', 'newName'],
  },
  execute: async (
    params: Record<string, unknown>,
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<ToolResult> => {
    const state = getState();
    const colorwayId = params.colorwayId as string;
    const newName = params.newName as string;

    const source = state.project.colorways.find(c => c.id === colorwayId);
    if (!source) {
      return { success: false, error: `Colorway "${colorwayId}" not found` };
    }

    if (state.project.colorways.some(c => c.name === newName)) {
      return { success: false, error: `A colorway named "${newName}" already exists` };
    }

    dispatch(duplicateColorway({ sourceId: colorwayId, newName }));

    const newState = getState();
    const created = newState.project.colorways.find(c => c.name === newName);

    return {
      success: true,
      data: {
        sourceId: colorwayId,
        sourceName: source.name,
        newColorwayId: created?.id,
        newName,
        overrideCount: Object.keys(source.overrides).length,
      },
    };
  },
};

// ─── Export ──────────────────────────────────────────────────────────────────

export const tools: ToolDefinition[] = [
  addColorwayTool,
  removeColorwayTool,
  switchColorwayTool,
  updateColorwayTool,
  listColorwaysTool,
  duplicateColorwayTool,
];
