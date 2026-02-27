/**
 * LLM Integration Module — Phase 4 of Issue #130
 *
 * Provides the integration layer between the copilot action system and LLM providers:
 * - Action schema generation for system prompts
 * - Response parsing (JSON + natural text)
 * - Streaming support
 * - Error recovery with retry logic
 * - Conversation management
 *
 * @example
 * ```ts
 * import { createConversationManager, parseResponse } from './copilot/llm';
 *
 * // Create manager
 * const manager = createConversationManager(provider, config, dispatch, getState);
 *
 * // Process a message
 * const result = await manager.processMessage('Create a front bodice piece');
 *
 * // Or parse a raw response
 * const parsed = parseResponse(llmResponse);
 * ```
 *
 * @module copilot/llm
 */

// Action schemas for system prompts
export {
  getAllActionSchemas,
  getActionSchemasByCategory,
  getActionSchema,
  generateActionsPromptSection,
  generateCompactActionsReference,
  type ActionSchema,
  type ActionParameter,
} from './actionSchemas';

// Response parsing
export {
  parseResponse,
  createStreamParserState,
  processStreamChunk,
  finalizeStreamParser,
  isValidActionShape,
  getActionName,
  type ParsedResponse,
  type ParseError,
  type StreamParserState,
} from './responseParser';

// Error recovery
export {
  analyzeActionError,
  analyzeParseErrors,
  generateRecoveryFeedback,
  shouldRetry,
  buildRetryPrompt,
  attemptAutoCorrect,
  filterValidActions,
  type ActionErrorAnalysis,
  type RecoveryFeedback,
  type RetryOptions,
} from './errorRecovery';

// Conversation management
export {
  ConversationManager,
  createConversationManager,
  type ConversationTurnResult,
  type ConversationCallbacks,
  type ConversationConfig,
} from './conversationManager';
