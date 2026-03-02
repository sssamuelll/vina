/**
 * Executor — runs execution plans step-by-step without LLM involvement.
 *
 * The Executor:
 * - Executes steps sequentially from an ExecutionPlan
 * - Resolves variable references in parameters
 * - Calls the evaluator for evaluate steps
 * - Emits progress events
 * - Stops on failure
 *
 * @module bridge/Executor
 */

import type {
  ExecutionPlan,
  Step,
  StepResult,
  BridgeEvent,
  BridgeEventHandler,
  ExecuteStep,
  EvaluateStep,
} from './types';
import { isExecuteStep } from './types';
import { ResultStore } from './ResultStore';
import { ToolRegistry as UnifiedToolRegistry } from '../../action/tools/registry';

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * A tool function that executes with parameters and returns a result.
 * @deprecated Use UnifiedToolRegistry from '../../action/tools/registry' instead
 */
export type ToolFunction = (params: Record<string, unknown>) => Promise<{ success: boolean; data?: unknown; error?: string }>;

/**
 * Registry of available tools by name.
 * @deprecated Use UnifiedToolRegistry from '../../action/tools/registry' instead
 */
export type ToolRegistry = Record<string, ToolFunction>;

/**
 * Evaluator function for evaluate steps (calls LLM).
 */
export type Evaluator = (input: unknown, question: string) => Promise<{ success: boolean; data?: unknown; error?: string }>;

/**
 * Result of executing a full plan.
 */
export interface ExecutionResult {
  /** Whether all steps succeeded */
  success: boolean;
  /** Results from all executed steps */
  results: StepResult[];
  /** ID of the step that failed (if any) */
  failedStep?: string;
  /** Error message if failed */
  error?: string;
}

// ─── Executor Class ─────────────────────────────────────────────────────────

/**
 * Executes plans step-by-step, resolving variable references and emitting events.
 */
export class Executor {
  private tools: ToolRegistry | null = null;
  private unifiedRegistry: UnifiedToolRegistry | null = null;
  private evaluator: Evaluator;
  private resultStore: ResultStore;
  private eventHandlers: BridgeEventHandler[] = [];

  /**
   * Create an Executor.
   * @param tools - Registry of available tools (legacy Record or unified ToolRegistry)
   * @param evaluator - Function to call for evaluate steps
   */
  constructor(tools: ToolRegistry | UnifiedToolRegistry, evaluator: Evaluator) {
    if (tools instanceof UnifiedToolRegistry) {
      this.unifiedRegistry = tools;
    } else {
      this.tools = tools;
    }
    this.evaluator = evaluator;
    this.resultStore = new ResultStore();
  }

  /**
   * Subscribe to execution events.
   */
  on(handler: BridgeEventHandler): void {
    this.eventHandlers.push(handler);
  }

  /**
   * Get the result store for accessing step results.
   */
  getResultStore(): ResultStore {
    return this.resultStore;
  }

  /**
   * Execute a plan step-by-step.
   */
  async execute(plan: ExecutionPlan): Promise<ExecutionResult> {
    // Clear previous results
    this.resultStore.clear();

    const results: StepResult[] = [];

    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i];

      // Emit step:start event
      this.emit({ type: 'step:start', step, index: i });

      try {
        const stepResult = await this.executeStep(step);

        // Store the result
        this.resultStore.add(stepResult);
        results.push(stepResult);

        if (stepResult.success) {
          // Emit step:complete event
          this.emit({ type: 'step:complete', step, result: stepResult });
        } else {
          // Emit step:error event
          this.emit({ type: 'step:error', step, error: stepResult.error ?? 'Unknown error' });

          // Stop execution on failure
          return {
            success: false,
            results,
            failedStep: step.id,
            error: stepResult.error,
          };
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);

        // Create a failed result
        const failedResult: StepResult = {
          stepId: step.id,
          success: false,
          error: errorMessage,
        };
        this.resultStore.add(failedResult);
        results.push(failedResult);

        // Emit step:error event
        this.emit({ type: 'step:error', step, error: errorMessage });

        return {
          success: false,
          results,
          failedStep: step.id,
          error: errorMessage,
        };
      }
    }

    return {
      success: true,
      results,
    };
  }

  /**
   * Execute a single step.
   */
  private async executeStep(step: Step): Promise<StepResult> {
    if (isExecuteStep(step)) {
      return this.executeExecuteStep(step);
    }
    // step must be EvaluateStep at this point
    return this.executeEvaluateStep(step);
  }

  /**
   * Execute an execute step (tool call).
   */
  private async executeExecuteStep(step: ExecuteStep): Promise<StepResult> {
    // Resolve variable references in params
    const resolvedParams = this.resolveParams(step.params);

    // Use unified registry if available
    if (this.unifiedRegistry) {
      const result = await this.unifiedRegistry.execute(step.tool, resolvedParams);
      return {
        stepId: step.id,
        success: result.success,
        data: result.data,
        error: result.error,
      };
    }

    // Fallback to legacy registry
    const tool = this.tools?.[step.tool];

    if (!tool) {
      return {
        stepId: step.id,
        success: false,
        error: `Unknown tool: ${step.tool}`,
      };
    }

    // Call the tool
    const result = await tool(resolvedParams);

    return {
      stepId: step.id,
      success: result.success,
      data: result.data,
      error: result.error,
    };
  }

  /**
   * Execute an evaluate step (LLM call).
   */
  private async executeEvaluateStep(step: EvaluateStep): Promise<StepResult> {
    // Resolve the input reference
    const resolvedInput = this.resultStore.resolve(step.input);

    // Call the evaluator
    const result = await this.evaluator(resolvedInput, step.decide);

    return {
      stepId: step.id,
      success: result.success,
      data: result.data,
      error: result.error,
    };
  }

  /**
   * Resolve variable references in parameters.
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
   * Emit an event to all handlers.
   */
  private emit(event: BridgeEvent): void {
    for (const handler of this.eventHandlers) {
      handler(event);
    }
  }
}
