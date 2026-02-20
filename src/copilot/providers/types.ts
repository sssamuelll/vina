/**
 * LLM Provider Interface — abstracts communication with different LLM APIs.
 *
 * @module providerTypes
 */

import type { ToolParametersSchema } from '../tools/registry';

/**
 * A message in the conversation history.
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  /** For tool results: the ID of the tool call this is a response to */
  tool_call_id?: string;
  /** For assistant messages: tool calls requested */
  tool_calls?: ProviderToolCall[];
}

/**
 * A tool call from the LLM.
 */
export interface ProviderToolCall {
  id: string;
  name: string;
  arguments: string; // JSON string
}

/**
 * Tool definition in provider-native format.
 */
export interface ProviderToolDef {
  name: string;
  description: string;
  parameters: ToolParametersSchema;
}

/**
 * A streamed chunk from the provider.
 */
export interface StreamChunk {
  type: 'text' | 'tool_call_start' | 'tool_call_delta' | 'tool_call_end' | 'done' | 'error';
  /** Text content (for type='text') */
  content?: string;
  /** Tool call info (for tool_call_* types) */
  toolCall?: Partial<ProviderToolCall>;
  /** Error message (for type='error') */
  error?: string;
}

/**
 * Non-streaming response from the provider.
 */
export interface ProviderResponse {
  /** Text content from the assistant */
  content: string;
  /** Tool calls requested by the assistant */
  toolCalls: ProviderToolCall[];
  /** Token usage info */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * Configuration for an LLM provider.
 */
export interface ProviderConfig {
  /** Provider type */
  provider: 'anthropic' | 'openai';
  /** API key */
  apiKey: string;
  /** Model name (e.g. 'claude-sonnet-4-20250514', 'gpt-4o-mini') */
  model: string;
  /** Optional base URL override */
  baseUrl?: string;
  /** Max tokens for response */
  maxTokens?: number;
}

/**
 * Interface that all LLM providers must implement.
 */
export interface LLMProvider {
  /** Provider name for display */
  readonly name: string;

  /**
   * Send a non-streaming request.
   *
   * @param messages - Conversation messages
   * @param tools - Available tool definitions
   * @param config - Provider configuration
   * @returns Provider response with content and optional tool calls
   */
  send(
    messages: ChatMessage[],
    tools: ProviderToolDef[],
    config: ProviderConfig,
  ): Promise<ProviderResponse>;

  /**
   * Send a streaming request.
   *
   * @param messages - Conversation messages
   * @param tools - Available tool definitions
   * @param config - Provider configuration
   * @param onChunk - Callback for each streamed chunk
   * @returns Final complete response
   */
  stream(
    messages: ChatMessage[],
    tools: ProviderToolDef[],
    config: ProviderConfig,
    onChunk: (chunk: StreamChunk) => void,
  ): Promise<ProviderResponse>;
}

// ─── Constants ──────────────────────────────────────────────────────────────

/** Available provider options for the settings UI */
export const PROVIDER_OPTIONS = [
  { value: 'anthropic', label: 'Anthropic (Claude)', defaultModel: 'claude-sonnet-4-20250514' },
  { value: 'openai', label: 'OpenAI (GPT)', defaultModel: 'gpt-4o-mini' },
] as const;

/** Available models per provider */
export const MODEL_OPTIONS: Record<string, string[]> = {
  anthropic: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514', 'claude-3-5-haiku-20241022'],
  openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo'],
};

// ─── Provider Config from localStorage ──────────────────────────────────────

const PROVIDER_STORAGE_KEY = 'openclo-provider-config';

/**
 * Load provider config from localStorage.
 * @returns ProviderConfig or null if not set
 */
export function loadProviderConfig(): ProviderConfig | null {
  try {
    const saved = localStorage.getItem(PROVIDER_STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch { /* ignore */ }
  return null;
}

/**
 * Save provider config to localStorage.
 * @param config - Provider configuration to save
 */
export function saveProviderConfig(config: ProviderConfig): void {
  localStorage.setItem(PROVIDER_STORAGE_KEY, JSON.stringify(config));
}
