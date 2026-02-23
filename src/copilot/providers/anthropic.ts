/**
 * Anthropic Claude Provider — Messages API with tool use.
 *
 * In production (openclo.sdar.dev), routes through /api/anthropic/ proxy
 * to avoid CORS issues with direct browser→API calls.
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

/**
 * Resolve the Anthropic API base URL.
 * In production, use the CORS proxy at /api/anthropic to avoid browser CORS blocks.
 * In development (localhost), call Anthropic directly.
 */
function resolveBaseUrl(configBaseUrl?: string): string {
  if (configBaseUrl) return configBaseUrl;
  // Use proxy in production to avoid CORS
  if (typeof window !== 'undefined' && !window.location.hostname.includes('localhost')) {
    return `${window.location.origin}/api/anthropic`;
  }
  return 'https://api.anthropic.com';
}

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
    const baseUrl = resolveBaseUrl(config.baseUrl);
    const apiKey = String(config.apiKey || '').trim();
    if (!apiKey) throw new Error('API key is missing. Go to Settings (⚙️) and enter your Anthropic API key.');

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
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
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
    const baseUrl = resolveBaseUrl(config.baseUrl);

    const apiKey = String(config.apiKey || '').trim();
    console.log('[Anthropic] apiKey length:', apiKey.length, '| provider:', config.provider, '| model:', config.model);
    if (!apiKey) {
      throw new Error('API key is missing. Go to Settings (⚙️) and enter your Anthropic API key.');
    }

    const body: Record<string, unknown> = {
      model: config.model,
      max_tokens: config.maxTokens || 4096,
      messages: anthropicMessages,
      stream: true,
    };
    if (system) body.system = system;
    if (tools.length > 0) body.tools = toAnthropicTools(tools);

    const url = `${baseUrl}/v1/messages`;
    const payload = JSON.stringify(body);
    console.log('[Anthropic] POST', url, '| model:', config.model, '| messages:', anthropicMessages.length, '| bodySize:', payload.length);

    // Use XHR for streaming — more reliable across browsers (Safari fetch+streaming is buggy)
    return new Promise<ProviderResponse>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.setRequestHeader('x-api-key', apiKey);
      xhr.setRequestHeader('anthropic-version', '2023-06-01');

      let fullContent = '';
      const toolCalls: ProviderToolCall[] = [];
      let currentToolId = '';
      let currentToolName = '';
      let currentToolArgs = '';
      let lastProcessed = 0;

      function processChunk(text: string) {
        const lines = text.split('\n');
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') continue;
          try {
            const event = JSON.parse(jsonStr);
            switch (event.type) {
              case 'content_block_start':
                if (event.content_block?.type === 'tool_use') {
                  currentToolId = event.content_block.id;
                  currentToolName = event.content_block.name;
                  currentToolArgs = '';
                  onChunk({ type: 'tool_call_start', toolCall: { id: currentToolId, name: currentToolName } });
                }
                break;
              case 'content_block_delta':
                if (event.delta?.type === 'text_delta') {
                  fullContent += event.delta.text;
                  onChunk({ type: 'text', content: event.delta.text });
                } else if (event.delta?.type === 'input_json_delta') {
                  currentToolArgs += event.delta.partial_json;
                  onChunk({ type: 'tool_call_delta', toolCall: { id: currentToolId } });
                }
                break;
              case 'content_block_stop':
                if (currentToolId && currentToolName) {
                  toolCalls.push({ id: currentToolId, name: currentToolName, arguments: currentToolArgs || '{}' });
                  onChunk({ type: 'tool_call_end', toolCall: { id: currentToolId, name: currentToolName, arguments: currentToolArgs } });
                  currentToolId = '';
                  currentToolName = '';
                  currentToolArgs = '';
                }
                break;
              case 'message_stop':
                onChunk({ type: 'done' });
                break;
            }
          } catch { /* skip unparseable */ }
        }
      }

      xhr.onprogress = () => {
        const newText = xhr.responseText.substring(lastProcessed);
        lastProcessed = xhr.responseText.length;
        if (newText) processChunk(newText);
      };

      xhr.onload = () => {
        // Process any remaining text
        const remaining = xhr.responseText.substring(lastProcessed);
        if (remaining) processChunk(remaining);

        if (xhr.status >= 200 && xhr.status < 300) {
          resolve({ content: fullContent, toolCalls });
        } else {
          reject(new Error(`Anthropic API error ${xhr.status}: ${xhr.responseText.slice(0, 500)}`));
        }
      };

      xhr.onerror = () => {
        console.error('[Anthropic] XHR error, status:', xhr.status, 'readyState:', xhr.readyState);
        reject(new Error(`Network error calling ${url} (XHR status ${xhr.status})`));
      };

      xhr.ontimeout = () => {
        reject(new Error('Request timed out'));
      };

      xhr.timeout = 120000; // 2 minutes
      xhr.send(payload);
    });
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
