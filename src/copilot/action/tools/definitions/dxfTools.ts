/**
 * Copilot tools for DXF file operations.
 */

import type { ToolDefinition, ToolResult } from '../registry';

export const tools: ToolDefinition[] = [
  {
    name: 'detectDXFFormat',
    description:
      'Detect the format of the most recently imported DXF file (AAMA, ASTM, Gerber, Lectra, standard). A DXF file must have been imported first.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
    execute: async (): Promise<ToolResult> => {
      const { getLastParsedDoc } = await import('../../../../utils/dxf/parser');
      const doc = getLastParsedDoc();
      if (!doc) return { success: false, error: 'No DXF file has been imported yet' };
      const { detectDXFFormat } = await import('../../../../utils/dxf/formatDetector');
      const formats = detectDXFFormat(doc);
      return { success: true, data: { formats } };
    },
  },
];
