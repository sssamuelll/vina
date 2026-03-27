import type { ToolDefinition, ToolResult } from '../registry';

const setPlacementRuleTool: ToolDefinition = {
  name: 'setPlacementRule',
  description: 'Add a pre-marking placement rule to a pattern piece for nesting. / Agregar regla de colocación pre-marcado para anidamiento.',
  parameters: {
    type: 'object',
    properties: {
      pieceId: { type: 'string', description: 'ID of the piece' },
      ruleType: { type: 'string', enum: ['atFold', 'atEdge', 'pairWith', 'minDistance', 'priority', 'grainTilt'], description: 'Rule type' },
      value: { type: 'number', description: 'Numeric value (priority, distance mm, tilt degrees)' },
      targetPieceId: { type: 'string', description: 'Target piece for pairWith/minDistance' },
      edge: { type: 'string', enum: ['left', 'right'], description: 'Edge for atEdge rule' },
    },
    required: ['pieceId', 'ruleType'],
  },
  execute: async (params, dispatch, getState): Promise<ToolResult> => {
    const piece = getState().project.pieces.find((p: { id: string }) => p.id === params.pieceId);
    if (!piece) return { success: false, error: `Piece "${params.pieceId}" not found` };
    const rule: Record<string, unknown> = { type: params.ruleType };
    if (params.value !== undefined) rule.value = params.value;
    if (params.targetPieceId) rule.targetPieceId = params.targetPieceId;
    if (params.edge) rule.edge = params.edge;
    dispatch({ type: 'project/addPlacementRule', payload: { pieceId: params.pieceId, rule } });
    return { success: true, data: { pieceId: params.pieceId, rule } };
  },
};

const removePlacementRuleTool: ToolDefinition = {
  name: 'removePlacementRule',
  description: 'Remove a placement rule from a piece by index. / Eliminar regla de colocación por índice.',
  parameters: {
    type: 'object',
    properties: {
      pieceId: { type: 'string', description: 'ID of the piece' },
      ruleIndex: { type: 'number', description: 'Index of the rule to remove (0-based)' },
    },
    required: ['pieceId', 'ruleIndex'],
  },
  execute: async (params, dispatch, getState): Promise<ToolResult> => {
    const piece = getState().project.pieces.find((p: { id: string; placementRules?: unknown[] }) => p.id === params.pieceId);
    if (!piece) return { success: false, error: `Piece "${params.pieceId}" not found` };
    dispatch({ type: 'project/removePlacementRule', payload: { pieceId: params.pieceId, ruleIndex: params.ruleIndex } });
    return { success: true, data: { pieceId: params.pieceId, removedIndex: params.ruleIndex } };
  },
};

const listPlacementRulesTool: ToolDefinition = {
  name: 'listPlacementRules',
  description: 'List all placement rules for all pieces. / Listar reglas de colocación de todas las piezas.',
  parameters: { type: 'object', properties: {}, required: [] },
  execute: async (_params, _dispatch, getState): Promise<ToolResult> => {
    const pieces = getState().project.pieces as Array<{ id: string; name: string; placementRules?: unknown[] }>;
    const result: Record<string, unknown[]> = {};
    for (const p of pieces) {
      if (p.placementRules && p.placementRules.length > 0) {
        result[`${p.name} (${p.id})`] = p.placementRules;
      }
    }
    return { success: true, data: { rules: result, totalPieces: pieces.length } };
  },
};

export const tools: ToolDefinition[] = [setPlacementRuleTool, removePlacementRuleTool, listPlacementRulesTool];
