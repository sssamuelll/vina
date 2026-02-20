import { describe, it, expect, vi } from 'vitest';
import {
  parseToolCallsFromText,
  OLLAMA_DEFAULT_URL,
  OLLAMA_MODELS,
  ollamaProvider,
} from '../providers/ollama';
import type { ProviderConfig, ChatMessage } from '../providers/types';

describe('OLLAMA constants', () => {
  it('should have default URL', () => {
    expect(OLLAMA_DEFAULT_URL).toBe('http://localhost:11434');
  });

  it('should list supported models', () => {
    expect(OLLAMA_MODELS).toContain('llama3');
    expect(OLLAMA_MODELS).toContain('codellama');
    expect(OLLAMA_MODELS).toContain('mistral');
    expect(OLLAMA_MODELS).toContain('mixtral');
    expect(OLLAMA_MODELS.length).toBe(4);
  });
});

describe('parseToolCallsFromText', () => {
  it('should parse tool calls from code blocks', () => {
    const text = `I'll create a bodice for you.

\`\`\`json
{"tool_calls": [{"name": "createPiece", "arguments": {"template": "bodice-front", "name": "Front Bodice"}}]}
\`\`\`

Let me know if you need anything else.`;

    const { toolCalls, cleanedText } = parseToolCallsFromText(text);
    expect(toolCalls.length).toBe(1);
    expect(toolCalls[0].name).toBe('createPiece');
    const args = JSON.parse(toolCalls[0].arguments);
    expect(args.template).toBe('bodice-front');
    expect(args.name).toBe('Front Bodice');
    expect(cleanedText).toContain("I'll create a bodice");
    expect(cleanedText).toContain("Let me know");
    expect(cleanedText).not.toContain('tool_calls');
  });

  it('should parse multiple tool calls', () => {
    const text = `Creating bodice front and back.

\`\`\`json
{"tool_calls": [
  {"name": "createPiece", "arguments": {"template": "bodice-front"}},
  {"name": "createPiece", "arguments": {"template": "bodice-back"}}
]}
\`\`\``;

    const { toolCalls } = parseToolCallsFromText(text);
    expect(toolCalls.length).toBe(2);
    expect(toolCalls[0].name).toBe('createPiece');
    expect(toolCalls[1].name).toBe('createPiece');
  });

  it('should parse inline JSON (no code fences)', () => {
    const text = `Sure! {"tool_calls": [{"name": "listFabrics", "arguments": {}}]}`;

    const { toolCalls, cleanedText } = parseToolCallsFromText(text);
    expect(toolCalls.length).toBe(1);
    expect(toolCalls[0].name).toBe('listFabrics');
    expect(cleanedText).toContain('Sure!');
  });

  it('should handle text with no tool calls', () => {
    const text = 'I can help you with that! What would you like to create?';
    const { toolCalls, cleanedText } = parseToolCallsFromText(text);
    expect(toolCalls.length).toBe(0);
    expect(cleanedText).toBe(text);
  });

  it('should handle invalid JSON gracefully', () => {
    const text = '```json\n{not valid json}\n```';
    const { toolCalls, cleanedText } = parseToolCallsFromText(text);
    expect(toolCalls.length).toBe(0);
    // Invalid JSON code block is kept
    expect(cleanedText).toContain('not valid json');
  });

  it('should handle empty tool_calls array', () => {
    const text = '```json\n{"tool_calls": []}\n```\nNothing to do.';
    const { toolCalls, cleanedText } = parseToolCallsFromText(text);
    expect(toolCalls.length).toBe(0);
    expect(cleanedText).toContain('Nothing to do');
  });

  it('should handle tool call without arguments', () => {
    const text = '```json\n{"tool_calls": [{"name": "getMeasurements"}]}\n```';
    const { toolCalls } = parseToolCallsFromText(text);
    expect(toolCalls.length).toBe(1);
    expect(toolCalls[0].name).toBe('getMeasurements');
    expect(JSON.parse(toolCalls[0].arguments)).toEqual({});
  });

  it('should generate unique IDs for tool calls', () => {
    const text = '```json\n{"tool_calls": [{"name": "a"}, {"name": "b"}]}\n```';
    const { toolCalls } = parseToolCallsFromText(text);
    expect(toolCalls[0].id).not.toBe(toolCalls[1].id);
    expect(toolCalls[0].id).toMatch(/^ollama-/);
  });

  it('should skip non-tool-call JSON blocks', () => {
    const text = '```json\n{"data": [1, 2, 3]}\n```\nRegular data.';
    const { toolCalls } = parseToolCallsFromText(text);
    expect(toolCalls.length).toBe(0);
  });
});

describe('ollamaProvider interface', () => {
  it('should have the correct name', () => {
    expect(ollamaProvider.name).toBe('Ollama (Local)');
  });

  it('should implement send method', () => {
    expect(typeof ollamaProvider.send).toBe('function');
  });

  it('should implement stream method', () => {
    expect(typeof ollamaProvider.stream).toBe('function');
  });
});

describe('ollamaProvider.send (mocked fetch)', () => {
  const config: ProviderConfig = {
    provider: 'ollama',
    apiKey: '',
    model: 'llama3',
    baseUrl: 'http://localhost:11434',
  };

  it('should make correct API call', async () => {
    const mockResponse = {
      message: { content: 'Hello! I can help with patterns.' },
      prompt_eval_count: 100,
      eval_count: 50,
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const messages: ChatMessage[] = [
      { role: 'user', content: 'Hello' },
    ];

    const result = await ollamaProvider.send(messages, [], config);

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:11434/api/chat',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    expect(result.content).toBe('Hello! I can help with patterns.');
    expect(result.toolCalls).toEqual([]);
    expect(result.usage?.promptTokens).toBe(100);
    expect(result.usage?.completionTokens).toBe(50);

    fetchSpy.mockRestore();
  });

  it('should parse tool calls from response', async () => {
    const mockResponse = {
      message: {
        content: 'I\'ll create a bodice.\n```json\n{"tool_calls": [{"name": "createPiece", "arguments": {"template": "bodice-front"}}]}\n```',
      },
      prompt_eval_count: 200,
      eval_count: 100,
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const messages: ChatMessage[] = [
      { role: 'user', content: 'Create a bodice' },
    ];

    const result = await ollamaProvider.send(messages, [], config);

    expect(result.toolCalls.length).toBe(1);
    expect(result.toolCalls[0].name).toBe('createPiece');
    expect(result.content).toContain("I'll create a bodice");
    expect(result.content).not.toContain('tool_calls');

    fetchSpy.mockRestore();
  });

  it('should throw on HTTP error', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Internal error',
    } as Response);

    const messages: ChatMessage[] = [{ role: 'user', content: 'Hello' }];

    await expect(ollamaProvider.send(messages, [], config)).rejects.toThrow('Ollama API error 500');

    fetchSpy.mockRestore();
  });
});
