/**
 * Claude Bridge Provider — connects to local claude-bridge server.
 *
 * Uses Claude Code CLI via a bridge server, so it works with Claude Max
 * subscription (no API credits needed).
 *
 * @module claudeBridgeProvider
 */

import type {
  LLMProvider,
  ChatMessage,
  ProviderToolDef,
  ProviderConfig,
  ProviderResponse,
  StreamChunk,
} from './types';

const DEFAULT_BRIDGE_URL = 'http://localhost:3200';

function resolveBridgeUrl(config: ProviderConfig): string {
  return config.baseUrl || DEFAULT_BRIDGE_URL;
}

/**
 * Build a text context from chat messages for the bridge.
 * The bridge doesn't support tool calling natively, so we convert
 * tools to a text description and rely on Claude's intelligence.
 */
function buildContext(messages: ChatMessage[], tools: ProviderToolDef[]): string {
  const parts: string[] = [];

  // System messages
  for (const m of messages) {
    if (m.role === 'system') parts.push(m.content);
  }

  // Available tools description
  if (tools.length > 0) {
    parts.push('\n## Available Tools');
    parts.push('You can call tools by responding with JSON blocks like: ```tool\n{"name": "toolName", "params": {...}}\n```');
    parts.push('Available tools:');
    for (const t of tools) {
      parts.push(`- **${t.name}**: ${t.description}`);
    }
  }

  // Conversation history (skip system messages)
  const history = messages.filter(m => m.role !== 'system');
  if (history.length > 1) { // More than just the last user message
    parts.push('\n## Conversation');
    for (const m of history.slice(0, -1)) { // Exclude last (it goes as `message`)
      const prefix = m.role === 'user' ? 'User' : m.role === 'assistant' ? 'Assistant' : 'System';
      parts.push(`${prefix}: ${m.content}`);
    }
  }

  return parts.join('\n');
}

export const claudeBridgeProvider: LLMProvider = {
  name: 'Claude Bridge (Local)',

  async send(
    messages: ChatMessage[],
    tools: ProviderToolDef[],
    config: ProviderConfig,
  ): Promise<ProviderResponse> {
    const bridgeUrl = resolveBridgeUrl(config);
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    const context = buildContext(messages, tools);

    const response = await fetch(`${bridgeUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: lastUserMsg?.content || '',
        context,
      }),
    });

    if (!response.ok) {
      throw new Error(`Bridge error ${response.status}: ${await response.text()}`);
    }

    // Read full SSE response
    const text = await response.text();
    let content = '';
    for (const line of text.split('\n')) {
      if (!line.startsWith('data: ')) continue;
      try {
        const event = JSON.parse(line.slice(6));
        if (event.type === 'text') content += event.content;
      } catch { /* skip */ }
    }

    return { content, toolCalls: [] };
  },

  async stream(
    messages: ChatMessage[],
    tools: ProviderToolDef[],
    config: ProviderConfig,
    onChunk: (chunk: StreamChunk) => void,
  ): Promise<ProviderResponse> {
    const bridgeUrl = resolveBridgeUrl(config);
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    const context = buildContext(messages, tools);

    console.log('[ClaudeBridge] POST', `${bridgeUrl}/chat`, '| message:', lastUserMsg?.content?.slice(0, 50));

    const response = await fetch(`${bridgeUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: lastUserMsg?.content || '',
        context,
      }),
    });

    if (!response.ok) {
      throw new Error(`Bridge error ${response.status}: ${await response.text()}`);
    }

    if (!response.body) {
      const data = await response.text();
      let content = '';
      for (const line of data.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        try {
          const event = JSON.parse(line.slice(6));
          if (event.type === 'text') content += event.content;
        } catch { /* skip */ }
      }
      return { content, toolCalls: [] };
    }

    let fullContent = '';
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
        try {
          const event = JSON.parse(line.slice(6));
          if (event.type === 'text' && event.content) {
            fullContent += event.content;
            onChunk({ type: 'text', content: event.content });
          } else if (event.type === 'done') {
            onChunk({ type: 'done' });
          } else if (event.type === 'error') {
            throw new Error(event.message || 'Bridge error');
          }
        } catch (e) {
          if (e instanceof Error && e.message !== 'Bridge error') { /* skip parse errors */ }
          else throw e;
        }
      }
    }

    return { content: fullContent, toolCalls: [] };
  },
};
