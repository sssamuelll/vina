/**
 * Compound Tools — high-level operations that orchestrate multiple lower-level tools.
 * @module compound
 */

export { transformPieceTool } from './transformPiece';

import type { ToolDefinition } from '../../registry';
import { transformPieceTool } from './transformPiece';

export const tools: ToolDefinition[] = [
  transformPieceTool,
];
