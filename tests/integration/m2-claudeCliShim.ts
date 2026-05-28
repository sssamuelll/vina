/**
 * Claude CLI shim — wraps `claude --print --output-format json --json-schema`
 * as an `AgenticLoopOptions['send']`-compatible LLM function. Used by the M2
 * integration test to drive the real agentic loop with a real LLM via the
 * Claude Code OAuth session (no API key required).
 *
 * Limitations:
 * - One LLM call per claude CLI invocation. Each invocation is a fresh
 *   `claude` process, no prompt cache reuse across calls.
 * - Cost: roughly $0.05-0.10 per call on Sonnet. A 5-call slice = ~$0.25-0.50.
 *   Opt-in via M2_INTEGRATION env var so this never runs on CI by accident.
 * - Tools are translated to a JSON-schema-validated structured output,
 *   not real function-calling. The LLM receives tool definitions in the
 *   system prompt and returns `{ content, toolCalls: [...] }` matching the
 *   schema. This is provider-specific behaviour — real Anthropic API tool
 *   calling has slightly different semantics (e.g. forced tool_choice).
 */

import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
  ChatMessage,
  ProviderResponse,
  ProviderToolDef,
} from '../../src/copilot/providers/types';

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    content: {
      type: 'string',
      description: 'Optional free-text accompanying your tool calls (e.g. a brief progress narration like "Cargando piezas…"). Can be empty. To actually speak to the user and exit the loop, call the presentToUser meta-tool instead — empty toolCalls is not allowed.',
    },
    toolCalls: {
      type: 'array',
      minItems: 1,
      description: 'Tools to invoke this turn. At least one tool MUST be called every response — empty arrays are rejected by the harness. To pause and speak to the user (whether to propose a plan or to declare work done), call the special meta-tool `presentToUser`. To continue working without speaking, call the real action/meta-tools you need.',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          arguments: {
            type: 'object',
            additionalProperties: true,
          },
        },
        required: ['name', 'arguments'],
      },
    },
  },
  required: ['content', 'toolCalls'],
};

function buildPrompt(
  messages: ChatMessage[],
  tools: ProviderToolDef[],
): { system: string; userPrompt: string } {
  const systemMsg = messages.find((m) => m.role === 'system')?.content ?? '';
  const history = messages.filter((m) => m.role !== 'system');

  const toolList = tools
    .map((t) =>
      `- **${t.name}**: ${t.description}\n  Parameters JSON schema: ${JSON.stringify(t.parameters)}`,
    )
    .join('\n');

  const system = `${systemMsg}

## Available Tools

You can invoke any of the tools below by listing them in the toolCalls array of your response. Arguments must match each tool's parameters schema exactly.

${toolList || '(no tools available)'}

## Response Format

Respond ONLY with JSON matching the response schema. Do not wrap in code fences. Do not add prose around the JSON. The harness will parse your response strictly.

- "content" — your text to the user. Match their language. Can be empty when you're mid-flow and want to keep working without speaking.
- "toolCalls" — list of tools to call this turn. Empty array when work is done OR when you are waiting for the user's next message (per the confirmation-gate convention in your system prompt).`;

  const conversationText = history
    .map((m) => {
      if (m.role === 'user') return `[User]: ${m.content}`;
      if (m.role === 'assistant') {
        const parts: string[] = [];
        if (m.tool_calls?.length) {
          parts.push(
            `[Assistant called]: ${m.tool_calls
              .map((tc) => `${tc.name}(${tc.arguments})`)
              .join(', ')}`,
          );
        }
        if (m.content) parts.push(`[Assistant said]: ${m.content}`);
        return parts.join('\n');
      }
      if (m.role === 'tool') return `[Tool result]: ${m.content}`;
      return '';
    })
    .filter(Boolean)
    .join('\n\n');

  const userPrompt = `${conversationText}\n\nWhat is your next action? Respond with JSON matching the schema. No prose outside the JSON.`;

  return { system, userPrompt };
}

/**
 * Send function compatible with `AgenticLoopOptions['send']`. Spawns
 * `claude --print --output-format json --json-schema ...` per call.
 */
export async function claudeCliSend(
  messages: ChatMessage[],
  tools: ProviderToolDef[],
): Promise<ProviderResponse> {
  const { system, userPrompt } = buildPrompt(messages, tools);

  const tmpRoot = mkdtempSync(join(tmpdir(), 'm2-int-'));
  const sysFile = join(tmpRoot, 'system.txt');
  writeFileSync(sysFile, system, 'utf8');

  try {
    const stdout = await new Promise<string>((resolve, reject) => {
      const proc = spawn(
        'claude',
        [
          '--print',
          '--model', 'sonnet',
          '--output-format', 'json',
          '--json-schema', JSON.stringify(RESPONSE_SCHEMA),
          '--system-prompt-file', sysFile,
          userPrompt,
        ],
        { stdio: ['ignore', 'pipe', 'pipe'], shell: false },
      );

      let out = '';
      let err = '';
      proc.stdout.on('data', (c) => { out += c.toString(); });
      proc.stderr.on('data', (c) => { err += c.toString(); });
      proc.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`claude exit ${code}: ${err.slice(0, 400)}`));
        } else {
          resolve(out.trim());
        }
      });
      proc.on('error', reject);
    });

    // Claude CLI returns an envelope. `structured_output` is the parsed JSON
    // matching the supplied schema. Fall back to `result` if missing.
    const envelope = JSON.parse(stdout) as {
      structured_output?: { content?: string; toolCalls?: Array<{ name: string; arguments: unknown }> };
      result?: string;
    };
    const structured = envelope.structured_output ?? {
      content: envelope.result ?? '',
      toolCalls: [],
    };

    return {
      content: structured.content ?? '',
      toolCalls: (structured.toolCalls ?? []).map((tc, i) => ({
        id: `tc_${Date.now()}_${i}`,
        name: tc.name,
        arguments: JSON.stringify(tc.arguments ?? {}),
      })),
    };
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true });
  }
}
