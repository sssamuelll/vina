import {
  AgenticLoop,
  type AgenticLoopOptions,
  type AgenticEvent,
} from '../reasoning/bridge/AgenticLoop';
import type {
  ChatMessage,
  ProviderToolDef,
  ProviderResponse,
} from '../providers/types';
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

export function createDebugAgenticLoop(
  options: AgenticLoopOptions,
): DebugAgenticLoopResult {
  if (!isDebugEnabled()) {
    return { loop: new AgenticLoop(options), store: null };
  }

  const recorder = new AgenticRecorder();
  const logger = new AgenticConsoleLogger();
  const debugStore = new DebugStore();

  let turnNumber = 0;

  // Wrap send to capture every LLM call/response per turn
  const wrappedSend = async (
    messages: ChatMessage[],
    tools: ProviderToolDef[],
    config?: unknown,
  ): Promise<ProviderResponse> => {
    // End previous turn (if any)
    if (turnNumber > 0) {
      logger.logTurnEnd();
      recorder.endTurn();
    }

    turnNumber++;

    // Log system prompt on first turn only
    if (turnNumber === 1) {
      const systemMsg = messages.find((m) => m.role === 'system');
      if (systemMsg) logger.logSystemPrompt(systemMsg.content);
    }

    recorder.startTurn(messages.length);
    logger.logTurnStart(turnNumber, messages.length);

    const start = performance.now();
    const response = await options.send(messages, tools, config);
    const duration = performance.now() - start;

    // Parse tool call arguments for structured recording
    const parsedToolCalls = response.toolCalls.map((tc) => {
      try {
        return {
          name: tc.name,
          arguments: JSON.parse(tc.arguments) as Record<string, unknown>,
        };
      } catch {
        return { name: tc.name, arguments: {} as Record<string, unknown> };
      }
    });

    recorder.recordLLMResponse(
      response.content,
      response.reasoningContent,
      parsedToolCalls,
      response.usage,
      duration,
    );

    logger.logLLMResponse(response, duration);

    return response;
  };

  // Construct loop with wrapped send
  const loop = new AgenticLoop({ ...options, send: wrappedSend });
  const originalRun = loop.run.bind(loop);

  loop.run = async (
    userRequest: string,
    onEvent: (event: AgenticEvent) => void,
  ): Promise<string> => {
    turnNumber = 0;
    recorder.start(userRequest);
    logger.logStart(userRequest);

    const wrappedOnEvent = (event: AgenticEvent) => {
      if (event.type === 'tool:complete' || event.type === 'tool:error') {
        const allCalls = loop.getLastToolCalls();
        const lastCall = allCalls[allCalls.length - 1];
        if (lastCall) {
          const error =
            event.type === 'tool:error'
              ? (event as Extract<AgenticEvent, { type: 'tool:error' }>).error
              : undefined;
          recorder.recordTurnToolResult(
            lastCall.name,
            lastCall.arguments,
            lastCall.result,
            lastCall.duration,
            lastCall.isMetaTool,
            error,
          );
          logger.logToolResult(
            lastCall.name,
            lastCall.isMetaTool,
            lastCall.result,
            lastCall.duration,
            error,
          );
        }
      }
      onEvent(event);
    };

    try {
      const result = await originalRun(userRequest, wrappedOnEvent);
      if (turnNumber > 0) {
        logger.logTurnEnd();
        recorder.endTurn();
      }
      const record = recorder.finalize(result, true);
      logger.logEnd(record);
      debugStore.save(record);
      recorder.reset();
      return result;
    } catch (err) {
      if (turnNumber > 0) {
        logger.logTurnEnd();
        recorder.endTurn();
      }
      const errorMsg = err instanceof Error ? err.message : String(err);
      const record = recorder.finalize('', false, errorMsg);
      logger.logEnd(record);
      debugStore.save(record);
      recorder.reset();
      throw err;
    }
  };

  if (typeof window !== 'undefined') {
    (window as unknown as Record<string, unknown>).__vina_debug =
      createDebugAPI(debugStore);
  }

  return { loop, store: debugStore };
}
