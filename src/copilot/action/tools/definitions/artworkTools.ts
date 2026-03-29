/**
 * Artwork Tools — tools for adding, updating, and removing artwork images
 * (logos, prints, embroidery, labels) placed on pattern pieces.
 * Herramientas de Estampados — herramientas para agregar, actualizar y
 * eliminar imagenes de arte (logos, estampados, bordados, etiquetas)
 * colocadas sobre piezas de patron.
 *
 * @module artworkTools
 */

import type { ToolDefinition, ToolResult } from '../registry';
import type { AppDispatch, RootState } from '../../../../store';
import { addArtwork, updateArtwork, removeArtwork } from '../../../../store/projectSlice';
import type { PieceArtwork } from '../../../../types/artwork';

// ─── addArtwork ────────────────────────────────────────────────────────────

const addArtworkTool: ToolDefinition = {
  name: 'addArtwork',
  description:
    'Add an artwork image (logo, print, embroidery, label) to a pattern piece at a given position and size. ' +
    'Position is in mm relative to the piece center (0,0). ' +
    '/ Agregar una imagen de arte (logo, estampado, bordado, etiqueta) a una pieza de patron ' +
    'en una posicion y tamano dados. La posicion es en mm relativa al centro de la pieza (0,0).',
  parameters: {
    type: 'object',
    properties: {
      pieceId: { type: 'string', description: 'ID of the target piece / ID de la pieza destino' },
      imageId: { type: 'string', description: 'Blob reference ID for the artwork image / ID de referencia blob de la imagen' },
      filename: { type: 'string', description: 'Original filename (e.g. "logo.png") / Nombre de archivo original' },
      positionX: { type: 'number', description: 'X position in mm, relative to piece center (default 0) / Posicion X en mm (defecto 0)' },
      positionY: { type: 'number', description: 'Y position in mm, relative to piece center (default 0) / Posicion Y en mm (defecto 0)' },
      width: { type: 'number', description: 'Display width in mm / Ancho de visualizacion en mm' },
      height: { type: 'number', description: 'Display height in mm / Alto de visualizacion en mm' },
      rotation: { type: 'number', description: 'Rotation in degrees (default 0) / Rotacion en grados (defecto 0)' },
      opacity: { type: 'number', description: 'Opacity 0-1 (default 1) / Opacidad 0-1 (defecto 1)' },
    },
    required: ['pieceId', 'imageId', 'width', 'height'],
  },
  execute: async (
    params: Record<string, unknown>,
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<ToolResult> => {
    const state = getState();
    const piece = state.project.pieces.find(p => p.id === params.pieceId);
    if (!piece) return { success: false, error: `Piece "${params.pieceId}" not found` };

    const id = crypto.randomUUID();
    const artwork: PieceArtwork = {
      id,
      imageId: params.imageId as string,
      filename: (params.filename as string) || 'artwork.png',
      position: {
        x: (params.positionX as number) ?? 0,
        y: (params.positionY as number) ?? 0,
      },
      width: params.width as number,
      height: params.height as number,
      rotation: (params.rotation as number) ?? 0,
      opacity: (params.opacity as number) ?? 1,
    };

    dispatch(addArtwork({ pieceId: params.pieceId as string, artwork }));

    return {
      success: true,
      data: {
        pieceId: params.pieceId,
        artworkId: id,
        imageId: artwork.imageId,
        filename: artwork.filename,
      },
      rollback: () =>
        dispatch(removeArtwork({ pieceId: params.pieceId as string, artworkId: id })),
    };
  },
};

// ─── updateArtwork ─────────────────────────────────────────────────────────

const updateArtworkTool: ToolDefinition = {
  name: 'updateArtwork',
  description:
    'Update properties of an existing artwork on a pattern piece. ' +
    'Only the provided fields will be changed; omitted fields keep their current values. ' +
    '/ Actualizar las propiedades de un arte existente en una pieza de patron. ' +
    'Solo se cambiaran los campos proporcionados; los campos omitidos conservan sus valores actuales.',
  parameters: {
    type: 'object',
    properties: {
      pieceId: { type: 'string', description: 'ID of the piece / ID de la pieza' },
      artworkId: { type: 'string', description: 'ID of the artwork to update / ID del arte a actualizar' },
      positionX: { type: 'number', description: 'New X position in mm / Nueva posicion X en mm' },
      positionY: { type: 'number', description: 'New Y position in mm / Nueva posicion Y en mm' },
      width: { type: 'number', description: 'New display width in mm / Nuevo ancho en mm' },
      height: { type: 'number', description: 'New display height in mm / Nuevo alto en mm' },
      rotation: { type: 'number', description: 'New rotation in degrees / Nueva rotacion en grados' },
      opacity: { type: 'number', description: 'New opacity 0-1 / Nueva opacidad 0-1' },
    },
    required: ['pieceId', 'artworkId'],
  },
  execute: async (
    params: Record<string, unknown>,
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<ToolResult> => {
    const state = getState();
    const piece = state.project.pieces.find(p => p.id === params.pieceId);
    if (!piece) return { success: false, error: `Piece "${params.pieceId}" not found` };

    const existing = piece.artworks?.find((a: PieceArtwork) => a.id === params.artworkId);
    if (!existing) return { success: false, error: `Artwork "${params.artworkId}" not found on piece "${params.pieceId}"` };

    const changes: Partial<PieceArtwork> = {};
    if (params.positionX !== undefined || params.positionY !== undefined) {
      changes.position = {
        x: (params.positionX as number) ?? existing.position.x,
        y: (params.positionY as number) ?? existing.position.y,
      };
    }
    if (params.width !== undefined) changes.width = params.width as number;
    if (params.height !== undefined) changes.height = params.height as number;
    if (params.rotation !== undefined) changes.rotation = params.rotation as number;
    if (params.opacity !== undefined) changes.opacity = params.opacity as number;

    dispatch(updateArtwork({
      pieceId: params.pieceId as string,
      artworkId: params.artworkId as string,
      changes,
    }));

    return {
      success: true,
      data: {
        pieceId: params.pieceId,
        artworkId: params.artworkId,
        updated: changes,
      },
    };
  },
};

// ─── removeArtwork ─────────────────────────────────────────────────────────

const removeArtworkTool: ToolDefinition = {
  name: 'removeArtwork',
  description:
    'Remove an artwork image from a pattern piece. ' +
    '/ Eliminar una imagen de arte de una pieza de patron.',
  parameters: {
    type: 'object',
    properties: {
      pieceId: { type: 'string', description: 'ID of the piece / ID de la pieza' },
      artworkId: { type: 'string', description: 'ID of the artwork to remove / ID del arte a eliminar' },
    },
    required: ['pieceId', 'artworkId'],
  },
  execute: async (
    params: Record<string, unknown>,
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<ToolResult> => {
    const state = getState();
    const piece = state.project.pieces.find(p => p.id === params.pieceId);
    if (!piece) return { success: false, error: `Piece "${params.pieceId}" not found` };

    const existing = piece.artworks?.find((a: PieceArtwork) => a.id === params.artworkId);
    if (!existing) return { success: false, error: `Artwork "${params.artworkId}" not found on piece "${params.pieceId}"` };

    const snapshot = { ...existing };
    dispatch(removeArtwork({
      pieceId: params.pieceId as string,
      artworkId: params.artworkId as string,
    }));

    return {
      success: true,
      data: {
        pieceId: params.pieceId,
        artworkId: params.artworkId,
        removedFilename: snapshot.filename,
      },
      rollback: () =>
        dispatch(addArtwork({ pieceId: params.pieceId as string, artwork: snapshot })),
    };
  },
};

// ─── Export ─────────────────────────────────────────────────────────────────

export const tools: ToolDefinition[] = [addArtworkTool, updateArtworkTool, removeArtworkTool];
