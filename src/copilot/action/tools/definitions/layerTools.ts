/**
 * Layer Operations — tools for managing piece layer assignment, cloning to layers,
 * and superimposing pieces relative to one another.
 * Operaciones de Capa — herramientas para gestionar la capa de las piezas, clonar en capas
 * y superponer piezas entre sí.
 *
 * @module layerTools
 */

import type { ToolDefinition, ToolResult } from '../registry';
import type { AppDispatch, RootState } from '../../../../store';
import {
  setLayer, setSublayer, cloneToLayer, superimposePiece, setArrangement3D, setArrangementBinding,
  renameLayer as renameLayerAction, deleteLayerName, setLayerLocked as setLayerLockedAction,
  removePiece,
} from '../../../../store/projectSlice';
import {
  toggleLayerVisibility, setXrayMode,
} from '../../../../store/simulationSlice';

// ─── setLayer ────────────────────────────────────────────────────────────────

const setLayerTool: ToolDefinition = {
  name: 'setLayer',
  description:
    'Set the garment layer (0 = lining/facing, 1 = shell, 2 = collar/cuff/pocket) for a pattern piece. ' +
    'Optionally set a sublayer for fine-grained ordering within a layer. ' +
    '/ Asignar la capa de prenda (0 = forro/entretela, 1 = exterior, 2 = cuello/puño/bolsillo) a una pieza de patrón. ' +
    'Opcionalmente asignar una subcapa para orden fino dentro de la capa.',
  parameters: {
    type: 'object',
    properties: {
      pieceId: { type: 'string', description: 'ID of the piece to update / ID de la pieza a actualizar' },
      layer: { type: 'number', description: 'Layer number (0 = innermost, higher = outer) / Número de capa (0 = más interior, mayor = más exterior)' },
      sublayer: { type: 'number', description: 'Optional sublayer for ordering within the same layer / Subcapa opcional para ordenar dentro de la misma capa' },
    },
    required: ['pieceId', 'layer'],
  },
  execute: async (
    params: Record<string, unknown>,
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<ToolResult> => {
    const state = getState();
    const piece = state.project.pieces.find(p => p.id === params.pieceId);
    if (!piece) return { success: false, error: `Piece "${params.pieceId}" not found` };

    const previousLayer = piece.layer;
    const previousSublayer = piece.sublayer;

    dispatch(setLayer({ pieceId: params.pieceId as string, layer: params.layer as number }));

    if (params.sublayer !== undefined) {
      dispatch(setSublayer({ pieceId: params.pieceId as string, sublayer: params.sublayer as number }));
    }

    return {
      success: true,
      data: { pieceId: params.pieceId, layer: params.layer, sublayer: params.sublayer },
      rollback: () => {
        dispatch(setLayer({ pieceId: params.pieceId as string, layer: previousLayer ?? 1 }));
        if (previousSublayer !== undefined) {
          dispatch(setSublayer({ pieceId: params.pieceId as string, sublayer: previousSublayer }));
        }
      },
    };
  },
};

// ─── cloneToLayer ─────────────────────────────────────────────────────────────

const cloneToLayerTool: ToolDefinition = {
  name: 'cloneToLayer',
  description:
    'Clone a pattern piece to the layer immediately above or below its current layer. ' +
    'The clone inherits the original\'s 3D arrangement position. ' +
    '/ Clonar una pieza de patrón a la capa inmediatamente superior o inferior a su capa actual. ' +
    'El clon toma la posición de disposición 3D del original.',
  parameters: {
    type: 'object',
    properties: {
      pieceId: { type: 'string', description: 'ID of the piece to clone / ID de la pieza a clonar' },
      direction: {
        type: 'string',
        enum: ['over', 'under'],
        description: '"over" = clone goes one layer above, "under" = clone goes one layer below / "over" = el clon va una capa arriba, "under" = el clon va una capa abajo',
      },
    },
    required: ['pieceId', 'direction'],
  },
  execute: async (
    params: Record<string, unknown>,
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<ToolResult> => {
    const state = getState();
    const piece = state.project.pieces.find(p => p.id === params.pieceId);
    if (!piece) return { success: false, error: `Piece "${params.pieceId}" not found` };

    const direction = params.direction as 'over' | 'under';

    dispatch(cloneToLayer({ pieceId: params.pieceId as string, direction }));

    // Retrieve clone id from state after dispatch
    const newState = getState();
    const clonePrefix = `${params.pieceId}-clone-`;
    const clone = newState.project.pieces
      .filter(p => p.id.startsWith(clonePrefix))
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))[0];

    return {
      success: true,
      data: {
        originalPieceId: params.pieceId,
        cloneId: clone?.id,
        cloneLayer: clone?.layer,
      },
      rollback: clone ? () => { dispatch(removePiece(clone.id)); } : undefined,
    };
  },
};

// ─── superimpose ──────────────────────────────────────────────────────────────

const superimposeTool: ToolDefinition = {
  name: 'superimpose',
  description:
    'Move a pattern piece to the same 3D position as a target piece, optionally adjusting its layer ' +
    'to sit above, below, or beside the target. ' +
    '/ Mover una pieza de patrón a la misma posición 3D que una pieza objetivo, ajustando opcionalmente ' +
    'su capa para quedar encima, debajo o al lado del objetivo.',
  parameters: {
    type: 'object',
    properties: {
      pieceId: { type: 'string', description: 'ID of the piece to reposition / ID de la pieza a reposicionar' },
      targetPieceId: { type: 'string', description: 'ID of the reference piece / ID de la pieza de referencia' },
      mode: {
        type: 'string',
        enum: ['over', 'under', 'side'],
        description: '"over" = layer above target, "under" = layer below target, "side" = same layer, offset 0.1m sideways / "over" = capa encima del objetivo, "under" = capa debajo, "side" = misma capa, desplazada 0.1m lateralmente',
      },
    },
    required: ['pieceId', 'targetPieceId', 'mode'],
  },
  execute: async (
    params: Record<string, unknown>,
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<ToolResult> => {
    const state = getState();
    const piece = state.project.pieces.find(p => p.id === params.pieceId);
    const target = state.project.pieces.find(p => p.id === params.targetPieceId);
    if (!piece) return { success: false, error: `Piece "${params.pieceId}" not found` };
    if (!target) return { success: false, error: `Target piece "${params.targetPieceId}" not found` };

    const previousLayer = piece.layer;
    const previousPos = state.project.arrangementOverrides[params.pieceId as string];

    dispatch(superimposePiece({
      pieceId: params.pieceId as string,
      targetPieceId: params.targetPieceId as string,
      mode: params.mode as 'over' | 'under' | 'side',
    }));

    return {
      success: true,
      data: {
        pieceId: params.pieceId,
        targetPieceId: params.targetPieceId,
        mode: params.mode,
      },
      rollback: () => {
        if (previousLayer !== undefined) {
          dispatch(setLayer({ pieceId: params.pieceId as string, layer: previousLayer }));
        }
        if (previousPos) {
          // Contrato: el override previo puede ser V3 legacy o binding frame-delta.
          if (Array.isArray(previousPos)) {
            dispatch(setArrangement3D({ pieceId: params.pieceId as string, position: [...previousPos] as [number, number, number] }));
          } else {
            dispatch(setArrangementBinding({ pieceId: params.pieceId as string, binding: previousPos }));
          }
        }
      },
    };
  },
};

// ─── getLayerInfo ─────────────────────────────────────────────────────────────

const getLayerInfoTool: ToolDefinition = {
  name: 'getLayerInfo',
  description:
    'Read-only. Returns layer and sublayer information for one or all pattern pieces. ' +
    '/ Solo lectura. Devuelve información de capa y subcapa para una o todas las piezas de patrón.',
  parameters: {
    type: 'object',
    properties: {
      pieceId: {
        type: 'string',
        description: 'ID of a specific piece to query. Omit to get info for all pieces. / ID de una pieza específica. Omitir para obtener info de todas las piezas.',
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

    if (params.pieceId) {
      const piece = state.project.pieces.find(p => p.id === params.pieceId);
      if (!piece) return { success: false, error: `Piece "${params.pieceId}" not found` };
      return {
        success: true,
        data: {
          pieceId: piece.id,
          name: piece.name,
          layer: piece.layer ?? 1,
          sublayer: piece.sublayer ?? 0,
        },
      };
    }

    // Return a map of all pieces
    const layerMap = state.project.pieces.map(p => ({
      pieceId: p.id,
      name: p.name,
      layer: p.layer ?? 1,
      sublayer: p.sublayer ?? 0,
    }));

    return {
      success: true,
      data: { pieces: layerMap as unknown as Record<string, unknown> },
    };
  },
};

// ─── setLayerVisibility ──────────────────────────────────────────────────────

const setLayerVisibilityTool: ToolDefinition = {
  name: 'setLayerVisibility',
  description: 'Show or hide an entire garment layer in both 2D and 3D viewports.',
  parameters: {
    type: 'object',
    properties: {
      layer: { type: 'number', description: 'Layer number to show/hide' },
      visible: { type: 'boolean', description: 'true to show, false to hide' },
    },
    required: ['layer', 'visible'],
  },
  execute: async (params, dispatch, getState) => {
    const state = getState();
    const isHidden = state.simulation.hiddenLayerIds.includes(params.layer as number);
    const shouldHide = !(params.visible as boolean);
    if (isHidden !== shouldHide) {
      dispatch(toggleLayerVisibility(params.layer as number));
    }
    return {
      success: true,
      data: { layer: params.layer, visible: params.visible },
      rollback: () => { dispatch(toggleLayerVisibility(params.layer as number)); },
    };
  },
};

// ─── toggleXrayMode ──────────────────────────────────────────────────────────

const toggleXrayModeTool: ToolDefinition = {
  name: 'toggleXrayMode',
  description: 'Toggle X-ray transparency mode to see through garment layers.',
  parameters: {
    type: 'object',
    properties: {
      enabled: { type: 'boolean', description: 'true to enable, false to disable' },
      activeLayer: { type: 'number', description: 'Layer to keep opaque (optional)' },
    },
    required: ['enabled'],
  },
  execute: async (
    params: Record<string, unknown>,
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<ToolResult> => {
    const state = getState();
    const wasEnabled = state.simulation.xrayMode;
    const previousActiveLayer = state.simulation.xrayActiveLayer;

    dispatch(setXrayMode({
      enabled: params.enabled as boolean,
      activeLayer: params.activeLayer as number | undefined,
    }));

    return {
      success: true,
      data: { enabled: params.enabled, activeLayer: params.activeLayer },
      rollback: () => {
        dispatch(setXrayMode({
          enabled: wasEnabled,
          activeLayer: wasEnabled ? (previousActiveLayer ?? undefined) : undefined,
        }));
      },
    };
  },
};

// ─── renameLayer ─────────────────────────────────────────────────────────────

const renameLayerTool: ToolDefinition = {
  name: 'renameLayer',
  description: 'Set a custom display name for a garment layer.',
  parameters: {
    type: 'object',
    properties: {
      layer: { type: 'number', description: 'Layer number' },
      name: { type: 'string', description: 'Display name for the layer' },
    },
    required: ['layer', 'name'],
  },
  execute: async (params, dispatch, getState) => {
    const prevName = getState().project.layerNames[params.layer as number];
    dispatch(renameLayerAction({ layer: params.layer as number, name: params.name as string }));
    return {
      success: true,
      data: { layer: params.layer, name: params.name },
      rollback: () => {
        if (prevName) dispatch(renameLayerAction({ layer: params.layer as number, name: prevName }));
        else dispatch(deleteLayerName({ layer: params.layer as number }));
      },
    };
  },
};

// ─── setLayerLock ────────────────────────────────────────────────────────────

const setLayerLockTool: ToolDefinition = {
  name: 'setLayerLock',
  description: 'Lock or unlock a garment layer to prevent/allow edits.',
  parameters: {
    type: 'object',
    properties: {
      layer: { type: 'number', description: 'Layer number' },
      locked: { type: 'boolean', description: 'true to lock, false to unlock' },
    },
    required: ['layer', 'locked'],
  },
  execute: async (params, dispatch, getState) => {
    const prevLocked = getState().project.layerLocked[params.layer as number] ?? false;
    dispatch(setLayerLockedAction({ layer: params.layer as number, locked: params.locked as boolean }));
    return {
      success: true,
      data: { layer: params.layer, locked: params.locked },
      rollback: () => { dispatch(setLayerLockedAction({ layer: params.layer as number, locked: prevLocked })); },
    };
  },
};

// ─── Export ──────────────────────────────────────────────────────────────────

export const tools: ToolDefinition[] = [
  setLayerTool,
  cloneToLayerTool,
  superimposeTool,
  getLayerInfoTool,
  setLayerVisibilityTool,
  toggleXrayModeTool,
  renameLayerTool,
  setLayerLockTool,
];
