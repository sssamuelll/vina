/**
 * LLM Provider Interface — abstracts communication with different LLM APIs.
 *
 * @module providerTypes
 */

import type { ToolParametersSchema } from '../action/tools/registry';
import { SecureStorage } from './secureStorage';

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
  /** For assistant messages: reasoning/thinking content (DeepSeek reasoner) */
  reasoning_content?: string;
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
  /** Reasoning/thinking content from the assistant (DeepSeek reasoner) */
  reasoningContent?: string;
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
  provider: 'anthropic' | 'openai' | 'deepseek' | 'ollama' | 'claude-bridge';
  /** API key (empty for Ollama) */
  apiKey: string;
  /** Model name (e.g. 'claude-sonnet-4-20250514', 'gpt-4o-mini', 'llama3') */
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
  { value: 'claude-bridge', label: 'Claude Code (Bridge)', defaultModel: 'claude-code' },
  { value: 'anthropic', label: 'Anthropic (API)', defaultModel: 'claude-sonnet-4-20250514' },
  { value: 'openai', label: 'OpenAI (API)', defaultModel: 'gpt-4o-mini' },
  { value: 'deepseek', label: 'DeepSeek (API)', defaultModel: 'deepseek-chat' },
  { value: 'ollama', label: 'Ollama (Local)', defaultModel: 'llama3' },
] as const;

/** Available models per provider */
export const MODEL_OPTIONS: Record<string, string[]> = {
  'claude-bridge': ['claude-code'],
  anthropic: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514', 'claude-3-5-haiku-20241022'],
  openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo'],
  deepseek: ['deepseek-chat', 'deepseek-reasoner'],
  ollama: ['llama3', 'codellama', 'mistral', 'mixtral'],
};

// ─── Provider Config from localStorage ──────────────────────────────────────

const PROVIDER_STORAGE_KEY = 'openclo-provider-config';

/**
 * Provider config stored in localStorage (no secrets).
 */
export interface StoredProviderConfig {
  provider: string;
  model?: string;
  baseUrl?: string;
  // apiKey is stored separately in SecureStorage
}

/**
 * Load provider config synchronously from localStorage only (no API key).
 * Returns config with `apiKey: ''`. Use for initial render to avoid flash;
 * call `loadProviderConfig()` to hydrate the encrypted API key.
 */
export function loadProviderConfigSync(): ProviderConfig | null {
  try {
    const saved = localStorage.getItem(PROVIDER_STORAGE_KEY);
    if (!saved) return null;
    const config: StoredProviderConfig = JSON.parse(saved);
    return {
      provider: config.provider as ProviderConfig['provider'],
      model: config.model ?? '',
      baseUrl: config.baseUrl,
      apiKey: '', // async hydration needed
    };
  } catch { /* ignore */ }
  return null;
}

/**
 * Load provider config from localStorage + apiKey from SecureStorage.
 * @returns ProviderConfig or null if not set
 */
export async function loadProviderConfig(): Promise<ProviderConfig | null> {
  try {
    const saved = localStorage.getItem(PROVIDER_STORAGE_KEY);
    if (!saved) return null;
    const config: StoredProviderConfig = JSON.parse(saved);
    // Retrieve apiKey from SecureStorage (encrypted, async)
    const apiKey = (await SecureStorage.get(`${config.provider}-apikey`)) ?? '';
    return {
      provider: config.provider as ProviderConfig['provider'],
      model: config.model ?? '',
      baseUrl: config.baseUrl,
      apiKey,
    };
  } catch { /* ignore */ }
  return null;
}

/**
 * Save provider config to localStorage (no secrets) + apiKey to SecureStorage.
 * @param config - Provider configuration to save
 */
export async function saveProviderConfig(config: ProviderConfig): Promise<void> {
  // Store apiKey securely in SecureStorage (AES-GCM encrypted)
  await SecureStorage.set(`${config.provider}-apikey`, config.apiKey);
  // Store non-secret config in localStorage
  const storedConfig: StoredProviderConfig = {
    provider: config.provider,
    model: config.model,
    baseUrl: config.baseUrl,
  };
  import('../../utils/storage').then(({ storageSet }) => { storageSet('settings', 'provider-config', storedConfig); }).catch(() => {});
  try { localStorage.setItem(PROVIDER_STORAGE_KEY, JSON.stringify(storedConfig)); } catch { /* ignore */ }
}
