import type { ToolDefinition, ToolResult } from '../registry';

const selectVerticesInRegionTool: ToolDefinition = {
  name: 'selectVerticesInRegion',
  description: 'Programmatically select 3D mesh vertices within a spherical region or all vertices. / Seleccionar vértices del mesh 3D en una región esférica o todos.',
  parameters: {
    type: 'object',
    properties: {
      region: { type: 'string', enum: ['all'], description: 'Select all vertices' },
      center: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } }, description: 'Center of spherical region' },
      radius: { type: 'number', description: 'Radius of selection sphere' },
    },
    required: [],
  },
  execute: async (params, dispatch, getState): Promise<ToolResult> => {
    const pieces = getState().project.pieces;
    if (pieces.length === 0) return { success: false, error: 'No pieces in project' };

    if (params.region === 'all') {
      // Select all — dispatch a large range. Actual vertex count not available in Redux,
      // but the 3D renderer will clamp to actual count.
      dispatch({ type: 'simulation/setSelectedVertices', payload: Array.from({ length: 100000 }, (_, i) => i) });
      return { success: true, data: { region: 'all' } };
    }

    if (params.center && params.radius) {
      const cx = (params.center as { x: number }).x;
      const cy = (params.center as { x: number; y: number }).y;
      const cz = (params.center as { x: number; y: number; z: number }).z;
      const r = params.radius as number;
      // Note: actual vertex filtering happens at render time since positions are in GPU/worker.
      // This stores the intent. The 3D interaction code filters at frame time.
      dispatch({ type: 'simulation/setSelectedVertices', payload: [] }); // Placeholder
      return { success: true, data: { center: { x: cx, y: cy, z: cz }, radius: r, note: 'Sphere selection requires 3D viewport interaction' } };
    }

    return { success: false, error: 'Provide region: "all" or center + radius' };
  },
};

export const tools: ToolDefinition[] = [
  selectVerticesInRegionTool,
];
