import type { ToolRegistry, ToolFunction } from '../../reasoning/bridge/Executor';
import { ExecutionRecorder } from '../ExecutionRecorder';

let stepCounter = 0;

/**
 * Wraps a ToolRegistry so that every tool call is recorded in an ExecutionRecorder.
 *
 * Each call generates a unique step ID, records the tool name, params,
 * result (or error), and timing into the recorder. The original tool
 * behaviour is fully preserved -- results and exceptions pass through.
 */
export function createInstrumentedTools(
  tools: ToolRegistry,
  recorder: ExecutionRecorder
): ToolRegistry {
  stepCounter = 0;
  const instrumented: ToolRegistry = {};
  for (const [name, tool] of Object.entries(tools)) {
    instrumented[name] = createInstrumentedTool(name, tool, recorder);
  }
  return instrumented;
}

function createInstrumentedTool(
  toolName: string,
  tool: ToolFunction,
  recorder: ExecutionRecorder
): ToolFunction {
  return async (params: Record<string, unknown>) => {
    stepCounter++;
    const stepId = `debug_step_${stepCounter}`;
    recorder.recordStepStart(stepId, toolName, `${toolName} call`);
    recorder.recordStepParams(stepId, params, params, []);
    try {
      const result = await tool(params);
      if (result.success) {
        recorder.recordStepEnd(stepId, true, result.data);
      } else {
        recorder.recordStepError(stepId, result.error ?? 'Unknown error');
      }
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      recorder.recordStepError(stepId, message);
      throw error;
    }
  };
}
