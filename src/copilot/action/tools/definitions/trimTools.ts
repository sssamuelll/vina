/**
 * Trim Tools — tools for adding, removing, updating, and listing trims
 * (buttons, zippers, snaps, rivets, buckles, etc.) on pattern pieces.
 * Herramientas de Avios — herramientas para agregar, eliminar, actualizar
 * y listar avios (botones, cremalleras, broches, remaches, hebillas, etc.)
 * en las piezas de patron.
 *
 * @module trimTools
 */

import type { ToolDefinition, ToolResult } from '../registry';
import type { AppDispatch, RootState } from '../../../../store';
import { addTrim, removeTrim, updateTrim } from '../../../../store/projectSlice';
import type { Trim, TrimType } from '../../../../types/trim';
import { TRIM_DEFAULTS } from '../../../../types/trim';
import { getTrimPreset, searchTrimPresets, getTrimPresetsByType, TRIM_LIBRARY } from '../../../../utils/trim/trimLibrary';
import { uid } from '../../../../utils/pathHelpers';
import { computeEdgeLengthMM } from '../../../../utils/geometry/edgeInterpolation';
import { batchUndo } from '../../../../store/undoMiddleware';

// ─── addTrim ────────────────────────────────────────────────────────────────

const addTrimTool: ToolDefinition = {
  name: 'addTrim',
  description:
    'Add a trim (button, zipper, snap, rivet, buckle, ring, hook-eye, drawstring stop, or custom) ' +
    'to a pattern piece. Use placementMode "edge" to place along a specific edge, or "count" for a quantity-based placement. ' +
    'Optionally provide a presetId to use values from the built-in trim library as defaults. ' +
    '/ Agregar un avio (boton, cremallera, broche, remache, hebilla, anilla, corchete, tope de cordon, o personalizado) ' +
    'a una pieza de patron. Usar placementMode "edge" para colocar a lo largo de un borde, o "count" para colocacion por cantidad. ' +
    'Opcionalmente proporcionar un presetId para usar valores de la biblioteca de avios como defectos.',
  parameters: {
    type: 'object',
    properties: {
      pieceId: { type: 'string', description: 'Piece ID / ID de la pieza' },
      placementMode: {
        type: 'string',
        enum: ['edge', 'edge-points', 'count'],
        description: 'Placement mode: "edge" for edge range, "edge-points" for discrete positions along edge, "count" for quantity-based / Modo: "edge" rango, "edge-points" posiciones discretas, "count" cantidad',
      },
      presetId: {
        type: 'string',
        description: 'Optional preset ID from the trim library / ID de preset opcional de la biblioteca de avios',
      },
      type: {
        type: 'string',
        enum: ['button', 'zipper', 'snap', 'rivet', 'buckle', 'ring', 'hook-eye', 'drawstring-stop', 'custom'],
        description: 'Trim type (default "button") / Tipo de avio (defecto "button")',
      },
      name: { type: 'string', description: 'Trim name / Nombre del avio' },
      description: { type: 'string', description: 'Trim description / Descripcion del avio' },
      material: { type: 'string', description: 'Material (e.g. "plastic", "metal") / Material (ej. "plastic", "metal")' },
      color: { type: 'string', description: 'Hex color (default "#333333") / Color hex (defecto "#333333")' },
      size: { type: 'number', description: 'Size in mm — diameter for buttons, width for zippers (default 15) / Tamano en mm (defecto 15)' },
      unitCost: { type: 'number', description: 'Unit cost (default 0) / Costo unitario (defecto 0)' },
      edgeName: {
        type: 'string',
        description: 'Edge name — required if placementMode is "edge" / Nombre del borde — requerido si placementMode es "edge"',
      },
      tStart: {
        type: 'number',
        description: 'Start of parametric range along edge (0-1, default 0) / Inicio del rango parametrico (0-1, defecto 0)',
      },
      tEnd: {
        type: 'number',
        description: 'End of parametric range along edge (0-1, default 1) / Fin del rango parametrico (0-1, defecto 1)',
      },
      quantity: {
        type: 'number',
        description: 'Quantity — required if placementMode is "count" / Cantidad — requerido si placementMode es "count"',
      },
      positions: {
        type: 'array',
        items: { type: 'number' },
        description: 'Parametric positions (0-1) along edge — required if placementMode is "edge-points" / Posiciones parametricas (0-1)',
      },
    },
    required: ['pieceId', 'placementMode'],
  },
  execute: async (
    params: Record<string, unknown>,
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<ToolResult> => {
    const state = getState();
    const piece = state.project.pieces.find(p => p.id === params.pieceId);
    if (!piece) return { success: false, error: `Piece "${params.pieceId}" not found` };

    const placementMode = params.placementMode as 'edge' | 'edge-points' | 'count';

    // Resolve preset defaults if provided
    const preset = params.presetId ? getTrimPreset(params.presetId as string) : undefined;
    if (params.presetId && !preset) {
      return { success: false, error: `Trim preset "${params.presetId}" not found` };
    }

    const type = (params.type as TrimType | undefined) ?? preset?.type ?? TRIM_DEFAULTS.type;
    const name = (params.name as string | undefined) ?? preset?.name ?? TRIM_DEFAULTS.name;
    const description = (params.description as string | undefined) ?? TRIM_DEFAULTS.description;
    const material = (params.material as string | undefined) ?? preset?.material ?? TRIM_DEFAULTS.material;
    const color = (params.color as string | undefined) ?? preset?.color ?? TRIM_DEFAULTS.color;
    const size = (params.size as number | undefined) ?? preset?.size ?? TRIM_DEFAULTS.size;
    const unitCost = (params.unitCost as number | undefined) ?? preset?.unitCost ?? TRIM_DEFAULTS.unitCost;

    // Build placement
    let placement: Trim['placement'];
    if (placementMode === 'edge') {
      const edgeName = params.edgeName as string | undefined;
      if (!edgeName) return { success: false, error: 'edgeName is required when placementMode is "edge"' };

      const edge = piece.edges?.find(e => e.name === edgeName);
      if (!edge) return { success: false, error: `Edge "${edgeName}" not found on piece "${params.pieceId}"` };

      const tStart = (params.tStart as number | undefined) ?? 0;
      const tEnd = (params.tEnd as number | undefined) ?? 1;
      if (tStart >= tEnd) return { success: false, error: 'tStart must be less than tEnd' };

      placement = { mode: 'edge', edgeName, tStart, tEnd };
    } else if (placementMode === 'edge-points') {
      const edgeName = params.edgeName as string | undefined;
      if (!edgeName) return { success: false, error: 'edgeName is required when placementMode is "edge-points"' };
      const edge = piece.edges?.find(e => e.name === edgeName);
      if (!edge) return { success: false, error: `Edge "${edgeName}" not found on piece "${params.pieceId}"` };
      const positions = params.positions as number[] | undefined;
      if (!positions || positions.length === 0) return { success: false, error: 'positions array is required for edge-points mode' };
      if (positions.some(t => t < 0 || t > 1)) return { success: false, error: 'All positions must be between 0 and 1' };
      placement = { mode: 'edge-points', edgeName, positions };
    } else {
      const quantity = params.quantity as number | undefined;
      if (quantity === undefined || quantity === null) {
        return { success: false, error: 'quantity is required when placementMode is "count"' };
      }
      if (quantity < 1) return { success: false, error: 'quantity must be at least 1' };
      placement = { mode: 'count', quantity };
    }

    const id = uid();

    const trim: Trim = {
      id,
      pieceId: params.pieceId as string,
      type,
      presetId: params.presetId as string | undefined,
      name,
      description,
      placement,
      material,
      color,
      size,
      unitCost,
      active: true,
    };

    dispatch(addTrim(trim));

    return {
      success: true,
      data: {
        trimId: id,
        pieceId: params.pieceId,
        type,
        name,
      },
    };
  },
};

// ─── removeTrim ─────────────────────────────────────────────────────────────

const removeTrimTool: ToolDefinition = {
  name: 'removeTrim',
  description:
    'Remove a trim from a pattern piece by its ID. ' +
    '/ Eliminar un avio de una pieza de patron por su ID.',
  parameters: {
    type: 'object',
    properties: {
      trimId: { type: 'string', description: 'Trim ID to remove / ID del avio a eliminar' },
    },
    required: ['trimId'],
  },
  execute: async (
    params: Record<string, unknown>,
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<ToolResult> => {
    const state = getState();
    const trim = state.project.trims.find(t => t.id === params.trimId);
    if (!trim) return { success: false, error: `Trim "${params.trimId}" not found` };

    const snapshot = { ...trim };
    dispatch(removeTrim(params.trimId as string));

    return {
      success: true,
      data: { trimId: params.trimId },
      rollback: () => dispatch(addTrim(snapshot as Trim)),
    };
  },
};

// ─── updateTrim ─────────────────────────────────────────────────────────────

const updateTrimTool: ToolDefinition = {
  name: 'updateTrim',
  description:
    'Update properties of an existing trim on a pattern piece. ' +
    'Only the provided fields will be changed; omitted fields keep their current values. ' +
    '/ Actualizar las propiedades de un avio existente en una pieza de patron. ' +
    'Solo se cambiaran los campos proporcionados; los campos omitidos conservan sus valores actuales.',
  parameters: {
    type: 'object',
    properties: {
      trimId: { type: 'string', description: 'Trim ID to update / ID del avio a actualizar' },
      name: { type: 'string', description: 'New name / Nuevo nombre' },
      description: { type: 'string', description: 'New description / Nueva descripcion' },
      material: { type: 'string', description: 'New material / Nuevo material' },
      color: { type: 'string', description: 'New hex color / Nuevo color hex' },
      size: { type: 'number', description: 'New size in mm / Nuevo tamano en mm' },
      unitCost: { type: 'number', description: 'New unit cost / Nuevo costo unitario' },
      active: { type: 'boolean', description: 'Whether the trim is active / Si el avio esta activo' },
    },
    required: ['trimId'],
  },
  execute: async (
    params: Record<string, unknown>,
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<ToolResult> => {
    const state = getState();
    const trim = state.project.trims.find(t => t.id === params.trimId);
    if (!trim) return { success: false, error: `Trim "${params.trimId}" not found` };

    const updates: Partial<Trim> & { id: string } = { id: params.trimId as string };
    if (params.name !== undefined) updates.name = params.name as string;
    if (params.description !== undefined) updates.description = params.description as string;
    if (params.material !== undefined) updates.material = params.material as string;
    if (params.color !== undefined) updates.color = params.color as string;
    if (params.size !== undefined) updates.size = params.size as number;
    if (params.unitCost !== undefined) updates.unitCost = params.unitCost as number;
    if (params.active !== undefined) updates.active = params.active as boolean;

    dispatch(updateTrim(updates));

    return {
      success: true,
      data: { trimId: params.trimId, updated: updates },
    };
  },
};

// ─── listTrims ──────────────────────────────────────────────────────────────

const listTrimsTool: ToolDefinition = {
  name: 'listTrims',
  description:
    'List all trims in the project, optionally filtered by piece ID. ' +
    '/ Listar todos los avios del proyecto, opcionalmente filtrados por ID de pieza.',
  parameters: {
    type: 'object',
    properties: {
      pieceId: { type: 'string', description: 'Optional piece ID to filter by / ID de pieza opcional para filtrar' },
    },
  },
  execute: async (
    _params: Record<string, unknown>,
    _dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<ToolResult> => {
    const state = getState();
    let trims = state.project.trims;
    if (_params.pieceId) {
      trims = trims.filter(t => t.pieceId === _params.pieceId);
    }

    return {
      success: true,
      data: {
        trims: trims.map(t => ({
          id: t.id,
          pieceId: t.pieceId,
          type: t.type,
          name: t.name,
          placement: t.placement,
          material: t.material,
          color: t.color,
          size: t.size,
          unitCost: t.unitCost,
          active: t.active,
        })),
        count: trims.length,
      },
    };
  },
};

// ─── listTrimPresets ────────────────────────────────────────────────────────

const listTrimPresetsTool: ToolDefinition = {
  name: 'listTrimPresets',
  description:
    'List available trim presets from the built-in library, optionally filtered by type or search query. ' +
    '/ Listar los presets de avios disponibles en la biblioteca, opcionalmente filtrados por tipo o busqueda.',
  parameters: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['button', 'zipper', 'snap', 'rivet', 'buckle', 'ring', 'hook-eye', 'drawstring-stop', 'custom'],
        description: 'Filter by trim type / Filtrar por tipo de avio',
      },
      query: {
        type: 'string',
        description: 'Search by name, tag, or material / Buscar por nombre, etiqueta o material',
      },
    },
  },
  execute: async (
    params: Record<string, unknown>,
    _dispatch: AppDispatch,
    _getState: () => RootState,
  ): Promise<ToolResult> => {
    let presets;

    if (params.query) {
      presets = searchTrimPresets(params.query as string);
    } else if (params.type) {
      presets = getTrimPresetsByType(params.type as string);
    } else {
      presets = [...TRIM_LIBRARY];
    }

    return {
      success: true,
      data: {
        presets: presets.map(p => ({
          id: p.id,
          name: p.name,
          nameEs: p.nameEs,
          type: p.type,
          material: p.material,
          color: p.color,
          size: p.size,
          unitCost: p.unitCost,
          tags: p.tags,
        })),
        count: presets.length,
      },
    };
  },
};

// ─── distributeTrimAlongEdge ───────────────────────────────────────────────

const distributeTrimAlongEdgeTool: ToolDefinition = {
  name: 'distributeTrimAlongEdge',
  description:
    'Distribute N trims evenly along a named semantic edge. Creates a single trim with edge-points placement. ' +
    '/ Distribuir N avios uniformemente a lo largo de un borde semantico nombrado.',
  parameters: {
    type: 'object',
    properties: {
      pieceId: { type: 'string', description: 'Piece ID / ID de la pieza' },
      edgeName: { type: 'string', description: 'Edge name / Nombre del borde' },
      presetId: { type: 'string', description: 'Optional preset ID / ID de preset opcional' },
      count: { type: 'number', description: 'Number of trims to distribute (2-20) / Cantidad de avios (2-20)' },
      startOffset: { type: 'number', description: 'Start offset in mm (default 10) / Desplazamiento inicial en mm (defecto 10)' },
      endOffset: { type: 'number', description: 'End offset in mm (default 10) / Desplazamiento final en mm (defecto 10)' },
    },
    required: ['pieceId', 'edgeName', 'count'],
  },
  execute: async (
    params: Record<string, unknown>,
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<ToolResult> => {
    const state = getState();
    const piece = state.project.pieces.find(p => p.id === params.pieceId);
    if (!piece) return { success: false, error: `Piece "${params.pieceId}" not found` };

    const edgeName = params.edgeName as string;
    const edge = piece.edges?.find(e => e.name === edgeName);
    if (!edge) return { success: false, error: `Edge "${edgeName}" not found on piece "${params.pieceId}"` };

    const count = params.count as number;
    if (count < 2 || count > 20) return { success: false, error: 'count must be between 2 and 20' };

    const startOffset = (params.startOffset as number | undefined) ?? 10;
    const endOffset = (params.endOffset as number | undefined) ?? 10;

    const edgeLen = computeEdgeLengthMM(piece, edgeName);
    if (edgeLen <= 0) return { success: false, error: 'Edge has zero length' };

    const tStart = Math.min(startOffset / edgeLen, 0.49);
    const tEnd = Math.max(1 - endOffset / edgeLen, 0.51);

    const positions: number[] = [];
    for (let i = 0; i < count; i++) {
      positions.push(count === 1 ? (tStart + tEnd) / 2 : tStart + i * (tEnd - tStart) / (count - 1));
    }

    const preset = params.presetId ? getTrimPreset(params.presetId as string) : undefined;
    if (params.presetId && !preset) return { success: false, error: `Preset "${params.presetId}" not found` };

    const id = uid();
    const trim: Trim = {
      id,
      pieceId: params.pieceId as string,
      type: preset?.type ?? TRIM_DEFAULTS.type,
      presetId: params.presetId as string | undefined,
      name: preset?.name ?? TRIM_DEFAULTS.name,
      description: '',
      placement: { mode: 'edge-points', edgeName, positions },
      material: preset?.material ?? TRIM_DEFAULTS.material,
      color: preset?.color ?? TRIM_DEFAULTS.color,
      size: preset?.size ?? TRIM_DEFAULTS.size,
      unitCost: preset?.unitCost ?? TRIM_DEFAULTS.unitCost,
      active: true,
    };

    batchUndo(dispatch, 'Distribute trims along edge', () => {
      dispatch(addTrim(trim));
    });

    return {
      success: true,
      data: { trimId: id, pieceId: params.pieceId, edgeName, count, positions },
    };
  },
};

// ─── mirrorTrimsToSymmetric ────────────────────────────────────────────────

const mirrorTrimsToSymmetricTool: ToolDefinition = {
  name: 'mirrorTrimsToSymmetric',
  description:
    'Mirror trims from a piece to its linked symmetric piece. ' +
    'For edge-points trims, positions are mirrored (1-t). ' +
    '/ Espejo de avios de una pieza a su pieza simetrica vinculada.',
  parameters: {
    type: 'object',
    properties: {
      pieceId: { type: 'string', description: 'Source piece ID / ID de la pieza origen' },
      trimId: { type: 'string', description: 'Optional: mirror only this trim / Opcional: solo espejar este avio' },
    },
    required: ['pieceId'],
  },
  execute: async (
    params: Record<string, unknown>,
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<ToolResult> => {
    const state = getState();
    const piece = state.project.pieces.find(p => p.id === params.pieceId);
    if (!piece) return { success: false, error: `Piece "${params.pieceId}" not found` };

    if (!piece.linkedPieceId || piece.linkMode !== 'symmetry') {
      return { success: false, error: 'Piece has no symmetric linked piece' };
    }

    const targetPiece = state.project.pieces.find(p => p.id === piece.linkedPieceId);
    if (!targetPiece) return { success: false, error: `Linked piece "${piece.linkedPieceId}" not found` };

    let trimsToMirror = state.project.trims.filter(t => t.pieceId === piece.id && t.active);
    if (params.trimId) {
      trimsToMirror = trimsToMirror.filter(t => t.id === params.trimId);
      if (trimsToMirror.length === 0) return { success: false, error: `Trim "${params.trimId}" not found on piece` };
    }

    if (trimsToMirror.length === 0) return { success: false, error: 'No active trims to mirror' };

    const mirroredIds: string[] = [];

    batchUndo(dispatch, 'Mirror trims to symmetric piece', () => {
      for (const trim of trimsToMirror) {
        const srcPlacement = trim.placement;
        let mirroredPlacement: typeof srcPlacement = srcPlacement;

        if (srcPlacement.mode === 'edge-points') {
          const targetEdge = targetPiece.edges?.find(e => e.name === srcPlacement.edgeName);
          if (!targetEdge) return;
          mirroredPlacement = {
            mode: 'edge-points',
            edgeName: srcPlacement.edgeName,
            positions: srcPlacement.positions.map(t => 1 - t),
          };
        } else if (srcPlacement.mode === 'edge') {
          const targetEdge = targetPiece.edges?.find(e => e.name === srcPlacement.edgeName);
          if (!targetEdge) return;
          mirroredPlacement = {
            mode: 'edge',
            edgeName: srcPlacement.edgeName,
            tStart: 1 - srcPlacement.tEnd,
            tEnd: 1 - srcPlacement.tStart,
          };
        }

        const mirroredId = uid();
        mirroredIds.push(mirroredId);

        dispatch(addTrim({
          ...trim,
          id: mirroredId,
          pieceId: targetPiece.id,
          placement: mirroredPlacement,
        }));
      }
    });

    return {
      success: true,
      data: { mirroredCount: mirroredIds.length, mirroredIds, targetPieceId: targetPiece.id },
    };
  },
};

// ─── Export ──────────────────────────────────────────────────────────────────

export const tools: ToolDefinition[] = [
  addTrimTool,
  removeTrimTool,
  updateTrimTool,
  listTrimsTool,
  listTrimPresetsTool,
  distributeTrimAlongEdgeTool,
  mirrorTrimsToSymmetricTool,
];
