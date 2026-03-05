// ─── Agentic Loop Records ────────────────────────────────────────────────────

export interface AgenticToolCallRecord {
  name: string;
  arguments: Record<string, unknown>;
  result: unknown;
  duration: number;
  isMetaTool: boolean;
}

export interface AgenticTurnRecord {
  turnNumber: number;
  messageCount: number;
  llmDuration: number;
  llmContent: string;
  reasoningContent?: string;
  toolCallsRequested: Array<{ name: string; arguments: Record<string, unknown> }>;
  toolResults: Array<{
    name: string;
    arguments: Record<string, unknown>;
    result: unknown;
    duration: number;
    isMetaTool: boolean;
    error?: string;
  }>;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}

export interface AgenticRecord {
  id: string;
  timestamp: number;
  userRequest: string;
  toolCalls: AgenticToolCallRecord[];
  turns: AgenticTurnRecord[];
  finalResponse: string;
  totalDuration: number;
  success: boolean;
  error?: string;
}
