/**
 * Anthropic Claude Provider — Messages API with tool use.
 *
 * @module anthropicProvider
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

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: AnthropicContent[] | string;
}

type AnthropicContent =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string };

interface AnthropicTool {
  name: string;
  description: string;
  input_schema: ProviderToolDef['parameters'];
}

/**
 * Convert our ChatMessage format to Anthropic's format.
 * Anthropic uses a different message structure with content blocks.
 */
function toAnthropicMessages(messages: ChatMessage[]): { system: string; messages: AnthropicMessage[] } {
  let system = '';
  const result: AnthropicMessage[] = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      system += (system ? '\n\n' : '') + msg.content;
      continue;
    }

    if (msg.role === 'assistant') {
      const content: AnthropicContent[] = [];
      if (msg.content) {
        content.push({ type: 'text', text: msg.content });
      }
      if (msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          content.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.name,
            input: JSON.parse(tc.arguments),
          });
        }
      }
      result.push({ role: 'assistant', content });
      continue;
    }

    if (msg.role === 'tool') {
      // Anthropic expects tool results as user messages with tool_result content
      const lastMsg = result[result.length - 1];
      if (lastMsg && lastMsg.role === 'user' && Array.isArray(lastMsg.content)) {
        (lastMsg.content as AnthropicContent[]).push({
          type: 'tool_result',
          tool_use_id: msg.tool_call_id || '',
          content: msg.content,
        });
      } else {
        result.push({
          role: 'user',
          content: [{
            type: 'tool_result',
            tool_use_id: msg.tool_call_id || '',
            content: msg.content,
          }],
        });
      }
      continue;
    }

    // Regular user message
    result.push({ role: 'user', content: msg.content });
  }

  return { system, messages: result };
}

function toAnthropicTools(tools: ProviderToolDef[]): AnthropicTool[] {
  return tools.map(t => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }));
}

/**
 * Anthropic Claude LLM Provider.
 */
export const anthropicProvider: LLMProvider = {
  name: 'Anthropic Claude',

  async send(
    messages: ChatMessage[],
    tools: ProviderToolDef[],
    config: ProviderConfig,
  ): Promise<ProviderResponse> {
    const { system, messages: anthropicMessages } = toAnthropicMessages(messages);
    const baseUrl = config.baseUrl || 'https://api.anthropic.com';

    const body: Record<string, unknown> = {
      model: config.model,
      max_tokens: config.maxTokens || 4096,
      messages: anthropicMessages,
    };
    if (system) body.system = system;
    if (tools.length > 0) body.tools = toAnthropicTools(tools);

    const response = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Anthropic API error ${response.status}: ${text}`);
    }

    const data = await response.json();
    return parseAnthropicResponse(data);
  },

  async stream(
    messages: ChatMessage[],
    tools: ProviderToolDef[],
    config: ProviderConfig,
    onChunk: (chunk: StreamChunk) => void,
  ): Promise<ProviderResponse> {
    let anthropicMessages: AnthropicMessage[];
    let system: string;
    try {
      const converted = toAnthropicMessages(messages);
      system = converted.system;
      anthropicMessages = converted.messages;
    } catch (e) {
      throw new Error(`Message conversion failed: ${e instanceof Error ? e.message : e}`);
    }
    const baseUrl = config.baseUrl || 'https://api.anthropic.com';

    const body: Record<string, unknown> = {
      model: config.model,
      max_tokens: config.maxTokens || 4096,
      messages: anthropicMessages,
      stream: true,
    };
    if (system) body.system = system;
    if (tools.length > 0) body.tools = toAnthropicTools(tools);

    const response = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Anthropic API error ${response.status}: ${text}`);
    }

    if (!response.body) {
      // Fallback to non-streaming if ReadableStream not available
      const data = await response.json();
      return parseAnthropicResponse(data);
    }

    // Read SSE stream
    let fullContent = '';
    const toolCalls: ProviderToolCall[] = [];
    let currentToolId = '';
    let currentToolName = '';
    let currentToolArgs = '';

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
        if (jsonStr === '[DONE]') continue;

        try {
          const event = JSON.parse(jsonStr);

          switch (event.type) {
            case 'content_block_start': {
              if (event.content_block?.type === 'tool_use') {
                currentToolId = event.content_block.id;
                currentToolName = event.content_block.name;
                currentToolArgs = '';
                onChunk({ type: 'tool_call_start', toolCall: { id: currentToolId, name: currentToolName } });
              }
              break;
            }
            case 'content_block_delta': {
              if (event.delta?.type === 'text_delta') {
                fullContent += event.delta.text;
                onChunk({ type: 'text', content: event.delta.text });
              } else if (event.delta?.type === 'input_json_delta') {
                currentToolArgs += event.delta.partial_json;
                onChunk({ type: 'tool_call_delta', toolCall: { id: currentToolId } });
              }
              break;
            }
            case 'content_block_stop': {
              if (currentToolId && currentToolName) {
                toolCalls.push({
                  id: currentToolId,
                  name: currentToolName,
                  arguments: currentToolArgs || '{}',
                });
                onChunk({ type: 'tool_call_end', toolCall: { id: currentToolId, name: currentToolName, arguments: currentToolArgs } });
                currentToolId = '';
                currentToolName = '';
                currentToolArgs = '';
              }
              break;
            }
            case 'message_stop': {
              onChunk({ type: 'done' });
              break;
            }
          }
        } catch {
          // Skip unparseable lines
        }
      }
    }

    return { content: fullContent, toolCalls };
  },
};

function parseAnthropicResponse(data: Record<string, unknown>): ProviderResponse {
  let content = '';
  const toolCalls: ProviderToolCall[] = [];

  const contentBlocks = data.content as Array<Record<string, unknown>>;
  if (Array.isArray(contentBlocks)) {
    for (const block of contentBlocks) {
      if (block.type === 'text') {
        content += block.text as string;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id as string,
          name: block.name as string,
          arguments: JSON.stringify(block.input),
        });
      }
    }
  }

  const usage = data.usage as Record<string, number> | undefined;

  return {
    content,
    toolCalls,
    usage: usage ? {
      promptTokens: usage.input_tokens || 0,
      completionTokens: usage.output_tokens || 0,
      totalTokens: (usage.input_tokens || 0) + (usage.output_tokens || 0),
    } : undefined,
  };
}
