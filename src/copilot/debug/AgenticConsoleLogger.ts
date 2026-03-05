/**
 * AgenticConsoleLogger — real-time structured console output for debugging.
 *
 * Logs each turn live as the agentic loop runs, with full detail:
 * - System prompt (collapsed)
 * - Per-turn: LLM call/response, reasoning, tool calls + results
 * - Summary with totals
 */

import type { AgenticRecord, AgenticTurnRecord } from './types';
import type { ProviderResponse } from '../providers/types';

export class AgenticConsoleLogger {
  /** Open the main run group */
  logStart(userRequest: string): void {
    console.group(
      `%c[AgenticLoop] "${userRequest}"`,
      'font-weight: bold; color: #2196F3; font-size: 12px',
    );
  }

  /** Show the system prompt in a collapsed group */
  logSystemPrompt(prompt: string): void {
    console.groupCollapsed('%c📋 System Prompt', 'color: #9E9E9E');
    console.log(prompt);
    console.groupEnd();
  }

  /** Open a turn group and log the outgoing LLM call */
  logTurnStart(turnNumber: number, messageCount: number): void {
    console.group(
      `%c🔄 Turn ${turnNumber}`,
      'font-weight: bold; color: #FF9800',
    );
    console.log(`%c📤 → LLM (${messageCount} messages)`, 'color: #757575');
  }

  /** Log the LLM response with full detail */
  logLLMResponse(response: ProviderResponse, duration: number): void {
    const tokens = response.usage
      ? ` · ${response.usage.promptTokens}+${response.usage.completionTokens} tokens`
      : '';
    console.log(
      `%c📥 ← LLM (${Math.round(duration)}ms${tokens})`,
      'color: #4CAF50',
    );

    if (response.reasoningContent) {
      console.log(
        `%c   💭 ${response.reasoningContent}`,
        'color: #CE93D8; font-style: italic',
      );
    }

    if (response.toolCalls.length > 0) {
      for (const tc of response.toolCalls) {
        let args: Record<string, unknown>;
        try {
          args = JSON.parse(tc.arguments);
        } catch {
          args = {};
        }
        console.log(`   🔧 ${tc.name}`, args);
      }
    }

    if (response.toolCalls.length === 0 && response.content) {
      console.log(`   💬 "${response.content}"`);
    }
  }

  /** Log a tool execution result (full, not truncated) */
  logToolResult(
    name: string,
    isMetaTool: boolean,
    result: unknown,
    duration: number,
    error?: string,
  ): void {
    const label = isMetaTool ? 'read' : 'write';
    if (error) {
      console.log(
        `%c   ⚡ ${name} [${label}] (${Math.round(duration)}ms) ✗`,
        'color: #F44336',
      );
      console.error(`      Error:`, error);
      console.log('      Result:', result);
    } else {
      console.log(
        `%c   ⚡ ${name} [${label}] (${Math.round(duration)}ms) ✓`,
        'color: #8BC34A',
      );
      console.log('      Result:', result);
    }
  }

  /** Close the current turn group */
  logTurnEnd(): void {
    console.groupEnd();
  }

  /** Log final summary and close the main group */
  logEnd(record: AgenticRecord): void {
    const status = record.success ? '✅' : '❌';
    const totals = record.turns.reduce(
      (acc, t) => {
        if (t.usage) {
          acc.prompt += t.usage.promptTokens;
          acc.completion += t.usage.completionTokens;
        }
        return acc;
      },
      { prompt: 0, completion: 0 },
    );

    const tokenStr =
      totals.prompt > 0 ? `, ${totals.prompt}+${totals.completion} tokens` : '';

    console.log(
      `%c${status} ${record.success ? 'Complete' : 'Failed'}: ${record.turns.length} turns, ${record.toolCalls.length} tools, ${record.totalDuration}ms${tokenStr}`,
      `font-weight: bold; color: ${record.success ? '#4CAF50' : '#F44336'}`,
    );

    if (record.error) {
      console.error('Error:', record.error);
    }

    if (record.finalResponse) {
      console.log('Response:', record.finalResponse);
    }

    console.groupEnd();
  }

  /** Standalone log for records loaded from DebugStore */
  log(record: AgenticRecord): void {
    const status = record.success ? '✓' : '✗';
    const color = record.success ? 'color: green' : 'color: red';
    console.group(
      `%c[AgenticLoop] "${record.userRequest}" (${record.totalDuration}ms) ${status}`,
      `font-weight: bold; ${color}`,
    );

    if (record.turns.length > 0) {
      for (const turn of record.turns) {
        this.logStoredTurn(turn);
      }
    } else if (record.toolCalls.length > 0) {
      console.groupCollapsed(`⚡ Tool calls (${record.toolCalls.length})`);
      for (const tc of record.toolCalls) {
        const typeLabel = tc.isMetaTool ? 'read' : 'write';
        console.log(
          `  ${tc.name} [${typeLabel}] (${Math.round(tc.duration)}ms)`,
        );
        console.log('  Result:', tc.result);
      }
      console.groupEnd();
    }

    console.log('Response:', record.finalResponse);
    if (record.error) console.error('Error:', record.error);
    console.groupEnd();
  }

  private logStoredTurn(turn: AgenticTurnRecord): void {
    const tokens = turn.usage
      ? ` · ${turn.usage.promptTokens}+${turn.usage.completionTokens} tokens`
      : '';
    console.group(
      `🔄 Turn ${turn.turnNumber} (LLM: ${Math.round(turn.llmDuration)}ms${tokens})`,
    );
    if (turn.reasoningContent) {
      console.log(`💭 ${turn.reasoningContent}`);
    }
    for (const tc of turn.toolResults) {
      const label = tc.isMetaTool ? 'read' : 'write';
      const status = tc.error ? '✗' : '✓';
      console.log(
        `⚡ ${tc.name} [${label}] (${Math.round(tc.duration)}ms) ${status}`,
      );
      if (tc.error) console.error('  Error:', tc.error);
      console.log('  Result:', tc.result);
    }
    if (turn.llmContent && turn.toolCallsRequested.length === 0) {
      console.log(`💬 "${turn.llmContent}"`);
    }
    console.groupEnd();
  }
}
