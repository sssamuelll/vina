/**
 * useBridge — React hook for ExecutionBridge integration.
 *
 * Provides progress state and run method for copilot execution.
 *
 * @module useBridge
 */

import { useState, useCallback, useRef } from 'react';
import { useDispatch, useStore } from 'react-redux';
import type { AppDispatch, RootState } from '../../store';
import {
  ExecutionBridge,
  type BridgeResult,
  type ProgressState,
  type BridgeEvent,
  type ReasonerLLM,
  DEFAULT_BRIDGE_CONFIG,
} from '../reasoning/bridge';
import type { AgenticPlanner } from '../reasoning/bridge/AgenticPlanner';
import { getDefaultRegistry } from '../action/tools/registry';
import { createDebugBridge } from '../debug';

export interface UseBridgeOptions {
  /** LLM function for planning */
  plannerLLM: (prompt: string) => Promise<string>;
  /** LLM function for evaluation steps */
  evaluator: (input: unknown, question: string) => Promise<{ success: boolean; data?: unknown; error?: string }>;
  /** LLM function for reasoner */
  reasonerLLM: ReasonerLLM;
  /** Optional agentic planner (replaces plannerLLM) */
  agenticPlanner?: AgenticPlanner;
}

export interface UseBridgeReturn {
  /** Current progress state */
  progress: ProgressState | null;
  /** Whether a request is currently running */
  isRunning: boolean;
  /** Run a user request through the bridge */
  run: (request: string) => Promise<BridgeResult>;
  /** Answer a question from the reasoner */
  answer: (response: string) => void;
  /** Request undo/rollback */
  undo: () => void;
  /** Last result */
  lastResult: BridgeResult | null;
}

/**
 * React hook for managing ExecutionBridge state.
 */
export function useBridge(options: UseBridgeOptions): UseBridgeReturn {
  const dispatch = useDispatch<AppDispatch>();
  const store = useStore<RootState>();

  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [lastResult, setLastResult] = useState<BridgeResult | null>(null);

  const bridgeRef = useRef<ExecutionBridge | null>(null);
  const answerCallbackRef = useRef<((answer: string) => void) | null>(null);

  // Initialize bridge lazily
  const getBridge = useCallback(() => {
    if (!bridgeRef.current) {
      const registry = getDefaultRegistry();

      // Convert registry tools to bridge-compatible format
      const tools: Record<string, (params: Record<string, unknown>) => Promise<{ success: boolean; data?: unknown; error?: string; rollback?: () => void }>> = {};
      for (const tool of registry.list()) {
        tools[tool.name] = async (params) => {
          return tool.execute(params, dispatch, () => store.getState());
        };
      }

      const { bridge } = createDebugBridge({
        plannerLLM: async (userRequest) => {
          // The planner LLM receives the user request directly
          return options.plannerLLM(userRequest);
        },
        evaluator: options.evaluator,
        reasonerLLM: options.reasonerLLM,
        tools,
        config: DEFAULT_BRIDGE_CONFIG,
        agenticPlanner: options.agenticPlanner,
      });
      bridgeRef.current = bridge;
    }
    return bridgeRef.current;
  }, [dispatch, store, options]);

  // Handle bridge events
  const handleEvent = useCallback((event: BridgeEvent) => {
    switch (event.type) {
      case 'plan:start':
        setProgress({
          status: 'planning',
          intent: 'Planning...',
          steps: [],
          currentStepIndex: -1,
        });
        break;

      case 'plan:complete':
        setProgress(prev => prev ? {
          ...prev,
          status: 'done',
        } : null);
        break;

      case 'step:start':
        setProgress(prev => {
          if (!prev) return null;
          const newSteps = prev.steps.map(s =>
            s.id === event.step.id ? { ...s, status: 'running' as const } : s
          );
          return { ...prev, steps: newSteps };
        });
        break;

      case 'step:complete':
        setProgress(prev => {
          if (!prev) return null;
          const newSteps = prev.steps.map(s =>
            s.id === event.step.id ? { ...s, status: 'done' as const } : s
          );
          return {
            ...prev,
            steps: newSteps,
            currentStepIndex: prev.currentStepIndex + 1,
          };
        });
        break;

      case 'step:error':
        setProgress(prev => {
          if (!prev) return null;
          const newSteps = prev.steps.map(s =>
            s.id === event.step.id ? { ...s, status: 'failed' as const } : s
          );
          return { ...prev, steps: newSteps };
        });
        break;

      case 'ask:user':
        setProgress(prev => prev ? {
          ...prev,
          status: 'asking',
          question: event.question,
          options: event.options,
        } : null);
        break;

      case 'execution:complete':
        setProgress(prev => prev ? {
          ...prev,
          status: event.success ? 'done' : 'failed',
          summary: event.summary,
        } : null);
        break;
    }
  }, []);

  // Run a request
  const run = useCallback(async (request: string): Promise<BridgeResult> => {
    setIsRunning(true);
    setProgress(null);

    const bridge = getBridge();
    bridge.on(handleEvent);

    try {
      const result = await bridge.run(request);
      setLastResult(result);

      if (!result.success) {
        setProgress(prev => prev ? {
          ...prev,
          status: 'failed',
          error: result.error,
        } : null);
      }

      return result;
    } finally {
      setIsRunning(false);
    }
  }, [getBridge, handleEvent]);

  // Answer a question
  const answer = useCallback((response: string) => {
    answerCallbackRef.current?.(response);
  }, []);

  // Undo/rollback
  const undo = useCallback(() => {
    // Rollback is handled by the bridge when it returns canRollback: true
    // The UI should check lastResult.canRollback before showing undo button
    console.log('Undo requested - rollback should have been performed during abort');
  }, []);

  return {
    progress,
    isRunning,
    run,
    answer,
    undo,
    lastResult,
  };
}
