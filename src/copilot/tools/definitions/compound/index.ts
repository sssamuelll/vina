/**
 * Compound Tools — high-level operations that orchestrate multiple lower-level tools.
 * @module compound
 */

export { generateFromDescriptionTool } from './generateFromDescription';
export { transformPieceTool } from './transformPiece';

import type { ToolDefinition } from '../../registry';
import { generateFromDescriptionTool } from './generateFromDescription';
import { transformPieceTool } from './transformPiece';

export const tools: ToolDefinition[] = [
  generateFromDescriptionTool,
  transformPieceTool,
];
