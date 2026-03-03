// ─── Agentic Loop Records ────────────────────────────────────────────────────

export interface AgenticToolCallRecord {
  name: string;
  arguments: Record<string, unknown>;
  result: unknown;
  duration: number;
  isMetaTool: boolean;
}

export interface AgenticRecord {
  id: string;
  timestamp: number;
  userRequest: string;
  toolCalls: AgenticToolCallRecord[];
  finalResponse: string;
  totalDuration: number;
  success: boolean;
  error?: string;
}
