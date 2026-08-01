/**
 * Conversation Manager — orchestrates LLM interactions with action execution.
 *
 * This module provides a high-level interface for:
 * - Managing conversation history
 * - Building system prompts with context
 * - Sending messages to LLM providers
 * - Parsing responses and extracting actions
 * - Executing actions with error recovery
 * - Tracking actions for conversation continuity
 *
 * @module conversationManager
 */

import type { RootState, AppDispatch } from '../../store';
import type { LLMProvider, ProviderConfig, ChatMessage, StreamChunk } from '../providers/types';
import type { CopilotAction, ActionResult } from '../actions/actionTypes';
import { CopilotActionExecutor } from '../actions/actionExecutor';
import { validateAction } from '../actions/actionValidator';
import { generateCopilotContext, serializeCopilotContext } from '../perception/copilotContext';
import { trackAction } from '../perception/recentActionsTracker';
import { parseResponse, createStreamParserState, processStreamChunk, finalizeStreamParser, type ParsedResponse, type StreamParserState } from './responseParser';
import { generateRecoveryFeedback, buildRetryPrompt, shouldRetry, attemptAutoCorrect, type RetryOptions } from './errorRecovery';
import { generateActionsPromptSection, generateCompactActionsReference } from './actionSchemas';

// ============================================================================
// Types
// ============================================================================

/**
 * Result of processing a user message through the conversation manager.
 */
export interface ConversationTurnResult {
  /** Natural language response text */
  responseText: string;
  /** Actions that were extracted and executed */
  executedActions: Array<{
    action: CopilotAction;
    result: ActionResult;
  }>;
  /** Actions that failed validation */
  failedActions: Array<{
    action: CopilotAction;
    error: string;
  }>;
  /** Whether any retry was attempted */
  retriedCount: number;
  /** Total tokens used (if available) */
  tokenUsage?: {
    prompt: number;
    completion: number;
    total: number;
  };
  /** Duration in milliseconds */
  durationMs: number;
}

/**
 * Streaming callbacks for the conversation manager.
 */
export interface ConversationCallbacks {
  /** Called with new text chunks */
  onText?: (text: string) => void;
  /** Called when an action is about to execute */
  onActionStart?: (action: CopilotAction) => void;
  /** Called when an action completes */
  onActionComplete?: (action: CopilotAction, result: ActionResult) => void;
  /** Called when parsing completes with actions */
  onActionsParsed?: (actions: CopilotAction[]) => void;
  /** Called when streaming is complete */
  onComplete?: (result: ConversationTurnResult) => void;
  /** Called on error */
  onError?: (error: Error) => void;
}

/**
 * Configuration for the conversation manager.
 */
export interface ConversationConfig {
  /** LLM provider to use */
  provider: LLMProvider;
  /** Provider configuration */
  providerConfig: ProviderConfig;
  /** Max conversation history to keep */
  maxHistoryLength: number;
  /** Whether to use compact action reference */
  useCompactPrompt: boolean;
  /** Retry options for error recovery */
  retryOptions: RetryOptions;
  /** Custom system prompt additions */
  additionalSystemPrompt?: string;
}

/**
 * Conversation history entry.
 */
interface HistoryEntry {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  actions?: CopilotAction[];
}

// ============================================================================
// System Prompt Builder
// ============================================================================

/**
 * Build the complete system prompt for the LLM.
 */
function buildSystemPrompt(
  state: RootState,
  config: ConversationConfig,
  activeSkills: string[] = []
): string {
  const parts: string[] = [];

  // Core identity
  parts.push(`You are a helpful pattern making assistant for Vina, a garment CAD application.
Your role is to help users create and modify clothing patterns, run simulations, and understand garment construction.

When the user requests actions, respond with JSON containing the actions to execute.
Always explain what you're doing in natural language before or after the JSON.`);

  // Action schemas
  if (config.useCompactPrompt) {
    parts.push(generateCompactActionsReference());
  } else {
    parts.push(generateActionsPromptSection());
  }

  // Current context
  const context = generateCopilotContext(state, activeSkills);
  parts.push('## Current State\n' + serializeCopilotContext(context));

  // Response format reminder
  parts.push(`## Response Format
When executing actions, respond with:

\`\`\`json
{
  "actions": [
    {"action": "action_name", "param1": "value1", ...}
  ],
  "explanation": "What these actions will do"
}
\`\`\`

For questions or explanations without actions, respond in natural language.`);

  // Additional custom prompt
  if (config.additionalSystemPrompt) {
    parts.push(config.additionalSystemPrompt);
  }

  return parts.join('\n\n');
}

// ============================================================================
// Conversation Manager Class
// ============================================================================

/**
 * Manages LLM conversations with action execution.
 */
export class ConversationManager {
  private history: HistoryEntry[] = [];
  private config: ConversationConfig;
  private executor: CopilotActionExecutor;
  private getState: () => RootState;

  constructor(
    config: ConversationConfig,
    dispatch: AppDispatch,
    getState: () => RootState
  ) {
    this.config = config;
    this.getState = getState;
    this.executor = new CopilotActionExecutor(dispatch, getState);
  }

  /**
   * Process a user message and return the result.
   */
  async processMessage(
    userMessage: string,
    callbacks?: ConversationCallbacks
  ): Promise<ConversationTurnResult> {
    const startTime = Date.now();
    const state = this.getState();

    // Build messages for LLM
    const systemPrompt = buildSystemPrompt(state, this.config);
    const messages = this.buildMessages(systemPrompt, userMessage);

    // Track this turn
    let responseText = '';
    let allExecutedActions: Array<{ action: CopilotAction; result: ActionResult }> = [];
    let allFailedActions: Array<{ action: CopilotAction; error: string }> = [];
    let retriedCount = 0;
    let tokenUsage: ConversationTurnResult['tokenUsage'];

    try {
      // Send to LLM (streaming or non-streaming)
      const llmResponse = await this.sendToLLM(messages, callbacks);
      responseText = llmResponse.content;
      tokenUsage = llmResponse.usage;

      // Parse response for actions
      const parsed = parseResponse(llmResponse.content);
      if (parsed.actions.length > 0) {
        callbacks?.onActionsParsed?.(parsed.actions);
      }

      // Execute valid actions
      if (parsed.actions.length > 0) {
        const { executed, failed } = await this.executeActions(
          parsed.actions,
          callbacks
        );
        allExecutedActions = executed;
        allFailedActions = failed;

        // Handle retries if needed
        if (failed.length > 0 && this.config.retryOptions.maxRetries > 0) {
          const retryResult = await this.handleRetry(
            userMessage,
            failed,
            parsed.errors,
            callbacks
          );
          if (retryResult) {
            retriedCount = retryResult.retriedCount;
            allExecutedActions.push(...retryResult.executed);
            responseText += '\n\n' + retryResult.responseText;
          }
        }
      }

      // Use explanation text if available
      if (parsed.text && !responseText.includes(parsed.text)) {
        responseText = parsed.text;
      }

      // Add to history
      this.addToHistory('user', userMessage);
      this.addToHistory('assistant', responseText, parsed.actions);

      // Track actions for context
      for (const { action, result } of allExecutedActions) {
        trackAction(
          action.action,
          result.summary || 'Completed',
          result.success,
          result.data
        );
      }

    } catch (error) {
      callbacks?.onError?.(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }

    const result: ConversationTurnResult = {
      responseText,
      executedActions: allExecutedActions,
      failedActions: allFailedActions,
      retriedCount,
      tokenUsage,
      durationMs: Date.now() - startTime,
    };

    callbacks?.onComplete?.(result);
    return result;
  }

  /**
   * Process a message with streaming.
   */
  async processMessageStreaming(
    userMessage: string,
    callbacks: ConversationCallbacks
  ): Promise<ConversationTurnResult> {
    const startTime = Date.now();
    const state = this.getState();

    const systemPrompt = buildSystemPrompt(state, this.config);
    const messages = this.buildMessages(systemPrompt, userMessage);

    let responseText = '';
    let parserState: StreamParserState = createStreamParserState();
    let allExecutedActions: Array<{ action: CopilotAction; result: ActionResult }> = [];
    let allFailedActions: Array<{ action: CopilotAction; error: string }> = [];
    let tokenUsage: ConversationTurnResult['tokenUsage'];

    try {
      // Stream from LLM
      const llmResponse = await this.config.provider.stream(
        messages,
        [], // No native tools - we parse JSON actions instead
        this.config.providerConfig,
        (chunk: StreamChunk) => {
          if (chunk.type === 'text' && chunk.content) {
            // Process through streaming parser
            const { state: newState, newText, newActions } = processStreamChunk(
              chunk.content,
              parserState
            );
            parserState = newState;

            // Emit new text
            if (newText) {
              callbacks.onText?.(newText);
            }

            // Execute new actions immediately
            if (newActions && newActions.length > 0) {
              callbacks.onActionsParsed?.(newActions);
              // Note: In streaming mode, we might want to queue these
              // and execute after stream completes for safety
            }
          }
        }
      );

      responseText = llmResponse.content;
      tokenUsage = llmResponse.usage ? {
        prompt: llmResponse.usage.promptTokens,
        completion: llmResponse.usage.completionTokens,
        total: llmResponse.usage.totalTokens,
      } : undefined;

      // Finalize streaming parser
      const finalParsed = finalizeStreamParser(parserState);

      // Execute actions after stream completes
      if (finalParsed.actions.length > 0) {
        const { executed, failed } = await this.executeActions(
          finalParsed.actions,
          callbacks
        );
        allExecutedActions = executed;
        allFailedActions = failed;
      }

      if (finalParsed.text) {
        responseText = finalParsed.text;
      }

      // Add to history
      this.addToHistory('user', userMessage);
      this.addToHistory('assistant', responseText, finalParsed.actions);

      // Track actions
      for (const { action, result } of allExecutedActions) {
        trackAction(
          action.action,
          result.summary || 'Completed',
          result.success,
          result.data
        );
      }

    } catch (error) {
      callbacks.onError?.(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }

    const result: ConversationTurnResult = {
      responseText,
      executedActions: allExecutedActions,
      failedActions: allFailedActions,
      retriedCount: 0,
      tokenUsage,
      durationMs: Date.now() - startTime,
    };

    callbacks.onComplete?.(result);
    return result;
  }

  /**
   * Build the message array for the LLM.
   */
  private buildMessages(systemPrompt: string, userMessage: string): ChatMessage[] {
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
    ];

    // Add relevant history
    const recentHistory = this.history.slice(-this.config.maxHistoryLength * 2);
    for (const entry of recentHistory) {
      messages.push({
        role: entry.role,
        content: entry.content,
      });
    }

    // Add current user message
    messages.push({ role: 'user', content: userMessage });

    return messages;
  }

  /**
   * Send messages to LLM (non-streaming).
   */
  private async sendToLLM(
    messages: ChatMessage[],
    callbacks?: ConversationCallbacks
  ): Promise<{ content: string; usage?: ConversationTurnResult['tokenUsage'] }> {
    const response = await this.config.provider.send(
      messages,
      [], // No native tools
      this.config.providerConfig
    );

    // Emit the full text if callback provided
    if (callbacks?.onText) {
      callbacks.onText(response.content);
    }

    return {
      content: response.content,
      usage: response.usage ? {
        prompt: response.usage.promptTokens,
        completion: response.usage.completionTokens,
        total: response.usage.totalTokens,
      } : undefined,
    };
  }

  /**
   * Execute a batch of actions with callbacks.
   */
  private async executeActions(
    actions: CopilotAction[],
    callbacks?: ConversationCallbacks
  ): Promise<{
    executed: Array<{ action: CopilotAction; result: ActionResult }>;
    failed: Array<{ action: CopilotAction; error: string }>;
  }> {
    const executed: Array<{ action: CopilotAction; result: ActionResult }> = [];
    const failed: Array<{ action: CopilotAction; error: string }> = [];

    for (const action of actions) {
      // Validate first
      const state = this.getState();
      const validation = validateAction(action, state);

      if (!validation.valid) {
        // Try auto-correction
        const corrected = attemptAutoCorrect(action);
        if (corrected) {
          const revalidation = validateAction(corrected, state);
          if (revalidation.valid) {
            callbacks?.onActionStart?.(corrected);
            const result = await this.executor.execute(corrected);
            callbacks?.onActionComplete?.(corrected, result);
            executed.push({ action: corrected, result });
            continue;
          }
        }

        failed.push({
          action,
          error: validation.errors.join('; '),
        });
        continue;
      }

      // Execute valid action
      callbacks?.onActionStart?.(action);
      const result = await this.executor.execute(action);
      callbacks?.onActionComplete?.(action, result);

      if (result.success) {
        executed.push({ action, result });
      } else {
        failed.push({
          action,
          error: result.error || result.summary || 'Unknown error',
        });
      }
    }

    return { executed, failed };
  }

  /**
   * Handle retry logic for failed actions.
   */
  private async handleRetry(
    originalMessage: string,
    failedActions: Array<{ action: CopilotAction; error: string }>,
    parseErrors: ParsedResponse['errors'],
    callbacks?: ConversationCallbacks
  ): Promise<{
    retriedCount: number;
    executed: Array<{ action: CopilotAction; result: ActionResult }>;
    responseText: string;
  } | null> {
    // Build validation errors map
    const validationResults = new Map<CopilotAction, Array<{ field?: string; message: string; code: string }>>();
    for (const { action, error } of failedActions) {
      validationResults.set(action, [{ message: error, code: 'execution_failed' }]);
    }

    const feedback = generateRecoveryFeedback(
      failedActions.map(f => f.action),
      validationResults,
      parseErrors
    );

    if (!shouldRetry(feedback, 0, this.config.retryOptions)) {
      return null;
    }

    // Build retry prompt
    const retryPrompt = buildRetryPrompt(originalMessage, feedback, 1);

    // Send retry to LLM
    const state = this.getState();
    const systemPrompt = buildSystemPrompt(state, this.config);
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: retryPrompt },
    ];

    const retryResponse = await this.config.provider.send(
      messages,
      [],
      this.config.providerConfig
    );

    // Parse and execute retry response
    const parsed = parseResponse(retryResponse.content);
    if (parsed.actions.length > 0) {
      callbacks?.onActionsParsed?.(parsed.actions);
      const { executed } = await this.executeActions(parsed.actions, callbacks);
      return {
        retriedCount: 1,
        executed,
        responseText: parsed.text || retryResponse.content,
      };
    }

    return {
      retriedCount: 1,
      executed: [],
      responseText: retryResponse.content,
    };
  }

  /**
   * Add an entry to conversation history.
   */
  private addToHistory(
    role: 'user' | 'assistant',
    content: string,
    actions?: CopilotAction[]
  ): void {
    this.history.push({
      role,
      content,
      timestamp: Date.now(),
      actions,
    });

    // Trim history if needed
    while (this.history.length > this.config.maxHistoryLength * 2) {
      this.history.shift();
    }
  }

  /**
   * Clear conversation history.
   */
  clearHistory(): void {
    this.history = [];
  }

  /**
   * Get conversation history.
   */
  getHistory(): ReadonlyArray<HistoryEntry> {
    return this.history;
  }

  /**
   * Update configuration.
   */
  updateConfig(config: Partial<ConversationConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a conversation manager with default configuration.
 */
export function createConversationManager(
  provider: LLMProvider,
  providerConfig: ProviderConfig,
  dispatch: AppDispatch,
  getState: () => RootState,
  options?: Partial<ConversationConfig>
): ConversationManager {
  const config: ConversationConfig = {
    provider,
    providerConfig,
    maxHistoryLength: 10,
    useCompactPrompt: false,
    retryOptions: {
      maxRetries: 2,
      allowPartialSuccess: true,
      minSuccessRate: 0.5,
    },
    ...options,
  };

  return new ConversationManager(config, dispatch, getState);
}
