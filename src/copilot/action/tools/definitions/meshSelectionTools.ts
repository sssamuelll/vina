import type { ToolDefinition, ToolResult } from '../registry';

const selectVerticesInRegionTool: ToolDefinition = {
  name: 'selectVerticesInRegion',
  description: 'Select all 3D mesh vertices or clear the selection. Sphere selection requires interactive 3D viewport use. / Seleccionar todos los vértices o limpiar la selección.',
  parameters: {
    type: 'object',
    properties: {
      region: { type: 'string', enum: ['all', 'none'], description: 'Select all vertices or clear selection' },
    },
    required: ['region'],
  },
  execute: async (params, dispatch): Promise<ToolResult> => {
    if (params.region === 'none') {
      dispatch({ type: 'simulation/clearSelectedVertices' });
      return { success: true, data: { region: 'none', cleared: true } };
    }

    if (params.region === 'all') {
      // Dispatch a sentinel value (-1) meaning "select all".
      // The SelectedVertexRenderer interprets this as all valid vertices.
      dispatch({ type: 'simulation/setSelectedVertices', payload: [-1] });
      return { success: true, data: { region: 'all' } };
    }

    return { success: false, error: 'Provide region: "all" or "none"' };
  },
};

export const tools: ToolDefinition[] = [
  selectVerticesInRegionTool,
];
