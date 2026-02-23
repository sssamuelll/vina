/**
 * OpenAI Provider — ChatCompletions API with function calling.
 *
 * In production, routes through /api/openai/ proxy to avoid CORS.
 *
 * @module openaiProvider
 */

function resolveOpenAIBaseUrl(configBaseUrl?: string): string {
  if (configBaseUrl) return configBaseUrl;
  if (typeof window !== 'undefined' && !window.location.hostname.includes('localhost')) {
    return `${window.location.origin}/api/openai`;
  }
  return 'https://api.openai.com';
}

import type {
  LLMProvider,
  ChatMessage,
  ProviderToolDef,
  ProviderConfig,
  ProviderResponse,
  ProviderToolCall,
  StreamChunk,
} from './types';

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: ProviderToolDef['parameters'];
  };
}

function toOpenAIMessages(messages: ChatMessage[]): OpenAIMessage[] {
  return messages.map(msg => {
    if (msg.role === 'assistant' && msg.tool_calls) {
      return {
        role: 'assistant' as const,
        content: msg.content || null,
        tool_calls: msg.tool_calls.map(tc => ({
          id: tc.id,
          type: 'function' as const,
          function: { name: tc.name, arguments: tc.arguments },
        })),
      };
    }
    if (msg.role === 'tool') {
      return {
        role: 'tool' as const,
        content: msg.content,
        tool_call_id: msg.tool_call_id,
      };
    }
    return {
      role: msg.role,
      content: msg.content,
    };
  });
}

function toOpenAITools(tools: ProviderToolDef[]): OpenAITool[] {
  return tools.map(t => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

/**
 * OpenAI LLM Provider.
 */
export const openaiProvider: LLMProvider = {
  name: 'OpenAI',

  async send(
    messages: ChatMessage[],
    tools: ProviderToolDef[],
    config: ProviderConfig,
  ): Promise<ProviderResponse> {
    const baseUrl = resolveOpenAIBaseUrl(config.baseUrl);

    const body: Record<string, unknown> = {
      model: config.model,
      messages: toOpenAIMessages(messages),
      max_tokens: config.maxTokens || 4096,
    };
    if (tools.length > 0) {
      body.tools = toOpenAITools(tools);
      body.tool_choice = 'auto';
    }

    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${text}`);
    }

    const data = await response.json();
    return parseOpenAIResponse(data);
  },

  async stream(
    messages: ChatMessage[],
    tools: ProviderToolDef[],
    config: ProviderConfig,
    onChunk: (chunk: StreamChunk) => void,
  ): Promise<ProviderResponse> {
    const baseUrl = resolveOpenAIBaseUrl(config.baseUrl);

    const body: Record<string, unknown> = {
      model: config.model,
      messages: toOpenAIMessages(messages),
      max_tokens: config.maxTokens || 4096,
      stream: true,
    };
    if (tools.length > 0) {
      body.tools = toOpenAITools(tools);
      body.tool_choice = 'auto';
    }

    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${text}`);
    }

    let fullContent = '';
    const toolCallsMap: Map<number, { id: string; name: string; arguments: string }> = new Map();

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
        if (!line.startsWith('data: ')) continue;
        const jsonStr = line.slice(6).trim();
        if (jsonStr === '[DONE]') {
          onChunk({ type: 'done' });
          continue;
        }

        try {
          const event = JSON.parse(jsonStr);
          const delta = event.choices?.[0]?.delta;
          if (!delta) continue;

          // Text content
          if (delta.content) {
            fullContent += delta.content;
            onChunk({ type: 'text', content: delta.content });
          }

          // Tool calls
          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index as number;
              if (!toolCallsMap.has(idx)) {
                toolCallsMap.set(idx, {
                  id: tc.id || '',
                  name: tc.function?.name || '',
                  arguments: '',
                });
                onChunk({ type: 'tool_call_start', toolCall: { id: tc.id, name: tc.function?.name } });
              }
              const existing = toolCallsMap.get(idx)!;
              if (tc.id) existing.id = tc.id;
              if (tc.function?.name) existing.name = tc.function.name;
              if (tc.function?.arguments) {
                existing.arguments += tc.function.arguments;
                onChunk({ type: 'tool_call_delta', toolCall: { id: existing.id } });
              }
            }
          }
        } catch {
          // Skip unparseable lines
        }
      }
    }

    // Finalize tool calls
    const toolCalls: ProviderToolCall[] = [];
    for (const tc of toolCallsMap.values()) {
      toolCalls.push({
        id: tc.id,
        name: tc.name,
        arguments: tc.arguments || '{}',
      });
      onChunk({ type: 'tool_call_end', toolCall: { id: tc.id, name: tc.name, arguments: tc.arguments } });
    }

    return { content: fullContent, toolCalls };
  },
};

function parseOpenAIResponse(data: Record<string, unknown>): ProviderResponse {
  const choices = data.choices as Array<Record<string, unknown>>;
  const message = choices?.[0]?.message as Record<string, unknown>;

  const content = (message?.content as string) || '';
  const toolCalls: ProviderToolCall[] = [];

  const rawToolCalls = message?.tool_calls as Array<Record<string, unknown>> | undefined;
  if (rawToolCalls) {
    for (const tc of rawToolCalls) {
      const fn = tc.function as Record<string, string>;
      toolCalls.push({
        id: tc.id as string,
        name: fn.name,
        arguments: fn.arguments || '{}',
      });
    }
  }

  const usage = data.usage as Record<string, number> | undefined;

  return {
    content,
    toolCalls,
    usage: usage ? {
      promptTokens: usage.prompt_tokens || 0,
      completionTokens: usage.completion_tokens || 0,
      totalTokens: usage.total_tokens || 0,
    } : undefined,
  };
}
