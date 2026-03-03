/**
 * Meta-Tool Type Definitions for Agentic Planning
 *
 * Meta-tools are read-only query functions that the LLM can call during the
 * planning phase to inspect garment state before generating an execution plan.
 * Unlike action tools, meta-tools never modify state.
 *
 * @module MetaToolTypes
 */

import type { ToolParametersSchema } from '../../../action/tools/registry';
import type { RootState } from '../../../../store';

// ─── Core Meta-Tool Types ────────────────────────────────────────────────────

/**
 * Definition for a read-only meta-tool that queries garment state.
 *
 * Unlike ToolDefinition (which takes dispatch + getState), meta-tools only
 * receive getState since they never modify state.
 */
export interface MetaToolDefinition {
  /** Unique meta-tool name (e.g. 'getGarmentState') */
  name: string;
  /** Description for the LLM explaining what this meta-tool returns */
  description: string;
  /** JSON Schema for parameters in OpenAI function calling format */
  parameters: ToolParametersSchema;
  /** Execute the meta-tool — read-only, no dispatch needed */
  execute: (
    params: Record<string, unknown>,
    getState: () => RootState,
  ) => Promise<MetaToolResult>;
}

/**
 * Result returned by a meta-tool execution.
 */
export interface MetaToolResult {
  /** Whether the query executed successfully */
  success: boolean;
  /** Result data (tool-specific) */
  data?: Record<string, unknown>;
  /** Error message if success is false */
  error?: string;
}

// ─── Garment State Query Results ─────────────────────────────────────────────

/**
 * Summary of a single garment piece, returned by getGarmentState.
 */
export interface GarmentPieceSummary {
  /** Unique piece identifier */
  id: string;
  /** Human-readable piece name */
  name: string;
  /** Piece category (e.g. 'bodice', 'sleeve', 'skirt') */
  category?: string;
  /** Side designation (e.g. 'front', 'back') */
  side?: string;
  /** Edge names belonging to this piece */
  edges: string[];
  /** Piece area in mm^2 */
  area: number;
  /** Piece perimeter in mm */
  perimeter: number;
}

/**
 * Result of querying the full garment state.
 */
export interface GarmentStateResult {
  /** All pieces in the garment */
  pieces: GarmentPieceSummary[];
  /** Seam connections between pieces */
  seams: Array<{ id: string; pieceAId: string; pieceBId: string }>;
  /** Total number of pieces */
  pieceCount: number;
}

// ─── Piece Detail Results ────────────────────────────────────────────────────

/**
 * Information about a single edge within a piece.
 */
export interface EdgeInfo {
  /** Edge name (e.g. 'neckline', 'shoulder') */
  name: string;
  /** Edge length in mm */
  length: number;
  /** Edge geometry type (e.g. 'straight', 'curve', 'spline') */
  edgeType: string;
}

/**
 * Detailed information about a specific piece, returned by getPieceDetails.
 */
export interface PieceDetailsResult {
  /** Unique piece identifier */
  id: string;
  /** Human-readable piece name */
  name: string;
  /** All edges with their measurements */
  edges: EdgeInfo[];
  /** Darts on this piece */
  darts: Array<{ id: string; position: string }>;
  /** Bounding box dimensions in mm */
  dimensions: { width: number; height: number };
  /** Piece category (e.g. 'bodice', 'sleeve', 'skirt') */
  category?: string;
  /** Side designation (e.g. 'front', 'back') */
  side?: string;
}

// ─── Measurement Results ─────────────────────────────────────────────────────

/**
 * Result of measuring a specific edge.
 */
export interface EdgeMeasurementResult {
  /** Piece the edge belongs to */
  pieceId: string;
  /** Name of the measured edge */
  edgeName: string;
  /** Measured length */
  length: number;
  /** Unit of measurement (e.g. 'mm', 'cm') */
  unit: string;
}

// ─── Search Results ──────────────────────────────────────────────────────────

/**
 * Result of searching for pieces by name, category, or other criteria.
 */
export interface PieceSearchResult {
  /** Matched pieces sorted by relevance score (descending) */
  matches: Array<{
    /** Piece identifier */
    pieceId: string;
    /** Piece name */
    pieceName: string;
    /** Relevance score (0-1) */
    score: number;
    /** Explanation for why this piece matched */
    reason: string;
  }>;
}
