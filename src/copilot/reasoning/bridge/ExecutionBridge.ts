/**
 * ExecutionBridge — main orchestrator for the copilot execution pipeline.
 *
 * Ties together:
 * - Planner: Generates execution plans from user requests
 * - Executor: Runs steps from the plan
 * - Reasoner: Handles errors with retry, ask user, or abort
 * - SummaryGenerator: Creates summaries of execution results
 *
 * @module bridge/ExecutionBridge
 */

import type {
  ExecutionPlan,
  Step,
  StepResult,
  BridgeEvent,
  BridgeEventHandler,
  BridgeConfig,
  ReasonerInput,
  ReasonerDecision,
  ExpandableSummary,
  ExecuteStep,
  EvaluateStep,
  ToolRegistry,
  Evaluator,
  ReasonerLLM,
} from './types';
import { DEFAULT_BRIDGE_CONFIG, isExecuteStep } from './types';
import { Planner } from './Planner';
import type { AgenticPlanner } from './AgenticPlanner';

// ─── Inlined Classes (formerly separate files, deleted in Task 6) ───────────

const VALID_ACTIONS = ['retry', 'alternative', 'askUser', 'abort'] as const;

/** Reasoner — inlined from deleted Reasoner.ts */
class Reasoner {
  private llm: ReasonerLLM;
  constructor(llm: ReasonerLLM) { this.llm = llm; }

  async analyze(input: ReasonerInput): Promise<ReasonerDecision> {
    const prompt = this.buildPrompt(input);
    try {
      const response = await this.llm(prompt);
      return this.validateResponse(response);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { action: 'abort', reason: `Reasoner error: ${msg}` };
    }
  }

  private buildPrompt(input: ReasonerInput): string {
    const { failedStep, error, resultsSoFar, originalIntent } = input;
    const stepLines = [`Type: ${failedStep.type}`, `ID: ${failedStep.id}`, `Label: ${failedStep.label}`];
    if (isExecuteStep(failedStep)) {
      stepLines.push(`Tool: ${failedStep.tool}`, `Params: ${JSON.stringify(failedStep.params, null, 2)}`);
    } else {
      stepLines.push(`Input: ${failedStep.input}`, `Decide: ${failedStep.decide}`);
    }
    const resultsCtx = resultsSoFar.length === 0 ? 'No previous results.' :
      resultsSoFar.map(r => {
        const status = r.success ? 'SUCCESS' : 'FAILED';
        return `- Step ${r.stepId}: ${status}, Data: ${r.data ? JSON.stringify(r.data) : 'none'}${r.error ? `, Error: ${r.error}` : ''}`;
      }).join('\n');
    return `You are an error recovery assistant for a pattern modification system.\n\nA step in the execution plan has failed. Analyze the error and decide how to proceed.\n\n## Original Intent\n${originalIntent}\n\n## Failed Step\n${stepLines.join('\n')}\n\n## Error\n${error}\n\n## Previous Results\n${resultsCtx}\n\n## Available Actions\n1. **retry** - Retry the step with modified parameters (provide newParams)\n2. **alternative** - Use a different step instead (provide newStep)\n3. **askUser** - Ask the user for clarification (provide question and options)\n4. **abort** - Cannot recover, abort the execution (provide reason)`;
  }

  private validateResponse(response: unknown): ReasonerDecision {
    if (typeof response !== 'object' || response === null) {
      return { action: 'abort', reason: 'Invalid reasoner response: not an object' };
    }
    const obj = response as Record<string, unknown>;
    if (typeof obj.action !== 'string' || !VALID_ACTIONS.includes(obj.action as typeof VALID_ACTIONS[number])) {
      return { action: 'abort', reason: `Invalid reasoner response: action must be one of ${VALID_ACTIONS.join(', ')}` };
    }
    return {
      action: obj.action as ReasonerDecision['action'],
      newParams: obj.newParams as Record<string, unknown> | undefined,
      newStep: obj.newStep as Step | undefined,
      question: obj.question as string | undefined,
      options: obj.options as string[] | undefined,
      reason: obj.reason as string | undefined,
    };
  }
}

/** ResultStore — inlined from deleted ResultStore.ts */
class ResultStore {
  private results: Map<string, StepResult> = new Map();
  private orderedResults: StepResult[] = [];

  add(result: StepResult): void {
    this.results.set(result.stepId, result);
    this.orderedResults.push(result);
  }

  resolve(ref: string): unknown {
    if (!ref.startsWith('$')) return ref;
    const parts = ref.slice(1).split('.');
    const result = this.results.get(parts[0]);
    if (!result || parts[1] !== 'result') return undefined;
    if (parts.length === 2) return result.data;
    let current: unknown = result.data;
    for (let i = 2; i < parts.length; i++) {
      if (current === null || current === undefined || typeof current !== 'object') return undefined;
      current = (current as Record<string, unknown>)[parts[i]];
    }
    return current;
  }

  clear(): void {
    this.results.clear();
    this.orderedResults = [];
  }
}

/** SummaryGenerator — inlined from deleted SummaryGenerator.ts */
class SummaryGenerator {
  generate(intent: string, results: StepResult[], durationMs?: number): ExpandableSummary {
    const successCount = results.filter(r => r.success).length;
    const totalCount = results.length;
    const short = totalCount === 0 ? `Completed ${intent}` :
      successCount === totalCount ? `Completed ${intent} (${totalCount} steps)` :
      `Completed ${intent} (${successCount}/${totalCount} steps)`;
    const details: string[] = [];
    if (results.length > 0) {
      let statsLine = `${successCount} of ${results.length} steps completed`;
      if (durationMs !== undefined) statsLine += ` in ${(durationMs / 1000).toFixed(1)}s`;
      details.push(statsLine);
    }
    return { short, details };
  }
}

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * LLM function for the Planner.
 * Takes a user request string and returns an execution plan as JSON string.
 */
export type PlannerLLM = (userRequest: string) => Promise<string>;

/**
 * Options for creating an ExecutionBridge.
 */
export interface BridgeOptions {
  /** LLM function for planning */
  plannerLLM: PlannerLLM;
  /** Evaluator function for evaluate steps */
  evaluator: Evaluator;
  /** LLM function for reasoning about errors */
  reasonerLLM: ReasonerLLM;
  /** Registry of available tools */
  tools: ToolRegistry;
  /** Optional configuration */
  config?: BridgeConfig;
  /** Optional agentic planner (replaces plannerLLM when provided) */
  agenticPlanner?: AgenticPlanner;
}

/**
 * Result returned from running the bridge.
 */
export interface BridgeResult {
  /** Whether the execution was successful */
  success: boolean;
  /** Results from all executed steps */
  results: StepResult[];
  /** Summary of the execution */
  summary?: ExpandableSummary;
  /** Error message if failed */
  error?: string;
  /** Whether rollback is available for this execution */
  canRollback?: boolean;
}

// ─── ExecutionBridge Class ──────────────────────────────────────────────────

/**
 * Main orchestrator that ties together Planner, Executor, Reasoner, and SummaryGenerator.
 *
 * Provides the public API for the copilot system with event emission throughout.
 */
export class ExecutionBridge {
  private plannerLLM: PlannerLLM;
  private evaluator: Evaluator;
  private reasoner: Reasoner;
  private tools: ToolRegistry;
  private config: BridgeConfig;
  private eventHandlers: BridgeEventHandler[] = [];
  private planner: Planner;
  private resultStore = new ResultStore();
  private summaryGenerator: SummaryGenerator;
  private agenticPlanner: AgenticPlanner | null;

  /**
   * Create an ExecutionBridge.
   *
   * @param options - Bridge configuration options
   */
  constructor(options: BridgeOptions) {
    this.plannerLLM = options.plannerLLM;
    this.evaluator = options.evaluator;
    this.reasoner = new Reasoner(options.reasonerLLM);
    this.tools = options.tools;
    this.config = options.config ?? DEFAULT_BRIDGE_CONFIG;
    this.planner = new Planner();
    this.summaryGenerator = new SummaryGenerator();
    this.agenticPlanner = options.agenticPlanner ?? null;
  }

  /**
   * Subscribe to bridge events.
   *
   * @param handler - Event handler function
   */
  on(handler: BridgeEventHandler): void {
    this.eventHandlers.push(handler);
  }

  /**
   * Run the execution bridge with a user request.
   *
   * @param userRequest - The user's natural language request
   * @returns Result of the execution including summary
   */
  async run(userRequest: string): Promise<BridgeResult> {
    const startTime = Date.now();

    try {
      // Step 1: Generate execution plan
      const plan = await this.generatePlan(userRequest);

      // Emit plan:start
      this.emit({ type: 'plan:start', plan });

      // Step 2: Execute plan with error handling
      const { results, success, error } = await this.executePlan(plan, userRequest);

      // Emit plan:complete
      this.emit({ type: 'plan:complete', results });

      // Step 3: Generate summary
      const durationMs = Date.now() - startTime;
      const summary = this.summaryGenerator.generate(plan.intent, results, durationMs);

      // Emit execution:complete
      this.emit({ type: 'execution:complete', success, summary });

      // Determine if rollback is available
      const hasRollbackFunctions = results.some((r) => r.rollback !== undefined);
      const canRollback = this.config.enableRollback && hasRollbackFunctions;

      return {
        success,
        results,
        summary,
        error,
        canRollback,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);

      // Emit plan:error
      this.emit({ type: 'plan:error', error: errorMessage });

      return {
        success: false,
        results: [],
        error: errorMessage,
        canRollback: false,
      };
    }
  }

  /**
   * Generate an execution plan from a user request.
   */
  private async generatePlan(userRequest: string): Promise<ExecutionPlan> {
    if (this.agenticPlanner) {
      return this.agenticPlanner.plan(userRequest);
    }
    // Legacy path
    const llmResponse = await this.plannerLLM(userRequest);
    return this.planner.parsePlan(llmResponse);
  }

  /**
   * Execute a plan with error handling and reasoning.
   */
  private async executePlan(
    plan: ExecutionPlan,
    originalIntent: string
  ): Promise<{ results: StepResult[]; success: boolean; error?: string }> {
    this.resultStore.clear();
    const results: StepResult[] = [];
    const rollbacks: Array<() => void> = [];

    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i];

      // Emit step:start
      this.emit({ type: 'step:start', step, index: i });

      // Execute with retry loop
      const stepResult = await this.executeStepWithRetry(
        step,
        results,
        originalIntent
      );

      results.push(stepResult);
      this.resultStore.add(stepResult);

      if (!stepResult.success) {
        // Check if we should rollback
        if (this.config.enableRollback) {
          await this.performRollback(rollbacks);
        }

        return {
          results,
          success: false,
          error: stepResult.error,
        };
      }

      // Track rollback function if provided
      if (stepResult.rollback) {
        rollbacks.push(stepResult.rollback);
      }

      // Emit step:complete
      this.emit({ type: 'step:complete', step, result: stepResult });
    }

    return {
      results,
      success: true,
    };
  }

  /**
   * Execute a single step with retry logic based on reasoner decisions.
   */
  private async executeStepWithRetry(
    step: Step,
    resultsSoFar: StepResult[],
    originalIntent: string
  ): Promise<StepResult> {
    let currentStep = step;
    let retryCount = 0;

    while (retryCount <= this.config.maxRetries) {
      const result = await this.executeStep(currentStep);

      if (result.success) {
        return result;
      }

      // Step failed - consult reasoner
      const reasonerInput: ReasonerInput = {
        failedStep: currentStep,
        error: result.error ?? 'Unknown error',
        resultsSoFar,
        originalIntent,
      };

      // Emit reasoner:invoke
      this.emit({ type: 'reasoner:invoke', input: reasonerInput });

      const decision = await this.reasoner.analyze(reasonerInput);

      // Emit reasoner:decision
      this.emit({ type: 'reasoner:decision', decision });

      // Handle decision
      switch (decision.action) {
        case 'retry':
          retryCount++;
          if (retryCount > this.config.maxRetries) {
            return {
              stepId: step.id,
              success: false,
              error: `Max retries (${this.config.maxRetries}) exceeded: ${result.error}`,
            };
          }
          // Update step params if provided
          if (decision.newParams && isExecuteStep(currentStep)) {
            currentStep = {
              ...currentStep,
              params: { ...currentStep.params, ...decision.newParams },
            };
          }
          break;

        case 'alternative':
          if (decision.newStep) {
            currentStep = decision.newStep;
            retryCount++; // Count alternative as a retry attempt
          } else {
            return result; // No alternative provided, fail
          }
          break;

        case 'askUser':
          // Emit ask:user event and fail (UI will handle response)
          this.emit({
            type: 'ask:user',
            question: decision.question ?? 'Please provide more information',
            options: decision.options,
          });
          return {
            stepId: step.id,
            success: false,
            error: 'User input required',
          };

        case 'abort':
        default:
          return result;
      }
    }

    return {
      stepId: step.id,
      success: false,
      error: 'Execution loop exceeded',
    };
  }

  /**
   * Execute a single step.
   */
  private async executeStep(step: Step): Promise<StepResult> {
    if (isExecuteStep(step)) {
      return this.executeExecuteStep(step);
    }

    // Type guard narrows step to EvaluateStep
    return this.executeEvaluateStep(step);
  }

  /**
   * Execute an execute step (tool call).
   */
  private async executeExecuteStep(step: ExecuteStep): Promise<StepResult> {
    const tool = this.tools[step.tool];

    if (!tool) {
      return {
        stepId: step.id,
        success: false,
        error: `Unknown tool: ${step.tool}`,
      };
    }

    try {
      const resolvedParams = this.resolveParams(step.params);
      const result = await tool(resolvedParams);
      return {
        stepId: step.id,
        success: result.success,
        data: result.data,
        error: result.error,
        rollback: (result as { rollback?: () => void }).rollback,
      };
    } catch (err) {
      return {
        stepId: step.id,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Execute an evaluate step (LLM call).
   */
  private async executeEvaluateStep(step: EvaluateStep): Promise<StepResult> {
    // For evaluate steps, we use the evaluator
    // Note: In a full implementation, we'd resolve input references
    try {
      const result = await this.evaluator(null, step.decide);
      return {
        stepId: step.id,
        success: result.success,
        data: result.data,
        error: result.error,
      };
    } catch (err) {
      return {
        stepId: step.id,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Resolve variable references in step params.
   * Replaces string values starting with '$' using the ResultStore.
   */
  private resolveParams(params: Record<string, unknown>): Record<string, unknown> {
    const resolved: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'string' && value.startsWith('$')) {
        resolved[key] = this.resultStore.resolve(value);
      } else {
        resolved[key] = value;
      }
    }
    return resolved;
  }

  /**
   * Perform rollback of all completed steps in reverse order.
   */
  private async performRollback(rollbacks: Array<() => void>): Promise<void> {
    // Execute rollbacks in reverse order
    for (let i = rollbacks.length - 1; i >= 0; i--) {
      try {
        rollbacks[i]();
      } catch {
        // Ignore rollback errors - best effort
      }
    }
  }

  /**
   * Emit an event to all handlers.
   */
  private emit(event: BridgeEvent): void {
    for (const handler of this.eventHandlers) {
      handler(event);
    }
  }
}
