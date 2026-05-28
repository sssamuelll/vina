/**
 * Vercel AI Gateway Provider — multi-provider routing via a single endpoint.
 *
 * The gateway exposes an OpenAI-compatible Chat Completions API at
 * `https://ai-gateway.vercel.sh/v1/chat/completions` that routes to ANY
 * supported provider (Anthropic, OpenAI, DeepSeek, Google, Meta, Mistral,
 * etc.) based on a namespaced model ID like `anthropic/claude-sonnet-4.6`
 * or `deepseek/deepseek-v4-pro`. One key (Vercel AI Gateway key, starts
 * with `vck_`) gives access to all providers; billing is centralized
 * through Vercel.
 *
 * Why this provider exists alongside the direct ones:
 * - **Native tool calling** uniformly across providers. The gateway speaks
 *   the OpenAI `tools` + `tool_choice` shape regardless of the underlying
 *   provider, which sidesteps the structured-output workaround needed for
 *   the Claude CLI shim (M2 finding 2026-05-28).
 * - **One key, many models.** Useful for comparing Sonnet 4.6 vs DeepSeek
 *   V4-Pro on the same agentic flow without reconfiguring.
 * - **Centralized billing / observability** via Vercel's dashboard.
 *
 * Tradeoffs the user should know:
 * - Extra hop adds ~50ms vs direct provider calls.
 * - Vercel applies a small markup over raw provider pricing.
 * - Third-party dependency: if Vercel AI Gateway is down, this provider
 *   is too. The direct providers (`anthropic`, `openai`, `deepseek`)
 *   remain as fallbacks.
 *
 * Implementation: thin delegate to `openaiProvider` with the gateway base
 * URL — identical pattern to `deepseekProvider`. The OpenAI wire format
 * works as-is.
 *
 * @module vercelGatewayProvider
 */

import type {
  LLMProvider,
  ChatMessage,
  ProviderToolDef,
  ProviderConfig,
  ProviderResponse,
  StreamChunk,
} from './types';
import { openaiProvider } from './openai';

const VERCEL_GATEWAY_BASE_URL = 'https://ai-gateway.vercel.sh';

function withGatewayConfig(config: ProviderConfig): ProviderConfig {
  return {
    ...config,
    baseUrl: config.baseUrl || VERCEL_GATEWAY_BASE_URL,
  };
}

export const vercelGatewayProvider: LLMProvider = {
  name: 'Vercel AI Gateway',

  send(
    messages: ChatMessage[],
    tools: ProviderToolDef[],
    config: ProviderConfig,
  ): Promise<ProviderResponse> {
    return openaiProvider.send(messages, tools, withGatewayConfig(config));
  },

  stream(
    messages: ChatMessage[],
    tools: ProviderToolDef[],
    config: ProviderConfig,
    onChunk: (chunk: StreamChunk) => void,
  ): Promise<ProviderResponse> {
    return openaiProvider.stream(messages, tools, withGatewayConfig(config), onChunk);
  },
};
