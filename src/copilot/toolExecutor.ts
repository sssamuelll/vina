/**
 * @deprecated This module is deprecated in favor of the AgenticLoop system.
 * See: src/copilot/reasoning/bridge/AgenticLoop.ts for the new implementation.
 * This file will be removed in a future version.
 */

/**
 * Tool Executor — takes tool_calls from LLM responses, validates, and executes sequentially.
 *
 * Includes post-execution audits for geometry-modifying tools:
 * - Area integrity (ensures piece has valid positive area)
 * - Self-intersection detection (ensures outline doesn't cross itself)
 *
 * @module toolExecutor
 */

import type { AppDispatch, RootState } from '../store';
import type { PatternPiece } from '../types/types';
import { ToolRegistry, ToolResult } from './action/tools/registry';
import { checkAreaIntegrity, checkSelfIntersection, formatAuditResultsForLLM } from './perception';
import type { AuditResult } from './perception/types';

/**
 * A tool call from the LLM response.
 */
export interface LLMToolCall {
  /** Unique ID for this tool call (from the LLM) */
  id: string;
  /** Tool name to execute */
  name: string;
  /** Parameters parsed from LLM JSON */
  arguments: Record<string, unknown>;
}

/**
 * Result of a single tool execution.
 */
export interface ToolExecutionResult {
  /** The original tool call ID */
  toolCallId: string;
  /** Tool name */
  toolName: string;
  /** Execution result */
  result: ToolResult;
}

/**
 * Result of executing all tool calls.
 */
export interface ExecutionBatchResult {
  /** All individual results */
  results: ToolExecutionResult[];
  /** Number of successful executions */
  succeeded: number;
  /** Number of failed executions */
  failed: number;
  /** Post-execution audit warnings (if any geometry issues detected) */
  auditWarnings?: string;
}

/** Tools that modify piece geometry and should be audited */
const GEOMETRY_MODIFYING_TOOLS = new Set([
  'createPiece',
  'updatePiece',
  'movePiece',
  'resizePiece',
  'rotatePiece',
  'mirrorPiece',
  'addDart',
  'removeDart',
  'adjustDart',
  'addEase',
  'modifyEdge',
  'modifyDimension',
  'wrapConstruction',
  'generateBodice',
  'generateSleeve',
  'generateSkirt',
  'generatePants',
  'generateCollar',
  'generateCuff',
]);

/**
 * Run post-execution audits on pieces.
 * @param pieces - All pieces in the current state
 * @param modifiedPieceIds - IDs of pieces that were modified (optional, audits all if not provided)
 * @returns Audit warnings string if any issues, undefined otherwise
 */
function runPostExecutionAudits(
  pieces: PatternPiece[],
  modifiedPieceIds?: Set<string>,
): string | undefined {
  const auditResults: AuditResult[] = [];
  const piecesToAudit = modifiedPieceIds
    ? pieces.filter(p => modifiedPieceIds.has(p.id))
    : pieces;

  for (const piece of piecesToAudit) {
    // Check area integrity
    const areaResult = checkAreaIntegrity({ outline: piece.outline });
    if (!areaResult.passed) {
      auditResults.push({
        ...areaResult,
        message: `Piece "${piece.name}": ${areaResult.message}`,
      });
    }

    // Check self-intersection
    const intersectionResult = checkSelfIntersection({ outline: piece.outline });
    if (!intersectionResult.passed) {
      auditResults.push({
        ...intersectionResult,
        message: `Piece "${piece.name}": ${intersectionResult.message}`,
      });
    }
  }

  if (auditResults.length === 0) {
    return undefined;
  }

  return formatAuditResultsForLLM(auditResults);
}

/**
 * Execute a batch of tool calls sequentially.
 *
 * Tool calls are executed in order because some tools depend on previous results
 * (e.g. createPiece followed by addDart on the created piece).
 *
 * @param toolCalls - Array of tool calls from the LLM
 * @param registry - The tool registry containing all tool definitions
 * @param dispatch - Redux dispatch function
 * @param getState - Function to get current Redux state
 * @returns Batch result with all individual results
 */
export async function executeToolCalls(
  toolCalls: LLMToolCall[],
  registry: ToolRegistry,
  dispatch: AppDispatch,
  getState: () => RootState,
): Promise<ExecutionBatchResult> {
  const results: ToolExecutionResult[] = [];
  let succeeded = 0;
  let failed = 0;
  const modifiedPieceIds = new Set<string>();
  let hasGeometryModification = false;

  for (const call of toolCalls) {
    const tool = registry.get(call.name);

    if (!tool) {
      results.push({
        toolCallId: call.id,
        toolName: call.name,
        result: {
          success: false,
          error: `Unknown tool: "${call.name}". Available tools: ${registry.listNames().join(', ')}`,
        },
      });
      failed++;
      continue;
    }

    // Validate parameters
    const validation = registry.validate(call.name, call.arguments);
    if (!validation.valid) {
      results.push({
        toolCallId: call.id,
        toolName: call.name,
        result: {
          success: false,
          error: `Invalid parameters: ${validation.errors.join('; ')}`,
        },
      });
      failed++;
      continue;
    }

    // Execute
    try {
      const result = await tool.execute(call.arguments, dispatch, getState);
      results.push({
        toolCallId: call.id,
        toolName: call.name,
        result,
      });
      if (result.success) {
        succeeded++;
        // Track if this was a geometry-modifying tool
        if (GEOMETRY_MODIFYING_TOOLS.has(call.name)) {
          hasGeometryModification = true;
          // Track the piece ID if available in params or result
          const pieceId = call.arguments.pieceId as string | undefined
            ?? (result.data?.pieceId as string | undefined)
            ?? (result.data?.id as string | undefined);
          if (pieceId) {
            modifiedPieceIds.add(pieceId);
          }
        }
      } else {
        failed++;
      }
    } catch (e: unknown) {
      const error = e instanceof Error ? e.message : String(e);
      results.push({
        toolCallId: call.id,
        toolName: call.name,
        result: {
          success: false,
          error: `Execution error: ${error}`,
        },
      });
      failed++;
    }
  }

  // Run post-execution audits if any geometry was modified
  let auditWarnings: string | undefined;
  if (hasGeometryModification && succeeded > 0) {
    const state = getState();
    auditWarnings = runPostExecutionAudits(
      state.project.pieces,
      modifiedPieceIds.size > 0 ? modifiedPieceIds : undefined,
    );
  }

  return { results, succeeded, failed, auditWarnings };
}

/**
 * Format tool execution results as a human-readable summary.
 *
 * @param batchResult - The batch execution result
 * @returns Formatted summary string
 */
export function formatExecutionSummary(batchResult: ExecutionBatchResult): string {
  const lines: string[] = [];

  for (const r of batchResult.results) {
    if (r.result.success) {
      const dataStr = r.result.data ? ` → ${JSON.stringify(r.result.data)}` : '';
      lines.push(`✅ ${r.toolName}${dataStr}`);
    } else {
      lines.push(`❌ ${r.toolName}: ${r.result.error}`);
    }
  }

  if (batchResult.succeeded > 0) {
    lines.push(`\n${batchResult.succeeded} action${batchResult.succeeded > 1 ? 's' : ''} applied`);
  }
  if (batchResult.failed > 0) {
    lines.push(`${batchResult.failed} action${batchResult.failed > 1 ? 's' : ''} failed`);
  }

  return lines.join('\n');
}
