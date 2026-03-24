import type { ToolDefinition, ToolResult } from '../registry';

const addAnnotationTool: ToolDefinition = {
  name: 'addPieceAnnotation',
  description: 'Add a production annotation (cutting instruction, sewing note, QC mark) to a pattern piece. / Añadir una anotación de producción a una pieza.',
  parameters: {
    type: 'object',
    properties: {
      pieceId: { type: 'string', description: 'ID of the piece' },
      text: { type: 'string', description: 'Annotation text (e.g. "CUT 2 ON FOLD", "INTERFACE")' },
      category: { type: 'string', enum: ['cutting', 'sewing', 'qc', 'general'], description: 'Category (default: general)' },
      position: { type: 'string', enum: ['center', 'top', 'bottom'], description: 'Position on piece (default: center)' },
    },
    required: ['pieceId', 'text'],
  },
  execute: async (params, dispatch, getState): Promise<ToolResult> => {
    const piece = getState().project.pieces.find((p: { id: string }) => p.id === params.pieceId);
    if (!piece) return { success: false, error: `Piece "${params.pieceId}" not found` };

    const annotation = {
      id: 'ann-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      text: params.text as string,
      position: (params.position as string) || 'center',
      category: (params.category as string) || 'general',
      fontSize: 8,
    };

    dispatch({ type: 'project/addAnnotation', payload: { pieceId: params.pieceId, annotation } });

    return {
      success: true,
      data: { pieceId: params.pieceId, annotationId: annotation.id, text: annotation.text },
      rollback: () => dispatch({ type: 'project/removeAnnotation', payload: { pieceId: params.pieceId, annotationId: annotation.id } }),
    };
  },
};

const removeAnnotationTool: ToolDefinition = {
  name: 'removeAnnotation',
  description: 'Remove an annotation from a pattern piece. / Eliminar una anotación de una pieza.',
  parameters: {
    type: 'object',
    properties: {
      pieceId: { type: 'string', description: 'ID of the piece' },
      annotationId: { type: 'string', description: 'ID of the annotation to remove' },
    },
    required: ['pieceId', 'annotationId'],
  },
  execute: async (params, dispatch, getState): Promise<ToolResult> => {
    const piece = getState().project.pieces.find((p: { id: string; annotations?: { id: string; text: string }[] }) => p.id === params.pieceId);
    if (!piece) return { success: false, error: `Piece "${params.pieceId}" not found` };

    const ann = piece.annotations?.find((a: { id: string }) => a.id === params.annotationId);
    if (!ann) return { success: false, error: `Annotation "${params.annotationId}" not found` };

    const snapshot = { ...ann };
    dispatch({ type: 'project/removeAnnotation', payload: { pieceId: params.pieceId, annotationId: params.annotationId } });

    return {
      success: true,
      data: { pieceId: params.pieceId, removed: snapshot.text },
      rollback: () => dispatch({ type: 'project/addAnnotation', payload: { pieceId: params.pieceId, annotation: snapshot } }),
    };
  },
};

const listAnnotationTemplatesTool: ToolDefinition = {
  name: 'listAnnotationTemplates',
  description: 'List available annotation templates for production patterns. / Listar plantillas de anotación disponibles.',
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
  execute: async (): Promise<ToolResult> => {
    const { ANNOTATION_TEMPLATES } = await import('../../../../utils/annotationTemplates');
    return {
      success: true,
      data: {
        templates: ANNOTATION_TEMPLATES.map(t => ({ text: t.text, category: t.category })),
        count: ANNOTATION_TEMPLATES.length,
      },
    };
  },
};

export const tools: ToolDefinition[] = [
  addAnnotationTool,
  removeAnnotationTool,
  listAnnotationTemplatesTool,
];
