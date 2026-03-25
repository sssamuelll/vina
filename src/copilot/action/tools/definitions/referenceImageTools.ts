/**
 * Copilot tools for reference image management.
 */

import type { ToolDefinition, ToolResult } from '../registry';
import type { AppDispatch, RootState } from '../../../../store';

export const tools: ToolDefinition[] = [
  {
    name: 'setReferenceImageOpacity',
    description:
      'Set opacity of a reference image / Establecer opacidad de imagen de referencia',
    parameters: {
      type: 'object',
      properties: {
        imageId: { type: 'string', description: 'Reference image ID' },
        opacity: { type: 'number', description: 'Opacity 0.0–1.0' },
      },
      required: ['imageId', 'opacity'],
    },
    execute: async (
      params: Record<string, unknown>,
      dispatch: AppDispatch,
      getState: () => RootState,
    ): Promise<ToolResult> => {
      const state = getState();
      const img = state.project.referenceImages.find(i => i.id === params.imageId);
      if (!img) return { success: false, error: 'Reference image not found' };
      const opacity = Math.max(0, Math.min(1, params.opacity as number));
      const { updateReferenceImage } = await import('../../../../store/projectSlice');
      dispatch(updateReferenceImage({ id: params.imageId as string, opacity }));
      return { success: true, data: { imageId: params.imageId, opacity } };
    },
  },

  {
    name: 'toggleReferenceImages',
    description:
      'Show or hide all reference images / Mostrar u ocultar todas las imágenes de referencia',
    parameters: {
      type: 'object',
      properties: {
        visible: { type: 'boolean', description: 'true to show, false to hide' },
      },
      required: ['visible'],
    },
    execute: async (
      params: Record<string, unknown>,
      dispatch: AppDispatch,
    ): Promise<ToolResult> => {
      const { setShowReferenceImages } = await import('../../../../store/editorSlice');
      dispatch(setShowReferenceImages(params.visible as boolean));
      return { success: true, data: { visible: params.visible } };
    },
  },

  {
    name: 'removeReferenceImage',
    description:
      'Remove a reference image from the project / Eliminar imagen de referencia del proyecto',
    parameters: {
      type: 'object',
      properties: {
        imageId: { type: 'string', description: 'Reference image ID to remove' },
      },
      required: ['imageId'],
    },
    execute: async (
      params: Record<string, unknown>,
      dispatch: AppDispatch,
      getState: () => RootState,
    ): Promise<ToolResult> => {
      const state = getState();
      const img = state.project.referenceImages.find(i => i.id === params.imageId);
      if (!img) return { success: false, error: 'Reference image not found' };
      const { removeReferenceImage } = await import('../../../../store/projectSlice');
      dispatch(removeReferenceImage(params.imageId as string));
      return { success: true, data: { removedId: params.imageId, filename: img.filename } };
    },
  },
];
