import type {
  ExecutionPlan,
  ReasonerInput,
  ReasonerDecision,
} from '../reasoning/bridge/types';
import type {
  ExecutionRecord,
  PlanningRecord,
  StepRecord,
  VariableResolution,
  TokenUsage,
  MetaToolCallRecord,
} from './types';

/**
 * Aggregates debug data during a bridge execution run.
 *
 * Middleware hooks (PlannerMiddleware, ExecutorMiddleware, etc.) call
 * the recorder's methods in order to build a complete ExecutionRecord
 * that can later be inspected via DebugStore or ConsoleLogger.
 *
 * Lifecycle:
 *   start() -> recordPlanning* -> recordStep* -> finalize() -> reset()
 */
export class ExecutionRecorder {
  private id = '';
  private startTime = 0;
  private userRequest = '';
  private planning: PlanningRecord = this.emptyPlanning();
  private steps: Map<string, StepRecord> = new Map();
  private stepOrder: string[] = [];
  private planningStartTime = 0;
  private stepStartTimes: Map<string, number> = new Map();

  /** Begin a new recording session for a user request. */
  start(userRequest: string): void {
    this.id = crypto.randomUUID();
    this.startTime = Date.now();
    this.userRequest = userRequest;
  }

  /** Record the beginning of the planning phase. */
  recordPlanningStart(systemPrompt: string, toolNames: string[]): void {
    this.planningStartTime = performance.now();
    this.planning.systemPrompt = systemPrompt;
    this.planning.toolsProvided = toolNames;
  }

  /** Record a successful planning phase completion. */
  recordPlanningEnd(rawResponse: string, parsedPlan: ExecutionPlan): void {
    this.planning.rawResponse = rawResponse;
    this.planning.parsedPlan = parsedPlan;
    this.planning.duration = performance.now() - this.planningStartTime;
  }

  /** Record a planning phase parse error. */
  recordPlanningError(error: string): void {
    this.planning.parseError = error;
    this.planning.parsedPlan = null;
    this.planning.duration = performance.now() - this.planningStartTime;
  }

  /** Record token usage for the planning LLM call. */
  recordPlanningTokens(usage: TokenUsage): void {
    this.planning.tokenUsage = usage;
  }

  /** Record meta-tool calls made during agentic planning. */
  recordPlanningMetaToolCalls(calls: MetaToolCallRecord[]): void {
    this.planning.metaToolCalls = calls;
  }

  /** Record the start of a step execution. */
  recordStepStart(stepId: string, tool: string, label: string): void {
    this.stepStartTimes.set(stepId, performance.now());
    const record: StepRecord = {
      stepId,
      tool,
      label,
      rawParams: {},
      resolvedParams: {},
      variableResolutions: [],
      success: false,
      duration: 0,
      retries: [],
    };
    this.steps.set(stepId, record);
    this.stepOrder.push(stepId);
  }

  /** Record parameter resolution for a step (raw -> resolved with variable mappings). */
  recordStepParams(
    stepId: string,
    rawParams: Record<string, unknown>,
    resolvedParams: Record<string, unknown>,
    variableResolutions: VariableResolution[]
  ): void {
    const step = this.steps.get(stepId);
    if (step) {
      step.rawParams = rawParams;
      step.resolvedParams = resolvedParams;
      step.variableResolutions = variableResolutions;
    }
  }

  /** Record successful step completion. */
  recordStepEnd(stepId: string, success: boolean, result: unknown): void {
    const step = this.steps.get(stepId);
    if (step) {
      step.success = success;
      step.result = result;
      const startTime = this.stepStartTimes.get(stepId) ?? performance.now();
      step.duration = performance.now() - startTime;
    }
  }

  /** Record a step error (before potential retry). */
  recordStepError(stepId: string, error: string): void {
    const step = this.steps.get(stepId);
    if (step) {
      step.success = false;
      step.error = error;
      const startTime = this.stepStartTimes.get(stepId) ?? performance.now();
      step.duration = performance.now() - startTime;
    }
  }

  /** Record a retry attempt including the Reasoner's input, decision, and timing. */
  recordRetry(
    stepId: string,
    attempt: number,
    error: string,
    reasonerInput: ReasonerInput,
    reasonerDecision: ReasonerDecision,
    reasonerDuration: number,
    reasonerTokenUsage?: TokenUsage
  ): void {
    const step = this.steps.get(stepId);
    if (step) {
      step.retries.push({
        attempt,
        error,
        reasonerInput,
        reasonerDecision,
        reasonerDuration,
        reasonerTokenUsage,
      });
    }
  }

  /** Finalize the recording and return the complete ExecutionRecord. */
  finalize(): ExecutionRecord {
    const orderedSteps = this.stepOrder
      .map((id) => this.steps.get(id))
      .filter((s): s is StepRecord => s !== undefined);
    const hasFailedStep = orderedSteps.some((s) => !s.success);
    return {
      id: this.id,
      timestamp: this.startTime,
      userRequest: this.userRequest,
      duration: Date.now() - this.startTime,
      success: !hasFailedStep && !this.planning.parseError,
      planning: { ...this.planning },
      steps: orderedSteps,
    };
  }

  /** Reset all state so the recorder can be reused for the next execution. */
  reset(): void {
    this.id = '';
    this.startTime = 0;
    this.userRequest = '';
    this.planning = this.emptyPlanning();
    this.steps.clear();
    this.stepOrder = [];
    this.planningStartTime = 0;
    this.stepStartTimes.clear();
  }

  private emptyPlanning(): PlanningRecord {
    return {
      systemPrompt: '',
      toolsProvided: [],
      rawResponse: '',
      parsedPlan: null,
      duration: 0,
    };
  }
}
