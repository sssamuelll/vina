/**
 * Export Tools — DXF, PDF, OBJ export and project save.
 * Herramientas de Exportación — exportación DXF, PDF, OBJ y guardado de proyecto.
 *
 * @module exportTools
 */

import type { ToolDefinition, ToolResult } from '../registry';

// ─── exportDXF ──────────────────────────────────────────────────────────────

const exportDXFTool: ToolDefinition = {
  name: 'exportDXF',
  description:
    'Export pattern pieces to DXF format for cutting machines. Uses AAMA/ASTM D6673 standard layers. ' +
    '/ Exportar piezas de patrón a formato DXF para máquinas de corte. Usa capas estándar AAMA/ASTM D6673.',
  parameters: {
    type: 'object',
    properties: {
      pieceIds: {
        type: 'array',
        items: { type: 'string' },
        description: 'Pieces to export (default: all) / Piezas a exportar (defecto: todas)',
      },
      format: {
        type: 'string',
        enum: ['aama', 'legacy'],
        description: 'DXF format / Formato DXF',
      },
      includeSeamAllowance: { type: 'boolean', description: 'Include SA in export / Incluir margen de costura' },
      filename: { type: 'string', description: 'Output filename / Nombre del archivo' },
    },
  },
  execute: async (params, _dispatch, getState): Promise<ToolResult> => {
    const state = getState();
    const pieceIds = params.pieceIds as string[] | undefined;
    const pieces = pieceIds && pieceIds.length > 0
      ? state.project.pieces.filter(p => pieceIds.includes(p.id))
      : state.project.pieces;

    if (pieces.length === 0) {
      return { success: false, error: 'No pieces to export' };
    }

    const filename = (params.filename as string) || 'pattern.dxf';

    try {
      const { downloadDXFAAMA } = await import('../../../../utils/dxf/exportAAMA');
      downloadDXFAAMA(pieces, filename);

      return {
        success: true,
        data: {
          filename,
          piecesExported: pieces.length,
          layers: ['1 (CUT)', '4 (NOTCH)', '7 (GRAINLINE)', '8 (DRAW)', '11 (INTCUT)'],
        },
      };
    } catch (e: unknown) {
      return { success: false, error: (e as Error).message };
    }
  },
};

// ─── exportPDF ──────────────────────────────────────────────────────────────

const exportPDFTool: ToolDefinition = {
  name: 'exportPDF',
  description:
    'Export pattern pieces to PDF at 1:1 scale for plotting/printing. ' +
    '/ Exportar piezas de patrón a PDF a escala 1:1 para plotter/impresión.',
  parameters: {
    type: 'object',
    properties: {
      pieceIds: {
        type: 'array',
        items: { type: 'string' },
        description: 'Pieces to export (default: all) / Piezas a exportar (defecto: todas)',
      },
      filename: { type: 'string', description: 'Output filename / Nombre del archivo' },
    },
  },
  execute: async (params, _dispatch, getState): Promise<ToolResult> => {
    const state = getState();
    const pieceIds = params.pieceIds as string[] | undefined;
    const pieces = pieceIds && pieceIds.length > 0
      ? state.project.pieces.filter(p => pieceIds.includes(p.id))
      : state.project.pieces;

    if (pieces.length === 0) {
      return { success: false, error: 'No pieces to export' };
    }

    const filename = (params.filename as string) || 'pattern.pdf';

    try {
      const { downloadPDF } = await import('../../../../utils/exportPDF');
      downloadPDF(pieces, filename);

      return {
        success: true,
        data: { filename, piecesExported: pieces.length },
      };
    } catch (e: unknown) {
      return { success: false, error: (e as Error).message };
    }
  },
};

// ─── exportOBJ ──────────────────────────────────────────────────────────────

const exportOBJTool: ToolDefinition = {
  name: 'exportOBJ',
  description:
    'Export 3D garment mesh to OBJ format. / Exportar malla 3D de la prenda a formato OBJ.',
  parameters: {
    type: 'object',
    properties: {
      filename: { type: 'string', description: 'Output filename / Nombre del archivo' },
    },
  },
  execute: async (params, _dispatch, getState): Promise<ToolResult> => {
    const state = getState();
    const pieces = state.project.pieces;

    if (pieces.length === 0) {
      return { success: false, error: 'No pieces to export' };
    }

    const filename = (params.filename as string) || 'garment.obj';

    try {
      const { downloadOBJ } = await import('../../../../utils/export/exportOBJ');
      downloadOBJ(pieces, filename);

      return {
        success: true,
        data: { filename, piecesExported: pieces.length },
      };
    } catch (e: unknown) {
      return { success: false, error: (e as Error).message };
    }
  },
};

// ─── export3DOBJ ────────────────────────────────────────────────────────────

const export3DOBJTool: ToolDefinition = {
  name: 'export3DOBJ',
  description:
    'Export simulated 3D garment mesh to Wavefront OBJ for Blender/Maya/Rhino. ' +
    'Dispatches a custom event that the 3D viewport handles. ' +
    '/ Exportar malla 3D de prenda simulada a OBJ.',
  parameters: {
    type: 'object',
    properties: {
      filename: { type: 'string', description: 'Output filename (without .obj)' },
      scale: { type: 'number', description: 'Scale: mm→target (0.1=cm, 0.001=m). Default: 0.1' },
    },
  },
  execute: async (params): Promise<ToolResult> => {
    const filename = (params.filename as string) || 'garment-3d';
    const scale = (params.scale as number) || 0.1;
    window.dispatchEvent(new CustomEvent('openclo:export3d', {
      detail: { format: 'obj', filename, scale },
    }));
    return { success: true, data: { filename: `${filename}.obj`, format: 'OBJ', note: 'Export triggered via 3D viewport' } };
  },
};

// ─── export3DGLTF ───────────────────────────────────────────────────────────

const export3DGLTFTool: ToolDefinition = {
  name: 'export3DGLTF',
  description:
    'Export simulated 3D garment mesh to glTF/GLB for Blender/Unity/Unreal/web. ' +
    'Dispatches a custom event that the 3D viewport handles. ' +
    '/ Exportar malla 3D de prenda simulada a glTF/GLB.',
  parameters: {
    type: 'object',
    properties: {
      filename: { type: 'string', description: 'Output filename (without extension)' },
      binary: { type: 'boolean', description: 'Export as .glb (default true)' },
    },
  },
  execute: async (params): Promise<ToolResult> => {
    const filename = (params.filename as string) || 'garment-3d';
    const binary = (params.binary as boolean) ?? true;
    window.dispatchEvent(new CustomEvent('openclo:export3d', {
      detail: { format: binary ? 'glb' : 'gltf', filename, binary },
    }));
    return { success: true, data: { filename: `${filename}.${binary ? 'glb' : 'gltf'}`, format: binary ? 'GLB' : 'glTF' } };
  },
};

// ─── saveProject ────────────────────────────────────────────────────────────

const saveProjectTool: ToolDefinition = {
  name: 'saveProject',
  description:
    'Save the current project to an .openclo file. / Guardar el proyecto actual en un archivo .openclo.',
  parameters: {
    type: 'object',
    properties: {
      filename: { type: 'string', description: 'Filename for the project / Nombre del archivo del proyecto' },
    },
  },
  execute: async (params, _dispatch, getState): Promise<ToolResult> => {
    const state = getState();

    try {
      const { downloadProjectFile } = await import('../../../../utils/projectIO');
      const filename = (params.filename as string) || state.project.name || 'project';
      downloadProjectFile(state.project, filename);

      return { success: true, data: { filename: filename + '.openclo' } };
    } catch (e: unknown) {
      return { success: false, error: (e as Error).message };
    }
  },
};

// ─── exportBOM ──────────────────────────────────────────────────────────────

const exportBOMTool: ToolDefinition = {
  name: 'exportBOM',
  description:
    'Export a Bill of Materials (BOM) as CSV. Lists all pieces with fabric, area, seam allowance, dimensions. ' +
    '/ Exportar lista de materiales (BOM) como CSV.',
  parameters: {
    type: 'object',
    properties: {
      filename: { type: 'string', description: 'Output filename / Nombre del archivo' },
    },
  },
  execute: async (params, _dispatch, getState): Promise<ToolResult> => {
    const state = getState();
    const pieces = state.project.pieces;
    const seams = state.project.seams;
    const fabrics = state.project.fabrics;

    if (pieces.length === 0) {
      return { success: false, error: 'No pieces to export' };
    }

    const filename = (params.filename as string) || 'bom.csv';

    try {
      const { downloadBOM } = await import('../../../../utils/export/bomExport');
      downloadBOM(pieces, seams, fabrics, filename);
      return {
        success: true,
        data: { filename, piecesExported: pieces.length },
      };
    } catch (e: unknown) {
      return { success: false, error: (e as Error).message };
    }
  },
};

// ─── Export ─────────────────────────────────────────────────────────────────

export const tools: ToolDefinition[] = [
  exportDXFTool,
  exportPDFTool,
  exportOBJTool,
  export3DOBJTool,
  export3DGLTFTool,
  saveProjectTool,
  exportBOMTool,
];
