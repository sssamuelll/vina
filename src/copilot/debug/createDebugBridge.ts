import { ExecutionBridge, type BridgeOptions } from '../reasoning/bridge/ExecutionBridge';
import { AgenticLoop, type AgenticLoopOptions, type AgenticEvent } from '../reasoning/bridge/AgenticLoop';
import { createInstrumentedTools } from './middleware/ExecutorMiddleware';
import { ExecutionRecorder } from './ExecutionRecorder';
import { ConsoleLogger } from './ConsoleLogger';
import { AgenticRecorder } from './AgenticRecorder';
import { AgenticConsoleLogger } from './AgenticConsoleLogger';
import { DebugStore } from './DebugStore';
import { createDebugAPI } from './debugAPI';
import type { ToolRegistry } from '../reasoning/bridge/Executor';

export function isDebugEnabled(): boolean {
  // TODO: re-gate behind localStorage once stable
  return true;
}

export interface DebugBridgeResult {
  bridge: ExecutionBridge;
  store: DebugStore | null;
}

export function createDebugBridge(options: BridgeOptions): DebugBridgeResult {
  if (!isDebugEnabled()) {
    return {
      bridge: new ExecutionBridge(options),
      store: null,
    };
  }

  const recorder = new ExecutionRecorder();
  const logger = new ConsoleLogger();
  const store = new DebugStore();

  // Wrap the plannerLLM to start recording
  const originalPlannerLLM = options.plannerLLM;
  const wrappedPlannerLLM = async (userRequest: string) => {
    recorder.start(userRequest);
    const response = await originalPlannerLLM(userRequest);
    return response;
  };

  // Instrument tools to record step execution
  const instrumentedTools = createInstrumentedTools(
    options.tools as ToolRegistry,
    recorder
  );

  // Create bridge with instrumented components
  const bridge = new ExecutionBridge({
    ...options,
    plannerLLM: wrappedPlannerLLM,
    tools: instrumentedTools,
  });

  // Listen for events to finalize and persist records
  bridge.on((event) => {
    if (event.type === 'plan:start') {
      const toolNames = event.plan.steps
        .filter(s => s.type === 'execute')
        .map(s => (s as { tool: string }).tool);
      recorder.recordPlanningStart('', [...new Set(toolNames)]);
      recorder.recordPlanningEnd('', event.plan);

      // Capture meta-tool calls from AgenticPlanner if present
      if (options.agenticPlanner) {
        const metaToolCalls = options.agenticPlanner.getLastMetaToolCalls();
        recorder.recordPlanningMetaToolCalls(metaToolCalls);
      }
    }

    if (event.type === 'execution:complete') {
      const record = recorder.finalize();
      record.success = event.success;
      record.summary = event.summary;
      logger.log(record);
      store.save(record);
      recorder.reset();
    }

    if (event.type === 'plan:error') {
      const record = recorder.finalize();
      record.success = false;
      record.error = event.error;
      logger.log(record);
      store.save(record);
      recorder.reset();
    }
  });

  // Expose debug API in dev mode
  if (typeof window !== 'undefined') {
    (window as unknown as Record<string, unknown>).__openclo_debug = createDebugAPI(store);
  }

  return { bridge, store };
}

// ─── Agentic Loop Debug Factory ──────────────────────────────────────────────

export interface DebugAgenticLoopResult {
  loop: AgenticLoop;
  store: DebugStore | null;
}

export function createDebugAgenticLoop(options: AgenticLoopOptions): DebugAgenticLoopResult {
  if (!isDebugEnabled()) {
    return {
      loop: new AgenticLoop(options),
      store: null,
    };
  }

  const recorder = new AgenticRecorder();
  const logger = new AgenticConsoleLogger();
  const debugStore = new DebugStore();

  // Wrap options.send to record through the loop
  const loop = new AgenticLoop(options);

  // We can't easily wrap the loop's internal send, so instead we
  // wrap the run method to capture events for recording.
  const originalRun = loop.run.bind(loop);
  loop.run = async (userRequest: string, onEvent: (event: AgenticEvent) => void): Promise<string> => {
    recorder.start(userRequest);

    const wrappedOnEvent = (event: AgenticEvent) => {
      if (event.type === 'tool:complete' || event.type === 'tool:error') {
        const toolCalls = loop.getLastToolCalls();
        const lastCall = toolCalls[toolCalls.length - 1];
        if (lastCall) {
          recorder.recordToolCall(lastCall);
        }
      }
      onEvent(event);
    };

    try {
      const result = await originalRun(userRequest, wrappedOnEvent);
      const record = recorder.finalize(result, true);
      logger.log(record);
      debugStore.save(record as never);
      recorder.reset();
      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const record = recorder.finalize('', false, errorMsg);
      logger.log(record);
      debugStore.save(record as never);
      recorder.reset();
      throw err;
    }
  };

  if (typeof window !== 'undefined') {
    (window as unknown as Record<string, unknown>).__openclo_debug = createDebugAPI(debugStore);
  }

  return { loop, store: debugStore };
}
