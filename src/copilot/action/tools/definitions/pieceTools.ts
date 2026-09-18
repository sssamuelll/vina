/**
 * Piece Operations — tools for creating, modifying, and transforming pattern pieces.
 * Operaciones de Pieza — herramientas para crear, modificar y transformar piezas de patrón.
 *
 * @module pieceTools
 */

import type { ToolDefinition, ToolResult } from '../registry';
import type { AppDispatch, RootState } from '../../../../store';
import { addPiece, updatePiece, removePiece, movePiece, rotatePiece } from '../../../../store/projectSlice';
import { selectPiece } from '../../../../store/editorSlice';
import type { PatternPiece, PathCommand } from '../../../../types/types';
import { uid } from '../../../../utils/pathHelpers';
import { lockedPieceError } from './patternOpsTools';

/** Compute bounding box from outline */
function computeBounds(outline: PathCommand[]): { width: number; height: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const cmd of outline) {
    for (let i = 0; i < cmd.values.length - 1; i += 2) {
      minX = Math.min(minX, cmd.values[i]);
      minY = Math.min(minY, cmd.values[i + 1]);
      maxX = Math.max(maxX, cmd.values[i]);
      maxY = Math.max(maxY, cmd.values[i + 1]);
    }
  }
  if (!isFinite(minX)) return { width: 0, height: 0 };
  return { width: Math.round(maxX - minX), height: Math.round(maxY - minY) };
}

// ─── createPiece ────────────────────────────────────────────────────────────

const createPieceTool: ToolDefinition = {
  name: 'createPiece',
  description:
    'Create a new pattern piece from an SVG outline on the canvas. ' +
    'For real garments, the user imports their own DXF pattern instead. ' +
    '/ Crear una nueva pieza de patrón desde un contorno SVG. ' +
    'Para prendas reales, el usuario importa su propio patrón DXF.',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Piece name / Nombre de la pieza (e.g. "Front Bodice", "Delantero Corpiño")' },
      outline: {
        type: 'array',
        description: 'SVG PathCommand array defining the piece shape. 1 unit = 1mm / Array de PathCommand SVG. 1 unidad = 1mm',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['M', 'L', 'C', 'Q', 'Z'] },
            values: { type: 'array', items: { type: 'number' } },
          },
        },
      },
      position: {
        type: 'object',
        properties: {
          x: { type: 'number' },
          y: { type: 'number' },
        },
      },
      seamAllowance: { type: 'number', description: 'Seam allowance in mm. Pieces are born NET (0) — only set when the user explicitly asks for an allowance / Margen de costura en mm. Las piezas nacen en NETO (0) — solo asignar si el usuario lo pide explícitamente' },
      mirrored: { type: 'boolean', description: 'Whether piece is mirrored / Si la pieza está espejada' },
    },
    // `name` NO va en required: el cuerpo lo rellena con 'New Piece' si falta
    // (línea ~76). Mientras nadie validaba daba igual; con la guardia de #1189
    // encendida, declararlo required apagaría una llamada que hoy funciona.
    required: [],
  },
  execute: async (
    params: Record<string, unknown>,
    dispatch: AppDispatch,
    _getState: () => RootState,
  ): Promise<ToolResult> => {
    try {
      if (params.outline) {
        const piece: PatternPiece = {
          id: uid(),
          name: (params.name as string) || 'New Piece',
          outline: params.outline as PathCommand[],
          internals: [],
          position: (params.position as { x: number; y: number }) || { x: 50, y: 50 },
          rotation: 0,
          mirrored: (params.mirrored as boolean) || false,
          seamAllowance: (params.seamAllowance as number) ?? 0, // born net (hallazgo #2)
          layer: 1,
          sublayer: 0,
          active: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        dispatch(addPiece(piece));
        dispatch(selectPiece(piece.id));

        return {
          success: true,
          data: {
            pieceId: piece.id,
            bounds: computeBounds(piece.outline),
          },
        };
      } else {
        return { success: false, error: 'Either template or outline must be provided' };
      }
    } catch (e: unknown) {
      return { success: false, error: (e as Error).message };
    }
  },
};

// ─── modifyOutline ──────────────────────────────────────────────────────────

const modifyOutlineTool: ToolDefinition = {
  name: 'modifyOutline',
  description:
    'Replace the outline of an existing pattern piece. / Reemplazar el contorno de una pieza de patrón existente.',
  parameters: {
    type: 'object',
    properties: {
      pieceId: { type: 'string', description: 'ID of the piece to modify / ID de la pieza a modificar' },
      outline: {
        type: 'array',
        description: 'New outline PathCommand array / Nuevo array de PathCommand para el contorno',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['M', 'L', 'C', 'Q', 'Z'] },
            values: { type: 'array', items: { type: 'number' } },
          },
        },
      },
    },
    required: ['pieceId', 'outline'],
  },
  execute: async (params, dispatch, getState): Promise<ToolResult> => {
    const state = getState();
    const piece = state.project.pieces.find(p => p.id === params.pieceId);
    if (!piece) return { success: false, error: `Piece "${params.pieceId}" not found` };
    const lockErr = lockedPieceError(piece, state);
    if (lockErr) return lockErr;

    const newOutline = params.outline as PathCommand[];
    dispatch(updatePiece({ ...piece, outline: newOutline, updatedAt: Date.now() }));

    return {
      success: true,
      data: { newBounds: computeBounds(newOutline) },
    };
  },
};

// ─── modifyPoint ────────────────────────────────────────────────────────────

const modifyPointTool: ToolDefinition = {
  name: 'modifyPoint',
  description:
    'Move a single control point on a piece outline. / Mover un solo punto de control en el contorno de una pieza.',
  parameters: {
    type: 'object',
    properties: {
      pieceId: { type: 'string', description: 'Piece ID / ID de la pieza' },
      pointIndex: { type: 'integer', description: 'Index in the outline PathCommand array / Índice en el array de PathCommand' },
      valueIndex: { type: 'integer', description: 'Index within the values array / Índice dentro del array de valores' },
      x: { type: 'number', description: 'New x coordinate in mm / Nueva coordenada x en mm' },
      y: { type: 'number', description: 'New y coordinate in mm / Nueva coordenada y en mm' },
    },
    required: ['pieceId', 'pointIndex', 'x', 'y'],
  },
  execute: async (params, dispatch, getState): Promise<ToolResult> => {
    const state = getState();
    const piece = state.project.pieces.find(p => p.id === params.pieceId);
    if (!piece) return { success: false, error: `Piece "${params.pieceId}" not found` };
    const lockErr = lockedPieceError(piece, state);
    if (lockErr) return lockErr;

    const pointIndex = params.pointIndex as number;
    if (pointIndex < 0 || pointIndex >= piece.outline.length) {
      return { success: false, error: `Point index ${pointIndex} out of range` };
    }

    const newOutline = piece.outline.map((cmd, i) => {
      if (i !== pointIndex) return cmd;
      const newValues = [...cmd.values];
      const vi = (params.valueIndex as number) ?? 0;
      // Set x and y at the specified value index
      if (vi >= 0 && vi + 1 < newValues.length) {
        newValues[vi] = params.x as number;
        newValues[vi + 1] = params.y as number;
      } else if (newValues.length >= 2) {
        newValues[newValues.length - 2] = params.x as number;
        newValues[newValues.length - 1] = params.y as number;
      }
      return { ...cmd, values: newValues };
    });

    dispatch(updatePiece({ ...piece, outline: newOutline, updatedAt: Date.now() }));
    return { success: true };
  },
};

// ─── deletePiece ────────────────────────────────────────────────────────────

const deletePieceTool: ToolDefinition = {
  name: 'deletePiece',
  description:
    'Remove a pattern piece from the project. / Eliminar una pieza de patrón del proyecto.',
  parameters: {
    type: 'object',
    properties: {
      pieceId: { type: 'string', description: 'ID of the piece to delete / ID de la pieza a eliminar' },
    },
    required: ['pieceId'],
  },
  execute: async (params, dispatch, getState): Promise<ToolResult> => {
    const state = getState();
    const piece = state.project.pieces.find(p => p.id === params.pieceId);
    if (!piece) return { success: false, error: `Piece "${params.pieceId}" not found` };
    const lockErr = lockedPieceError(piece, state);
    if (lockErr) return lockErr;

    dispatch(removePiece(params.pieceId as string));
    return { success: true };
  },
};

// ─── renamePiece ────────────────────────────────────────────────────────────

const renamePieceTool: ToolDefinition = {
  name: 'renamePiece',
  description:
    'Rename a pattern piece. / Renombrar una pieza de patrón.',
  parameters: {
    type: 'object',
    properties: {
      pieceId: { type: 'string', description: 'Piece ID / ID de la pieza' },
      name: { type: 'string', description: 'New name / Nuevo nombre' },
    },
    required: ['pieceId', 'name'],
  },
  execute: async (params, dispatch, getState): Promise<ToolResult> => {
    const state = getState();
    const piece = state.project.pieces.find(p => p.id === params.pieceId);
    if (!piece) return { success: false, error: `Piece "${params.pieceId}" not found` };
    const lockErr = lockedPieceError(piece, state);
    if (lockErr) return lockErr;

    dispatch(updatePiece({ ...piece, name: params.name as string, updatedAt: Date.now() }));
    return { success: true };
  },
};

// ─── scalePiece ─────────────────────────────────────────────────────────────

const scalePieceTool: ToolDefinition = {
  name: 'scalePiece',
  description:
    'Uniformly scale a pattern piece. 1.1 = 10% larger, 0.9 = 10% smaller. / Escalar uniformemente una pieza de patrón.',
  parameters: {
    type: 'object',
    properties: {
      pieceId: { type: 'string', description: 'Piece ID / ID de la pieza' },
      factor: { type: 'number', description: 'Scale factor (1.1 = 10% larger) / Factor de escala' },
    },
    required: ['pieceId', 'factor'],
  },
  execute: async (params, dispatch, getState): Promise<ToolResult> => {
    const state = getState();
    const piece = state.project.pieces.find(p => p.id === params.pieceId);
    if (!piece) return { success: false, error: `Piece "${params.pieceId}" not found` };
    const lockErr = lockedPieceError(piece, state);
    if (lockErr) return lockErr;

    const factor = params.factor as number;
    const scaled: PathCommand[] = piece.outline.map(c => ({
      ...c,
      values: c.values.map(v => v * factor),
    }));

    dispatch(updatePiece({ ...piece, outline: scaled, updatedAt: Date.now() }));
    return {
      success: true,
      data: { newBounds: computeBounds(scaled) },
    };
  },
};

// ─── movePiece ──────────────────────────────────────────────────────────────

const movePieceTool: ToolDefinition = {
  name: 'movePiece',
  description:
    'Move a pattern piece to a new position on the canvas. / Mover una pieza de patrón a una nueva posición en el lienzo.',
  parameters: {
    type: 'object',
    properties: {
      pieceId: { type: 'string', description: 'Piece ID / ID de la pieza' },
      x: { type: 'number', description: 'New x position in mm / Nueva posición x en mm' },
      y: { type: 'number', description: 'New y position in mm / Nueva posición y en mm' },
    },
    required: ['pieceId', 'x', 'y'],
  },
  execute: async (params, dispatch, getState): Promise<ToolResult> => {
    const state = getState();
    const piece = state.project.pieces.find(p => p.id === params.pieceId);
    if (!piece) return { success: false, error: `Piece "${params.pieceId}" not found` };
    const lockErr = lockedPieceError(piece, state);
    if (lockErr) return lockErr;

    dispatch(movePiece({ id: params.pieceId as string, x: params.x as number, y: params.y as number }));
    return { success: true };
  },
};

// ─── rotatePiece ────────────────────────────────────────────────────────────

const rotatePieceTool: ToolDefinition = {
  name: 'rotatePiece',
  description:
    'Rotate a pattern piece by a given number of degrees. / Rotar una pieza de patrón los grados indicados.',
  parameters: {
    type: 'object',
    properties: {
      pieceId: { type: 'string', description: 'Piece ID / ID de la pieza' },
      degrees: { type: 'number', description: 'Rotation in degrees / Rotación en grados' },
    },
    required: ['pieceId', 'degrees'],
  },
  execute: async (params, dispatch, getState): Promise<ToolResult> => {
    const state = getState();
    const piece = state.project.pieces.find(p => p.id === params.pieceId);
    if (!piece) return { success: false, error: `Piece "${params.pieceId}" not found` };
    const lockErr = lockedPieceError(piece, state);
    if (lockErr) return lockErr;

    dispatch(rotatePiece({ id: params.pieceId as string, rotation: params.degrees as number }));
    return { success: true };
  },
};

// ─── mirrorPiece ────────────────────────────────────────────────────────────

const mirrorPieceTool: ToolDefinition = {
  name: 'mirrorPiece',
  description:
    'Toggle mirror state of a pattern piece. / Alternar el espejado de una pieza de patrón.',
  parameters: {
    type: 'object',
    properties: {
      pieceId: { type: 'string', description: 'Piece ID / ID de la pieza' },
      mirrored: { type: 'boolean', description: 'Whether piece should be mirrored / Si la pieza debe estar espejada' },
    },
    required: ['pieceId', 'mirrored'],
  },
  execute: async (params, dispatch, getState): Promise<ToolResult> => {
    const state = getState();
    const piece = state.project.pieces.find(p => p.id === params.pieceId);
    if (!piece) return { success: false, error: `Piece "${params.pieceId}" not found` };
    const lockErr = lockedPieceError(piece, state);
    if (lockErr) return lockErr;

    dispatch(updatePiece({ ...piece, mirrored: params.mirrored as boolean, updatedAt: Date.now() }));
    return { success: true };
  },
};

// ─── Export ─────────────────────────────────────────────────────────────────

export const tools: ToolDefinition[] = [
  createPieceTool,
  modifyOutlineTool,
  modifyPointTool,
  deletePieceTool,
  renamePieceTool,
  scalePieceTool,
  movePieceTool,
  rotatePieceTool,
  mirrorPieceTool,
];
