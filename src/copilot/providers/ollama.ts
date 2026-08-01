/**
 * Ollama Provider — local LLM inference via the Ollama HTTP API.
 *
 * Supports tool calling through system prompt injection, parsing structured
 * JSON responses from models that don't natively support function calling.
 *
 * Default endpoint: http://localhost:11434
 *
 * Supported models: llama3, codellama, mistral, mixtral (any Ollama model works).
 *
 * @module providers/ollama
 */

import type {
  LLMProvider,
  ChatMessage,
  ProviderToolDef,
  ProviderConfig,
  ProviderResponse,
  ProviderToolCall,
  StreamChunk,
} from './types';
import { safeGetItem } from '../../utils/safeStorage';

/** Default Ollama API URL */
export const OLLAMA_DEFAULT_URL = 'http://localhost:11434';

/** Available Ollama models */
export const OLLAMA_MODELS = ['llama3', 'codellama', 'mistral', 'mixtral'] as const;

/** Ollama-specific configuration key */
const OLLAMA_CONFIG_KEY = 'vina-ollama-config';

/**
 * Ollama connection configuration.
 */
export interface OllamaConfig {
  /** Ollama API base URL */
  url: string;
  /** Selected model */
  model: string;
  /** Whether to auto-detect Ollama on startup */
  autoDetect: boolean;
}

const DEFAULT_OLLAMA_CONFIG: OllamaConfig = { url: OLLAMA_DEFAULT_URL, model: 'llama3', autoDetect: true };

/** Module-level cache; sync API returns from cache, IDB persistence is the
 *  source of truth. Same shape as pluginManager.installedCache (BUG-10).
 *
 *  CACHE NOTE (BUG-10 / B6-state input):
 *  - Order-dependent staleness: if `loadOllamaConfig()` (sync, used in
 *    AgentSettings render) runs before `loadOllamaConfigAsync()`, the cache
 *    lazy-inits from legacy LS. Async hydrate reconciles only if it runs.
 *  - Silent IDB write failure: `saveOllamaConfig` fires the IDB write with
 *    `.catch(() => {})`; failed writes leave cache and IDB diverged silently.
 *    Same failure class the canonical eliminated for the 6 non-cached sites;
 *    preserved here intentionally to keep the sync API contract.
 *  Resolution deferred to B6-state Fase 2 — sync API policy decision. */
let ollamaConfigCache: OllamaConfig | null = null;

function readLegacyLS(): OllamaConfig | null {
  try {
    const saved = safeGetItem(OLLAMA_CONFIG_KEY);
    if (saved) return JSON.parse(saved) as OllamaConfig;
  } catch { /* ignore */ }
  return null;
}

/**
 * Load Ollama configuration synchronously. Returns the in-memory cache
 * (lazy-initialized from legacy LS). New callers should prefer
 * `loadOllamaConfigAsync` to ensure IDB is consulted (BUG-10 canonical);
 * sync is the right choice only when the caller cannot await.
 */
export function loadOllamaConfig(): OllamaConfig {
  if (ollamaConfigCache === null) ollamaConfigCache = readLegacyLS() ?? { ...DEFAULT_OLLAMA_CONFIG };
  return { ...ollamaConfigCache };
}

/**
 * Async authoritative load: IDB primary + read-side migration from legacy LS.
 * Populates the in-memory cache so subsequent sync reads see the IDB state.
 * BUG-10 canonical.
 */
export async function loadOllamaConfigAsync(): Promise<OllamaConfig> {
  const { storageGet, migrateFromLocalStorage } = await import('../../utils/storage');
  const existing = await storageGet<OllamaConfig>('settings', 'ollama-config');
  if (existing) {
    ollamaConfigCache = existing;
    return { ...existing };
  }
  const migrated = await migrateFromLocalStorage<OllamaConfig>(
    OLLAMA_CONFIG_KEY,
    'settings',
    'ollama-config',
  );
  ollamaConfigCache = migrated ?? { ...DEFAULT_OLLAMA_CONFIG };
  return { ...ollamaConfigCache };
}

/**
 * Save Ollama configuration. Updates the in-memory cache synchronously and
 * persists via the IDB canonical asynchronously (BUG-10).
 *
 * @param config - Configuration to save
 */
export function saveOllamaConfig(config: OllamaConfig): void {
  ollamaConfigCache = { ...config };
  import('../../utils/storage').then(({ storageSet }) => storageSet('settings', 'ollama-config', config)).catch(() => {});
}

/** Test helper: reset the in-memory cache so beforeEach setups start clean. */
export function _resetOllamaConfigCacheForTests(): void {
  ollamaConfigCache = null;
}

/**
 * Check if Ollama is running and accessible.
 *
 * Makes a lightweight request to the Ollama API root to verify connectivity.
 *
 * @param url - Ollama API base URL (default: http://localhost:11434)
 * @returns Whether Ollama is reachable
 */
export async function detectOllama(url: string = OLLAMA_DEFAULT_URL): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(`${url}/api/tags`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * List available models from the Ollama instance.
 *
 * @param url - Ollama API base URL
 * @returns Array of model names, or empty array if unreachable
 */
export async function listOllamaModels(url: string = OLLAMA_DEFAULT_URL): Promise<string[]> {
  try {
    const response = await fetch(`${url}/api/tags`);
    if (!response.ok) return [];
    const data = await response.json();
    const models = data.models as Array<{ name: string }> | undefined;
    return models?.map(m => m.name) ?? [];
  } catch {
    return [];
  }
}

// ─── Tool Prompt Injection ──────────────────────────────────────────────────

/**
 * Build a system prompt suffix that teaches the model about available tools.
 *
 * Since Ollama models may not natively support function calling, we inject
 * tool definitions as structured instructions and parse JSON responses.
 *
 * @param tools - Available tool definitions
 * @returns System prompt suffix with tool instructions
 */
function buildToolSystemPrompt(tools: ProviderToolDef[]): string {
  if (tools.length === 0) return '';

  const toolDescriptions = tools.map(t => {
    const params = Object.entries(t.parameters.properties)
      .map(([name, prop]) => {
        const required = t.parameters.required?.includes(name) ? ' (required)' : ' (optional)';
        return `    - ${name}: ${prop.type}${required} — ${prop.description || ''}`;
      })
      .join('\n');
    return `  ${t.name}: ${t.description}\n    Parameters:\n${params}`;
  }).join('\n\n');

  return `\n\n## Available Tools
You have access to these tools. To use a tool, include a JSON block in your response:

\`\`\`json
{"tool_calls": [{"name": "TOOL_NAME", "arguments": {PARAMS}}]}
\`\`\`

You may call multiple tools at once. After tool calls, explain what you did.

Tools:
${toolDescriptions}

IMPORTANT: Only use tool_calls JSON when you need to execute an action. For regular conversation, just respond normally without JSON.`;
}

/**
 * Parse tool calls from a model response that uses prompt-injected tool format.
 *
 * Looks for JSON blocks containing `tool_calls` arrays.
 *
 * @param content - The model's response text
 * @returns Parsed tool calls and cleaned text content
 */
export function parseToolCallsFromText(content: string): {
  toolCalls: ProviderToolCall[];
  cleanedText: string;
} {
  const toolCalls: ProviderToolCall[] = [];
  let cleanedText = content;

  // Match JSON blocks with tool_calls
  const jsonPattern = /```json\s*\n?([\s\S]*?)\n?\s*```/g;
  let match;

  while ((match = jsonPattern.exec(content)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed.tool_calls && Array.isArray(parsed.tool_calls)) {
        for (const tc of parsed.tool_calls) {
          if (tc.name) {
            toolCalls.push({
              // format-asserted by test (`ollama.test.ts:128` checks `^ollama-/`)
              // — see B10-state. NOT migrated to newId().
              id: `ollama-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              name: tc.name,
              arguments: JSON.stringify(tc.arguments || {}),
            });
          }
        }
        // Remove the JSON block from displayed text
        cleanedText = cleanedText.replace(match[0], '').trim();
      }
    } catch {
      // Not valid tool call JSON, keep as is
    }
  }

  // Also try to match inline JSON (without code fences)
  if (toolCalls.length === 0) {
    const inlinePattern = /\{"tool_calls"\s*:\s*\[[\s\S]*?\]\s*\}/g;
    let inlineMatch;
    while ((inlineMatch = inlinePattern.exec(content)) !== null) {
      try {
        const parsed = JSON.parse(inlineMatch[0]);
        if (parsed.tool_calls && Array.isArray(parsed.tool_calls)) {
          for (const tc of parsed.tool_calls) {
            if (tc.name) {
              toolCalls.push({
                // format-asserted by test (`ollama.test.ts:128` checks `^ollama-/`)
              // — see B10-state. NOT migrated to newId().
              id: `ollama-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                name: tc.name,
                arguments: JSON.stringify(tc.arguments || {}),
              });
            }
          }
          cleanedText = cleanedText.replace(inlineMatch[0], '').trim();
        }
      } catch {
        // Not valid JSON
      }
    }
  }

  return { toolCalls, cleanedText };
}

// ─── Message Conversion ─────────────────────────────────────────────────────

interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Convert ChatMessage array to Ollama's message format.
 *
 * Ollama uses a simpler message format without tool_call metadata.
 * Tool results are formatted as user messages.
 */
function toOllamaMessages(messages: ChatMessage[], tools: ProviderToolDef[]): OllamaMessage[] {
  const result: OllamaMessage[] = [];
  let systemContent = '';

  for (const msg of messages) {
    if (msg.role === 'system') {
      systemContent += (systemContent ? '\n\n' : '') + msg.content;
      continue;
    }

    if (msg.role === 'tool') {
      // Format tool results as user messages
      result.push({
        role: 'user',
        content: `[Tool Result for ${msg.tool_call_id || 'unknown'}]: ${msg.content}`,
      });
      continue;
    }

    if (msg.role === 'assistant') {
      let content = msg.content;
      // If assistant had tool calls, include them in the content for context
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        const tcSummary = msg.tool_calls
          .map(tc => `Called ${tc.name}(${tc.arguments})`)
          .join(', ');
        content = content ? `${content}\n[${tcSummary}]` : `[${tcSummary}]`;
      }
      result.push({ role: 'assistant', content });
      continue;
    }

    // Regular user message
    result.push({ role: msg.role, content: msg.content });
  }

  // Append tool instructions to system prompt
  if (tools.length > 0) {
    systemContent += buildToolSystemPrompt(tools);
  }

  if (systemContent) {
    result.unshift({ role: 'system', content: systemContent });
  }

  return result;
}

// ─── Ollama Provider ────────────────────────────────────────────────────────

/**
 * Ollama LLM Provider — local inference via the Ollama API.
 */
export const ollamaProvider: LLMProvider = {
  name: 'Ollama (Local)',

  async send(
    messages: ChatMessage[],
    tools: ProviderToolDef[],
    config: ProviderConfig,
  ): Promise<ProviderResponse> {
    const baseUrl = config.baseUrl || OLLAMA_DEFAULT_URL;
    const ollamaMessages = toOllamaMessages(messages, tools);

    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.model,
        messages: ollamaMessages,
        stream: false,
        options: {
          num_predict: config.maxTokens || 4096,
        },
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Ollama API error ${response.status}: ${text}`);
    }

    const data = await response.json();
    const fullContent = data.message?.content || '';

    // Parse tool calls from the response text
    const { toolCalls, cleanedText } = parseToolCallsFromText(fullContent);

    // Estimate token usage from Ollama's response
    const promptTokens = data.prompt_eval_count || 0;
    const completionTokens = data.eval_count || 0;

    return {
      content: cleanedText,
      toolCalls,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      },
    };
  },

  async stream(
    messages: ChatMessage[],
    tools: ProviderToolDef[],
    config: ProviderConfig,
    onChunk: (chunk: StreamChunk) => void,
  ): Promise<ProviderResponse> {
    const baseUrl = config.baseUrl || OLLAMA_DEFAULT_URL;
    const ollamaMessages = toOllamaMessages(messages, tools);

    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.model,
        messages: ollamaMessages,
        stream: true,
        options: {
          num_predict: config.maxTokens || 4096,
        },
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Ollama API error ${response.status}: ${text}`);
    }

    let fullContent = '';
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);
          if (event.message?.content) {
            fullContent += event.message.content;
            onChunk({ type: 'text', content: event.message.content });
          }
          if (event.done) {
            // Parse tool calls from the complete response
            const { toolCalls, cleanedText } = parseToolCallsFromText(fullContent);

            // Emit tool call events
            for (const tc of toolCalls) {
              onChunk({ type: 'tool_call_start', toolCall: { id: tc.id, name: tc.name } });
              onChunk({ type: 'tool_call_end', toolCall: tc });
            }

            onChunk({ type: 'done' });

            return {
              content: cleanedText,
              toolCalls,
              usage: {
                promptTokens: event.prompt_eval_count || 0,
                completionTokens: event.eval_count || 0,
                totalTokens: (event.prompt_eval_count || 0) + (event.eval_count || 0),
              },
            };
          }
        } catch {
          // Skip unparseable lines
        }
      }
    }

    // If we get here without a done event, parse what we have
    const { toolCalls, cleanedText } = parseToolCallsFromText(fullContent);
    onChunk({ type: 'done' });

    return { content: cleanedText, toolCalls };
  },
};
