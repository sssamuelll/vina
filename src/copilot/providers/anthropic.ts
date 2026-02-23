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
    // ── 1. Convert messages ──
    let anthropicMessages: AnthropicMessage[];
    let system: string;
    try {
      const converted = toAnthropicMessages(messages);
      system = converted.system;
      anthropicMessages = converted.messages;
    } catch (e) {
      throw new Error(`Message conversion failed: ${e instanceof Error ? e.message : e}`);
    }

    // ── 2. Validate config ──
    const baseUrl = resolveBaseUrl(config.baseUrl);
    const apiKey = String(config.apiKey ?? '').trim();

    console.log('[Anthropic] config check:', {
      apiKeyLength: apiKey.length,
      apiKeyPrefix: apiKey.slice(0, 8) + '...',
      provider: config.provider,
      model: config.model,
      baseUrl,
    });

    if (!apiKey) {
      throw new Error('🔑 API key is missing. Go to Settings (⚙️) and enter your Anthropic API key.');
    }

    // ── 3. Build request ──
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

    console.log('[Anthropic] request:', {
      url,
      messageCount: anthropicMessages.length,
      toolCount: tools.length,
      bodyBytes: payload.length,
      hasSystem: !!system,
    });

    // ── 4. Fetch with streaming ──
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    };

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers,
        body: payload,
      });
    } catch (fetchError) {
      // Log everything we can about the failure
      console.error('[Anthropic] fetch threw:', {
        error: fetchError,
        errorType: fetchError?.constructor?.name,
        message: fetchError instanceof Error ? fetchError.message : String(fetchError),
        url,
        headersKeys: Object.keys(headers),
        bodyLength: payload.length,
      });
      throw new Error(
        `Failed to connect to AI provider.\n` +
        `URL: ${url}\n` +
        `Error: ${fetchError instanceof Error ? fetchError.message : fetchError}\n` +
        `Try: Check browser console Network tab for blocked requests.`
      );
    }

    console.log('[Anthropic] response:', {
      status: response.status,
      statusText: response.statusText,
      hasBody: !!response.body,
      contentType: response.headers.get('content-type'),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Anthropic API error ${response.status}: ${text.slice(0, 500)}`);
    }

    // ── 5. Parse SSE stream ──
    if (!response.body) {
      // No streaming support — fall back to reading full response
      console.warn('[Anthropic] No ReadableStream, falling back to non-streaming');
      const data = await response.json();
      return parseAnthropicResponse(data);
    }

    let fullContent = '';
    const toolCalls: ProviderToolCall[] = [];
    let currentToolId = '';
    let currentToolName = '';
    let currentToolArgs = '';

    const reader = response.body.getReader();
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
        } catch { /* skip unparseable SSE lines */ }
      }
    }

    console.log('[Anthropic] stream complete:', {
      contentLength: fullContent.length,
      toolCallCount: toolCalls.length,
    });

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
