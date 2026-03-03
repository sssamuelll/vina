/**
 * EnhancedReasoner — LLM tool_use loop for intelligent error recovery.
 *
 * When a step fails, the EnhancedReasoner uses an LLM with meta-tool access
 * (searchPieces, getPieceDetails, etc.) to investigate the failure and find
 * correct parameters for retry. Only asks the user if truly ambiguous.
 *
 * Unlike the simple string-based Reasoner, this version:
 * - Sends structured messages with tool definitions to the LLM
 * - Processes tool_use calls in a loop (up to maxMetaToolCalls)
 * - Parses the final JSON decision from the LLM response
 * - Falls back to abort on parse errors or LLM failures
 *
 * @module bridge/EnhancedReasoner
 */

import type { ChatMessage, ProviderToolDef, ProviderResponse, ProviderToolCall } from '../../providers/types';
import type { ReasonerInput, ReasonerDecision, IReasoner } from './types';
import type { MetaToolDefinition } from './meta-tools/types';
import type { RootState } from '../../../store';
import { isExecuteStep } from './types';

// ─── Options ────────────────────────────────────────────────────────────────

/**
 * Configuration options for the EnhancedReasoner.
 */
export interface EnhancedReasonerOptions {
  /**
   * Send function that calls the LLM provider with messages and tool definitions.
   * This is the core LLM communication channel.
   */
  send: (
    messages: ChatMessage[],
    tools: ProviderToolDef[],
    config?: unknown,
  ) => Promise<ProviderResponse>;

  /** Meta-tools available for the LLM to call during reasoning */
  metaTools: MetaToolDefinition[];

  /** Function to get the current Redux store state */
  getState: () => RootState;

  /** Maximum number of meta-tool calls before aborting (default: 3) */
  maxMetaToolCalls?: number;

  /** Optional provider configuration passed through to the send function */
  providerConfig?: unknown;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const VALID_ACTIONS = ['retry', 'alternative', 'askUser', 'abort'] as const;

// ─── EnhancedReasoner Class ─────────────────────────────────────────────────

/**
 * LLM-powered error recovery with meta-tool access.
 *
 * Implements the IReasoner interface so it can be used as a drop-in
 * replacement for the simple Reasoner in the ExecutionBridge.
 */
export class EnhancedReasoner implements IReasoner {
  private send: EnhancedReasonerOptions['send'];
  private metaTools: Map<string, MetaToolDefinition>;
  private getState: () => RootState;
  private maxMetaToolCalls: number;
  private providerConfig: unknown;

  constructor(options: EnhancedReasonerOptions) {
    this.send = options.send;
    this.metaTools = new Map(options.metaTools.map(t => [t.name, t]));
    this.getState = options.getState;
    this.maxMetaToolCalls = options.maxMetaToolCalls ?? 3;
    this.providerConfig = options.providerConfig;
  }

  /**
   * Analyze a failed step and decide how to recover.
   *
   * Wraps the internal tool-use loop in a try/catch so that any
   * unexpected error (LLM failure, network issues, etc.) results
   * in a graceful abort rather than an unhandled exception.
   */
  async analyze(input: ReasonerInput): Promise<ReasonerDecision> {
    try {
      return await this.analyzeWithTools(input);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { action: 'abort', reason: `Reasoner error: ${msg}` };
    }
  }

  /**
   * Core reasoning loop: sends messages to the LLM, processes any
   * meta-tool calls, and repeats until the LLM returns a final
   * JSON decision (no more tool calls).
   */
  private async analyzeWithTools(input: ReasonerInput): Promise<ReasonerDecision> {
    let metaToolCallCount = 0;
    const metaToolDefs = this.buildMetaToolDefs();

    const messages: ChatMessage[] = [
      { role: 'system', content: this.buildPrompt(input) },
      { role: 'user', content: 'Analyze this failure and decide how to recover.' },
    ];

    while (true) {
      const response = await this.send(messages, metaToolDefs, this.providerConfig);

      // If no tool calls, the LLM has made its final decision
      if (response.toolCalls.length === 0) {
        return this.parseDecision(response.content);
      }

      // Process each tool call from the LLM
      for (const toolCall of response.toolCalls) {
        metaToolCallCount++;
        if (metaToolCallCount > this.maxMetaToolCalls) {
          return { action: 'abort', reason: 'Max meta-tool calls exceeded during recovery' };
        }

        const result = await this.executeMetaTool(toolCall);

        // Add the assistant's tool call request to the conversation
        messages.push({
          role: 'assistant',
          content: response.content || '',
          tool_calls: [toolCall],
        });

        // Add the tool result to the conversation
        messages.push({
          role: 'tool',
          content: JSON.stringify(result),
          tool_call_id: toolCall.id,
        });
      }
    }
  }

  /**
   * Execute a single meta-tool call.
   *
   * Returns an error result if the meta-tool is not found or if
   * argument parsing fails, rather than throwing.
   */
  private async executeMetaTool(toolCall: ProviderToolCall): Promise<unknown> {
    const metaTool = this.metaTools.get(toolCall.name);
    if (!metaTool) {
      return { success: false, error: `Unknown meta-tool: ${toolCall.name}` };
    }

    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(toolCall.arguments);
    } catch {
      /* Use empty args if parsing fails */
    }

    return metaTool.execute(args, this.getState);
  }

  /**
   * Build the system prompt with full error context for the LLM.
   */
  private buildPrompt(input: ReasonerInput): string {
    const { failedStep, error, resultsSoFar, originalIntent } = input;

    const stepInfo = isExecuteStep(failedStep)
      ? `Tool: ${failedStep.tool}\nParams: ${JSON.stringify(failedStep.params, null, 2)}`
      : `Input: ${(failedStep as { input: string }).input}\nDecide: ${(failedStep as { decide: string }).decide}`;

    const prevResults = resultsSoFar.length === 0
      ? 'None'
      : resultsSoFar.map(r =>
          `- ${r.stepId}: ${r.success ? 'OK' : 'FAIL'} ${r.data ? JSON.stringify(r.data) : ''}`
        ).join('\n');

    return `You are an error recovery assistant for a garment CAD copilot.

A step failed. Use the meta-tools to investigate (e.g., searchPieces to find correct piece IDs, getPieceDetails to check edge names).

## Original Intent
${originalIntent}

## Failed Step
${stepInfo}

## Error
${error}

## Previous Results
${prevResults}

## Actions
Respond with JSON:
- {"action": "retry", "newParams": {...}, "reason": "..."} — retry with corrected params
- {"action": "alternative", "newStep": {...}, "reason": "..."} — use different step
- {"action": "askUser", "question": "...", "options": [...]} — ask user to clarify
- {"action": "abort", "reason": "..."} — cannot recover`;
  }

  /**
   * Parse the LLM's final response into a ReasonerDecision.
   *
   * Tries direct JSON parsing first, then falls back to extracting
   * JSON from markdown code blocks. Returns abort if parsing fails.
   */
  private parseDecision(content: string): ReasonerDecision {
    // Try direct JSON parse
    try {
      const parsed = JSON.parse(content);
      if (typeof parsed === 'object' && parsed !== null && VALID_ACTIONS.includes(parsed.action)) {
        return parsed as ReasonerDecision;
      }
    } catch {
      /* fall through to code block extraction */
    }

    // Try extracting JSON from markdown code blocks
    const match = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) {
      try {
        const parsed = JSON.parse(match[1].trim());
        if (VALID_ACTIONS.includes(parsed.action)) {
          return parsed as ReasonerDecision;
        }
      } catch {
        /* fall through to abort */
      }
    }

    return { action: 'abort', reason: 'Could not parse reasoner response' };
  }

  /**
   * Convert meta-tool definitions to provider tool definitions
   * that the LLM understands.
   */
  private buildMetaToolDefs(): ProviderToolDef[] {
    return Array.from(this.metaTools.values()).map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));
  }
}
