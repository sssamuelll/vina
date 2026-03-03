/**
 * useAgenticLoop — React hook for AgenticLoop integration.
 *
 * Replaces useBridge with a simpler hook that tracks tool calls
 * and the final response from the agentic loop.
 *
 * @module useAgenticLoop
 */

import { useState, useCallback } from 'react';
import { AgenticLoop, type AgenticLoopOptions, type AgenticEvent } from '../reasoning/bridge/AgenticLoop';

export interface ToolCallProgress {
  name: string;
  status: 'running' | 'done' | 'error';
  result?: unknown;
  error?: string;
}

export interface UseAgenticLoopReturn {
  /** Tool calls in progress or completed */
  toolCalls: ToolCallProgress[];
  /** Whether the loop is currently running */
  isRunning: boolean;
  /** Final text response from the LLM */
  response: string | null;
  /** Run a user request through the agentic loop */
  run: (request: string) => Promise<string>;
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
      return prev.map((tc, idx) =>
        tc.name === event.name && tc.status === 'running' && !prev.slice(idx + 1).some(t => t.name === event.name && t.status === 'running')
          ? { ...tc, status: 'done' as const, result: event.result }
          : tc
      );
    case 'tool:error':
      return prev.map((tc, idx) =>
        tc.name === event.name && tc.status === 'running' && !prev.slice(idx + 1).some(t => t.name === event.name && t.status === 'running')
          ? { ...tc, status: 'error' as const, error: event.error }
          : tc
      );
    default:
      return prev;
  }
}

export function useAgenticLoop(options: AgenticLoopOptions): UseAgenticLoopReturn {
  const [toolCalls, setToolCalls] = useState<ToolCallProgress[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [response, setResponse] = useState<string | null>(null);

  const run = useCallback(async (request: string): Promise<string> => {
    setIsRunning(true);
    setToolCalls([]);
    setResponse(null);

    const loop = new AgenticLoop(options);

    const handleEvent = (event: AgenticEvent) => {
      switch (event.type) {
        case 'tool:start':
        case 'tool:complete':
        case 'tool:error':
          setToolCalls((prev) => reduceToolCalls(prev, event));
          break;
        case 'complete':
          setResponse(event.content);
          break;
      }
    };

    try {
      const result = await loop.run(request, handleEvent);
      return result;
    } finally {
      setIsRunning(false);
    }
  }, [options]);

  return { toolCalls, isRunning, response, run };
}
