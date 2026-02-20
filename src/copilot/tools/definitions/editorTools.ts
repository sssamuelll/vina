/**
 * Editor Tools — view mode, selection, units, display toggles.
 * Herramientas de Editor — modo de vista, selección, unidades, opciones de visualización.
 *
 * @module editorTools
 */

import type { ToolDefinition, ToolResult } from '../registry';
import {
  setViewMode as setViewModeAction,
  selectPiece as selectPieceAction,
  clearSelection,
  setUnits as setUnitsAction,
  toggleSeamAllowance,
} from '../../../store/editorSlice';
import type { ViewMode, UnitSystem } from '../../../types/types';

// ─── setViewMode ────────────────────────────────────────────────────────────

const setViewModeTool: ToolDefinition = {
  name: 'setViewMode',
  description:
    'Switch between 2D, 3D, or split view mode. / Cambiar entre modo de vista 2D, 3D o dividida.',
  parameters: {
    type: 'object',
    properties: {
      mode: {
        type: 'string',
        enum: ['2d', '3d', 'split'],
        description: 'View mode / Modo de vista',
      },
    },
    required: ['mode'],
  },
  execute: async (params, dispatch): Promise<ToolResult> => {
    dispatch(setViewModeAction(params.mode as ViewMode));
    return { success: true };
  },
};

// ─── selectPiece ────────────────────────────────────────────────────────────

const selectPieceTool: ToolDefinition = {
  name: 'selectPiece',
  description:
    "Select a pattern piece on the canvas. Use 'none' to clear selection. " +
    "/ Seleccionar una pieza de patrón en el lienzo. Usar 'none' para limpiar selección.",
  parameters: {
    type: 'object',
    properties: {
      pieceId: { type: 'string', description: "Piece ID to select, or 'none' to clear / ID de pieza, o 'none' para limpiar" },
    },
    required: ['pieceId'],
  },
  execute: async (params, dispatch): Promise<ToolResult> => {
    const pieceId = params.pieceId as string;
    if (pieceId === 'none') {
      dispatch(clearSelection());
    } else {
      dispatch(selectPieceAction(pieceId));
    }
    return { success: true };
  },
};

// ─── setUnits ───────────────────────────────────────────────────────────────

const setUnitsTool: ToolDefinition = {
  name: 'setUnits',
  description:
    'Set the display unit system. / Establecer el sistema de unidades de visualización.',
  parameters: {
    type: 'object',
    properties: {
      units: {
        type: 'string',
        enum: ['mm', 'cm', 'inches'],
        description: 'Unit system / Sistema de unidades',
      },
    },
    required: ['units'],
  },
  execute: async (params, dispatch): Promise<ToolResult> => {
    dispatch(setUnitsAction(params.units as UnitSystem));
    return { success: true };
  },
};

// ─── toggleSeamAllowanceDisplay ─────────────────────────────────────────────

const toggleSeamAllowanceDisplayTool: ToolDefinition = {
  name: 'toggleSeamAllowanceDisplay',
  description:
    'Toggle the visibility of seam allowance on the canvas. / Alternar la visibilidad del margen de costura en el lienzo.',
  parameters: {
    type: 'object',
    properties: {},
  },
  execute: async (_params, dispatch, getState): Promise<ToolResult> => {
    dispatch(toggleSeamAllowance());
    const state = getState();
    return {
      success: true,
      data: { showSeamAllowance: state.editor.showSeamAllowance },
    };
  },
};

// ─── Export ─────────────────────────────────────────────────────────────────

export const tools: ToolDefinition[] = [
  setViewModeTool,
  selectPieceTool,
  setUnitsTool,
  toggleSeamAllowanceDisplayTool,
];
