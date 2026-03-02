import { ExecutionBridge, type BridgeOptions } from '../reasoning/bridge/ExecutionBridge';
import { createInstrumentedTools } from './middleware/ExecutorMiddleware';
import { ExecutionRecorder } from './ExecutionRecorder';
import { ConsoleLogger } from './ConsoleLogger';
import { DebugStore } from './DebugStore';
import { createDebugAPI } from './debugAPI';
import type { ToolRegistry } from '../reasoning/bridge/Executor';

export function isDebugEnabled(): boolean {
  try {
    return localStorage.getItem('openclo-debug-bridge') === 'true';
  } catch {
    return false;
  }
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
