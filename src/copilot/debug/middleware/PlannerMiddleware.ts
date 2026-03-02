import type { ExecutionPlan, IPlanner } from '../../reasoning/bridge/types';
import type { ToolSchema } from '../../reasoning/bridge/Planner';
import { ExecutionRecorder } from '../ExecutionRecorder';

/**
 * Middleware that wraps an IPlanner to record planning phase data
 * into an ExecutionRecorder for debugging purposes.
 *
 * Delegates all calls to the inner planner while capturing:
 * - System prompt and tool names on buildSystemPrompt
 * - Raw response, parsed plan, and timing on parsePlan
 * - Parse errors when plan parsing fails
 */
export class PlannerMiddleware implements IPlanner {
  constructor(
    private inner: IPlanner,
    private recorder: ExecutionRecorder
  ) {}

  buildSystemPrompt(tools: ToolSchema[]): string {
    const prompt = this.inner.buildSystemPrompt(tools);
    const toolNames = tools.map(t => t.name);
    this.recorder.recordPlanningStart(prompt, toolNames);
    return prompt;
  }

  parsePlan(response: string): ExecutionPlan {
    try {
      const plan = this.inner.parsePlan(response);
      this.recorder.recordPlanningEnd(response, plan);
      return plan;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.recorder.recordPlanningError(message);
      throw error;
    }
  }
}
