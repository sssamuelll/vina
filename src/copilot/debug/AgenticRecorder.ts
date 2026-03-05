/**
 * AgenticRecorder — aggregates debug data during an agentic loop run.
 *
 * Tracks both flat tool call list (backward compat) and per-turn data
 * for detailed debugging.
 */

import type { AgenticRecord, AgenticToolCallRecord, AgenticTurnRecord } from './types';

export class AgenticRecorder {
  private id = '';
  private startTime = 0;
  private userRequest = '';
  private toolCalls: AgenticToolCallRecord[] = [];
  private turns: AgenticTurnRecord[] = [];
  private currentTurn: Partial<AgenticTurnRecord> | null = null;

  start(userRequest: string): void {
    this.id = crypto.randomUUID();
    this.startTime = Date.now();
    this.userRequest = userRequest;
    this.toolCalls = [];
    this.turns = [];
    this.currentTurn = null;
  }

  startTurn(messageCount: number): void {
    this.currentTurn = {
      turnNumber: this.turns.length + 1,
      messageCount,
      llmDuration: 0,
      llmContent: '',
      toolCallsRequested: [],
      toolResults: [],
    };
  }

  recordLLMResponse(
    content: string,
    reasoningContent: string | undefined,
    toolCalls: Array<{ name: string; arguments: Record<string, unknown> }>,
    usage: { promptTokens: number; completionTokens: number; totalTokens: number } | undefined,
    duration: number,
  ): void {
    if (!this.currentTurn) return;
    this.currentTurn.llmContent = content;
    this.currentTurn.reasoningContent = reasoningContent;
    this.currentTurn.toolCallsRequested = toolCalls;
    this.currentTurn.usage = usage;
    this.currentTurn.llmDuration = duration;
  }

  recordTurnToolResult(
    name: string,
    args: Record<string, unknown>,
    result: unknown,
    duration: number,
    isMetaTool: boolean,
    error?: string,
  ): void {
    if (this.currentTurn) {
      this.currentTurn.toolResults!.push({ name, arguments: args, result, duration, isMetaTool, error });
    }
    this.toolCalls.push({ name, arguments: args, result, duration, isMetaTool });
  }

  recordToolCall(record: AgenticToolCallRecord): void {
    this.toolCalls.push(record);
  }

  endTurn(): void {
    if (this.currentTurn) {
      this.turns.push(this.currentTurn as AgenticTurnRecord);
      this.currentTurn = null;
    }
  }

  finalize(finalResponse: string, success: boolean, error?: string): AgenticRecord {
    return {
      id: this.id,
      timestamp: this.startTime,
      userRequest: this.userRequest,
      toolCalls: [...this.toolCalls],
      turns: [...this.turns],
      finalResponse,
      totalDuration: Date.now() - this.startTime,
      success,
      error,
    };
  }

  reset(): void {
    this.id = '';
    this.startTime = 0;
    this.userRequest = '';
    this.toolCalls = [];
    this.turns = [];
    this.currentTurn = null;
  }
}
