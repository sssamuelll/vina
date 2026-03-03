import { AgenticLoop, type AgenticLoopOptions, type AgenticEvent } from '../reasoning/bridge/AgenticLoop';
import { AgenticRecorder } from './AgenticRecorder';
import { AgenticConsoleLogger } from './AgenticConsoleLogger';
import { DebugStore } from './DebugStore';
import { createDebugAPI } from './debugAPI';

export function isDebugEnabled(): boolean {
  // TODO: re-gate behind localStorage once stable
  return true;
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
      debugStore.save(record);
      recorder.reset();
      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const record = recorder.finalize('', false, errorMsg);
      logger.log(record);
      debugStore.save(record);
      recorder.reset();
      throw err;
    }
  };

  if (typeof window !== 'undefined') {
    (window as unknown as Record<string, unknown>).__openclo_debug = createDebugAPI(debugStore);
  }

  return { loop, store: debugStore };
}
