/**
 * AgenticRecorder — aggregates debug data during an agentic loop run.
 *
 * Replaces ExecutionRecorder for the new AgenticLoop architecture.
 * Simpler lifecycle: start() -> recordToolCall() -> finalize()
 */

import type { AgenticRecord, AgenticToolCallRecord } from './types';

export class AgenticRecorder {
  private id = '';
  private startTime = 0;
  private userRequest = '';
  private toolCalls: AgenticToolCallRecord[] = [];

  start(userRequest: string): void {
    this.id = crypto.randomUUID();
    this.startTime = Date.now();
    this.userRequest = userRequest;
    this.toolCalls = [];
  }

  recordToolCall(record: AgenticToolCallRecord): void {
    this.toolCalls.push(record);
  }

  finalize(finalResponse: string, success: boolean, error?: string): AgenticRecord {
    return {
      id: this.id,
      timestamp: this.startTime,
      userRequest: this.userRequest,
      toolCalls: [...this.toolCalls],
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
  }
}
