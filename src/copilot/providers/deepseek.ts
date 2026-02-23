/**
 * DeepSeek Provider — OpenAI-compatible API.
 *
 * Uses the same ChatCompletions format as OpenAI.
 * Base URL: https://api.deepseek.com
 *
 * @module deepseekProvider
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

const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';

function withDeepSeekConfig(config: ProviderConfig): ProviderConfig {
  return {
    ...config,
    baseUrl: config.baseUrl || DEEPSEEK_BASE_URL,
  };
}

/**
 * DeepSeek LLM Provider — delegates to OpenAI provider with DeepSeek base URL.
 */
export const deepseekProvider: LLMProvider = {
  name: 'DeepSeek',

  send(
    messages: ChatMessage[],
    tools: ProviderToolDef[],
    config: ProviderConfig,
  ): Promise<ProviderResponse> {
    return openaiProvider.send(messages, tools, withDeepSeekConfig(config));
  },

  stream(
    messages: ChatMessage[],
    tools: ProviderToolDef[],
    config: ProviderConfig,
    onChunk: (chunk: StreamChunk) => void,
  ): Promise<ProviderResponse> {
    return openaiProvider.stream(messages, tools, withDeepSeekConfig(config), onChunk);
  },
};
