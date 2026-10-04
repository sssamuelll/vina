/**
 * El paso de una herramienta del agente y su reductor. El turno lo corre
 * `copilot/conversacion.ts` desde P2c (spec 2026-10-02 § 6.2): el hook que
 * vivía aquí se fue, porque la conversación no puede depender de un
 * componente montado.
 *
 * @module useAgenticLoop
 */

import { type AgenticEvent } from '../reasoning/bridge/AgenticLoop';

export interface ToolCallProgress {
  name: string;
  status: 'running' | 'done' | 'cancelled' | 'error';
  result?: unknown;
  error?: string;
  /** The agent's one-line rationale for the round this tool belongs to —
   *  captured from the LLM's narration emitted before the tool batch. Shown
   *  in the decision trail so each action explains its WHY (auditability). */
  reason?: string;
}

function settleLatestRunning(
  prev: ToolCallProgress[],
  name: string,
  settled: Partial<ToolCallProgress> & Pick<ToolCallProgress, 'status'>,
): ToolCallProgress[] {
  let index = -1;
  for (let currentIndex = prev.length - 1; currentIndex >= 0; currentIndex -= 1) {
    const toolCall = prev[currentIndex];
    if (toolCall.name === name && toolCall.status === 'running') {
      index = currentIndex;
      break;
    }
  }
  if (index < 0) return prev;
  return prev.map((toolCall, currentIndex) =>
    currentIndex === index ? { ...toolCall, ...settled } : toolCall
  );
}

/**
 * Process an AgenticEvent and return updated tool calls array.
 * Exported for testing.
 */
export function reduceToolCalls(prev: ToolCallProgress[], event: AgenticEvent): ToolCallProgress[] {
  switch (event.type) {
    case 'tool:start':
      return [...prev, { name: event.name, status: 'running' }];
    case 'tool:complete':
      return settleLatestRunning(prev, event.name, {
        status: 'done',
        result: event.result,
      });
    case 'tool:cancelled':
      return settleLatestRunning(prev, event.name, { status: 'cancelled' });
    case 'tool:error':
      return settleLatestRunning(prev, event.name, {
        status: 'error',
        error: event.error,
      });
    default:
      return prev;
  }
}
