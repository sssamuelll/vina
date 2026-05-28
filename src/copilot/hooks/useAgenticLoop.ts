/**
 * useAgenticLoop — React hook for AgenticLoop integration.
 *
 * Replaces useBridge with a simpler hook that tracks tool calls
 * and the final response from the agentic loop.
 *
 * @module useAgenticLoop
 */

import { useState, useCallback, useMemo } from 'react';
import { useDispatch } from 'react-redux';
import { type AgenticLoopOptions, type AgenticEvent } from '../reasoning/bridge/AgenticLoop';
import { createDebugAgenticLoop } from '../debug/createDebugBridge';
import { showErrorToast } from '../../store/copilotUISlice';

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
  /** Clear the conversation history (project switch / fresh session). */
  clearHistory: () => void;
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
  const dispatch = useDispatch();
  const [toolCalls, setToolCalls] = useState<ToolCallProgress[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [response, setResponse] = useState<string | null>(null);

  // Keep the loop instance stable so its internal conversation history
  // persists across run() calls — required for the convention-only
  // confirmation gate (M2 dressing intent: propose + STOP on one turn,
  // resume on the next). The loop is recreated when `send` changes (i.e.
  // when the user switches provider), which also clears history naturally.
  // Mid-conversation provider switch is out of scope per the M2 spec.
  const loop = useMemo(
    () => createDebugAgenticLoop(options).loop,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: rebuild
    // only on send/registry change so history survives between turns
    [options.send, options.registry],
  );

  const run = useCallback(async (request: string): Promise<string> => {
    setIsRunning(true);
    setToolCalls([]);
    setResponse(null);

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
        case 'error':
          dispatch(showErrorToast(event.error));
          setIsRunning(false);
          break;
      }
    };

    try {
      const result = await loop.run(request, handleEvent);
      return result;
    } finally {
      setIsRunning(false);
    }
  }, [loop, dispatch]);

  const clearHistory = useCallback(() => {
    loop.clearHistory();
    setToolCalls([]);
    setResponse(null);
  }, [loop]);

  return { toolCalls, isRunning, response, run, clearHistory };
}
