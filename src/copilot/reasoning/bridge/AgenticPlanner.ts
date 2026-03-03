/**
 * AgenticPlanner — replaces the single-shot Planner with an LLM tool_use loop.
 *
 * During planning, the LLM can call read-only meta-tools (getGarmentState,
 * getPieceDetails, measureEdge, searchPieces) to gather context about the
 * current garment state before outputting a final ExecutionPlan JSON.
 *
 * Flow:
 *   User request → LLM (with meta-tools) → [meta-tool calls] → ... → ExecutionPlan JSON
 *
 * The loop terminates when the LLM responds with content (no tool calls),
 * which is then parsed as an ExecutionPlan. A safety limit (maxMetaToolCalls)
 * prevents infinite loops.
 *
 * @module bridge/AgenticPlanner
 */

import type {
  ChatMessage,
  ProviderToolDef,
  ProviderResponse,
  ProviderToolCall,
} from '../../providers/types';
import type { ToolParametersSchema } from '../../action/tools/registry';
import type { ExecutionPlan } from './types';
import type { MetaToolDefinition } from './meta-tools/types';
import type { RootState } from '../../../store';
import { Planner, PlannerError } from './Planner';
import { buildDomainBootstrap } from './domainBootstrap';

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Record of a meta-tool call made during planning, for debugging/observability.
 */
export interface MetaToolCallRecord {
  /** Name of the meta-tool that was called */
  name: string;
  /** Arguments passed to the meta-tool */
  arguments: Record<string, unknown>;
  /** Result returned by the meta-tool */
  result: unknown;
  /** Execution duration in milliseconds */
  duration: number;
}

/**
 * Options for constructing an AgenticPlanner.
 */
export interface AgenticPlannerOptions {
  /** LLM send function (from provider) */
  send: (
    messages: ChatMessage[],
    tools: ProviderToolDef[],
    config?: unknown,
  ) => Promise<ProviderResponse>;
  /** Read-only meta-tools for context gathering */
  metaTools: MetaToolDefinition[];
  /** Write tool schemas (shown in prompt but not callable during planning) */
  toolSchemas: Array<{
    name: string;
    description: string;
    parameters: ToolParametersSchema;
  }>;
  /** State accessor for meta-tool execution */
  getState: () => RootState;
  /** Max meta-tool calls before giving up (default: 10) */
  maxMetaToolCalls?: number;
  /** Provider config to pass through to send */
  providerConfig?: unknown;
}

// ─── AgenticPlanner ─────────────────────────────────────────────────────────

/**
 * An agentic planner that uses a tool_use loop to gather context before
 * generating an execution plan.
 *
 * Unlike the single-shot Planner, the AgenticPlanner allows the LLM to
 * iteratively call read-only meta-tools to inspect garment state, then
 * produce a well-informed plan with concrete values.
 */
export class AgenticPlanner {
  private send: AgenticPlannerOptions['send'];
  private metaTools: Map<string, MetaToolDefinition>;
  private toolSchemas: AgenticPlannerOptions['toolSchemas'];
  private getState: () => RootState;
  private maxMetaToolCalls: number;
  private providerConfig: unknown;
  private parser: Planner;
  private lastMetaToolCalls: MetaToolCallRecord[] = [];

  constructor(options: AgenticPlannerOptions) {
    this.send = options.send;
    this.metaTools = new Map(
      options.metaTools.map((t) => [t.name, t]),
    );
    this.toolSchemas = options.toolSchemas;
    this.getState = options.getState;
    this.maxMetaToolCalls = options.maxMetaToolCalls ?? 10;
    this.providerConfig = options.providerConfig;
    this.parser = new Planner();
  }

  /**
   * Get meta-tool calls from the last planning run (for debugging).
   *
   * Returns a defensive copy so callers cannot mutate internal state.
   */
  getLastMetaToolCalls(): MetaToolCallRecord[] {
    return [...this.lastMetaToolCalls];
  }

  /**
   * Plan an execution for the given user request.
   *
   * The LLM may call meta-tools to gather garment context before producing
   * a final ExecutionPlan JSON. The loop terminates when the LLM responds
   * with content (no tool calls) or when the meta-tool call limit is reached.
   *
   * @param userRequest - The user's natural language request
   * @returns Validated execution plan
   * @throws PlannerError if the plan JSON is invalid or the loop limit is exceeded
   */
  async plan(userRequest: string): Promise<ExecutionPlan> {
    this.lastMetaToolCalls = [];
    let metaToolCallCount = 0;

    const systemPrompt = this.buildSystemPrompt();
    const metaToolDefs = this.buildMetaToolDefs();

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userRequest },
    ];

    while (true) {
      const response = await this.send(
        messages,
        metaToolDefs,
        this.providerConfig,
      );

      // If LLM returns content without tool calls, it's the final plan
      if (response.toolCalls.length === 0) {
        return this.parser.parsePlan(response.content);
      }

      // Check meta-tool call limit
      metaToolCallCount += response.toolCalls.length;
      if (metaToolCallCount > this.maxMetaToolCalls) {
        throw new PlannerError(
          `Max meta-tool calls (${this.maxMetaToolCalls}) exceeded during planning`,
        );
      }

      // Execute all meta-tools from this response
      const toolResults: Array<{ toolCall: ProviderToolCall; result: unknown }> = [];
      for (const toolCall of response.toolCalls) {
        const result = await this.executeMetaTool(toolCall);
        toolResults.push({ toolCall, result });
      }

      // Add ONE assistant message with ALL tool calls from this response
      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: response.content || '',
        tool_calls: response.toolCalls,
      };
      if (response.reasoningContent) {
        assistantMsg.reasoning_content = response.reasoningContent;
      }
      messages.push(assistantMsg);

      // Add tool result messages (one per tool call)
      for (const { toolCall, result } of toolResults) {
        messages.push({
          role: 'tool',
          content: JSON.stringify(result),
          tool_call_id: toolCall.id,
        });
      }
    }
  }

  /**
   * Execute a single meta-tool call and record it for debugging.
   */
  private async executeMetaTool(
    toolCall: ProviderToolCall,
  ): Promise<unknown> {
    const metaTool = this.metaTools.get(toolCall.name);

    if (!metaTool) {
      const error = {
        success: false,
        error: `Unknown meta-tool: ${toolCall.name}`,
      };
      this.lastMetaToolCalls.push({
        name: toolCall.name,
        arguments: {},
        result: error,
        duration: 0,
      });
      return error;
    }

    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(toolCall.arguments);
    } catch {
      args = {};
    }

    const start = performance.now();
    const result = await metaTool.execute(args, this.getState);
    const duration = performance.now() - start;

    this.lastMetaToolCalls.push({
      name: toolCall.name,
      arguments: args,
      result: result.data ?? result.error,
      duration,
    });

    return result;
  }

  /**
   * Build the system prompt combining domain knowledge and available tools.
   */
  private buildSystemPrompt(): string {
    const domain = buildDomainBootstrap();

    // List available write tools (for plan generation, not callable during planning)
    const toolList = this.toolSchemas
      .map((t) => `- **${t.name}**: ${t.description}`)
      .join('\n');

    return `${domain}

## Available Tools (for your execution plan)
${toolList || 'No tools registered.'}`;
  }

  /**
   * Convert meta-tool definitions to provider tool definitions for the LLM.
   */
  private buildMetaToolDefs(): ProviderToolDef[] {
    return Array.from(this.metaTools.values()).map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));
  }
}
