/**
 * Tool Executor — takes tool_calls from LLM responses, validates, and executes sequentially.
 *
 * @module toolExecutor
 */

import type { AppDispatch, RootState } from '../store';
import { ToolRegistry, ToolResult } from './tools/registry';

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

  return { results, succeeded, failed };
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
