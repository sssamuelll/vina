import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  parseToolCallsFromText,
  OLLAMA_DEFAULT_URL,
  OLLAMA_MODELS,
  ollamaProvider,
  detectOllama,
  listOllamaModels,
  loadOllamaConfig,
  saveOllamaConfig,
} from '../providers/ollama';
import type { ProviderConfig, ChatMessage, ProviderToolDef } from '../providers/types';

// ─── localStorage mock ──────────────────────────────────────────────────────

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
    get length() { return Object.keys(store).length; },
    key: vi.fn((i: number) => Object.keys(store)[i] || null),
  };
})();

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

// ─── Constants ──────────────────────────────────────────────────────────────

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

// ─── parseToolCallsFromText ─────────────────────────────────────────────────

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

  it('should handle empty string input', () => {
    const { toolCalls, cleanedText } = parseToolCallsFromText('');
    expect(toolCalls.length).toBe(0);
    expect(cleanedText).toBe('');
  });

  it('should skip tool calls with null or missing name', () => {
    const text = '```json\n{"tool_calls": [{"arguments": {"x": 1}}]}\n```';
    const { toolCalls } = parseToolCallsFromText(text);
    // Entry without name should be skipped
    expect(toolCalls.length).toBe(0);
  });

  it('should handle mixed text, tool calls, and regular JSON', () => {
    const text = `Here's the data:
\`\`\`json
{"measurements": {"bust": 88}}
\`\`\`

And I'll create a piece:
\`\`\`json
{"tool_calls": [{"name": "createPiece", "arguments": {"template": "bodice-front"}}]}
\`\`\`

Done!`;

    const { toolCalls, cleanedText } = parseToolCallsFromText(text);
    expect(toolCalls.length).toBe(1);
    expect(toolCalls[0].name).toBe('createPiece');
    // The measurements JSON block stays, the tool_calls block is removed
    expect(cleanedText).toContain('measurements');
    expect(cleanedText).toContain('Done!');
  });

  it('should handle malformed tool_calls (not an array)', () => {
    const text = '```json\n{"tool_calls": "not-array"}\n```';
    const { toolCalls } = parseToolCallsFromText(text);
    expect(toolCalls.length).toBe(0);
  });

  it('should prefer fenced code blocks over inline', () => {
    const text = `\`\`\`json
{"tool_calls": [{"name": "a"}]}
\`\`\``;
    const { toolCalls } = parseToolCallsFromText(text);
    expect(toolCalls.length).toBe(1);
    expect(toolCalls[0].name).toBe('a');
  });
});

// ─── ollamaProvider interface ───────────────────────────────────────────────

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

// ─── ollamaProvider.send (mocked fetch) ─────────────────────────────────────

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

  it('should handle empty response content', async () => {
    const mockResponse = {
      message: { content: '' },
      prompt_eval_count: 10,
      eval_count: 0,
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const result = await ollamaProvider.send([{ role: 'user', content: 'test' }], [], config);
    expect(result.content).toBe('');
    expect(result.toolCalls).toEqual([]);

    fetchSpy.mockRestore();
  });

  it('should handle missing message in response', async () => {
    const mockResponse = { prompt_eval_count: 10, eval_count: 0 };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const result = await ollamaProvider.send([{ role: 'user', content: 'test' }], [], config);
    expect(result.content).toBe('');

    fetchSpy.mockRestore();
  });

  it('should handle missing eval counts', async () => {
    const mockResponse = { message: { content: 'Hi' } };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const result = await ollamaProvider.send([{ role: 'user', content: 'test' }], [], config);
    expect(result.usage?.promptTokens).toBe(0);
    expect(result.usage?.completionTokens).toBe(0);
    expect(result.usage?.totalTokens).toBe(0);

    fetchSpy.mockRestore();
  });

  it('should use default URL when baseUrl not provided', async () => {
    const configNoUrl: ProviderConfig = {
      provider: 'ollama',
      apiKey: '',
      model: 'llama3',
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: { content: 'ok' } }),
    } as Response);

    await ollamaProvider.send([{ role: 'user', content: 'test' }], [], configNoUrl);

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:11434/api/chat',
      expect.anything(),
    );

    fetchSpy.mockRestore();
  });

  it('should include system messages in the request', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: { content: 'ok' } }),
    } as Response);

    const messages: ChatMessage[] = [
      { role: 'system', content: 'You are a sewing assistant.' },
      { role: 'user', content: 'Hello' },
    ];

    await ollamaProvider.send(messages, [], config);

    const callBody = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
    expect(callBody.messages[0].role).toBe('system');
    expect(callBody.messages[0].content).toContain('sewing assistant');

    fetchSpy.mockRestore();
  });

  it('should inject tool definitions into system prompt', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: { content: 'ok' } }),
    } as Response);

    const tools: ProviderToolDef[] = [{
      name: 'createPiece',
      description: 'Create a pattern piece',
      parameters: {
        type: 'object',
        properties: {
          template: { type: 'string', description: 'Template name' },
        },
        required: ['template'],
      },
    }];

    await ollamaProvider.send([{ role: 'user', content: 'test' }], tools, config);

    const callBody = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
    // Should have a system message with tool descriptions
    const systemMsg = callBody.messages.find((m: { role: string }) => m.role === 'system');
    expect(systemMsg).toBeDefined();
    expect(systemMsg.content).toContain('createPiece');
    expect(systemMsg.content).toContain('Available Tools');

    fetchSpy.mockRestore();
  });

  it('should convert tool result messages to user format', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: { content: 'ok' } }),
    } as Response);

    const messages: ChatMessage[] = [
      { role: 'user', content: 'Create a bodice' },
      { role: 'assistant', content: 'Creating...', tool_calls: [{ id: 'tc1', name: 'createPiece', arguments: '{}' }] },
      { role: 'tool', content: '{"success": true}', tool_call_id: 'tc1' },
    ];

    await ollamaProvider.send(messages, [], config);

    const callBody = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
    // Tool result should be converted to user message
    const toolResultMsg = callBody.messages.find((m: { content: string }) => m.content.includes('Tool Result'));
    expect(toolResultMsg).toBeDefined();
    expect(toolResultMsg.role).toBe('user');

    fetchSpy.mockRestore();
  });

  it('should pass maxTokens config option', async () => {
    const configWithTokens: ProviderConfig = {
      provider: 'ollama',
      apiKey: '',
      model: 'llama3',
      baseUrl: 'http://localhost:11434',
      maxTokens: 2048,
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: { content: 'ok' } }),
    } as Response);

    await ollamaProvider.send([{ role: 'user', content: 'test' }], [], configWithTokens);

    const callBody = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
    expect(callBody.options.num_predict).toBe(2048);

    fetchSpy.mockRestore();
  });
});

// ─── ollamaProvider.stream (mocked fetch) ───────────────────────────────────

describe('ollamaProvider.stream (mocked fetch)', () => {
  const config: ProviderConfig = {
    provider: 'ollama',
    apiKey: '',
    model: 'llama3',
    baseUrl: 'http://localhost:11434',
  };

  /**
   * Create a mock ReadableStream from an array of NDJSON lines.
   * @param lines - Array of objects to send as NDJSON lines
   */
  function createMockStream(lines: object[]): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    const chunks = lines.map(l => encoder.encode(JSON.stringify(l) + '\n'));
    let index = 0;
    return new ReadableStream({
      pull(controller) {
        if (index < chunks.length) {
          controller.enqueue(chunks[index++]);
        } else {
          controller.close();
        }
      },
    });
  }

  it('should stream text chunks and return final response', async () => {
    const stream = createMockStream([
      { message: { content: 'Hello' }, done: false },
      { message: { content: ' world' }, done: false },
      { message: { content: '!' }, done: true, prompt_eval_count: 10, eval_count: 5 },
    ]);

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      body: stream,
    } as Response);

    const chunks: string[] = [];
    const result = await ollamaProvider.stream(
      [{ role: 'user', content: 'Hi' }],
      [],
      config,
      (chunk) => {
        if (chunk.type === 'text' && chunk.content) chunks.push(chunk.content);
      },
    );

    expect(chunks).toEqual(['Hello', ' world', '!']);
    expect(result.content).toBe('Hello world!');
    expect(result.usage?.promptTokens).toBe(10);
    expect(result.usage?.completionTokens).toBe(5);

    fetchSpy.mockRestore();
  });

  it('should parse tool calls from streamed response', async () => {
    const toolCallContent = '```json\n{"tool_calls": [{"name": "listFabrics", "arguments": {}}]}\n```';
    const stream = createMockStream([
      { message: { content: toolCallContent }, done: true, prompt_eval_count: 20, eval_count: 10 },
    ]);

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      body: stream,
    } as Response);

    const chunkTypes: string[] = [];
    const result = await ollamaProvider.stream(
      [{ role: 'user', content: 'list fabrics' }],
      [],
      config,
      (chunk) => { chunkTypes.push(chunk.type); },
    );

    expect(result.toolCalls.length).toBe(1);
    expect(result.toolCalls[0].name).toBe('listFabrics');
    expect(chunkTypes).toContain('tool_call_start');
    expect(chunkTypes).toContain('tool_call_end');
    expect(chunkTypes).toContain('done');

    fetchSpy.mockRestore();
  });

  it('should throw on HTTP error during stream', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => 'model not found',
    } as Response);

    await expect(
      ollamaProvider.stream(
        [{ role: 'user', content: 'test' }],
        [],
        config,
        () => {},
      )
    ).rejects.toThrow('Ollama API error 404');

    fetchSpy.mockRestore();
  });

  it('should handle stream ending without done event', async () => {
    const stream = createMockStream([
      { message: { content: 'partial' }, done: false },
    ]);

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      body: stream,
    } as Response);

    const result = await ollamaProvider.stream(
      [{ role: 'user', content: 'test' }],
      [],
      config,
      () => {},
    );

    expect(result.content).toBe('partial');

    fetchSpy.mockRestore();
  });

  it('should handle empty stream', async () => {
    const stream = createMockStream([]);

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      body: stream,
    } as Response);

    const result = await ollamaProvider.stream(
      [{ role: 'user', content: 'test' }],
      [],
      config,
      () => {},
    );

    expect(result.content).toBe('');
    expect(result.toolCalls).toEqual([]);

    fetchSpy.mockRestore();
  });
});

// ─── detectOllama ───────────────────────────────────────────────────────────

describe('detectOllama', () => {
  it('should return true when Ollama is running', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
    } as Response);

    const result = await detectOllama();
    expect(result).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:11434/api/tags',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );

    fetchSpy.mockRestore();
  });

  it('should return false when Ollama is not running', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(
      new Error('ECONNREFUSED'),
    );

    const result = await detectOllama();
    expect(result).toBe(false);

    fetchSpy.mockRestore();
  });

  it('should return false on non-ok response', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
    } as Response);

    const result = await detectOllama();
    expect(result).toBe(false);

    fetchSpy.mockRestore();
  });

  it('should use custom URL', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
    } as Response);

    await detectOllama('http://192.168.1.100:11434');
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://192.168.1.100:11434/api/tags',
      expect.anything(),
    );

    fetchSpy.mockRestore();
  });
});

// ─── listOllamaModels ──────────────────────────────────────────────────────

describe('listOllamaModels', () => {
  it('should return model names', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        models: [
          { name: 'llama3:latest' },
          { name: 'mistral:latest' },
        ],
      }),
    } as Response);

    const models = await listOllamaModels();
    expect(models).toEqual(['llama3:latest', 'mistral:latest']);

    fetchSpy.mockRestore();
  });

  it('should return empty array when not running', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(
      new Error('ECONNREFUSED'),
    );

    const models = await listOllamaModels();
    expect(models).toEqual([]);

    fetchSpy.mockRestore();
  });

  it('should return empty array on non-ok response', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
    } as Response);

    const models = await listOllamaModels();
    expect(models).toEqual([]);

    fetchSpy.mockRestore();
  });

  it('should return empty array when no models available', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ models: [] }),
    } as Response);

    const models = await listOllamaModels();
    expect(models).toEqual([]);

    fetchSpy.mockRestore();
  });

  it('should handle missing models field', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    } as Response);

    const models = await listOllamaModels();
    expect(models).toEqual([]);

    fetchSpy.mockRestore();
  });
});

// ─── loadOllamaConfig / saveOllamaConfig ────────────────────────────────────

describe('OllamaConfig persistence', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it('should return defaults when nothing saved', () => {
    const config = loadOllamaConfig();
    expect(config.url).toBe(OLLAMA_DEFAULT_URL);
    expect(config.model).toBe('llama3');
    expect(config.autoDetect).toBe(true);
  });

  it('should save and load config', () => {
    const config = {
      url: 'http://192.168.1.100:11434',
      model: 'mistral',
      autoDetect: false,
    };
    saveOllamaConfig(config);
    const loaded = loadOllamaConfig();
    expect(loaded).toEqual(config);
  });

  it('should handle corrupted localStorage', () => {
    localStorageMock.setItem('openclo-ollama-config', 'not-json!!!');
    const config = loadOllamaConfig();
    // Should return defaults
    expect(config.url).toBe(OLLAMA_DEFAULT_URL);
    expect(config.model).toBe('llama3');
  });
});
