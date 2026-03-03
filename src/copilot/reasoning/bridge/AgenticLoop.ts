/**
 * AgenticLoop — unified tool-use loop for the copilot.
 *
 * Replaces the plan-then-execute architecture (AgenticPlanner + ExecutionBridge +
 * Reasoner + EnhancedReasoner + ResultStore + SummaryGenerator) with a single
 * agentic loop where the LLM calls tools iteratively until the work is done.
 *
 * The LLM has access to both:
 * - Meta-tools (read-only): getGarmentState, getPieceDetails, measureEdge, searchPieces
 * - Action tools (mutations): modifyEdge, createPiece, addDart, etc.
 *
 * The loop terminates when the LLM responds with text (no tool calls).
 *
 * @module bridge/AgenticLoop
 */

import type {
  ChatMessage,
  ProviderToolDef,
  ProviderResponse,
  ProviderToolCall,
} from '../../providers/types';
import type { MetaToolDefinition } from './meta-tools/types';
import type { ToolRegistry } from '../../action/tools/registry';
import type { AppDispatch, RootState } from '../../../store';
import { buildDomainBootstrap } from './domainBootstrap';

// ─── Event Types ─────────────────────────────────────────────────────────────

export type AgenticEvent =
  | { type: 'tool:start'; name: string; args: Record<string, unknown> }
  | { type: 'tool:complete'; name: string; result: unknown }
  | { type: 'tool:error'; name: string; error: string }
  | { type: 'text:delta'; content: string }
  | { type: 'complete'; content: string }
  | { type: 'error'; error: string };

export type AgenticEventHandler = (event: AgenticEvent) => void;

// ─── Options ─────────────────────────────────────────────────────────────────

export interface AgenticLoopOptions {
  /** LLM send function */
  send: (
    messages: ChatMessage[],
    tools: ProviderToolDef[],
    config?: unknown,
  ) => Promise<ProviderResponse>;
  /** Read-only meta-tools */
  metaTools: MetaToolDefinition[];
  /** Action tool definitions (for LLM to see) */
  actionToolDefs: ProviderToolDef[];
  /** State accessor for meta-tool execution */
  getState: () => RootState;
  /** Redux dispatch for action tool execution */
  dispatch: AppDispatch;
  /** Action tool registry (for execution) */
  registry?: ToolRegistry;
  /** Provider config to pass through to send */
  providerConfig?: unknown;
}

// ─── Tool Call Record ────────────────────────────────────────────────────────

export interface ToolCallRecord {
  name: string;
  arguments: Record<string, unknown>;
  result: unknown;
  duration: number;
  isMetaTool: boolean;
}

// ─── AgenticLoop ─────────────────────────────────────────────────────────────

export class AgenticLoop {
  private send: AgenticLoopOptions['send'];
  private metaTools: Map<string, MetaToolDefinition>;
  private actionToolDefs: ProviderToolDef[];
  private getState: () => RootState;
  private registry: ToolRegistry | undefined;
  private providerConfig: unknown;
  private lastToolCalls: ToolCallRecord[] = [];

  constructor(options: AgenticLoopOptions) {
    this.send = options.send;
    this.metaTools = new Map(options.metaTools.map((t) => [t.name, t]));
    this.actionToolDefs = options.actionToolDefs;
    this.getState = options.getState;
    this.registry = options.registry;
    this.providerConfig = options.providerConfig;
  }

  /**
   * Get tool call records from the last run (for debugging).
   */
  getLastToolCalls(): ToolCallRecord[] {
    return [...this.lastToolCalls];
  }

  /**
   * Run the agentic loop with a user request.
   *
   * The LLM drives the loop: it calls tools (read + write) as needed,
   * and terminates naturally when it responds with text (no tool calls).
   */
  async run(userRequest: string, onEvent: AgenticEventHandler): Promise<string> {
    this.lastToolCalls = [];

    const systemPrompt = this.buildSystemPrompt();
    const allToolDefs = this.buildAllToolDefs();

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userRequest },
    ];

    while (true) {
      const response = await this.send(messages, allToolDefs, this.providerConfig);

      // Text response = work is done
      if (response.toolCalls.length === 0) {
        onEvent({ type: 'complete', content: response.content });
        return response.content;
      }

      // Build assistant message with all tool calls
      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: response.content || '',
        tool_calls: response.toolCalls,
      };
      if (response.reasoningContent) {
        assistantMsg.reasoning_content = response.reasoningContent;
      }
      messages.push(assistantMsg);

      // Execute each tool call and append results
      for (const toolCall of response.toolCalls) {
        const args = this.parseArgs(toolCall);
        onEvent({ type: 'tool:start', name: toolCall.name, args });

        const start = performance.now();
        let result: unknown;
        let isMetaTool = false;

        try {
          const metaTool = this.metaTools.get(toolCall.name);
          if (metaTool) {
            isMetaTool = true;
            result = await metaTool.execute(args, this.getState);
          } else if (this.registry) {
            result = await this.registry.execute(toolCall.name, args);
          } else {
            result = { success: false, error: `Unknown tool: ${toolCall.name}` };
          }

          onEvent({ type: 'tool:complete', name: toolCall.name, result });
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          result = { success: false, error: errorMsg };
          onEvent({ type: 'tool:error', name: toolCall.name, error: errorMsg });
        }

        const duration = performance.now() - start;
        this.lastToolCalls.push({
          name: toolCall.name,
          arguments: args,
          result,
          duration,
          isMetaTool,
        });

        messages.push({
          role: 'tool',
          content: JSON.stringify(result),
          tool_call_id: toolCall.id,
        });
      }
    }
  }

  /**
   * Parse arguments from a tool call, handling JSON parse errors gracefully.
   */
  private parseArgs(toolCall: ProviderToolCall): Record<string, unknown> {
    try {
      return JSON.parse(toolCall.arguments);
    } catch {
      return {};
    }
  }

  /**
   * Build the system prompt combining domain knowledge and tool descriptions.
   */
  private buildSystemPrompt(): string {
    const domain = buildDomainBootstrap();

    const metaToolList = Array.from(this.metaTools.values())
      .map((t) => `- **${t.name}** (read-only): ${t.description}`)
      .join('\n');

    const actionToolList = this.actionToolDefs
      .map((t) => `- **${t.name}**: ${t.description}`)
      .join('\n');

    return `${domain}

## Read-Only Tools (inspect garment state)
${metaToolList || 'None'}

## Action Tools (modify garment)
${actionToolList || 'None'}

## Instructions
- Use read-only tools first to understand current state before making changes.
- After making changes, verify the result if needed.
- Respond in the user's language when done.
- If a tool fails, investigate with read-only tools and retry with corrected parameters.`;
  }

  /**
   * Build all tool definitions (meta + action) for the LLM.
   */
  private buildAllToolDefs(): ProviderToolDef[] {
    const metaDefs = Array.from(this.metaTools.values()).map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));

    return [...metaDefs, ...this.actionToolDefs];
  }
}
