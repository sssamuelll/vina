/**
 * Meta-Tools Module — Read-only query tools for agentic planning
 *
 * Meta-tools allow the LLM to inspect garment state during the planning
 * phase before generating execution plans. They never modify state.
 *
 * @module meta-tools
 */

// Types
export type {
  MetaToolDefinition,
  MetaToolResult,
  GarmentPieceSummary,
  GarmentStateResult,
  EdgeInfo,
  PieceDetailsResult,
  EdgeMeasurementResult,
  PieceSearchResult,
} from './types';

// Meta-tool instances
export { getGarmentStateTool } from './getGarmentState';
export { getPieceDetailsTool } from './getPieceDetails';
export { measureEdgeTool } from './measureEdge';
export { searchPiecesTool } from './searchPieces';
export { getFitMapStatsTool } from './getFitMapStats';
export { getFitMapByPieceTool } from './getFitMapByPiece';

import type { MetaToolDefinition } from './types';
import { getGarmentStateTool } from './getGarmentState';
import { getPieceDetailsTool } from './getPieceDetails';
import { measureEdgeTool } from './measureEdge';
import { searchPiecesTool } from './searchPieces';
import { getFitMapStatsTool } from './getFitMapStats';
import { getFitMapByPieceTool } from './getFitMapByPiece';

/**
 * Returns all registered meta-tools as an array.
 * Used by the planner to present available query tools to the LLM.
 */
export function getAllMetaTools(): MetaToolDefinition[] {
  return [
    getGarmentStateTool,
    getPieceDetailsTool,
    measureEdgeTool,
    searchPiecesTool,
    getFitMapStatsTool,
    getFitMapByPieceTool,
  ];
}
