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
  provider: 'anthropic' | 'openai' | 'deepseek' | 'ollama' | 'claude-bridge' | 'vercel-gateway';
  /** API key (empty for Ollama; Vercel AI Gateway key starts with vck_) */
  apiKey: string;
  /**
   * Model identifier. Format depends on provider:
   * - anthropic: bare model ID (`claude-sonnet-4-20250514`)
   * - openai: bare model ID (`gpt-4o-mini`)
   * - deepseek: bare model ID (`deepseek-v4-flash`, `deepseek-v4-pro`)
   * - vercel-gateway: namespaced model ID (`anthropic/claude-sonnet-4.6`,
   *   `deepseek/deepseek-v4-pro`, `openai/gpt-4o`, etc.) — the gateway
   *   routes by namespace.
   */
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
  { value: 'vercel-gateway', label: 'Vercel AI Gateway (Multi-Provider)', defaultModel: 'anthropic/claude-sonnet-4.6' },
  { value: 'claude-bridge', label: 'Claude Code (Bridge)', defaultModel: 'claude-code' },
  { value: 'anthropic', label: 'Anthropic (API)', defaultModel: 'claude-sonnet-4-20250514' },
  { value: 'openai', label: 'OpenAI (API)', defaultModel: 'gpt-4o-mini' },
  { value: 'deepseek', label: 'DeepSeek (API)', defaultModel: 'deepseek-v4-flash' },
  { value: 'ollama', label: 'Ollama (Local)', defaultModel: 'llama3' },
] as const;

/**
 * Available models per provider.
 *
 * Notes:
 * - `deepseek-chat` and `deepseek-reasoner` are still accepted by the API but
 *   are scheduled for deprecation 2026-07-24 (they alias `deepseek-v4-flash`
 *   non-thinking / thinking respectively). New configs should pick the V4
 *   model IDs directly. Aliases kept in the list until the deprecation date
 *   so existing saved configs continue to render correctly.
 * - `vercel-gateway` accepts namespaced IDs from any provider Vercel routes;
 *   the list below is a curated set of the best chat + tool-calling models
 *   available today. The dropdown is intentionally finite — paste-a-custom-ID
 *   support is queued for a follow-up.
 */
export const MODEL_OPTIONS: Record<string, string[]> = {
  'claude-bridge': ['claude-code'],
  anthropic: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514', 'claude-3-5-haiku-20241022'],
  openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo'],
  deepseek: ['deepseek-v4-flash', 'deepseek-v4-pro', 'deepseek-chat', 'deepseek-reasoner'],
  ollama: ['llama3', 'codellama', 'mistral', 'mixtral'],
  'vercel-gateway': [
    'anthropic/claude-sonnet-4.6',
    'anthropic/claude-sonnet-4.5',
    'anthropic/claude-opus-4.7',
    'anthropic/claude-opus-4.6',
    'deepseek/deepseek-v4-pro',
    'deepseek/deepseek-v4-flash',
    'openai/gpt-4o',
    'openai/gpt-4o-mini',
    'openai/o4-mini',
    'meta/llama-3.3-70b',
  ],
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
 * Load provider config synchronously from the legacy localStorage key (no
 * API key). Returns config with `apiKey: ''`. Use for initial render to avoid
 * flash; call `loadProviderConfig()` to hydrate the encrypted API key and
 * pick up any IDB-canonical (BUG-10) writes that happened in another tab.
 *
 * After legacy LS is migrated to IDB this returns null; the async
 * `loadProviderConfig` is the source of truth.
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
 * Load provider config from IDB canonical (BUG-10) + apiKey from SecureStorage.
 * Read-side migration from legacy LS happens via `migrateFromLocalStorage` so
 * existing users keep their saved provider after upgrade.
 *
 * @returns ProviderConfig or null if not set
 */
export async function loadProviderConfig(): Promise<ProviderConfig | null> {
  try {
    const { storageGet, migrateFromLocalStorage } = await import('../../utils/storage');
    let stored = await storageGet<StoredProviderConfig>('settings', 'provider-config');
    if (!stored) {
      stored = (await migrateFromLocalStorage<StoredProviderConfig>(
        PROVIDER_STORAGE_KEY,
        'settings',
        'provider-config',
      )) ?? undefined;
    }
    if (!stored) return null;
    const apiKey = (await SecureStorage.get(`${stored.provider}-apikey`)) ?? '';
    return {
      provider: stored.provider as ProviderConfig['provider'],
      model: stored.model ?? '',
      baseUrl: stored.baseUrl,
      apiKey,
    };
  } catch { /* ignore */ }
  return null;
}

/**
 * Save provider config to IDB canonical (BUG-10) + apiKey to SecureStorage.
 * @param config - Provider configuration to save
 */
export async function saveProviderConfig(config: ProviderConfig): Promise<void> {
  // Store apiKey securely in SecureStorage (AES-GCM encrypted)
  const stored = await SecureStorage.set(`${config.provider}-apikey`, config.apiKey);
  if (!stored) {
    console.warn('[SecureStorage] API key could not be stored; it may be lost on page refresh');
  }
  // Store non-secret config in IDB canonical (BUG-10).
  const storedConfig: StoredProviderConfig = {
    provider: config.provider,
    model: config.model,
    baseUrl: config.baseUrl,
  };
  const { storageSet } = await import('../../utils/storage');
  await storageSet('settings', 'provider-config', storedConfig);
}
