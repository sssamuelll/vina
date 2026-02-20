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
      const { downloadDXFAAMA } = await import('../../../utils/dxf/exportAAMA');
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
      const { downloadPDF } = await import('../../../utils/exportPDF');
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
      const { downloadOBJ } = await import('../../../utils/export/exportOBJ');
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
      const { downloadProjectFile } = await import('../../../utils/projectIO');
      const filename = (params.filename as string) || state.project.name || 'project';
      downloadProjectFile(state.project, filename);

      return { success: true, data: { filename: filename + '.openclo' } };
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
  saveProjectTool,
];
