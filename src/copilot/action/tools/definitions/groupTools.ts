/**
 * Group Tools — create, manage, and apply operations to piece groups via copilot.
 *
 * @module groupTools
 */

import type { ToolDefinition, ToolResult } from '../registry';
import {
  createGroup,
  addPiecesToGroup,
  removePiecesFromGroup,
  deleteGroup,
  renameGroup,
  setGroupColor,
  setGroupFabric,
  setGroupSeamAllowance,
} from '../../../../store/projectSlice';
import type { PieceGroup } from '../../../../types/types';

const groupPiecesTool: ToolDefinition = {
  name: 'groupPieces',
  description:
    'Create a named group of pattern pieces for batch operations. ' +
    'Groups enable applying fabric, seam allowance, and other operations to multiple pieces at once. ' +
    '/ Crear un grupo de piezas de patrón para operaciones por lote.',
  parameters: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Name for the group (e.g., "Bodice Front", "Sleeve Set") / Nombre del grupo',
      },
      pieceIds: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of piece IDs to include in the group / IDs de las piezas',
      },
      color: {
        type: 'string',
        description: 'Optional hex color for the group indicator (e.g., "#ff6b6b") / Color opcional',
      },
    },
    required: ['name', 'pieceIds'],
  },
  execute: async (params, dispatch, getState): Promise<ToolResult> => {
    const name = params.name as string;
    const pieceIds = params.pieceIds as string[];
    const color = params.color as string | undefined;

    const state = getState();
    const pieces = state.project.pieces;

    // Validate piece IDs
    const missing = pieceIds.filter(
      (id: string) => !pieces.find((p: { id: string }) => p.id === id),
    );
    if (missing.length > 0) {
      return {
        success: false,
        error: `Pieces not found: ${missing.join(', ')}. Use listPieces to see available pieces.`,
      };
    }

    dispatch(createGroup({ name, pieceIds, color }));

    const groups = getState().project.groups as PieceGroup[];
    const created = groups[groups.length - 1];

    return {
      success: true,
      data: {
        groupId: created?.id,
        name,
        pieceCount: pieceIds.length,
        pieceIds,
        color: created?.color,
      },
    };
  },
};

const applyToGroupTool: ToolDefinition = {
  name: 'applyToGroup',
  description:
    'Apply an operation to all pieces in a group: set fabric, seam allowance, rename, or change color. ' +
    '/ Aplicar una operación a todas las piezas de un grupo: tela, margen de costura, renombrar o color.',
  parameters: {
    type: 'object',
    properties: {
      groupId: {
        type: 'string',
        description: 'ID of the group to apply the operation to / ID del grupo',
      },
      operation: {
        type: 'string',
        enum: ['setFabric', 'setSeamAllowance', 'rename', 'setColor'],
        description: 'Operation to apply / Operación a aplicar',
      },
      value: {
        type: 'string',
        description:
          'Value for the operation: fabric ID for setFabric, mm for setSeamAllowance, ' +
          'new name for rename, hex color for setColor / Valor de la operación',
      },
    },
    required: ['groupId', 'operation', 'value'],
  },
  execute: async (params, dispatch, getState): Promise<ToolResult> => {
    const groupId = params.groupId as string;
    const operation = params.operation as string;
    const value = params.value;

    const state = getState();
    const group = (state.project.groups as PieceGroup[]).find(
      (g: PieceGroup) => g.id === groupId,
    );
    if (!group) {
      return {
        success: false,
        error: `Group "${groupId}" not found. Use listGroups to see available groups.`,
      };
    }

    switch (operation) {
      case 'setFabric':
        dispatch(setGroupFabric({ groupId, fabricId: value as string }));
        break;
      case 'setSeamAllowance':
        dispatch(setGroupSeamAllowance({ groupId, width: Number(value) }));
        break;
      case 'rename':
        dispatch(renameGroup({ groupId, name: value as string }));
        break;
      case 'setColor':
        dispatch(setGroupColor({ groupId, color: value as string }));
        break;
      default:
        return { success: false, error: `Unknown operation: ${operation}` };
    }

    return {
      success: true,
      data: {
        groupId,
        groupName: group.name,
        operation,
        value,
        affectedPieces: group.pieceIds.length,
      },
    };
  },
};

const listGroupsTool: ToolDefinition = {
  name: 'listGroups',
  description:
    'List all piece groups in the project with their members. ' +
    '/ Listar todos los grupos de piezas del proyecto con sus miembros.',
  parameters: {
    type: 'object',
    properties: {},
  },
  execute: async (_params, _dispatch, getState): Promise<ToolResult> => {
    const state = getState();
    const groups = state.project.groups as PieceGroup[];
    const pieces = state.project.pieces;

    return {
      success: true,
      data: {
        groups: groups.map((g: PieceGroup) => ({
          id: g.id,
          name: g.name,
          color: g.color,
          pieceCount: g.pieceIds.length,
          pieces: g.pieceIds.map((pid: string) => {
            const p = pieces.find((pp: { id: string }) => pp.id === pid);
            return { id: pid, name: (p as { name?: string })?.name ?? pid };
          }),
        })),
        total: groups.length,
      },
    };
  },
};

const modifyGroupTool: ToolDefinition = {
  name: 'modifyGroup',
  description:
    'Add or remove pieces from an existing group, or delete the group entirely. ' +
    '/ Agregar o quitar piezas de un grupo existente, o eliminar el grupo.',
  parameters: {
    type: 'object',
    properties: {
      groupId: {
        type: 'string',
        description: 'ID of the group / ID del grupo',
      },
      action: {
        type: 'string',
        enum: ['addPieces', 'removePieces', 'delete'],
        description: 'Action to perform / Acción a realizar',
      },
      pieceIds: {
        type: 'array',
        items: { type: 'string' },
        description: 'Piece IDs (for addPieces/removePieces) / IDs de piezas',
      },
    },
    required: ['groupId', 'action'],
  },
  execute: async (params, dispatch, getState): Promise<ToolResult> => {
    const groupId = params.groupId as string;
    const action = params.action as string;
    const pieceIds = (params.pieceIds as string[] | undefined) ?? [];

    const state = getState();
    const group = (state.project.groups as PieceGroup[]).find(
      (g: PieceGroup) => g.id === groupId,
    );
    if (!group) {
      return {
        success: false,
        error: `Group "${groupId}" not found.`,
      };
    }

    switch (action) {
      case 'addPieces':
        dispatch(addPiecesToGroup({ groupId, pieceIds }));
        break;
      case 'removePieces':
        dispatch(removePiecesFromGroup({ groupId, pieceIds }));
        break;
      case 'delete':
        dispatch(deleteGroup({ groupId }));
        break;
      default:
        return { success: false, error: `Unknown action: ${action}` };
    }

    return {
      success: true,
      data: {
        groupId,
        groupName: group.name,
        action,
        pieceIds: action === 'delete' ? undefined : pieceIds,
      },
    };
  },
};

export const tools: ToolDefinition[] = [
  groupPiecesTool,
  applyToGroupTool,
  listGroupsTool,
  modifyGroupTool,
];
