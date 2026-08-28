export interface ToolExecutionRecord {
  toolName: string;
  args: Record<string, unknown>;
  success: boolean | null;
  error: string | null;
  timestamp: number;
  durationMs: number;
}

const MAX_TOOL_EXECUTIONS = 200;
const records: ToolExecutionRecord[] = [];

export function pushToolExecution(record: ToolExecutionRecord): void {
  const safeArgs = { ...record.args };
  // presentToUser recibe el mensaje completo del LLM; otros tools pueden usar
  // `message` como argumento operativo legítimo y deben conservarlo.
  if (record.toolName === 'presentToUser') delete safeArgs.message;
  records.push({ ...record, args: safeArgs });
  if (records.length > MAX_TOOL_EXECUTIONS) records.shift();
}

export function getToolExecutions(): readonly ToolExecutionRecord[] {
  return records;
}

export function clearToolExecutions(): void {
  records.length = 0;
}
