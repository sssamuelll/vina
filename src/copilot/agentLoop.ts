/**
 * @deprecated This module is deprecated in favor of the ExecutionBridge system.
 * Enable bridge mode with: localStorage.setItem('openclo-use-bridge', 'true')
 * See: src/copilot/bridge/ for the new implementation.
 * This file will be removed in a future version once bridge mode is validated.
 */

/**
 * Agent Orchestration Loop — multi-turn tool use with LLM feedback.
 *
 * After the LLM calls tools, the results are fed back to the LLM
 * for confirmation, adjustment, or additional tool calls. This enables
 * compound operations where the agent reasons about intermediate results.
 *
 * Maximum 5 tool rounds per user message to prevent infinite loops.
 *
 * @module agentLoop
 */

import type { AppDispatch, RootState } from '../store';
import type { ToolRegistry } from './tools/registry';
import type { LLMProvider, ProviderConfig, ChatMessage, ProviderToolDef, StreamChunk } from './providers/types';
import type { LLMToolCall } from './toolExecutor';
import { executeToolCalls } from './toolExecutor';
import { buildEnhancedAgentContext, serializeContext } from './contextBuilder';
import type { DesignLogEntry, SkillOverride } from './vision/types';
import { detectLanguage, type AgentLanguage } from './languageDetection';
import { getTeachingSnippet, formatTeachingSnippet, isTeachingModeEnabled } from './teachingContext';
import { runProactiveAnalysis, formatWarnings } from './proactiveAnalysis';
import type { ProjectMemory } from './memory';
import { getRelevantSkills, buildSkillContext } from './skills/skillLoader';

/** Maximum number of tool call rounds per user message */
const MAX_ROUNDS = 5;

/**
 * Result of a single tool round within the agent loop.
 */
export interface ToolRound {
  /** Round number (1-based) */
  round: number;
  /** Tool calls made in this round */
  toolCalls: Array<{ name: string; result?: string; success: boolean }>;
  /** Text response from the LLM in this round */
  text: string;
}

/**
 * Complete result of the agent loop execution.
 */
export interface AgentLoopResult {
  /** Final text response (accumulated from all rounds) */
  content: string;
  /** All tool rounds executed */
  rounds: ToolRound[];
  /** Detected language */
  language: AgentLanguage;
  /** Teaching snippets generated */
  teachingContent: string[];
  /** Proactive analysis warnings */
  warnings: string;
  /** Total tool calls across all rounds */
  totalToolCalls: number;
}

/**
 * Callback for streaming progress updates during the agent loop.
 */
export interface AgentLoopCallbacks {
  /** Called when text is streamed from the LLM */
  onText?: (text: string) => void;
  /** Called when a tool call starts */
  onToolCallStart?: (name: string, round: number) => void;
  /** Called when a tool call completes */
  onToolCallEnd?: (name: string, success: boolean, round: number) => void;
  /** Called when a new round begins */
  onRoundStart?: (round: number) => void;
  /** Called when streaming is complete */
  onDone?: () => void;
}

/**
 * Build the system prompt with current project context, active skills, memory,
 * and cerebral intelligence (semantic analysis, spatial relationships, design decisions).
 *
 * @param state - Current Redux state
 * @param memory - Project memory
 * @param soul - PATRONAJE_SOUL personality string
 * @param skillContext - Formatted skill context string (if any skills matched)
 * @param activeSkillNames - Names of matched skills for context tracking
 * @param designLogEntries - Recent design log entries
 * @param overrides - Active formula overrides
 * @returns Complete system prompt
 */
function buildSystemPrompt(
  state: RootState,
  memory: ProjectMemory,
  soul: string,
  skillContext: string = '',
  activeSkillNames: string[] = [],
  designLogEntries: DesignLogEntry[] = [],
  overrides: SkillOverride[] = [],
): string {
  const enhancedContext = buildEnhancedAgentContext(
    state,
    activeSkillNames,
    designLogEntries,
    overrides,
  );
  const contextStr = serializeContext(enhancedContext);
  const memoryContext = memory.toContextString();

  let prompt = soul;
  if (skillContext) {
    prompt += `\n\n${skillContext}`;
  }
  prompt += `\n\n## Current Project State\n${contextStr}`;

  // Add cerebral intelligence context (semantic analysis, spatial relationships, etc.)
  if (enhancedContext.cerebralSerialized && enhancedContext.cerebralSerialized !== '## Context\nNo pieces or design history yet.') {
    prompt += `\n\n## Semantic Analysis\n${enhancedContext.cerebralSerialized}`;
  }

  if (memoryContext) {
    prompt += `\n\n## Memory\n${memoryContext}`;
  }
  return prompt;
}

/**
 * Options for running the agent loop.
 */
export interface AgentLoopOptions {
  /** Design log entries from the current project */
  designLogEntries?: DesignLogEntry[];
  /** Active formula overrides from preference learning */
  overrides?: SkillOverride[];
}

/**
 * Run the agent orchestration loop.
 *
 * This is the main entry point for processing a user message through the
 * LLM with multi-turn tool use. The loop:
 *
 * 1. Sends the user message + context to the LLM
 * 2. If the LLM requests tool calls, executes them
 * 3. Feeds results back to the LLM for confirmation
 * 4. Repeats up to MAX_ROUNDS times
 * 5. Runs proactive analysis on the final state
 * 6. Attaches teaching content if enabled
 *
 * @param userMessage - The user's message text
 * @param provider - LLM provider (Anthropic/OpenAI)
 * @param config - Provider configuration
 * @param registry - Tool registry
 * @param dispatch - Redux dispatch
 * @param getState - Function to get current Redux state
 * @param memory - Project memory instance
 * @param soul - PATRONAJE_SOUL personality string
 * @param callbacks - Optional streaming callbacks
 * @param options - Optional design log and override context
 * @returns Complete agent loop result
 */
export async function runAgentLoop(
  userMessage: string,
  provider: LLMProvider,
  config: ProviderConfig,
  registry: ToolRegistry,
  dispatch: AppDispatch,
  getState: () => RootState,
  memory: ProjectMemory,
  soul: string,
  callbacks?: AgentLoopCallbacks,
  options?: AgentLoopOptions,
): Promise<AgentLoopResult> {
  const language = detectLanguage(userMessage);
  const rounds: ToolRound[] = [];
  const teachingContent: string[] = [];
  let totalToolCalls = 0;
  const designLogEntries = options?.designLogEntries ?? [];
  const overrides = options?.overrides ?? [];

  // Match relevant skills from user message
  const matchedSkills = getRelevantSkills(userMessage);
  const skillContext = buildSkillContext(matchedSkills);
  const activeSkillNames = matchedSkills.map(s => s.name);

  // Build initial messages with cerebral context
  const messages: ChatMessage[] = [
    { role: 'system', content: buildSystemPrompt(getState(), memory, soul, skillContext, activeSkillNames, designLogEntries, overrides) },
  ];

  // Add conversation history from memory
  const recentHistory = memory.getRecent(20);
  for (const m of recentHistory) {
    messages.push({ role: m.role, content: m.content });
  }

  // Add user message
  messages.push({ role: 'user', content: userMessage });

  // Get tool definitions
  const toolDefs: ProviderToolDef[] = registry.list().map(t => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));

  let fullContent = '';
  let currentRound = 0;

  while (currentRound < MAX_ROUNDS) {
    currentRound++;
    callbacks?.onRoundStart?.(currentRound);

    // Send to LLM (streaming)
    let roundText = '';
    const response = await provider.stream(
      messages,
      toolDefs,
      config,
      (chunk: StreamChunk) => {
        if (chunk.type === 'text' && chunk.content) {
          roundText += chunk.content;
          callbacks?.onText?.(chunk.content);
        } else if (chunk.type === 'tool_call_start' && chunk.toolCall?.name) {
          callbacks?.onToolCallStart?.(chunk.toolCall.name, currentRound);
        }
      },
    );

    fullContent += roundText;

    // If no tool calls, we're done
    if (response.toolCalls.length === 0) {
      if (currentRound === 1 && rounds.length === 0) {
        // No tools called — just a text response
      }
      break;
    }

    // Execute tool calls
    const calls: LLMToolCall[] = response.toolCalls.map(tc => {
      let args: Record<string, unknown>;
      try {
        args = JSON.parse(tc.arguments);
      } catch {
        // LLM sometimes returns unquoted enum values — try fixing common issues
        try {
          const fixed = tc.arguments.replace(/:\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*([,}])/g, ': "$1"$2');
          args = JSON.parse(fixed);
        } catch {
          console.warn('[agentLoop] Failed to parse tool arguments:', tc.arguments);
          args = {};
        }
      }
      return { id: tc.id, name: tc.name, arguments: args };
    });

    const batchResult = await executeToolCalls(calls, registry, dispatch, getState);
    totalToolCalls += calls.length;

    // Record the round
    const round: ToolRound = {
      round: currentRound,
      toolCalls: batchResult.results.map(r => ({
        name: r.toolName,
        result: r.result.data ? JSON.stringify(r.result.data) : undefined,
        success: r.result.success,
      })),
      text: roundText,
    };
    rounds.push(round);

    // Notify callbacks
    for (const r of batchResult.results) {
      callbacks?.onToolCallEnd?.(r.toolName, r.result.success, currentRound);

      // Collect teaching content
      if (isTeachingModeEnabled()) {
        const snippet = getTeachingSnippet(r.toolName, language);
        if (snippet) {
          teachingContent.push(formatTeachingSnippet(snippet));
        }
      }
    }

    // Build assistant message with tool calls for conversation history
    const assistantMsg: ChatMessage = {
      role: 'assistant',
      content: roundText || '',
      tool_calls: response.toolCalls.map(tc => ({
        id: tc.id,
        name: tc.name,
        arguments: tc.arguments,
      })),
    };
    messages.push(assistantMsg);

    // Add tool results as messages
    for (const r of batchResult.results) {
      const resultContent = r.result.success
        ? JSON.stringify(r.result.data ?? { success: true })
        : JSON.stringify({ error: r.result.error });

      messages.push({
        role: 'tool',
        content: resultContent,
        tool_call_id: r.toolCallId,
      });
    }

    // Add audit warnings as a user message if any geometry issues were detected
    if (batchResult.auditWarnings) {
      messages.push({
        role: 'user',
        content: `[SYSTEM AUDIT]\n${batchResult.auditWarnings}\n\nPlease review these geometry issues and consider corrective action.`,
      });
    }
  }

  // Run proactive analysis on the final state
  const finalState = getState();
  const analysisWarnings = runProactiveAnalysis(
    finalState.project.pieces,
    finalState.project.seams,
  );
  const warningsStr = formatWarnings(analysisWarnings);

  callbacks?.onDone?.();

  return {
    content: fullContent,
    rounds,
    language,
    teachingContent,
    warnings: warningsStr,
    totalToolCalls,
  };
}
