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
import { buildAgentContext, serializeContext } from './contextBuilder';
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
 * Build the system prompt with current project context, active skills, and memory.
 *
 * @param state - Current Redux state
 * @param memory - Project memory
 * @param soul - PATRONAJE_SOUL personality string
 * @param skillContext - Formatted skill context string (if any skills matched)
 * @param activeSkillNames - Names of matched skills for context tracking
 * @returns Complete system prompt
 */
function buildSystemPrompt(
  state: RootState,
  memory: ProjectMemory,
  soul: string,
  skillContext: string = '',
  activeSkillNames: string[] = [],
): string {
  const context = buildAgentContext(state, activeSkillNames);
  const contextStr = serializeContext(context);
  const memoryContext = memory.toContextString();

  let prompt = soul;
  if (skillContext) {
    prompt += `\n\n${skillContext}`;
  }
  prompt += `\n\n## Current Project State\n${contextStr}`;
  if (memoryContext) {
    prompt += `\n\n## Memory\n${memoryContext}`;
  }
  return prompt;
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
): Promise<AgentLoopResult> {
  const language = detectLanguage(userMessage);
  const rounds: ToolRound[] = [];
  const teachingContent: string[] = [];
  let totalToolCalls = 0;

  // Match relevant skills from user message
  const matchedSkills = getRelevantSkills(userMessage);
  const skillContext = buildSkillContext(matchedSkills);
  const activeSkillNames = matchedSkills.map(s => s.name);

  // Build initial messages
  const messages: ChatMessage[] = [
    { role: 'system', content: buildSystemPrompt(getState(), memory, soul, skillContext, activeSkillNames) },
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
    const calls: LLMToolCall[] = response.toolCalls.map(tc => ({
      id: tc.id,
      name: tc.name,
      arguments: JSON.parse(tc.arguments),
    }));

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
